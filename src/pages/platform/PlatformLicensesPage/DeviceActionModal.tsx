import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';

export interface DeviceActionTarget {
  id: string;
  hardwareId: string;
  tenantId: string;
  status: string;
}

export type DeviceAction = 'suspend' | 'release' | 'revoke';

interface DeviceActionModalProps {
  target: DeviceActionTarget | null;
  action: DeviceAction | null;
  canManage: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ACTION_LABELS: Record<DeviceAction, { title: string; confirm: string; description: string }> = {
  suspend: { title: 'إيقاف الجهاز', confirm: 'تأكيد الإيقاف', description: 'إيقاف الجهاز مؤقتاً دون تحرير مقعده من الترخيص.' },
  release: { title: 'تحرير الجهاز', confirm: 'تأكيد التحرير', description: 'تحرير الجهاز من الترخيص وإتاحة المقعد لجهاز آخر.' },
  revoke: { title: 'إلغاء الجهاز', confirm: 'تأكيد الإلغاء', description: 'إلغاء الجهاز نهائياً واعتباره مشتبهًا به.' },
};

export const DeviceActionModal: React.FC<DeviceActionModalProps> = ({ target, action, canManage, onClose, onConfirm }) => {
  const meta = action ? ACTION_LABELS[action] : null;
  return (
    <Modal
      open={Boolean(target && action)}
      onClose={onClose}
      title={meta?.title ?? ''}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="danger" onClick={onConfirm} disabled={!canManage}>
            {meta?.confirm}
          </Button>
        </div>
      }
    >
      {target && meta && (
        <>
          <p className="text-[11px] text-ink-secondary mb-3">
            الجهاز: <span className="font-mono text-[10px] text-ink" dir="ltr">{target.hardwareId}</span>
          </p>
          <p className="text-[11px] text-ink-secondary mb-1">{meta.description}</p>
        </>
      )}
    </Modal>
  );
};
