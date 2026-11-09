import type { Database } from 'sql.js';
import { postLedgerEntry } from '../repositories/ledger';
import type { PurchaseReturnLedgerRow } from './support_part02';

export function postPurchaseReturnLedgerEntry(
  db: Database,
  returned: PurchaseReturnLedgerRow,
  actorId: string
): void {
  postLedgerEntry(db, {
    date: returned.date,
    description: `Purchase return ${returned.return_number}`,
    referenceType: 'PURCHASE_RETURN',
    referenceId: returned.id,
    createdBy: returned.created_by || actorId,
    lines: [
      ...(Number(returned.refunded_amount) > 0 ? [{
        accountCode: '1101',
        debit: Number(returned.refunded_amount),
        credit: 0,
      }] : []),
      ...(Number(returned.remaining_to_balance) > 0 ? [{
        accountCode: '2101',
        debit: Number(returned.remaining_to_balance),
        credit: 0,
      }] : []),
      { accountCode: '1104', debit: 0, credit: Number(returned.total_amount) },
    ],
  });
}

// ─── Migrations ───────────────────────────────────────────────────────────────

export interface Migration {
  id: string;
  description: string;
  disableForeignKeys?: boolean;
  up: (db: Database) => void;
}
