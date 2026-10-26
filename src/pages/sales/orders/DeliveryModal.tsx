import React from 'react';
import { X, PackageCheck, Loader2 } from 'lucide-react';
import { Order, OrderItem } from '../../../services/OrderService';
import { formatProductQuantity } from '../../../utils/productUnits';
import { Modal } from './ui';
import { summarizeOrderQuantity } from './helpers';

interface DeliveryModalProps {
  target: Order;
  lines: Record<string, number>;
  setLines: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  note: string;
  setNote: (value: string) => void;
  saving: boolean;
  batchSummaryItems?: OrderItem[];
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const DeliveryModal: React.FC<DeliveryModalProps> = ({
  target: deliveryTarget, lines: deliveryLines, setLines: setDeliveryLines,
  note: deliveryNote, setNote: setDeliveryNote, saving, batchSummaryItems: detailItems,
  onClose, onSubmit,
}) => (
  <Modal onClose={onClose} wide>
    <form onSubmit={onSubmit} className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
          <PackageCheck className="w-5 h-5 text-sky-600" /> تسجيل تسليم الطلب {deliveryTarget.orderNumber}
        </h3>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
      </div>
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-[11px] text-sky-800">
        يمكن التسليم على دفعات. عدّل الكميات المسلّمة الآن وسيتم خصمها من المتبقي لكل بند.
      </div>
      <div className="border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-right text-[11px] min-w-[620px]">
          <thead className="bg-slate-50 text-slate-500 font-bold">
            <tr>
              <th className="px-3 py-2">الصنف</th>
              <th className="px-3 py-2">المطلوب</th>
              <th className="px-3 py-2">المسلّم سابقاً</th>
              <th className="px-3 py-2">المتبقي</th>
              <th className="px-3 py-2 w-32">تسليم الآن</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(deliveryTarget.items || []).map((item) => {
              const delivered = Number(item.deliveredM2 || 0);
              const remaining = Math.max(0, Number(item.quantityM2) - delivered);
              return (
                <tr key={item.id} className={remaining <= 0 ? 'opacity-50' : ''}>
                  <td className="px-3 py-2 font-bold text-slate-800">{item.productName}<div className="text-[9px] text-slate-400 font-normal">{item.size} • {item.grade}</div></td>
                  <td className="px-3 py-2 font-mono">{formatProductQuantity(Number(item.quantityM2), item)}</td>
                  <td className="px-3 py-2 font-mono text-emerald-600">{delivered.toFixed(2)}</td>
                  <td className="px-3 py-2 font-mono text-amber-600">{remaining.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number" min={0} max={remaining} step="0.01" disabled={remaining <= 0}
                      value={deliveryLines[item.id] ?? ''}
                      onChange={(e) => setDeliveryLines((prev) => ({
                        ...prev,
                        [item.id]: Math.min(remaining, Number(e.target.value) || 0),
                      }))}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono disabled:bg-slate-100"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            const all: Record<string, number> = {};
            (deliveryTarget.items || []).forEach((item) => {
              all[item.id] = Math.max(0, Number(item.quantityM2) - Number(item.deliveredM2 || 0));
            });
            setDeliveryLines(all);
          }}
          className="text-[11px] font-bold text-sky-600 hover:text-sky-700"
        >
          تسليم كل المتبقي
        </button>
        <span className="text-[11px] font-bold text-slate-500">
          إجمالي هذه الدفعة: {summarizeOrderQuantity(
            (detailItems || []).map((item) => ({ ...item, deliveredM2: Number(deliveryLines[item.id]) || 0 })),
            'deliveredM2'
          )}
        </span>
      </div>
      <div>
        <label className="font-bold text-slate-700 block mb-1">ملاحظات التسليم</label>
        <input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="مندوب التسليم / رقم السيارة / ملاحظات..." className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
        <button type="submit" disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ التسليم
        </button>
      </div>
    </form>
  </Modal>
);
