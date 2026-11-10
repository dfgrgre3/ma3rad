import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileText, MessageCircle, PackageCheck, Wallet, X } from 'lucide-react';
import type { CustomerService } from '../../services/domains/customers/CustomerService';
import { CustomerSupplyService, type CustomerSupplyRequest } from '../../services/domains/customers/CustomerSupplyService';
import { SalesService } from '../../services/domains/sales/SalesService';
import type { SalesInvoice, SalesInvoiceItem } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../utils/products/productUnits';
import { openWhatsAppChat } from '../../utils/shared/externalLinks';
import { localDateString } from '../../utils/shared/date';
import { shareCustomerStatementOnWhatsApp } from '../../utils/customers/customerStatementSharing';

type CustomerStatement = ReturnType<CustomerService['getCustomerStatement']>;
type DetailedInvoice = SalesInvoice & { items: SalesInvoiceItem[] };

interface CustomerStatementWhatsAppOptionsProps {
  statement: CustomerStatement;
  buttonClassName: string;
  buttonLabel: string;
  showTrigger?: boolean;
  initiallyOpen?: boolean;
  onClose?: () => void;
}

const fmt = (amount: number) => CeramicMath.formatCurrency(Number(amount) || 0);

const paymentLabels: Record<string, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة',
  BANK_TRANSFER: 'تحويل بنكي',
  CHEQUE: 'شيك',
  CREDIT: 'آجل',
  MIXED: 'مختلط',
};

const paymentStatusLabels: Record<string, string> = {
  PAID: 'مسددة',
  PARTIAL: 'مسددة جزئيًا',
  UNPAID: 'غير مسددة',
};

const formatInvoiceDetails = (invoice: DetailedInvoice, index: number): string[] => {
  const lines = [
    '',
    `${index + 1}) فاتورة رقم ${invoice.invoiceNumber}`,
    `التاريخ: ${invoice.date}${invoice.dueDate ? ` | الاستحقاق: ${invoice.dueDate}` : ''}`,
    invoice.warehouseName ? `المخزن: ${invoice.warehouseName}` : '',
    'الأصناف:',
  ].filter(Boolean);

  if (invoice.items.length === 0) lines.push('- تفاصيل الأصناف غير متاحة.');
  invoice.items.forEach((item, itemIndex) => {
    lines.push(
      `${itemIndex + 1}. ${item.productName}${item.productSku ? ` (كود ${item.productSku})` : ''}${item.size ? ` | المقاس: ${item.size}` : ''}${item.productGrade ? ` | الفرز: ${item.productGrade}` : ''}`,
      `   الكمية: ${formatProductQuantity(item.quantityM2, item)} | كراتين: ${item.boxesCount || 0} | قطع: ${item.piecesCount || 0}`,
      `   سعر الوحدة: ${fmt(item.unitPrice)} | الخصم: ${fmt(item.discountAmount)} | إجمالي البند: ${fmt(item.totalPrice)}`,
    );
  });
  lines.push(
    `الإجمالي قبل الخصم والضريبة: ${fmt(invoice.subtotal)}`,
    `الخصم${invoice.discountPercentage ? ` (${invoice.discountPercentage}%)` : ''}: ${fmt(invoice.discountAmount)}`,
    `الشحن: ${fmt(invoice.shippingCost)}`,
    `الضريبة${invoice.taxPercentage ? ` (${invoice.taxPercentage}%)` : ''}: ${fmt(invoice.taxAmount)}`,
    `إجمالي الفاتورة: ${fmt(invoice.totalAmount)}`,
    `المدفوع: ${fmt(invoice.paidAmount)} | المتبقي: ${fmt(invoice.remainingAmount)}`,
    `طريقة الدفع: ${paymentLabels[invoice.paymentType] || invoice.paymentType} | الحالة: ${paymentStatusLabels[invoice.paymentStatus] || invoice.paymentStatus}`,
  );
  if (invoice.returnedAmount) lines.push(`إجمالي المرتجعات: ${fmt(invoice.returnedAmount)}`);
  if (invoice.deliveryAddress) lines.push(`عنوان التوصيل: ${invoice.deliveryAddress}`);
  if (invoice.deliveryDate) lines.push(`موعد التوصيل: ${invoice.deliveryDate}`);
  if (invoice.notes) lines.push(`ملاحظات: ${invoice.notes}`);
  return lines;
};

export const CustomerStatementWhatsAppOptions: React.FC<CustomerStatementWhatsAppOptionsProps> = ({
  statement,
  buttonClassName,
  buttonLabel,
  showTrigger = true,
  initiallyOpen = false,
  onClose,
}) => {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [overdueInvoices, setOverdueInvoices] = useState<DetailedInvoice[]>([]);
  const [invoiceDetails, setInvoiceDetails] = useState<DetailedInvoice[]>([]);
  const [supplyRequests, setSupplyRequests] = useState<CustomerSupplyRequest[]>([]);
  const [customMessage, setCustomMessage] = useState(`مرحبًا ${statement.customer.name}،\n`);

  const salesService = useMemo(() => new SalesService(), []);
  const supplyService = useMemo(() => new CustomerSupplyService(), []);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setLoadError('');
    setInvoiceDetails([]);
    setOverdueInvoices([]);
    setSupplyRequests([]);

    const errors: string[] = [];
    try {
      const today = localDateString();
      const invoices = salesService.getInvoicesFiltered({ customerId: statement.customer.id }, false);
      const detailed = invoices
        .map((invoice) => salesService.getInvoiceById(invoice.id))
        .filter((invoice): invoice is DetailedInvoice => Boolean(invoice));
      setInvoiceDetails(detailed);
      setOverdueInvoices(detailed.filter((invoice) =>
        invoice.paymentStatus !== 'PAID'
        && Number(invoice.remainingAmount) > 0
        && Boolean(invoice.dueDate)
        && String(invoice.dueDate) < today
      ));
    } catch (error) {
      console.error('Failed to load overdue customer invoices:', error);
      errors.push('تعذر تحميل الفواتير المتأخرة.');
    }

    try {
      setSupplyRequests(supplyService.getOpenRequests({ customerId: statement.customer.id }));
    } catch (error) {
      console.error('Failed to load customer supply requests:', error);
      errors.push('تعذر تحميل حالة المنتجات المطلوبة.');
    }

    setLoadError(errors.join(' '));
    setLoading(false);
  }, [isOpen, salesService, statement.customer.id, supplyService]);

  const send = (message: string) => {
    if (openWhatsAppChat(statement.customer.phone || '', message)) closeOptions();
  };

  const closeOptions = () => {
    setIsOpen(false);
    onClose?.();
  };

  const sendBalanceReminder = () => {
    const { customer } = statement;
    const balance = Number(customer.currentBalance) || 0;
    const unpaid = invoiceDetails.filter((invoice) => Number(invoice.remainingAmount) > 0);
    const totalRemaining = unpaid.reduce((sum, invoice) => sum + Number(invoice.remainingAmount || 0), 0);
    const balanceText = balance > 0
      ? `الرصيد المستحق عليكم ${fmt(balance)}.`
      : balance < 0
        ? `رصيدكم الدائن لدينا ${fmt(Math.abs(balance))}.`
        : 'رصيد حسابكم الحالي مصفّى.';
    const invoiceLines = unpaid.map((invoice, index) =>
      `${index + 1}. فاتورة ${invoice.invoiceNumber} بتاريخ ${invoice.date}: إجمالي ${fmt(invoice.totalAmount)}، مدفوع ${fmt(invoice.paidAmount)}، متبقي ${fmt(invoice.remainingAmount)}${invoice.dueDate ? `، استحقاق ${invoice.dueDate}` : ''}`
    );
    send([
      `مرحبًا ${customer.name}،`,
      `كود العميل: ${customer.code}`,
      balanceText,
      `إجمالي المشتريات المسجل: ${fmt(customer.totalPurchases)}`,
      `حد الائتمان: ${fmt(customer.creditLimit)}`,
      `إجمالي المتبقي على الفواتير: ${fmt(totalRemaining)}`,
      `عدد الفواتير غير المسددة: ${unpaid.length}`,
      'تفاصيل الفواتير غير المسددة:',
      ...(invoiceLines.length ? invoiceLines : ['لا توجد فواتير غير مسددة.']),
      'يسعدنا تواصلكم معنا لأي استفسار أو لمراجعة الحساب.',
    ].join('\n'));
  };

  const sendOverdueReminder = () => {
    const lines: string[] = [
      `مرحبًا ${statement.customer.name}،`,
      'نرسل إليكم تفاصيل الفواتير المستحقة والمتأخرة:',
    ];
    overdueInvoices.forEach((invoice, index) => {
      lines.push(...formatInvoiceDetails(invoice, index));
      const overdueDays = Math.max(0, Math.floor(
        (Date.now() - new Date(`${invoice.dueDate}T00:00:00`).getTime()) / 86400000,
      ));
      lines.push(`مدة التأخير: ${overdueDays} يوم`);
    });
    lines.push(
      '',
      `عدد الفواتير المتأخرة: ${overdueInvoices.length}`,
      `إجمالي المبالغ المتأخرة: ${fmt(overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.remainingAmount || 0), 0))}`,
      'يرجى التواصل معنا لتأكيد موعد السداد أو مراجعة تفاصيل الحساب. شكرًا لتعاملكم معنا.',
    );
    send(lines.join('\n'));
  };

  const sendInvoiceDetails = () => {
    const lines = [
      `مرحبًا ${statement.customer.name}،`,
      `تفاصيل فواتيركم المسجلة (${invoiceDetails.length} فاتورة):`,
    ];
    if (invoiceDetails.length === 0) lines.push('لا توجد فواتير مسجلة على الحساب.');
    invoiceDetails.forEach((invoice, index) => lines.push(...formatInvoiceDetails(invoice, index)));
    lines.push(
      '',
      `إجمالي المشتريات: ${fmt(statement.customer.totalPurchases)}`,
      `الرصيد الحالي: ${fmt(statement.customer.currentBalance)}`,
    );
    send(lines.join('\n'));
  };

  const sendPaymentsAndReturns = () => {
    const transactions = statement.transactions.filter((transaction) =>
      transaction.type === 'PAYMENT' || transaction.type === 'RETURN'
    );
    const lines = [
      `مرحبًا ${statement.customer.name}،`,
      'تفاصيل التحصيلات والمرتجعات المسجلة على حسابكم:',
    ];
    if (transactions.length === 0) lines.push('لا توجد تحصيلات أو مرتجعات مسجلة.');
    transactions.forEach((transaction, index) => {
      lines.push(
        `${index + 1}. ${transaction.type === 'PAYMENT' ? 'تحصيل' : 'مرتجع'} رقم ${transaction.docNumber} | التاريخ: ${transaction.date}`,
        `   البيان: ${transaction.description}`,
        `   ${transaction.type === 'PAYMENT' ? 'المبلغ المحصل' : 'المبلغ المضاف للرصيد'}: ${fmt(transaction.credit)} | الرصيد بعد الحركة: ${fmt(transaction.balanceAfter)}`,
      );
    });
    send(lines.join('\n'));
  };

  const sendReadyProductsNotice = () => {
    const readyRequests = supplyRequests.filter((request) =>
      request.items.length > 0
      && request.items.every((item) => item.quantityReceived >= item.quantityRequested)
    );
    if (readyRequests.length === 0) {
      window.alert('لا توجد طلبات اكتملت كمياتها المطلوبة بعد.');
      return;
    }

    const lines = [
      `مرحبًا ${statement.customer.name}،`,
      'يسعدنا إبلاغكم بتوفر المنتجات التي طلبتموها بالكميات المطلوبة كاملة:',
    ];
    let grandTotal = 0;
    readyRequests.forEach((request, requestIndex) => {
      const requestTotal = request.items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
      grandTotal += requestTotal;
      const invoice = invoiceDetails.find((candidate) =>
        (request.invoiceId && candidate.id === request.invoiceId)
        || (request.invoiceNumber && candidate.invoiceNumber === request.invoiceNumber)
      );

      lines.push('', `الطلب ${requestIndex + 1} — فاتورة ${request.invoiceNumber || '—'}:`);
      request.items.forEach((item, itemIndex) => {
        lines.push(
          `${itemIndex + 1}. ${item.productName}${item.size ? ` (${item.size})` : ''}${item.productGrade ? ` | الفرز: ${item.productGrade}` : ''}`,
          `   الكمية المطلوبة والمتوفرة: ${formatProductQuantity(item.quantityRequested, item)}`,
          `   سعر الوحدة (${item.unit}): ${fmt(item.unitPrice)}`,
          `   إجمالي الصنف: ${fmt(item.totalPrice)}`,
        );
      });
      lines.push(`إجمالي منتجات الطلب: ${fmt(requestTotal)}`);
      if (invoice) {
        if (invoice.paidAmount > 0) {
          lines.push(`المدفوع سابقًا على الفاتورة: ${fmt(invoice.paidAmount)}`);
          lines.push(`المتبقي على الفاتورة: ${fmt(invoice.remainingAmount)}`);
          lines.push('تم تسجيل دفعة/عربون سابق على الفاتورة.');
        } else {
          lines.push('لم يتم تسجيل دفعة/عربون على الفاتورة حتى الآن.');
          lines.push(`المبلغ المتبقي على الفاتورة: ${fmt(invoice.remainingAmount)}`);
        }
      } else {
        lines.push('حالة العربون غير متاحة لعدم وجود فاتورة مرتبطة بالطلب.');
      }
      if (request.warehouseName) lines.push(`المخزن: ${request.warehouseName}`);
      if (request.expectedDeliveryDate) lines.push(`موعد التسليم المتوقع: ${request.expectedDeliveryDate}`);
      if (request.address) lines.push(`عنوان التوصيل المسجل: ${request.address}`);
    });
    lines.push(
      '',
      `إجمالي جميع الأصناف المتوفرة في الطلبات: ${fmt(grandTotal)}`,
      'يرجى التواصل معنا لتنسيق الاستلام أو التوصيل. شكرًا لثقتكم بنا.',
    );
    send(lines.join('\n'));
  };

  const readySupplyRequestCount = supplyRequests.filter((request) =>
    request.items.length > 0
    && request.items.every((item) => item.quantityReceived >= item.quantityRequested)
  ).length;

  const sendCustomMessage = () => {
    if (!customMessage.trim()) {
      window.alert('اكتب نص الرسالة أولًا.');
      return;
    }
    send(customMessage.trim());
  };

  return (
    <>
      {showTrigger && <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={!statement.customer.phone}
        title={!statement.customer.phone ? 'أضف رقم هاتف للعميل أولًا' : undefined}
        className={`${buttonClassName} disabled:opacity-50`}
      >
        <MessageCircle className="w-3.5 h-3.5" /> {buttonLabel}
      </button>}
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" dir="rtl">
          <button type="button" aria-label="إغلاق" onClick={closeOptions} className="absolute inset-0" />
          <section role="dialog" aria-modal="true" aria-labelledby="customer-whatsapp-options-title" className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 id="customer-whatsapp-options-title" className="font-black text-slate-900">اختر الرسالة للعميل</h2>
                <p className="mt-1 text-xs text-slate-500">{statement.customer.name} · {statement.customer.phone}</p>
              </div>
              <button type="button" onClick={closeOptions} aria-label="إغلاق" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </header>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
              {loading && <p className="text-sm text-slate-500">جارٍ تحميل الفواتير والمنتجات الجاهزة...</p>}
              {loadError && <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><AlertCircle className="h-4 w-4 shrink-0" />{loadError}</p>}

              <button type="button" onClick={() => { closeOptions(); void shareCustomerStatementOnWhatsApp(statement); }} className="flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-right hover:bg-emerald-100">
                <FileText className="h-5 w-5 shrink-0 text-emerald-700" />
                <span><b className="block text-sm text-slate-900">كشف حساب كامل + PDF</b><small className="text-xs text-slate-600">كل الحركات والأرصدة والتفاصيل</small></span>
              </button>

              <button type="button" onClick={sendBalanceReminder} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-right hover:bg-slate-50">
                <Wallet className="h-5 w-5 shrink-0 text-sky-700" />
                <span><b className="block text-sm text-slate-900">تفاصيل الرصيد والفواتير غير المسددة</b><small className="text-xs text-slate-600">الرصيد: {fmt(statement.customer.currentBalance)} · {invoiceDetails.filter((invoice) => invoice.remainingAmount > 0).length} فاتورة غير مسددة</small></span>
              </button>

              <button type="button" onClick={sendInvoiceDetails} disabled={loading} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-right hover:bg-slate-50 disabled:opacity-50">
                <FileText className="h-5 w-5 shrink-0 text-indigo-700" />
                <span><b className="block text-sm text-slate-900">تفاصيل جميع الفواتير والأصناف</b><small className="text-xs text-slate-600">{invoiceDetails.length} فاتورة مع الكميات والأسعار والخصم والضريبة والسداد</small></span>
              </button>

              <button type="button" onClick={sendPaymentsAndReturns} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-right hover:bg-slate-50">
                <Wallet className="h-5 w-5 shrink-0 text-teal-700" />
                <span><b className="block text-sm text-slate-900">تفاصيل التحصيلات والمرتجعات</b><small className="text-xs text-slate-600">التاريخ والمرجع والمبلغ والرصيد بعد الحركة</small></span>
              </button>

              {overdueInvoices.length > 0 && (
                <button type="button" onClick={sendOverdueReminder} className="flex w-full items-center gap-3 rounded-xl border border-amber-200 p-3 text-right hover:bg-amber-50">
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-700" />
                  <span><b className="block text-sm text-slate-900">تفاصيل الفواتير المتأخرة</b><small className="text-xs text-slate-600">{overdueInvoices.length} فاتورة مع الأصناف ومواعيد الاستحقاق والمتبقي</small></span>
                </button>
              )}

              {readySupplyRequestCount > 0 && (
                <button type="button" onClick={sendReadyProductsNotice} className="flex w-full items-center gap-3 rounded-xl border border-violet-200 p-3 text-right hover:bg-violet-50">
                  <PackageCheck className="h-5 w-5 shrink-0 text-violet-700" />
                  <span><b className="block text-sm text-slate-900">إبلاغ بتوفر الكميات المطلوبة وأسعارها</b><small className="text-xs text-slate-600">{readySupplyRequestCount} طلب اكتملت كمياته مع سعر الوحدة وإجمالي الأصناف وحالة العربون</small></span>
                </button>
              )}

              <div className="rounded-xl border border-slate-200 p-3">
                <label htmlFor="customer-custom-whatsapp-message" className="mb-2 block text-sm font-bold text-slate-900">رسالة مخصصة</label>
                <textarea id="customer-custom-whatsapp-message" rows={4} value={customMessage} onChange={(event) => setCustomMessage(event.target.value)} className="w-full resize-y rounded-lg border border-slate-200 p-3 text-sm leading-6" />
                <button type="button" onClick={sendCustomMessage} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                  <MessageCircle className="h-4 w-4" /> فتح واتساب بالرسالة
                </button>
              </div>
              <p className="text-[11px] text-slate-500">يفتح واتساب محادثة العميل والنص جاهز؛ اضغط إرسال داخل واتساب لتأكيد الإرسال.</p>
            </div>
          </section>
        </div>
      )}
    </>
  );
};
