export interface ReturnableItem {
  productId: string;
  productName: string;
  grade: string;
  size: string;
  soldM2: number;
  returnedM2: number;
  returnableM2: number;
  unitPrice: number;
  unitCost: number;
  boxesCount: number;
  metersPerBox: number;
  piecesPerBox?: number;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
}

export interface ReturnStats {
  count: number;
  totalAmount: number;
  taxAmount: number;
  grossAmount: number;
  returnsWithoutRecordedTax: number;
  cashRefunded: number;
  creditedToBalance: number;
  todayCount: number;
  todayAmount: number;
  todayTaxAmount: number;
  todayGrossAmount: number;
}

export interface ReturnRequestItem {
  productId: string;
  /** Base-unit quantity, used when `uom`/`quantity` are not supplied. */
  quantityM2: number;
  /** Optional selling unit for the returned quantity (e.g. BOX). */
  uom?: string;
  /** Quantity expressed in `uom`; converted to `quantityM2` before validation. */
  quantity?: number;
  boxesCount: number;
  unitPrice: number;
  unitCost: number;
  reason: string;
}
