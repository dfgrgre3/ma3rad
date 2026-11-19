import { PermissionService } from '../../auth/PermissionService';
import { AppConfigService } from '../../config/AppConfigService';
import { OperationApprovalGate } from '../../approvals/OperationApprovalGate';
import { evaluateManualDiscountPolicy } from '../discountPolicy';
import { PricingService } from '../PricingService';
import { computeSaleTotals, round2 } from '../../finance/financials';
import type { CreateSaleDTO } from '../../../../types/sales/serviceTypes';
import type { DiscountApprovalRow, PreparedSaleItem } from './types';

/**
 * A manual discount above the policy threshold must be backed by an approved
 * DISCOUNT request. Requests that are already approved by a manager are
 * reusable, but each one can authorise exactly one invoice: consuming it
 * rewrites its reference to the invoice, so a retry cannot silently create a
 * second request or reuse the same authorisation.
 */
function resolveDiscountApproval(
  sqliteDb: any,
  dto: CreateSaleDTO,
  actor: any,
  approvalDiscount: number,
  branchId: string,
  invoiceId: string
): void {
  const candidates = (dto.discountApprovalId
    ? sqliteDb.query(
        `SELECT id, branch_id AS branchId, requested_value AS requestedValue, requested_by AS requestedBy
         FROM approval_requests
         WHERE id = ? AND request_type = 'DISCOUNT' AND status = 'APPROVED'
           AND (reference_type IS NULL OR reference_type IN ('POS', 'MANUAL'))
           AND (reference_id IS NULL OR reference_id = ?)`,
        [dto.discountApprovalId, dto.customerId]
      )
    : sqliteDb.query(
        `SELECT id, branch_id AS branchId, requested_value AS requestedValue, requested_by AS requestedBy
         FROM approval_requests
         WHERE request_type = 'DISCOUNT' AND status = 'APPROVED'
           AND requested_by = ?
           AND ABS(COALESCE(requested_value, 0) - ?) <= 0.01
           AND (reference_type IS NULL OR reference_type IN ('POS', 'MANUAL'))
           AND (reference_id IS NULL OR reference_id = ?)
         ORDER BY decided_at DESC, created_at DESC LIMIT 1`,
        [actor.id, approvalDiscount, dto.customerId]
      )) as DiscountApprovalRow[];
  const approval = candidates[0];
  if (!approval) {
    throw new Error('الخصم يتجاوز الحد المسموح ولا يوجد اعتماد خصم ساري لهذه الفاتورة. اطلب اعتماد المسؤول ثم أعد المحاولة.');
  }
  if (approval.requestedBy !== actor.id) {
    throw new Error('طلب اعتماد الخصم لا يخص المستخدم الحالي.');
  }
  if (approval.branchId && approval.branchId !== branchId) {
    throw new Error('طلب اعتماد الخصم يخص فرعاً آخر غير فرع الفاتورة.');
  }
  if (Math.abs(Number(approval.requestedValue || 0) - approvalDiscount) > 0.01) {
    throw new Error('قيمة الاعتماد لا تطابق قيمة الخصم المطلوبة على هذه الفاتورة.');
  }
  sqliteDb.run(
    `UPDATE approval_requests SET reference_type = 'SALES_INVOICE', reference_id = ?
     WHERE id = ? AND request_type = 'DISCOUNT' AND status = 'APPROVED'
       AND (reference_type IS NULL OR reference_type IN ('POS', 'MANUAL'))`,
    [invoiceId, approval.id]
  );
  if ((sqliteDb.getDatabase() as any).getRowsModified() !== 1) {
    throw new Error('تم استهلاك اعتماد الخصم من عملية بيع أخرى؛ اطلب اعتماداً جديداً.');
  }
}

export function validateDiscountAndCredit(
  sqliteDb: any,
  dto: CreateSaleDTO,
  actor: any,
  totals: ReturnType<typeof computeSaleTotals>,
  totalLineDiscount: number,
  discountApprovalThresholdPercent: number,
  invoiceId: string,
  branchId: string
): void {
  const headerDiscount = dto.discountAmount || 0;
  if (!Number.isFinite(headerDiscount) || headerDiscount < 0) throw new Error('مبلغ الخصم غير صحيح.');
  if (headerDiscount > totals.subtotal) {
    throw new Error('إجمالي الخصم يتجاوز صافي قيمة الأصناف في الفاتورة.');
  }
  const promotionDiscount = round2(Number(dto.promotionUsage?.discountAmount || 0));
  const loyaltyDiscount = round2(Number(dto.loyaltyRedemption?.discountAmount || 0));
  const manualHeaderDiscount = round2(Math.max(0, headerDiscount - promotionDiscount - loyaltyDiscount));
  const approvalDiscount = round2(totalLineDiscount + manualHeaderDiscount);
  if (totalLineDiscount + headerDiscount > 0) {
    PermissionService.require(actor, 'ui.sales.invoices.discount');
    const threshold = AppConfigService.getPolicyNumber('sales.discountApprovalThreshold', discountApprovalThresholdPercent);
    // same gross-subtotal basis the POS and quick-sale screens use, so one
    // policy decision holds from cart validation through invoice posting.
    const policy = evaluateManualDiscountPolicy({
      grossSubtotal: round2(Number(totals.subtotal || 0) + totalLineDiscount),
      totalDiscount: approvalDiscount,
      thresholdPercent: threshold,
    });
    if (policy.requiresApproval && !PermissionService.can(actor, 'ui.sales.invoices.approve')) {
      resolveDiscountApproval(sqliteDb, dto, actor, approvalDiscount, branchId, invoiceId);
    }
  }

  if (totals.remainingAmount > 0 && !PermissionService.can(actor, 'ui.sales.invoices.credit')) {
    throw new Error('لا تملك صلاحية البيع الآجل أو تسجيل مبلغ متبقٍ على العميل.');
  }

  if (totals.remainingAmount <= 0) return;

  const customer = sqliteDb.query(
    `SELECT name, credit_limit / 100.0 AS credit_limit, current_balance / 100.0 AS current_balance FROM customers WHERE id = ?`,
    [dto.customerId]
  )[0] as { name: string; creditLimit?: number; currentBalance?: number } | undefined;
  if (!customer) throw new Error('العميل المحدد غير موجود.');
  const limit = Number(customer.creditLimit || 0);
  const projected = round2(Number(customer.currentBalance || 0) + totals.remainingAmount);
  if (limit > 0 && projected > limit && !PermissionService.can(actor, 'ui.sales.invoices.approve')) {
    throw new Error(
      `تجاوز حد الائتمان للعميل "${customer.name}". الرصيد الحالي ${customer.currentBalance} + الآجل ${totals.remainingAmount} يتجاوز الحد ${limit}.`
    );
  }
}

/**
 * البيع تحت الحد الأدنى (min_selling_price_m2) أو تحت التكلفة يتطلب اعتماد
 * PRICE_OVERRIDE. من يملك صلاحية ui.sales.invoices.approve يتجاوز مباشرة،
 * وغيره يحتاج طلب اعتماد معتمد يُستهلك عند إصدار الفاتورة (مثل الخصم).
 */
export function validateBelowCostPricing(
  sqliteDb: any,
  dto: CreateSaleDTO,
  actor: any,
  preparedItems: PreparedSaleItem[],
  invoiceId: string,
  branchId: string
): void {
  if (PermissionService.can(actor, 'ui.sales.invoices.approve')) return;

  // مبيعات المخزون المخفض (special stock) لها سعر معتمد مسبقاً — تُستثنى.
  const regularItems = preparedItems.filter((item) => !item.specialStockId);
  const costShortfall = round2(regularItems.reduce(
    (sum, item) => sum + Math.max(0, round2(Number(item.totalCost || 0) - Number(item.totalPrice || 0))),
    0
  ));

  const minPriceByProduct = new Map<string, number>();
  let minShortfall = 0;
  for (const item of regularItems) {
    if (!minPriceByProduct.has(item.productId)) {
      const row = sqliteDb.query(
        `SELECT min_selling_price_m2 / 100.0 AS minPrice FROM products WHERE id = ?`, [item.productId]
      )[0];
      minPriceByProduct.set(item.productId, Number(row?.minPrice) || 0);
    }
    const minPrice = minPriceByProduct.get(item.productId) || 0;
    if (minPrice > 0 && Number(item.unitPrice) < minPrice) {
      minShortfall = round2(minShortfall + (minPrice - Number(item.unitPrice)) * Number(item.quantityM2 || 0));
    }
  }

  const shortfall = round2(costShortfall + minShortfall);
  if (shortfall <= 0) return;

  const gate = new OperationApprovalGate(sqliteDb);
  const { policy, required: policyRequired } = gate.evaluate('sales.price.override', shortfall);
  const required = minShortfall > 0 || policyRequired;
  if (!required) return;

  const approval = (sqliteDb.query(
    `SELECT id FROM approval_requests
     WHERE request_type = 'PRICE_OVERRIDE' AND status = 'APPROVED'
       AND requested_by = ?
       AND ABS(COALESCE(requested_value, 0) - ?) <= 0.01
       AND (reference_type IS NULL OR reference_type IN ('POS', 'MANUAL'))
       AND (reference_id IS NULL OR reference_id = ?)
     ORDER BY decided_at DESC, created_at DESC LIMIT 1`,
    [actor.id, shortfall, dto.customerId]
  ) as { id: string }[])[0];
  if (approval) {
    sqliteDb.run(
      `UPDATE approval_requests SET reference_type = 'SALES_INVOICE', reference_id = ?
       WHERE id = ? AND request_type = 'PRICE_OVERRIDE' AND status = 'APPROVED'
         AND (reference_type IS NULL OR reference_type IN ('POS', 'MANUAL'))`,
      [invoiceId, approval.id]
    );
    if ((sqliteDb.getDatabase() as any).getRowsModified() !== 1) {
      throw new Error('تم استهلاك اعتماد تجاوز الحد الأدنى من عملية بيع أخرى؛ اطلب اعتماداً جديداً.');
    }
    return;
  }

  const approvalId = gate.requestApproval({
    operationCode: 'sales.price.override',
    requestType: 'PRICE_OVERRIDE',
    title: `بيع تحت الحد الأدنى/التكلفة — عجز ${shortfall} ج`,
    description: `إجمالي فارق السعر عن الحد الأدنى أو التكلفة في الفاتورة: ${shortfall} ج`,
    branchId,
    requestedValue: shortfall,
    details: { customerId: dto.customerId, shortfall, costShortfall, minShortfall, dedupeKey: `pricex:${dto.customerId ?? ''}:${shortfall}`, policy },
  }, sqliteDb);
  gate.throwRequested(approvalId);
}

export function validatePromotionEligibility(
  sqliteDb: any,
  dto: CreateSaleDTO,
  preparedItems: PreparedSaleItem[],
): void {
  if (!dto.promotionUsage) return;
  const cart = preparedItems.map((item) => {
    const product = sqliteDb.query(
      'SELECT category_id AS categoryId, brand_id AS brandId FROM products WHERE id = ?', [item.productId]
    )[0] as { categoryId: string | null; brandId: string | null } | undefined;
    const quantity = Number(item.quantityM2);
    const unitPrice = Number(item.unitPrice);
    return {
      productId: item.productId,
      categoryId: product?.categoryId,
      brandId: product?.brandId,
      qty: quantity,
      unitPrice,
      amount: round2(quantity * unitPrice),
    };
  });
  const evaluated = new PricingService().evaluatePromotions(
    cart,
    dto.promotionUsage.couponCode,
    dto.promotionUsage.promotionId,
  );
  if (!evaluated || evaluated.promotionId !== dto.promotionUsage.promotionId
    || round2(evaluated.discountAmount) !== round2(dto.promotionUsage.discountAmount)) {
    throw new Error('العرض الترويجي غير مؤهل لهذه الفاتورة أو قيمة الخصم لا تطابق شروط العرض.');
  }
}
