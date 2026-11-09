import type { NumberFormatter, PurchaseFilters } from '../../../types/dashboard/todayPurchases';

export interface PurchaseFiltersSectionProps {
  filters: PurchaseFilters;
  onChange: (patch: Partial<PurchaseFilters>) => void;
  onClearFilters: () => void;
  hasFilters: boolean;
  statusCounts: Record<string, number>;
  suppliers: Array<[string, string]>;
  warehouses: string[];
  methods: string[];
  loading: boolean;
  rowsCount: number;
  filteredCount: number;
  filteredTotal: number;
  plain: NumberFormatter;
  fmt: NumberFormatter;
}
