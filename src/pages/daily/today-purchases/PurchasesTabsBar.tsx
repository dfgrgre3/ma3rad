import React from 'react';
import { Download, Package, ReceiptText, Truck, Wallet } from 'lucide-react';
import type { NumberFormatter, TabKey } from './types';

export interface PurchasesTabsBarProps {
  tab: TabKey;
  tabCounts: Record<TabKey, number>;
  onTabChange: (tab: TabKey) => void;
  onExportInvoices: () => void;
  onExportItems: () => void;
  onExportSuppliers: () => void;
  onExportPayments: () => void;
  plain: NumberFormatter;
}

export const PurchasesTabsBar: React.FC<PurchasesTabsBarProps> = ({
  tab, tabCounts, onTabChange,
  onExportInvoices, onExportItems, onExportSuppliers, onExportPayments, plain,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700 sm:px-4" role="tablist" aria-label="أقسام مشتريات اليوم">
    <div className="flex flex-wrap items-center gap-1">
      {([
        { key: 'invoices', label: 'فواتير التوريد', icon: ReceiptText },
        { key: 'items', label: 'الأصناف', icon: Package },
        { key: 'suppliers', label: 'الموردون', icon: Truck },
        { key: 'payments', label: 'سداد الموردين', icon: Wallet },
      ] as { key: TabKey; label: string; icon: React.ElementType }[]).map((entry) => {
        const TabIcon = entry.icon;
        return (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            onClick={() => onTabChange(entry.key)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${tab === entry.key ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            <TabIcon className="h-3.5 w-3.5" />
            {entry.label}
            <span className={`rounded px-1.5 py-0.5 text-[9px] tabular-nums ${tab === entry.key ? 'bg-white/15 dark:bg-slate-900/10' : 'bg-slate-100 dark:bg-slate-800'}`}>{plain(tabCounts[entry.key])}</span>
          </button>
        );
      })}
    </div>
    <div className="flex items-center gap-2">
      {tab === 'invoices' && (
        <button type="button" onClick={onExportInvoices} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
          <Download className="h-3.5 w-3.5" /> Excel
        </button>
      )}
      {tab === 'items' && (
        <button type="button" onClick={onExportItems} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
          <Download className="h-3.5 w-3.5" /> Excel
        </button>
      )}
      {tab === 'suppliers' && (
        <button type="button" onClick={onExportSuppliers} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
          <Download className="h-3.5 w-3.5" /> Excel
        </button>
      )}
      {tab === 'payments' && (
        <button type="button" onClick={onExportPayments} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
          <Download className="h-3.5 w-3.5" /> Excel
        </button>
      )}
    </div>
  </div>
);
