import { AlertCircle, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import type { FiscalCloseCheck } from '../../../../services/domains/finance/FinancePeriodCloseService';
import type { FiscalPeriod } from '../../../../types/finance';

export const formatDate = (value: string) => new Intl.DateTimeFormat('ar-EG', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date(`${value.slice(0, 10)}T00:00:00`));

export const formatClosedAt = (value: string) => new Intl.DateTimeFormat('ar-EG', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

export const formatMoney = (value: number) => new Intl.NumberFormat('ar-EG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0));

export const periodStatus = (period: FiscalPeriod) => {
  const state = period.workflowState || (period.status === 'LOCKED' ? 'LOCKED' : period.status === 'CLOSED' ? 'CLOSED' : 'OPEN');
  if (state === 'LOCKED') return { label: 'مؤمّن نهائيًا', className: 'border-rose-200 bg-rose-50 text-rose-800' };
  if (state === 'CLOSED') return { label: 'مقفلة', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  if (state === 'PENDING_APPROVAL') return { label: 'بانتظار الاعتماد', className: 'border-violet-200 bg-violet-50 text-violet-800' };
  if (state === 'IN_REVIEW') return { label: 'قيد المراجعة', className: 'border-amber-200 bg-amber-50 text-amber-800' };
  return { label: 'مفتوحة', className: 'border-sky-200 bg-sky-50 text-sky-800' };
};

export const checkStatusStyle = (status: FiscalCloseCheck['status']) => {
  if (status === 'PASS') return { label: 'ناجح', className: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 };
  if (status === 'WARNING') return { label: 'تحذير', className: 'border-amber-200 bg-amber-50 text-amber-950', icon: AlertTriangle };
  if (status === 'FAIL') return { label: 'فشل', className: 'border-rose-200 bg-rose-50 text-rose-950', icon: AlertCircle };
  return { label: 'غير منطبق', className: 'border-slate-200 bg-slate-50 text-slate-700', icon: Circle };
};

export const taskStatusLabel: Record<string, string> = {
  PENDING: 'معلقة',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'منفذة',
  REVIEWED: 'مراجعة',
  APPROVED: 'معتمدة',
  CANCELLED: 'ملغاة',
};

export const priorityLabel: Record<string, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  CRITICAL: 'حرجة',
};

export const adjustmentTypeLabel: Record<string, string> = {
  ACCRUED_EXPENSE: 'مصروف مستحق',
  PREPAID_EXPENSE: 'مصروف مقدم',
  ACCRUED_REVENUE: 'إيراد مستحق',
  DEFERRED_REVENUE: 'إيراد مقدم',
  DEPRECIATION: 'إهلاك',
  BAD_DEBT_PROVISION: 'مخصص ديون مشكوك فيها',
  INVENTORY_VARIANCE: 'فروقات مخزون',
  COGS_ADJUSTMENT: 'تسوية تكلفة مبيعات',
  CASH_VARIANCE: 'فروقات خزينة',
  BANK_VARIANCE: 'فروقات بنوك',
  PAYROLL_ACCRUAL: 'تسويات رواتب',
  OTHER: 'أخرى',
};

export type PeriodTab = 'overview' | 'checks' | 'tasks' | 'adjustments' | 'reports' | 'audit';

export interface YearFormState {
  yearCode: string;
  name: string;
  startDate: string;
  endDate: string;
  companyId: string;
  currency: string;
  yearType: string;
  previousYearId: string;
}

export interface TaskFormState {
  title: string;
  description: string;
  department: string;
  assigneeUserId: string;
  dueDate: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface AdjustmentFormState {
  adjustmentType: string;
  description: string;
  amount: string;
  debitAccountCode: string;
  creditAccountCode: string;
}

export interface LegacyReconcileFormState {
  balance: string;
  evidenceReference: string;
  notes: string;
}

export interface LegacyReconcileTarget {
  partyType: 'CUSTOMER' | 'SUPPLIER';
  label: string;
}

export const initialYearForm = (): YearFormState => ({
  yearCode: '', name: '', startDate: '', endDate: '', companyId: 'cmp_main',
  currency: 'EGP', yearType: 'STANDARD', previousYearId: '',
});

export const initialTaskForm = (): TaskFormState => ({
  title: '', description: '', department: '', assigneeUserId: '', dueDate: '', priority: 'MEDIUM',
});

export const initialAdjustmentForm = (): AdjustmentFormState => ({
  adjustmentType: 'ACCRUED_EXPENSE', description: '', amount: '', debitAccountCode: '', creditAccountCode: '',
});

export const initialLegacyReconcileForm = (): LegacyReconcileFormState => ({
  balance: '', evidenceReference: '', notes: '',
});
