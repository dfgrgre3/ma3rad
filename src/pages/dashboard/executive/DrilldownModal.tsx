import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpLeft, Loader2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { commandFormatters } from '../../../services/domains/dashboard/ExecutiveCommandService';
import type { DrilldownKey, DrilldownResult } from '../../../types/dashboard/executiveCommand';

interface DrilldownModalProps {
  open: boolean;
  result: DrilldownResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}

const FULL_RECORD_ROUTE: Partial<Record<DrilldownKey, string>> = {
  sales: '/sales',
  salesMonth: '/sales',
  salesToday: '/sales',
  profit: '/finance',
  expenses: '/finance/expenses',
  expensesToday: '/finance/expenses',
  collections: '/finance/receivables?tab=payments',
  receivables: '/finance/receivables?tab=debts',
  overdueInvoices: '/finance/receivables?tab=debts',
  cashBalance: '/cashboxes',
  inventory: '/inventory/valuation',
  inventoryValue: '/inventory/valuation',
  topProducts: '/sales/analytics',
  slowMoving: '/inventory/alerts',
  branches: '/branches',
  employees: '/employees/commissions',
  cashFlow: '/finance/cash-forecast',
  purchases: '/purchases',
  lowStock: '/inventory/reorder-planning',
  comparison: '/reports?tab=finance',
};

function formatCell(value: string | number | null, type: DrilldownResult['columns'][number]['type']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value !== 'number') return String(value);
  if (type === 'money') return commandFormatters.money(value);
  if (type === 'percent') return `${value.toLocaleString('ar-EG', { maximumFractionDigits: 1 })}%`;
  if (type === 'number') return commandFormatters.numberAr(value);
  return String(value);
}

export const DrilldownModal: React.FC<DrilldownModalProps> = ({
  open,
  result,
  loading,
  error,
  onClose,
  onRetry,
}) => {
  const route = result ? FULL_RECORD_ROUTE[result.key] : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={result?.title ?? 'تفاصيل المؤشر'}
      description={result?.subtitle}
      size="xl"
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-[#767676] dark:text-[#a6a6a6]">
            {result ? `${commandFormatters.count(result.rows.length)} سجل` : 'جارٍ تحميل السجلات'}
          </span>
          <span className="flex items-center gap-2">
            {route && result && result.rows.length > 0 && (
              <Link to={route} className="win-btn win-btn--ghost !min-h-8 !text-[11px]" onClick={onClose}>
                <ArrowUpLeft className="h-3.5 w-3.5" />
                فتح السجل الكامل
              </Link>
            )}
            <button type="button" className="win-btn win-btn--primary !min-h-8 !text-[11px]" onClick={onClose}>
              إغلاق
            </button>
          </span>
        </div>
      )}
    >
      {loading && (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-[#4d4d4d] dark:text-[#c8c8c8]" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-[#0078d4]" />
          <span className="text-xs font-semibold">جارٍ تجميع السجلات التي كوّنت الرقم…</span>
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
          <button type="button" onClick={onRetry} className="mt-3 rounded bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700">
            إعادة المحاولة
          </button>
        </div>
      )}

      {!loading && !error && result && (
        <div className="space-y-3">
          {result.totals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.totals.map((total) => (
                <span key={total.label} className="rounded-[2px] border border-[#d9d9d9] bg-[#fafafa] px-3 py-1.5 text-[11px] dark:border-[#4a4a4a] dark:bg-[#323232]">
                  <span className="text-[#767676] dark:text-[#a6a6a6]">{total.label}: </span>
                  <strong className="tabular-nums text-[#1b1b1b] dark:text-[#f0f0f0]">
                    {total.type === 'money' ? commandFormatters.money(total.value) : commandFormatters.numberAr(total.value)}
                  </strong>
                </span>
              ))}
            </div>
          )}

          {result.note && (
            <p className="rounded-[2px] border border-[#c7e0f4] bg-[#f0f6fc] px-3 py-2 text-[11px] text-[#005a9e] dark:border-[#0f3550] dark:bg-[#0f3550]/40 dark:text-[#8ec8f5]">
              {result.note}
            </p>
          )}

          {result.rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#d9d9d9] p-10 text-center text-xs font-semibold text-[#767676] dark:border-[#4a4a4a] dark:text-[#a6a6a6]">
              لا توجد سجلات مطابقة لهذا المؤشر في الفترة المحددة.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-[2px] border border-[#d9d9d9] dark:border-[#4a4a4a]">
              <table className="w-full min-w-[680px] border-collapse text-right text-[11px]">
                <thead className="sticky top-0 z-10 bg-[#fafafa] dark:bg-[#323232]">
                  <tr>
                    {result.columns.map((column) => (
                      <th key={column.key} scope="col" className="whitespace-nowrap border-b border-[#d9d9d9] px-3 py-2.5 font-bold text-[#4d4d4d] dark:border-[#4a4a4a] dark:text-[#c8c8c8]">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, index) => (
                    <tr key={index} className="border-b border-[#f0f0f0] last:border-0 hover:bg-[#f8fbfe] dark:border-[#3d3d3d] dark:hover:bg-[#30363b]">
                      {result.columns.map((column) => (
                        <td
                          key={column.key}
                          className={`whitespace-nowrap px-3 py-2 ${
                            column.type === 'money' || column.type === 'number' || column.type === 'percent'
                              ? 'tabular-nums text-[#1b1b1b] dark:text-[#f0f0f0]'
                              : 'text-[#4d4d4d] dark:text-[#c8c8c8]'
                          }`}
                        >
                          {formatCell(row[column.key] ?? null, column.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
