import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';

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
  bundlePrice: number;
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

export interface AppliedPromotion {
  promotionId: string;
  name: string;
  type: Promotion['promotionType'];
  discountAmount: number;
}

export interface PromotionCartItem {
  productId: string;
  categoryId?: string | null;
  brandId?: string | null;
  qty: number;
  unitPrice: number;
  amount: number;
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
    PermissionService.require(actor, 'ui.pricing.pricing.update');
    if (!input.name.trim()) throw new Error('اسم قائمة الأسعار مطلوب.');
    const validFrom = this.normalizeDate(input.validFrom, 'تاريخ البداية');
    const validTo = this.normalizeDate(input.validTo, 'تاريخ النهاية');
    this.assertDateRange(validFrom, validTo);

    const id = `pl_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('PL');
      const previousDefaults = input.isDefault ? db.query<any>('SELECT * FROM price_lists WHERE is_default = 1') : [];
      if (input.isDefault) db.run(`UPDATE price_lists SET is_default = 0`);
      db.run(
        `INSERT INTO price_lists (id, code, name, customer_type, valid_from, valid_to, is_default, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, code, input.name.trim(), input.customerType || 'RETAIL',
          validFrom, validTo, input.isDefault ? 1 : 0, input.notes || null,
        ]
      );
      this.auditPriceChange(db, actor, 'Create price list', id, null, {
        name: input.name.trim(), customerType: input.customerType || 'RETAIL', validFrom, validTo,
        isDefault: Boolean(input.isDefault), notes: input.notes || null,
      });
      for (const previous of previousDefaults) {
        this.auditPriceChange(db, actor, 'Unset default price list', previous.id, previous, { ...previous, is_default: 0 });
      }
      return this.getPriceLists().find((p) => p.id === id)!;
    });
  }

  public updatePriceList(id: string, patch: Partial<PriceList>): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.pricing.pricing.update');
    this.db.executeTransaction((db) => {
      const old = db.query<any>('SELECT * FROM price_lists WHERE id = ?', [id])[0];
      if (!old) throw new Error('Price list not found.');
      const has = (key: keyof PriceList) => Object.prototype.hasOwnProperty.call(patch, key);
      const sets = (key: keyof PriceList) => has(key) && patch[key] !== undefined;
      const nextValidFrom = sets('validFrom') ? this.normalizeDate(patch.validFrom, 'Start date') : old.valid_from;
      const nextValidTo = sets('validTo') ? this.normalizeDate(patch.validTo, 'End date') : old.valid_to;
      this.assertDateRange(nextValidFrom, nextValidTo);
      if (patch.name !== undefined && !String(patch.name).trim()) throw new Error('Price list name is required.');
      const previousDefaults = patch.isDefault ? db.query<any>('SELECT * FROM price_lists WHERE is_default = 1 AND id != ?', [id]) : [];
      if (patch.isDefault) db.run('UPDATE price_lists SET is_default = 0');

      const assignments: string[] = [];
      const values: any[] = [];
      const set = (column: string, value: any) => { assignments.push(`${column} = ?`); values.push(value); };
      if (patch.name !== undefined) set('name', String(patch.name).trim());
      if (patch.customerType !== undefined) set('customer_type', patch.customerType);
      if (sets('validFrom')) set('valid_from', nextValidFrom);
      if (sets('validTo')) set('valid_to', nextValidTo);
      if (patch.isDefault !== undefined) set('is_default', patch.isDefault ? 1 : 0);
      if (patch.isActive !== undefined) set('is_active', patch.isActive ? 1 : 0);
      if (patch.notes !== undefined) set('notes', patch.notes);
      if (!assignments.length) return;
      assignments.push('updated_at = ?');
      values.push(new Date().toISOString(), id);
      db.run(`UPDATE price_lists SET ${assignments.join(', ')} WHERE id = ?`, values);
      const updated = db.query<any>('SELECT * FROM price_lists WHERE id = ?', [id])[0];
      this.auditPriceChange(db, actor, 'Update price list', id, old, updated);
      for (const previous of previousDefaults) {
        this.auditPriceChange(db, actor, 'Unset default price list', previous.id, previous, { ...previous, is_default: 0 });
      }
    });
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
    PermissionService.require(actor, 'ui.pricing.pricing.update');
    const priceM2 = Number(input.priceM2);
    const priceBox = input.priceBox === undefined ? 0 : Number(input.priceBox);
    const minQuantityM2 = input.minQuantityM2 === undefined ? 0 : Number(input.minQuantityM2);
    if (!Number.isFinite(priceM2) || priceM2 <= 0) throw new Error('Meter price must be a finite number greater than zero.');
    if (!Number.isFinite(priceBox) || priceBox < 0) throw new Error('Box price must be a finite non-negative number.');
    if (!Number.isFinite(minQuantityM2) || minQuantityM2 < 0) throw new Error('Minimum quantity must be a finite non-negative number.');
    const existing = this.db.query(
      `SELECT id FROM price_list_items WHERE price_list_id = ? AND product_id = ? AND min_quantity_m2 = ?`,
      [input.priceListId, input.productId, minQuantityM2]
    )[0];
    if (existing) throw new Error('هذا الصنف موجود بالفعل في القائمة بنفس حد الكمية.');

    const id = `pli_${uuidv4().substring(0, 8)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO price_list_items (id, price_list_id, product_id, price_m2, price_box, min_quantity_m2)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, input.priceListId, input.productId, priceM2, priceBox, minQuantityM2]
      );
      this.auditPriceChange(db, actor, 'Add price list item', id, null, {
        priceListId: input.priceListId, productId: input.productId, priceM2, priceBox, minQuantityM2,
      });
    });
  }

  public deletePriceListItem(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.pricing.pricing.update');
    this.db.executeTransaction((db) => {
      const old = db.query<any>('SELECT * FROM price_list_items WHERE id = ?', [id])[0];
      if (!old) return;
      db.run('DELETE FROM price_list_items WHERE id = ?', [id]);
      this.auditPriceChange(db, actor, 'Delete price list item', id, old, null);
    });
  }

  public getPromotions(search = ''): Promotion[] {
    PermissionService.require(AuthService.requireAuth(), 'ui.promotions.promotions.view');
    return this.queryPromotions(search);
  }

  private queryPromotions(search = ''): Promotion[] {
    let sql = `SELECT * FROM promotions WHERE 1 = 1`;
    const params: any[] = [];
    if (search.trim()) {
      sql += ` AND (name LIKE ? OR code LIKE ? OR notes LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY starts_at DESC`;
    const today = localDateString();
    return this.db.query<any>(sql, params).map((p) => ({
      ...p,
      bundlePrice: Number(p.discountAmount) || 0,
      isActive: Boolean(p.isActive),
      currentlyRunning: Boolean(p.isActive) && p.startsAt <= today && p.endsAt >= today,
    }));
  }

  public createPromotion(input: {
    name: string; promotionType: Promotion['promotionType']; discountPercentage?: number;
    discountAmount?: number; bundlePrice?: number; buyQuantity?: number; getQuantity?: number; minOrderAmount?: number;
    appliesTo?: Promotion['appliesTo']; startsAt: string; endsAt: string;
    usageLimit?: number; notes?: string; couponCode?: string; targetIds?: string[];
  }): Promotion {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.promotions.promotions.manage');
    if (!input.name.trim()) throw new Error('اسم العرض مطلوب.');
    if (!input.startsAt || !input.endsAt) throw new Error('تواريخ بداية ونهاية العرض مطلوبة.');
    if (input.endsAt < input.startsAt) throw new Error('تاريخ النهاية يجب أن يكون بعد البداية.');
    if (input.promotionType === 'PERCENTAGE' && (!(Number(input.discountPercentage) > 0) || Number(input.discountPercentage) > 100)) throw new Error('نسبة الخصم يجب أن تكون بين 0 و100.');
    if (input.promotionType === 'FIXED_AMOUNT' && !(Number(input.discountAmount) > 0)) throw new Error('مبلغ الخصم يجب أن يكون أكبر من صفر.');
    if (input.promotionType === 'BUY_X_GET_Y' && (!(Number(input.buyQuantity) > 0) || !(Number(input.getQuantity) > 0))) throw new Error('كميتا الشراء والمجاني يجب أن تكونا أكبر من صفر.');
    if (input.promotionType === 'BUNDLE_PRICE' && (!(Number(input.bundlePrice) > 0) || !(Number(input.buyQuantity) > 0))) throw new Error('سعر الحزمة وعدد وحداتها يجب أن يكونا أكبر من صفر.');
    const targets = Array.from(new Set((input.targetIds || []).map((targetId) => targetId.trim()).filter(Boolean)));
    if (input.appliesTo && input.appliesTo !== 'ALL' && targets.length === 0) throw new Error('العناصر المستهدفة مطلوبة.');

    const id = `promo_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('PROMO');
      db.run(
        `INSERT INTO promotions (
          id, code, name, promotion_type, discount_percentage, discount_amount,
          buy_quantity, get_quantity, min_order_amount, applies_to, starts_at, ends_at,
          usage_limit, notes, created_by, coupon_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, code, input.name.trim(), input.promotionType, input.discountPercentage || 0,
          input.promotionType === 'BUNDLE_PRICE' ? (input.bundlePrice || 0) : (input.discountAmount || 0), input.buyQuantity || 0, input.getQuantity || 0,
          input.minOrderAmount || 0, input.appliesTo || 'ALL', input.startsAt, input.endsAt,
          input.usageLimit ?? null, input.notes || null, actor.id, input.couponCode?.trim() || null,
        ]
      );
      const targetType = input.appliesTo === 'PRODUCTS' ? 'PRODUCT' : input.appliesTo === 'CATEGORIES' ? 'CATEGORY' : 'BRAND';
      for (const targetId of targets) {
        db.run('INSERT INTO promotion_targets (id, promotion_id, target_type, target_id) VALUES (?, ?, ?, ?)',
          [`pt_${uuidv4().substring(0, 8)}`, id, targetType, targetId]);
      }
      return this.queryPromotions().find((p) => p.id === id)!;
    });
  }

  public togglePromotion(id: string, active: boolean): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.promotions.promotions.manage');
    this.db.run(`UPDATE promotions SET is_active = ? WHERE id = ?`, [active ? 1 : 0, id]);
  }

  public deletePromotion(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.promotions.promotions.manage');
    this.db.run(`DELETE FROM promotions WHERE id = ?`, [id]);
  }

  public getCustomerOverrides(customerId: string): Array<{ id: string; productId: string; productName: string; priceM2: number; validFrom?: string | null; validTo?: string | null }> {
    PermissionService.require(AuthService.requireAuth(), 'ui.pricing.pricing.view');
    return this.db.query(
      `SELECT o.id, o.product_id AS productId, p.name AS productName, o.price_m2 AS priceM2,
              o.valid_from AS validFrom, o.valid_to AS validTo
       FROM customer_price_overrides o JOIN products p ON p.id = o.product_id
       WHERE o.customer_id = ? ORDER BY p.name`,
      [customerId]
    );
  }

  public setCustomerOverride(input: { customerId: string; productId: string; priceM2: number; validFrom?: string | null; validTo?: string | null; notes?: string }): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.pricing.pricing.update');
    const priceM2 = Number(input.priceM2);
    if (!Number.isFinite(priceM2) || priceM2 <= 0) throw new Error('Customer override price must be a finite number greater than zero.');
    const validFrom = this.normalizeDate(input.validFrom, 'Start date');
    const validTo = this.normalizeDate(input.validTo, 'End date');
    this.assertDateRange(validFrom, validTo);
    if (!input.customerId || !input.productId) throw new Error('Customer and product are required for a price override.');
    this.db.executeTransaction((db) => {
      const old = db.query<any>(
        'SELECT * FROM customer_price_overrides WHERE customer_id = ? AND product_id = ?', [input.customerId, input.productId]
      )[0] || null;
      db.run(
        `INSERT INTO customer_price_overrides (id, customer_id, product_id, price_m2, valid_from, valid_to, approved_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(customer_id, product_id) DO UPDATE SET price_m2 = excluded.price_m2,
           valid_from = excluded.valid_from, valid_to = excluded.valid_to, approved_by = excluded.approved_by, notes = excluded.notes`,
        [uuidv4(), input.customerId, input.productId, priceM2, validFrom, validTo, actor.id, input.notes ?? old?.notes ?? null]
      );
      const updated = db.query<any>(
        'SELECT * FROM customer_price_overrides WHERE customer_id = ? AND product_id = ?', [input.customerId, input.productId]
      )[0];
      this.auditPriceChange(db, actor, old ? 'Update customer price override' : 'Create customer price override', updated.id, old, updated);
    });
  }

  public deleteCustomerOverride(customerId: string, productId: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.pricing.pricing.update');
    this.db.executeTransaction((db) => {
      const old = db.query<any>(
        'SELECT * FROM customer_price_overrides WHERE customer_id = ? AND product_id = ?', [customerId, productId]
      )[0];
      if (!old) return;
      db.run('DELETE FROM customer_price_overrides WHERE customer_id = ? AND product_id = ?', [customerId, productId]);
      this.auditPriceChange(db, actor, 'Delete customer price override', old.id, old, null);
    });
  }

  /**
   * Resolve the best applicable unit price for a product:
   * customer override → matching active price list (best min-qty tier) → default list → product base price.
   */
  public getEffectivePrice(productId: string, customerId?: string | null, quantityM2 = 0): {
    priceM2: number; priceBox?: number; source: 'OVERRIDE' | 'PRICE_LIST' | 'DEFAULT_LIST' | 'BASE';
    listName?: string; originalPrice: number;
  } {
    const product = this.db.query<any>(`SELECT selling_price_m2 AS basePrice, category_id AS categoryId, brand_id AS brandId FROM products WHERE id = ?`, [productId])[0];
    const basePrice = Number(product?.basePrice) || 0;
    const today = localDateString();

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
        `SELECT i.price_m2 AS price, i.price_box AS priceBox, pl.name AS listName
         FROM price_list_items i JOIN price_lists pl ON pl.id = i.price_list_id
         WHERE i.product_id = ? AND pl.is_active = 1 AND pl.customer_type = ?
           AND (pl.valid_from IS NULL OR pl.valid_from <= ?) AND (pl.valid_to IS NULL OR pl.valid_to >= ?)
           AND i.min_quantity_m2 <= ?
         ORDER BY i.min_quantity_m2 DESC, i.price_m2 ASC LIMIT 1`,
        [productId, mappedType, today, today, quantityM2]
      )[0];
      if (listItem) {
        return { priceM2: Number(listItem.price), priceBox: Number(listItem.priceBox) || undefined, source: 'PRICE_LIST', listName: listItem.listName, originalPrice: basePrice };
      }
    }

    const defaultItem = this.db.query<any>(
      `SELECT i.price_m2 AS price, i.price_box AS priceBox, pl.name AS listName
       FROM price_list_items i JOIN price_lists pl ON pl.id = i.price_list_id
       WHERE i.product_id = ? AND pl.is_active = 1 AND pl.is_default = 1
         AND (pl.valid_from IS NULL OR pl.valid_from <= ?) AND (pl.valid_to IS NULL OR pl.valid_to >= ?)
         AND i.min_quantity_m2 <= ?
       ORDER BY i.min_quantity_m2 DESC LIMIT 1`,
      [productId, today, today, quantityM2]
    )[0];
    if (defaultItem) {
      return { priceM2: Number(defaultItem.price), priceBox: Number(defaultItem.priceBox) || undefined, source: 'DEFAULT_LIST', listName: defaultItem.listName, originalPrice: basePrice };
    }

    return { priceM2: basePrice, source: 'BASE', originalPrice: basePrice };
  }

  public getBestPromotion(product: { productId: string; categoryId?: string | null; brandId?: string | null }, subtotal = 0, quantity = 0): { name: string; discount: number; code: string } | null {
    const applied = this.evaluatePromotions([{
      ...product,
      qty: quantity,
      unitPrice: quantity > 0 ? subtotal / quantity : 0,
      amount: subtotal,
    }]);
    return applied ? { name: applied.name, discount: applied.discountAmount, code: applied.promotionId } : null;
  }

  /** Evaluate the same canonical promotions created by the pricing console. */
  public evaluatePromotions(cart: PromotionCartItem[], couponCode?: string, onlyPromotionId?: string): AppliedPromotion | null {
    if (!cart.length) return null;
    const today = localDateString();
    const rows = this.db.query<any>(
      `SELECT * FROM promotions
       WHERE is_active = 1 AND starts_at <= ? AND ends_at >= ?
         AND (? IS NULL OR id = ?)
         AND (usage_limit IS NULL OR usage_limit = 0 OR usage_count < usage_limit)
         AND (min_order_amount = 0 OR min_order_amount <= ?)
       ORDER BY discount_percentage DESC, discount_amount DESC, starts_at DESC`,
      [today, today, onlyPromotionId || null, onlyPromotionId || null, cart.reduce((sum, item) => sum + item.amount, 0)]
    );

    let best: AppliedPromotion | null = null;
    for (const promo of rows) {
      if (promo.couponCode && String(promo.couponCode).toUpperCase() !== String(couponCode || '').trim().toUpperCase()) continue;
      const scoped = this.scopedPromotionItems(promo, cart);
      if (!scoped.length) continue;
      const subtotal = scoped.reduce((sum, item) => sum + item.amount, 0);
      let discount = 0;
      switch (promo.promotionType) {
        case 'PERCENTAGE':
          discount = subtotal * Number(promo.discountPercentage || 0) / 100;
          break;
        case 'FIXED_AMOUNT':
          discount = Number(promo.discountAmount || 0);
          break;
        case 'BUY_X_GET_Y': {
          const buy = Number(promo.buyQuantity || 0);
          const get = Number(promo.getQuantity || 0);
          if (buy > 0 && get > 0) {
            let freeQty = Math.floor(scoped.reduce((sum, item) => sum + item.qty, 0) / (buy + get)) * get;
            for (const item of [...scoped].sort((a, b) => a.unitPrice - b.unitPrice)) {
              const freeHere = Math.min(Math.max(0, item.qty), freeQty);
              discount += freeHere * item.unitPrice;
              freeQty -= freeHere;
              if (freeQty <= 0) break;
            }
          }
          break;
        }
        case 'BUNDLE_PRICE':
          {
            const bundleQuantity = Number(promo.buyQuantity || 0);
            const totalQuantity = scoped.reduce((sum, item) => sum + item.qty, 0);
            if (bundleQuantity > 0 && totalQuantity >= bundleQuantity) {
              const bundleCount = Math.floor(totalQuantity / bundleQuantity);
              const regularBundleTotal = subtotal / totalQuantity * bundleQuantity;
              discount = Math.max(0, regularBundleTotal - Number(promo.discountAmount || 0)) * bundleCount;
            }
          }
          break;
      }
      discount = Math.min(subtotal, Math.max(0, discount));
      if (discount > 0 && (!best || discount > best.discountAmount)) {
        best = { promotionId: promo.id, name: promo.name, type: promo.promotionType, discountAmount: Math.round(discount * 100) / 100 };
      }
    }
    return best;
  }

  private scopedPromotionItems(promo: any, cart: PromotionCartItem[]): PromotionCartItem[] {
    if (promo.appliesTo === 'ALL') return cart;
    const targetType = promo.appliesTo === 'PRODUCTS' ? 'PRODUCT'
      : promo.appliesTo === 'CATEGORIES' ? 'CATEGORY' : 'BRAND';
    const targets = this.db.query<{ targetId: string }>(
      'SELECT target_id FROM promotion_targets WHERE promotion_id = ? AND target_type = ?',
      [promo.id, targetType]
    ).map((row) => row.targetId);
    if (!targets.length) return [];
    const targetSet = new Set(targets);
    return cart.filter((item) => targetSet.has(
      targetType === 'PRODUCT' ? item.productId : targetType === 'CATEGORY' ? String(item.categoryId || '') : String(item.brandId || '')
    ));
  }

  private normalizeDate(value: string | null | undefined, label: string): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD format.`);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error(`${label} is not a valid calendar date.`);
    }
    return value;
  }

  private assertDateRange(validFrom: string | null, validTo: string | null): void {
    if (validFrom && validTo && validTo < validFrom) throw new Error('End date must not be earlier than start date.');
  }

  private auditPriceChange(
    db: DatabaseManager,
    actor: { id: string; fullName: string },
    action: string,
    recordId: string,
    oldValues: unknown,
    newValues: unknown
  ): void {
    db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
       VALUES (?, ?, ?, ?, 'PRICING', ?, ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId,
        oldValues === null ? null : JSON.stringify(oldValues), newValues === null ? null : JSON.stringify(newValues)]
    );
  }

}
