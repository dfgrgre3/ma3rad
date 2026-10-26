import React from 'react';
import { Trash2 } from 'lucide-react';
import { fmtCurrency } from './helpers';
import { TX_TYPES, type FinancialTransaction } from './types';

interface EmployeeHistoryModalProps {
  open: boolean;
  employeeName: string | undefined;
  transactions: FinancialTransaction[];
  netDue: number;
  onClose: () => void;
  onDeleteTransaction: (id: string) => void;
}

export const EmployeeHistoryModal: React.FC<EmployeeHistoryModalProps> = ({
  open,
  employeeName,
  transactions,
  netDue,
  onClose,
  onDeleteTransaction,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200" dir="rtl">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-black text-slate-900">
              السجل المالي التفصيلي للعامل:{' '}
              <span className="text-orange-600">
                {employeeName}
              </span>
            </h2>
            <p className="text-[10px] text-slate-500 mt-0.5">كافة العمليات والدفعات المالية المسجلة على الحساب</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 font-bold text-xs"
          >
            إغلاق
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[400px] space-y-3">
          {transactions.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs font-bold">
              لا توجد حركات مالية مسجلة لهذا العامل بعد.
            </div>
          ) : (
            transactions
              .map((t) => {
                const typeDetails = TX_TYPES[t.type];
                return (
                  <div key={t.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between text-xs hover:border-slate-200 transition">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded font-bold border text-[10px] ${typeDetails.color}`}>
                        {typeDetails.label}
                      </span>
                      <div>
                        <span className="font-extrabold text-slate-900 text-xs block">{t.notes}</span>
                        <span className="text-slate-500 text-[10px] block mt-0.5">التاريخ: {t.date}</span>
                      </div>
                    </div>
                    <div className="text-left flex items-center gap-3">
                      <span className="font-black text-slate-800 text-sm">{fmtCurrency(t.amount)}</span>
                      <button
                        onClick={() => {
                          if (window.confirm('هل أنت متأكد من حذف هذه المعاملة المالية؟')) {
                            onDeleteTransaction(t.id);
                          }
                        }}
                        className="text-rose-500 hover:text-rose-600 p-1 bg-white border border-slate-200 rounded hover:border-rose-500/20 transition"
                        title="حذف القيد"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
          )}
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center text-xs">
          <span className="text-slate-500 font-bold">الحساب الحالي:</span>
          <span className="font-black text-orange-600 text-sm">
            {fmtCurrency(netDue)}
          </span>
        </div>
      </div>
    </div>
  );
};
