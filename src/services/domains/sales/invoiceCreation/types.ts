import type { InventoryCostingService } from '../../inventory/InventoryCostingService';
import type { CreateSaleDTO } from '../../../../types/sales/serviceTypes';

export type PreparedSaleItem = {
  id: string;
  invoiceId: string;
  productId: string;
  productName: string;
  productSku: string;
  productGrade: string;
  size: string;
  soldBy: CreateSaleDTO['items'][number]['soldBy'];
  quantityM2: number;
  baseUom: string;
  boxesCount: number;
  piecesCount: number;
  unitPrice: number;
  originalUnitPrice: number;
  unitCost: number;
  discountAmount: number;
  totalPrice: number;
  totalCost: number;
  profit: number;
  fifoPlan: ReturnType<typeof InventoryCostingService.planFifo> | null;
  specialStockId: string | null;
  specialNumber: string | null;
  metersPerBox: number;
  piecesPerBox: number;
  productType: string;
  tracksStock: boolean;
  serialNumbers: string[];
};

export type DiscountApprovalRow = {
  id: string;
  branchId: string | null;
  requestedValue: number | null;
  requestedBy: string;
};
