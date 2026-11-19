import { PermissionService } from '../../auth/PermissionService';
import { PricingService } from '../PricingService';
import { basePriceFromUnitPrice } from '../../../../utils/products/uom';
import { round2 } from '../../finance/financials';
import type { CreateSaleDTO } from '../../../../types/sales/serviceTypes';

export function validateProductPricing(sqliteDb: { query: <T = any>(sql: string, params?: any[]) => T[] }, dto: CreateSaleDTO, item: CreateSaleDTO['items'][number], product: any, actor: any, baseUnitPrice: number, quantityM2: number): void {
  if (!Number.isFinite(baseUnitPrice) || baseUnitPrice < 0) throw new Error('سعر بيع الصنف غير صحيح.');
  if (item.pricingSource === 'ORDER') {
    const agreed = dto.orderId && item.orderItemId ? sqliteDb.query<any>(
      `SELECT oi.quantity_m2 AS quantityM2, oi.unit_price / 100.0 AS unitPrice, oi.discount_amount / 100.0 AS discountAmount
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.id = ? AND o.customer_id = ? AND oi.id = ? AND oi.product_id = ?`,
      [dto.orderId, dto.customerId, item.orderItemId, item.productId]
    )[0] : null;
    if (!agreed || round2(Number(agreed.quantityM2)) !== round2(quantityM2)
      || round2(Number(agreed.unitPrice)) !== round2(baseUnitPrice)
      || round2(Number(agreed.discountAmount || 0)) !== round2(Number(item.discountAmount || 0))) {
      throw new Error('سعر الطلب أو كميته لا يطابقان بيانات الطلب المرتبط.');
    }
  } else if (item.pricingSource === 'QUOTATION') {
    const agreed = dto.quotationId && item.quotationItemId ? sqliteDb.query<any>(
      `SELECT qi.quantity_m2 AS quantityM2, qi.unit_price / 100.0 AS unitPrice, qi.discount_amount / 100.0 AS discountAmount
       FROM quotation_items qi JOIN quotations q ON q.id = qi.quotation_id
       WHERE q.id = ? AND q.customer_id = ? AND q.status = 'PENDING' AND qi.id = ? AND qi.product_id = ?`,
      [dto.quotationId, dto.customerId, item.quotationItemId, item.productId]
    )[0] : null;
    if (!agreed || round2(Number(agreed.quantityM2)) !== round2(quantityM2)
      || round2(Number(agreed.unitPrice)) !== round2(baseUnitPrice)
      || round2(Number(agreed.discountAmount || 0)) !== round2(Number(item.discountAmount || 0))) {
      throw new Error('سعر عرض السعر أو كميته لا يطابقان بيانات العرض المرتبط.');
    }
  }
  let approvedPolicyPrice = round2(Number(product.sellingPriceM2));
  if (item.pricingSource === 'POS') {
    const pricing = new PricingService();
    const effective = pricing.getEffectivePrice(item.productId, dto.customerId, quantityM2);
    approvedPolicyPrice = round2(effective.priceM2);
    if (String(item.soldBy).toUpperCase() === 'BOX' && Number(effective.priceBox) > 0) {
      approvedPolicyPrice = round2(basePriceFromUnitPrice(Number(effective.priceBox), 'BOX', product));
    }
  }
  const hasValidatedAgreedPrice = item.pricingSource === 'ORDER' || item.pricingSource === 'QUOTATION';
  if (!hasValidatedAgreedPrice && round2(baseUnitPrice) !== approvedPolicyPrice && !PermissionService.can(actor, 'ui.sales.invoices.approve')) {
    throw new Error(`لا تملك صلاحية تعديل سعر الصنف «${product.name}».`);
  }
  // البيع تحت الحد الأدنى لا يُمنع هنا؛ الفاتورة تُقيَّم ككل في
  // validateBelowCostPricing حيث يُطلب اعتماد PRICE_OVERRIDE عند الحاجة.
}
