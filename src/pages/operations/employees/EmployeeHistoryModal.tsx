import React from 'react';
import { Trash2 } from 'lucide-react';
import { fmtCurrency } from './helpers';
import { TX_TYPES, type FinancialTransaction } from '../../../types/hr/employeesPage';

interface EmployeeHistoryModalProps {
  open: boolean;
  employeeName: string | undefined;
  period: string;
  transactions: FinancialTransaction[];
  netDue: number;
  onClose: () => void;
  onDeleteTransaction: (id: string) => void;
}

export const EmployeeHistoryModal: React.FC<EmployeeHistoryModalProps> = ({
  open,
  employeeName,
  period,
  transactions,
  netDue,
  onClose,
  onDeleteTransaction,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-surface backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-surface-muted px-6 py-4 border-b border-line flex justify-between items-center">
          <div>
            <h2 className="text-sm font-black text-ink">
              حركات العامل خلال الفترة:{' '}
              <span className="text-warning">
                {employeeName}
              </span>
            </h2>
            <p className="text-[10px] text-muted mt-0.5">{period}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink font-bold text-xs"
          >
            إغلاق
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[400px] space-y-3">
          {transactions.length === 0 ? (
            <div className="text-center py-10 text-muted text-xs font-bold">
              لا توجد حركات مالية مسجلة لهذا العامل بعد.
            </div>
          ) : (
            transactions
              .map((t) => {
                const typeDetails = TX_TYPES[t.type];
                return (
                  <div key={t.id} className="bg-surface-muted border border-line p-4 rounded-xl flex items-center justify-between text-xs hover:border-line transition">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded font-bold border text-[10px] ${typeDetails.color}`}>
                        {typeDetails.label}
                      </span>
                      <div>
                        <span className="font-extrabold text-ink text-xs block">{t.notes}</span>
                        <span className="text-muted text-[10px] block mt-0.5">التاريخ: {t.date}</span>
                      </div>
                    </div>
                    <div className="text-left flex items-center gap-3">
                      <span className="font-black text-ink text-sm">{fmtCurrency(t.amount)}</span>
                      <button
                        onClick={() => {
                          if (window.confirm('هل أنت متأكد من حذف هذه المعاملة المالية؟')) {
                            onDeleteTransaction(t.id);
                          }
                        }}
                        className="text-danger hover:text-danger p-1 bg-surface border border-line rounded hover:border-danger/20 transition"
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

        <div className="bg-surface-muted px-6 py-4 border-t border-line flex justify-between items-center text-xs">
          <span className="text-muted font-bold">صافي الحركات في الفترة (تقديري):</span>
          <span className="font-black text-warning text-sm">
            {fmtCurrency(netDue)}
          </span>
        </div>
      </div>
    </div>
  );
};
