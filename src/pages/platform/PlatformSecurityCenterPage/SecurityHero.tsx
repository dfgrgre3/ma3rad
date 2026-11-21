import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { PlatformCentralSecurityOverview, PlatformSecurityEventSeverity } from '../../../services/domains/platform/platformTypes';

interface SecurityHeroProps {
  data: PlatformCentralSecurityOverview;
  lastUpdated?: Date | null;
}

const SEVERITY_DOT: Record<PlatformSecurityEventSeverity, string> = {
  CRITICAL: 'bg-danger',
  HIGH: 'bg-warning',
  MEDIUM: 'bg-primary',
  LOW: 'bg-ink-secondary',
  INFO: 'bg-muted',
};

const SEVERITY_LABEL: Record<PlatformSecurityEventSeverity, string> = {
  CRITICAL: 'حرجة',
  HIGH: 'عالية',
  MEDIUM: 'متوسطة',
  LOW: 'منخفضة',
  INFO: 'معلوماتية',
};

export const SecurityHero: React.FC<SecurityHeroProps> = ({ data, lastUpdated }) => {
  const isScoreHigh = data.securityScore >= 85;
  const isScoreMedium = data.securityScore >= 65 && data.securityScore < 85;

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border p-6 shadow-xl ${
        isScoreHigh
          ? 'border-success/60 bg-gradient-to-br from-ink via-ink to-success text-white'
          : isScoreMedium
          ? 'border-warning/60 bg-gradient-to-br from-ink via-ink to-warning text-white'
          : 'border-danger/60 bg-gradient-to-br from-ink via-ink to-danger text-white'
      }`}
    >
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                isScoreHigh
                  ? 'bg-success/20 text-success border-success/30'
                  : isScoreMedium
                  ? 'bg-warning/20 text-warning border-warning/30'
                  : 'bg-danger/20 text-danger border-danger/30'
              }`}
            >
              {isScoreHigh ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              {isScoreHigh ? 'الوضع الأمني محصن ومستقر' : 'تنبيهات أمنية قيد المتابعة'}
            </span>
            <span className="text-xs text-muted">تقييم مبني على الـ 2FA، الجلسات، وسجلات المحاولات الفاشلة</span>
          </div>

          <div className="flex items-baseline gap-3">
            <h1 className="text-5xl font-black tracking-tight">{data.securityScore}%</h1>
            <span className="text-sm font-semibold text-muted">مؤشر أمان المنصة العام</span>
          </div>

          <p className="text-sm text-muted max-w-xl">
            المصادقة الثنائية (2FA) لموظفي المنصة، الجلسات المفتوحة والأجهزة الموثوقة، مفاتيح التوقيع الرقمي، مع تسجيل دقيق لكافة محاولات الدخول والحوادث الأمنية.
          </p>

          {/* 24h severity breakdown */}
          {data.events24hBySeverity && Object.keys(data.events24hBySeverity).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[10px] font-bold text-muted">أحداث 24 ساعة:</span>
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as PlatformSecurityEventSeverity[])
                .filter((sev) => (data.events24hBySeverity?.[sev] ?? 0) > 0)
                .map((sev) => (
                  <span
                    key={sev}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-surface/5 px-2 py-0.5 text-[10px] font-bold text-muted"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[sev]}`} />
                    {SEVERITY_LABEL[sev]} {data.events24hBySeverity?.[sev]}
                  </span>
                ))}
            </div>
          )}

          {lastUpdated && (
            <p className="text-[10px] text-muted">
              آخر تحديث للبيانات: {lastUpdated.toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>

        {/* Quick Metrics Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
          <div className="rounded-xl border border-white/10 bg-surface/5 p-3.5 text-center backdrop-blur-sm">
            <p className="text-[11px] font-semibold text-muted">المصادقة 2FA</p>
            <p className="mt-1 text-xl font-black text-success">
              {data.twoFactorEnforcement.compliantStaffCount} / {data.twoFactorEnforcement.totalStaffCount}
            </p>
            <p className="text-[10px] text-muted">موظفون ممتثلون</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface/5 p-3.5 text-center backdrop-blur-sm">
            <p className="text-[11px] font-semibold text-muted">الجلسات المفتوحة</p>
            <p className="mt-1 text-xl font-black text-primary">{data.activeStaffSessionsCount}</p>
            <p className="text-[10px] text-muted">{data.trustedDevicesCount} أجهزة موثوقة</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface/5 p-3.5 text-center backdrop-blur-sm">
            <p className="text-[11px] font-semibold text-muted">فشل الدخول (24h)</p>
            <p
              className={`mt-1 text-xl font-black ${
                data.failedLogins24hCount > 0 ? 'text-danger' : 'text-success'
              }`}
            >
              {data.failedLogins24hCount}
            </p>
            <p className="text-[10px] text-muted">محاولات مسجلة</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface/5 p-3.5 text-center backdrop-blur-sm">
            <p className="text-[11px] font-semibold text-muted">الحوادث النشطة</p>
            <p
              className={`mt-1 text-xl font-black ${
                data.activeIncidentsCount > 0 ? 'text-warning' : 'text-success'
              }`}
            >
              {data.activeIncidentsCount}
            </p>
            <p className="text-[10px] text-muted">تتطلب استجابة</p>
          </div>
        </div>
      </div>
    </section>
  );
};
