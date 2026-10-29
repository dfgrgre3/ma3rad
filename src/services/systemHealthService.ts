/**
 * خدمة مراقبة صحة النظام
 * دمج كل عناصر الأمان والأداء والنسخ الاحتياطي في وحدة واحدة
 */

import { auditLogger } from './auditLogger';
import { performanceMonitor } from './performanceMonitor';


export interface HealthScore {
  overall: number;
  security: number;
  performance: number;
  dataIntegrity: number;
  backupHealth: number;
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
  activeUsers: number;
  failedLogins: number;
  encryptionEvents: number;
  backupEvents: number;
  auditEvents: number;
  performanceAlerts: number;
  securityRanking: 'A' | 'B' | 'C' | 'D';
  diskSpaceMB: number;
  memoryUsageMB: number;
  cpuUsage: number;
  networkAvailability: boolean;
  databaseHealth: string;
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
  private lastSafeScore: HealthScore = { overall: 100, security: 100, performance: 100, dataIntegrity: 100, backupHealth: 100 };
  private healthHistory: { score: HealthScore; timestamp: number }[] = [];

  private constructor() {
    this.startHealthCheck();
  }

  static getInstance(): SystemHealthService {
    if (!SystemHealthService.instance) {
      SystemHealthService.instance = new SystemHealthService();
    }
    return SystemHealthService.instance;
  }

  async startHealthCheck(): Promise<void> {
    // فحص دوري كل 5 دقائق
    setInterval(async () => {
      const currentScore = await this.calculateHealthScore();
      this.recordScore(currentScore);
      this.generateQuestions(currentScore);
    }, 5 * 60 * 1000);

    // فحص أولي
    const initialScore = await this.calculateHealthScore();
    this.recordScore(initialScore);
  }

  public async calculateHealthScore(): Promise<HealthScore> {
    const securityScore = await this.calculateSecurityScore();
    const performanceScore = await this.calculatePerformanceScore();
    const dataIntegrityScore = await this.calculateDataIntegrityScore();
    const backupHealthScore = await this.calculateBackupHealthScore();

    const overallScore =
      (securityScore * 0.3) +
      (performanceScore * 0.2) +
      (dataIntegrityScore * 0.25) +
      (backupHealthScore * 0.25);

    return {
      overall: Math.round(overallScore),
      security: Math.round(securityScore),
      performance: Math.round(performanceScore),
      dataIntegrity: Math.round(dataIntegrityScore),
      backupHealth: Math.round(backupHealthScore)
    };
  }



  private async calculateSecurityScore(): Promise<number> {
    let score = 100;

    // التشفير دائمًا مفعل
    score += 30;

    if (this.lastSafeScore.dataIntegrity < 100) score -= 10;

    return Math.max(0, score);
  }

  private async calculatePerformanceScore(): Promise<number> {
    const alerts = performanceMonitor.getAlerts();
    let score = 100;

    if (alerts.length > 5) score -= 20;
    if (alerts.length > 10) score -= 20;

    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    if (criticalAlerts > 0) score -= 10 * criticalAlerts;

    return Math.max(0, score);
  }

  private async calculateDataIntegrityScore(): Promise<number> {
    // تقييم نقا ء البيانات
    let score = 100;

    const metrics = performanceMonitor.getMetrics();
    const dbAccessTime = Math.max(...metrics.map(m => m.dbAccessTime));

    if (dbAccessTime > 500) score -= 20;
    if (dbAccessTime > 1000) score -= 20;

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
    if (score.overall < 80) {
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
    const event = new CustomEvent('system-health-alert', { detail: alert });
    window.dispatchEvent(event);
  }

  private alerts: HealthAlert[] = [];

  getAlerts(limit?: number): HealthAlert[] {
    const all = [...this.alerts].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return limit ? all.slice(-limit) : all;
  }

  async generateReport(): Promise<SystemHealthReport> {
    const score = this.lastSafeScore;
    const securityMetrics = {
      activeUsers: 1,
      failedLogins: 0,
      successfulLogins: 0,
      encryptionEvents: 0,
      backupEvents: 0,
      auditEvents: 0,
      performanceAlerts: 0,
      securityRanking: 'A' as const
    };

    const metrics: HealthMetrics = {
      activeUsers: securityMetrics.activeUsers,
      failedLogins: securityMetrics.failedLogins,
      encryptionEvents: securityMetrics.encryptionEvents,
      backupEvents: securityMetrics.backupEvents,
      auditEvents: securityMetrics.auditEvents,
      performanceAlerts: securityMetrics.performanceAlerts,
      securityRanking: securityMetrics.securityRanking,
      diskSpaceMB: 0,
      memoryUsageMB: 0,
      cpuUsage: 0,
      networkAvailability: true,
      databaseHealth: 'good'
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

    if (score.overall < 80) {
      recs.push('الأداء العام منخفض - يرجى مراجعة الصيانة');
    }
    if (score.security < 80) {
      recs.push('النموذج الأمني يتطلب تحسين التطوير');
    }
    if (score.performance < 80) {
      recs.push('تم رصد مشاكل في الأداء - يرجى تنفيذ تحسينات');
    }
    if (score.dataIntegrity < 80) {
      recs.push('تم كشف مشاكل في سلامة البيانات');
    }
    if (score.backupHealth < 80) {
      recs.push('النسخ الاحتياطي يتطلب تحسينًا');
    }

    return recs;
  }

  async getDetailedStatus(): Promise<{
    security: HealthScore['security'];
    performance: HealthScore['performance'];
    dataIntegrity: HealthScore['dataIntegrity'];
    backupHealth: HealthScore['backupHealth'];
    uptime: number;
    version: string;
    environment: 'production' | 'development';
    memoryUsage: { used: number; total: number };
    diskUsage: { used: number; total: number };
  }> {
    performanceMonitor.getMetrics();

    return {
      security: this.lastSafeScore.security,
      performance: this.lastSafeScore.performance,
      dataIntegrity: this.lastSafeScore.dataIntegrity,
      backupHealth: this.lastSafeScore.backupHealth,
      uptime: 0,
      version: '1.1.3',
      environment: 'production',
      memoryUsage: { used: 0, total: 0 },
      diskUsage: { used: 0, total: 0 }
    };
  }
}

export const systemHealth = SystemHealthService.getInstance();
