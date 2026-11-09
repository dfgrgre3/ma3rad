/** Shared export column shape, kept dependency-free to avoid import cycles. */
export interface ExportColumn {
  key: string;
  label: string;
  type?: string;
  align?: 'start' | 'center' | 'end';
}
