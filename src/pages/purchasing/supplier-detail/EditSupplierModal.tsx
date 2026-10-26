import React from 'react';
import { Pencil } from 'lucide-react';
import { EditSupplierFormData } from './types';

export interface EditSupplierModalProps {
  editFormData: EditSupplierFormData;
  onChange: (data: EditSupplierFormData) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const EditSupplierModal: React.FC<EditSupplierModalProps> = ({
  editFormData,
  onChange,
  onClose,
  onSubmit,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
            <Pencil className="w-4 h-4 text-sky-600" />
            <span>تعديل بيانات المورد</span>
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">اسم المورد *</label>
              <input
                type="text"
                required
                value={editFormData.name}
                onChange={(e) => onChange({ ...editFormData, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">اسم الشركة / المصنع</label>
              <input
                type="text"
                value={editFormData.companyName}
                onChange={(e) => onChange({ ...editFormData, companyName: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">الهاتف *</label>
              <input
                type="text"
                required
                value={editFormData.phone}
                onChange={(e) => onChange({ ...editFormData, phone: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">البريد الإلكتروني</label>
              <input
                type="email"
                value={editFormData.email}
                onChange={(e) => onChange({ ...editFormData, email: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">الرقم الضريبي</label>
              <input
                type="text"
                value={editFormData.taxNumber}
                onChange={(e) => onChange({ ...editFormData, taxNumber: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">السجل التجاري</label>
              <input
                type="text"
                value={editFormData.commercialRecord}
                onChange={(e) => onChange({ ...editFormData, commercialRecord: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">فترة السداد (بالأيام)</label>
              <input
                type="number"
                min="0"
                value={editFormData.paymentTermsDays}
                onChange={(e) => onChange({ ...editFormData, paymentTermsDays: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">العنوان</label>
              <input
                type="text"
                value={editFormData.address}
                onChange={(e) => onChange({ ...editFormData, address: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات</label>
            <textarea
              rows={2}
              value={editFormData.notes}
              onChange={(e) => onChange({ ...editFormData, notes: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/20"
            >
              حفظ التعديلات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
