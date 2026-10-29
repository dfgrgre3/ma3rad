import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../utils/date';

export interface PriceList { id: string; name: string; customerGroup?: string; channel?: string; startDate?: string; endDate?: string; priority: number; isActive: boolean; }
export interface PriceListItem { id: string; priceListId: string; productId: string; price: number; minQty: number; }

export class PriceListService {
  private db = DatabaseManager.getInstance();

  getAll(): PriceList[] {
    return this.db.query<any>(`SELECT * FROM price_lists WHERE is_active = 1 ORDER BY priority DESC, name`).map((r) => ({
      id: r.id, name: r.name, customerGroup: r.customerGroup, channel: r.channel,
      startDate: r.startDate, endDate: r.endDate, priority: r.priority, isActive: Boolean(r.isActive),
    }));
  }

  /** Resolve the applicable price list for a customer/channel on a date. */
  resolve(customerGroup?: string, channel?: string, date?: string): PriceList | null {
    const d = date || localDateString();
    const rows = this.db.query<any>(`
      SELECT * FROM price_lists
      WHERE is_active = 1
        AND (customer_group IS NULL OR customer_group = ?)
        AND (channel IS NULL OR channel = ?)
        AND (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
      ORDER BY priority DESC, name
      LIMIT 1
    `, [customerGroup || null, channel || null, d, d]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, name: r.name, customerGroup: r.customerGroup, channel: r.channel, startDate: r.startDate, endDate: r.endDate, priority: r.priority, isActive: Boolean(r.isActive) };
  }

  /** Get price for a product from a price list (or null if not listed). */
  getPrice(priceListId: string, productId: string, qty = 1): number | null {
    const rows = this.db.query<any>(`
      SELECT price FROM price_list_items
      WHERE price_list_id = ? AND product_id = ? AND min_qty <= ?
      ORDER BY min_qty DESC LIMIT 1
    `, [priceListId, productId, qty]);
    return rows.length > 0 ? rows[0].price : null;
  }

  /** Convenience: resolve price for product given customer/channel/date/qty. */
  resolvePrice(productId: string, customerGroup?: string, channel?: string, date?: string, qty = 1): number | null {
    const pl = this.resolve(customerGroup, channel, date);
    if (!pl) return null;
    return this.getPrice(pl.id, productId, qty);
  }

  create(name: string, opts: Partial<PriceList> = {}): PriceList {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'pricing.manage');
    const id = `pl_${uuidv4().substring(0, 8)}`;
    this.db.run(`
      INSERT INTO price_lists (id, name, customer_group, channel, start_date, end_date, priority, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, opts.customerGroup || null, opts.channel || null, opts.startDate || null, opts.endDate || null, opts.priority || 0, opts.isActive === false ? 0 : 1]);
    return this.getAll().find((p) => p.id === id)!;
  }

  setItem(priceListId: string, productId: string, price: number, minQty = 1): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'pricing.manage');
    const id = `pli_${uuidv4().substring(0, 8)}`;
    const exists = this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM price_list_items WHERE price_list_id = ? AND product_id = ?`, [priceListId, productId])[0]?.c ?? 0;
    if (exists > 0) {
      this.db.run(`UPDATE price_list_items SET price = ?, min_qty = ? WHERE price_list_id = ? AND product_id = ?`, [price, minQty, priceListId, productId]);
    } else {
      this.db.run(`INSERT INTO price_list_items (id, price_list_id, product_id, price, min_qty) VALUES (?, ?, ?, ?, ?)`, [id, priceListId, productId, price, minQty]);
    }
  }
}