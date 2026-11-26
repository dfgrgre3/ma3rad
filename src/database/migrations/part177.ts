import type { Migration } from './support';
import { columnExists, tableExists } from './support';

const COMPANY_PROFILE_COLUMNS: Array<{ name: string; sql: string }> = [
  { name: 'english_name', sql: 'ALTER TABLE companies ADD COLUMN english_name TEXT' },
  { name: 'logo_path', sql: 'ALTER TABLE companies ADD COLUMN logo_path TEXT' },
  { name: 'address', sql: 'ALTER TABLE companies ADD COLUMN address TEXT' },
  { name: 'country', sql: 'ALTER TABLE companies ADD COLUMN country TEXT' },
  { name: 'city', sql: 'ALTER TABLE companies ADD COLUMN city TEXT' },
  { name: 'phone', sql: 'ALTER TABLE companies ADD COLUMN phone TEXT' },
  { name: 'email', sql: 'ALTER TABLE companies ADD COLUMN email TEXT' },
  { name: 'fiscal_year_start_date', sql: 'ALTER TABLE companies ADD COLUMN fiscal_year_start_date TEXT' },
  { name: 'fiscal_year_end_date', sql: 'ALTER TABLE companies ADD COLUMN fiscal_year_end_date TEXT' },
];

export const MIGRATION_276_COMPANY_PROFILE_FIELDS: Migration = {
  id: '276_company_profile_fields',
  description: 'Add company profile fields (english_name, logo_path, address, country, city, phone, email, fiscal year dates)',
  up: (db) => {
    if (!tableExists(db, 'companies')) return;
    for (const col of COMPANY_PROFILE_COLUMNS) {
      if (!columnExists(db, 'companies', col.name)) {
        db.exec(col.sql);
      }
    }
  },
};

