export type SpecialStockCategory = 
  | 'DAMAGED' 
  | 'BROKEN' 
  | 'DISPLAY_SAMPLE' 
  | 'NON_SELLABLE_RETURN' 
  | 'QUARANTINE_INSPECTION';

export type SpecialStockStatus = 
  | 'RECORDED' 
  | 'INSPECTED' 
  | 'DOWNGRADED_SALE' 
  | 'WRITTEN_OFF' 
  | 'RESTORED_TO_STOCK';

export interface WarehouseLocation {
  id: string;
  warehouseId: string;
  warehouseName?: string;
  zone: string;
  aisle: string;
  shelf: string;
  bin: string;
  barcode: string;
  maxCapacityM2: number;
  currentOccupiedM2?: number;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export interface ProductLocationStock {
  id: string;
  locationId: string;
  productId: string;
  productName?: string;
  productSku?: string;
  quantityM2: number;
  lastMovedAt: string;
}

export interface SpecialStock {
  id: string;
  specialNumber: string;
  warehouseId: string;
  warehouseName?: string;
  productId: string;
  productName?: string;
  productSku?: string;
  category: SpecialStockCategory;
  quantityM2: number;
  boxesCount: number;
  unitCost: number;
  totalCost: number;
  status: SpecialStockStatus;
  sourceType?: string;
  sourceId?: string;
  inspectionNotes?: string;
  inspectedBy?: string;
  inspectedByName?: string;
  inspectedAt?: string;
  resolutionNotes?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}
