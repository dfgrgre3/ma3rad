import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Package, ShoppingBag, ShoppingCart, Wallet } from 'lucide-react';
import type { QuickActionItem } from './types';

const QUICK_ACTIONS: QuickActionItem[] = [
  { to: '/pos', label: 'فاتورة بيع جديدة', detail: 'ابدأ عملية بيع', icon: ShoppingCart, tone: 'text-teal-800 bg-teal-50 dark:bg-teal-950/60 dark:text-teal-300' },
  { to: '/products', label: 'المنتجات', detail: 'الأصناف والأسعار', icon: Package, tone: 'text-sky-800 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-300' },
  { to: '/purchases', label: 'المشتريات', detail: 'فواتير الموردين', icon: ShoppingBag, tone: 'text-amber-800 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300' },
  { to: '/finance/debts', label: 'الذمم المدينة', detail: 'متابعة التحصيل', icon: Wallet, tone: 'text-rose-800 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-300' },
];

export const QuickActions: React.FC = () => {
  return (
    <section aria-label="اختصارات سريعة" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {QUICK_ACTIONS.map(({ to, label, detail, icon: Icon, tone }) => (
        <Link key={to} to={to} className="group flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-sm focus-visible:outline-teal-600 dark:border-slate-800 dark:bg-slate-900">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block truncate text-xs font-extrabold text-slate-800 dark:text-slate-100">{label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{detail}</span></span>
          <ArrowUpRight className="mr-auto h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-teal-700" />
        </Link>
      ))}
    </section>
  );
};
