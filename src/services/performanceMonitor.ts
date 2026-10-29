/**
 * نظام مراقبة الأداء المحلي
 * يتتبع أداء قاعدة البيانات، الذاكرة، CPU
 */

export interface PerformanceMetrics {
  timestamp: string;
  dbAccessTime: number;
  dbSizeMB: number;
  cacheSizeMB: number;
  memoryUsageMB: number;
  cpuUsage: number;
  activeConnections: number;
  queriesPerSecond: number;
  errorRate: number;
}

interface PerformanceThresholds {
  maxDbAccessTimeMs: number;
  maxDbSizeMB: number;
  maxMemoryMB: number;
  maxCpuUsage: number;
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
  private thresholds: PerformanceThresholds = {
    maxDbAccessTimeMs: 500,
    maxDbSizeMB: 500,
    maxMemoryMB: 2048,
    maxCpuUsage: 90,
    maxErrorRate: 5 // percentage
  };

  private constructor() {
    this.startMonitoring();
  }

  static getInstance(): PerformanceMonitorService {
    if (!PerformanceMonitorService.instance) {
      PerformanceMonitorService.instance = new PerformanceMonitorService();
    }
    return PerformanceMonitorService.instance;
  }

  async startMonitoring(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // مراقبة كل 10 دقائق
    setInterval(async () => {
      const metrics = await this.collectMetrics();
      this.recordMetric(metrics);
      this.checkThresholds(metrics);
    }, 10 * 60 * 1000);

    // جمع أولي
    const initialMetrics = await this.collectMetrics();
    this.recordMetric(initialMetrics);
  }

  private initialized = false;

  private async collectMetrics(): Promise<PerformanceMetrics> {
    // يمكن استخدام `measure` API
    // الحصول على معلومات rivolto قاعدة البيانات
    // الحصول على استخدام الذاكرة
    // الحصول على استخدام CPU

    // fake metrics for demo
    return {
      timestamp: new Date().toISOString(),
      dbAccessTime: Math.floor(Math.random() * 100),
      dbSizeMB: Math.floor(Math.random() * 100),
      cacheSizeMB: Math.floor(Math.random() * 50),
      memoryUsageMB: Math.floor(Math.random() * 1024),
      cpuUsage: Math.floor(Math.random() * 20),
      activeConnections: 1,
      queriesPerSecond: 0,
      errorRate: 0
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
        metric: 'cpuUsage',
        value: metrics.cpuUsage,
        threshold: this.thresholds.maxCpuUsage,
        message: 'استخدام وحدة المعالجة المركزية مرتفع'
      },
      {
        metric: 'errorRate',
        value: metrics.errorRate,
        threshold: this.thresholds.maxErrorRate,
        message: 'معدل الأخطاء مرتفع'
      }
    ];

    for (const check of checks) {
      if (check.value >= check.threshold) {
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
    const event = new CustomEvent('performance-alert', { detail: alert });
    window.dispatchEvent(event);
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
    avgDbAccessTime: number;
    totalQueries: number;
    peakMemory: number;
    alertCount: number;
  } {
    const times = this.metricsBuffer.map(m => m.dbAccessTime);
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length || 0;
    const peakMemory = Math.max(...this.metricsBuffer.map(m => m.memoryUsageMB));

    return {
      avgDbAccessTime: Math.floor(avgTime),
      totalQueries: 0, // يمكن جمعها من أداء الاستعلام
      peakMemory: peakMemory,
      alertCount: this.alerts.length
    };
  }
}

export const performanceMonitor = PerformanceMonitorService.getInstance();
