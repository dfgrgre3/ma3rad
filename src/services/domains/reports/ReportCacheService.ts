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
  page?: number;
  pageSize?: number;
}

export interface PaginatedReportResult extends ReportResult {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface CacheEntry {
  expiresAt: number;
  result: ReportResult;
}

const reportCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000;

export class ReportCacheService {
  public static clearCache(): void {
    reportCache.clear();
  }

  public static getCached<T extends ReportResult>(key: string, compute: () => T): T {
    const now = Date.now();
    const hit = reportCache.get(key);
    if (hit && hit.expiresAt > now) return hit.result as T;
    const result = compute();
    reportCache.set(key, { expiresAt: now + CACHE_TTL_MS, result });
    return result;
  }

  public static hasCache(key: string): boolean {
    const hit = reportCache.get(key);
    return Boolean(hit && hit.expiresAt > Date.now());
  }

  public static removeCache(key: string): void {
    reportCache.delete(key);
  }

  public static getCacheSize(): number {
    return reportCache.size;
  }

  /**
   * تطبق Pagination على نتائج التقرير.
   * إذا لم يتم تحديد page أو pageSize، تُعاد جميع النتائج دون تقطيع.
   */
  public static paginate<T extends ReportResult>(
    result: T,
    page: number = 1,
    pageSize: number = 50,
  ): PaginatedReportResult {
    const rows = result.rows;
    const totalItems = rows.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedRows = rows.slice(startIndex, endIndex);

    return {
      ...result,
      rows: paginatedRows,
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }
}