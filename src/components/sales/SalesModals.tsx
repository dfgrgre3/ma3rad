import React from 'react';
import {
  AlertTriangle, Ban, CreditCard, Eye, FileBarChart, FileDown, Loader2, Printer,
  Receipt, RotateCcw, Wallet, X,
} from 'lucide-react';
import type { CustomerPayment, PaymentType, SalesInvoice, SalesInvoiceItem } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/products/productUnits';
import { DocumentPreviewModal } from '../documents/DocumentPreviewModal';
import { CustomerStatementWhatsAppOptions } from './CustomerStatementWhatsAppOptions';
import { Modal, InfoBox, SummaryRow } from './SalesUi';
import type { OperationalFieldDefinition } from '../../services/domains/products/OperationalFieldService';
import { OperationalFieldsSummary } from '../products/OperationalFieldsSummary';
import { OperationalFieldsRecordEditor } from '../products/OperationalFieldsRecordEditor';
import type { BankAccount } from '../../types/finance';

const fmt = (n: number) => CeramicMath.formatCurrency(Number(n) || 0);

const paymentStatusLabel: Record<string, string> = {
  PAID: 'مدفوعة', PARTIAL: 'مدفوعة جزئياً', UNPAID: 'غير مدفوعة',
};
const paymentTypeLabel: Record<string, string> = {
  CASH: 'نقدي', CARD: 'بطاقة', BANK_TRANSFER: 'تحويل بنكي', CHEQUE: 'شيك', CREDIT: 'آجل', MIXED: 'مختلط',
};

type FullInvoice = SalesInvoice & { items: SalesInvoiceItem[] };

export interface SalesModalsProps {
  selected: FullInvoice | null;
  setSelected: (invoice: FullInvoice | null) => void;
  payments: CustomerPayment[];
  voidTarget: { id: string; invoiceNumber: string } | null;
  setVoidTarget: (invoice: any) => void;
  voidReason: string;
  setVoidReason: (value: string) => void;
  submitVoid: (event: React.FormEvent) => void;
  payTarget: FullInvoice | null;
  setPayTarget: (invoice: FullInvoice | null) => void;
  payAmount: string;
  setPayAmount: (value: string) => void;
  payType: PaymentType;
  setPayType: (value: PaymentType) => void;
  payBankAccountId: string;
  setPayBankAccountId: (value: string) => void;
  bankAccounts: BankAccount[];
  payNotes: string;
  setPayNotes: (value: string) => void;
  submitPayment: (event: React.FormEvent) => void;
  docPreview: any;
  setDocPreview: (value: any) => void;
  statement: any;
  setStatement: (value: any) => void;
  statementExportOptions: (statement: any) => any;
  canViewDebts: boolean;
  canViewReturns: boolean;
  canViewCustomerStatement: boolean;
  canRefund: boolean;
  canCollect: boolean;
  canVoid: boolean;
  canExportCustomers: boolean;
  saving: boolean;
  printInvoice: (invoice: FullInvoice) => void;
  printThermalReceipt: (invoice: FullInvoice) => void;
  openInvoicePreview: (invoice: FullInvoice) => void;
  openStatement: (customerId: string) => void;
  goToReturn: (invoiceId: string) => void;
  openPayment: (invoice: FullInvoice) => void;
  openVoid: (invoice: FullInvoice) => void;
  buildExportHtml: (options: any) => string;
  exportToExcel: (options: any) => void;
  operationalFields: OperationalFieldDefinition[];
  operationalFieldValues: Record<string, string>;
  canUpdateOperationalFields: boolean;
  onSaveOperationalFields: (values: Record<string, string>) => void;
}

export const SalesModals: React.FC<SalesModalsProps> = ({
  selected,
  setSelected,
  payments,
  voidTarget,
  setVoidTarget,
  voidReason,
  setVoidReason,
  submitVoid,
  payTarget,
  setPayTarget,
  payAmount,
  setPayAmount,
  payType,
  setPayType,
  payBankAccountId,
  setPayBankAccountId,
  bankAccounts,
  payNotes,
  setPayNotes,
  submitPayment,
  docPreview,
  setDocPreview,
  statement,
  setStatement,
  statementExportOptions,
  canViewDebts,
  canViewReturns,
  canViewCustomerStatement,
  canRefund,
  canCollect,
  canVoid,
  canExportCustomers,
  saving,
  printInvoice,
  printThermalReceipt,
  openInvoicePreview,
  openStatement,
  goToReturn,
  openPayment,
  openVoid,
  buildExportHtml,
  exportToExcel,
  operationalFields,
  operationalFieldValues,
  canUpdateOperationalFields,
  onSaveOperationalFields,
}) => (
  <>
      {/* ── Invoice Details ─────────────────────────────────────────────────── */}
      {selected && (
        <Modal onClose={() => setSelected(null)} wide>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" /> فاتورة {selected.invoiceNumber}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                {selected.date} • {selected.warehouseName} • أنشأها {selected.createdByName || '—'}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <InfoBox label="العميل" value={selected.customerName || 'عميل نقدي'} sub={selected.customerPhone} />
            <InfoBox label="طريقة الدفع" value={paymentTypeLabel[selected.paymentType] || selected.paymentType} sub={canViewDebts ? paymentStatusLabel[selected.paymentStatus] : undefined} />
            <InfoBox label="حالة الفاتورة" value={selected.invoiceStatus === 'VOID' ? 'ملغاة' : 'مكتملة'} sub={`${selected.items.length} بند`} />
          </div>
          <div className="mb-4 space-y-2">
            <OperationalFieldsSummary fields={operationalFields} values={operationalFieldValues} />
            <OperationalFieldsRecordEditor
              recordLabel={selected.invoiceNumber}
              fields={operationalFields}
              initialValues={operationalFieldValues}
              canEdit={canUpdateOperationalFields}
              onSave={onSaveOperationalFields}
            />
          </div>

          <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
            <table className="w-full text-right text-[11px] min-w-[700px]">
              <thead className="bg-slate-50 text-slate-500 font-bold">
                <tr>
                  <th className="px-3 py-2">الصنف</th>
                  <th className="px-3 py-2">المقاس / الفرز</th>
                  <th className="px-3 py-2">الكمية</th>
                  <th className="px-3 py-2">الكراتين</th>
                  <th className="px-3 py-2">سعر الوحدة</th>
                  <th className="px-3 py-2">الخصم</th>
                  <th className="px-3 py-2">الإجمالي</th>
                  <th className="px-3 py-2">الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selected.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-bold text-slate-800">{item.productName}</td>
                    <td className="px-3 py-2 text-slate-500">{item.productType === 'GENERAL' ? getProductUnitLabel(item) : `${item.size} • ${item.productGrade}`}</td>
                    <td className="px-3 py-2 font-mono">{formatProductQuantity(item.quantityM2, item)}</td>
                    <td className="px-3 py-2 font-mono">{item.productType === 'GENERAL' ? '—' : item.boxesCount}</td>
                    <td className="px-3 py-2 font-mono">{fmt(item.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono text-rose-600">{item.discountAmount ? `-${fmt(item.discountAmount)}` : '—'}</td>
                    <td className="px-3 py-2 font-bold text-slate-900">{fmt(item.totalPrice)}</td>
                    <td className={`px-3 py-2 font-bold ${item.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(item.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-[11px] font-black text-slate-600 mb-2">الملخص المالي</div>
                <SummaryRow label="المجموع الفرعي" value={selected.subtotal} />
                <SummaryRow label="خصم الفاتورة" value={-selected.discountAmount} tone={selected.discountAmount ? 'text-rose-600' : ''} />
                <SummaryRow label="الضريبة" value={selected.taxAmount} />
                <SummaryRow label="المشال والنقل" value={selected.shippingCost} />
                <div className="border-t border-slate-300 mt-1 pt-2">
                  <SummaryRow label="إجمالي الفاتورة" value={selected.totalAmount} strong />
                  {canViewDebts && <SummaryRow label="المدفوع" value={selected.paidAmount} tone="text-emerald-600" />}
                  {canViewDebts && <SummaryRow label="المتبقي" value={selected.remainingAmount} tone="text-amber-600" />}
                  {canViewReturns && (selected.returnedAmount || 0) > 0 && <SummaryRow label="المرتجع" value={selected.returnedAmount || 0} tone="text-rose-600" />}
                </div>
              </div>
              {selected.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
                  <b>ملاحظات:</b> {selected.notes}
                </div>
              )}
            </div>

            {canViewDebts && <div>
              <div className="text-[11px] font-black text-slate-600 mb-2 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> تحصيلات الفاتورة ({payments.length})
              </div>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-44 overflow-y-auto">
                {payments.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-slate-400">لا توجد تحصيلات لاحقة مسجلة على هذه الفاتورة.</div>
                ) : payments.map((p) => (
                  <div key={p.id} className="p-2.5 flex items-center justify-between text-[11px]">
                    <div>
                      <div className="font-bold text-slate-700 font-mono">{p.receiptNumber}</div>
                      <div className="text-slate-400">{p.date} • {paymentTypeLabel[p.paymentType] || p.paymentType}</div>
                    </div>
                    <span className="font-black text-emerald-600">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
            <button onClick={() => openInvoicePreview(selected)} className="px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> معاينة الفاتورة
            </button>
            <button onClick={() => printInvoice(selected)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" /> طباعة A4
            </button>
            <button onClick={() => printThermalReceipt(selected)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" /> إيصال حراري
            </button>
            {canViewCustomerStatement && <button onClick={() => openStatement(selected.customerId)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <FileBarChart className="w-3.5 h-3.5" /> كشف حساب العميل
            </button>}
            {selected.invoiceStatus !== 'VOID' && canRefund && (
              <button onClick={() => goToReturn(selected.id)} className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> مرتجع مبيعات
              </button>
            )}
            {selected.invoiceStatus !== 'VOID' && selected.remainingAmount > 0 && canCollect && (
              <button onClick={() => openPayment(selected)} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" /> تحصيل دفعة
              </button>
            )}
            {selected.invoiceStatus !== 'VOID' && canVoid && (
              <button onClick={() => openVoid(selected)} className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                <Ban className="w-3.5 h-3.5" /> إلغاء الفاتورة
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* ── Void modal ──────────────────────────────────────────────────────── */}
      {voidTarget && (
        <Modal onClose={() => setVoidTarget(null)}>
          <form onSubmit={submitVoid} className="space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-black">إلغاء الفاتورة {voidTarget.invoiceNumber}</h3>
            </div>
            <p className="text-xs text-slate-500">
              سيتم إرجاع كميات الفاتورة إلى المخزن وعكس أثرها المالي على حساب العميل والخزينة. لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div>
              <label htmlFor="sales-void-reason" className="block text-xs font-bold text-slate-700 mb-1">سبب الإلغاء *</label>
              <textarea id="sales-void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" placeholder="مثال: خطأ في إدخال الفاتورة / إلغاء الاتفاق مع العميل" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setVoidTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">رجوع</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} تأكيد الإلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Payment modal ───────────────────────────────────────────────────── */}
      {payTarget && (
        <Modal onClose={() => setPayTarget(null)}>
          <form onSubmit={submitPayment} className="space-y-4">
            <div className="flex items-center gap-2 text-sky-600">
              <Wallet className="w-5 h-5" />
              <h3 className="text-base font-black">تحصيل دفعة على الفاتورة {payTarget.invoiceNumber}</h3>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between">
              <span className="text-slate-500">المتبقي على الفاتورة</span>
              <span className="font-black text-amber-600">{fmt(payTarget.remainingAmount)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="sales-payment-amount" className="block text-xs font-bold text-slate-700 mb-1">المبلغ المحصل *</label>
                <input id="sales-payment-amount" type="number" min={0.01} max={payTarget.remainingAmount} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono" />
              </div>
              <div>
                <label htmlFor="sales-payment-type" className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
                <select id="sales-payment-type" value={payType} onChange={(e) => setPayType(e.target.value as PaymentType)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                  <option value="CASH">نقدي</option>
                  <option value="CARD">بطاقة</option>
                  <option value="BANK_TRANSFER">تحويل بنكي</option>
                  <option value="CHEQUE">شيك</option>
                </select>
              </div>
            </div>
            {payType === 'BANK_TRANSFER' && (
              <div>
                <label htmlFor="sales-payment-bank-account" className="block text-xs font-bold text-slate-700 mb-1">الحساب البنكي المستلم *</label>
                <select id="sales-payment-bank-account" required value={payBankAccountId} onChange={(e) => setPayBankAccountId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                  <option value="">اختر الحساب البنكي</option>
                  {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountName} — {account.bankName}</option>)}
                </select>
                {bankAccounts.length === 0 && <p className="mt-1 text-xs text-rose-600">لا توجد حسابات بنكية نشطة.</p>}
              </div>
            )}
            <div>
              <label htmlFor="sales-payment-notes" className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
              <input id="sales-payment-notes" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" placeholder="اختياري" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} تسجيل التحصيل
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── In-app document preview ────────────────────────────────────────── */}
      {docPreview && (
        <DocumentPreviewModal
          title={docPreview.title}
          subtitle={docPreview.subtitle}
          fileName={docPreview.fileName}
          html={docPreview.html}
          onClose={() => setDocPreview(null)}
          onDownloadExcel={docPreview.excel}
          onWhatsApp={docPreview.whatsapp}
        />
      )}

      {/* ── Customer statement ─────────────────────────────────────────────── */}
      {statement && (
        <Modal onClose={() => setStatement(null)} wide>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FileBarChart className="w-5 h-5 text-emerald-600" /> كشف حساب {statement.customer.name}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                {statement.customer.phone} • الحد الائتماني {fmt(statement.customer.creditLimit)} • الرصيد الحالي{' '}
                <span className={(statement.customer.currentBalance || 0) > 0 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                  {fmt(statement.customer.currentBalance || 0)}
                </span>
              </p>
            </div>
            <button onClick={() => setStatement(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
            <table className="w-full text-right text-[11px] min-w-[680px]">
              <thead className="bg-slate-50 text-slate-500 font-bold">
                <tr>
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">المستند</th>
                  <th className="px-3 py-2">البيان</th>
                  <th className="px-3 py-2">مدين</th>
                  <th className="px-3 py-2">دائن</th>
                  <th className="px-3 py-2">الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statement.transactions.map((tx: any) => (
                  <tr key={`${tx.type}-${tx.id}`}>
                    <td className="px-3 py-2 font-mono text-slate-500">{tx.date}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-700">{tx.docNumber}</td>
                    <td className="px-3 py-2 text-slate-600">{tx.description}</td>
                    <td className="px-3 py-2 font-mono text-rose-600">{tx.debit ? fmt(tx.debit) : '—'}</td>
                    <td className="px-3 py-2 font-mono text-emerald-600">{tx.credit ? fmt(tx.credit) : '—'}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{fmt(tx.balanceAfter)}</td>
                  </tr>
                ))}
                {statement.transactions.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-slate-400">لا توجد حركات على حساب العميل.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            {canExportCustomers && <CustomerStatementWhatsAppOptions
              statement={statement}
              buttonClassName="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
              buttonLabel="إرسال واتساب"
            />}
            {canExportCustomers && <button
              onClick={() => {
                const options = statementExportOptions(statement);
                setDocPreview({
                  title: 'معاينة كشف الحساب',
                  subtitle: options.subtitle,
                  fileName: options.fileName,
                  html: buildExportHtml(options),
                  excel: () => exportToExcel(options),
                });
              }}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" /> معاينة وتصدير
            </button>}
            <button onClick={() => setStatement(null)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold">إغلاق</button>
          </div>
        </Modal>
      )}
  </>
);
