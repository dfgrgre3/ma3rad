import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { PlatformStaff } from '../../../services/domains/platform/platformTypes';
import { inputClass } from '../components/PlatformUI';

interface TransferPermissionsModalProps {
  from: PlatformStaff | null;
  onClose: () => void;
  staffList: PlatformStaff[];
  transferToId: string;
  setTransferToId: (v: string) => void;
  transferNote: string;
  setTransferNote: (v: string) => void;
  onSubmit: () => void;
}

export const TransferPermissionsModal: React.FC<TransferPermissionsModalProps> = ({
  from,
  onClose,
  staffList,
  transferToId,
  setTransferToId,
  transferNote,
  setTransferNote,
  onSubmit,
}) => (
  <Modal open={Boolean(from)} onClose={onClose} title={`نقل صلاحيات "${from?.fullName ?? ''}"`} size="md">
    <div className="space-y-3.5 text-right">
      <p className="text-[11px] text-muted">سيُنسخ الدور وتجاوزات الصلاحيات ونطاق البيانات إلى الموظف الهدف، وستُنهى جلساته الحالية. يبقى حساب المصدر كما هو ويمكن تجميده بعد النقل.</p>
      <div>
        <label className="block text-xs font-semibold text-muted mb-1">الموظف الهدف *</label>
        <select value={transferToId} onChange={(e) => setTransferToId(e.target.value)} className={inputClass}>
          <option value="">اختر موظفاً...</option>
          {staffList.filter((s) => s.id !== from?.id).map((s) => (
            <option key={s.id} value={s.id}>{s.fullName} — {s.role}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-muted mb-1">ملاحظة (تُسجل في سجل التدقيق)</label>
        <input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="مثال: نقل مسؤولية الفوترة بعد استقالة الموظف" className={inputClass} />
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
        <Button variant="secondary" size="sm" onClick={onClose}>إلغاء</Button>
        <Button size="sm" onClick={onSubmit} disabled={!transferToId}>نقل الصلاحيات</Button>
      </div>
    </div>
  </Modal>
);
