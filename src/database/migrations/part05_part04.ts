import type { Database } from 'sql.js';
import { paymentAccountCode, postLedgerEntry, queryLedgerRows } from '../repositories/ledger';
import { backfillReturnLedgerEntries, type Migration } from './support';
import { ensureLedgerAccounts, getLedgerActorId } from './part05_part01';
import type { ExpenseLedgerRow } from './part05_part01';
import { backfillSalesLedgerEntries } from './part05_part02';
import { backfillCustomerPayments, backfillPurchaseLedgerEntries, backfillSupplierPayments } from './part05_part03';

export function backfillExpenses(db: Database, actorId: string): void {
  const expenses = queryLedgerRows<ExpenseLedgerRow>(
    db,
    'SELECT id, date, description, amount, payment_type, performed_by FROM expenses ORDER BY date, created_at, id'
  );
  for (const expense of expenses) {
    const amount = Number(expense.amount);
    postLedgerEntry(db, {
      date: expense.date,
      description: expense.description,
      referenceType: 'EXPENSE',
      referenceId: expense.id,
      createdBy: expense.performed_by || actorId,
      lines: [
        { accountCode: '5201', debit: amount, credit: 0 },
        { accountCode: paymentAccountCode(expense.payment_type), debit: 0, credit: amount },
      ],
    });
  }
}

export const MIGRATION_PART_05: Migration[] = [
{
    id: '024_unified_accounting_ledger',
    description: 'Add ledger clearing accounts and backfill balanced entries from existing transactions',
    up: (db) => {
      ensureLedgerAccounts(db);
      const actorId = getLedgerActorId(db);
      if (!actorId) return;

      backfillSalesLedgerEntries(db, actorId);
      backfillPurchaseLedgerEntries(db, actorId);
      backfillCustomerPayments(db, actorId);
      backfillSupplierPayments(db, actorId);
      backfillExpenses(db, actorId);
      backfillReturnLedgerEntries(db);
    },
  }
];
