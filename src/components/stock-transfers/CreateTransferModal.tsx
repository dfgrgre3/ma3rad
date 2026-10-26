import React from 'react';
import { Plus, X } from 'lucide-react';
import { getProductUnitLabel } from '../../utils/productUnits';
import { resolveQuantityStep } from './helpers';
import type { CreateTransferModalProps } from './types';

export const CreateTransferModal: React.FC<CreateTransferModalProps> = ({
  warehouses,
  allProducts,
  fromWhId,
  toWhId,
  onFromWhChange,
  onToWhChange,
  requestNotes,
  onRequestNotesChange,
  requestItems,
  onRequestItemsChange,
  onAddItemRow,
  onRemoveItemRow,
  onSubmit,
  onClose,
}) => (
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl p-6 w-full max-w-xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
        <h3 className="font-black text-slate-900 text-sm">طلب تحويل مخزني جديد</h3>
        <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-4 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">من مخزن (المصدر)</label>
            <select
              value={fromWhId}
              onChange={(e) => onFromWhChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
              required
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">إلى مخزن (الوجهة)</label>
            <select
              value={toWhId}
              onChange={(e) => onToWhChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
              required
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-700">الأصناف المراد تحويلها</label>
            <button
              type="button"
              onClick={onAddItemRow}
              className="text-xs text-sky-600 font-bold hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> إضافة صنف
            </button>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50/50">
            {requestItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                <select
                  value={item.productId}
                  onChange={(e) => {
                    const next = [...requestItems];
                    next[idx].productId = e.target.value;
                    onRequestItemsChange(next);
                  }}
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                  required
                >
                  {allProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>

                <input
                  type="number"
                  min="0.1"
                  step={resolveQuantityStep(allProducts.find((entry) => entry.id === item.productId))}
                  placeholder={`الكمية ${getProductUnitLabel(allProducts.find((entry) => entry.id === item.productId) || { productType: 'CERAMIC' })}`}
                  value={item.quantityM2}
                  onChange={(e) => {
                    const next = [...requestItems];
                    next[idx].quantityM2 = Number.parseFloat(e.target.value) || 0;
                    onRequestItemsChange(next);
                  }}
                  className="w-24 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center"
                  required
                />

                {requestItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveItemRow(idx)}
                    className="p-1 rounded text-rose-500 hover:bg-rose-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات التحويل</label>
          <textarea
            rows={2}
            value={requestNotes}
            onChange={(e) => onRequestNotesChange(e.target.value)}
            placeholder="سبب التحويل أو بيانات السائق..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="pt-3 border-t border-slate-100 flex gap-2 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black shadow-md shadow-sky-600/20"
          >
            إرسال الطلب للاعتماد
          </button>
        </div>
      </form>
    </div>
  </div>
);
