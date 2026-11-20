import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { inputClass } from '../components/PlatformUI';

interface MfaDisableModalProps {
  open: boolean;
  onClose: () => void;
  mfaDisableCode: string;
  setMfaDisableCode: (v: string) => void;
  onDisable: () => void;
}

export const MfaDisableModal: React.FC<MfaDisableModalProps> = ({
  open,
  onClose,
  mfaDisableCode,
  setMfaDisableCode,
  onDisable,
}) => (
  <Modal open={open} onClose={onClose} title="تعطيل المصادقة الثنائية" size="sm">
    <div className="space-y-3.5 text-right">
      <p className="text-[11px] text-warning">تعطيل المصادقة الثنائية يُضعف حماية حسابك. أدخل الرمز الحالي من تطبيق المصادقة للتأكيد.</p>
      <input
        value={mfaDisableCode}
        onChange={(e) => setMfaDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        inputMode="numeric"
        dir="ltr"
        className={`${inputClass} text-center font-mono tracking-[0.3em]`}
      />
      <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
        <Button variant="secondary" size="sm" onClick={onClose}>إلغاء</Button>
        <Button variant="danger" size="sm" onClick={onDisable} disabled={mfaDisableCode.length !== 6}>تعطيل</Button>
      </div>
    </div>
  </Modal>
);
