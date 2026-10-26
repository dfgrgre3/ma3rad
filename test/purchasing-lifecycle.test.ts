import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { ProcurementService } from '../src/services/ProcurementService.ts';
import { PurchaseService } from '../src/services/PurchaseService.ts';
import { PurchaseOrderService } from '../src/services/PurchaseOrderService.ts';
import { SupplierService } from '../src/services/SupplierService.ts';

test('5.3: Procurement Lifecycle - Reorder, RFQ, GRN, Landed Cost, 3-Way Matching, and Supplier Scorecard', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const procurement = new ProcurementService();
  const purchaseService = new PurchaseService();
  const poService = new PurchaseOrderService();
  const supplierService = new SupplierService();

  // 1. Seed test suppliers and products
  const supAId = 'sup_cycle_a';
  const supBId = 'sup_cycle_b';
  db.run(`INSERT OR IGNORE INTO suppliers (id, code, name, phone, current_balance, total_purchases) VALUES (?, ?, ?, ?, 0, 0)`,
    [supAId, 'SUP-CYC-A', 'شركة سيراميكا الفاخرة', '01011111111']);
  db.run(`INSERT OR IGNORE INTO suppliers (id, code, name, phone, current_balance, total_purchases) VALUES (?, ?, ?, ?, 0, 0)`,
    [supBId, 'SUP-CYC-B', 'مصنع الدولية للسيراميك', '01022222222']);

  const prodId = 'prod_cycle_tile';
  db.run(`INSERT OR IGNORE INTO products (
    id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit,
    pieces_per_box, meters_per_box, cost_price, selling_price_m2, wholesale_price_m2,
    min_selling_price_m2, min_stock_level, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`, [
    prodId, 'SKU-CYC-1', 'BAR-CYC-1', 'بلاط بورسلين رمادي 60*60', 'cat_floor', 'br_cleo',
    'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 100, 150, 130, 120, 50
  ]);

  // Ensure warehouse stock is below reorder point (10 m2 vs min 50 m2)
  db.run(`DELETE FROM warehouse_stock WHERE product_id = ?`, [prodId]);
  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES (?, 'wh_main', ?, 10, 0)`,
    ['stk_cycle_1', prodId]);

  // 2. Reorder suggestions & Purchase Request creation
  const suggestions = procurement.getReorderSuggestions('wh_main');
  const targetSuggestion = suggestions.find((s) => s.productId === prodId);
  assert.ok(targetSuggestion, 'Product below min_stock_level must generate a reorder suggestion');
  assert.equal(targetSuggestion.currentStock, 10);
  assert.equal(targetSuggestion.minStockLevel, 50);

  // 3. Supplier RFQ creation, quotes submission, comparison, and awarding
  const rfq = procurement.createRfq({
    dueDate: '2026-11-15',
    notes: 'تسليم مخازن الشركة خلال 7 أيام',
    items: [{ productId: prodId, quantityM2: 200, notes: 'فرز أول كليبر ناعم' }],
  });
  assert.equal(rfq.status, 'OPEN');

  // Supplier A submits bid: 95 EGP/m2, 5 days delivery
  const quoteA = procurement.addSupplierQuotation({
    rfqId: rfq.id,
    supplierId: supAId,
    quotationNumber: 'QUOTE-A-2026',
    deliveryDays: 5,
    validUntil: '2026-12-31',
    paymentTerms: 'CREDIT_30',
    items: [{ productId: prodId, quantityM2: 200, unitCost: 95 }],
  });

  // Supplier B submits bid: 105 EGP/m2, 3 days delivery
  procurement.addSupplierQuotation({
    rfqId: rfq.id,
    supplierId: supBId,
    quotationNumber: 'QUOTE-B-2026',
    deliveryDays: 3,
    validUntil: '2026-12-31',
    paymentTerms: 'CASH',
    items: [{ productId: prodId, quantityM2: 200, unitCost: 105 }],
  });

  const comparison = procurement.compareQuotationsForRfq(rfq.id);
  assert.equal(comparison.quotations.length, 2);
  assert.equal(comparison.bestPriceByProduct[prodId]?.unitCost, 95);
  assert.equal(comparison.bestPriceByProduct[prodId]?.supplierId, supAId);

  // Award RFQ to quoteA -> auto-generates Purchase Order
  const awardResult = procurement.awardQuotation(quoteA.id, true, 'wh_main');
  assert.ok(awardResult.orderId, 'Awarding quotation must auto-create Purchase Order');

  const po = poService.getOrderById(awardResult.orderId);
  assert.ok(po);
  assert.equal(po.supplierId, supAId);
  assert.equal(po.items[0].unitCost, 95);
  assert.equal(po.items[0].quantityM2, 200);

  // 4. Independent Goods Receipt (GRN) with Quality Inspection
  // 180 m2 accepted (shade: T42, caliber: 8, grade: GRADE_1)
  // 15 m2 defective (broken corners)
  // 5 m2 shortage
  const grnResult = procurement.createGoodsReceipt({
    purchaseOrderId: po.id,
    supplierId: supAId,
    warehouseId: 'wh_main',
    deliveryNoteNumber: 'DN-SUP-001',
    vehicleNumber: 'أ ب ج 1234',
    driverName: 'سائق التوريد',
    items: [{
      purchaseOrderItemId: po.items[0].id,
      productId: prodId,
      orderedQuantityM2: 200,
      receivedQuantityM2: 195,
      acceptedQuantityM2: 180,
      damagedQuantityM2: 15,
      shortageQuantityM2: 5,
      toneShade: 'T42',
      caliber: '8',
      batchNumber: 'LOT-2026-T42',
      inspectionNotes: 'وجد 15 متر أطراف مكسورة',
    }],
    notes: 'استلام جزئي مع إثبات كسر ونقص',
  });

  assert.equal(grnResult.hasDiscrepancy, true);
  assert.equal(grnResult.damagedTotal, 15);
  assert.equal(grnResult.shortageTotal, 5);
  assert.equal(grnResult.grn.status, 'ACCEPTED_WITH_REMARKS');

  // Verify warehouse stock increased only by accepted quantity (10 + 180 = 190 m2)
  const updatedStock = Number(db.query<any>(`SELECT quantity_m2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = 'wh_main'`, [prodId])[0].quantityM2);
  assert.equal(updatedStock, 190, 'Stock must only be incremented by accepted quantity');

  // 5. Landed Cost calculation
  const landed = procurement.calculateLandedCost(
    [{ productId: prodId, quantityM2: 180, unitCost: 95 }],
    { freight: 1800, loading: 360, customsTaxes: 0, insurance: 0, other: 0, allocationMethod: 'QUANTITY' }
  );
  assert.equal(landed.totalLandedExpenses, 2160);
  assert.equal(landed.items[0].landedShare, 2160);
  assert.equal(landed.items[0].effectiveUnitCost, 107); // (180*95 + 2160) / 180 = 17100+2160=19260 / 180 = 107

  // 6. 3-Way Matching & Prevention of Duplicate Supplier Invoices
  // Perfect Match check against PO & GRN
  const matchingResult = procurement.perform3WayMatching({
    purchaseOrderId: po.id,
    grnId: grnResult.grn.id,
    invoiceItems: [{ productId: prodId, quantityM2: 180, unitCost: 95 }],
  });
  assert.equal(matchingResult.matchingStatus, 'MATCHED');
  assert.equal(matchingResult.priceVarianceTotal, 0);
  assert.equal(matchingResult.qtyVarianceTotal, 0);

  // Create Purchase Invoice with Landed Cost
  const inv = purchaseService.createPurchase({
    supplierId: supAId,
    supplierInvoiceNumber: 'INV-SUP-1001',
    warehouseId: 'wh_main',
    purchaseOrderId: po.id,
    grnId: grnResult.grn.id,
    items: [{ productId: prodId, quantityM2: 180, unitCost: 95, boxesCount: 125 }],
    paidAmount: 0,
    paymentType: 'CREDIT',
    landedFreight: 1800,
    landedLoading: 360,
    landedAllocationMethod: 'QUANTITY',
  });

  assert.ok(inv.id);
  assert.equal(inv.supplierInvoiceNumber, 'INV-SUP-1001');

  // Duplicate invoice check: Attempting to create another invoice with same number throws
  assert.throws(() => {
    purchaseService.createPurchase({
      supplierId: supAId,
      supplierInvoiceNumber: 'INV-SUP-1001',
      warehouseId: 'wh_main',
      items: [{ productId: prodId, quantityM2: 10, unitCost: 95, boxesCount: 7 }],
      paidAmount: 0,
      paymentType: 'CREDIT',
      isNoNumberSupplier: false,
    });
  }, /مكرر ومسجل بالفعل/);

  // But with isNoNumberSupplier: true, it is allowed
  const invNoNum = purchaseService.createPurchase({
    supplierId: supAId,
    supplierInvoiceNumber: 'INV-SUP-1001',
    warehouseId: 'wh_main',
    items: [{ productId: prodId, quantityM2: 10, unitCost: 95, boxesCount: 7 }],
    paidAmount: 0,
    paymentType: 'CREDIT',
    isNoNumberSupplier: true,
  });
  assert.ok(invNoNum.id);

  // 7. Supplier Claim creation and settlement with Debit Note
  const claim = procurement.createClaim({
    supplierId: supAId,
    grnId: grnResult.grn.id,
    purchaseOrderId: po.id,
    purchaseInvoiceId: inv.id,
    claimType: 'DAMAGE_DEFECT',
    severity: 'MEDIUM',
    claimedAmount: 1900,
    notes: 'مطالبة بـ 15 متر تالف و 5 أمتار عجز',
    items: [{ productId: prodId, defectType: 'كسر أطراف وعجز توريد', quantityM2: 20, unitCost: 95 }],
  });
  assert.ok(claim);
  assert.equal(claim.claimedAmount, 1900);

  const balanceBefore = supplierService.getSupplierById(supAId)!.currentBalance;

  // Settle claim via DEBIT_NOTE for 1900 EGP
  procurement.settleClaim(claim.id, 'DEBIT_NOTE', 1900, 'خصم قيمة التالف والنقص بموجب إشعار مدين');

  const updatedClaim = procurement.getClaimById(claim.id)!;
  assert.equal(updatedClaim.status, 'SETTLED');
  assert.equal(updatedClaim.resolutionType, 'DEBIT_NOTE');

  // Supplier balance should decrease by 1900 EGP
  const balanceAfter = supplierService.getSupplierById(supAId)!.currentBalance;
  assert.equal(balanceAfter, balanceBefore - 1900);

  // 8. Supplier Scorecard and Price History
  const scorecard = procurement.getSupplierScorecard(supAId);
  assert.ok(scorecard);
  assert.equal(scorecard.totalOrders >= 1, true);
  assert.equal(scorecard.totalClaimsCount >= 1, true);
  assert.equal(scorecard.totalDamagedM2, 15);
  assert.ok(scorecard.overallScore > 0);

  const priceHistory = procurement.getProductPriceHistory(prodId);
  assert.ok(priceHistory.length >= 1);
  assert.equal(priceHistory[0].productId, prodId);
  assert.equal(priceHistory[0].unitCost, 95);
});
