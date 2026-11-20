import React from 'react';
import { Download, Package, ReceiptText, Truck, Wallet } from 'lucide-react';
import type { NumberFormatter, TabKey } from '../../../types/dashboard/todayPurchases';

export interface PurchasesTabsBarProps {
  tab: TabKey;
  tabCounts: Record<TabKey, number>;
  onTabChange: (tab: TabKey) => void;
  onExportInvoices: () => void;
  onExportItems: () => void;
  onExportSuppliers: () => void;
  onExportPayments: () => void;
  plain: NumberFormatter;
  canViewPayments?: boolean;
}

export const PurchasesTabsBar: React.FC<PurchasesTabsBarProps> = ({
  tab, tabCounts, onTabChange,
  onExportInvoices, onExportItems, onExportSuppliers, onExportPayments, plain,
  canViewPayments = true,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 sm:px-4" role="tablist" aria-label="أقسام مشتريات اليوم">
    <div className="flex flex-wrap items-center gap-1">
      {([
        { key: 'invoices', label: 'فواتير التوريد', icon: ReceiptText },
        { key: 'items', label: 'الأصناف', icon: Package },
        { key: 'suppliers', label: 'الموردون', icon: Truck },
        { key: 'payments', label: 'سداد الموردين', icon: Wallet },
      ] as { key: TabKey; label: string; icon: React.ElementType }[]).filter((entry) => entry.key !== 'payments' || canViewPayments).map((entry) => {
        const TabIcon = entry.icon;
        const active = tab === entry.key;
        return (
          <div key={entry.key} role="tab" aria-selected={active} className="contents">
            <button
              type="button"
              aria-selected={active}
              onClick={() => onTabChange(entry.key)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning ${active ? 'bg-primary text-white dark:bg-surface-sunken dark:text-ink' : 'text-ink-secondary hover:bg-surface-sunken dark:text-muted dark:hover:bg-primary'}`}
            >
              <TabIcon className="h-3.5 w-3.5" />
              {entry.label}
              <span className={`rounded px-1.5 py-0.5 text-[9px] tabular-nums ${active ? 'bg-surface/15 dark:bg-primary/10' : 'bg-surface-sunken dark:bg-primary'}`}>{plain(tabCounts[entry.key])}</span>
            </button>
          </div>
        );
      })}
    </div>
    <div className="flex items-center gap-2">
      {tab === 'invoices' && (
        <button type="button" onClick={onExportInvoices} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-muted transition hover:bg-surface-sunken hover:text-ink dark:hover:bg-primary dark:hover:text-muted">
          <Download className="h-3.5 w-3.5" /> جدول بيانات
        </button>
      )}
      {tab === 'items' && (
        <button type="button" onClick={onExportItems} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-muted transition hover:bg-surface-sunken hover:text-ink dark:hover:bg-primary dark:hover:text-muted">
          <Download className="h-3.5 w-3.5" /> جدول بيانات
        </button>
      )}
      {tab === 'suppliers' && (
        <button type="button" onClick={onExportSuppliers} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-muted transition hover:bg-surface-sunken hover:text-ink dark:hover:bg-primary dark:hover:text-muted">
          <Download className="h-3.5 w-3.5" /> جدول بيانات
        </button>
      )}
      {tab === 'payments' && (
        <button type="button" onClick={onExportPayments} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-muted transition hover:bg-surface-sunken hover:text-ink dark:hover:bg-primary dark:hover:text-muted">
          <Download className="h-3.5 w-3.5" /> جدول بيانات
        </button>
      )}
    </div>
  </div>
);
