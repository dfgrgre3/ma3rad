export type ImportEntity =
  | 'customers'
  | 'suppliers'
  | 'categories'
  | 'brands'
  | 'products'
  | 'employees'
  | 'warehouses'
  | 'dynamic';

export type ExistingImportEntity = Exclude<ImportEntity, 'dynamic'>;

export interface ImportField {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
}

export interface ParsedImport {
  entity: ImportEntity;
  headers: string[];
  rows: Record<string, unknown>[];
  mapping: Record<string, string>;
  confidence: number;
}

export interface ImportIssue {
  row: number;
  messages: string[];
}

export type ImportOptions = {
  allowInitialBalances: boolean;
  allowProductStock: boolean;
  openingStockWarehouseId?: string;
  sourceName?: string;
};

export type ImportValue = (key: string) => string;

export type ImportRowValues = {
  val: ImportValue;
  opt: (key: string) => string | undefined;
  num: (key: string, fallback?: number) => number;
};
