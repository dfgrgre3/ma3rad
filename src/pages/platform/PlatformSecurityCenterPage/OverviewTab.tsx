import React from 'react';
import { Lock, KeyRound, Zap, AlertTriangle, Radar, ChevronLeft, ShieldAlert } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { formatDateTime } from '../components/PlatformUI';
import type { PlatformCentralSecurityOverview, PlatformCentralSecurityIncident, PlatformSecurityEvent, PlatformSecurityEventSeverity } from '../../../services/domains/platform/platformTypes';
import type { SecurityTab } from './constants';

interface OverviewTabProps {
  data: PlatformCentralSecurityOverview;
  canManageSecurity: boolean;
  isCentral?: boolean;
  onToggleMfaPolicy: () => void;
  onRespondIncident: (id: string, resolve: boolean) => void;
  onNavigateTab: (tab: SecurityTab) => void;
}

const SEVERITY_LABEL: Record<PlatformSecurityEventSeverity, string> = {
  CRITICAL: 'حرجة',
  HIGH: 'عالية',
  MEDIUM: 'متوسطة',
  LOW: 'منخفضة',
  INFO: 'معلوماتية',
};

const SEVERITY_DOT: Record<PlatformSecurityEventSeverity, string> = {
  CRITICAL: 'bg-danger',
  HIGH: 'bg-warning',
  MEDIUM: 'bg-primary',
  LOW: 'bg-ink-secondary',
  INFO: 'bg-muted',
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ data, canManageSecurity, isCentral = false, onToggleMfaPolicy, onRespondIncident, onNavigateTab }) => {
  const events = data.securityEvents ?? [];
  const severityBreakdown = data.events24hBySeverity ?? {};
  const topEvents = events
    .filter((event) => event.severity === 'CRITICAL' || event.severity === 'HIGH')
    .slice(0, 5);
  const mfa = data.twoFactorEnforcement;
  const mfaGap = mfa.totalStaffCount > 0 ? mfa.totalStaffCount - mfa.compliantStaffCount : 0;
  const showMfaWarning = mfa.enabled && mfaGap > 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. 2FA Policy Card (live: reads real enforcement + compliance) */}
        <div className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-success" />
              سياسة المصادقة الثنائية (2FA)
            </span>
            <span className={`rounded text-[10px] font-bold px-2 py-0.5 ${
              mfa.enabled
                ? 'bg-success/20 text-success'
                : 'bg-warning/20 text-warning'
            }`}>
              {mfa.enabled ? 'إلزامية' : 'غير إلزامية'}
            </span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {mfa.enabled
              ? 'إلزامية على كافة موظفي المنصة. الحساب غير المفعّل لا يستطيع استخدام لوحة التحكم.'
              : 'المصادقة الثنائية غير ملزمة حالياً. يمكن للمالك تفعيل الإلزام من هنا أو من صفحة الفريق.'}
          </p>
          <div className="mt-3 pt-2 border-t border-line-strong text-[11px] text-muted space-y-1.5">
            <div className="flex justify-between">
              <span>نسبة الامتثال</span>
              <span className={`font-bold ${mfa.totalStaffCount > 0 && mfa.compliantStaffCount === mfa.totalStaffCount ? 'text-success' : 'text-warning'}`}>
                {mfa.compliantStaffCount} / {mfa.totalStaffCount}
              </span>
            </div>
            <button
              disabled={!canManageSecurity}
              onClick={onToggleMfaPolicy}
              className="w-full rounded-lg border border-line-strong px-3 py-1.5 text-[10.5px] font-bold text-primary transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mfa.enabled ? 'اجعلها اختيارية' : 'اجعلها إلزامية'}
            </button>
          </div>
        </div>

        {/* 2. Cryptographic Signing */}
        <div className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted flex items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-primary" />
              محرك التوقيع الرقمي (Ed25519)
            </span>
            <span className="rounded bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5">
              مشفر
            </span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            كافة التراخيص وتكوينات العملاء موقعة تشفيرياً بمفاتيح مركزية مع تدوير دوري لمنع التلاعب.
          </p>
          <div className="mt-3 pt-2 border-t border-line-strong text-[11px] text-muted flex justify-between">
            <span>المفاتيح النشطة</span>
            <span className="text-primary font-bold">{data.signingKeys.length} مفاتيح</span>
          </div>
        </div>

        {/* 3. Incident Readiness */}
        <div className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-warning" />
              جاهزية الاستجابة للطوارئ
            </span>
            <span className="rounded bg-warning/20 text-warning text-[10px] font-bold px-2 py-0.5">
              Playbook
            </span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            إجراءات احتواء الحوادث الأمنية السريعة متاحة بنقرة واحدة لإنهاء الجلسات أو حظر الـ IP.
          </p>
          <div className="mt-3 pt-2 border-t border-line-strong text-[11px] text-muted flex justify-between">
            <span>الحوادث المفتوحة</span>
            <span
              className={`font-bold ${
                data.activeIncidentsCount === 0 ? 'text-success' : 'text-danger'
              }`}
            >
              {data.activeIncidentsCount}
            </span>
          </div>
        </div>
      </div>

      {/* MFA compliance gap warning — only when enforcement is required but incomplete */}
      {showMfaWarning && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/60 bg-warning/20 px-4 py-3">
          <div className="flex items-center gap-2 text-xs">
            <ShieldAlert className="h-4 w-4 text-warning" />
            <span className="font-bold text-warning">
              {mfaGap} موظفًا نشطًا لم يفعّل التحقق الثنائي بعد رغم إلزاميته — راجع صفحة الفريق لإكمال الامتثال.
            </span>
          </div>
        </div>
      )}

      {/* 24h events severity breakdown */}
      {Object.keys(severityBreakdown).length > 0 && (
        <div className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-xs font-bold text-muted flex items-center gap-1.5">
              <Radar className="h-4 w-4 text-primary" />
              توزيع الأحداث الأمنية — آخر 24 ساعة
            </h3>
            <button
              onClick={() => onNavigateTab('EVENTS')}
              className="flex items-center gap-1 text-[10.5px] font-bold text-primary hover:underline"
            >
              عرض كل الأحداث <ChevronLeft className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as PlatformSecurityEventSeverity[])
              .filter((sev) => (severityBreakdown[sev] ?? 0) > 0)
              .map((sev) => (
                <span
                  key={sev}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-muted"
                >
                  <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[sev]}`} />
                  {SEVERITY_LABEL[sev]}: {severityBreakdown[sev]}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Recent critical/high events strip */}
      {topEvents.length > 0 && (
        <div className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-muted flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-warning" />
              أحدث الأحداث عالية الخطورة
            </h3>
            <button
              onClick={() => onNavigateTab('EVENTS')}
              className="flex items-center gap-1 text-[10.5px] font-bold text-primary hover:underline"
            >
              عرض الكل <ChevronLeft className="h-3 w-3" />
            </button>
          </div>
          <ul className="divide-y divide-line">
            {topEvents.map((event: PlatformSecurityEvent) => (
              <li key={event.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-bold text-muted truncate">{event.title}</p>
                  <p className="text-[10.5px] text-muted">
                    {event.sourceIp ? <span dir="ltr" className="font-mono">{event.sourceIp}</span> : '—'}
                    {event.staffName ? ` · ${event.staffName}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-[10.5px] text-muted whitespace-nowrap">
                  {formatDateTime(event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick Active Incidents Banner if any */}
      {data.incidents.filter((i) => i.status !== 'RESOLVED').length > 0 && (
        <div className="rounded-xl border border-danger/80 bg-danger/30 p-4">
          <h3 className="text-xs font-bold text-danger flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4" />
            حوادث أمنية قيد الاحتواء والتحقيق تتطلب انتباهك:
          </h3>
          <ul className="space-y-2">
            {data.incidents
              .filter((i) => i.status !== 'RESOLVED')
              .map((inc: PlatformCentralSecurityIncident) => (
                <li
                  key={inc.id}
                  className="flex items-center justify-between bg-primary/80 p-2.5 rounded-lg border border-danger/50 text-xs"
                >
                  <div>
                    <span className="font-bold text-muted">{inc.title}</span>
                    <span className="text-muted text-[11px] mr-2">
                      (المصدر: {inc.sourceIp || 'خارجي'})
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canManageSecurity || isCentral}
                    title={isCentral ? 'الاستجابة للحوادث غير مدعومة في الوضع المركزي — راجع تبويب الأحداث' : undefined}
                    onClick={() => onRespondIncident(inc.id, true)}
                  >
                    {isCentral ? 'حدث أمني — راجع التفاصيل' : 'إغلاق وحل الحادث'}
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
};
