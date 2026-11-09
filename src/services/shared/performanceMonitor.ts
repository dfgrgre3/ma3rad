import { DatabaseManager } from '../../database/repositories/databaseManager';

/**
 * نظام مراقبة الأداء المحلي
 * يتتبع قياسات قاعدة البيانات والذاكرة وإحصاءات الاستعلام المتاحة
 */

export interface PerformanceMetrics {
  timestamp: string;
  dbAccessTime: number;
  dbSizeMB: number;
  cacheSizeMB: number;
  memoryUsageMB: number | null;
  cpuUsage: number | null;
  activeConnections: number;
  queriesPerSecond: number | null;
  errorRate: number | null;
}

interface PerformanceThresholds {
  maxDbAccessTimeMs: number;
  maxDbSizeMB: number;
  maxMemoryMB: number;
  maxErrorRate: number;
}

export interface Alert {
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  message: string;
}

class PerformanceMonitorService {
  private static instance: PerformanceMonitorService;
  private metricsBuffer: PerformanceMetrics[] = [];
  private alerts: Alert[] = [];
  private readonly maxBuffer = 1000;
  private monitoringTimer: ReturnType<typeof setInterval> | null = null;
  private lastQuerySample: { timestamp: number; totalQueries: number; failedQueries: number } | null = null;
  private thresholds: PerformanceThresholds = {
    maxDbAccessTimeMs: 500,
    maxDbSizeMB: 500,
    maxMemoryMB: 2048,
    maxErrorRate: 5 // percentage
  };

  private constructor() {}

  static getInstance(): PerformanceMonitorService {
    if (!PerformanceMonitorService.instance) {
      PerformanceMonitorService.instance = new PerformanceMonitorService();
    }
    return PerformanceMonitorService.instance;
  }

  async startMonitoring(): Promise<void> {
    if (this.monitoringTimer) return;

    // مراقبة كل 10 دقائق
    this.monitoringTimer = setInterval(() => {
      void this.collectMetrics()
        .then((metrics) => {
          this.recordMetric(metrics);
          this.checkThresholds(metrics);
        })
        .catch((error) => console.error('Performance monitoring failed:', error));
    }, 10 * 60 * 1000);

    // جمع أولي
    const initialMetrics = await this.collectMetrics();
    this.recordMetric(initialMetrics);
    this.checkThresholds(initialMetrics);
  }

  stopMonitoring(): void {
    if (this.monitoringTimer) clearInterval(this.monitoringTimer);
    this.monitoringTimer = null;
  }

  private async collectMetrics(): Promise<PerformanceMetrics> {
    const databaseManager = DatabaseManager.getInstance();
    const database = databaseManager.getDb();
    const queryStartedAt = performance.now();
    database.exec('SELECT random()');
    const dbAccessTime = Math.max(0, performance.now() - queryStartedAt);

    const pageCount = Number(database.exec('PRAGMA page_count')[0]?.values[0]?.[0]);
    const pageSize = Number(database.exec('PRAGMA page_size')[0]?.values[0]?.[0]);
    if (!Number.isFinite(pageCount) || !Number.isFinite(pageSize) || pageCount < 0 || pageSize < 0) {
      throw new Error('Could not read SQLite database size.');
    }

    const runtimeInfo = typeof window !== 'undefined'
      ? await window.ceramisys?.app?.info?.()
      : undefined;
    const processMemoryBytes = runtimeInfo?.system?.processMemoryBytes;
    const memoryUsageMB = typeof processMemoryBytes === 'number' && Number.isFinite(processMemoryBytes)
      ? processMemoryBytes / (1024 * 1024)
      : null;
    const queryStats = databaseManager.getQueryStats();
    const now = Date.now();
    const previousSample = this.lastQuerySample;
    this.lastQuerySample = {
      timestamp: now,
      totalQueries: queryStats.totalQueries,
      failedQueries: queryStats.failedQueries
    };

    let queriesPerSecond: number | null = null;
    let errorRate: number | null = null;
    if (previousSample) {
      const elapsedSeconds = (now - previousSample.timestamp) / 1000;
      const queryCount = queryStats.totalQueries - previousSample.totalQueries;
      const failedQueryCount = queryStats.failedQueries - previousSample.failedQueries;
      if (elapsedSeconds > 0 && queryCount >= 0 && failedQueryCount >= 0) {
        queriesPerSecond = queryCount / elapsedSeconds;
        if (queryCount > 0) errorRate = (failedQueryCount / queryCount) * 100;
      }
    }

    return {
      timestamp: new Date().toISOString(),
      dbAccessTime,
      dbSizeMB: (pageCount * pageSize) / (1024 * 1024),
      cacheSizeMB: databaseManager.getQueryCacheStats().sizeBytes / (1024 * 1024),
      memoryUsageMB,
      cpuUsage: null,
      activeConnections: 1,
      queriesPerSecond,
      errorRate
    };
  }

  private recordMetric(metrics: PerformanceMetrics): void {
    this.metricsBuffer.push(metrics);
    if (this.metricsBuffer.length > this.maxBuffer) {
      this.metricsBuffer = this.metricsBuffer.slice(-this.maxBuffer);
    }
  }

  private checkThresholds(metrics: PerformanceMetrics): void {
    const checks = [
      {
        metric: 'dbAccessTime',
        value: metrics.dbAccessTime,
        threshold: this.thresholds.maxDbAccessTimeMs,
        message: 'وقت الوصول لقاعدة البيانات مرتفع'
      },
      {
        metric: 'dbSizeMB',
        value: metrics.dbSizeMB,
        threshold: this.thresholds.maxDbSizeMB,
        message: 'حجم قاعدة البيانات كبير'
      },
      {
        metric: 'memoryUsageMB',
        value: metrics.memoryUsageMB,
        threshold: this.thresholds.maxMemoryMB,
        message: 'استخدام الذاكرة مرتفع'
      },
      {
        metric: 'errorRate',
        value: metrics.errorRate,
        threshold: this.thresholds.maxErrorRate,
        message: 'معدل الأخطاء مرتفع'
      }
    ];

    for (const check of checks) {
      if (check.value !== null && check.value >= check.threshold) {
        this.recordAlert({
          timestamp: new Date().toISOString(),
          severity: check.value >= check.threshold * 1.2 ? 'critical' : 'warning',
          metric: check.metric,
          value: check.value,
          threshold: check.threshold,
          message: check.message
        });
      }
    }
  }

  private recordAlert(alert: Alert): void {
    this.alerts.push(alert);
    if (this.alerts.length > this.maxBuffer) {
      this.alerts = this.alerts.slice(-this.maxBuffer);
    }

    // إشعار للنظام
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      const event = new CustomEvent('performance-alert', { detail: alert });
      window.dispatchEvent(event);
    }
  }

  getMetrics(limit?: number): PerformanceMetrics[] {
    const all = [...this.metricsBuffer].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return limit ? all.slice(-limit) : all;
  }

  getAlerts(limit?: number): Alert[] {
    const all = [...this.alerts].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return limit ? all.slice(-limit) : all;
  }

  updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }

  clearMetrics(): void {
    this.metricsBuffer = [];
  }

  clearAlerts(): void {
    this.alerts = [];
  }

  getStats(): {
    avgDbAccessTime: number | null;
    totalQueries: number;
    peakMemory: number | null;
    alertCount: number;
  } {
    const times = this.metricsBuffer.map(m => m.dbAccessTime);
    const memoryReadings = this.metricsBuffer
      .map((metric) => metric.memoryUsageMB)
      .filter((value): value is number => value !== null);
    const avgTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    const peakMemory = memoryReadings.length ? Math.max(...memoryReadings) : null;

    return {
      avgDbAccessTime: avgTime === null ? null : Math.floor(avgTime),
      totalQueries: DatabaseManager.getInstance().getQueryStats().totalQueries,
      peakMemory: peakMemory,
      alertCount: this.alerts.length
    };
  }
}

export const performanceMonitor = PerformanceMonitorService.getInstance();
