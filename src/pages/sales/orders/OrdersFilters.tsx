import React from 'react';
import { Search, Calendar, RefreshCw } from 'lucide-react';
import { OrderStatus } from '../../../services/OrderService';
import { STATUS_LABELS } from './types';

interface OrdersFiltersProps {
  search: string;
  statusFilter: 'ALL' | OrderStatus;
  dateFrom: string;
  dateTo: string;
  loading: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: 'ALL' | OrderStatus) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onRefresh: () => void;
}

export const OrdersFilters: React.FC<OrdersFiltersProps> = ({
  search, statusFilter, dateFrom, dateTo, loading,
  onSearchChange, onStatusChange, onDateFromChange, onDateToChange, onRefresh,
}) => (
  <div className="flex flex-col xl:flex-row gap-2">
    <div className="relative flex-1">
      <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="بحث برقم الطلب أو العميل أو الهاتف أو الفاتورة..." className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-violet-400" />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5">
        <Calendar className="w-3.5 h-3.5 text-slate-400" />
        <input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none" />
        <span className="text-slate-300">—</span>
        <input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none" />
      </div>
      <select value={statusFilter} onChange={(e) => onStatusChange(e.target.value as any)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold">
        <option value="ALL">كل الحالات</option>
        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <button onClick={onRefresh} className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100" title="تحديث"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>
  </div>
);
