import React from 'react';
import { FileSpreadsheet, Wallet, TrendingUp, BookOpen, RefreshCw, Calendar, Scale } from 'lucide-react';

export type FinancialStatementsTab = 'balance' | 'cash' | 'aging' | 'ledger';
export type AgingType = 'customer' | 'supplier';

const tabs = [
  ['balance', 'الميزانية العمومية', Wallet],
  ['cash', 'التدفقات النقدية', TrendingUp],
  ['aging', 'أعمار الديون', Calendar],
  ['ledger', 'دفتر الأستاذ', BookOpen],
] as const;

export function FinancialStatementsHeader({
  tab,
  agingType,
  asOf,
  from,
  to,
  loading,
  onTabChange,
  onAgingTypeChange,
  onAsOfChange,
  onFromChange,
  onToChange,
  onRefresh,
  onExport,
}: {
  tab: FinancialStatementsTab;
  agingType: AgingType;
  asOf: string;
  from: string;
  to: string;
  loading: boolean;
  onTabChange: (tab: FinancialStatementsTab) => void;
  onAgingTypeChange: (type: AgingType) => void;
  onAsOfChange: (date: string) => void;
  onFromChange: (date: string) => void;
  onToChange: (date: string) => void;
  onRefresh: () => void;
  onExport?: () => void;
}) {
  return (
    <>
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center">
            <Scale className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-base font-black">القوائم المالية</h1>
            <p className="text-xs text-slate-500 font-medium">الميزانية العمومية، التدفقات النقدية، أعمار الديون، ودفتر الأستاذ</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'balance' && (
            <input
              type="date"
              aria-label="تاريخ الميزانية"
              value={asOf}
              onChange={(event) => onAsOfChange(event.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
            />
          )}
          {(tab === 'cash' || tab === 'ledger') && (
            <>
              <input
                type="date"
                aria-label="من تاريخ"
                value={from}
                onChange={(event) => onFromChange(event.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
              <input
                type="date"
                aria-label="إلى تاريخ"
                value={to}
                onChange={(event) => onToChange(event.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            </>
          )}
          {tab === 'aging' && (
            <>
              <select
                value={agingType}
                aria-label="نوع أعمار الديون"
                onChange={(event) => onAgingTypeChange(event.target.value === 'supplier' ? 'supplier' : 'customer')}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              >
                <option value="customer">العملاء</option>
                <option value="supplier">الموردون</option>
              </select>
              <input
                type="date"
                aria-label="تاريخ أعمار الديون"
                value={asOf}
                onChange={(event) => onAsOfChange(event.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            </>
          )}
          <button onClick={onRefresh} aria-label="تحديث القوائم المالية" className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100" title="تحديث">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onExport} aria-label="تصدير إلى Excel" disabled={!onExport} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold disabled:opacity-40">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-1 overflow-x-auto">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition ${tab === key ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>
    </>
  );
}
