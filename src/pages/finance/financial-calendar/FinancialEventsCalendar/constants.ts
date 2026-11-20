import {
  ArrowDown,
  ArrowUp,
  Banknote,
  FileText,
  Landmark,
  ReceiptText,
  RefreshCw,
  Users,
} from 'lucide-react';
import type {
  FinancialCalendarEvent,
  FinancialEventType,
} from '../../../../services/domains/finance/FinancialCalendarEventsService';
import type { EventFormState } from './types';

export const typeOptions: Array<{
  value: FinancialEventType;
  label: string;
  icon: typeof ArrowDown;
  color: string;
}> = [
  { value: 'INCOME', label: 'إيراد', icon: ArrowDown, color: 'bg-success-soft text-success border-success-border' },
  { value: 'EXPENSE', label: 'مصروف', icon: ArrowUp, color: 'bg-danger-soft text-danger border-danger-border' },
  { value: 'CUSTOMER_INVOICE', label: 'فاتورة عميل', icon: ReceiptText, color: 'bg-accent-soft text-primary border-accent-border' },
  { value: 'SUPPLIER_INVOICE', label: 'فاتورة مورد', icon: FileText, color: 'bg-warning-soft text-warning border-warning-border' },
  { value: 'PAYROLL', label: 'رواتب', icon: Users, color: 'bg-accent-soft text-primary border-accent-border' },
  { value: 'INSTALLMENT', label: 'قسط', icon: Landmark, color: 'bg-accent-soft text-primary border-accent-border' },
  { value: 'TAX', label: 'ضريبة', icon: FileText, color: 'bg-warning-soft text-warning border-warning-border' },
  { value: 'CHEQUE', label: 'شيك', icon: Banknote, color: 'bg-success-soft text-success border-success-border' },
  { value: 'SUBSCRIPTION', label: 'اشتراك', icon: RefreshCw, color: 'bg-accent-soft text-primary border-accent-border' },
];

export const reportOptions = [
  { value: 'all', label: 'كل الأحداث والتدفقات' },
  { value: 'income', label: 'الإيرادات المتوقعة والمحصلة' },
  { value: 'expenses', label: 'المصروفات المتوقعة والمدفوعة' },
  { value: 'upcoming', label: 'الالتزامات القادمة' },
  { value: 'overdue', label: 'الفواتير المتأخرة' },
  { value: 'customers', label: 'المستحقات على العملاء' },
  { value: 'suppliers', label: 'المستحقات للموردين' },
];

export const dateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const startOfWeek = (date: Date) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 1) % 7));
  return result;
};

export const addDays = (date: Date, count: number) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + count);
  return result;
};

export const monthName = (date: Date) => new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(date);
export const fullDate = (value: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
export const amountText = (amount: number, currency = 'EGP') => new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency,
  maximumFractionDigits: 2,
}).format(amount);

export const totalsByCurrency = (events: FinancialCalendarEvent[], amount: (event: FinancialCalendarEvent) => number) => {
  const totals = new Map<string, number>();
  events.forEach((event) => totals.set(event.currency, (totals.get(event.currency) || 0) + amount(event)));
  return totals.size
    ? [...totals].map(([currency, value]) => amountText(value, currency)).join(' · ')
    : amountText(0);
};

export function isIncome(event: Pick<FinancialCalendarEvent, 'eventType'>) {
  return event.eventType === 'INCOME' || event.eventType === 'CUSTOMER_INVOICE';
}

export function eventStatus(event: FinancialCalendarEvent): { label: string; color: string } {
  if (event.status === 'CANCELLED') return { label: 'ملغي', color: 'bg-surface-sunken text-ink-secondary' };
  if (event.paidAmount >= event.amount) return { label: isIncome(event) ? 'محصل' : 'مدفوع', color: 'bg-success-soft text-success' };
  if (event.paidAmount > 0) return { label: isIncome(event) ? 'محصل جزئيًا' : 'مدفوع جزئيًا', color: 'bg-accent-soft text-primary' };
  const today = dateString(new Date());
  if (event.dueDate < today) return { label: 'متأخر', color: 'bg-danger-soft text-danger' };
  if (event.dueDate === today) return { label: 'مستحق اليوم', color: 'bg-warning-soft text-warning' };
  return { label: 'مجدول', color: 'bg-surface-sunken text-ink' };
}

export const emptyForm = (date: string): EventFormState => ({
  title: '',
  eventType: 'INCOME',
  amount: 0,
  currency: 'EGP',
  dueDate: date,
  reminderAt: '',
  reminderDays: [],
  partyType: 'OTHER',
  partyId: '',
  partyName: '',
  financialAccount: '',
  reference: '',
  description: '',
});

export function auditLabel(action: string): string {
  const labels: Record<string, string> = {
    CREATE: 'إنشاء الحدث',
    UPDATE: 'تعديل الحدث',
    PAYMENT: 'تسجيل دفعة أو تحصيل',
    RESCHEDULE: 'تأجيل الاستحقاق',
    CANCEL: 'إلغاء الحدث',
    ATTACHMENT: 'إرفاق مستند',
  };
  return labels[action] || action;
}
