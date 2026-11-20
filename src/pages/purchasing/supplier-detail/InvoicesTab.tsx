import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { SupplierInvoiceRow, PAY_STATUS_BADGES } from '../../../types/purchasing/supplierDetailPage';

export interface InvoicesTabProps {
  invoices: SupplierInvoiceRow[];
  canViewFinancials: boolean;
  canCreatePurchase: boolean;
}

export const InvoicesTab: React.FC<InvoicesTabProps> = ({ invoices, canViewFinancials, canCreatePurchase }) => {
  return (
    <div className="bg-surface rounded-2xl border border-line shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h3 className="text-base font-extrabold text-ink">سجل فواتير التوريد والشراء</h3>
          <p className="text-xs text-muted">
            {canViewFinancials ? 'كل الفواتير الصادرة من هذا المورد مع حالة السداد والمتبقي' : 'كل فواتير الشراء الصادرة من هذا المورد'}
          </p>
        </div>
        {canCreatePurchase && <div className="flex items-center gap-2">
          <Link
            to="/purchases"
            className="px-3 py-2 bg-primary hover:bg-primary text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>فاتورة شراء جديدة</span>
          </Link>
        </div>}
      </div>

      <div className="overflow-x-auto">
        <DataTable
          ariaLabel="فواتير المورد"
          rows={invoices}
          rowKey={(inv: any) => String(inv.id)}
          minWidth={700}
          dense
          tableClassName="text-xs"
          rowClassName={() => 'transition hover:bg-surface-muted'}
          columns={[
            { key: 'num', header: 'رقم الفاتورة', render: (inv: any) => <span className="font-mono font-bold text-ink">{inv.invoice_number}</span> },
            { key: 'date', header: 'التاريخ', render: (inv: any) => <span className="text-ink-secondary">{inv.date}</span> },
            { key: 'total', header: 'الإجمالي', render: (inv: any) => <span className="font-black text-ink">{CeramicMath.formatCurrency(inv.total_amount)}</span> },
            ...(canViewFinancials ? [
              { key: 'paid', header: 'المدفوع', render: (inv: any) => <span className="font-bold text-success">{CeramicMath.formatCurrency(inv.paid_amount)}</span> },
              { key: 'rem', header: 'المتبقي', render: (inv: any) => <span className="font-bold text-danger">{CeramicMath.formatCurrency(inv.remaining_amount)}</span> },
              {
                key: 'paystatus', header: 'حالة السداد',
                render: (inv: any) => (
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${PAY_STATUS_BADGES[inv.payment_status as keyof typeof PAY_STATUS_BADGES]?.className || 'border-line bg-surface-sunken text-ink-secondary'}`}>
                    {PAY_STATUS_BADGES[inv.payment_status as keyof typeof PAY_STATUS_BADGES]?.label || inv.payment_status}
                  </span>
                ),
              },
            ] : []),
            { key: 'notes', header: 'ملاحظات', render: (inv: any) => <span className="text-muted">{inv.notes || '—'}</span> },
          ]}
          emptyTitle="لا توجد فواتير مسجلة لهذا المورد."
        />
      </div>
    </div>
  );
};
