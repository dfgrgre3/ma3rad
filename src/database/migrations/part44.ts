import type { Migration } from './support';
import { addColumn, tableExists } from './support';

export const MIGRATION_PART_44: Migration[] = [
  {
    id: '156_hr_training_expense_destinations',
    description: 'Add cash register and bank account destinations to training expenses.',
    disableForeignKeys: true,
    up: (db) => {
      if (tableExists(db, 'training_expenses')) {
        addColumn(db, 'training_expenses', 'register_id', 'TEXT');
        addColumn(db, 'training_expenses', 'bank_account_id', 'TEXT');
      }
    },
  },
];
