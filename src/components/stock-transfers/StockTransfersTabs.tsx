import React from 'react';
import type { StockTransfersTabsProps } from './types';

export const StockTransfersTabs: React.FC<StockTransfersTabsProps> = ({
  activeTab,
  onTabChange,
  workflowCount,
  historyCount,
  statusFilter,
  onStatusFilterChange,
}) => (
  <div className="px-6 pt-4 bg-white border-b border-slate-200 flex items-center justify-between">
    <div className="flex gap-2">
      <button
        onClick={() => onTabChange('workflow')}
        className={`pb-3 px-3 text-xs font-black border-b-2 transition ${
          activeTab === 'workflow'
            ? 'border-sky-600 text-sky-600'
            : 'border-transparent text-slate-400 hover:text-slate-600'
        }`}
      >
        أوامر التحويل النشطة ({workflowCount})
      </button>
      <button
        onClick={() => onTabChange('history')}
        className={`pb-3 px-3 text-xs font-black border-b-2 transition ${
          activeTab === 'history'
            ? 'border-sky-600 text-sky-600'
            : 'border-transparent text-slate-400 hover:text-slate-600'
        }`}
      >
        سجل حركات التحويل المنفذة ({historyCount})
      </button>
      <button
        onClick={() => onTabChange('summary')}
        className={`pb-3 px-3 text-xs font-black border-b-2 transition ${
          activeTab === 'summary'
            ? 'border-sky-600 text-sky-600'
            : 'border-transparent text-slate-400 hover:text-slate-600'
        }`}
      >
        ملخص حركة المخازن
      </button>
    </div>

    {activeTab === 'workflow' && (
      <div className="pb-2 flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        >
          <option value="ALL">جميع الحالات</option>
          <option value="REQUESTED">طلبات جديدة</option>
          <option value="APPROVED">معتمدة</option>
          <option value="PREPARING">قيد التجهيز</option>
          <option value="IN_TRANSIT">قيد النقل</option>
          <option value="RECEIVED_FULL">مستلمة بالكامل</option>
          <option value="RECEIVED_PARTIAL">استلام جزئي</option>
          <option value="REJECTED">مرفوضة</option>
        </select>
      </div>
    )}
  </div>
);
