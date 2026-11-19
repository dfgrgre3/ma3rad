import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { PlatformStaff, PlatformStaffInput, PlatformStaffRole, PlatformStaffRoleDefinition } from '../../../services/domains/platform/platformTypes';
import { inputClass } from '../components/PlatformUI';

interface StaffFormModalProps {
  open: boolean;
  onClose: () => void;
  editingStaff: PlatformStaff | null;
  formData: PlatformStaffInput;
  setFormData: React.Dispatch<React.SetStateAction<PlatformStaffInput>>;
  roles: PlatformStaffRoleDefinition[];
  onSave: () => void;
}

export const StaffFormModal: React.FC<StaffFormModalProps> = ({
  open,
  onClose,
  editingStaff,
  formData,
  setFormData,
  roles,
  onSave,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title={editingStaff ? `تعديل بيانات الموظف: ${editingStaff.fullName}` : 'إضافة موظف جديد للمنصة'}
    size="md"
  >
    <div className="space-y-3.5 text-right">
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">الاسم الكامل *</label>
        <input value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} placeholder="مثلاً: أحمد محمود" className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">البريد الإلكتروني *</label>
          <input type="email" dir="ltr" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="staff@company.com" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">رقم الهاتف (اختياري)</label>
          <input dir="ltr" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="010XXXXXXXX" className={inputClass} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">الدور الإداري *</label>
        <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as PlatformStaffRole })} className={inputClass} disabled={editingStaff?.role === 'SUPER_ADMIN'}>
          {roles.map((role) => (
            <option key={role.role} value={role.role}>{role.title}</option>
          ))}
        </select>
        <p className="text-[10px] text-slate-400 mt-1">{roles.find((r) => r.role === formData.role)?.description}</p>
      </div>
      {!editingStaff && (
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">كلمة المرور الأولية *</label>
          <input type="password" value={formData.password || ''} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="8 أحرف على الأقل — سيُطلب تغييرها عند أول دخول" className={inputClass} autoComplete="new-password" />
        </div>
      )}
      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
        <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} disabled={editingStaff?.role === 'SUPER_ADMIN'} className="rounded border-slate-700 text-sky-500 focus:ring-sky-500" />
        <span>الحساب نشط ويمكنه تسجيل الدخول فوراً</span>
      </label>
      <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
        <Button variant="secondary" size="sm" onClick={onClose}>إلغاء</Button>
        <Button size="sm" onClick={onSave}>{editingStaff ? 'حفظ التعديلات' : 'إضافة الموظف'}</Button>
      </div>
    </div>
  </Modal>
);
