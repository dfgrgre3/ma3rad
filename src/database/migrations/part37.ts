import type { Migration } from './support';
import { addColumn, tableExists } from './support';

/**
 * Payroll payment destinations and unified attendance approval fields.
 *
 * Timekeeping is recorded in three places today: the daily `attendance`
 * summary, the append-only `employee_attendance_periods` log and the
 * `operation_shift_staff` presence rows. The approval columns below let the
 * period log carry the same overtime approval as the daily summary, while the
 * payroll payment columns make every payout auditable by method, destination,
 * reference and transfer proof.
 */
export const MIGRATION_PART_37: Migration[] = [
  {
    id: '149_payroll_payments_and_period_approval',
    description: 'Add per-employee payroll payment destinations, transfer references, proofs and period-level overtime approval.',
    disableForeignKeys: true,
    up: (db) => {
      if (tableExists(db, 'employees')) {
        addColumn(db, 'employees', 'wallet_provider', 'TEXT');
        addColumn(db, 'employees', 'wallet_number', 'TEXT');
      }

      if (tableExists(db, 'employee_attendance_periods')) {
        addColumn(db, 'employee_attendance_periods', 'break_minutes', 'INTEGER NOT NULL DEFAULT 0');
        addColumn(db, 'employee_attendance_periods', 'overtime_approved', 'INTEGER NOT NULL DEFAULT 0');
        addColumn(db, 'employee_attendance_periods', 'overtime_approved_by', 'TEXT');
        addColumn(db, 'employee_attendance_periods', 'overtime_approved_at', 'TEXT');
      }

      if (tableExists(db, 'payroll_transactions')) {
        addColumn(db, 'payroll_transactions', 'payment_method', "TEXT NOT NULL DEFAULT 'CASH'");
        addColumn(db, 'payroll_transactions', 'bank_account_id', 'TEXT');
        addColumn(db, 'payroll_transactions', 'wallet_provider', 'TEXT');
        addColumn(db, 'payroll_transactions', 'wallet_number', 'TEXT');
        addColumn(db, 'payroll_transactions', 'reference_number', 'TEXT');
        addColumn(db, 'payroll_transactions', 'proof_reference', 'TEXT');
        addColumn(db, 'payroll_transactions', 'payment_status', "TEXT NOT NULL DEFAULT 'PAID'");
      }

      if (tableExists(db, 'payroll_run_items')) {
        addColumn(db, 'payroll_run_items', 'payment_method', "TEXT NOT NULL DEFAULT 'CASH'");
        addColumn(db, 'payroll_run_items', 'bank_account_id', 'TEXT');
        addColumn(db, 'payroll_run_items', 'wallet_provider', 'TEXT');
        addColumn(db, 'payroll_run_items', 'wallet_number', 'TEXT');
        addColumn(db, 'payroll_run_items', 'payment_reference', 'TEXT');
        addColumn(db, 'payroll_run_items', 'payment_proof', 'TEXT');
        addColumn(db, 'payroll_run_items', 'paid_amount', 'REAL NOT NULL DEFAULT 0');
        addColumn(db, 'payroll_run_items', 'payout_status', "TEXT NOT NULL DEFAULT 'PENDING'");
      }

      if (tableExists(db, 'payroll_runs')) {
        addColumn(db, 'payroll_runs', 'payment_batch_reference', 'TEXT');
        addColumn(db, 'payroll_runs', 'paid_total', 'REAL NOT NULL DEFAULT 0');
      }

      db.run(`INSERT OR IGNORE INTO chart_of_accounts
        (id, code, name, type, parent_code, balance, is_active)
        VALUES ('acc_1107', '1107', 'E-wallet clearing', 'ASSET', '11', 0, 1)`);
    },
  },
];
