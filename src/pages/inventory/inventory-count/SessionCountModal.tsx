import React from 'react';
import { CheckCircle2, ClipboardList, Search, X } from 'lucide-react';
import { formatProductQuantity } from '../../../utils/productUnits';
import { fmtCountCurrency } from './helpers';
import type { CountItem, CountSession, VisibleCountItem } from './types';

interface SessionCountModalProps {
  session: CountSession;
  items: CountItem[];
  visibleItems: VisibleCountItem[];
  itemSearch: string;
  onItemSearchChange: (value: string) => void;
  countedItems: number;
  varianceItems: number;
  onCountChange: (index: number, value: string) => void;
  onDiscrepancyReasonChange: (index: number, value: string) => void;
  onNoteChange: (index: number, value: string) => void;
  onSaveDraft: () => void;
  onPost: () => void;
  onClose: () => void;
}

export const SessionCountModal: React.FC<SessionCountModalProps> = ({
  session,
  items,
  visibleItems,
  itemSearch,
  onItemSearchChange,
  countedItems,
  varianceItems,
  onCountChange,
  onDiscrepancyReasonChange,
  onNoteChange,
  onSaveDraft,
  onPost,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-violet-600" />
            <h3 className="text-base font-black text-slate-900">
              جلسة الجرد: {session.code} ({session.warehouse})
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-lg font-black text-slate-900">{countedItems}/{items.length}</div><div className="text-[11px] text-slate-500">أصناف تم جردها</div></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-lg font-black text-amber-600">{Math.max(0, items.length - countedItems)}</div><div className="text-[11px] text-slate-500">أصناف متبقية</div></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-lg font-black text-violet-600">{varianceItems}</div><div className="text-[11px] text-slate-500">فروقات مسجلة</div></div>
          </div>
          <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={itemSearch} onChange={(e) => onItemSearchChange(e.target.value)} placeholder="بحث داخل أصناف الجرد..." className="w-full pr-9 pl-3 py-2 bg-white border border-slate-200 rounded-xl text-sm" /></div>
          <div className="flex items-center justify-between text-xs text-slate-500 bg-white p-3 rounded-lg border border-slate-200">
            <div>النوع: <span className="text-slate-900 font-bold">{session.status === 'POSTED' ? 'مرحل ومعتمد' : 'قيد الجرد الفعلي'}</span></div>
            <div>القائم بالجرد: <span className="text-slate-900 font-bold">{session.countedBy}</span></div>
            <div>التاريخ: <span className="text-slate-900 font-bold font-mono">{session.startDate}</span></div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {['اسم الصنف', 'رصيد النظام', 'الجرد الفعلي', 'الفارق', 'سبب الفارق', 'سعر التكلفة', 'الفارق المالي', 'ملاحظات'].map(h => (
                    <th key={h} className="px-4 py-3 text-right font-bold text-slate-500 border-b border-slate-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visibleItems.map(({ item, index: idx }) => (
                  <tr key={item.id} className="hover:bg-slate-100 transition">
                    <td className="px-4 py-3 text-slate-900 font-semibold">{item.productName}</td>
                    <td className="px-4 py-3 font-mono text-slate-500 font-bold">
                      {session.isBlind && session.status === 'COUNTING' ? (
                        <span className="text-violet-600 bg-violet-50 px-2 py-0.5 rounded text-[10px] border border-violet-200">🔒 مخفي (عدّ أعمى)</span>
                      ) : (
                        formatProductQuantity(item.systemQuantityM2, item)
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {session.status === 'POSTED' ? (
                        <span className="font-mono text-slate-900 font-bold">{formatProductQuantity(Number(item.countedQuantityM2), item)}</span>
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          value={item.countedQuantityM2 ?? ''}
                          onChange={(e) => onCountChange(idx, e.target.value)}
                          placeholder="أدخل الجرد الفعلي"
                          className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono w-28 focus:outline-none focus:border-violet-500 text-slate-900"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold">
                      {session.isBlind && session.status === 'COUNTING' ? (
                        <span className="text-slate-400 text-[11px]">يحتسب بعد الإدخال</span>
                      ) : item.countedQuantityM2 !== null ? (
                        item.varianceM2 > 0 ? (
                          <span className="text-emerald-600">+{formatProductQuantity(item.varianceM2, item)}</span>
                        ) : item.varianceM2 < 0 ? (
                          <span className="text-rose-600">{formatProductQuantity(item.varianceM2, item)}</span>
                        ) : (
                          <span className="text-slate-500">مطابق</span>
                        )
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {item.varianceM2 !== 0 && item.countedQuantityM2 !== null ? (
                        session.status === 'POSTED' ? (
                          <span className="text-xs font-bold text-slate-700">{item.discrepancyReason || 'غير محدد'}</span>
                        ) : (
                          <select
                            value={item.discrepancyReason || ''}
                            onChange={(e) => onDiscrepancyReasonChange(idx, e.target.value)}
                            className="w-28 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 focus:outline-none focus:border-violet-500"
                          >
                            <option value="">-- سبب الفارق --</option>
                            <option value="BREAKAGE">كسر وتلف</option>
                            <option value="THEFT">عجز / فقد</option>
                            <option value="MISCOUNT">خطأ في العد</option>
                            <option value="INPUT_ERROR">خطأ إدخال سابق</option>
                            <option value="SUPPLIER_SHORTAGE">عجز توريد</option>
                            <option value="OTHER">أخرى</option>
                          </select>
                        )
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">{fmtCountCurrency(item.unitCost)}</td>
                    <td className="px-4 py-3 font-mono font-bold">
                      {session.isBlind && session.status === 'COUNTING' ? (
                        <span className="text-slate-400">—</span>
                      ) : item.countedQuantityM2 !== null ? (
                        item.varianceValue > 0 ? (
                          <span className="text-emerald-600">+{fmtCountCurrency(item.varianceValue)}</span>
                        ) : item.varianceValue < 0 ? (
                          <span className="text-rose-600">{fmtCountCurrency(item.varianceValue)}</span>
                        ) : (
                          <span className="text-slate-500">0 ج</span>
                        )
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={item.notes}
                        disabled={session.status === 'POSTED'}
                        onChange={(e) => onNoteChange(idx, e.target.value)}
                        maxLength={250}
                        placeholder="ملاحظة"
                        className="w-28 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs disabled:border-transparent"
                      />
                    </td>
                  </tr>
                ))}
                {visibleItems.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500">لا توجد أصناف تطابق البحث</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between shrink-0">
          <div>
            {session.status !== 'POSTED' && (
              <button
                onClick={onSaveDraft}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition border border-slate-300"
              >
                حفظ كمسودة
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition border border-slate-200"
            >
              إغلاق
            </button>
            {session.status !== 'POSTED' && (
              <button
                onClick={onPost}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                اعتماد وترحيل فروقات الجرد
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
