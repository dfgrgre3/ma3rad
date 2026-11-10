import { addColumn } from './support';
import type { Migration } from './support';

export const MIGRATION_PART_32: Migration[] = [
  {
    id: '144_hr_employee_document_files_and_versions',
    description: 'Add encrypted employee document file metadata and immutable version history.',
    up: (db) => {
      addColumn(db, 'employee_documents', 'updated_by', 'TEXT REFERENCES users(id)');
      db.exec(`
        CREATE TABLE employee_document_versions (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          version_number INTEGER NOT NULL CHECK(version_number > 0),
          file_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size INTEGER NOT NULL CHECK(file_size > 0),
          checksum TEXT NOT NULL,
          storage_name TEXT NOT NULL UNIQUE,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (document_id) REFERENCES employee_documents(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id),
          UNIQUE (document_id, version_number)
        );
        CREATE INDEX idx_employee_document_versions_document
          ON employee_document_versions(document_id, version_number DESC);
      `);
    },
  },
];
