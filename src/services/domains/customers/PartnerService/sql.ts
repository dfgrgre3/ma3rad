import type { PartnerTransactionType } from './types';

const typeTotal = (type: PartnerTransactionType, alias: string): string => `
  COALESCE(SUM(CASE
    WHEN t.transaction_type = '${type}' THEN t.amount
    WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = '${type}' THEN -t.amount
    ELSE 0
  END), 0) / 100.0 AS ${alias}`;

export const PARTNER_SUMMARY_SQL = `
  ${typeTotal('CAPITAL_CONTRIBUTION', 'capitalContributions')},
  ${typeTotal('WITHDRAWAL', 'withdrawals')},
  ${typeTotal('PROFIT_ALLOCATION', 'profitsDue')},
  ${typeTotal('PROFIT_DISTRIBUTION', 'profitsDistributed')},
  ${typeTotal('PARTNER_EXPENSE_PAID', 'expensesPaid')},
  ${typeTotal('COMPANY_EXPENSE_FOR_PARTNER', 'expensesForPartner')},
  ${typeTotal('PARTNER_LOAN', 'loansReceived')},
  ${typeTotal('LOAN_REPAYMENT', 'loansRepaid')},
  ${typeTotal('PERSONAL_DRAWING', 'personalDrawings')},
  COALESCE(SUM(CASE
    WHEN t.transaction_type = 'ADJUSTMENT_INCREASE' THEN t.amount
    WHEN t.transaction_type = 'ADJUSTMENT_DECREASE' THEN -t.amount
    WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'ADJUSTMENT_INCREASE' THEN -t.amount
    WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'ADJUSTMENT_DECREASE' THEN t.amount
    ELSE 0
  END), 0) / 100.0 AS adjustments,
  COALESCE(SUM(t.balance_effect), 0) / 100.0 AS netBalance
`;

export const PARTNER_SUMMARY_JOIN = `
  FROM business_partners p
  LEFT JOIN partner_account_transactions t ON t.partner_id = p.id
`;

export const PARTNER_SELECT_COLUMNS = `
  p.id, p.company_id AS companyId, p.name, p.phone, p.email,
  p.ownership_percent AS ownershipPercent, p.profit_share_percent AS profitSharePercent,
  p.capital_amount / 100.0 AS capitalAmount,
  p.is_active AS isActive, p.notes, p.created_at AS createdAt, p.updated_at AS updatedAt
`;
