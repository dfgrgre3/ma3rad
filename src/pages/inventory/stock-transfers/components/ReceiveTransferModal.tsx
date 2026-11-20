import React from 'react';
import { X } from 'lucide-react';
import { formatProductQuantity, getProductUnitLabel } from '../../../../utils/products/productUnits';
import type { ReceiveTransferModalProps } from '../../../../types/inventory/stockTransfers';

export const ReceiveTransferModal: React.FC<ReceiveTransferModalProps> = ({
  transfer,
  items,
  receiptInputs,
  onReceiptInputsChange,
  onSubmit,
  onClose,
}) => (
  <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-surface rounded-3xl p-6 w-full max-w-2xl shadow-2xl border border-line max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-line shrink-0">
        <div>
          <h3 className="font-black text-ink text-sm">
            استلام شحنة التحويل ({transfer.transferNumber})
          </h3>
          <p className="text-xs text-muted">
            من: {transfer.fromWarehouseName} ← إلى: {transfer.toWarehouseName}
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-muted hover:bg-surface-sunken">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-4 flex-1 overflow-y-auto">
        <div className="space-y-3">
          {items.map((item) => {
            const input = receiptInputs[item.id] || { receivedM2: 0, lostM2: 0, damagedM2: 0, notes: '' };
            return (
              <div key={item.id} className="p-3 bg-surface-muted rounded-2xl border border-line">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-black text-ink text-xs">{item.productName} ({item.sku})</span>
                  <span className="font-mono text-xs text-muted font-bold">
                    المشحون: {formatProductQuantity(Number(item.shippedM2 || item.quantityM2), item)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-success mb-1">المستلم صالح ({getProductUnitLabel(item)})</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={input.receivedM2}
                      onChange={(e) => {
                        onReceiptInputsChange({
                          ...receiptInputs,
                          [item.id]: { ...input, receivedM2: Number.parseFloat(e.target.value) || 0 }
                        });
                      }}
                      className="w-full px-2 py-1.5 bg-surface border border-line rounded-lg text-xs font-mono font-bold text-center"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-danger mb-1">فقد وعجز ({getProductUnitLabel(item)})</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={input.lostM2}
                      onChange={(e) => {
                        onReceiptInputsChange({
                          ...receiptInputs,
                          [item.id]: { ...input, lostM2: Number.parseFloat(e.target.value) || 0 }
                        });
                      }}
                      className="w-full px-2 py-1.5 bg-surface border border-line rounded-lg text-xs font-mono font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-warning mb-1">كسر وتالف ({getProductUnitLabel(item)})</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={input.damagedM2}
                      onChange={(e) => {
                        onReceiptInputsChange({
                          ...receiptInputs,
                          [item.id]: { ...input, damagedM2: Number.parseFloat(e.target.value) || 0 }
                        });
                      }}
                      className="w-full px-2 py-1.5 bg-surface border border-line rounded-lg text-xs font-mono font-bold text-center"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-line flex gap-2 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-line text-xs font-bold text-ink-secondary hover:bg-surface-muted"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-success hover:bg-success text-white text-xs font-black shadow-md shadow-success/20"
          >
            تأكيد الاستلام وإضافة الرصيد
          </button>
        </div>
      </form>
    </div>
  </div>
);
