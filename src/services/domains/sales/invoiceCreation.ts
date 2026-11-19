import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { SettingsService } from '../config/SettingsService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { localDateString } from '../../../utils/shared/date';
import { applyLoyaltyMovementInTransaction } from './LoyaltyService';
import { WarehouseTypePolicy } from '../operations/WarehouseTypePolicy';
import { CentralUsageLimitService } from '../licensing/CentralUsageLimitService';
import { PartnerService } from '../customers/PartnerService';
import { defaultEffectEngine } from '../effects/EffectEngine';
import type { Effect } from '../../../types/effects';
import '../effects/handlers/salesInvoiceHandlers';
import type { SalesInvoice } from '../../../types';
import type { SalesContext } from './context';
import type { CreateSaleDTO } from '../../../types/sales/serviceTypes';
import { computeSaleTotals, round2 } from '../finance/financials';

import { assertSaleHasItems, validateSaleNumbers } from './invoiceCreation/validation';
import { prepareSaleItems } from './invoiceCreation/itemPreparation';
import { insertInvoiceItems } from './invoiceCreation/itemPersistence';
import { resolvePayments, resolveCashRegister, updateCustomerAndCash } from './invoiceCreation/payments';
import { buildLedgerEntries } from './invoiceCreation/ledger';
import {
  validateDiscountAndCredit,
  validateBelowCostPricing,
  validatePromotionEligibility,
} from './invoiceCreation/approvals';

function getDueDate(today: string, customerId: string, sqliteDb: any, remainingAmount: number): string | null {
  if (remainingAmount <= 0) return null;
  const termsDays = Number((sqliteDb.query(
    'SELECT payment_terms_days AS paymentTermsDays FROM customers WHERE id=?',
    [customerId]
  )[0] as { paymentTermsDays?: number } | undefined)?.paymentTermsDays || 0);
  if (termsDays <= 0) return null;

  const due = new Date(`${today}T00:00:00`);
  due.setDate(due.getDate() + termsDays);
  return localDateString(due);
}

/**
 * Creates a sales invoice inside a single DB transaction. Implementation is
 * split across ./invoiceCreation/* modules grouped by responsibility:
 *  - validation.ts        — DTO shape/number validation
 *  - pricingValidation.ts — per-line price policy checks
 *  - itemPreparation.ts   — stock/FIFO/special-stock line preparation
 *  - itemPersistence.ts   — invoice item + inventory/stock posting
 *  - payments.ts          — tender resolution, cash register & customer balance
 *  - ledger.ts            — journal entry construction
 *  - approvals.ts         — discount/credit/price-override/promotion gates
 */
export function createSalesInvoice(ctx: SalesContext, dto: CreateSaleDTO): SalesInvoice {
  assertSaleHasItems(dto);
  validateSaleNumbers(dto);
  // حارس عدم الاتساق: مجموع أطر الدفع بعد الاستبعاد يجب أن يساوي المدفوع المعلن —
  // يمنع دفتر يومية غير متوازن قبل الدخول في المعاملة برسالة واضحة.
  const tenderPayments = resolvePayments(dto);
  if (dto.payments?.some((payment) => payment.amount <= 0)) {
    throw new Error('يجب أن يكون مبلغ كل وسيلة دفع أكبر من صفر.');
  }
  const tenderSum = round2(tenderPayments.reduce((sum, payment) => sum + payment.amount, 0));
  if (dto.paymentType === 'MIXED' && (!dto.payments || dto.payments.length === 0)) {
    throw new Error('يجب تحديد مكوّنات وسائل الدفع عند اختيار الدفع المختلط.');
  }
  if (tenderPayments.some((payment) => !['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].includes(payment.method))) {
    throw new Error('تحتوي الفاتورة على وسيلة دفع لا تمثل تحصيلاً فعلياً مدعوماً.');
  }
  if (Math.abs(tenderSum - round2(dto.paidAmount || 0)) > 0.01) {
    throw new Error(`المبلغ المدفوع (${round2(dto.paidAmount || 0).toFixed(2)}) لا يساوي مجموع أطر الدفع (${tenderSum.toFixed(2)}).`);
  }
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.sales.invoices.create');
  CentralUsageLimitService.assertWithin('maxInvoices');
  WarehouseTypePolicy.assertSellable(ctx.db, dto.warehouseId, 'البيع');
  const { branchId, cashRegisterId, shiftId } = resolveCashRegister(ctx, dto, actor, tenderPayments);
  const companyId = ctx.db.query<{ companyId: string | null }>(
    `SELECT b.company_id AS companyId FROM branches b WHERE b.id = ?`,
    [branchId]
  )[0]?.companyId ?? null;

  return ctx.db.executeTransaction((sqliteDb) => {
    const sysSettings = SettingsService.getSettings();
    const costingMethod = sysSettings.costingMethod;
    // Tax rate is owned by settings: an omitted rate means "use the configured
    // default". An explicit rate that differs requires an override permission —
    // the backend still recomputes taxAmount from the rate, never from the UI.
    const configuredTaxPercentage = Number(sysSettings.defaultTaxPercentage ?? 0);
    const taxPercentage = dto.taxPercentage ?? configuredTaxPercentage;
    if (Math.abs(taxPercentage - configuredTaxPercentage) > 0.0001) {
      PermissionService.require(actor, 'sales.tax.override');
    }
    const allowNegativeStock = sysSettings.enableNegativeStock === true;
    const trackInventory = ModuleRegistryService.isInventoryTracked();
    const { preparedItems, totalLineDiscount } = prepareSaleItems(sqliteDb, dto, actor, costingMethod, trackInventory, allowNegativeStock);
    const invoiceId = `inv_${uuidv4().substring(0, 8)}`;
    validatePromotionEligibility(sqliteDb, dto, preparedItems);
    const headerDiscount = dto.discountAmount || 0;
    // Compute tax on the backend from taxPercentage and taxable base (subtotal - headerDiscount).
    // Do NOT trust dto.taxAmount from the frontend — it can be manipulated.
    const subtotal = round2(preparedItems.reduce((sum, p) => sum + p.totalPrice, 0));
    const taxableBase = round2(Math.max(0, subtotal - headerDiscount));
    const computedTaxAmount = round2(taxableBase * taxPercentage / 100);
    const totals = computeSaleTotals({
      lines: preparedItems.map((p) => ({
        lineTotal: p.totalPrice,
        lineCost: p.totalCost,
      })),
      discountAmount: headerDiscount,
      taxAmount: computedTaxAmount,
      shippingCost: dto.shippingCost || 0,
      extraFees: dto.extraFees || 0,
      paidAmount: dto.paidAmount,
    });

    // بُعد المبلغ والنطاق: permission_amount_limits على إنشاء الفاتورة
    // تُقيَّم على الإجمالي الفعلي بعد الضريبة/الرسوم، ومخزن/فرع العملية
    // يقيّدانها عبر users_branches + user_warehouse_grants.
    PermissionService.require(actor, 'ui.sales.invoices.create', undefined, {
      branchId,
      warehouseId: dto.warehouseId,
      amount: totals.totalAmount,
      operation: 'ui.sales.invoices.create',
    });

    validateDiscountAndCredit(sqliteDb, dto, actor, totals, totalLineDiscount,
      Number(sysSettings.discountApprovalThresholdPercent ?? 10), invoiceId, branchId);
    validateBelowCostPricing(sqliteDb, dto, actor, preparedItems, invoiceId, branchId);

    // Without inventory tracking there is no inventory asset to relieve, so the
    // invoice-level cost and margin stay at zero. Line costs are still stored so
    // the business can see the direct cost of what it sold.
    const financialTotals = trackInventory
      ? totals
      : { ...totals, totalCost: 0, grossProfit: round2(totals.subtotal - totals.discountAmount) };

    const invoiceNumber = sqliteDb.nextNumber('INV');
    const today = localDateString();

    const payments = resolvePayments(dto);
    const distinctMethods = new Set(payments.map((p) => p.method));
    const storedPaymentType = distinctMethods.size > 1 ? 'MIXED' : (payments[0]?.method || dto.paymentType);
    const dueDate = getDueDate(today, dto.customerId, sqliteDb, totals.remainingAmount);

    let salesRepId: string | null = null;
    if (dto.salesRepId) {
      const rep = sqliteDb.query<{ id: string }>(
        `SELECT id FROM employees WHERE id = ? AND is_active = 1`,
        [dto.salesRepId]
      )[0];
      if (!rep) throw new Error('المندوب المحدد غير موجود أو غير نشط.');
      salesRepId = rep.id;
    } else if (dto.orderId) {
      salesRepId = sqliteDb.query<{ salesRepId: string | null }>(
        `SELECT sales_rep_id AS salesRepId FROM orders WHERE id = ?`,
        [dto.orderId]
      )[0]?.salesRepId ?? null;
    }

    sqliteDb.run(`
      INSERT INTO sales_invoices (
        id, invoice_number, date, due_date, customer_id, warehouse_id, branch_id, company_id, shift_id, order_id, restaurant_order_id, project_id, sales_rep_id,
        subtotal, discount_percentage, discount_amount, tax_percentage, tax_amount,
        shipping_cost, extra_fees, total_amount, paid_amount, remaining_amount, payment_type,
        payment_status, invoice_status, total_cost, gross_profit, returned_amount, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(? * 100), ?, ROUND(? * 100), ?, ROUND(? * 100), ROUND(? * 100), ROUND(? * 100), ROUND(? * 100), ROUND(? * 100), ROUND(? * 100), ?, ?, 'COMPLETED', ROUND(? * 100), ROUND(? * 100), 0, ?, ?)
    `, [
      invoiceId, invoiceNumber, today, dueDate, dto.customerId, dto.warehouseId, branchId, companyId, shiftId || null,
      dto.orderId || null, dto.restaurantOrderId || null, dto.projectId || null, salesRepId,
      totals.subtotal, dto.discountPercentage || 0, totals.discountAmount, taxPercentage, totals.taxAmount,
      totals.shippingCost, totals.extraFees, totals.totalAmount, totals.paidAmount, totals.remainingAmount, storedPaymentType,
      totals.paymentStatus, financialTotals.totalCost, financialTotals.grossProfit, dto.notes || null, actor.id
    ]);

    insertInvoiceItems(sqliteDb, dto, preparedItems, invoiceId, invoiceNumber, actor, costingMethod, allowNegativeStock);
    updateCustomerAndCash(sqliteDb, dto, totals, cashRegisterId, shiftId);

    if (dto.loyaltyRedemption) {
      const { points, discountAmount } = dto.loyaltyRedemption;
      if (!Number.isSafeInteger(points) || points <= 0 || points > 1_000_000_000 || round2(discountAmount) !== points) {
        throw new Error('بيانات استبدال نقاط الولاء غير صحيحة.');
      }
      PermissionService.require(actor, 'ui.loyalty.program.redeem');
      if (sqliteDb.query<{ id: string }>(
        `SELECT id FROM loyalty_transactions WHERE customer_id = ? AND type = 'REDEEM'
         AND reference_type = 'SALES_INVOICE' AND reference_id = ? LIMIT 1`, [dto.customerId, invoiceId]
      ).length) throw new Error('Loyalty points were already redeemed for this invoice.');
      const loyalty = sqliteDb.query<{ currentPoints: number; totalPointsRedeemed: number }>(
        'SELECT current_points AS currentPoints, total_points_redeemed AS totalPointsRedeemed FROM customer_loyalty WHERE customer_id = ?',
        [dto.customerId]
      )[0];
      if (!loyalty || Number(loyalty.currentPoints) < points) throw new Error('رصيد نقاط الولاء غير كافٍ.');
      const now = new Date().toISOString();
      sqliteDb.run(`UPDATE customer_loyalty SET current_points = current_points - ?, total_points_redeemed = total_points_redeemed + ?, last_activity_at = ? WHERE customer_id = ? AND current_points >= ?`, [points, points, now, dto.customerId, points]);
      const updatedLoyalty = sqliteDb.query<{ currentPoints: number }>('SELECT current_points AS currentPoints FROM customer_loyalty WHERE customer_id = ?', [dto.customerId])[0];
      if (!updatedLoyalty || Number(updatedLoyalty.currentPoints) !== Number(loyalty.currentPoints) - points) {
        throw new Error('تعذر خصم نقاط الولاء؛ أُلغيت الفاتورة.');
      }
      sqliteDb.run(`INSERT INTO loyalty_transactions (id, customer_id, type, points, reference_type, reference_id, description, created_by, created_at) VALUES (?, ?, 'REDEEM', ?, 'SALES_INVOICE', ?, ?, ?, ?)`, [`ltx_${uuidv4().substring(0, 8)}`, dto.customerId, -points, invoiceId, `استبدال نقاط مقابل فاتورة ${invoiceNumber}`, actor.id, now]);
    }

    if (PermissionService.can(actor, 'ui.loyalty.program.earn')) {
      const earnedPoints = Math.floor(Number(totals.totalAmount || 0) / 10);
      if (earnedPoints > 0) {
        applyLoyaltyMovementInTransaction(sqliteDb, {
          customerId: dto.customerId,
          points: earnedPoints,
          type: 'EARN',
          referenceType: 'SALES_INVOICE',
          referenceId: invoiceId,
          description: `Points earned from invoice ${invoiceNumber}`,
          actor,
        });
      }
    }

    if (dto.promotionUsage) {
      const { promotionId, couponCode, discountAmount } = dto.promotionUsage;
      const promotion = sqliteDb.query<any>(`SELECT usage_limit AS usageLimit, usage_count AS usageCount, starts_at AS startsAt, ends_at AS endsAt, is_active AS isActive FROM promotions WHERE id = ?`, [promotionId])[0];
      const today = localDateString();
      if (!promotion || !promotion.isActive || promotion.startsAt > today || promotion.endsAt < today
        || (Number(promotion.usageLimit) > 0 && Number(promotion.usageCount) >= Number(promotion.usageLimit))) {
        throw new Error('العرض لم يعد صالحاً أو تجاوز حد الاستخدام؛ أُلغيت الفاتورة.');
      }
      sqliteDb.run('INSERT INTO promotion_usage (id, promotion_id, invoice_id, coupon_code, discount_amount) VALUES (?, ?, ?, ?, ROUND(?*100))', [`pu_${uuidv4().substring(0, 8)}`, promotionId, invoiceId, couponCode || null, discountAmount]);
      sqliteDb.run('UPDATE promotions SET usage_count = usage_count + 1 WHERE id = ? AND (usage_limit IS NULL OR usage_limit = 0 OR usage_count < usage_limit)', [promotionId]);
      const currentUsage = sqliteDb.query<{ usageCount: number }>('SELECT usage_count AS usageCount FROM promotions WHERE id = ?', [promotionId])[0]?.usageCount;
      if (Number(currentUsage) !== Number(promotion.usageCount) + 1) throw new Error('تجاوز العرض حد الاستخدام بالتزامن؛ أُلغيت الفاتورة.');
    }

    // Persist split-payment breakdown (one row per method).
    for (const p of payments) {
      sqliteDb.run(
        `INSERT INTO sales_invoice_payments (id, invoice_id, method, amount, reference, bank_account_id) VALUES (?, ?, ?, ROUND(?*100), ?, ?)`,
        [`sip_${uuidv4().substring(0, 8)}`, invoiceId, p.method, round2(p.amount), p.reference || null, p.bankAccountId || null]
      );
    }

    const inventoryCost = trackInventory
      ? round2(preparedItems.filter((item) => item.tracksStock).reduce((sum, item) => sum + item.totalCost, 0))
      : 0;
    // Any cost not relieved from inventory belongs to stock-free lines (services).
    const serviceCost = trackInventory ? round2(financialTotals.totalCost - inventoryCost) : 0;
    const ledgerLines = buildLedgerEntries(sqliteDb, dto, financialTotals, inventoryCost, Math.max(0, serviceCost));
    const effects: Effect[] = [
      {
        type: 'ledger.post',
        payload: {
          aggregateType: 'sales_invoice',
          aggregateId: invoiceId,
          data: {
            date: today,
            description: `Sale ${invoiceNumber}`,
            referenceType: 'SALES_INVOICE',
            referenceId: invoiceId,
            createdBy: actor.id,
            lines: ledgerLines,
          },
        },
      },
      {
        type: 'audit.log',
        payload: {
          aggregateType: 'sales_invoice',
          aggregateId: invoiceId,
          data: {
            action: 'إنشاء فاتورة مبيعات',
            module: 'SALES',
            recordId: invoiceId,
            newValues: {
              invoiceNumber,
              customerId: dto.customerId,
              warehouseId: dto.warehouseId,
              itemsCount: preparedItems.length,
              totalAmount: totals.totalAmount,
              discountAmount: totals.discountAmount,
              taxAmount: totals.taxAmount,
              shippingCost: totals.shippingCost,
              extraFees: totals.extraFees,
              paidAmount: totals.paidAmount,
              remainingAmount: totals.remainingAmount,
              paymentType: dto.paymentType,
            },
          },
        },
      },
      {
        type: 'sync.capture',
        payload: { aggregateType: 'sales_invoice', aggregateId: invoiceId, data: {} },
      },
    ];
    defaultEffectEngine.run({ db: sqliteDb, actorId: actor.id, actorName: actor.fullName }, effects);
    new PartnerService().allocateSaleProfit(sqliteDb, {
      invoiceId,
      invoiceNumber,
      companyId,
      branchId,
      transactionDate: today,
      profit: financialTotals.grossProfit,
      actorId: actor.id,
    });

    return ctx.getInvoiceById(invoiceId)!;
  }, { immediatePersist: true });
}
