import React from 'react';
import { Package2, Plus, FileSpreadsheet, FileDown } from 'lucide-react';

interface OrdersHeaderProps {
  canCreate: boolean;
  onExport: (kind: 'excel' | 'pdf') => void;
  onCreate: () => void;
}

export const OrdersHeader: React.FC<OrdersHeaderProps> = ({ canCreate, onExport, onCreate }) => (
  <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center"><Package2 className="w-5 h-5 text-violet-600" /></div>
      <div>
        <h1 className="text-base font-black text-slate-900">طلبات وحجوزات العملاء</h1>
        <p className="text-xs text-slate-500 font-medium">حجز البضاعة، متابعة التجهيز، وإصدار الفاتورة مباشرة من الطلب</p>
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <button onClick={() => onExport('excel')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel</button>
      <button onClick={() => onExport('pdf')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileDown className="w-4 h-4 text-rose-600" /> PDF</button>
      {canCreate && (
        <button onClick={onCreate} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition">
          <Plus className="w-4 h-4" /> إنشاء طلب حجز
        </button>
      )}
    </div>
  </div>
);
