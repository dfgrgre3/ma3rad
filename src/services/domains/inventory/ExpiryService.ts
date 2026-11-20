import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { localDateString } from '../../../utils/shared/date';
import { round2 } from '../finance/financials';

export interface ExpiryLot {
  id: string; productId: string; productName: string; warehouseId: string | null;
  warehouseName: string | null; lotNumber: string | null; expiryDate: string;
  quantity: number; quantityRemaining: number; receivedDate: string | null;
  supplierId: string | null; supplierName: string | null; costPrice: number;
  daysToExpiry: number; isExpired: boolean; isExpiringSoon: boolean; notes: string | null;
}

export interface ExpiryProductFlag {
  productId: string; productName: string; trackExpiry: number; expiryAlertDays: number;
}

export class ExpiryService {
  private db = DatabaseManager.getInstance();

  private requireView() {
    ModuleRegistryService.assertModuleEnabled('inventory');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.view');
    return actor;
  }

  private requireManage() {
    ModuleRegistryService.assertModuleEnabled('inventory');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');
    return actor;
  }

  private decorate(rows: any[]): ExpiryLot[] {
    const today = new Date(`${localDateString()}T00:00:00`).getTime();
    return rows.map((r) => {
      const expiry = new Date(`${r.expiryDate}T00:00:00`).getTime();
      const daysToExpiry = Math.ceil((expiry - today) / 86400000);
      const alertDays = Number(r.alertDays ?? 30);
      return {
        ...r,
        quantity: round2(r.quantity),
        quantityRemaining: round2(r.quantityRemaining),
        costPrice: round2(r.costPrice),
        daysToExpiry,
        isExpired: daysToExpiry < 0,
        isExpiringSoon: daysToExpiry >= 0 && daysToExpiry <= alertDays,
      };
    });
  }

  // ── Lots CRUD ───────────────────────────────────────────────────────────

  public getLots(filters?: { productId?: string; warehouseId?: string; status?: 'expired' | 'expiring' | 'ok' }): ExpiryLot[] {
    this.requireView();
    const where: string[] = ['l.quantity_remaining > 0'];
    const params: unknown[] = [];
    if (filters?.productId) { where.push('l.product_id = ?'); params.push(filters.productId); }
    if (filters?.warehouseId) { where.push('l.warehouse_id = ?'); params.push(filters.warehouseId); }
    if (filters?.status === 'expired') where.push(`l.expiry_date < '${localDateString()}'`);
    if (filters?.status === 'expiring') where.push(`l.expiry_date >= '${localDateString()}'`);
    const rows = this.db.query<any>(
      `SELECT l.id, l.product_id AS productId, p.name AS productName,
              l.warehouse_id AS warehouseId, w.name AS warehouseName,
              l.lot_number AS lotNumber, l.expiry_date AS expiryDate,
              l.quantity, l.quantity_remaining AS quantityRemaining,
              l.received_date AS receivedDate, l.supplier_id AS supplierId,
              s.name AS supplierName, COALESCE(l.cost_price,0)/100.0 AS costPrice,
              COALESCE(p.expiry_alert_days,30) AS alertDays, l.notes
       FROM product_expiry_lots l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN warehouses w ON w.id = l.warehouse_id
       LEFT JOIN suppliers s ON s.id = l.supplier_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.expiry_date ASC`,
      params
    );
    let lots = this.decorate(rows);
    if (filters?.status === 'expiring') {
      lots = lots.filter((l) => l.isExpiringSoon && !l.isExpired);
    } else if (filters?.status === 'ok') {
      lots = lots.filter((l) => !l.isExpired && !l.isExpiringSoon);
    }
    return lots;
  }

  public createLot(input: {
    productId: string; warehouseId?: string; lotNumber?: string; expiryDate: string;
    quantity: number; receivedDate?: string; supplierId?: string; costPrice?: number; notes?: string;
  }): ExpiryLot {
    this.requireManage();
    if (!input.expiryDate) throw new Error('تاريخ انتهاء الصلاحية مطلوب.');
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر.');
    const id = uuidv4();
    this.db.run(
      `INSERT INTO product_expiry_lots (id, product_id, warehouse_id, lot_number, expiry_date,
         quantity, quantity_remaining, received_date, supplier_id, cost_price, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, input.productId, input.warehouseId || null, input.lotNumber || null, input.expiryDate,
       round2(input.quantity), round2(input.quantity), input.receivedDate || null,
       input.supplierId || null, Math.round((input.costPrice ?? 0) * 100), input.notes || null,
       AuthService.requireAuth().id]
    );
    // Auto-enable expiry tracking on the product.
    this.db.run(`UPDATE products SET track_expiry=1 WHERE id=? AND track_expiry=0`, [input.productId]);
    return this.getLots({ productId: input.productId }).find((l) => l.id === id)!;
  }

  public consumeLot(lotId: string, quantity: number): void {
    this.requireManage();
    const lot = this.db.query<any>(`SELECT quantity_remaining AS q FROM product_expiry_lots WHERE id=?`, [lotId])[0];
    if (!lot) throw new Error('التشغيلة غير موجودة.');
    const remaining = Math.max(0, round2(Number(lot.q) - quantity));
    this.db.run(`UPDATE product_expiry_lots SET quantity_remaining=? WHERE id=?`, [remaining, lotId]);
  }

  public deleteLot(id: string): void {
    this.requireManage();
    this.db.run(`DELETE FROM product_expiry_lots WHERE id=?`, [id]);
  }

  // ── Product flags ───────────────────────────────────────────────────────

  public getExpiryTrackedProducts(): ExpiryProductFlag[] {
    this.requireView();
    return this.db.query<any>(
      `SELECT id AS productId, name AS productName, COALESCE(track_expiry,0) AS trackExpiry,
              COALESCE(expiry_alert_days,30) AS expiryAlertDays
       FROM products WHERE COALESCE(track_expiry,0)=1 ORDER BY name`
    );
  }

  public setExpiryTracking(productId: string, track: boolean, alertDays?: number): void {
    this.requireManage();
    this.db.run(
      `UPDATE products SET track_expiry=?, expiry_alert_days=COALESCE(?, expiry_alert_days) WHERE id=?`,
      [track ? 1 : 0, alertDays ?? null, productId]
    );
  }

  // ── POS / sales guard ───────────────────────────────────────────────────

  /**
   * Returns expired remaining quantity for a product (optionally per warehouse).
   * Used by POS and sales flows to block selling expired stock.
   */
  public getExpiredQuantity(productId: string, warehouseId?: string): number {
    const row = this.db.query<any>(
      `SELECT COALESCE(SUM(quantity_remaining),0) AS q FROM product_expiry_lots
       WHERE product_id=? AND expiry_date < ? ${warehouseId ? 'AND (warehouse_id = ? OR warehouse_id IS NULL)' : ''}`,
      warehouseId ? [productId, localDateString(), warehouseId] : [productId, localDateString()]
    )[0];
    return round2(Number(row?.q ?? 0));
  }

  /**
   * Total sellable (non-expired) remaining quantity across expiry lots.
   * Returns null when the product has no expiry lots (not tracked).
   */
  public getNonExpiredLotQuantity(productId: string, warehouseId?: string): number | null {
    const row = this.db.query<any>(
      `SELECT COALESCE(SUM(quantity_remaining),0) AS total,
              COALESCE(SUM(CASE WHEN expiry_date >= ? THEN quantity_remaining ELSE 0 END),0) AS fresh
       FROM product_expiry_lots WHERE product_id=? ${warehouseId ? 'AND (warehouse_id = ? OR warehouse_id IS NULL)' : ''}`,
      warehouseId ? [localDateString(), productId, warehouseId] : [localDateString(), productId]
    )[0];
    const total = Number(row?.total ?? 0);
    if (total <= 0) return null;
    return round2(Number(row?.fresh ?? 0));
  }

  /**
   * Throws when the requested quantity cannot be covered by non-expired lots.
   * Only enforced when the product has expiry lots registered.
   */
  public assertNotExpired(productId: string, quantity: number, warehouseId?: string, override = false): void {
    const fresh = this.getNonExpiredLotQuantity(productId, warehouseId);
    if (fresh === null) return; // product not expiry-lot tracked
    if (fresh >= quantity) return;
    if (override) return;
    const expired = this.getExpiredQuantity(productId, warehouseId);
    throw new Error(
      expired > 0
        ? `لا يمكن بيع ${quantity} — المتاح غير المنتهي ${fresh} فقط (${expired} منتهي الصلاحية). يتطلب تجاوز صلاحية.`
        : `لا يمكن بيع ${quantity} — المتاح غير المنتهي ${fresh} فقط.`
    );
  }

  /** FEFO: oldest-expiry lots first for a product. */
  public getFefoLots(productId: string, warehouseId?: string): ExpiryLot[] {
    return this.getLots({ productId, warehouseId })
      .filter((l) => !l.isExpired)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  }

  // ── Dashboard / alerts ──────────────────────────────────────────────────

  public getDashboardStats(): {
    expiredCount: number; expiredValue: number; expiringCount: number; expiringValue: number;
    trackedProducts: number; totalLots: number;
  } {
    this.requireView();
    const lots = this.getLots();
    const expired = lots.filter((l) => l.isExpired);
    const expiring = lots.filter((l) => l.isExpiringSoon && !l.isExpired);
    const sum = (arr: ExpiryLot[]) => round2(arr.reduce((s, l) => s + l.quantityRemaining * l.costPrice, 0));
    return {
      expiredCount: expired.length,
      expiredValue: sum(expired),
      expiringCount: expiring.length,
      expiringValue: sum(expiring),
      trackedProducts: this.getExpiryTrackedProducts().length,
      totalLots: lots.length,
    };
  }
}
