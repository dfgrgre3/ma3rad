import React, { useState } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { Factory } from 'lucide-react';
import type { TabProps } from './OverviewTab';

export const SalesCandidatesTab: React.FC<TabProps> = ({ service, data, reload, canManage, toast }) => {
  const [busyId, setBusyId] = useState<string | null>(null);

  const createFromItem = (orderItemId: string) => {
    setBusyId(orderItemId);
    try {
      const order = service.createProductionOrderFromSalesItem(orderItemId);
      toast.success(`تم إنشاء أمر الإنتاج ${order.orderNumber}.`);
      reload();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر إنشاء أمر الإنتاج.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <Factory className="h-4 w-4 text-sky-600" />
        <div>
          <h3 className="text-sm font-black text-slate-900">عناصر أوامر البيع الجاهزة للإنتاج</h3>
          <p className="text-xs text-slate-500">عناصر البيع لمنتجات لها قائمة مواد (BOM) نشطة ولا يوجد لها أمر إنتاج بعد.</p>
        </div>
      </div>
      <DataTable
        ariaLabel="عناصر أوامر البيع المرشحة للإنتاج"
        rows={data.salesCandidates}
        rowKey={(row) => row.orderItemId}
        columns={[
          { key: 'order', header: 'أمر البيع', render: (row) => <span className="font-mono text-xs">{row.salesOrderNumber}</span> },
          { key: 'customer', header: 'العميل', render: (row) => row.customerName },
          { key: 'product', header: 'المنتج', render: (row) => row.productName },
          { key: 'qty', header: 'الكمية', render: (row) => `${row.quantity} ${row.unit || ''}` },
          { key: 'bom', header: 'BOM', render: (row) => <span className="text-xs">{row.bomName}</span> },
          {
            key: 'action', header: 'إجراء',
            render: (row) => canManage && (
              <button
                disabled={busyId === row.orderItemId}
                className="rounded bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700 disabled:opacity-50"
                onClick={() => createFromItem(row.orderItemId)}
              >
                {busyId === row.orderItemId ? 'جارٍ…' : 'إنشاء أمر إنتاج'}
              </button>
            ),
          },
        ]}
        emptyTitle="لا توجد عناصر بيع تحتاج للإنتاج."
        emptyDescription="عندما يحتوي أمر بيع على منتج له BOM نشطة سيظهر هنا."
      />
    </div>
  );
};
