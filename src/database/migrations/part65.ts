import type { Migration } from './support';
import { addColumn } from './support_part01';

export const MIGRATION_PART_65: Migration[] = [
  {
    id: '176_user_security_keys',
    description: 'Store salted hashes for standalone security-key authentication.',
    up: (db) => {
      addColumn(db, 'users', 'security_key_hash', 'TEXT');
    },
  },
];
