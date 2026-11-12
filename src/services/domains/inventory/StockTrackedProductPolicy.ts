
/**
 * Single policy used by every service that creates or changes stock quantities:
 * only products that actually carry physical stock may be adjusted, counted,
 * planned for reorder or assigned to a bin. Services are excluded.
 */
export class StockTrackedProductPolicy {
  static isStockTracked(product: { productType?: string; baseUnit?: string } | null | undefined): boolean {
    if (!product) return false;
    if (product.productType === 'SERVICE' || product.baseUnit === 'SERVICE') return false;
    return true;
  }

  static assertStockTracked(
    db: DatabaseManager,
    productId: string,
    context = 'هذه العملية',
  ): void {
    const product = db.query<{ productType: string; baseUnit: string; name: string }>(
      `SELECT product_type AS productType, base_unit AS baseUnit, name FROM products WHERE id = ?`,
      [productId],
    )[0];
    if (!product) throw new Error(`الصنف ${productId} غير موجود.`);
    if (!this.isStockTracked(product)) {
      throw new Error(`لا يمكن إدخال الصنف "${product.name}" في ${context} لأنه خدمة (SERVICE) ولا يحمل مخزوناً مادياً.`);
    }
  }

  static assertStockTrackedBatch(db: DatabaseManager, productIds: string[], context = 'هذه العملية'): void {
    for (const productId of productIds) this.assertStockTracked(db, productId, context);
  }
}
