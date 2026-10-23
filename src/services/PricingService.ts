import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';

export interface PriceList {
  id: string;
  code: string;
  name: string;
  customerType: 'RETAIL' | 'WHOLESALE' | 'CONTRACTOR' | 'VIP' | 'PROJECT';
  currency: string;
  validFrom?: string | null;
  validTo?: string | null;
  isDefault: boolean;
  isActive: boolean;
  notes?: string | null;
  itemsCount: number;
  createdAt: string;
}

export interface PriceListItem {
  id: string;
  priceListId: string;
  productId: string;
  productName?: string;
  productSku?: string;
  priceM2: number;
  priceBox: number;
  minQuantityM2: number;
}

export interface Promotion {
  id: string;
  code: string;
  name: string;
  promotionType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BUY_X_GET_Y' | 'BUNDLE_PRICE';
  discountPercentage: number;
  discountAmount: number;
  buyQuantity: number;
  getQuantity: number;
  minOrderAmount: number;
  appliesTo: 'ALL' | 'PRODUCTS' | 'CATEGORIES' | 'BRANDS';
  startsAt: string;
  endsAt: string;
  usageLimit?: number | null;
  usageCount: number;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  currentlyRunning?: boolean;
}

export class PricingService {
  private db = DatabaseManager.getInstance();

  public getPriceLists(): PriceList[] {
    return this.db.query<PriceList>(
      `SELECT pl.*,
        (SELECT COUNT(*) FROM price_list_items i WHERE i.price_list_id = pl.id) AS items_count
       FROM price_lists pl ORDER BY pl.is_default DESC, pl.name`
    ).map((r) => ({ ...r, isDefault: Boolean(r.isDefault), isActive: Boolean(r.isActive) }));
  }

  public createPriceList(input: {
    name: string; customerType?: PriceList['customerType']; validFrom?: string; validTo?: string;
    isDefault?: boolean; notes?: string;
  }): PriceList {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'pricing.update');
    if (!input.name.trim()) throw new Error('اسم قائمة الأسعار مطلوب.');

    const id = `pl_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('PL');
      if (input.isDefault) db.run(`UPDATE price_lists SET is_default = 0`);
      db.run(
        `INSERT INTO price_lists (id, code, name, customer_type, valid_from, valid_to, is_default, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, code, input.name.trim(), input.customerType || 'RETAIL',
          input.validFrom || null, input.validTo || null, input.isDefault ? 1 : 0, input.notes || null,
        ]
      );
      return this.getPriceLists().find((p) => p.id === id)!;
    });
  }

  public updatePriceList(id: string, patch: Partial<PriceList>): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'pricing.update');
    if (patch.isDefault) this.db.run(`UPDATE price_lists SET is_default = 0`);
    this.db.run(
      `UPDATE price_lists SET
        name = COALESCE(?, name), customer_type = COALESCE(?, customer_type),
        valid_from = COALESCE(?, valid_from), valid_to = COALESCE(?, valid_to),
        is_default = COALESCE(?, is_default), is_active = COALESCE(?, is_active),
        notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ?`,
      [
        patch.name ?? null, patch.customerType ?? null, patch.validFrom ?? null, patch.validTo ?? null,
        patch.isDefault === undefined ? null : (patch.isDefault ? 1 : 0),
        patch.isActive === undefined ? null : (patch.isActive ? 1 : 0),
        patch.notes ?? null, new Date().toISOString(), id,
      ]
    );
  }

  public togglePriceList(id: string, active: boolean): void {
    this.updatePriceList(id, { isActive: active });
  }

  public getPriceListItems(priceListId: string): PriceListItem[] {
    return this.db.query<PriceListItem>(
      `SELECT i.*, p.name AS product_name, p.sku AS product_sku
       FROM price_list_items i JOIN products p ON p.id = i.product_id
       WHERE i.price_list_id = ? ORDER BY p.name`,
      [priceListId]
    );
  }

  public addPriceListItem(input: { priceListId: string; productId: string; priceM2: number; priceBox?: number; minQuantityM2?: number }): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'pricing.update');
    if (!(input.priceM2 > 0)) throw new Error('سعر المتر يجب أن يكون أكبر من صفر.');
    const existing = this.db.query(
      `SELECT id FROM price_list_items WHERE price_list_id = ? AND product_id = ? AND min_quantity_m2 = ?`,
      [input.priceListId, input.productId, input.minQuantityM2 || 0]
    )[0];
    if (existing) throw new Error('هذا الصنف موجود بالفعل في القائمة بنفس حد الكمية.');

    this.db.run(
      `INSERT INTO price_list_items (id, price_list_id, product_id, price_m2, price_box, min_quantity_m2)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `pli_${uuidv4().substring(0, 8)}`, input.priceListId, input.productId,
        input.priceM2, input.priceBox || 0, input.minQuantityM2 || 0,
      ]
    );
  }

  public deletePriceListItem(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'pricing.update');
    this.db.run(`DELETE FROM price_list_items WHERE id = ?`, [id]);
  }

  public getPromotions(search = ''): Promotion[] {
    let sql = `SELECT * FROM promotions WHERE 1 = 1`;
    const params: any[] = [];
    if (search.trim()) {
      sql += ` AND (name LIKE ? OR code LIKE ? OR notes LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY starts_at DESC`;
    const today = new Date().toISOString().slice(0, 10);
    return this.db.query<Promotion>(sql, params).map((p) => ({
      ...p,
      isActive: Boolean(p.isActive),
      currentlyRunning: Boolean(p.isActive) && p.startsAt <= today && p.endsAt >= today,
    }));
  }

  public createPromotion(input: {
    name: string; promotionType: Promotion['promotionType']; discountPercentage?: number;
    discountAmount?: number; buyQuantity?: number; getQuantity?: number; minOrderAmount?: number;
    appliesTo?: Promotion['appliesTo']; startsAt: string; endsAt: string;
    usageLimit?: number; notes?: string;
  }): Promotion {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'pricing.update');
    if (!input.name.trim()) throw new Error('اسم العرض مطلوب.');
    if (!input.startsAt || !input.endsAt) throw new Error('تواريخ بداية ونهاية العرض مطلوبة.');
    if (input.endsAt < input.startsAt) throw new Error('تاريخ النهاية يجب أن يكون بعد البداية.');

    const id = `promo_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('PROMO');
      db.run(
        `INSERT INTO promotions (
          id, code, name, promotion_type, discount_percentage, discount_amount,
          buy_quantity, get_quantity, min_order_amount, applies_to, starts_at, ends_at,
          usage_limit, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, code, input.name.trim(), input.promotionType, input.discountPercentage || 0,
          input.discountAmount || 0, input.buyQuantity || 0, input.getQuantity || 0,
          input.minOrderAmount || 0, input.appliesTo || 'ALL', input.startsAt, input.endsAt,
          input.usageLimit ?? null, input.notes || null, actor.id,
        ]
      );
      return this.getPromotions().find((p) => p.id === id)!;
    });
  }

  public togglePromotion(id: string, active: boolean): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'pricing.update');
    this.db.run(`UPDATE promotions SET is_active = ? WHERE id = ?`, [active ? 1 : 0, id]);
  }

  public deletePromotion(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'pricing.update');
    this.db.run(`DELETE FROM promotions WHERE id = ?`, [id]);
  }

  public getCustomerOverrides(customerId: string): Array<{ id: string; productId: string; productName: string; priceM2: number; validFrom?: string | null; validTo?: string | null }> {
    return this.db.query(
      `SELECT o.id, o.product_id AS productId, p.name AS productName, o.price_m2 AS priceM2,
              o.valid_from AS validFrom, o.valid_to AS validTo
       FROM customer_price_overrides o JOIN products p ON p.id = o.product_id
       WHERE o.customer_id = ? ORDER BY p.name`,
      [customerId]
    );
  }

  public setCustomerOverride(input: { customerId: string; productId: string; priceM2: number; validFrom?: string; validTo?: string; notes?: string }): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'pricing.update');
    this.db.run(
      `INSERT INTO customer_price_overrides (id, customer_id, product_id, price_m2, valid_from, valid_to, approved_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(customer_id, product_id) DO UPDATE SET price_m2 = excluded.price_m2,
         valid_from = excluded.valid_from, valid_to = excluded.valid_to, approved_by = excluded.approved_by`,
      [uuidv4(), input.customerId, input.productId, input.priceM2, input.validFrom || null, input.validTo || null, actor.id, input.notes || null]
    );
  }

  public deleteCustomerOverride(customerId: string, productId: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'pricing.update');
    this.db.run(`DELETE FROM customer_price_overrides WHERE customer_id = ? AND product_id = ?`, [customerId, productId]);
  }

  /**
   * Resolve the best applicable unit price for a product:
   * customer override → matching active price list (best min-qty tier) → default list → product base price.
   */
  public getEffectivePrice(productId: string, customerId?: string | null, quantityM2 = 0): {
    priceM2: number; source: 'OVERRIDE' | 'PRICE_LIST' | 'DEFAULT_LIST' | 'BASE';
    listName?: string; originalPrice: number;
  } {
    const product = this.db.query<any>(`SELECT selling_price_m2 AS basePrice, category_id AS categoryId, brand_id AS brandId FROM products WHERE id = ?`, [productId])[0];
    const basePrice = Number(product?.basePrice) || 0;
    const today = new Date().toISOString().slice(0, 10);

    if (customerId) {
      const override = this.db.query<any>(
        `SELECT price_m2 AS price FROM customer_price_overrides
         WHERE customer_id = ? AND product_id = ?
           AND (valid_from IS NULL OR valid_from <= ?) AND (valid_to IS NULL OR valid_to >= ?)`,
        [customerId, productId, today, today]
      )[0];
      if (override && Number(override.price) > 0) {
        return { priceM2: Number(override.price), source: 'OVERRIDE', originalPrice: basePrice };
      }
    }

    const customerType = customerId
      ? this.db.query<any>(`SELECT customer_type AS type FROM customers WHERE id = ?`, [customerId])[0]?.type
      : null;
    const mappedType = customerType === 'ENGINEER' ? 'CONTRACTOR' : customerType;

    if (mappedType) {
      const listItem = this.db.query<any>(
        `SELECT i.price_m2 AS price, pl.name AS listName
         FROM price_list_items i JOIN price_lists pl ON pl.id = i.price_list_id
         WHERE i.product_id = ? AND pl.is_active = 1 AND pl.customer_type = ?
           AND (pl.valid_from IS NULL OR pl.valid_from <= ?) AND (pl.valid_to IS NULL OR pl.valid_to >= ?)
           AND i.min_quantity_m2 <= ?
         ORDER BY i.min_quantity_m2 DESC, i.price_m2 ASC LIMIT 1`,
        [productId, mappedType, today, today, quantityM2]
      )[0];
      if (listItem) {
        return { priceM2: Number(listItem.price), source: 'PRICE_LIST', listName: listItem.listName, originalPrice: basePrice };
      }
    }

    const defaultItem = this.db.query<any>(
      `SELECT i.price_m2 AS price, pl.name AS listName
       FROM price_list_items i JOIN price_lists pl ON pl.id = i.price_list_id
       WHERE i.product_id = ? AND pl.is_active = 1 AND pl.is_default = 1
         AND (pl.valid_from IS NULL OR pl.valid_from <= ?) AND (pl.valid_to IS NULL OR pl.valid_to >= ?)
         AND i.min_quantity_m2 <= ?
       ORDER BY i.min_quantity_m2 DESC LIMIT 1`,
      [productId, today, today, quantityM2]
    )[0];
    if (defaultItem) {
      return { priceM2: Number(defaultItem.price), source: 'DEFAULT_LIST', listName: defaultItem.listName, originalPrice: basePrice };
    }

    return { priceM2: basePrice, source: 'BASE', originalPrice: basePrice };
  }

  public getBestPromotion(product: { productId: string; categoryId?: string | null; brandId?: string | null }, subtotal = 0, quantity = 0): { name: string; discount: number; code: string } | null {
    const today = new Date().toISOString().slice(0, 10);
    const rows = this.db.query<any>(
      `SELECT * FROM promotions
       WHERE is_active = 1 AND starts_at <= ? AND ends_at >= ?
         AND (usage_limit IS NULL OR usage_limit = 0 OR usage_count < usage_limit)
         AND (min_order_amount = 0 OR min_order_amount <= ?)
       ORDER BY discount_percentage DESC, discount_amount DESC`,
      [today, today, subtotal]
    );

    for (const promo of rows) {
      if (promo.applies_to !== 'ALL') {
        const type = promo.applies_to === 'PRODUCTS' ? 'PRODUCT' : promo.applies_to === 'CATEGORIES' ? 'CATEGORY' : 'BRAND';
        const targetId = type === 'PRODUCT' ? product.productId : type === 'CATEGORY' ? product.categoryId : product.brandId;
        const hit = this.db.query<any>(
          `SELECT 1 FROM promotion_targets WHERE promotion_id = ? AND target_type = ? AND target_id = ?`,
          [promo.id, type, targetId || '']
        )[0];
        if (!hit) continue;
      }

      if (promo.promotion_type === 'BUY_X_GET_Y') {
        if (quantity > 0 && promo.buy_quantity > 0 && promo.get_quantity > 0) {
          const free = Math.floor(quantity / promo.buy_quantity) * promo.get_quantity;
          if (free > 0) return { name: `${promo.name} (${free} مجانًا)`, discount: 0, code: promo.code };
        }
        continue;
      }
      if (promo.promotion_type === 'BUNDLE_PRICE') continue;

      const base = subtotal > 0 ? subtotal : 0;
      const discount = promo.promotion_type === 'PERCENTAGE'
        ? (base * Number(promo.discount_percentage)) / 100
        : Number(promo.discount_amount);
      if (discount > 0) return { name: promo.name, discount: Math.round(discount * 100) / 100, code: promo.code };
    }
    return null;
  }
}
