import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { inputClass } from '../components/PlatformUI';

interface RemoteSessionModalProps {
  open: boolean;
  onClose: () => void;
  technicianName: string;
  setTechnicianName: (v: string) => void;
  sessionDuration: number;
  setSessionDuration: (v: number) => void;
  canManageSupport: boolean;
  onSubmit: () => void;
}

export const RemoteSessionModal: React.FC<RemoteSessionModalProps> = ({
  open,
  onClose,
  technicianName,
  setTechnicianName,
  sessionDuration,
  setSessionDuration,
  canManageSupport,
  onSubmit,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="بدء جلسة وصول عن بُعد"
  >
    <div className="space-y-3.5 text-right">
      <p className="text-xs text-muted">
        سيتم إبلاغ العميل ببدء الجلسة. يجب الحصول على موافقة العميل خطيًا قبل البدء. تُسجَّل كل الجلسات في سجل التدقيق الأمني للمنصة.
      </p>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1">اسم الفني / المسؤول</label>
        <input
          type="text"
          value={technicianName}
          onChange={(e) => setTechnicianName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1">مدة الجلسة (بالدقائق)</label>
        <input
          type="number"
          value={sessionDuration}
          onChange={(e) => setSessionDuration(Number(e.target.value))}
          min={15}
          max={180}
          className={inputClass}
        />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
        <Button variant="secondary" size="sm" onClick={onClose}>
          إلغاء
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={!canManageSupport}>
          بدء جلسة الاتصال
        </Button>
      </div>
    </div>
  </Modal>
);
