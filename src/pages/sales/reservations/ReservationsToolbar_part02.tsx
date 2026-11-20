import React from 'react';
import { BookmarkPlus, RefreshCw, Search, Receipt } from 'lucide-react';
import type { ReservationsToolbarProps } from './ReservationsToolbar_part01';

export const ReservationsToolbar: React.FC<ReservationsToolbarProps> = ({
  mode,
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
    <div className="bg-surface p-4 rounded-2xl border border-line/80 dark:border-line-strong shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
      {/* Navigation Tabs */}
      <div className="flex bg-surface-sunken dark:bg-primary/60 p-1 rounded-xl w-full md:w-auto">
        {mode !== 'reservations' && <button
          onClick={() => onTabChange('orders')}
          className={`flex-1 md:flex-initial px-5 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${
            activeTab === 'orders'
              ? 'bg-surface text-primary shadow-sm'
              : 'text-ink-secondary hover:text-ink'
          }`}
        >
          <Receipt className="w-4 h-4" />
          طلبات الحجز والعربونات ({ordersCount})
        </button>}
        {mode !== 'orders' && <button
          onClick={() => onTabChange('reservations')}
          className={`flex-1 md:flex-initial px-5 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${
            activeTab === 'reservations'
              ? 'bg-surface text-primary shadow-sm'
              : 'text-ink-secondary hover:text-ink'
          }`}
        >
          <BookmarkPlus className="w-4 h-4" />
          سجل حجز الأصناف بالمخازن ({reservationsCount})
        </button>}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
        <div className="relative flex-1 md:w-64">
          <Search className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="بحث بالرقم أو العميل أو الصنف..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-3 pr-9 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-3 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
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
          className="p-2 text-ink-secondary hover:text-primary dark:hover:text-primary bg-surface-sunken rounded-xl transition"
          title="تحديث البيانات"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
