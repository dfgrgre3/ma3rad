import type { CountItem, CountSession, VisibleCountItem } from './types';

export const fmtCountCurrency = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(n)) + ' ج';

export const filterCountSessions = (
  sessions: CountSession[],
  statusFilter: string,
  search: string
): CountSession[] =>
  sessions.filter(s => (statusFilter === 'ALL' || s.status === statusFilter) && (
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    s.warehouse.includes(search)
  ));

export const getVisibleCountItems = (items: CountItem[], itemSearch: string): VisibleCountItem[] =>
  items.map((item, index) => ({ item, index })).filter(({ item }) =>
    `${item.productName} ${item.notes}`.toLowerCase().includes(itemSearch.toLowerCase())
  );

export const countCountedItems = (items: CountItem[]): number =>
  items.filter(item => item.countedQuantityM2 !== null).length;

export const countVarianceItems = (items: CountItem[]): number =>
  items.filter(item => item.countedQuantityM2 !== null && item.varianceM2 !== 0).length;
