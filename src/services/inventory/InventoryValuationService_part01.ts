export interface WarehouseValuation {
  id: string;
  name: string;
  itemsCount: number;
  quantitiesByUnit: { unitLabel: string; quantity: number }[];
  costValue: number;
  retailValue: number;
}

export interface InventoryKpi {
  totalValue: number;
  totalSkus: number;
  lowStockCount: number;
  zeroStockCount: number;
  topValueItems: { name: string; value: number; qty: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[];
  categoryBreakdown: { category: string; items: number; value: number }[];
}

export type InventoryKpiPermission = 'ui.inventory.valuation.view' | 'ui.reports.inventory.view';
