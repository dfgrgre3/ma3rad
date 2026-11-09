import React from 'react';
import { KeyRound } from 'lucide-react';
import { Modal } from './Modal';
import { FormField } from './FormField';
import { Button } from './Button';

interface Props {
  current: string;
  next: string;
  confirm: string;
  busy: boolean;
  setCurrent: (value: string) => void;
  setNext: (value: string) => void;
  setConfirm: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}

export const ChangePasswordModal: React.FC<Props> = ({
  current,
  next,
  confirm,
  busy,
  setCurrent,
  setNext,
  setConfirm,
  onClose,
  onSubmit,
}) => (
  <Modal
    open
    onClose={onClose}
    busy={busy}
    size="sm"
    icon={<KeyRound className="h-4 w-4" />}
    title="تغيير كلمة المرور"
    description="كلمة المرور الحالية مطلوبة لتأكيد التغيير."
    footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={busy}>إلغاء</Button>
        <Button variant="primary" type="submit" form="change-password-form" loading={busy}>
          حفظ كلمة المرور
        </Button>
      </>
    }
  >
    <form id="change-password-form" onSubmit={onSubmit} className="space-y-3">
      <FormField label="كلمة المرور الحالية" required>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
          className="win-input"
        />
      </FormField>
      <FormField label="كلمة المرور الجديدة" required hint="6 أحرف على الأقل.">
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          required
          minLength={6}
          className="win-input"
        />
      </FormField>
      <FormField label="تأكيد كلمة المرور" required>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
          minLength={6}
          className="win-input"
        />
      </FormField>
    </form>
  </Modal>
);

export default ChangePasswordModal;
