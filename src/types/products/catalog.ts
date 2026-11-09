export interface Category {
  id: string;
  name: string;
  parentId?: string | null;
  description?: string;
  createdAt: string;
}

export interface Brand {
  id: string;
  name: string;
  country?: string;
  createdAt: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  branchId?: string;
  location?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface WarehouseStock {
  id: string;
  warehouseId: string;
  warehouseName?: string;
  productId: string;
  productName?: string;
  quantityM2: number; // الرصيد بالمتر المربع
  quantityBoxes: number; // الرصيد بالكراتين (محسوب)
  quantityPieces: number; // الرصيد بالقطع (محسوب)
  reservedM2: number; // الكمية المحجوزة لطلبيات
  availableM2: number; // الكمية المتاحة للبيع
  locationInWarehouse?: string; // موقع الرف أو الباكية (مثل: ركن A - رف 12)
  lastUpdated: string;
}
