import React from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, inputClass } from '../components/PlatformUI';

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  accountForm: { username: string; email: string; fullName: string; password: string };
  setAccountForm: React.Dispatch<React.SetStateAction<{ username: string; email: string; fullName: string; password: string }>>;
  working: boolean;
  canManageTenants: boolean;
  createAccount: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  open,
  onClose,
  accountForm,
  setAccountForm,
  working,
  canManageTenants,
  createAccount,
}) => (
  <>
      {/* Account creation */}
      <Modal
        open={open}
        onClose={onClose}
        title="إنشاء حساب للعميل"
        description="سيتم إنشاء اسم مستخدم وكلمة مرور مؤقتة وكود تفعيل تسلمه للعميل."
        size="md"
        busy={working}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={working}>إلغاء</Button>
            <Button variant="primary" leadingIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={createAccount} loading={working} disabled={!canManageTenants}>
              إنشاء الحساب
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <Field label="اسم المستخدم" hint="حروف إنجليزية وأرقام فقط، ويُضمن أن يكون فريداً">
            <input className={inputClass} dir="ltr" value={accountForm.username} onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })} />
          </Field>
          <Field label="الاسم الكامل">
            <input className={inputClass} value={accountForm.fullName} onChange={(event) => setAccountForm({ ...accountForm, fullName: event.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني">
            <input className={inputClass} dir="ltr" type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} />
          </Field>
          <Field label="كلمة المرور" hint="اتركها فارغة لتوليد كلمة مرور مؤقتة قوية">
            <input className={inputClass} dir="ltr" type="text" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} />
          </Field>
        </div>
      </Modal>
  </>
);
