import { customerTypeLabels, formatCurrency, getTotals } from './customerStatementSharing_part01';
import type { CustomerStatement } from './customerStatementSharing_part01';

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
