import type { UnitType } from './products';

export type InventoryTransactionType = 
  | 'PURCHASE'
  | 'SALE'
  | 'PURCHASE_RETURN'
  | 'SALES_RETURN'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT_ADD'
  | 'ADJUSTMENT_SUB'
  | 'DAMAGE'
  | 'OPENING_BALANCE'
  | 'STOCK_COUNT';

export interface InventoryTransaction {
  id: string;
  transactionNumber: string;
  type: InventoryTransactionType;
  productId: string;
  productName?: string;
  productSku?: string;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: UnitType;
  customUnit?: string;
  warehouseId: string;
  warehouseName?: string;
  quantityM2: number; // موجب أو سالب
  boxesCount?: number;
  unitCost: number;
  totalCost: number;
  referenceType?: 'INVOICE' | 'PURCHASE' | 'TRANSFER' | 'ADJUSTMENT' | 'COUNT';
  referenceId?: string;
  notes?: string;
  performedBy: string;
  performedByName?: string;
  createdAt: string;
}
