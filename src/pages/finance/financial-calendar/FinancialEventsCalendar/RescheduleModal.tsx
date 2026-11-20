import React from 'react';
import { Modal } from './Modal';

type Props = {
  date: string;
  busy: boolean;
  onDateChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
};

export const RescheduleModal: React.FC<Props> = ({
  date,
  busy,
  onDateChange,
  onSubmit,
  onClose,
}) => (
  <Modal title="تأجيل تاريخ الاستحقاق" onClose={onClose}>
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm font-semibold">تاريخ الاستحقاق الجديد
        <input required type="date" value={date} onChange={(event) => onDateChange(event.target.value)} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm">إلغاء</button>
        <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">حفظ الموعد</button>
      </div>
    </form>
  </Modal>
);
