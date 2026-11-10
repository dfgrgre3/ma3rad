import type { Product } from '../../types';
import type { OperationalFieldDefinition } from '../../services/domains/products/OperationalFieldService';

export interface ProductsCardsProps {
  products: Product[];
  operationalFields?: OperationalFieldDefinition[];
  operationalFieldValues?: Record<string, Record<string, string>>;
  selectedProductIds: string[];
  canViewCosts: boolean;
  canViewPricing: boolean;
  canExportProducts: boolean;
  canDeleteProduct: boolean;
  canUpdateProduct: boolean;
  canCreateProduct: boolean;
  canAdjustInventory: boolean;
  stockOf: (product: Product) => { m2: number; boxes: number; pieces: number };
  stockTone: (product: Product) => string;
  onToggleProductSelection: (id: string) => void;
  onOpenDetails: (product: Product) => void;
  onOpenStock: (product: Product) => void;
  onOpenEdit: (product: Product) => void;
  onDuplicate: (product: Product) => void;
  onToggleActive: (product: Product) => void;
  onDelete: (id: string) => void;
}
