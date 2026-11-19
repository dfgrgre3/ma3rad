import React from 'react';
import { Paperclip } from 'lucide-react';
import { Modal } from './Modal';

type Props = {
  busy: boolean;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
};

export const AttachmentModal: React.FC<Props> = ({ busy, onFileChange, onClose }) => (
  <Modal title="إرفاق مستند" onClose={onClose}>
    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 hover:border-cyan-500">
      <Paperclip className="h-6 w-6 text-cyan-700" />
      اختر صورة أو مستند (PDF، Excel، Word)، بحد أقصى 5 ميجابايت
      <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFileChange} disabled={busy} className="sr-only" />
    </label>
  </Modal>
);
