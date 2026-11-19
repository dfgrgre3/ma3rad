import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { paymentAccountCode } from '../../../../database/repositories/ledger';
import type {
  PartnerPaymentType,
  PartnerTransactionAction,
  PartnerTransactionType,
} from './types';

export function partnerCapitalAccountCode(partnerId: string): string {
  return `3103_${partnerId}`;
}

export function partnerCurrentAccountCode(partnerId: string): string {
  return `2103_${partnerId}`;
}

export function partnerReceivableAccountCode(partnerId: string): string {
  return `1106_${partnerId}`;
}

export function createPartnerLedgerAccounts(db: DatabaseManager, partnerId: string, partnerName: string): void {
  const accounts = [
    [partnerCapitalAccountCode(partnerId), `رأس مال الشريك - ${partnerName}`, 'EQUITY', '3103'],
    [partnerCurrentAccountCode(partnerId), `الحساب الجاري للشريك - ${partnerName}`, 'LIABILITY', '2103'],
    [partnerReceivableAccountCode(partnerId), `ذمم مدينة على الشريك - ${partnerName}`, 'ASSET', '1106'],
  ] as const;
  for (const [code, name, type, parentCode] of accounts) {
    db.run(`
      INSERT INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
      VALUES (?, ?, ?, ?, ?, 0, 1)
    `, [`acc_${code}`, code, name, type, parentCode]);
  }
}

export function transactionLabel(type: PartnerTransactionType): string {
  const labels: Record<PartnerTransactionType, string> = {
    CAPITAL_CONTRIBUTION: 'إيداع مساهمة رأسمالية',
    WITHDRAWAL: 'سحب من رأس المال',
    PROFIT_ALLOCATION: 'استحقاق أرباح',
    PROFIT_DISTRIBUTION: 'صرف أرباح',
    PARTNER_EXPENSE_PAID: 'مصروف دفعه الشريك عن الشركة',
    COMPANY_EXPENSE_FOR_PARTNER: 'مصروف دفعته الشركة عن الشريك',
    PARTNER_LOAN: 'قرض من الشريك للشركة',
    LOAN_REPAYMENT: 'سداد قرض الشريك',
    PERSONAL_DRAWING: 'مسحوبات شخصية للشريك',
    ADJUSTMENT_INCREASE: 'تسوية رصيد الشريك بالزيادة',
    ADJUSTMENT_DECREASE: 'تسوية رصيد الشريك بالنقص',
    REVERSAL: 'عكس حركة شريك',
  };
  return labels[type];
}

export function cashDelta(type: PartnerTransactionType, amount: number): number {
  switch (type) {
    case 'CAPITAL_CONTRIBUTION':
    case 'PARTNER_LOAN':
      return amount;
    case 'WITHDRAWAL':
    case 'PROFIT_DISTRIBUTION':
    case 'COMPANY_EXPENSE_FOR_PARTNER':
    case 'LOAN_REPAYMENT':
    case 'PERSONAL_DRAWING':
      return -amount;
    case 'PROFIT_ALLOCATION':
    case 'PARTNER_EXPENSE_PAID':
    case 'ADJUSTMENT_INCREASE':
    case 'ADJUSTMENT_DECREASE':
    case 'REVERSAL':
      return 0;
  }
}

export function getPostingLines(
  type: PartnerTransactionAction,
  amount: number,
  paymentType: PartnerPaymentType | undefined,
  partnerId: string,
  bankAccountCode?: string
) {
  const paymentCode = paymentType === 'BANK_TRANSFER' && bankAccountCode
    ? bankAccountCode
    : paymentType ? paymentAccountCode(paymentType) : null;
  switch (type) {
    case 'CAPITAL_CONTRIBUTION':
      return [
        { accountCode: paymentCode!, debit: amount, credit: 0 },
        { accountCode: partnerCapitalAccountCode(partnerId), debit: 0, credit: amount },
      ];
    case 'WITHDRAWAL':
      return [
        { accountCode: partnerCapitalAccountCode(partnerId), debit: amount, credit: 0 },
        { accountCode: paymentCode!, debit: 0, credit: amount },
      ];
    case 'PROFIT_DISTRIBUTION':
      return [
        { accountCode: partnerCurrentAccountCode(partnerId), debit: amount, credit: 0 },
        { accountCode: paymentCode!, debit: 0, credit: amount },
      ];
    case 'PARTNER_EXPENSE_PAID':
      return [
        { accountCode: '5201', debit: amount, credit: 0 },
        { accountCode: partnerCurrentAccountCode(partnerId), debit: 0, credit: amount },
      ];
    case 'COMPANY_EXPENSE_FOR_PARTNER':
      return [
        { accountCode: partnerReceivableAccountCode(partnerId), debit: amount, credit: 0 },
        { accountCode: paymentCode!, debit: 0, credit: amount },
      ];
    case 'PARTNER_LOAN':
      return [
        { accountCode: paymentCode!, debit: amount, credit: 0 },
        { accountCode: partnerCurrentAccountCode(partnerId), debit: 0, credit: amount },
      ];
    case 'LOAN_REPAYMENT':
    case 'PERSONAL_DRAWING':
      return [
        { accountCode: partnerCurrentAccountCode(partnerId), debit: amount, credit: 0 },
        { accountCode: paymentCode!, debit: 0, credit: amount },
      ];
    case 'ADJUSTMENT_INCREASE':
      return [
        { accountCode: '3104', debit: amount, credit: 0 },
        { accountCode: partnerCurrentAccountCode(partnerId), debit: 0, credit: amount },
      ];
    case 'ADJUSTMENT_DECREASE':
      return [
        { accountCode: partnerCurrentAccountCode(partnerId), debit: amount, credit: 0 },
        { accountCode: '3104', debit: 0, credit: amount },
      ];
  }
}

/**
 * Applies (or rolls back) the cash-register and open-shift effects of a
 * movement. Reversals remove the amount from the same bucket the original
 * movement was recorded in so shift totals stay a gross summary.
 */
export function applyCashMovement(
  db: DatabaseManager,
  type: PartnerTransactionType,
  amount: number,
  paymentType: PartnerPaymentType | null | undefined,
  registerId: string | null | undefined,
  branchId: string,
  isReversal: boolean,
  originalDelta?: number
): void {
  if (paymentType !== 'CASH' || !registerId) return;
  const delta = isReversal ? -Number(originalDelta ?? cashDelta(type, amount)) : cashDelta(type, amount);
  if (delta === 0) return;

  db.run('UPDATE cash_registers SET current_balance = current_balance + ROUND(?*100) WHERE id = ?', [delta, registerId]);
  const shift = db.query<{ id: string }>(
    `SELECT id FROM cash_shifts WHERE register_id = ? AND branch_id = ? AND status = 'OPEN'
     ORDER BY opened_at DESC LIMIT 1`,
    [registerId, branchId]
  )[0];
  if (!shift) return;

  if (!isReversal) {
    if (delta > 0) {
      db.run('UPDATE cash_shifts SET total_partner_inflows = total_partner_inflows + ROUND(?*100) WHERE id = ?', [amount, shift.id]);
    } else {
      db.run('UPDATE cash_shifts SET total_partner_outflows = total_partner_outflows + ROUND(?*100) WHERE id = ?', [amount, shift.id]);
    }
    return;
  }

  const originalWasInflow = Number(originalDelta) > 0;
  if (originalWasInflow) {
    db.run('UPDATE cash_shifts SET total_partner_inflows = MAX(0, total_partner_inflows - ROUND(?*100)) WHERE id = ?', [amount, shift.id]);
  } else {
    db.run('UPDATE cash_shifts SET total_partner_outflows = MAX(0, total_partner_outflows - ROUND(?*100)) WHERE id = ?', [amount, shift.id]);
  }
}
