import React from 'react';
import { ArrowLeftRight, Plus, RefreshCw } from 'lucide-react';
import type { StockTransfersHeaderProps } from '../../../../types/inventory/stockTransfers';
import { PageHeader } from '../../../../components/ui/PageHeader';

export const StockTransfersHeader: React.FC<StockTransfersHeaderProps> = ({
  loading,
  canCreateTransfer,
  onCreateTransfer,
  onRefresh,
}) => (
  <div className="bg-white border-b border-slate-200 px-6 pt-4">
    <PageHeader
      icon={<ArrowLeftRight className="w-5 h-5" />}
      title="التحويلات المخزنية ودورة الحياة الكاملة"
      description="طلب، اعتماد، تجهيز، إرسال، واستلام جزئي/كامل مع توثيق الفقد أو الرفض"
      actions={<>
        {canCreateTransfer && (
          <button
            onClick={onCreateTransfer}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black shadow-md shadow-sky-600/20 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            طلب تحويل مخزني جديد
          </button>
        )}

        <button
          onClick={onRefresh}
          className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
          title="تحديث"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </>}
    />
  </div>
);
