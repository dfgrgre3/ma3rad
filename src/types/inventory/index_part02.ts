export type TransferStatus = 
  | 'REQUESTED' 
  | 'APPROVED' 
  | 'PREPARING' 
  | 'IN_TRANSIT' 
  | 'RECEIVED_FULL' 
  | 'RECEIVED_PARTIAL' 
  | 'COMPLETED'
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
  totalPhysicalQty: number;
  totalFifoLayerCost: number;
  totalFifoLayerQty: number;
  totalGlInventoryCost: number;
  variancePhysicalVsFifo: number;
  variancePhysicalVsFifoQty: number;
  varianceFifoVsGl: number;
  quantityBalanced: boolean;
  ledgerScope: 'BRANCH_COMPANY';
  ledgerComparable: boolean;
  status: 'BALANCED' | 'DISCREPANCY_DETECTED' | 'RESOLVED';
  notes?: string;
  performedBy: string;
  performedByName?: string;
  createdAt: string;
}
