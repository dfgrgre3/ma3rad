import React from 'react';
import { Smartphone, ShieldOff, QrCode, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { PlatformStaff } from '../../../services/domains/platform/platformTypes';

interface MfaStatus {
  enabled: boolean;
  enforcement: 'off' | 'optional' | 'required';
}

interface MfaCompliance {
  enforcement: string;
  total: number;
  compliant: number;
  missing: PlatformStaff[];
}

interface SecurityTabProps {
  mfaStatus: MfaStatus;
  mfaCompliance: MfaCompliance;
  canManageSecurity: boolean;
  canResetPassword: boolean;
  onRequestDisableMfa: () => void;
  onStartEnrollment: () => void;
  onSetEnforcement: (policy: 'off' | 'optional' | 'required') => void;
  onResetStaffMfa: (staff: PlatformStaff) => void;
}

export const SecurityTab: React.FC<SecurityTabProps> = ({
  mfaStatus,
  mfaCompliance,
  canManageSecurity,
  canResetPassword,
  onRequestDisableMfa,
  onStartEnrollment,
  onSetEnforcement,
  onResetStaffMfa,
}) => (
  <>
    {/* My MFA card */}
    <div className="rounded-xl border border-line-strong bg-primary/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-muted flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" /> المصادقة الثنائية (TOTP) لحسابك</p>
          <p className="mt-1 text-[11px] text-muted">تعمل مع Google Authenticator وAuthy و1Password وغيرها. رموز الاسترداد تُنشأ مرة واحدة فقط.</p>
          <p className="mt-2 text-xs font-bold">
            الحالة الحالية:{' '}
            {mfaStatus.enabled
              ? <span className="text-success">مفعّلة</span>
              : <span className="text-warning">غير مفعّلة</span>}
            {' · '}سياسة المنصة:{' '}
            <span className="text-muted">{mfaStatus.enforcement === 'required' ? 'إلزامية للجميع' : mfaStatus.enforcement === 'optional' ? 'اختيارية' : 'متوقفة'}</span>
          </p>
        </div>
        {mfaStatus.enabled ? (
          <Button variant="ghost" size="sm" onClick={onRequestDisableMfa} leadingIcon={<ShieldOff className="h-4 w-4" />}>
            تعطيل المصادقة الثنائية
          </Button>
        ) : (
          <Button size="sm" onClick={onStartEnrollment} leadingIcon={<QrCode className="h-4 w-4" />}>
            تفعيل المصادقة الثنائية
          </Button>
        )}
      </div>
    </div>

    {/* Enforcement policy + compliance */}
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-line-strong bg-primary/70 p-5">
        <p className="text-xs font-black text-muted">سياسة المصادقة الثنائية للمؤسسة</p>
        <p className="mt-1 text-[10.5px] text-muted">تحديد من يُطلب منه تفعيل المصادقة الثنائية قبل استخدام أي شاشة في المنصة.</p>
        <div className="mt-3 space-y-2">
          {([
            { value: 'off', label: 'متوقفة', desc: 'لا يُطلب من أحد — للموازنة فقط.' },
            { value: 'optional', label: 'اختيارية', desc: 'كل موظف يختار تفعيلها بنفسه.' },
            { value: 'required', label: 'إلزامية', desc: 'كل موظف يجب أن يفعّلها قبل الوصول إلى المنصة.' },
          ] as const).map((option) => (
            <button
              key={option.value}
              disabled={!canManageSecurity}
              onClick={() => onSetEnforcement(option.value)}
              className={`w-full rounded-xl border px-4 py-3 text-right transition-all ${
                mfaStatus.enforcement === option.value
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                  : 'border-line-strong hover:border-line-strong'
              } ${!canManageSecurity ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-muted">{option.label}</span>
                <span className={`h-3.5 w-3.5 rounded-full border ${mfaStatus.enforcement === option.value ? 'border-primary bg-primary' : 'border-line-strong'}`} />
              </div>
              <p className="mt-1 text-[10px] text-muted">{option.desc}</p>
            </button>
          ))}
        </div>
        {!canManageSecurity && <p className="mt-2 text-[10px] text-ink-secondary">تعديل السياسة يتطلب صلاحية platform.security.update.</p>}
      </div>

      <div className="rounded-xl border border-line-strong bg-primary/70 p-5">
        <p className="text-xs font-black text-muted">اكتمال الامتثال</p>
        <div className="mt-3 flex items-end gap-3">
          <span className="text-4xl font-black text-muted">{mfaCompliance.compliant}</span>
          <span className="text-xs text-muted pb-1.5">من {mfaCompliance.total} موظفاً يفعّلون المصادقة الثنائية</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-primary">
          <div
            className="h-full rounded-full bg-gradient-to-l from-success to-success transition-all"
            style={{ width: `${mfaCompliance.total ? Math.round((mfaCompliance.compliant / mfaCompliance.total) * 100) : 0}%` }}
          />
        </div>
        {mfaCompliance.missing.length > 0 ? (
          <div className="mt-4">
            <p className="text-[10.5px] font-bold text-warning mb-1.5">لم يفعّلوا بعد ({mfaCompliance.missing.length}):</p>
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {mfaCompliance.missing.map((staff) => (
                <li key={staff.id} className="flex items-center justify-between gap-2 rounded-lg border border-line-strong bg-primary/40 px-3 py-1.5">
                  <span className="text-[10.5px] text-muted">{staff.fullName} <span dir="ltr" className="text-ink-secondary">{staff.email}</span></span>
                  {canResetPassword && (
                    <button onClick={() => onResetStaffMfa(staff)} className="text-[10px] font-bold text-danger hover:text-danger whitespace-nowrap">
                      إعادة تعيين MFA
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-[11px] font-bold text-success"><CheckCircle2 className="h-4 w-4" /> كل الموظفين يفعّلون المصادقة الثنائية.</p>
        )}
      </div>
    </div>
  </>
);
