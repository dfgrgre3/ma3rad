import { WarehouseStock } from '../../../types';

export interface StockSummary {
  totalM2: number;
  totalBoxes: number;
  totalPieces: number;
  rows: WarehouseStock[];
}

export interface SalesRow {
  date: string;
  customer: string;
  qty: number;
  price: number;
}

export interface PurchaseRow {
  date: string;
  supplier: string;
  qty: number;
  cost: number;
}

export interface ActivityRow {
  action: string;
  user: string;
  at: string;
  details: string;
}

export interface ProductEditForm {
  name: string;
  size: string;
  color: string;
  finish: string;
  thickness: string;
  costPrice: string;
  sellingPriceM2: string;
  sellingPriceBox: string;
  wholesalePriceM2: string;
  minSellingPriceM2: string;
  minStockLevel: string;
  maxStockLevel: string;
  piecesPerBox: string;
  metersPerBox: string;
  isActive: boolean;
}
