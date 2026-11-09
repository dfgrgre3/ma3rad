import type { CustomerService } from '../../services/customers/CustomerService';
import { CeramicMath } from '../products/ceramicMath';
import { type ExportOptions } from '../export/export';

export type CustomerStatement = ReturnType<CustomerService['getCustomerStatement']>;

export const customerTypeLabels: Record<string, string> = {
  RETAIL: 'قطاعي',
  CONTRACTOR: 'مقاول',
  WHOLESALE: 'جملة',
  ENGINEER: 'مهندس',
};

export const formatCurrency = (value: number) => CeramicMath.formatCurrency(Number(value) || 0);

export function getTotals(statement: CustomerStatement) {
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
