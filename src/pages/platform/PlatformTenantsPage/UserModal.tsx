import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, inputClass } from '../components/PlatformUI';

interface UserModalProps {
  open: boolean;
  onClose: () => void;
  editingUser: any;
  userForm: { fullName: string; username: string; email: string; phone: string; role: string; status: string; notes: string };
  setUserForm: React.Dispatch<React.SetStateAction<{ fullName: string; username: string; email: string; phone: string; role: string; status: string; notes: string }>>;
  working: boolean;
  canManageTenants: boolean;
  saveUser: () => void;
}

export const UserModal: React.FC<UserModalProps> = ({
  open,
  onClose,
  editingUser,
  userForm,
  setUserForm,
  working,
  canManageTenants,
  saveUser,
}) => (
  <>
      {/* User directory */}
      <Modal
        open={open}
        onClose={onClose}
        title={editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم للعميل'}
        description="سجّل مستخدمي العميل (مسؤول، كاشير، ...) لإدارتهم من لوحة المنصة."
        size="md"
        busy={working}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={working}>إلغاء</Button>
            <Button variant="primary" onClick={saveUser} loading={working} disabled={!canManageTenants}>{editingUser ? 'حفظ' : 'إضافة'}</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم الكامل" required>
            <input className={inputClass} value={userForm.fullName} onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })} />
          </Field>
          <Field label="اسم المستخدم">
            <input className={inputClass} dir="ltr" value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني">
            <input className={inputClass} dir="ltr" type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} />
          </Field>
          <Field label="الهاتف">
            <input className={inputClass} dir="ltr" value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} />
          </Field>
          <Field label="الدور">
            <input className={inputClass} value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })} placeholder="ADMIN / CASHIER / USER" />
          </Field>
          <Field label="الحالة">
            <select className={inputClass} value={userForm.status} onChange={(event) => setUserForm({ ...userForm, status: event.target.value })}>
              <option value="ACTIVE">نشط</option>
              <option value="SUSPENDED">موقوف</option>
              <option value="INVITED">مدعو</option>
            </select>
          </Field>
          <Field label="ملاحظات" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} value={userForm.notes} onChange={(event) => setUserForm({ ...userForm, notes: event.target.value })} />
          </Field>
        </div>
      </Modal>
  </>
);
