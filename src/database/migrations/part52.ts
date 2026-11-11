import { addColumn } from './support';
import type { Migration } from './support';

export const MIGRATION_PART_52: Migration[] = [
  {
    id: '164_login_history_request_metadata',
    description: 'Add IP address and user agent fields to login history records.',
    up: (db) => {
      addColumn(db, 'login_history', 'ip_address', 'TEXT');
      addColumn(db, 'login_history', 'user_agent', 'TEXT');
    },
  },
];
