export type CountType = 'FULL' | 'PARTIAL' | 'SPOT' | 'PERIODIC' | 'SURPRISE' | 'BLIND';

export type CountSessionStatus = 'DRAFT' | 'COUNTING' | 'REVIEW' | 'POSTED' | 'CANCELLED';

export interface CountSession {
  id: string;
  code: string;
  warehouseId: string;
  warehouse: string;
  status: CountSessionStatus;
  countType?: string;
  isBlind?: boolean;
  approvalStatus?: string;
  startDate: string;
  countedBy: string;
  itemsCount: number;
  itemsWithVariance: number;
  totalVarianceValue: number;
}

export interface CountItem {
  id: string;
  productId: string;
  productName: string;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit?: 'M2' | 'LINEAR_METER' | 'BOX' | 'PIECE' | 'KG' | 'TON' | 'SET' | 'CUSTOM';
  customUnit?: string;
  systemQuantityM2: number;
  countedQuantityM2: number | null;
  varianceM2: number;
  unitCost: number;
  varianceValue: number;
  discrepancyReason?: string;
  notes: string;
}

export interface WarehouseOption {
  id: string;
  name: string;
}

export interface CountProductOption {
  id: string;
  name: string;
  sku: string;
  quantityM2: number;
  productType: 'CERAMIC' | 'GENERAL';
  baseUnit?: CountItem['baseUnit'];
  customUnit?: string;
}

export interface VisibleCountItem {
  item: CountItem;
  index: number;
}
