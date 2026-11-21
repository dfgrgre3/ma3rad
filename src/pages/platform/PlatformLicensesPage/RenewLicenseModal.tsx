import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, formatDate, inputClass } from '../components/PlatformUI';
import type { PlatformLicense } from '../../../services/domains/platform/platformTypes';
import { clampInt } from './licenseData';

interface RenewLicenseModalProps {
  license: PlatformLicense | null;
  months: number;
  onMonthsChange: (months: number) => void;
  canManage: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const RenewLicenseModal: React.FC<RenewLicenseModalProps> = ({ license, months, onMonthsChange, canManage, onClose, onConfirm }) => (
  <Modal
    open={Boolean(license)}
    onClose={onClose}
    title="تجديد الترخيص"
    description={license ? `تجديد ترخيص ${license.tenantName ?? ''} منذ تاريخ الانتهاء الحالي.` : undefined}
    size="sm"
    footer={
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        <Button variant="primary" onClick={onConfirm} disabled={!canManage}>تجديد</Button>
      </div>
    }
  >
    <Field label="المدة (أشهر)">
      <input type="number" min={1} className={inputClass} value={months} onChange={(event) => onMonthsChange(clampInt(event.target.value, 1))} />
    </Field>
    {license && (
      <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-[11px] text-ink-secondary">
        ينتهي حالياً في <b>{formatDate(license.expiresAt)}</b>
      </p>
    )}
  </Modal>
);
