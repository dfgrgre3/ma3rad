import { PaymentType } from '../../types';

export interface PurchaseInvoiceDto {
  supplierId: string;
  supplierInvoiceNumber: string;
  warehouseId: string;
  grnId?: string;
  purchaseOrderId?: string;
  items: Array<{
    productId: string;
    quantityM2: number;
    boxesCount: number;
    unitCost: number;
    orderedUnitCost?: number;
    grnAcceptedQty?: number;
  }>;
  discountAmount: number;
  landedFreight: number;
  landedLoading: number;
  landedCustomsTaxes: number;
  landedInsurance: number;
  landedOther: number;
  landedAllocationMethod: 'VALUE' | 'QUANTITY' | 'WEIGHT';
  isNoNumberSupplier: boolean;
  paidAmount: number;
  paymentType: PaymentType;
  notes: string;
}
