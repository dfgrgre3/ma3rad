import { CashShiftPolicyService } from '../../finance/CashShiftPolicyService';
import { getActiveBankAccount, updateBankBalance } from '../paymentAccounts';
import { computeSaleTotals, round2 } from '../../finance/financials';
import type { PaymentType } from '../../../../types';
import type { CreateSaleDTO } from '../../../../types/sales/serviceTypes';
import type { SalesContext } from '../context';

export function resolvePayments(dto: CreateSaleDTO): { method: PaymentType; amount: number; reference?: string; bankAccountId?: string }[] {
  if (dto.payments && dto.payments.length > 0) {
    // ── CREDIT legs are NOT tender payments: they are the invoice's receivable
    // (remaining_amount on the invoice + customer balance). Posting them here
    // would double-count and break the ledger mapping (no CREDIT account exists).
    return dto.payments.filter((p) => p.amount > 0 && (p.method as PaymentType) !== 'CREDIT')
      .map((p) => ({ ...p, bankAccountId: p.bankAccountId || dto.bankAccountId }));
  }
  if (dto.paidAmount > 0) {
    return [{ method: dto.paymentType, amount: dto.paidAmount, bankAccountId: dto.bankAccountId }];
  }
  return [];
}

/** Cap tender payments at a maximum total (e.g., invoice totalAmount). Excess is changeDue. */
export function capPayments(payments: ReturnType<typeof resolvePayments>, maxTotal: number): ReturnType<typeof resolvePayments> {
  const capped: ReturnType<typeof resolvePayments> = [];
  let remaining = maxTotal;
  for (const p of payments) {
    if (remaining <= 0) break;
    const cappedAmount = Math.min(p.amount, remaining);
    if (cappedAmount > 0) {
      capped.push({ ...p, amount: round2(cappedAmount) });
      remaining = round2(remaining - cappedAmount);
    }
  }
  return capped;
}

export function resolveCashRegister(
  ctx: SalesContext,
  dto: CreateSaleDTO,
  actor: any,
  tenderPayments: ReturnType<typeof resolvePayments>
): { branchId: string; cashRegisterId: string; shiftId: string | undefined } {
  const branchId = ctx.branchAccess.requireWarehouseAccess(dto.warehouseId, actor);
  const requiresShift = tenderPayments.some((payment) => payment.method === 'CASH' && payment.amount > 0);
  const shift = new CashShiftPolicyService().resolve(branchId, { shiftId: dto.shiftId, required: requiresShift });
  // Do NOT mutate dto — return shiftId explicitly to avoid side effects.
  const cashRegisterId = shift.registerId || ctx.branchAccess.getDefaultRegisterId(branchId, actor);
  return { branchId, cashRegisterId, shiftId: shift.shiftId };
}

export function updateCustomerAndCash(
  sqliteDb: any,
  dto: CreateSaleDTO,
  totals: ReturnType<typeof computeSaleTotals>,
  cashRegisterId: string,
  shiftId: string | undefined
): void {
  sqliteDb.run(`
    UPDATE customers SET
      total_purchases = total_purchases + ROUND(?*100),
      current_balance = current_balance + ROUND(?*100),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [totals.totalAmount, totals.remainingAmount, dto.customerId]);

  const payments = resolvePayments(dto);
  // Use capped payments for cash register / shift / ledger so physical cash matches accounting.
  const cappedPayments = capPayments(payments, totals.totalAmount);
  if (cappedPayments.length === 0) return;

  // Cash portion goes to the cash register drawer (net of changeDue).
  const cashPortion = cappedPayments.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amount, 0);
  if (cashPortion > 0) {
    sqliteDb.run(`UPDATE cash_registers SET current_balance = current_balance + ROUND(?*100) WHERE id = ?`, [cashPortion, cashRegisterId]);
  }
  for (const payment of cappedPayments.filter((row) => row.method === 'BANK_TRANSFER')) {
    const bank = getActiveBankAccount(sqliteDb, payment.bankAccountId);
    updateBankBalance(sqliteDb, bank.id, payment.amount);
  }

  if (!shiftId) return;

  // Aggregate per method into the shift buckets (net of changeDue).
  const cashTotal = cappedPayments.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amount, 0);
  const cardTotal = cappedPayments.filter((p) => p.method === 'CARD').reduce((s, p) => s + p.amount, 0);
  const transferTotal = cappedPayments.filter((p) => p.method === 'BANK_TRANSFER' || p.method === 'CHEQUE').reduce((s, p) => s + p.amount, 0);
  if (cashTotal > 0) sqliteDb.run(`UPDATE cash_shifts SET total_sales_cash = total_sales_cash + ROUND(?*100) WHERE id = ?`, [cashTotal, shiftId]);
  if (cardTotal > 0) sqliteDb.run(`UPDATE cash_shifts SET total_sales_card = total_sales_card + ROUND(?*100) WHERE id = ?`, [cardTotal, shiftId]);
  if (transferTotal > 0) sqliteDb.run(`UPDATE cash_shifts SET total_sales_transfer = total_sales_transfer + ROUND(?*100) WHERE id = ?`, [transferTotal, shiftId]);
}

