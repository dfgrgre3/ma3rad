import React from 'react';
import { FileText, DollarSign } from 'lucide-react';
import { Supplier } from '../../../types';
import { CeramicMath } from '../../../utils/ceramicMath';
import { useBusinessProfileMeta, useBusinessTerm } from '../../../hooks/useBusinessTerm';
import {
  Tab, SupplierInvoiceRow, SupplierOrderRow, SupplierPaymentRow, PAY_STATUS_BADGES,
} from './types';

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
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-2.5">رقم الفاتورة</th>
                      <th className="p-2.5">التاريخ</th>
                      <th className="p-2.5">الإجمالي</th>
                      <th className="p-2.5">المسدد</th>
                      <th className="p-2.5">المتبقي</th>
                      <th className="p-2.5">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.slice(0, 5).map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                        <td className="p-2.5 text-slate-600">{inv.date}</td>
                        <td className="p-2.5 font-bold text-slate-900">
                          {CeramicMath.formatCurrency(inv.total_amount)}
                        </td>
                        <td className="p-2.5 text-emerald-700 font-bold">
                          {CeramicMath.formatCurrency(inv.paid_amount)}
                        </td>
                        <td className="p-2.5 text-rose-700 font-bold">
                          {CeramicMath.formatCurrency(inv.remaining_amount)}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              PAY_STATUS_BADGES[inv.payment_status]?.className ||
                              'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {PAY_STATUS_BADGES[inv.payment_status]?.label || inv.payment_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {invoices.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400">
                          لا توجد فواتير توريد مسجلة لهذا المورد حتى الآن.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-2.5">رقم السند</th>
                      <th className="p-2.5">التاريخ</th>
                      <th className="p-2.5">المبلغ</th>
                      <th className="p-2.5">طريقة الدفع</th>
                      <th className="p-2.5">البيان / ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.slice(0, 5).map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-mono font-bold text-slate-900">{pay.receipt_number}</td>
                        <td className="p-2.5 text-slate-600">{pay.date}</td>
                        <td className="p-2.5 font-black text-emerald-700">
                          {CeramicMath.formatCurrency(pay.amount)}
                        </td>
                        <td className="p-2.5 font-bold text-slate-700">
                          {pay.payment_type === 'CASH'
                            ? 'نقدي'
                            : pay.payment_type === 'BANK'
                            ? 'تحويل بنكي'
                            : pay.payment_type === 'CHEQUE'
                            ? 'شيك'
                            : pay.payment_type}
                        </td>
                        <td className="p-2.5 text-slate-500 truncate max-w-xs">{pay.notes || '—'}</td>
                      </tr>
                    ))}
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400">
                          لا توجد سندات صرف مسجلة لهذا المورد.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
