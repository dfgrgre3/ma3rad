import { paymentAccountCode } from '../../../../database/repositories/ledger';
import { getActiveBankAccount } from '../paymentAccounts';
import { computeSaleTotals, round2 } from '../../finance/financials';
import { resolvePayments, capPayments } from './payments';
import type { CreateSaleDTO } from '../../../../types/sales/serviceTypes';

export function buildLedgerEntries(
  sqliteDb: any,
  dto: CreateSaleDTO,
  totals: ReturnType<typeof computeSaleTotals>,
  inventoryCost: number,
  serviceCost = 0
): any[] {
  const payments = resolvePayments(dto);
  // Cap total tender at the invoice total to keep the ledger balanced.
  // Any excess (changeDue) is a physical cash flow, not a ledger entry.
  const cappedPayments = capPayments(payments, totals.totalAmount);
  const paymentLines = cappedPayments.map((p) => ({
    accountCode: p.method === 'BANK_TRANSFER'
      ? getActiveBankAccount(sqliteDb, p.bankAccountId).glAccountCode
      : paymentAccountCode(p.method),
    debit: round2(p.amount),
    credit: 0,
  }));
  return [
    ...paymentLines,
    ...(totals.remainingAmount > 0 ? [{
      accountCode: '1103',
      debit: totals.remainingAmount,
      credit: 0,
    }] : []),
    {
      accountCode: '4101',
      debit: 0,
      credit: round2(totals.subtotal - totals.discountAmount),
    },
    ...(totals.shippingCost > 0 ? [{
      accountCode: '4102',
      debit: 0,
      credit: totals.shippingCost,
    }] : []),
    ...(totals.extraFees > 0 ? [{
      accountCode: '4103',
      debit: 0,
      credit: totals.extraFees,
    }] : []),
    ...(totals.taxAmount > 0 ? [{
      accountCode: '2102',
      debit: 0,
      credit: totals.taxAmount,
    }] : []),
    ...(inventoryCost > 0 ? [
      { accountCode: '5101', debit: inventoryCost, credit: 0 },
      { accountCode: '1104', debit: 0, credit: inventoryCost },
    ] : []),
    // Service lines carry a real direct cost but no inventory asset to relieve.
    // Post it against an accrued-service liability so the entry stays balanced.
    ...(serviceCost > 0 ? [
      { accountCode: '5102', debit: serviceCost, credit: 0 },
      { accountCode: '2105', debit: 0, credit: serviceCost },
    ] : []),
  ];
}
