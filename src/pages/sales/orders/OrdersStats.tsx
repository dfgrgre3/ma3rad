import React from 'react';
import { Package2, Wallet, Clock, Truck, CheckCircle2, Receipt } from 'lucide-react';
import { OrderStats } from '../../../services/OrderService';
import { Stat } from './ui';
import { fmt } from './types';

interface OrdersStatsProps {
  stats: OrderStats | null;
}

export const OrdersStats: React.FC<OrdersStatsProps> = ({ stats }) => (
  <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
    <Stat label="إجمالي الطلبات" value={String(stats?.total ?? 0)} icon={Package2} tone="text-slate-700 bg-slate-50 border-slate-200" />
    <Stat label="قيمة الطلبات" value={fmt(stats?.totalValue ?? 0)} icon={Wallet} tone="text-violet-700 bg-violet-50 border-violet-200" />
    <Stat label="بانتظار التأكيد" value={String(stats?.pending ?? 0)} icon={Clock} tone="text-amber-700 bg-amber-50 border-amber-200" />
    <Stat label="قيد التجهيز" value={String(stats?.processing ?? 0)} icon={Truck} tone="text-sky-700 bg-sky-50 border-sky-200" />
    <Stat label="مكتملة / مفوترة" value={String(stats?.completed ?? 0)} icon={CheckCircle2} tone="text-emerald-700 bg-emerald-50 border-emerald-200" />
    <Stat label="قيمة المكتملة" value={fmt(stats?.completedValue ?? 0)} icon={Receipt} tone="text-emerald-700 bg-emerald-50 border-emerald-200" />
  </div>
);
