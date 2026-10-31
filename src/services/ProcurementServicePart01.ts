import { DatabaseManager } from '../database/db';
import type { GoodsReceiptRow, GoodsReceiptItem, SupplierClaimRow, SupplierClaimItem } from './procurementTypes';

export abstract class ProcurementServicePart01 {
  abstract getGoodsReceiptById(id: string): (GoodsReceiptRow & { items: GoodsReceiptItem[] }) | null;
  abstract getClaimById(id: string): (SupplierClaimRow & { items: SupplierClaimItem[] }) | null;
  protected db = DatabaseManager.getInstance();
}
