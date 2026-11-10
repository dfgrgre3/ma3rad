import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import type { GoodsReceiptRow, GoodsReceiptItem, SupplierClaimRow, SupplierClaimItem } from '../../../types/procurement';

export abstract class ProcurementServicePart01 {
  abstract getGoodsReceiptById(id: string): (GoodsReceiptRow & { items: GoodsReceiptItem[] }) | null;
  abstract getClaimById(id: string): (SupplierClaimRow & { items: SupplierClaimItem[] }) | null;
  protected abstract readClaimById(
    id: string,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): (SupplierClaimRow & { items: SupplierClaimItem[]; branchId: string | null }) | null;
  protected db = DatabaseManager.getInstance();
}
