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
