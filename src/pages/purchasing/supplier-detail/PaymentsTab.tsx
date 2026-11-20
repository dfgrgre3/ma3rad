import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { DollarSign } from 'lucide-react';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { SupplierPaymentRow } from '../../../types/purchasing/supplierDetailPage';

export interface PaymentsTabProps {
  payments: SupplierPaymentRow[];
  canPay: boolean;
  onOpenPaymentModal: () => void;
}

export const PaymentsTab: React.FC<PaymentsTabProps> = ({ payments, canPay, onOpenPaymentModal }) => {
  return (
    <div className="bg-surface rounded-2xl border border-line shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h3 className="text-base font-extrabold text-ink">سندات الصرف والمدفوعات</h3>
          <p className="text-xs text-muted">سجل الدفعات المسددة للمورد وتأثيرها على رصيد الحساب</p>
        </div>
        {canPay && (
          <button
            onClick={onOpenPaymentModal}
            className="px-4 py-2 bg-success hover:bg-success text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-success/30"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>تسجيل سند صرف جديد</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <DataTable
          ariaLabel="سندات صرف المورد"
          rows={payments}
          rowKey={(p: any) => String(p.id)}
          minWidth={700}
          dense
          tableClassName="text-xs"
          rowClassName={() => 'transition hover:bg-surface-muted'}
          columns={[
            { key: 'num', header: 'رقم السند', render: (p: any) => <span className="font-mono font-bold text-ink">{p.receipt_number}</span> },
            { key: 'date', header: 'التاريخ', render: (p: any) => <span className="text-ink-secondary">{p.date}</span> },
            { key: 'amount', header: 'المبلغ المسدد', render: (p: any) => <span className="text-sm font-black text-success">{CeramicMath.formatCurrency(p.amount)}</span> },
            {
              key: 'method', header: 'طريقة الدفع',
              render: (p: any) => <span className="font-bold text-ink">{p.payment_type === 'CASH' ? 'نقدي' : p.payment_type === 'BANK' ? 'تحويل بنكي' : p.payment_type === 'CHEQUE' ? 'شيك' : p.payment_type}</span>,
            },
            { key: 'src', header: 'الخزينة / المصدر', render: (p: any) => <span className="font-mono text-muted">{p.register_id || 'cr_main'}</span> },
            { key: 'notes', header: 'البيان / ملاحظات', render: (p: any) => <span className="text-ink-secondary">{p.notes || '—'}</span> },
          ]}
          emptyTitle="لا توجد سندات صرف مسجلة لهذا المورد."
        />
      </div>
    </div>
  );
};
