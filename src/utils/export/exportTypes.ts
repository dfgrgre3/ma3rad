/** Shared export column shape, kept dependency-free to avoid import cycles. */
export interface ExportColumn {
  key: string;
  label: string;
  type?: string;
  align?: 'start' | 'center' | 'end';
}

/** Optional extra worksheet appended to the exported workbook. */
export interface ExportSheet {
  name: string;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
}
