import type { LucideIcon } from 'lucide-react';

export type ReportCategoryId =
  | 'core'
  | 'operations'
  | 'sales'
  | 'credit'
  | 'inventory'
  | 'finance'
  | 'forecast'
  | 'hr';

export interface ReportCategory {
  id: ReportCategoryId;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

export interface ReportControl {
  key: 'dimension' | 'productId' | 'registerId';
  label: string;
  kind: 'dimension' | 'product' | 'register';
  options?: Array<{ value: string; label: string }>;
}

export type ReportChartType = 'bar' | 'line' | 'area' | 'pie';

export interface ReportDrilldown {
  label: string;
  route: string;
  note?: string;
}

export interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  category: ReportCategoryId;
  icon: LucideIcon;
  dateMode: 'range' | 'asOf' | 'none';
  controls?: ReportControl[];
  legacyTab?: 'sales' | 'purchases' | 'pos' | 'finance' | 'profitLoss' | 'tax';
  /** صلاحية عرض التقرير — تتجاوز صلاحية الفئة عند sensitivity أعلى. */
  permission?: string;
  accent?: string;
  chart?: ReportChartType;
  drilldown?: ReportDrilldown;
}

/** صلاحية كل فئة تقارير عند غياب تجاوز على مستوى التقرير. */
export const REPORT_CATEGORY_PERMISSION: Record<ReportCategoryId, string> = {
  core: 'reports.view',
  operations: 'reports.view',
  sales: 'reports.sales.view',
  credit: 'reports.financial.view',
  inventory: 'reports.inventory.view',
  finance: 'reports.financial.view',
  forecast: 'reports.view',
  hr: 'employees.view',
};

const LEGACY_TAB_PERMISSION: Record<NonNullable<ReportDefinition['legacyTab']>, string> = {
  sales: 'reports.sales.view',
  purchases: 'reports.purchases.view',
  pos: 'reports.pos.view',
  finance: 'reports.financial.view',
  profitLoss: 'reports.profit_loss.view',
  tax: 'reports.tax.view',
};

/** الصلاحية المطلوبة لعرض تقرير — legacyTab يتقدم على الفئة ثم الافتراضي reports.view. */
export function reportPermission(report: ReportDefinition): string {
  return report.permission
    ?? (report.legacyTab ? LEGACY_TAB_PERMISSION[report.legacyTab] : REPORT_CATEGORY_PERMISSION[report.category]);
}
