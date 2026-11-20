
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
    PRODUCTS: 'bg-accent-soft text-primary border-accent-border',
    INVENTORY: 'bg-accent-soft text-primary border-accent-border',
    SALES: 'bg-success-soft text-success border-success-border',
    PURCHASES: 'bg-warning-soft text-warning border-warning-border',
    CUSTOMERS: 'bg-accent-soft text-primary border-accent-border',
    SUPPLIERS: 'bg-accent-soft text-primary border-accent-border',
    CASHIER: 'bg-danger-soft text-danger border-danger-border',
    USERS: 'bg-accent-soft text-primary border-accent-border',
    SETTINGS: 'bg-surface-sunken text-ink border-line',
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
