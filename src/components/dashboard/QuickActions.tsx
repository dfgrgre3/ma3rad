import React from 'react';
import { Link } from 'react-router-dom';
import { Package, ShoppingBag, ShoppingCart, Wallet } from 'lucide-react';
import type { QuickActionItem } from './types';

const QUICK_ACTIONS: QuickActionItem[] = [
  { to: '/pos', label: 'فاتورة بيع جديدة', detail: 'ابدأ عملية بيع', icon: ShoppingCart, tone: '' },
  { to: '/products', label: 'المنتجات', detail: 'الأصناف والأسعار', icon: Package, tone: '' },
  { to: '/purchases', label: 'المشتريات', detail: 'فواتير الموردين', icon: ShoppingBag, tone: '' },
  { to: '/finance/debts', label: 'الذمم المدينة', detail: 'متابعة التحصيل', icon: Wallet, tone: '' },
];

export const QuickActions: React.FC = () => {
  return (
    <section aria-label="اختصارات سريعة" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {QUICK_ACTIONS.map(({ to, label, detail, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex min-h-[52px] items-center gap-2.5 rounded-[2px] border border-[#d9d9d9] bg-white px-3 py-2 hover:border-[#0078d4] hover:bg-[#f2f8fd] dark:border-[#3d3d3d] dark:bg-[#2b2b2b] dark:hover:border-[#0078d4] dark:hover:bg-[#333f47]"
        >
          <Icon className="h-4 w-4 shrink-0 text-[#0078d4]" />
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-[#1b1b1b] dark:text-[#f0f0f0]">{label}</span>
            <span className="block truncate text-[10.5px] text-[#767676] dark:text-[#a6a6a6]">{detail}</span>
          </span>
        </Link>
      ))}
    </section>
  );
};
