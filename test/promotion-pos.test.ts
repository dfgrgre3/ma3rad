import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { MIGRATIONS } from '../src/database/migrations/index.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { LoyaltyService } from '../src/services/domains/sales/LoyaltyService.ts';
import { PricingService, type PromotionCartItem } from '../src/services/domains/sales/PricingService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';
import { calculatePosTotals } from '../src/hooks/pages/sales/pos/usePosTotals.ts';
import { localDateString } from '../src/utils/shared/date.ts';

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

test('POS totals cap combined discounts to the net subtotal', () => {
  const totals = calculatePosTotals({
    cart: [{
      product: { id: 'p1', name: 'Test', productType: 'CERAMIC', baseUnit: 'M2', sellUnit: 'M2', sellingPriceM2: 10, price: 10 } as any,
      soldBy: 'M2',
      soldQuantity: 3,
      quantityM2: 3,
      boxesCount: 1,
      piecesCount: 0,
      unitPrice: 10,
      discountAmount: 0,
      availableStockM2: 10,
    }],
    discountAmount: 100,
    promotionDiscount: 10,
    loyaltyDiscount: 5,
    taxPercentage: 15,
    shippingCost: 0,
    paidAmount: 0,
    activeShift: null,
  });

  assert.equal(totals.subtotal, 30);
  assert.equal(totals.taxableBase, 0);
  assert.equal(totals.taxAmount, 0);
  assert.equal(totals.totalAmount, 0);
});

test('POS totals match persisted invoice for stacked discounts, tax, and shipping', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const customer = new CustomerService().createCustomer({
    name: 'POS totals parity customer', phone: '01088776655', customerType: 'RETAIL', creditLimit: 0,
  });
  db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,
    pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,min_stock_level,is_active)
    VALUES ('prod_pos_totals_parity','SKU-PTP','BAR-PTP','POS totals parity','cat_floor','br_cleo','GRADE_1','1x1',
    'M2','M2',1,1,40,100,90,0,0,1)`);
  db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2)
    VALUES ('stk_pos_totals_parity','wh_main','prod_pos_totals_parity',10,0)`);
  const today = localDateString();
  db.run(`INSERT INTO promotions (id,code,name,promotion_type,discount_amount,starts_at,ends_at,is_active,usage_count,created_by)
    VALUES ('promo_pos_totals_parity','PTP','POS totals parity','FIXED_AMOUNT',10,?,?,1,0,'usr_admin')`, [today, today]);
  const loyalty = new LoyaltyService();
  loyalty.initializeCustomerLoyalty(customer.id);
  loyalty.earnPoints({ customerId: customer.id, points: 5, referenceType: 'TEST_SEED', referenceId: 'pos-totals-parity' });
  const posTotals = calculatePosTotals({
    cart: [{
      product: { id: 'prod_pos_totals_parity', name: 'POS totals parity', productType: 'CERAMIC', baseUnit: 'M2', sellUnit: 'M2', sellingPriceM2: 100, price: 100 } as any,
      soldBy: 'M2', soldQuantity: 2, quantityM2: 2, boxesCount: 0, piecesCount: 0,
      unitPrice: 100, discountAmount: 10, availableStockM2: 10,
    }],
    discountAmount: 20, promotionDiscount: 10, loyaltyDiscount: 5,
    taxPercentage: 10, shippingCost: 7, paidAmount: 177.5, activeShift: null,
  });
  const saleDto: Parameters<SalesService['createSale']>[0] = {
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_pos_totals_parity', soldBy: 'M2', quantityM2: 2, boxesCount: 0,
      piecesCount: 0, unitPrice: 100, discountAmount: 10 }],
    discountAmount: 35, taxAmount: posTotals.taxAmount, shippingCost: 7,
    paidAmount: posTotals.totalAmount, paymentType: 'CASH',
    promotionUsage: { promotionId: 'promo_pos_totals_parity', discountAmount: 10 },
    loyaltyRedemption: { points: 5, discountAmount: 5 },
  };
  assert.throws(
    () => new SalesService().createSale({ ...saleDto, promotionUsage: { ...saleDto.promotionUsage, discountAmount: 9 } }),
    /قيمة الخصم لا تطابق شروط العرض/
  );
  const invoice = new SalesService().createSale(saleDto);
  assert.equal(posTotals.taxableBase, 155);
  assert.equal(posTotals.taxAmount, 15.5);
  assert.equal(posTotals.totalAmount, 177.5);
  assert.equal(invoice.totalAmount, posTotals.totalAmount);
  assert.equal(invoice.remainingAmount, posTotals.remainingAmount);
  assert.equal(loyalty.getCustomerLoyalty(customer.id)?.currentPoints, 17);
  loyalty.redeemPoints({
    customerId: customer.id, points: 10, referenceType: 'TEST_SPEND', referenceId: 'points-spent-after-sale',
  });

  new SalesService().voidInvoice(invoice.id, 'void promotion and loyalty usage');

  assert.equal(loyalty.getCustomerLoyalty(customer.id)?.currentPoints, 5, 'void restores redeemed points and removes unspent earned points');
  assert.equal(loyalty.getCustomerLoyalty(customer.id)?.totalPointsEarned, 5);
  assert.equal(loyalty.getCustomerLoyalty(customer.id)?.totalPointsRedeemed, 10, 'later redemptions remain in the customer history');
  assert.equal(db.query<{ points: number }>(`SELECT SUM(points) AS points FROM loyalty_transactions
    WHERE reference_type = 'SALES_INVOICE_VOID' AND reference_id = ? AND type = 'ADJUST' AND points < 0`, [invoice.id])[0]?.points, -7,
  'only the invoice points still in the balance are reclaimed');
  assert.equal(db.query<{ usageCount: number }>('SELECT usage_count AS usageCount FROM promotions WHERE id = ?', ['promo_pos_totals_parity'])[0]?.usageCount, 0);
  assert.equal(db.query<{ reversedAt: string | null }>('SELECT reversed_at AS reversedAt FROM promotion_usage WHERE invoice_id = ?', [invoice.id])[0]?.reversedAt != null, true);
  assert.equal(db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM loyalty_transactions
    WHERE reference_type = 'SALES_INVOICE_VOID' AND reference_id = ? AND type = 'ADJUST'`, [invoice.id])[0]?.count, 2);
});

test('POS expected closing cash includes partner cash movements', () => {
  const totals = calculatePosTotals({
    cart: [],
    discountAmount: 0,
    promotionDiscount: 0,
    loyaltyDiscount: 0,
    taxPercentage: 0,
    shippingCost: 0,
    paidAmount: 0,
    activeShift: {
      id: 'partner-cash-shift',
      shiftNumber: 'SHIFT-TEST',
      registerId: 'register-test',
      userId: 'user-test',
      userName: 'POS test',
      openedAt: '2026-01-01T00:00:00.000Z',
      openingBalance: 100,
      totalSalesCash: 500,
      totalSalesCard: 0,
      totalSalesTransfer: 0,
      totalCustomerPayments: 80,
      totalSupplierPayments: 40,
      totalExpenses: 20,
      totalRefunds: 10,
      totalPartnerInflows: 60,
      totalPartnerOutflows: 25,
      expectedEndingCash: 0,
      status: 'OPEN',
    },
  });

  assert.equal(totals.expectedClosingCash, 645);
});

test('POS customer pages search and filter real customers by type and active status', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const customerService = new CustomerService();
  const suffix = Date.now().toString();
  const active = customerService.createCustomer({
    name: `POS active ${suffix}`,
    phone: `010${suffix.slice(-8)}`,
    customerType: 'WHOLESALE',
    creditLimit: 0,
  });
  const inactive = customerService.createCustomer({
    name: `POS inactive ${suffix}`,
    phone: `011${suffix.slice(-8)}`,
    customerType: 'RETAIL',
    creditLimit: 0,
  });

  try {
    customerService.updateCustomer(inactive.id, { isActive: 0 });

    const activePage = customerService.getCustomersPage(active.code, 1, 25, {}, {
      customerType: 'WHOLESALE',
      status: 'ACTIVE',
    });
    assert.deepEqual(activePage.items.map((customer) => customer.id), [active.id]);
    assert.equal(activePage.totalItems, 1);
    assert.deepEqual(
      customerService.getCustomersPage(inactive.phone, 1, 25, {}, { status: 'INACTIVE' }).items.map((customer) => customer.id),
      [inactive.id],
    );
    assert.ok(!customerService.getAllCustomers().some((customer) => customer.id === 'cust_cash'));
    assert.ok(!customerService.getCustomersPage('', 1, 25, {}, { status: 'ACTIVE' }).items.some((customer) => customer.id === 'cust_cash'));
    assert.equal(customerService.getCustomerByPhone(` ${active.phone} `)?.id, active.id);
  } finally {
    customerService.deleteCustomer(active.id);
    customerService.deleteCustomer(inactive.id);
  }
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
    referenceType: 'TEST_SEED',
    referenceId: 'invoice-loyalty-test',
  });
  assert.equal(loyalty.getRedeemablePointBalance(customer.id), 15);
});

test('sale creation validates numeric inputs and matches promotion and loyalty discounts', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const customer = new CustomerService().createCustomer({
    name: 'Sale integrity customer', phone: '01099887766', customerType: 'RETAIL', creditLimit: 0,
  });
  db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,
    pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,min_stock_level,is_active)
    VALUES ('prod_integrity_sale','SKU-IS','BAR-IS','Integrity sale product','cat_floor','br_cleo','GRADE_1','60x60',
    'M2','M2',4,1.44,40,100,90,0,0,1)`);
  db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2)
    VALUES ('stk_integrity_sale','wh_main','prod_integrity_sale',20,0)`);
  const sales = new SalesService();
  const baseDto = {
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_integrity_sale', soldBy: 'M2', quantityM2: 2, boxesCount: 0,
      piecesCount: 0, unitPrice: 100, discountAmount: 10 }],
    paidAmount: 0, paymentType: 'CASH' as const,
  };
  assert.throws(() => sales.createSale({ ...baseDto, taxAmount: Number.NaN }), /مبلغ الضريبة غير صحيح/);
  assert.throws(() => sales.createSale({ ...baseDto, shippingCost: Number.POSITIVE_INFINITY }), /تكلفة الشحن غير صحيح/);
  assert.throws(() => sales.createSale({ ...baseDto, payments: [{ method: 'CASH', amount: -1 }] }), /مبلغ إحدى وسائل الدفع غير صحيح/);
  assert.throws(() => sales.createSale({ ...baseDto, items: [{ ...baseDto.items[0], discountAmount: 201 }] }), /خصم الصنف/);
  assert.throws(() => sales.createSale({
    ...baseDto, discountAmount: 35,
    promotionUsage: { promotionId: 'missing-promo', discountAmount: 10 },
    loyaltyRedemption: { points: 5, discountAmount: 5 },
  }), /رصيد نقاط الولاء غير كافٍ/);

  const today = new Date().toISOString().slice(0, 10);
  db.run(`INSERT INTO promotions (id,code,name,promotion_type,discount_amount,starts_at,ends_at,is_active,usage_limit,usage_count,created_by)
    VALUES ('promo_integrity_sale','IS','Integrity sale promo','FIXED_AMOUNT',10,?,?,1,5,0,'usr_admin')`, [today, today]);
  const loyalty = new LoyaltyService();
  loyalty.initializeCustomerLoyalty(customer.id);
  loyalty.earnPoints({ customerId: customer.id, points: 20, referenceType: 'TEST_SEED', referenceId: 'integrity-seed' });
  loyalty.earnPoints({ customerId: customer.id, points: 20, referenceType: 'TEST_SEED', referenceId: 'integrity-seed-2' });
  const invoice = sales.createSale({
    ...baseDto,
    discountAmount: 35,
    taxAmount: 15,
    loyaltyRedemption: { points: 5, discountAmount: 5 },
    promotionUsage: { promotionId: 'promo_integrity_sale', couponCode: 'IS', discountAmount: 10 },
  });
  assert.equal(invoice.discountAmount, 35);
  assert.equal(invoice.totalCost, 80);
  assert.equal(invoice.grossProfit, 75);
  const stockCost = Number(db.query<any>(`SELECT total_cost AS totalCost FROM inventory_transactions WHERE reference_id=? AND type='SALE'`, [invoice.id])[0].totalCost);
  const cogs = Number(db.query<any>(`SELECT jel.debit FROM journal_entry_lines jel JOIN journal_entries je ON je.id=jel.entry_id
    JOIN chart_of_accounts coa ON coa.id=jel.account_id
    WHERE je.reference_type='SALES_INVOICE' AND je.reference_id=? AND coa.code='5101'`, [invoice.id])[0].debit);
  const revenue = Number(db.query<any>(`SELECT jel.credit FROM journal_entry_lines jel JOIN journal_entries je ON je.id=jel.entry_id
    JOIN chart_of_accounts coa ON coa.id=jel.account_id
    WHERE je.reference_type='SALES_INVOICE' AND je.reference_id=? AND coa.code='4101'`, [invoice.id])[0].credit);
  assert.equal(stockCost, invoice.totalCost);
  assert.equal(cogs, invoice.totalCost);
  assert.equal(invoice.grossProfit, revenue - cogs);
  assert.equal(Number(db.query<any>(`SELECT usage_count FROM promotions WHERE id='promo_integrity_sale'`)[0].usageCount), 1);
  assert.equal(loyalty.getRedeemablePointBalance(customer.id), 52);
});
