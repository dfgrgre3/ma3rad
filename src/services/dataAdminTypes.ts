export interface TableInfo {
  name: string;
  rows: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
}

export interface StorageStats {
  databaseBytes: number;
  localStorageBytes: number;
  tableCount: number;
  totalRows: number;
}

export interface TableCount {
  table: string;
  rows: number;
}

export interface DeleteResult {
  deleted: number;
  tables: TableCount[];
}

export interface DataImportSheet {
  name: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export interface DataImportConflictSample {
  key: string;
  changes: Array<{ column: string; existing: unknown; imported: unknown }>;
}

export interface DataImportTablePreview {
  table: string;
  incomingRows: number;
  existingRows: number;
  newRows: number;
  conflictRows: number;
  skippedRows: number;
  protected: boolean;
  sampleConflicts: DataImportConflictSample[];
}

export interface DataImportPreview {
  tables: DataImportTablePreview[];
  incomingRows: number;
  newRows: number;
  conflictRows: number;
  skippedRows: number;
}

export interface DataImportResult {
  tables: Array<{ table: string; insertedRows: number; updatedRows: number; skippedRows: number }>;
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
}
