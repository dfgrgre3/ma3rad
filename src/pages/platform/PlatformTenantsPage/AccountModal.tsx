import React from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, inputClass } from '../components/PlatformUI';

export interface AccountFormState {
  username: string;
  email: string;
  fullName: string;
  password: string;
}

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  accountForm: AccountFormState;
  setAccountForm: React.Dispatch<React.SetStateAction<AccountFormState>>;
  working: boolean;
  canManageTenants: boolean;
  /** When true, the modal edits the existing account instead of creating one. */
  editing?: boolean;
  createAccount: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  open,
  onClose,
  accountForm,
  setAccountForm,
  working,
  canManageTenants,
  editing = false,
  createAccount,
}) => (
  <>
      {/* Account creation / editing */}
      <Modal
        open={open}
        onClose={onClose}
        title={editing ? 'تعديل حساب العميل' : 'إنشاء حساب للعميل'}
        description={editing
          ? 'يمكنك تعديل اسم المستخدم والبريد والاسم الكامل، وتعيين كلمة مرور جديدة مباشرة.'
          : 'سيتم إنشاء اسم مستخدم وكلمة مرور مؤقتة وكود تفعيل تسلمه للعميل.'}
        size="md"
        busy={working}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={working}>إلغاء</Button>
            <Button variant="primary" leadingIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={createAccount} loading={working} disabled={!canManageTenants}>
              {editing ? 'حفظ التعديلات' : 'إنشاء الحساب'}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <Field label="اسم المستخدم" hint={editing ? 'حروف إنجليزية وأرقام فقط' : 'حروف إنجليزية وأرقام فقط، ويُضمن أن يكون فريداً'}>
            <input className={inputClass} dir="ltr" value={accountForm.username} onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })} />
          </Field>
          <Field label="الاسم الكامل">
            <input className={inputClass} value={accountForm.fullName} onChange={(event) => setAccountForm({ ...accountForm, fullName: event.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني">
            <input className={inputClass} dir="ltr" type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} />
          </Field>
          <Field label="كلمة المرور" hint={editing
            ? 'اتركها فارغة للإبقاء على كلمة المرور الحالية (8 أحرف على الأقل)'
            : 'اتركها فارغة لتوليد كلمة مرور مؤقتة قوية'}>
            <input className={inputClass} dir="ltr" type="text" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} />
          </Field>
        </div>
      </Modal>
  </>
);
