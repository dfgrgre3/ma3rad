import type { PartnerTransactionAction, PartnerTransactionType } from './types';

export const MONEY_EPSILON = 0.005;

export function money(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function assertAmount(amount: number): number {
  const normalized = money(Number(amount));
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('يجب إدخال مبلغ أكبر من صفر.');
  }
  return normalized;
}

export function assertDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error('تاريخ العملية غير صحيح.');
  }
  return value;
}

const POSITIVE_TYPES: PartnerTransactionType[] = [
  'CAPITAL_CONTRIBUTION',
  'PROFIT_ALLOCATION',
  'PARTNER_EXPENSE_PAID',
  'PARTNER_LOAN',
  'ADJUSTMENT_INCREASE',
];

/** Signed effect of a movement on the partner account. Positive = owed to the partner. */
export function signedAmount(type: PartnerTransactionType, amount: number): number {
  if (type === 'REVERSAL') {
    throw new Error('يتم احتساب أثر العكس من الحركة الأصلية.');
  }
  return POSITIVE_TYPES.includes(type) ? amount : -amount;
}

export const CASH_AFFECTING_TYPES: PartnerTransactionAction[] = [
  'CAPITAL_CONTRIBUTION',
  'WITHDRAWAL',
  'PROFIT_DISTRIBUTION',
  'COMPANY_EXPENSE_FOR_PARTNER',
  'PARTNER_LOAN',
  'LOAN_REPAYMENT',
  'PERSONAL_DRAWING',
];
