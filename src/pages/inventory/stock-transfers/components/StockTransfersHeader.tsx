import React from 'react';
import { ArrowLeftRight, Plus, RefreshCw } from 'lucide-react';
import type { StockTransfersHeaderProps } from '../../../../types/inventory/stockTransfers';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { ActivityGate } from '../../../../components/ui/ActivityGate';

export const StockTransfersHeader: React.FC<StockTransfersHeaderProps> = ({
  loading,
  canCreateTransfer,
  onCreateTransfer,
  onRefresh,
}) => (
  <div className="bg-surface border-b border-line px-6 pt-4">
    <PageHeader
      icon={<ArrowLeftRight className="w-5 h-5" />}
      title="التحويلات المخزنية ودورة الحياة الكاملة"
      description="طلب، اعتماد، تجهيز، إرسال، واستلام جزئي/كامل مع توثيق الفقد أو الرفض"
      actions={<>
        {canCreateTransfer && (
          <ActivityGate element="new-transfer"><button
            onClick={onCreateTransfer}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary text-white text-xs font-black shadow-md shadow-primary/20 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            طلب تحويل مخزني جديد
          </button></ActivityGate>
        )}

        <button
          onClick={onRefresh}
          className="p-2 rounded-xl border border-line bg-surface hover:bg-surface-muted text-ink-secondary transition"
          title="تحديث"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </>}
    />
  </div>
);
