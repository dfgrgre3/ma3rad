import { round2 } from '../../finance/financials';
import { localDateString } from '../../../../utils/shared/date';

export const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const sum = (rows: Array<Record<string, any>>, key: string): number =>
  round2(rows.reduce((total, row) => total + num(row[key]), 0));

export const classifyExpense = (category?: string | null, description?: string | null): 'fixed' | 'variable' | 'semi' => {
  const haystack = `${category || ''} ${description || ''}`.toLowerCase();
  const fixedTerms = ['راتب', 'رواتب', 'أجرة', 'إيجار', 'مكتب', 'إدارة', 'مصاريف ثابت', 'تأمين', 'اتصالات', 'مياه', 'كهرباء', 'ضرائب', 'اشتراك', 'مزايا'];
  const variableTerms = ['شحن', 'توصيل', 'حمل', 'موزع', 'عمولة', 'مناولة', 'مستلزمات', 'مواد', 'تعبئة', 'تغليف', 'برد', 'خدمة حسب', 'مبيعات', 'مستلزمات'];
  if (fixedTerms.some((term) => haystack.includes(term))) return 'fixed';
  if (variableTerms.some((term) => haystack.includes(term))) return 'variable';
  if (/(صيانة|نقل|موبايل|مرفق|طاقة|خدمة)/.test(haystack)) return 'semi';
  return 'fixed';
};

export const daysBetween = (from: string, to: string): number => {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
};

export const shiftDate = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return localDateString(value);
};

export const previousRange = (from: string, to: string): { from: string; to: string } => {
  const length = Math.max(1, daysBetween(from, to) + 1);
  const previousTo = shiftDate(from, -1);
  return { from: shiftDate(previousTo, -(length - 1)), to: previousTo };
};

export const normalizeReportFilterValue = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export const rowPropertyVariants = (key: string): string[] => {
  const variants = new Set<string>([
    key,
    key.toLowerCase(),
    key.replace(/([A-Z])/g, '_$1').toLowerCase(),
    key.replace(/Id$/i, '_id'),
    key.replace(/_id$/i, 'Id'),
    key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(),
    key.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase(),
  ]);

  switch (key) {
    case 'branchId':
      variants.add('branch_id'); variants.add('branch'); variants.add('branchName'); variants.add('branch_name'); break;
    case 'warehouseId':
      variants.add('warehouse_id'); variants.add('warehouse'); variants.add('warehouseName'); variants.add('warehouse_name'); break;
    case 'registerId':
      variants.add('register_id'); variants.add('cash_register_id'); variants.add('register'); variants.add('cashRegisterId'); break;
    case 'customerId':
      variants.add('customer_id'); variants.add('customer'); variants.add('client_id'); variants.add('client'); variants.add('customerName'); break;
    case 'supplierId':
      variants.add('supplier_id'); variants.add('vendor_id'); variants.add('supplier'); variants.add('vendor'); break;
    case 'employeeId':
      variants.add('employee_id'); variants.add('user_id'); variants.add('userId'); variants.add('rep_id'); variants.add('sales_rep_id'); variants.add('created_by'); break;
    case 'status':
      variants.add('invoice_status'); variants.add('payment_status'); variants.add('state'); variants.add('doc_status'); break;
    case 'paymentMethod':
      variants.add('payment_method'); variants.add('means_of_payment'); variants.add('method'); variants.add('payment'); break;
    case 'compareBranchId':
      variants.add('compare_branch_id'); variants.add('compareBranch'); variants.add('compare_branch'); break;
    default:
      break;
  }

  return Array.from(variants);
};

export function fmtMoney(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(number)} ج`;
}

export function dimensionLabel(dimension: string): string {
  if (dimension === 'customer') return 'العميل';
  if (dimension === 'rep') return 'المندوب';
  if (dimension === 'product') return 'الصنف';
  return 'المخزن';
}
