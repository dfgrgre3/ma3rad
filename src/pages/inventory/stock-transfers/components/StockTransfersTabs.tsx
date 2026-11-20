import React from 'react';
import type { StockTransfersTabsProps } from '../../../../types/inventory/stockTransfers';

export const StockTransfersTabs: React.FC<StockTransfersTabsProps> = ({
  activeTab,
  onTabChange,
  workflowCount,
  historyCount,
  statusFilter,
  onStatusFilterChange,
  canViewSummary = true,
}) => (
  <div className="px-6 pt-4 bg-surface border-b border-line flex items-center justify-between">
    <div className="flex gap-2">
      <button
        onClick={() => onTabChange('workflow')}
        className={`pb-3 px-3 text-xs font-black border-b-2 transition ${
          activeTab === 'workflow'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-ink-secondary'
        }`}
      >
        أوامر التحويل النشطة ({workflowCount})
      </button>
      <button
        onClick={() => onTabChange('history')}
        className={`pb-3 px-3 text-xs font-black border-b-2 transition ${
          activeTab === 'history'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-ink-secondary'
        }`}
      >
        سجل حركات التحويل المنفذة ({historyCount})
      </button>
      {canViewSummary && (
      <button
        onClick={() => onTabChange('summary')}
        className={`pb-3 px-3 text-xs font-black border-b-2 transition ${
          activeTab === 'summary'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-ink-secondary'
        }`}
      >
        ملخص حركة المخازن
      </button>
      )}
    </div>

    {activeTab === 'workflow' && (
      <div className="pb-2 flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-3 py-1.5 bg-surface-muted border border-line rounded-xl text-xs font-bold"
        >
          <option value="ALL">جميع الحالات</option>
          <option value="REQUESTED">طلبات جديدة</option>
          <option value="APPROVED">معتمدة</option>
          <option value="PREPARING">قيد التجهيز</option>
          <option value="IN_TRANSIT">قيد النقل</option>
          <option value="RECEIVED_FULL">مستلمة بالكامل</option>
          <option value="RECEIVED_PARTIAL">استلام جزئي</option>
          <option value="COMPLETED">مكتملة مع فقد موثق</option>
          <option value="REJECTED">مرفوضة</option>
        </select>
      </div>
    )}
  </div>
);
