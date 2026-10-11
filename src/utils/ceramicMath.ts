// Ceramic & Finishing Materials Math & Unit Conversion Helper

export class CeramicMath {
  /**
   * حساب عدد الكراتين اللازمة لمساحة محددة بالمتر المربع
   * @param meters المطلوب بالمتر المربع
   * @param metersPerBox مساحة الكرتونة بالمتر
   * @param allowFraction هل يُسمح بكسور الكراتين أم تقريب لأقرب كرتونة كاملة
   */
  static calculateBoxes(meters: number, metersPerBox: number, allowFraction = false): number {
    if (!meters || !metersPerBox || metersPerBox <= 0) return 0;
    const boxes = meters / metersPerBox;
    if (allowFraction) {
      return Number(boxes.toFixed(2));
    }
    return Math.ceil(boxes);
  }

  /**
   * حساب المساحة الإجمالية بالمتر من عدد الكراتين
   */
  static calculateMetersFromBoxes(boxes: number, metersPerBox: number): number {
    if (!boxes || !metersPerBox) return 0;
    return Number((boxes * metersPerBox).toFixed(3));
  }

  /**
   * حساب عدد القطع الإجمالي
   */
  static calculatePiecesFromBoxes(boxes: number, piecesPerBox: number): number {
    if (!boxes || !piecesPerBox) return 0;
    return Math.round(boxes * piecesPerBox);
  }

  /**
   * حساب سعر الكرتونة من سعر المتر
   */
  static calculateBoxPrice(pricePerMeter: number, metersPerBox: number): number {
    return Number((pricePerMeter * metersPerBox).toFixed(2));
  }

  /**
   * حساب سعر المتر من سعر الكرتونة
   */
  static calculateMeterPrice(pricePerBox: number, metersPerBox: number): number {
    if (!metersPerBox || metersPerBox <= 0) return 0;
    return Number((pricePerBox / metersPerBox).toFixed(2));
  }

  /**
   * حساب السعر الإجمالي مع الخصم والضريبة بدقة غير قابلة للخطأ
   */
  static calculateLineTotal(
    quantityM2: number,
    unitPriceM2: number,
    discountAmount = 0
  ): {
    subtotal: number;
    discount: number;
    total: number;
  } {
    const subtotal = Number((quantityM2 * unitPriceM2).toFixed(2));
    const total = Math.max(0, Number((subtotal - discountAmount).toFixed(2)));
    return {
      subtotal,
      discount: discountAmount,
      total,
    };
  }

  /**
   * تنسيق العملة الموحد
   */
  static formatCurrency(amount: number, symbol = 'ج.م'): string {
    const formatted = (amount || 0).toLocaleString('ar-EG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${formatted} ${symbol}`;
  }

  /**
   * تنسيق الكمية بالمتر المربع
   */
  static formatM2(meters: number): string {
    return `${(meters || 0).toFixed(2)} م²`;
  }
}
