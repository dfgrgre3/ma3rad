import React from 'react';
import { ArrowLeftRight, Plus, RefreshCw } from 'lucide-react';
import type { StockTransfersHeaderProps } from './types';

export const StockTransfersHeader: React.FC<StockTransfersHeaderProps> = ({
  loading,
  onCreateTransfer,
  onRefresh,
}) => (
  <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
        <ArrowLeftRight className="w-5 h-5" />
      </div>
      <div>
        <h1 className="text-base font-black">التحويلات المخزنية ودورة الحياة الكاملة</h1>
        <p className="text-xs text-slate-500 font-medium">طلب، اعتماد، تجهيز، إرسال، واستلام جزئي/كامل مع توثيق الفقد أو الرفض</p>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <button
        onClick={onCreateTransfer}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black shadow-md shadow-sky-600/20 transition active:scale-95"
      >
        <Plus className="w-4 h-4" />
        طلب تحويل مخزني جديد
      </button>

      <button
        onClick={onRefresh}
        className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
        title="تحديث"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  </div>
);
