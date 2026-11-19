import React from 'react';
import { Lock, KeyRound, Zap, AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { PlatformCentralSecurityOverview, PlatformCentralSecurityIncident } from '../../../services/domains/platform/platformTypes';

interface OverviewTabProps {
  data: PlatformCentralSecurityOverview;
  canManageSecurity: boolean;
  onToggleMfaPolicy: () => void;
  onRespondIncident: (id: string, resolve: boolean) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ data, canManageSecurity, onToggleMfaPolicy, onRespondIncident }) => (
  <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* 1. 2FA Policy Card (live: reads real enforcement + compliance) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Lock className="h-4 w-4 text-emerald-400" />
            سياسة المصادقة الثنائية (2FA)
          </span>
          <span className={`rounded text-[10px] font-bold px-2 py-0.5 ${
            data.twoFactorEnforcement.enabled
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-amber-500/20 text-amber-300'
          }`}>
            {data.twoFactorEnforcement.enabled ? 'إلزامية' : 'غير إلزامية'}
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {data.twoFactorEnforcement.enabled
            ? 'إلزامية على كافة موظفي المنصة. الحساب غير المفعّل لا يستطيع استخدام لوحة التحكم.'
            : 'المصادقة الثنائية غير ملزمة حالياً. يمكن للمالك تفعيل الإلزام من هنا أو من صفحة الفريق.'}
        </p>
        <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1.5">
          <div className="flex justify-between">
            <span>نسبة الامتثال</span>
            <span className={`font-bold ${data.twoFactorEnforcement.totalStaffCount > 0 && data.twoFactorEnforcement.compliantStaffCount === data.twoFactorEnforcement.totalStaffCount ? 'text-emerald-400' : 'text-amber-400'}`}>
              {data.twoFactorEnforcement.compliantStaffCount} / {data.twoFactorEnforcement.totalStaffCount}
            </span>
          </div>
          <button
            disabled={!canManageSecurity}
            onClick={onToggleMfaPolicy}
            className="w-full rounded-lg border border-slate-700 px-3 py-1.5 text-[10.5px] font-bold text-sky-300 transition hover:border-sky-600 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {data.twoFactorEnforcement.enabled ? 'اجعلها اختيارية' : 'اجعلها إلزامية'}
          </button>
        </div>
      </div>

      {/* 2. Cryptographic Signing */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <KeyRound className="h-4 w-4 text-sky-400" />
            محرك التوقيع الرقمي (Ed25519)
          </span>
          <span className="rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold px-2 py-0.5">
            مشفر
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          كافة التراخيص وتكوينات العملاء موقعة تشفيرياً بمفاتيح مركزية مع تدوير دوري لمنع التلاعب.
        </p>
        <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between">
          <span>المفاتيح النشطة</span>
          <span className="text-sky-300 font-bold">{data.signingKeys.length} مفاتيح</span>
        </div>
      </div>

      {/* 3. Incident Readiness */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-amber-400" />
            جاهزية الاستجابة للطوارئ
          </span>
          <span className="rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5">
            Playbook
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          إجراءات احتواء الحوادث الأمنية السريعة متاحة بنقرة واحدة لإنهاء الجلسات أو حظر الـ IP.
        </p>
        <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between">
          <span>الحوادث المفتوحة</span>
          <span
            className={`font-bold ${
              data.activeIncidentsCount === 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {data.activeIncidentsCount}
          </span>
        </div>
      </div>
    </div>

    {/* Quick Active Incidents Banner if any */}
    {data.incidents.filter((i) => i.status !== 'RESOLVED').length > 0 && (
      <div className="rounded-xl border border-rose-800/80 bg-rose-950/30 p-4">
        <h3 className="text-xs font-bold text-rose-300 flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4" />
          حوادث أمنية قيد الاحتواء والتحقيق تتطلب انتباهك:
        </h3>
        <ul className="space-y-2">
          {data.incidents
            .filter((i) => i.status !== 'RESOLVED')
            .map((inc: PlatformCentralSecurityIncident) => (
              <li
                key={inc.id}
                className="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-lg border border-rose-800/50 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-100">{inc.title}</span>
                  <span className="text-slate-400 text-[11px] mr-2">
                    (المصدر: {inc.sourceIp || 'خارجي'})
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canManageSecurity}
                  onClick={() => onRespondIncident(inc.id, true)}
                >
                  إغلاق وحل الحادث
                </Button>
              </li>
            ))}
        </ul>
      </div>
    )}
  </div>
);
