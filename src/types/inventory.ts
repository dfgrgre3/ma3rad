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

export type TransferStatus = 
  | 'REQUESTED' 
  | 'APPROVED' 
  | 'PREPARING' 
  | 'IN_TRANSIT' 
  | 'RECEIVED_FULL' 
  | 'RECEIVED_PARTIAL' 
  | 'REJECTED' 
  | 'CANCELLED';

export interface TransferItem {
  id: string;
  transferId: string;
  productId: string;
  productName: string;
  quantityM2: number;
  boxesCount: number;
  shippedM2: number;
  receivedM2: number;
  lostM2: number;
  damagedM2: number;
  unitCost: number;
  totalCost: number;
  itemNotes?: string;
}

export interface ReorderItemPlan {
  productId: string;
  productName: string;
  productSku: string;
  categoryName?: string;
  warehouseId: string;
  warehouseName: string;
  currentStockM2: number;
  reservedStockM2: number;
  availableStockM2: number;
  onOrderStockM2: number;
  minStockLevel: number;
  maxStockLevel: number;
  reorderPoint: number;
  safetyStock: number;
  leadTimeDays: number;
  dailySalesRate: number;
  stockDepletionDays: number;
  suggestedOrderM2: number;
  unitCost: number;
  suggestedOrderValue: number;
  stockStatus: 'OUT_OF_STOCK' | 'CRITICAL' | 'REORDER_NEEDED' | 'OPTIMAL' | 'OVERSTOCKED';
}

export interface InventoryReconciliation {
  id: string;
  reconciliationDate: string;
  warehouseId?: string;
  warehouseName?: string;
  totalPhysicalCost: number;
  totalFifoLayerCost: number;
  totalGlInventoryCost: number;
  variancePhysicalVsFifo: number;
  varianceFifoVsGl: number;
  status: 'BALANCED' | 'DISCREPANCY_DETECTED' | 'RESOLVED';
  notes?: string;
  performedBy: string;
  performedByName?: string;
  createdAt: string;
}
