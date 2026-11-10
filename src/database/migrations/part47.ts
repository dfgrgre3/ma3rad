import type { Migration } from './support';
import { addColumn, tableExists } from './support';

export const MIGRATION_PART_47: Migration[] = [
  {
    id: '159_payroll_allowances_and_loans',
    description: 'Add allowance and loan deduction columns to payroll run items.',
    disableForeignKeys: true,
    up: (db) => {
      if (tableExists(db, 'payroll_run_items')) {
        addColumn(db, 'payroll_run_items', 'allowance_amount', 'REAL NOT NULL DEFAULT 0');
        addColumn(db, 'payroll_run_items', 'loan_deduction_amount', 'REAL NOT NULL DEFAULT 0');
      }
    },
  },
];
