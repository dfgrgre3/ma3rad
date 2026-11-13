export type ReturnDisposition = 'RESTOCK' | 'SPECIAL_STOCK' | 'QUARANTINE' | 'DAMAGED';

export interface ReturnableItem {
  invoiceItemId: string;
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
  /** Discounted special-stock record the line was sold from, when applicable. */
  specialStockId?: string | null;
  specialNumber?: string | null;
  /** Where the sold quantity came from: regular invoice stock or a special-stock sale. */
  sourceType?: 'INVOICE' | 'SPECIAL_STOCK_SALE';
  /** Default disposition applied when the caller does not pick one. */
  defaultDisposition?: ReturnDisposition;
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
  /** Original sales invoice item that this return line consumes. */
  invoiceItemId: string;
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
  /** Special-stock record the sold line came from (discounted sales). */
  specialStockId?: string | null;
  /** Explicit source of the original sale line; required when a product has multiple sources. */
  sourceType?: 'REGULAR' | 'SPECIAL';
  /**
   * Where the returned goods go. Defaults to the original source:
   * regular sales restock, special-stock sales go back to their own record.
   */
  disposition?: ReturnDisposition;
}
