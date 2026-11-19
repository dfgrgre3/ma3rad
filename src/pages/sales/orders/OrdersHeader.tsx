import React from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Package2, Plus, FileSpreadsheet, FileDown } from 'lucide-react';

interface OrdersHeaderProps {
  canCreate: boolean;
  onExport: (kind: 'excel' | 'pdf') => void;
  onCreate: () => void;
}

export const OrdersHeader: React.FC<OrdersHeaderProps> = ({ canCreate, onExport, onCreate }) => (
  <div className="bg-white border-b border-slate-200 px-6 pt-4">
    <PageHeader
      icon={<Package2 className="w-5 h-5" />}
      title="طلبات وحجوزات العملاء"
      description="حجز البضاعة، متابعة التجهيز، وإصدار الفاتورة مباشرة من الطلب"
      actions={<>
        <button onClick={() => onExport('excel')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> جدول بيانات</button>
        <button onClick={() => onExport('pdf')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileDown className="w-4 h-4 text-rose-600" /> مستند</button>
        {canCreate && (
          <button onClick={onCreate} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition">
            <Plus className="w-4 h-4" /> إنشاء طلب حجز
          </button>
        )}
      </>}
    />
  </div>
);
