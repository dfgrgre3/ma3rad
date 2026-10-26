import React from 'react';
import { BookmarkPlus, X } from 'lucide-react';
import type { Product } from '../../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/productUnits';
import type { NewReservationForm, ReservationAvailability, WarehouseOption } from './types';

interface NewReservationModalProps {
  form: NewReservationForm;
  onFormChange: (form: NewReservationForm) => void;
  products: Product[];
  warehouses: WarehouseOption[];
  availability: ReservationAvailability | null;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const NewReservationModal: React.FC<NewReservationModalProps> = ({
  form,
  onFormChange,
  products,
  warehouses,
  availability,
  onSubmit,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BookmarkPlus className="w-5 h-5 text-sky-600" />
            حجز كمية بضاعة بالمخزن
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 mt-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              اختر الصنف *
            </label>
            <select
              required
              value={form.productId}
              onChange={(e) => onFormChange({ ...form, productId: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">-- اختر الصنف --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — {getProductUnitLabel(p)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              المخزن *
            </label>
            <select
              required
              value={form.warehouseId}
              onChange={(e) => onFormChange({ ...form, warehouseId: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">-- اختر المخزن --</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Live Availability Indicator */}
          {availability && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-center text-xs">
              <div>
                <span className="text-slate-500 block">الرصيد الفعلي:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{formatProductQuantity(availability.onHand, products.find((product) => product.id === form.productId) || {})}</span>
              </div>
              <div>
                <span className="text-slate-500 block">المحجوز حالياً:</span>
                <span className="font-bold text-amber-600">{formatProductQuantity(availability.reserved, products.find((product) => product.id === form.productId) || {})}</span>
              </div>
              <div>
                <span className="text-slate-500 block">المتاح للحجز:</span>
                <span className="font-bold text-emerald-600">{formatProductQuantity(availability.available, products.find((product) => product.id === form.productId) || {})}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                الكمية المطلوبة ({products.find((product) => product.id === form.productId) ? getProductUnitLabel(products.find((product) => product.id === form.productId)!) : 'بوحدة الصنف'}) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={form.quantityM2}
                onChange={(e) => onFormChange({ ...form, quantityM2: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                تاريخ انتهاء الحجز
              </label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => onFormChange({ ...form, expiresAt: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                نوع المرجع
              </label>
              <select
                value={form.referenceType}
                onChange={(e) => onFormChange({ ...form, referenceType: e.target.value as NewReservationForm['referenceType'] })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl"
              >
                <option value="MANUAL">حجز يدوي مباشر</option>
                <option value="ORDER">مرتبط بطلب عميل</option>
                <option value="QUOTATION">مرتبط بعرض سعر</option>
                <option value="PROJECT">مرتبط بمشروع</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                رقم أو كود المرجع
              </label>
              <input
                type="text"
                placeholder="مثال: ORD-1025"
                value={form.referenceId}
                onChange={(e) => onFormChange({ ...form, referenceId: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ملاحظات الحجز
            </label>
            <textarea
              rows={2}
              placeholder="سبب الحجز أو اسم العميل أو الملاحظات..."
              value={form.notes}
              onChange={(e) => onFormChange({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow transition flex items-center justify-center gap-1.5"
            >
              <BookmarkPlus className="w-4 h-4" />
              تأكيد حجز الكمية
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
