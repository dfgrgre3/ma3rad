import React from 'react';
import { FileSpreadsheet, Wallet, TrendingUp, BookOpen, RefreshCw, Calendar, Scale, GitCompare, Users, BarChart3 } from 'lucide-react';
import { PageHeader } from '../../ui/PageHeader';

export type FinancialStatementsTab = 'income' | 'balance' | 'cash' | 'aging' | 'subledger' | 'ledger' | 'reconciliation';
export type AgingType = 'customer' | 'supplier';

const tabs: readonly [FinancialStatementsTab, string, React.ComponentType<{ className?: string }>][] = [
  ['income', 'قائمة الدخل', BarChart3],
  ['balance', 'الميزانية العمومية', Wallet],
  ['cash', 'التدفقات النقدية', TrendingUp],
  ['aging', 'أعمار الديون', Calendar],
  ['subledger', 'الأستاذ المساعد', Users],
  ['ledger', 'دفتر الأستاذ', BookOpen],
  ['reconciliation', 'المصالحة', GitCompare],
];

export function FinancialStatementsHeader({
  tab,
  agingType,
  asOf,
  from,
  to,
  loading,
  onTabChange,
  visibleTabs,
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
  visibleTabs?: FinancialStatementsTab[];
}) {
  const availableTabs = visibleTabs ? tabs.filter(([key]) => visibleTabs.includes(key as FinancialStatementsTab)) : tabs;
  return (
    <>
      <div className="bg-white border-b border-slate-200 px-6 pt-4">
        <PageHeader
          icon={<Scale className="w-5 h-5" />}
          title="القوائم المالية"
          description="الميزانية العمومية، التدفقات النقدية، أعمار الديون، الأستاذ المساعد، ودفتر الأستاذ"
          actions={<>
            {tab === 'balance' && (
              <input
                type="date"
                aria-label="تاريخ الميزانية"
                value={asOf}
                onChange={(event) => onAsOfChange(event.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            )}
            {(tab === 'cash' || tab === 'ledger' || tab === 'subledger' || tab === 'income') && (
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
            <button onClick={onExport} aria-label="تصدير إلى جدول بيانات" disabled={!onExport} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold disabled:opacity-40">
              <FileSpreadsheet className="w-4 h-4" /> جدول بيانات
            </button>
          </>}
        />
      </div>

      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-1 overflow-x-auto">
        {availableTabs.map(([key, label, Icon]) => (
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
