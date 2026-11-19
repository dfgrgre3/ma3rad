export type ReportValueType = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'badge' | 'qty';
export type ReportTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

export interface ReportColumn {
  key: string;
  label: string;
  type?: ReportValueType;
  align?: 'start' | 'center' | 'end';
}

export interface ReportKpi {
  label: string;
  value: number | string;
  hint?: string;
  tone?: ReportTone;
}

export interface ReportResult {
  kpis: ReportKpi[];
  columns: ReportColumn[];
  rows: Array<Record<string, any>>;
  notes?: string[];
}

export interface ReportParams {
  from: string;
  to: string;
  productId?: string;
  userId?: string;
  registerId?: string;
  branchId?: string;
  warehouseId?: string;
  customerId?: string;
  supplierId?: string;
  employeeId?: string;
  status?: string;
  paymentMethod?: string;
  compareBranchId?: string;
  dimension?: string;
}
