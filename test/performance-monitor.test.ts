import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { performanceMonitor } from '../src/services/shared/performanceMonitor.ts';
import { startRendererPerformanceMonitoring } from '../src/services/shared/rendererPerformanceMonitor.ts';
import { systemHealth } from '../src/services/shared/systemHealthService.ts';

test('renderer long-task monitoring runs in production and reports only long tasks', () => {
  const previousObserver = Object.getOwnPropertyDescriptor(globalThis, 'PerformanceObserver');
  const previousWarn = console.warn;
  let observerCallback: PerformanceObserverCallback | null = null;
  let observed = false;
  let disconnected = false;
  const warnings: unknown[][] = [];

  class TestPerformanceObserver {
    static supportedEntryTypes = ['longtask'];

    constructor(callback: PerformanceObserverCallback) {
      observerCallback = callback;
    }

    observe() {
      observed = true;
    }

    disconnect() {
      disconnected = true;
    }

    takeRecords(): PerformanceEntry[] {
      return [];
    }
  }

  Object.defineProperty(globalThis, 'PerformanceObserver', {
    configurable: true,
    value: TestPerformanceObserver,
  });
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    const stop = startRendererPerformanceMonitoring();
    assert.equal(observed, true);
    assert.ok(observerCallback);
    observerCallback!(
      {
        getEntries: () => [
          { duration: 350, startTime: 42 } as PerformanceEntry,
          { duration: 100, startTime: 50 } as PerformanceEntry,
        ],
      } as PerformanceObserverEntryList,
      {} as PerformanceObserver,
    );
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /Renderer long task/);
    stop();
    assert.equal(disconnected, true);
  } finally {
    console.warn = previousWarn;
    if (previousObserver) {
      Object.defineProperty(globalThis, 'PerformanceObserver', previousObserver);
    } else {
      delete (globalThis as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
    }
  }
});

test('performance monitoring reports measured database and query metrics', async () => {
  const database = DatabaseManager.getInstance();
  await database.initialize();

  const healthScore = await systemHealth.calculateHealthScore();
  assert.equal(healthScore.dataIntegrity, null);
  assert.equal(healthScore.performance, null);

  const healthReport = await systemHealth.generateReport();
  assert.equal(healthReport.metrics.networkAvailability, null);
  assert.equal(healthReport.metrics.databaseHealth, 'unknown');
  assert.equal(healthReport.metrics.cpuUsage, null);

  const queryCountBefore = database.getQueryStats().totalQueries;
  const failedQueryCountBefore = database.getQueryStats().failedQueries;
  database.query('SELECT 1 AS probe');
  assert.equal(database.getQueryStats().totalQueries, queryCountBefore + 1);
  const runQueryCountBefore = database.getQueryStats().totalQueries;
  database.run('SELECT 1 AS run_probe');
  assert.equal(database.getQueryStats().totalQueries, runQueryCountBefore + 1);
  assert.throws(() => database.query('SELECT * FROM missing_performance_test_table'));
  assert.equal(database.getQueryStats().failedQueries, failedQueryCountBefore + 1);

  await performanceMonitor.startMonitoring();
  try {
    const [metrics] = performanceMonitor.getMetrics(1);
    assert.ok(metrics);
    assert.ok(metrics.dbAccessTime >= 0);
    assert.ok(metrics.dbSizeMB > 0);
    assert.ok(metrics.cacheSizeMB >= 0);
    assert.equal(metrics.memoryUsageMB, null);
    assert.equal(metrics.cpuUsage, null);
    assert.equal(metrics.queriesPerSecond, null);
    assert.equal(metrics.errorRate, null);
    assert.equal(metrics.slowQueryCount, database.getQueryStats().slowQueryCount);
    assert.ok(performanceMonitor.getStats().totalQueries > queryCountBefore);
    assert.notEqual(performanceMonitor.getStats().avgDbAccessTime, null);
  } finally {
    performanceMonitor.stopMonitoring();
  }
});

test('performance monitoring reports Electron process CPU and memory from the bridge', async () => {
  await DatabaseManager.getInstance().initialize();
  const previousBridge = window.ceramisys;
  window.ceramisys = {
    ...(previousBridge ?? {}),
    app: {
      info: async () => ({
        version: 'test',
        packaged: false,
        dataDir: '',
        backupDir: '',
        system: {
          platform: 'win32',
          arch: 'x64',
          osRelease: '',
          cpuCount: 1,
          totalMemoryBytes: 0,
          freeMemoryBytes: 0,
          processUptimeSeconds: 0,
          processMemoryBytes: 0,
          processHeapUsedBytes: 0,
          electronProcessMemoryBytes: 256 * 1024 * 1024,
          electronProcessCpuPercent: 12.5,
          disk: { available: false, error: 'test' }
        }
      })
    }
  };

  performanceMonitor.clearMetrics();
  try {
    await performanceMonitor.startMonitoring();
    const [metrics] = performanceMonitor.getMetrics(1);
    assert.ok(metrics);
    assert.equal(metrics.memoryUsageMB, 256);
    assert.equal(metrics.cpuUsage, 12.5);
  } finally {
    performanceMonitor.stopMonitoring();
    if (previousBridge) window.ceramisys = previousBridge;
    else delete window.ceramisys;
  }
});
