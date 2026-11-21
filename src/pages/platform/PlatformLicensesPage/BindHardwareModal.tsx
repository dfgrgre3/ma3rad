import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, formatDateTime, inputClass } from '../components/PlatformUI';
import type { PlatformLicense } from '../../../services/domains/platform/platformTypes';

interface BindHardwareModalProps {
  license: PlatformLicense | null;
  hardwareId: string;
  onHardwareIdChange: (value: string) => void;
  canManage: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const BindHardwareModal: React.FC<BindHardwareModalProps> = ({ license, hardwareId, onHardwareIdChange, canManage, onClose, onConfirm }) => (
  <Modal
    open={Boolean(license)}
    onClose={onClose}
    title="ربط الترخيص بجهاز"
    description="أدخل معرف الجهاز (Hardware ID) لتقييد الترخيص به، أو اتركه فارغاً لفك الربط."
    size="sm"
    footer={
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        <Button variant="primary" onClick={onConfirm} disabled={!canManage}>
          {hardwareId.trim() ? 'حفظ الربط' : 'فك الربط'}
        </Button>
      </div>
    }
  >
    <Field label="معرف الجهاز" hint="اتركه فارغاً لإلغاء الربط">
      <input dir="ltr" className={inputClass} value={hardwareId} onChange={(event) => onHardwareIdChange(event.target.value)} placeholder="HWID-..." />
    </Field>
    {license && (
      <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 font-mono text-[11px] text-ink-secondary" dir="ltr">
        {license.licenseKey}
      </p>
    )}
    <p className="mt-3 text-[10.5px] text-muted">
      آخر تحديث: {formatDateTime(license?.updatedAt)}
    </p>
  </Modal>
);
