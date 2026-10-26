export type CeramicGrade = 'GRADE_1' | 'GRADE_2' | 'GRADE_3' | 'COMMERCIAL';
export type UnitType =
  | 'M2'
  | 'LINEAR_METER'
  | 'METER'
  | 'BOX'
  | 'PIECE'
  | 'PACK'
  | 'KG'
  | 'TON'
  | 'LITER'
  | 'SET'
  | 'SERVICE'
  | 'CUSTOM';

export interface Product {
  productType?: 'CERAMIC' | 'GENERAL';
  customUnit?: string;
  id: string;
  sku: string;
  barcode: string;
  name: string;
  categoryId: string;
  categoryName?: string;
  brandId: string;
  brandName?: string;
  grade: CeramicGrade; // فرز أول، فرز ثاني، فرز ثالث، تجاري
  size: string; // مثال: 60x60, 120x60, 20x120
  thickness?: number; // بالملليمتر
  color?: string;
  tone?: string;
  finish?: string; // لامع، مطفي، باركيه، رخامي
  surfaceLocation?: 'FLOOR' | 'WALL' | 'OUTDOOR' | 'GENERAL'; // أرضيات، حوائط
  
  // قواعد التحويل والوحدات
  baseUnit: UnitType; // M2, PIECE, etc.
  sellUnit: UnitType; // الوحدة الأكثر استخداماً في البيع
  piecesPerBox: number; // عدد القطع في الكرتونة (مثال: 4)
  metersPerBox: number; // مساحة الكرتونة بالمتر المربع (مثال: 1.44)
  weightPerBox?: number; // وزن الكرتونة بالكيلو
  
  // التسعير (مخزن بالسنت أو العملة المباشرة)
  costPrice: number; // تكلفة الشراء للمتر أو للقطعة
  sellingPriceM2: number; // سعر بيع المتر قطاعي
  sellingPriceBox: number; // سعر بيع الكرتونة قطاعي
  wholesalePriceM2: number; // سعر بيع المتر جملة
  minSellingPriceM2: number; // الحد الأدنى المسموح به لسعر المتر
  
  // مستويات المخزون
  minStockLevel: number; // حد الطلب بالمتر
  maxStockLevel?: number;
  
  imagePath?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Aggregated stock columns returned by list queries
  totalStockM2?: number;
  totalStockBoxes?: number;
  totalStockPieces?: number;
}

/** دفعة / تشغيلة سيراميك مع نغمة لون وعيار محددَين */
export interface ProductBatch {
  id: string;
  productId: string;
  warehouseId: string;
  warehouseName?: string;
  batchNumber: string;
  toneShade: string;     // نغمة اللون مثل A12 أو Shade-3
  caliber: string;       // العيار / المعايرة مثل 0 أو 1
  productionDate?: string;
  receivedDate?: string;
  supplierId?: string;
  supplierName?: string;
  costPrice: number;
  quantityM2: number;          // الكمية المستلمة الأصلية
  quantityRemainingM2: number; // الرصيد المتبقي بعد البيع
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

/** تعارض خلط نغمات في فاتورة بيع واحدة */
export interface ToneMixingConflict {
  productId: string;
  productName: string;
  batches: Array<{
    batchNumber: string;
    toneShade: string;
    caliber: string;
    requiredM2: number;
  }>;
}
