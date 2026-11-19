import type { ReportResult } from './types';

export interface CacheEntry {
  expiresAt: number;
  result: ReportResult;
}
export const reportCache = new Map<string, CacheEntry>();
export const CACHE_TTL_MS = 15_000;
