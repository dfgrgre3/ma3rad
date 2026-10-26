import React from 'react';
import { BookmarkPlus, RefreshCw, Search, Receipt } from 'lucide-react';
import type { ReservationTab } from './types';

interface ReservationsToolbarProps {
  activeTab: ReservationTab;
  onTabChange: (tab: ReservationTab) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  onRefresh: () => void;
  loading: boolean;
  ordersCount: number;
  reservationsCount: number;
}

export const ReservationsToolbar: React.FC<ReservationsToolbarProps> = ({
  activeTab,
  onTabChange,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  loading,
  ordersCount,
  reservationsCount,
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
      {/* Navigation Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl w-full md:w-auto">
        <button
          onClick={() => onTabChange('orders')}
          className={`flex-1 md:flex-initial px-5 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${
            activeTab === 'orders'
              ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          }`}
        >
          <Receipt className="w-4 h-4" />
          طلبات الحجز والعربونات ({ordersCount})
        </button>
        <button
          onClick={() => onTabChange('reservations')}
          className={`flex-1 md:flex-initial px-5 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${
            activeTab === 'reservations'
              ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          }`}
        >
          <BookmarkPlus className="w-4 h-4" />
          سجل حجز الأصناف بالمخازن ({reservationsCount})
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
        <div className="relative flex-1 md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="بحث بالرقم أو العميل أو الصنف..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-3 pr-9 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="ALL">جميع الحالات</option>
          {activeTab === 'orders' ? (
            <>
              <option value="PENDING">قيد الانتظار</option>
              <option value="CONFIRMED">مؤكد</option>
              <option value="PROCESSING">قيد التجهيز</option>
              <option value="COMPLETED">مكتمل ومفوتر</option>
              <option value="CANCELLED">ملغي</option>
            </>
          ) : (
            <>
              <option value="ACTIVE">نشط</option>
              <option value="RELEASED">مُفرج</option>
              <option value="CONSUMED">مُنفّذ</option>
              <option value="EXPIRED">منتهي</option>
            </>
          )}
        </select>

        <button
          onClick={onRefresh}
          className="p-2 text-slate-600 hover:text-sky-600 dark:text-slate-300 dark:hover:text-sky-400 bg-slate-100 dark:bg-slate-700 rounded-xl transition"
          title="تحديث البيانات"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
