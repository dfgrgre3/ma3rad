import type { Database } from 'sql.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { paymentAccountCode, postLedgerEntry, queryLedgerRows } from '../ledger';
import { localDateString } from '../../utils/date';
import {
  DEFAULT_SETTINGS, DEFAULT_BRANCH_ID, EXTENDED_SETTINGS_KEYS,
  tableExists, columnExists, addColumn, backfillReturnLedgerEntries,
  type Migration,
} from '../migrationSupport';

function payrollEntryLines(type: string, amount: number) {
  switch (type) {
    case 'ADVANCE':
      return [{ accountCode: '1202', debit: amount, credit: 0 }, { accountCode: '1101', debit: 0, credit: amount }];
    case 'BONUS':
      return [{ accountCode: '5202', debit: amount, credit: 0 }, { accountCode: '2104', debit: 0, credit: amount }];
    case 'DEDUCTION':
      return [{ accountCode: '2104', debit: amount, credit: 0 }, { accountCode: '5202', debit: 0, credit: amount }];
    default:
      return [{ accountCode: '5202', debit: amount, credit: 0 }, { accountCode: '1101', debit: 0, credit: amount }];
  }
}

export const MIGRATION_PART_07: Migration[] = [
{
    id: '030_payroll_and_inventory_accounts',
    description: 'Add payroll liability and inventory adjustment accounts, then backfill commission entries',
    up: (db) => {
      const accounts: Array<[string, string, string, string]> = [
        ['acc_2103', '2103', 'Commission payable', 'LIABILITY'],
        ['acc_4190', '4190', 'Inventory adjustment gains', 'REVENUE'],
        ['acc_5290', '5290', 'Inventory shrinkage and damage', 'EXPENSE'],
      ];
      for (const [id, code, name, type] of accounts) {
        db.run('INSERT OR IGNORE INTO chart_of_accounts (id,code,name,type,parent_code,balance,is_active) VALUES (?,?,?, ?,NULL,0,1)', [id, code, name, type]);
      }
      const commissions = queryLedgerRows<{ id: string; commission_amount: number; status: string; paid_at: string | null; created_by: string }>(
        db, `SELECT id,commission_amount,status,paid_at,created_by FROM commissions WHERE status IN ('APPROVED','PAID') ORDER BY created_at,id`);
      const fallbackActor = queryLedgerRows<{ id: string }>(db, 'SELECT id FROM users ORDER BY created_at,id LIMIT 1')[0]?.id;
      for (const commission of commissions) {
        const amount = Math.round((Number(commission.commission_amount) || 0) * 100) / 100;
        if (amount <= 0) continue;
        const createdBy = commission.created_by || fallbackActor;
        if (!createdBy) throw new Error('Cannot backfill commission accounting without a valid user.');
        if (!queryLedgerRows(db, `SELECT id FROM journal_entries WHERE reference_type='COMMISSION_APPROVAL' AND reference_id=?`, [commission.id]).length) {
          postLedgerEntry(db, {
            date: (commission.paid_at || localDateString()).slice(0, 10),
            description: `Commission accrual ${commission.id}`,
            referenceType: 'COMMISSION_APPROVAL', referenceId: commission.id, createdBy,
            lines: [{ accountCode: '5202', debit: amount, credit: 0 }, { accountCode: '2103', debit: 0, credit: amount }],
          });
        }
        if (commission.status === 'PAID' && !queryLedgerRows(db, `SELECT id FROM journal_entries WHERE reference_type='COMMISSION_PAYMENT' AND reference_id=?`, [commission.id]).length) {
          postLedgerEntry(db, {
            date: (commission.paid_at || localDateString()).slice(0, 10),
            description: `Commission payment ${commission.id}`,
            referenceType: 'COMMISSION_PAYMENT', referenceId: commission.id, createdBy,
            lines: [{ accountCode: '2103', debit: amount, credit: 0 }, { accountCode: '1101', debit: 0, credit: amount }],
          });
          db.run('UPDATE cash_registers SET current_balance=current_balance-? WHERE id=?', [amount, 'cr_main']);
        }
      }
    },
  },

{
    id: '031_inventory_adjustment_ledger',
    description: 'Post historical inventory adjustments to the general ledger',
    up: (db) => {
      const rows = queryLedgerRows<{ id: string; adjustment_number: string; date: string; adjustment_type: string; total_value: number; created_by: string }>(
        db, `SELECT id,adjustment_number,date,adjustment_type,total_value,created_by FROM stock_adjustments WHERE status='POSTED' ORDER BY date,id`);
      const fallbackActor = queryLedgerRows<{ id: string }>(db, 'SELECT id FROM users ORDER BY created_at,id LIMIT 1')[0]?.id;
      for (const adjustment of rows) {
        const amount = Math.round((Number(adjustment.total_value) || 0) * 100) / 100;
        if (amount <= 0 || queryLedgerRows(db, `SELECT id FROM journal_entries WHERE reference_type='INVENTORY_ADJUSTMENT' AND reference_id=?`, [adjustment.id]).length) continue;
        const createdBy = adjustment.created_by || fallbackActor;
        if (!createdBy) throw new Error('Cannot backfill inventory adjustments without a valid user.');
        const add = adjustment.adjustment_type === 'ADD' || adjustment.adjustment_type === 'OPENING_BALANCE';
        const lines = adjustment.adjustment_type === 'OPENING_BALANCE'
          ? [{ accountCode: '1104', debit: amount, credit: 0 }, { accountCode: '3102', debit: 0, credit: amount }]
          : add
            ? [{ accountCode: '1104', debit: amount, credit: 0 }, { accountCode: '4190', debit: 0, credit: amount }]
            : [{ accountCode: '5290', debit: amount, credit: 0 }, { accountCode: '1104', debit: 0, credit: amount }];
        postLedgerEntry(db, {
          date: adjustment.date, description: `Inventory adjustment ${adjustment.adjustment_number}`,
          referenceType: 'INVENTORY_ADJUSTMENT', referenceId: adjustment.id, createdBy, lines,
        });
      }
    },
  },

{
    id: '032_payroll_transaction_accounting',
    description: 'Record payroll cash movements and compensation accruals in the general ledger',
    up: (db) => {
      addColumn(db, 'payroll_transactions', 'register_id', 'TEXT');
      db.run(`INSERT OR IGNORE INTO chart_of_accounts (id,code,name,type,parent_code,balance,is_active) VALUES ('acc_1202','1202','Employee advances','ASSET',NULL,0,1)`);
      db.run(`INSERT OR IGNORE INTO chart_of_accounts (id,code,name,type,parent_code,balance,is_active) VALUES ('acc_2104','2104','Payroll payable','LIABILITY',NULL,0,1)`);
      const rows = queryLedgerRows<{ id: string; employee_id: string; type: string; amount: number; date: string; created_by: string | null; register_id: string | null }>(
        db, `SELECT id,employee_id,type,amount,date,created_by,register_id FROM payroll_transactions ORDER BY date,id`);
      const fallbackActor = queryLedgerRows<{ id: string }>(db, 'SELECT id FROM users ORDER BY created_at,id LIMIT 1')[0]?.id;
      for (const row of rows) {
        if (queryLedgerRows(db, `SELECT id FROM journal_entries WHERE reference_type='PAYROLL_TRANSACTION' AND reference_id=?`, [row.id]).length) continue;
        const createdBy = row.created_by || fallbackActor;
        if (!createdBy) throw new Error('Cannot backfill payroll without a valid user.');
        const amount = Math.round((Number(row.amount) || 0) * 100) / 100;
        if (amount <= 0) continue;
        const date = row.date || localDateString();
        const registerId = row.register_id || 'cr_main';
        const lines = payrollEntryLines(row.type, amount);
        postLedgerEntry(db, {
          date, description: `Payroll ${row.type} for employee ${row.employee_id}`,
          referenceType: 'PAYROLL_TRANSACTION', referenceId: row.id, createdBy, lines,
        });
        if (row.type === 'ADVANCE' || row.type === 'SALARY_PAYOUT') {
          db.run('UPDATE cash_registers SET current_balance=current_balance-? WHERE id=?', [amount, registerId]);
        }
      }
    },
  }
];
