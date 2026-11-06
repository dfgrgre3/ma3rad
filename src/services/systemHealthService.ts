/**
 * خدمة مراقبة صحة النظام
 * دمج كل عناصر الأمان والأداء والنسخ الاحتياطي في وحدة واحدة
 */

import { auditLogger } from './auditLogger';
import { performanceMonitor } from './performanceMonitor';
import { securityService } from './SecurityService';
import { APP_VERSION } from '../config/appVersion';


export interface HealthScore {
  overall: number | null;
  security: number | null;
  performance: number | null;
  dataIntegrity: number | null;
  backupHealth: number | null;
}

export interface HealthAlert {
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'security' | 'performance' | 'data' | 'backup';
  title: string;
  message: string;
  score: number;
  actionable: boolean;
  fix?: string;
}

export interface HealthMetrics {
  activeUsers: number | null;
  failedLogins: number | null;
  encryptionEvents: number | null;
  backupEvents: number | null;
  auditEvents: number | null;
  performanceAlerts: number | null;
  securityRanking: 'A' | 'B' | 'C' | 'D' | null;
  diskSpaceMB: number | null;
  memoryUsageMB: number | null;
  cpuUsage: number | null;
  networkAvailability: boolean | null;
  databaseHealth: 'unknown' | 'responsive' | 'slow';
}

export interface SystemHealthReport {
  healthScore: HealthScore;
  alerts: HealthAlert[];
  metrics: HealthMetrics;
  recommendations: string[];
  timestamp: string;
}

class SystemHealthService {
  private static instance: SystemHealthService;
  private lastSafeScore: HealthScore = {
    overall: null,
    security: null,
    performance: null,
    dataIntegrity: null,
    backupHealth: null
  };
  private healthHistory: { score: HealthScore; timestamp: number }[] = [];
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  static getInstance(): SystemHealthService {
    if (!SystemHealthService.instance) {
      SystemHealthService.instance = new SystemHealthService();
    }
    return SystemHealthService.instance;
  }

  async startHealthCheck(): Promise<void> {
    if (this.healthCheckTimer) return;
    // فحص دوري كل 5 دقائق
    this.healthCheckTimer = setInterval(() => {
      void this.runHealthCheck()
        .catch((error) => console.error('System health monitoring failed:', error));
    }, 5 * 60 * 1000);

    // فحص أولي
    await this.runHealthCheck();
  }

  stopHealthCheck(): void {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    this.healthCheckTimer = null;
  }

  private async runHealthCheck(): Promise<void> {
    const currentScore = await this.calculateHealthScore();
    this.recordScore(currentScore);
    this.generateQuestions(currentScore);
  }

  public async calculateHealthScore(): Promise<HealthScore> {
    const securityScore = await this.calculateSecurityScore();
    const performanceScore = await this.calculatePerformanceScore();
    // لا يُستنتج تكامل البيانات من زمن الاستجابة؛ فحوصه في مسار التشخيص المستقل.
    const dataIntegrityScore: null = null;
    const backupHealthScore = await this.calculateBackupHealthScore();

    const components = [
      { score: securityScore, weight: 0.3 },
      { score: performanceScore, weight: 0.2 },
      { score: dataIntegrityScore, weight: 0.25 },
      { score: backupHealthScore, weight: 0.25 }
    ].filter((item): item is { score: number; weight: number } => item.score !== null);
    const totalWeight = components.reduce((total, item) => total + item.weight, 0);
    const overallScore = totalWeight > 0
      ? components.reduce((total, item) => total + item.score * item.weight, 0) / totalWeight
      : null;

    return {
      overall: overallScore === null ? null : Math.round(overallScore),
      security: securityScore === null ? null : Math.round(securityScore),
      performance: performanceScore === null ? null : Math.round(performanceScore),
      dataIntegrity: dataIntegrityScore,
      backupHealth: backupHealthScore === null ? null : Math.round(backupHealthScore)
    };
  }



  private async calculateSecurityScore(): Promise<number> {
    const ranking = securityService.getMetrics().securityRanking;
    return { A: 100, B: 80, C: 60, D: 40 }[ranking];
  }

  private async calculatePerformanceScore(): Promise<number | null> {
    if (performanceMonitor.getMetrics().length === 0) return null;
    const alerts = performanceMonitor.getAlerts();
    let score = 100;

    if (alerts.length > 5) score -= 20;
    if (alerts.length > 10) score -= 20;

    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    if (criticalAlerts > 0) score -= 10 * criticalAlerts;

    return Math.max(0, score);
  }

  private async calculateBackupHealthScore(): Promise<number> {
    // تقييم صحة النسخ الاحتياطية
    let score = 100;

    const auditLogs = auditLogger.getLogs({ action: 'backup' });
    const recentBackups = auditLogs.filter(l => {
      const logDate = new Date(l.timestamp);
      return logDate > new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 ساعة
    });

    if (recentBackups.length === 0) score -= 30;
    if (recentBackups.length < 3) score -= 20;

    return Math.max(0, score);
  }

  private recordScore(score: HealthScore): void {
    this.lastSafeScore = score;
    this.healthHistory.push({ score, timestamp: Date.now() });

    if (this.healthHistory.length > 100) {
      this.healthHistory = this.healthHistory.slice(-100);
    }
  }

  getHealthScore(): HealthScore {
    return this.lastSafeScore;
  }

  getHealthHistory(): { score: HealthScore; timestamp: number }[] {
    return [...this.healthHistory].sort((a, b) => a.timestamp - b.timestamp);
  }

  private generateQuestions(score: HealthScore): void {
    if (score.overall !== null && score.overall < 80) {
      // إنشاء تنبيه
      const alert: HealthAlert = {
        timestamp: new Date().toISOString(),
        severity: score.overall < 60 ? 'critical' : 'warning',
        category: 'security',
        title: 'تقييم صحة النظام',
        message: `الأداء العام للنظام: ${score.overall}%`,
        score: score.overall,
        actionable: true,
        fix: 'قم بمراجعة أسباب انخفاض تقييم صحة النظام ' + JSON.stringify(score)
      };

      this.recordAlert(alert);
    }
  }

  private recordAlert(alert: HealthAlert): void {
    this.alerts.push(alert);
    // Limit alerts to a reasonable number
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('system-health-alert', { detail: alert }));
    }
  }

  private alerts: HealthAlert[] = [];

  getAlerts(limit?: number): HealthAlert[] {
    const all = [...this.alerts].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return limit ? all.slice(-limit) : all;
  }

  async generateReport(): Promise<SystemHealthReport> {
    const score = this.lastSafeScore;
    const securityMetrics = securityService.getMetrics();
    const runtimeInfo = typeof window !== 'undefined'
      ? await window.ceramisys?.app?.info?.()
      : undefined;
    const latestMetric = performanceMonitor.getMetrics(1)[0];
    const recentDatabaseAlert = latestMetric && performanceMonitor.getAlerts().some((alert) =>
      alert.metric === 'dbAccessTime' && alert.timestamp >= latestMetric.timestamp
    );
    const disk = runtimeInfo?.system?.disk;

    const metrics: HealthMetrics = {
      activeUsers: securityMetrics.activeUsers,
      failedLogins: securityMetrics.failedLogins,
      encryptionEvents: securityMetrics.encryptionEvents,
      backupEvents: securityMetrics.backupEvents,
      auditEvents: securityMetrics.auditEvents,
      performanceAlerts: securityMetrics.performanceAlerts,
      securityRanking: securityMetrics.securityRanking,
      diskSpaceMB: disk?.available ? disk.freeBytes / (1024 * 1024) : null,
      memoryUsageMB: latestMetric?.memoryUsageMB ?? null,
      cpuUsage: latestMetric?.cpuUsage ?? null,
      networkAvailability: null,
      databaseHealth: !latestMetric ? 'unknown' : recentDatabaseAlert ? 'slow' : 'responsive'
    };

    const recommendations = this.generateRecommendations(score);

    return {
      healthScore: score,
      alerts: this.getAlerts(),
      metrics,
      recommendations,
      timestamp: new Date().toISOString()
    };
  }

  private generateRecommendations(score: HealthScore): string[] {
    const recs: string[] = [];

    if (score.overall !== null && score.overall < 80) {
      recs.push('الأداء العام منخفض - يرجى مراجعة الصيانة');
    }
    if (score.security !== null && score.security < 80) {
      recs.push('النموذج الأمني يتطلب تحسين التطوير');
    }
    if (score.performance !== null && score.performance < 80) {
      recs.push('تم رصد مشاكل في الأداء - يرجى تنفيذ تحسينات');
    }
    if (score.dataIntegrity !== null && score.dataIntegrity < 80) {
      recs.push('تم كشف مشاكل في سلامة البيانات');
    }
    if (score.dataIntegrity === null) {
      recs.push('لم تُقَس سلامة قاعدة البيانات هنا - شغّل فحوصات التشخيص المخصصة');
    }
    if (score.backupHealth !== null && score.backupHealth < 80) {
      recs.push('النسخ الاحتياطي يتطلب تحسينًا');
    }

    return recs;
  }

  async getDetailedStatus(): Promise<{
    security: HealthScore['security'];
    performance: HealthScore['performance'];
    dataIntegrity: HealthScore['dataIntegrity'];
    backupHealth: HealthScore['backupHealth'];
    uptime: number | null;
    version: string;
    environment: 'production' | 'development' | 'unknown';
    memoryUsage: { used: number | null; total: number | null };
    diskUsage: { used: number | null; total: number | null };
  }> {
    const runtimeInfo = typeof window !== 'undefined'
      ? await window.ceramisys?.app?.info?.()
      : undefined;
    const system = runtimeInfo?.system;
    const freeDiskBytes = system?.disk.available ? system.disk.freeBytes : null;
    const totalDiskBytes = system?.disk.available ? system.disk.totalBytes : null;

    return {
      security: this.lastSafeScore.security,
      performance: this.lastSafeScore.performance,
      dataIntegrity: this.lastSafeScore.dataIntegrity,
      backupHealth: this.lastSafeScore.backupHealth,
      uptime: system?.processUptimeSeconds ?? null,
      version: APP_VERSION,
      environment: runtimeInfo ? (runtimeInfo.packaged ? 'production' : 'development') : 'unknown',
      memoryUsage: {
        used: system ? system.processMemoryBytes / (1024 * 1024) : null,
        total: system ? system.totalMemoryBytes / (1024 * 1024) : null
      },
      diskUsage: {
        used: freeDiskBytes !== null && totalDiskBytes !== null
          ? (totalDiskBytes - freeDiskBytes) / (1024 * 1024)
          : null,
        total: totalDiskBytes !== null ? totalDiskBytes / (1024 * 1024) : null
      }
    };
  }
}

export const systemHealth = SystemHealthService.getInstance();
