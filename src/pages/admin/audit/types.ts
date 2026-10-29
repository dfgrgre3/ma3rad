import type { AuditLogEntry, AuditStats } from '../../../services/AuditService';

export interface AuditFilterState {
  selectedModule: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
}

export const getModuleColor = (module: string): string => {
  const colors: Record<string, string> = {
    PRODUCTS: 'bg-sky-50 text-sky-700 border-sky-200',
    INVENTORY: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    SALES: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PURCHASES: 'bg-amber-50 text-amber-700 border-amber-200',
    CUSTOMERS: 'bg-purple-50 text-purple-700 border-purple-200',
    SUPPLIERS: 'bg-pink-50 text-pink-700 border-pink-200',
    CASHIER: 'bg-rose-50 text-rose-700 border-rose-200',
    USERS: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    SETTINGS: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return colors[module] || colors.SETTINGS;
};

export const formatJson = (jsonStr: string | null | undefined): string | null => {
  if (!jsonStr) return null;
  try {
    const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    return JSON.stringify(obj, null, 2);
  } catch {
    return jsonStr;
  }
};
