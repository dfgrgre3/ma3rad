import React from 'react';
import { DEFAULT_LOCATIONS, type Employee, type EmployeeFormState } from './types';

interface EmployeeFormModalProps {
  open: boolean;
  editingEmployee: Employee | null;
  form: EmployeeFormState;
  onFormChange: React.Dispatch<React.SetStateAction<EmployeeFormState>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({
  open,
  editingEmployee,
  form,
  onFormChange,
  onClose,
  onSubmit,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200" dir="rtl">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-sm font-black text-slate-900">
            {editingEmployee ? 'تعديل بيانات العامل / الموظف' : 'إضافة عامل / موظف جديد'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 font-bold text-xs"
          >
            إغلاق
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">الاسم بالكامل *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => onFormChange(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                placeholder="مثال: أحمد محمد علي"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">موقع العمل *</label>
              <select
                value={form.location}
                onChange={(e) => onFormChange(prev => ({ ...prev, location: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
              >
                {DEFAULT_LOCATIONS.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">المسمى الوظيفي *</label>
              <input
                type="text"
                required
                value={form.role}
                onChange={(e) => onFormChange(prev => ({ ...prev, role: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                placeholder="مثال: أمين مستودع، كاشير"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">رقم الهاتف *</label>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(e) => onFormChange(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                placeholder="01xxxxxxxxx"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">البريد الإلكتروني</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => onFormChange(prev => ({ ...prev, email: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
                placeholder="name@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">تاريخ التعيين / الالتحاق</label>
              <input
                type="date"
                value={form.joinedDate}
                onChange={(e) => onFormChange(prev => ({ ...prev, joinedDate: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">الراتب الأساسي *</label>
              <input
                type="number"
                required
                min={0}
                value={form.baseSalary}
                onChange={(e) => onFormChange(prev => ({ ...prev, baseSalary: Number(e.target.value) }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-bold focus:outline-none focus:border-orange-500/50 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">دورة الاحتساب *</label>
              <select
                value={form.salaryType}
                onChange={(e) => onFormChange(prev => ({ ...prev, salaryType: e.target.value as Employee['salaryType'] }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
              >
                <option value="MONTHLY">شهرياً (ثابت)</option>
                <option value="DAILY">يومي (يوميات)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">الحالة الإدارية *</label>
              <select
                value={form.status}
                onChange={(e) => onFormChange(prev => ({ ...prev, status: e.target.value as Employee['status'] }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
              >
                <option value="ACTIVE">على رأس العمل</option>
                <option value="ON_LEAVE">في إجازة</option>
                <option value="SUSPENDED">موقوف مؤقتاً</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-bold transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-orange-700 hover:bg-orange-600 text-slate-900 rounded-xl text-xs font-bold shadow-lg transition"
            >
              {editingEmployee ? 'حفظ التغييرات' : 'إضافة العامل'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
