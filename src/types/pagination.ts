export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function normalizePage(value: number, fallback = 1): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function normalizePageSize(value: number, fallback = 25): number {
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 100) : fallback;
}
