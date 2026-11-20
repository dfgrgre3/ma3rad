import type { PayrollTxType } from '../../../services/domains/hr/EmployeeService';
import { localDateString } from '../../../utils/shared/date';

export const TX_LABELS: Record<PayrollTxType, string> = { SALARY_PAYOUT: 'صرف راتب', ADVANCE: 'سلفة', BONUS: 'مكافأة', DEDUCTION: 'خصم' };
export const TX_COLORS: Record<PayrollTxType, string> = {
  SALARY_PAYOUT: 'bg-accent-soft text-primary border-accent-border',
  ADVANCE: 'bg-warning-soft text-warning border-warning-border',
  BONUS: 'bg-success-soft text-success border-success-border',
  DEDUCTION: 'bg-danger-soft text-danger border-danger-border',
};
export const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';
export const today = () => localDateString();

