import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { MIGRATIONS } from '../src/database/migrations.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { LoyaltyService } from '../src/services/LoyaltyService.ts';
import { PricingService, type PromotionCartItem } from '../src/services/PricingService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { localDateString } from '../src/utils/date.ts';

test('promotions created in pricing evaluate to the same discounts POS applies', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  const db = manager;
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  db.run('DELETE FROM promotion_usage');
  db.run('DELETE FROM promotion_targets');
  db.run('DELETE FROM promotions');

  const pricing = new PricingService();
  const today = localDateString();
  const cart: PromotionCartItem[] = [
    { productId: 'prod-promo-a', categoryId: 'cat-promo', brandId: 'brand-promo', qty: 2, unitPrice: 10, amount: 20 },
    { productId: 'prod-promo-b', categoryId: 'cat-promo', brandId: 'brand-promo', qty: 1, unitPrice: 5, amount: 5 },
  ];
  const create = (input: Omit<Parameters<PricingService['createPromotion']>[0], 'name' | 'startsAt' | 'endsAt'>) => pricing.createPromotion({
    name: `POS ${input.promotionType}`, startsAt: today, endsAt: today, ...input,
  });
  const disable = (id: string) => pricing.togglePromotion(id, false);

  const percent = create({ promotionType: 'PERCENTAGE', discountPercentage: 10 });
  assert.equal(pricing.evaluatePromotions(cart)?.discountAmount, 2.5);
  disable(percent.id);

  const fixed = create({ promotionType: 'FIXED_AMOUNT', discountAmount: 40 });
  assert.equal(pricing.evaluatePromotions(cart)?.discountAmount, 25, 'fixed discount cannot exceed eligible subtotal');
  disable(fixed.id);

  const buyGet = create({ promotionType: 'BUY_X_GET_Y', buyQuantity: 2, getQuantity: 1 });
  assert.equal(pricing.evaluatePromotions(cart)?.discountAmount, 5, 'the cheapest qualifying item is free');
  disable(buyGet.id);

  const bundle = create({ promotionType: 'BUNDLE_PRICE', bundlePrice: 18, buyQuantity: 3 });
  assert.equal(pricing.evaluatePromotions(cart)?.discountAmount, 7, 'bundle discount is subtotal less bundle price');
  disable(bundle.id);

  const target = create({ promotionType: 'PERCENTAGE', discountPercentage: 50, appliesTo: 'PRODUCTS', targetIds: ['prod-promo-a'] });
  assert.equal(pricing.evaluatePromotions(cart)?.discountAmount, 10, 'target scope limits the discount base');
  disable(target.id);

  const coupon = create({ promotionType: 'FIXED_AMOUNT', discountAmount: 3, couponCode: 'SAVE3' });
  assert.equal(pricing.evaluatePromotions(cart), null, 'coupon-only promotion is not applied without its code');
  assert.equal(pricing.evaluatePromotions(cart, 'save3')?.discountAmount, 3);
  pricing.recordPromotionUsage(coupon.id, 'invoice-promo-test', 'SAVE3', 3);
  assert.equal(db.query<{ usageCount: number }>('SELECT usage_count FROM promotions WHERE id = ?', [coupon.id])[0].usageCount, 1);

  db.run(`INSERT INTO promotions (id, code, name, promotion_type, type, value, buy_qty, get_qty,
    starts_at, ends_at, start_date, end_date, created_by)
    VALUES ('legacy-promo', 'LEGACY-PROMO', 'Legacy BOGO', 'PERCENTAGE', 'BOGO', 0, 2, 1, ?, ?, ?, ?, 'usr_admin')`,
  [today, today, today, today]);
  const canonicalize = MIGRATIONS.find((migration) => migration.id === '102_canonical_pricing_promotions');
  assert.ok(canonicalize);
  canonicalize.up(manager.getDatabase());
  assert.equal(pricing.evaluatePromotions(cart)?.promotionId, 'legacy-promo');
  assert.equal(pricing.evaluatePromotions(cart)?.discountAmount, 5);
});

test('sales reject POS discounts that exceed the net item subtotal', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const customer = new CustomerService().createCustomer({
    name: 'عميل حد خصم نقطة البيع',
    phone: '0122222399',
    customerType: 'RETAIL',
    creditLimit: 0,
  });
  db.run(
    `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active)
     VALUES ('prod_pos_discount_limit', 'SKU-POS-DISCOUNT', 'BAR-POS-DISCOUNT', 'صنف اختبار الخصم',
       'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 10, 1)`
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES ('stk_pos_discount_limit', 'wh_main', 'prod_pos_discount_limit', 10, 0)`
  );

  assert.throws(
    () => new SalesService().createSale({
      customerId: customer.id,
      warehouseId: 'wh_main',
      items: [{
        productId: 'prod_pos_discount_limit',
        soldBy: 'M2',
        quantityM2: 1,
        boxesCount: 1,
        piecesCount: 0,
        unitPrice: 300,
      }],
      discountAmount: 301,
      paidAmount: 0,
      paymentType: 'CASH',
    }),
    /إجمالي الخصم يتجاوز صافي قيمة الأصناف/
  );

  const loyalty = new LoyaltyService();
  loyalty.initializeCustomerLoyalty(customer.id);
  loyalty.earnPoints({
    customerId: customer.id,
    points: 15,
    referenceType: 'SALES_INVOICE',
    referenceId: 'invoice-loyalty-test',
  });
  assert.equal(loyalty.getRedeemablePointBalance(customer.id), 15);
});
