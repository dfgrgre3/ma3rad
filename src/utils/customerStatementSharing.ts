import type { CustomerService } from '../services/CustomerService';
import { CeramicMath } from './ceramicMath';
import { buildExportHtml, downloadPdf, type ExportOptions } from './export';
import { buildWhatsAppUrl, openExternalShare } from './externalLinks';

type CustomerStatement = ReturnType<CustomerService['getCustomerStatement']>;

const customerTypeLabels: Record<string, string> = {
  RETAIL: 'قطاعي',
  CONTRACTOR: 'مقاول',
  WHOLESALE: 'جملة',
  ENGINEER: 'مهندس',
};

const formatCurrency = (value: number) => CeramicMath.formatCurrency(Number(value) || 0);

function getTotals(statement: CustomerStatement) {
  return statement.transactions.reduce(
    (totals, transaction) => ({
      debit: totals.debit + Number(transaction.debit || 0),
      credit: totals.credit + Number(transaction.credit || 0),
    }),
    { debit: 0, credit: 0 },
  );
}

export function getCustomerStatementExportOptions(statement: CustomerStatement): ExportOptions {
  const { customer, transactions } = statement;
  const totals = getTotals(statement);
  const balanceType = customer.currentBalance > 0
    ? 'مدين للمعرض'
    : customer.currentBalance < 0
      ? 'دائن للعميل'
      : 'مصفّى';

  return {
    title: `كشف حساب كامل - ${customer.name}`,
    subtitle: [
      `كود العميل: ${customer.code}`,
      customer.phone ? `الهاتف: ${customer.phone}` : '',
      customer.phone2 ? `هاتف إضافي: ${customer.phone2}` : '',
      customerTypeLabels[customer.customerType] ? `النوع: ${customerTypeLabels[customer.customerType]}` : '',
      customer.city ? `المدينة: ${customer.city}` : '',
      customer.address ? `العنوان: ${customer.address}` : '',
      customer.paymentTermsDays ? `مدة السداد: ${customer.paymentTermsDays} يوم` : '',
    ].filter(Boolean).join(' | '),
    columns: [
      { key: 'date', label: 'التاريخ' },
      { key: 'docNumber', label: 'رقم المستند' },
      { key: 'description', label: 'البيان' },
      { key: 'debit', label: 'مدين', type: 'currency' },
      { key: 'credit', label: 'دائن', type: 'currency' },
      { key: 'balanceAfter', label: 'الرصيد', type: 'currency' },
    ],
    rows: transactions.map((transaction) => ({
      date: transaction.date,
      docNumber: transaction.docNumber,
      description: transaction.description,
      debit: formatCurrency(transaction.debit),
      credit: formatCurrency(transaction.credit),
      balanceAfter: formatCurrency(transaction.balanceAfter),
    })),
    kpis: [
      { label: 'الرصيد الحالي', value: formatCurrency(Math.abs(customer.currentBalance)), hint: balanceType },
      { label: 'حد الائتمان', value: formatCurrency(customer.creditLimit) },
      { label: 'إجمالي المشتريات', value: formatCurrency(customer.totalPurchases) },
      { label: 'إجمالي المدين', value: formatCurrency(totals.debit) },
      { label: 'إجمالي الدائن', value: formatCurrency(totals.credit) },
      { label: 'عدد الحركات', value: transactions.length },
    ],
    fileName: `customer-statement-${customer.code || customer.id}`,
    permission: 'customers.export',
  };
}

export function buildCustomerStatementWhatsAppMessage(statement: CustomerStatement): string {
  const { customer, transactions } = statement;
  const totals = getTotals(statement);
  const balanceType = customer.currentBalance > 0
    ? 'مدين للمعرض'
    : customer.currentBalance < 0
      ? 'دائن للعميل'
      : 'مصفّى';
  const lines = [
    `كشف حساب كامل للعميل: ${customer.name}`,
    `كود العميل: ${customer.code}`,
    customerTypeLabels[customer.customerType] ? `نوع العميل: ${customerTypeLabels[customer.customerType]}` : '',
    customer.phone ? `الهاتف: ${customer.phone}` : '',
    customer.phone2 ? `هاتف إضافي: ${customer.phone2}` : '',
    customer.city ? `المدينة: ${customer.city}` : '',
    customer.address ? `العنوان: ${customer.address}` : '',
    customer.paymentTermsDays ? `مدة السداد: ${customer.paymentTermsDays} يوم` : '',
  ].filter(Boolean);
  lines.push(
    '',
    `الرصيد الحالي: ${formatCurrency(Math.abs(customer.currentBalance))} (${balanceType})`,
    `حد الائتمان: ${formatCurrency(customer.creditLimit)}`,
    `إجمالي المشتريات: ${formatCurrency(customer.totalPurchases)}`,
    `إجمالي المدين: ${formatCurrency(totals.debit)}`,
    `إجمالي الدائن: ${formatCurrency(totals.credit)}`,
    `تفاصيل الحركات (${transactions.length}):`,
  );

  if (transactions.length === 0) lines.push('لا توجد حركات مسجلة على الحساب.');
  transactions.forEach((transaction, index) => {
    lines.push(
      `${index + 1}. ${transaction.date} | ${transaction.docNumber} | ${transaction.description}`,
      `   مدين: ${formatCurrency(transaction.debit)} | دائن: ${formatCurrency(transaction.credit)} | الرصيد بعد الحركة: ${formatCurrency(transaction.balanceAfter)}`,
    );
  });
  lines.push('', 'تم إعداد ملف كشف الحساب PDF لإرفاقه مع هذه الرسالة.');

  return lines.join('\n');
}

export async function shareCustomerStatementOnWhatsApp(statement: CustomerStatement): Promise<void> {
  let whatsappOpened = false;
  try {
    const options = getCustomerStatementExportOptions(statement);
    const html = buildExportHtml(options);
    const message = buildCustomerStatementWhatsAppMessage(statement);
    const encodedMessage = encodeURIComponent(message);
    const longMessage = encodedMessage.length > 5000;
    const phone = String(statement.customer.phone || '').replace(/[^0-9]/g, '');
    whatsappOpened = openExternalShare(
      buildWhatsAppUrl(phone, longMessage ? '' : encodedMessage),
      message,
    );

    let messageCopied = false;
    if (whatsappOpened && longMessage) {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(message);
          messageCopied = true;
        } catch (error) {
          console.error('Failed to copy the full customer statement message:', error);
        }
      }
      if (!messageCopied) {
        messageCopied = window.prompt('انسخ نص كشف الحساب الكامل من النافذة وألصقه في محادثة واتساب:', message) !== null;
      }
    }

    const pdfSaved = await downloadPdf(html, options.fileName);
    if (!pdfSaved) {
      if (whatsappOpened) {
        window.alert('تم فتح واتساب، لكن لم يتم حفظ PDF. احفظ الكشف من المعاينة ثم أرفقه في المحادثة.');
      }
      return;
    }
    if (whatsappOpened) {
      const nextStep = longMessage
        ? messageCopied
          ? 'انقل نص الكشف الكامل من نافذة النسخ إلى محادثة واتساب، وأرفق الملف قبل الإرسال.'
          : 'تعذر إدخال نص الكشف الطويل؛ أرسل ملف PDF أو أعد المشاركة.'
        : 'أرفق الملف في محادثة واتساب قبل الإرسال.';
      window.alert(window.ceramisys?.savePdf
        ? `تم حفظ ملف PDF. ${nextStep}`
        : `اختر «حفظ كـ PDF» من نافذة الطباعة، ثم ${nextStep}`);
    }
  } catch (error) {
    console.error('Failed to prepare customer statement PDF:', error);
    window.alert(whatsappOpened
      ? 'تم فتح واتساب، لكن تعذر تجهيز PDF. يمكنك معاينة كشف الحساب وتنزيله ثم إرفاقه يدويًا.'
      : 'تعذر تجهيز كشف الحساب للمشاركة. تحقق من صلاحيات التصدير ثم أعد المحاولة.');
  }
}
