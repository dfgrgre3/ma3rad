import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, inputClass } from '../components/PlatformUI';
import type { PlatformRelease } from '../../../services/domains/platform/platformTypes';

interface RollbackModalProps {
  open: boolean;
  onClose: () => void;
  release: PlatformRelease | null;
  safeRollbackVersion: string;
  setSafeRollbackVersion: (v: string) => void;
  saving: boolean;
  canManageProduct: boolean;
  onConfirm: () => void;
}

export const RollbackModal: React.FC<RollbackModalProps> = ({
  open,
  onClose,
  release,
  safeRollbackVersion,
  setSafeRollbackVersion,
  saving,
  canManageProduct,
  onConfirm,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="تراجع طارئ عن الإصدار (Emergency Rollback)"
    size="md"
    busy={saving}
    footer={
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          إلغاء
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={saving} disabled={!canManageProduct}>
          تأكيد التراجع الآن
        </Button>
      </div>
    }
  >
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
        <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-rose-600" />
        <div className="text-[11.5px] leading-relaxed">
          <p className="font-bold">تحذير أمان عالي:</p>
          سيؤدي هذا الإجراء إلى إيقاف الإصدار <span className="font-mono font-bold">v{release?.version}</span> فوراً
          وتحويل حالته إلى متوقف (DEPRECATED)، وتوجيه أجهزة العملاء المستهدفة للرجوع للنسخة الآمنة.
        </div>
      </div>

      <Field label="رقم الإصدار الآمن المراد الرجوع إليه" required>
        <input
          dir="ltr"
          placeholder="مثال: 2.4.9"
          className={inputClass}
          value={safeRollbackVersion}
          onChange={(e) => setSafeRollbackVersion(e.target.value)}
        />
      </Field>
    </div>
  </Modal>
);
