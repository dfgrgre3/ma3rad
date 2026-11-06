import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { performanceMonitor } from '../src/services/performanceMonitor.ts';
import { systemHealth } from '../src/services/systemHealthService.ts';

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
    assert.ok(performanceMonitor.getStats().totalQueries > queryCountBefore);
    assert.notEqual(performanceMonitor.getStats().avgDbAccessTime, null);
  } finally {
    performanceMonitor.stopMonitoring();
  }
});
