import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { SupplierReturnRow } from '../../../types/purchasing/supplierDetailPage';

export interface ReturnsTabProps {
  returns: SupplierReturnRow[];
}

export const ReturnsTab: React.FC<ReturnsTabProps> = ({ returns }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">مرتجعات الشراء للمورد</h3>
          <p className="text-xs text-slate-500">حركات إرجاع البضاعة والتسويات المدينة على المورد</p>
        </div>
        <Link
          to="/purchases/returns"
          className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>تسجيل مرتجع شراء</span>
        </Link>
      </div>

      <div className="overflow-x-auto">
        <DataTable
          ariaLabel="مرتجعات شراء المورد"
          rows={returns}
          rowKey={(ret: any) => String(ret.id)}
          minWidth={700}
          dense
          tableClassName="text-xs"
          rowClassName={() => 'transition hover:bg-slate-50'}
          columns={[
            { key: 'num', header: 'رقم المرتجع', render: (ret: any) => <span className="font-mono font-bold text-slate-900">{ret.return_number}</span> },
            { key: 'date', header: 'التاريخ', render: (ret: any) => <span className="text-slate-600">{ret.date}</span> },
            { key: 'amount', header: 'قيمة المرتجع', render: (ret: any) => <span className="font-black text-rose-700">{CeramicMath.formatCurrency(ret.total_amount)}</span> },
            { key: 'reason', header: 'سبب الإرجاع', render: (ret: any) => <span className="text-slate-700">{ret.reason || '—'}</span> },
          ]}
          emptyTitle="لا توجد مرتجعات شراء مسجلة لهذا المورد."
        />
      </div>
    </div>
  );
};
