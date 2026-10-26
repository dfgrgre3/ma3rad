import React from 'react';
import { X } from 'lucide-react';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';
import type { ReceiveTransferModalProps } from './types';

export const ReceiveTransferModal: React.FC<ReceiveTransferModalProps> = ({
  transfer,
  items,
  receiptInputs,
  onReceiptInputsChange,
  onSubmit,
  onClose,
}) => (
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
        <div>
          <h3 className="font-black text-slate-900 text-sm">
            استلام شحنة التحويل ({transfer.transferNumber})
          </h3>
          <p className="text-xs text-slate-500">
            من: {transfer.fromWarehouseName} ← إلى: {transfer.toWarehouseName}
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-4 flex-1 overflow-y-auto">
        <div className="space-y-3">
          {items.map((item) => {
            const input = receiptInputs[item.id] || { receivedM2: 0, lostM2: 0, damagedM2: 0, notes: '' };
            return (
              <div key={item.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-black text-slate-900 text-xs">{item.productName} ({item.sku})</span>
                  <span className="font-mono text-xs text-slate-500 font-bold">
                    المشحون: {formatProductQuantity(Number(item.shippedM2 || item.quantityM2), item)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-emerald-700 mb-1">المستلم صالح ({getProductUnitLabel(item)})</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={input.receivedM2}
                      onChange={(e) => {
                        onReceiptInputsChange({
                          ...receiptInputs,
                          [item.id]: { ...input, receivedM2: parseFloat(e.target.value) || 0 }
                        });
                      }}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-center"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-rose-700 mb-1">فقد وعجز ({getProductUnitLabel(item)})</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={input.lostM2}
                      onChange={(e) => {
                        onReceiptInputsChange({
                          ...receiptInputs,
                          [item.id]: { ...input, lostM2: parseFloat(e.target.value) || 0 }
                        });
                      }}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-amber-700 mb-1">كسر وتالف ({getProductUnitLabel(item)})</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={input.damagedM2}
                      onChange={(e) => {
                        onReceiptInputsChange({
                          ...receiptInputs,
                          [item.id]: { ...input, damagedM2: parseFloat(e.target.value) || 0 }
                        });
                      }}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-center"
                    />
                  </div>
                </div>
              </div>
            );
          })}
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
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-600/20"
          >
            تأكيد الاستلام وإضافة الرصيد
          </button>
        </div>
      </form>
    </div>
  </div>
);
