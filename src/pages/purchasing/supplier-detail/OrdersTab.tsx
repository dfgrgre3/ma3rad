import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { SupplierOrderRow, ORDER_STATUS_BADGES } from '../../../types/purchasing/supplierDetailPage';

export interface OrdersTabProps {
  orders: SupplierOrderRow[];
}

export const OrdersTab: React.FC<OrdersTabProps> = ({ orders }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">أوامر الشراء والتوريد</h3>
          <p className="text-xs text-slate-500">أوامر التوريد الصادرة ومتابعة حالة الاستلام</p>
        </div>
        <Link
          to="/purchases/orders"
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>إنشاء أمر شراء جديد</span>
        </Link>
      </div>

      <div className="overflow-x-auto">
        <DataTable
          ariaLabel="أوامر شراء المورد"
          rows={orders}
          rowKey={(ord: any) => String(ord.id)}
          minWidth={700}
          dense
          tableClassName="text-xs"
          rowClassName={() => 'transition hover:bg-slate-50'}
          columns={[
            { key: 'num', header: 'رقم الأمر', render: (ord: any) => <span className="font-mono font-bold text-slate-900">{ord.order_number}</span> },
            { key: 'date', header: 'تاريخ الأمر', render: (ord: any) => <span className="text-slate-600">{ord.date}</span> },
            { key: 'expected', header: 'تاريخ التسليم المتوقع', render: (ord: any) => <span className="text-slate-600">{ord.expected_delivery_date || '—'}</span> },
            { key: 'total', header: 'الإجمالي التقديري', render: (ord: any) => <span className="font-bold text-slate-900">{CeramicMath.formatCurrency(ord.total_amount)}</span> },
            {
              key: 'status', header: 'حالة الأمر',
              render: (ord: any) => (
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${ORDER_STATUS_BADGES[ord.status as keyof typeof ORDER_STATUS_BADGES]?.className || 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                  {ORDER_STATUS_BADGES[ord.status as keyof typeof ORDER_STATUS_BADGES]?.label || ord.status}
                </span>
              ),
            },
          ]}
          emptyTitle="لا توجد أوامر شراء مسجلة لهذا المورد."
        />
      </div>
    </div>
  );
};
