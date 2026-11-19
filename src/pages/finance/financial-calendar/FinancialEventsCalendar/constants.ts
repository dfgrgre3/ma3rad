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
  { value: 'INCOME', label: 'إيراد', icon: ArrowDown, color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { value: 'EXPENSE', label: 'مصروف', icon: ArrowUp, color: 'bg-rose-50 text-rose-800 border-rose-200' },
  { value: 'CUSTOMER_INVOICE', label: 'فاتورة عميل', icon: ReceiptText, color: 'bg-sky-50 text-sky-800 border-sky-200' },
  { value: 'SUPPLIER_INVOICE', label: 'فاتورة مورد', icon: FileText, color: 'bg-orange-50 text-orange-800 border-orange-200' },
  { value: 'PAYROLL', label: 'رواتب', icon: Users, color: 'bg-violet-50 text-violet-800 border-violet-200' },
  { value: 'INSTALLMENT', label: 'قسط', icon: Landmark, color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  { value: 'TAX', label: 'ضريبة', icon: FileText, color: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'CHEQUE', label: 'شيك', icon: Banknote, color: 'bg-teal-50 text-teal-800 border-teal-200' },
  { value: 'SUBSCRIPTION', label: 'اشتراك', icon: RefreshCw, color: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200' },
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
  if (event.status === 'CANCELLED') return { label: 'ملغي', color: 'bg-slate-100 text-slate-600' };
  if (event.paidAmount >= event.amount) return { label: isIncome(event) ? 'محصل' : 'مدفوع', color: 'bg-emerald-100 text-emerald-800' };
  if (event.paidAmount > 0) return { label: isIncome(event) ? 'محصل جزئيًا' : 'مدفوع جزئيًا', color: 'bg-sky-100 text-sky-800' };
  const today = dateString(new Date());
  if (event.dueDate < today) return { label: 'متأخر', color: 'bg-rose-100 text-rose-800' };
  if (event.dueDate === today) return { label: 'مستحق اليوم', color: 'bg-amber-100 text-amber-900' };
  return { label: 'مجدول', color: 'bg-slate-100 text-slate-700' };
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
