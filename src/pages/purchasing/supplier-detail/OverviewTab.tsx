import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { FileText, DollarSign } from 'lucide-react';
import { Supplier } from '../../../types';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import {
  Tab, SupplierInvoiceRow, SupplierOrderRow, SupplierPaymentRow, PAY_STATUS_BADGES,
} from '../../../types/purchasing/supplierDetailPage';

export interface OverviewTabProps {
  supplier: Supplier;
  invoices: SupplierInvoiceRow[];
  payments: SupplierPaymentRow[];
  orders: SupplierOrderRow[];
  canUpdate: boolean;
  canViewPurchases: boolean;
  canViewFinancials: boolean;
  onOpenEditModal: () => void;
  onTabChange: (tab: Tab) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  supplier,
  invoices,
  payments,
  orders,
  canUpdate,
  canViewPurchases,
  canViewFinancials,
  onOpenEditModal,
  onTabChange,
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {canViewPurchases && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-bold text-slate-500">إجمالي المشتريات والتوريدات</span>
            <div className="mt-2 text-2xl font-black text-slate-900">
              {CeramicMath.formatCurrency(supplier.totalPurchases)}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">{invoices.length} فاتورة مسجلة</div>
          </div>
        )}

        {canViewFinancials && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-bold text-slate-500">الرصيد المستحق الحالي للمورد</span>
            <div
              className={`mt-2 text-2xl font-black ${
                supplier.currentBalance > 0
                  ? 'text-rose-600'
                  : supplier.currentBalance < 0
                  ? 'text-emerald-600'
                  : 'text-slate-600'
              }`}
            >
              {CeramicMath.formatCurrency(supplier.currentBalance)}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {supplier.currentBalance > 0
                ? 'مستحقات واجبة السداد'
                : supplier.currentBalance < 0
                ? 'رصيد دائن لصالح المعرض'
                : 'الحساب خالص'}
            </div>
          </div>
        )}

        {canViewFinancials && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-bold text-slate-500">إجمالي المدفوعات المسددة</span>
            <div className="mt-2 text-2xl font-black text-emerald-600">
              {CeramicMath.formatCurrency(payments.reduce((s, p) => s + Number(p.amount || 0), 0))}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">{payments.length} سند صرف مسجل</div>
          </div>
        )}

        {canViewPurchases && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-bold text-slate-500">أوامر الشراء المفتوحة</span>
            <div className="mt-2 text-2xl font-black text-indigo-600">
              {orders.filter((o) => o.status !== 'RECEIVED' && o.status !== 'CANCELLED').length}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">من إجمالي {orders.length} أمر شراء</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 flex items-center justify-between">
            <span>بيانات الاتصال والملف التجاري</span>
            {canUpdate && (
              <button
                onClick={onOpenEditModal}
                className="text-xs text-sky-600 hover:text-sky-700 font-bold"
              >
                تعديل
              </button>
            )}
          </h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">كود المورد:</span>
              <span className="font-mono font-bold text-slate-900">{supplier.code}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">اسم المورد:</span>
              <span className="font-bold text-slate-900">{supplier.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">اسم الشركة / المصنع:</span>
              <span className="font-bold text-slate-900">{supplier.companyName || '—'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">الهاتف:</span>
              <span className="font-mono font-bold text-slate-900">{supplier.phone || '—'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">البريد الإلكتروني:</span>
              <span className="font-mono text-slate-900">{supplier.email || '—'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">الرقم الضريبي:</span>
              <span className="font-mono font-bold text-slate-900">{supplier.taxNumber || '—'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">السجل التجاري:</span>
              <span className="font-mono font-bold text-slate-900">{supplier.commercialRecord || '—'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">فترة السداد المعتادة:</span>
              <span className="font-bold text-slate-900">{supplier.paymentTermsDays || 30} يوم</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">العنوان:</span>
              <span className="font-normal text-slate-700">{supplier.address || '—'}</span>
            </div>
            {supplier.notes && (
              <div className="pt-2">
                <span className="text-slate-500 block mb-1">ملاحظات:</span>
                <p className="rounded-xl bg-slate-50 p-2.5 text-slate-700 text-xs leading-relaxed">
                  {supplier.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {canViewPurchases && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-600" />
                  <span>آخر فواتير التوريد</span>
                </h3>
                <button
                  onClick={() => onTabChange('invoices')}
                  className="text-xs text-sky-600 hover:text-sky-700 font-bold"
                >
                  عرض الكل ({invoices.length})
                </button>
              </div>
              <div className="overflow-x-auto">
                <DataTable
                  ariaLabel="آخر فواتير التوريد"
                  rows={invoices.slice(0, 5)}
                  rowKey={(inv) => String(inv.id)}
                  dense
                  tableClassName="text-xs"
                  columns={[
                    { key: 'num', header: 'رقم الفاتورة', render: (inv) => <span className="font-mono font-bold text-slate-900">{inv.invoice_number}</span> },
                    { key: 'date', header: 'التاريخ', render: (inv) => <span className="text-slate-600">{inv.date}</span> },
                    { key: 'total', header: 'الإجمالي', render: (inv) => <span className="font-bold text-slate-900">{CeramicMath.formatCurrency(inv.total_amount)}</span> },
                    { key: 'paid', header: 'المسدد', render: (inv) => <span className="text-emerald-700 font-bold">{CeramicMath.formatCurrency(inv.paid_amount)}</span> },
                    { key: 'remaining', header: 'المتبقي', render: (inv) => <span className="text-rose-700 font-bold">{CeramicMath.formatCurrency(inv.remaining_amount)}</span> },
                    {
                      key: 'status', header: 'الحالة',
                      render: (inv) => (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${PAY_STATUS_BADGES[inv.payment_status]?.className || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {PAY_STATUS_BADGES[inv.payment_status]?.label || inv.payment_status}
                        </span>
                      ),
                    },
                  ]}
                  emptyTitle="لا توجد فواتير توريد مسجلة لهذا المورد حتى الآن."
                />
              </div>
            </div>
          )}

          {canViewFinancials && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>آخر سندات الصرف والمدفوعات</span>
                </h3>
                <button
                  onClick={() => onTabChange('payments')}
                  className="text-xs text-sky-600 hover:text-sky-700 font-bold"
                >
                  عرض الكل ({payments.length})
                </button>
              </div>
              <div className="overflow-x-auto">
                <DataTable
                  ariaLabel="آخر سندات الصرف"
                  rows={payments.slice(0, 5)}
                  rowKey={(pay) => String(pay.id)}
                  dense
                  tableClassName="text-xs"
                  columns={[
                    { key: 'num', header: 'رقم السند', render: (pay) => <span className="font-mono font-bold text-slate-900">{pay.receipt_number}</span> },
                    { key: 'date', header: 'التاريخ', render: (pay) => <span className="text-slate-600">{pay.date}</span> },
                    { key: 'amount', header: 'المبلغ', render: (pay) => <span className="font-black text-emerald-700">{CeramicMath.formatCurrency(pay.amount)}</span> },
                    {
                      key: 'method', header: 'طريقة الدفع',
                      render: (pay) => <span className="font-bold text-slate-700">{pay.payment_type === 'CASH' ? 'نقدي' : pay.payment_type === 'BANK' ? 'تحويل بنكي' : pay.payment_type === 'CHEQUE' ? 'شيك' : pay.payment_type}</span>,
                    },
                    { key: 'notes', header: 'البيان / ملاحظات', render: (pay) => <span className="text-slate-500 truncate max-w-xs block">{pay.notes || '—'}</span> },
                  ]}
                  emptyTitle="لا توجد سندات صرف مسجلة لهذا المورد."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
