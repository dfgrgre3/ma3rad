import React from 'react';
import {
  CalendarDays, Download, ExternalLink, Plus, Printer, ReceiptText, RefreshCw, ShoppingBag, Users,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { useActivityElementHidden, useActivityElementLabel } from '../../../hooks/domains/config/useActivityUi';
import { formatDay, shiftDay } from './helpers';

export interface PurchasesHeaderProps {
  date: string;
  todayDate: string;
  invoiceCountLabel: string;
  hasData: boolean;
  canCreate: boolean;
  loading: boolean;
  onSelectDate: (date: string) => void;
  onRefresh: () => void;
  onPrint: () => void;
  onExport: () => void;
  onOpenQuickCreate: () => void;
  onNavigate: (path: string) => void;
}

export const PurchasesHeader: React.FC<PurchasesHeaderProps> = ({
  date, todayDate, invoiceCountLabel, hasData, canCreate, loading,
  onSelectDate, onRefresh, onPrint, onExport, onOpenQuickCreate, onNavigate,
}) => {
  const quickPurchaseHidden = useActivityElementHidden('quick-purchase', '/daily/purchases');
  const quickPurchaseLabel = useActivityElementLabel('quick-purchase', '/daily/purchases');
  return (
  <div className="shrink-0 border-b border-line bg-surface px-4 py-4 sm:px-6">
    <div className="mx-auto w-full">
      <PageHeader
        icon={<ShoppingBag className="h-5 w-5" />}
        title={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            مشتريات اليوم
            <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-ink-secondary ">
              {date === todayDate ? 'اليوم' : formatDay(date)}
            </span>
            <span className="hidden rounded-md bg-warning-soft px-2 py-0.5 text-[10px] font-bold text-warning sm:inline-flex">
              {invoiceCountLabel} فاتورة توريد
            </span>
          </span>
        }
        description="متابعة فواتير التوريد والسداد والموردين والأصناف الواردة خلال اليوم"
        meta={
          <div className="mt-3 flex w-full flex-wrap items-center gap-2 border-t border-line pt-3 ">
            <ActivityGate path="/purchases">
              <button type="button" onClick={() => onNavigate('/purchases')} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-ink-secondary transition hover:bg-surface-sunken hover:text-warning dark:hover:bg-primary dark:hover:text-warning">
                <ExternalLink className="h-3.5 w-3.5" /> كل فواتير التوريد
              </button>
            </ActivityGate>
            <ActivityGate path="/suppliers">
              <button type="button" onClick={() => onNavigate('/suppliers')} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-ink-secondary transition hover:bg-surface-sunken hover:text-warning dark:hover:bg-primary dark:hover:text-warning">
                <Users className="h-3.5 w-3.5" /> الموردون
              </button>
            </ActivityGate>
            <ActivityGate path="/purchases/returns">
              <button type="button" onClick={() => onNavigate('/purchases/returns')} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-ink-secondary transition hover:bg-surface-sunken hover:text-warning dark:hover:bg-primary dark:hover:text-warning">
                <ReceiptText className="h-3.5 w-3.5" /> مرتجعات التوريد
              </button>
            </ActivityGate>
            <span className="ms-auto inline-flex items-center gap-1.5 text-[11px] text-muted">
              <span className={`inline-flex h-2 w-2 rounded-full ${loading ? 'animate-pulse bg-warning' : 'bg-success'}`} />
              {loading ? 'جارٍ التحديث…' : 'متصل بقاعدة البيانات المحلية'}
            </span>
          </div>
        }
        actions={<>
          {canCreate && !quickPurchaseHidden && (
            <button
              type="button"
              onClick={onOpenQuickCreate}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-warning px-4 text-xs font-bold text-white shadow-sm transition hover:bg-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              <Plus className="h-4 w-4" /> {quickPurchaseLabel ?? 'فاتورة توريد'}
            </button>
          )}
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-muted p-1 ">
            <button
              type="button"
              onClick={() => onSelectDate(todayDate)}
              aria-pressed={date === todayDate}
              className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning ${date === todayDate ? 'bg-surface text-warning shadow-sm dark:bg-primary dark:text-warning' : 'text-ink-secondary hover:bg-surface dark:hover:bg-primary'}`}
            >
              اليوم
            </button>
            <button
              type="button"
              onClick={() => onSelectDate(shiftDay(todayDate, -1))}
              aria-pressed={date === shiftDay(todayDate, -1)}
              className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning ${date === shiftDay(todayDate, -1) ? 'bg-surface text-warning shadow-sm dark:bg-primary dark:text-warning' : 'text-ink-secondary hover:bg-surface dark:hover:bg-primary'}`}
            >
              أمس
            </button>
            <label className="relative flex min-h-8 items-center gap-1.5 border-r border-line px-2 ">
              <CalendarDays className="h-4 w-4 text-muted" aria-hidden="true" />
              <span className="sr-only">اختيار تاريخ المشتريات</span>
              <input
                type="date"
                value={date}
                onChange={(event) => onSelectDate(event.target.value || todayDate)}
                aria-label="اختيار تاريخ المشتريات"
                className="w-[128px] bg-transparent text-xs font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-warning "
              />
            </label>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="تحديث بيانات المشتريات"
            title="تحديث"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface text-ink-secondary transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning dark:hover:bg-primary"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onPrint}
            disabled={!hasData}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-bold text-ink transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-strong disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-primary"
          >
            <Printer className="h-4 w-4" /> طباعة
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!hasData}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-bold text-ink transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-primary"
          >
            <Download className="h-4 w-4" /> تصدير جدول بيانات
          </button>
        </>}
      />
    </div>
  </div>
  );
};
