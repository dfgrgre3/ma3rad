import { round2 } from '../../finance/financials';
import type { CreateSaleDTO } from '../../../../types/sales/serviceTypes';

export function assertSaleHasItems(dto: CreateSaleDTO): void {
  if (!dto.items || dto.items.length === 0) {
    throw new Error('لا يمكن إنشاء فاتورة مبيعات بدون أصناف.');
  }
}

function assertFiniteNonNegative(value: unknown, label: string, required = false): void {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${label} غير صحيح.`);
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} غير صحيح.`);
  }
}

export function validateSaleNumbers(dto: CreateSaleDTO): void {
  assertFiniteNonNegative(dto.paidAmount, 'المبلغ المدفوع', true);
  assertFiniteNonNegative(dto.discountAmount, 'مبلغ الخصم');
  assertFiniteNonNegative(dto.discountPercentage, 'نسبة الخصم');
  assertFiniteNonNegative(dto.taxAmount, 'مبلغ الضريبة');
  assertFiniteNonNegative(dto.taxPercentage, 'نسبة الضريبة');
  assertFiniteNonNegative(dto.shippingCost, 'تكلفة الشحن');
  assertFiniteNonNegative(dto.extraFees, 'المصاريف الإضافية');
  if (Number(dto.discountPercentage || 0) > 100 || Number(dto.taxPercentage || 0) > 100) {
    throw new Error('نسبة الخصم أو الضريبة غير صحيحة.');
  }
  if (!dto.items || !Array.isArray(dto.items)) return;
  for (const [index, item] of dto.items.entries()) {
    const prefix = `بيانات الصنف رقم ${index + 1}`;
    assertFiniteNonNegative(item.quantityM2, `${prefix}: الكمية`, true);
    assertFiniteNonNegative(item.boxesCount, `${prefix}: عدد العبوات`, true);
    assertFiniteNonNegative(item.piecesCount, `${prefix}: عدد القطع`);
    assertFiniteNonNegative(item.unitPrice, `${prefix}: سعر البيع`, true);
    assertFiniteNonNegative(item.unitCost, `${prefix}: التكلفة`);
    assertFiniteNonNegative(item.discountAmount, `${prefix}: الخصم`);
    assertFiniteNonNegative(item.quantity, `${prefix}: الكمية بوحدة البيع`);
  }
  if (dto.payments) {
    if (!Array.isArray(dto.payments)) throw new Error('تفاصيل الدفع غير صحيحة.');
    for (const payment of dto.payments) assertFiniteNonNegative(payment.amount, 'مبلغ إحدى وسائل الدفع', true);
  }
  if (dto.loyaltyRedemption) {
    assertFiniteNonNegative(dto.loyaltyRedemption.discountAmount, 'خصم نقاط الولاء', true);
  }
  if (dto.promotionUsage) {
    assertFiniteNonNegative(dto.promotionUsage.discountAmount, 'خصم العرض الترويجي', true);
  }
  const declaredDiscount = round2(Number(dto.discountAmount || 0));
  const loyaltyDiscount = round2(Number(dto.loyaltyRedemption?.discountAmount || 0));
  const promotionDiscount = round2(Number(dto.promotionUsage?.discountAmount || 0));
  if (loyaltyDiscount + promotionDiscount - declaredDiscount > 0.009) {
    throw new Error('مجموع خصومات الولاء والعروض يتجاوز الخصم المسجل على الفاتورة.');
  }
}
