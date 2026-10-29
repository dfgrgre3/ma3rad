import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../utils/date';
import { round2 } from './financials';

export interface Promotion { id: string; name: string; type: string; value: number; buyQty?: number; getQty?: number; minQty?: number; minAmount?: number; couponCode?: string; productIds?: string[]; categoryIds?: string[]; startDate?: string; endDate?: string; isActive: boolean; priority: number; }

export interface AppliedPromotion { promotionId: string; name: string; type: string; discountAmount: number; }

export class PromotionService {
  private db = DatabaseManager.getInstance();

  getAll(): Promotion[] {
    return this.db.query<any>(`SELECT * FROM promotions WHERE is_active = 1 ORDER BY priority DESC, name`).map(this.map);
  }

  private map(r: any): Promotion {
    return {
      id: r.id, name: r.name, type: r.type, value: r.value, buyQty: r.buyQty, getQty: r.getQty,
      minQty: r.minQty, minAmount: r.minAmount, couponCode: r.couponCode,
      productIds: r.productIds ? JSON.parse(r.productIds) : undefined,
      categoryIds: r.categoryIds ? JSON.parse(r.categoryIds) : undefined,
      startDate: r.startDate, endDate: r.endDate, isActive: Boolean(r.isActive), priority: r.priority,
    };
  }

  /** Find applicable promotions (date + scope) for a cart. */
  findApplicable(cart: { productId: string; categoryId?: string; qty: number; unitPrice: number; amount: number }[], couponCode?: string): Promotion[] {
    const d = localDateString();
    const rows = this.db.query<any>(`
      SELECT * FROM promotions
      WHERE is_active = 1
        AND (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
      ORDER BY priority DESC
    `, [d, d]);
    const promos = rows.map(this.map);
    return promos.filter((p) => {
      if (p.couponCode) {
        if (!couponCode || couponCode.toUpperCase() !== p.couponCode.toUpperCase()) return false;
      }
      // min amount check
      const cartTotal = cart.reduce((s, c) => s + c.amount, 0);
      if (p.minAmount && cartTotal < p.minAmount) return false;
      // product/category scope
      if (p.productIds && p.productIds.length > 0) {
        const hasMatch = cart.some((c) => p.productIds!.includes(c.productId));
        if (!hasMatch) return false;
      }
      if (p.categoryIds && p.categoryIds.length > 0) {
        const hasMatch = cart.some((c) => c.categoryId && p.categoryIds!.includes(c.categoryId));
        if (!hasMatch) return false;
      }
      return true;
    });
  }

  /** Evaluate best promotion discount for a cart. Returns applied promotion + discount amount. */
  evaluate(cart: { productId: string; categoryId?: string; qty: number; unitPrice: number; amount: number }[], couponCode?: string): AppliedPromotion | null {
    const applicable = this.findApplicable(cart, couponCode);
    if (applicable.length === 0) return null;
    // Pick highest priority, then highest discount
    let best: { promo: Promotion; discount: number } | null = null;
    for (const p of applicable) {
      const discount = this.computeDiscount(p, cart);
      if (discount <= 0) continue;
      if (!best || discount > best.discount || (discount === best.discount && p.priority > best.promo.priority)) {
        best = { promo: p, discount };
      }
    }
    if (!best) return null;
    return { promotionId: best.promo.id, name: best.promo.name, type: best.promo.type, discountAmount: round2(best.discount) };
  }

  private computeDiscount(p: Promotion, cart: { productId: string; categoryId?: string; qty: number; unitPrice: number; amount: number }[]): number {
    switch (p.type) {
      case 'PERCENT': {
        const scope = this.scopedItems(p, cart);
        const base = scope.reduce((s, c) => s + c.amount, 0);
        return base * (p.value / 100);
      }
      case 'AMOUNT': {
        const scope = this.scopedItems(p, cart);
        if (scope.length === 0) return 0;
        return p.value;
      }
      case 'BOGO': {
        // Buy X get Y free (cheapest in scope)
        const scope = this.scopedItems(p, cart);
        const buyQty = p.buyQty || 1;
        const getQty = p.getQty || 1;
        const totalQty = scope.reduce((s, c) => s + c.qty, 0);
        const sets = Math.floor(totalQty / (buyQty + getQty));
        if (sets <= 0) return 0;
        // free items = cheapest unit price * getQty * sets
        const prices = scope.flatMap((c) => Array(Math.floor(c.qty)).fill(c.unitPrice));
        prices.sort((a, b) => a - b);
        let free = 0;
        for (let i = 0; i < sets * getQty && i < prices.length; i++) free += prices[i];
        return free;
      }
      case 'BUNDLE': {
        // Fixed price for bundle (not implemented fully; treat as amount off)
        return p.value;
      }
      case 'COUPON': {
        const scope = this.scopedItems(p, cart);
        const base = scope.reduce((s, c) => s + c.amount, 0);
        if (p.value > 0 && p.value <= 100) return base * (p.value / 100);
        return p.value;
      }
      default: return 0;
    }
  }

  private scopedItems(p: Promotion, cart: { productId: string; categoryId?: string; qty: number; unitPrice: number; amount: number }[]) {
    if ((!p.productIds || p.productIds.length === 0) && (!p.categoryIds || p.categoryIds.length === 0)) return cart;
    return cart.filter((c) => (p.productIds && p.productIds.includes(c.productId)) || (p.categoryIds && c.categoryId && p.categoryIds.includes(c.categoryId)));
  }

  create(promo: Omit<Promotion, 'id' | 'isActive' | 'priority'> & { isActive?: boolean; priority?: number }): Promotion {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'promotions.manage');
    const id = `promo_${uuidv4().substring(0, 8)}`;
    this.db.run(`
      INSERT INTO promotions (id, name, type, value, buy_qty, get_qty, min_qty, min_amount, coupon_code, product_ids, category_ids, start_date, end_date, is_active, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, promo.name, promo.type, promo.value, promo.buyQty || null, promo.getQty || null, promo.minQty || null, promo.minAmount || null, promo.couponCode || null, promo.productIds ? JSON.stringify(promo.productIds) : null, promo.categoryIds ? JSON.stringify(promo.categoryIds) : null, promo.startDate || null, promo.endDate || null, promo.isActive === false ? 0 : 1, promo.priority || 0]);
    return this.getAll().find((p) => p.id === id)!;
  }

  recordUsage(promotionId: string, invoiceId: string, couponCode: string | undefined, discountAmount: number): void {
    try {
      this.db.run(`INSERT INTO promotion_usage (id, promotion_id, invoice_id, coupon_code, discount_amount) VALUES (?, ?, ?, ?, ?)`,
        [`pu_${uuidv4().substring(0, 8)}`, promotionId, invoiceId, couponCode || null, discountAmount]);
    } catch { /* ignore */ }
  }
}