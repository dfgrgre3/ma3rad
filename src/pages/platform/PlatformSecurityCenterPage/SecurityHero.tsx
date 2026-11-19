import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { PlatformCentralSecurityOverview } from '../../../services/domains/platform/platformTypes';

interface SecurityHeroProps {
  data: PlatformCentralSecurityOverview;
}

export const SecurityHero: React.FC<SecurityHeroProps> = ({ data }) => {
  const isScoreHigh = data.securityScore >= 85;
  const isScoreMedium = data.securityScore >= 65 && data.securityScore < 85;

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border p-6 shadow-xl ${
        isScoreHigh
          ? 'border-emerald-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white'
          : isScoreMedium
          ? 'border-amber-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950 text-white'
          : 'border-rose-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950 text-white'
      }`}
    >
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                isScoreHigh
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : isScoreMedium
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}
            >
              {isScoreHigh ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              {isScoreHigh ? 'الوضع الأمني محصن ومستقر' : 'تنبيهات أمنية قيد المتابعة'}
            </span>
            <span className="text-xs text-slate-400">تقييم مبني على الـ 2FA، الجلسات، وسجلات المحاولات الفاشلة</span>
          </div>

          <div className="flex items-baseline gap-3">
            <h1 className="text-5xl font-black tracking-tight">{data.securityScore}%</h1>
            <span className="text-sm font-semibold text-slate-300">مؤشر أمان المنصة العام</span>
          </div>

          <p className="text-sm text-slate-300 max-w-xl">
            المصادقة الثنائية (2FA) لموظفي المنصة، الجلسات المفتوحة والأجهزة الموثوقة، مفاتيح التوقيع الرقمي، مع تسجيل دقيق لكافة محاولات الدخول والحوادث الأمنية.
          </p>
        </div>

        {/* Quick Metrics Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
            <p className="text-[11px] font-semibold text-slate-400">المصادقة 2FA</p>
            <p className="mt-1 text-xl font-black text-emerald-400">
              {data.twoFactorEnforcement.compliantStaffCount} / {data.twoFactorEnforcement.totalStaffCount}
            </p>
            <p className="text-[10px] text-slate-400">موظفون ممتثلون</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
            <p className="text-[11px] font-semibold text-slate-400">الجلسات المفتوحة</p>
            <p className="mt-1 text-xl font-black text-sky-400">{data.activeStaffSessionsCount}</p>
            <p className="text-[10px] text-slate-400">{data.trustedDevicesCount} أجهزة موثوقة</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
            <p className="text-[11px] font-semibold text-slate-400">فشل الدخول (24h)</p>
            <p
              className={`mt-1 text-xl font-black ${
                data.failedLogins24hCount > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {data.failedLogins24hCount}
            </p>
            <p className="text-[10px] text-slate-400">محاولات مسجلة</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
            <p className="text-[11px] font-semibold text-slate-400">الحوادث النشطة</p>
            <p
              className={`mt-1 text-xl font-black ${
                data.activeIncidentsCount > 0 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {data.activeIncidentsCount}
            </p>
            <p className="text-[10px] text-slate-400">تتطلب استجابة</p>
          </div>
        </div>
      </div>
    </section>
  );
};
