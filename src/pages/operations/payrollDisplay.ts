import type { PayrollTxType } from '../../services/EmployeeService';
import { localDateString } from '../../utils/date';

export const TX_LABELS: Record<PayrollTxType, string> = { SALARY_PAYOUT: 'صرف راتب', ADVANCE: 'سلفة', BONUS: 'مكافأة', DEDUCTION: 'خصم' };
export const TX_COLORS: Record<PayrollTxType, string> = {
  SALARY_PAYOUT: 'bg-sky-50 text-sky-700 border-sky-200',
  ADVANCE: 'bg-amber-50 text-amber-700 border-amber-200',
  BONUS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DEDUCTION: 'bg-rose-50 text-rose-700 border-rose-200',
};
export const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';
export const today = () => localDateString();

