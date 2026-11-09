import { PaymentType } from '..';

export interface PurchasePriceHistoryRow {
  date: string;
  invoiceNumber: string;
  productId: string | number;
  productName: string;
  quantityM2: number;
  unitCost: number;
  effectiveUnitCost: number;
  matchingStatus: string;
}

export interface SupplierStatementTransaction {
  id: string | number;
  date: string;
  type: string;
  docNumber: string;
  description: string;
  debit: number;
  credit: number;
  balanceAfter: number;
}

export interface SupplierStatement {
  openingBalance: number;
  closingBalance: number;
  transactions: SupplierStatementTransaction[];
}

export interface EditSupplierFormData {
  name: string;
  companyName: string;
  phone: string;
  email: string;
  taxNumber: string;
  commercialRecord: string;
  address: string;
  paymentTermsDays: number;
  notes: string;
}

export interface RecordPaymentFormData {
  amount: number;
  paymentType: PaymentType;
  notes: string;
}
