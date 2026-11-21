import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, inputClass } from '../components/PlatformUI';
import type { PlatformLicense, PlatformCouplingMode } from '../../../services/domains/platform/platformTypes';
import { COUPLING_LABELS, clampInt } from './licenseData';

export interface LicenseUpdatePayload {
  seats: number;
  deviceLimit: number;
  branchesLimit: number;
  offlineGracePeriodDays: number;
  notes: string;
  couplingMode: PlatformCouplingMode;
}

interface EditLicenseModalProps {
  license: PlatformLicense | null;
  saving: boolean;
  canManage: boolean;
  onClose: () => void;
  onSave: (payload: LicenseUpdatePayload) => void;
}

export const EditLicenseModal: React.FC<EditLicenseModalProps> = ({ license, saving, canManage, onClose, onSave }) => {
  const [form, setForm] = React.useState<LicenseUpdatePayload>({
    seats: 1,
    deviceLimit: 1,
    branchesLimit: 1,
    offlineGracePeriodDays: 14,
    notes: '',
    couplingMode: 'FULL',
  });

  React.useEffect(() => {
    if (license) {
      setForm({
        seats: license.seats,
        deviceLimit: license.deviceLimit,
        branchesLimit: license.branchesLimit,
        offlineGracePeriodDays: license.offlineGracePeriodDays ?? 14,
        notes: license.notes ?? '',
        couplingMode: (license.couplingMode ?? 'FULL') as PlatformCouplingMode,
      });
    }
  }, [license]);

  return (
    <Modal
      open={Boolean(license)}
      onClose={onClose}
      title="تعديل الترخيص"
      description={license ? `تعديل حدود وتفاصيل ترخيص ${license.licenseKey}` : undefined}
      size="md"
      busy={saving}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button variant="primary" onClick={() => license && onSave(form)} loading={saving} disabled={!canManage || !license}>
            حفظ التعديلات
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عدد المستخدمين">
          <input type="number" min={1} className={inputClass} value={form.seats} onChange={(event) => setForm({ ...form, seats: clampInt(event.target.value, 1) })} />
        </Field>
        <Field label="الحد الأقصى للأجهزة">
          <input type="number" min={1} className={inputClass} value={form.deviceLimit} onChange={(event) => setForm({ ...form, deviceLimit: clampInt(event.target.value, 1) })} />
        </Field>
        <Field label="الفروع المسموح بها">
          <input type="number" min={1} className={inputClass} value={form.branchesLimit} onChange={(event) => setForm({ ...form, branchesLimit: clampInt(event.target.value, 1) })} />
        </Field>
        <Field label="فترة السماح أوفلاين (أيام)">
          <input type="number" min={0} className={inputClass} value={form.offlineGracePeriodDays} onChange={(event) => setForm({ ...form, offlineGracePeriodDays: clampInt(event.target.value, 0) })} />
        </Field>
        <Field label="نوع الربط بالاشتراك" className="sm:col-span-2">
          <select className={inputClass} value={form.couplingMode} onChange={(event) => setForm({ ...form, couplingMode: event.target.value as PlatformCouplingMode })}>
            {(Object.keys(COUPLING_LABELS) as PlatformCouplingMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {mode === 'FULL' ? 'كامل (المزامنة التلقائية)' : mode === 'EXPIRY_ONLY' ? 'انتهاء الصلاحية فقط' : 'مستقل تماماً'} — {COUPLING_LABELS[mode]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ملاحظات" className="sm:col-span-2">
          <textarea rows={2} className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
      </div>
      {license && (
        <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-[11px] text-ink-secondary">
          سنكون {license.tenantName ?? 'العميل'} — الحدود الجديدة ستُزامَن مع ملف العميل.
        </p>
      )}
    </Modal>
  );
};
