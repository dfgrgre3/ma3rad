import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import type { GoodsReceiptRow, GoodsReceiptItem, SupplierClaimRow, SupplierClaimItem } from './procurementTypes';

export abstract class ProcurementServicePart01 {
  abstract getGoodsReceiptById(id: string): (GoodsReceiptRow & { items: GoodsReceiptItem[] }) | null;
  abstract getClaimById(id: string): (SupplierClaimRow & { items: SupplierClaimItem[] }) | null;
  protected abstract readClaimById(
    id: string,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): (SupplierClaimRow & { items: SupplierClaimItem[]; branchId: string | null }) | null;
  protected db = DatabaseManager.getInstance();
}
