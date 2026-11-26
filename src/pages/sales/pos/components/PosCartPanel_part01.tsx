import type { Customer, Product } from '../../../../types';
import type { CustomerService } from '../../../../services/domains/customers/CustomerService';
import type { CartItem, PosUnit } from '../../../../types/pos';

export interface PosCartPanelProps {
  selectedCustomer: Customer | null;
  customerService: Pick<CustomerService, 'getCustomersPageAsync'>;
  customerSearch: string;
  filteredCustomers: Customer[];
  hasMoreCustomers?: boolean;
  onLoadMoreCustomers?: () => void;
  canCreateCustomer: boolean;
  canSearchTaxNumber?: boolean;
  canViewCustomerFinancials?: boolean;
  onCustomerSearchChange: (value: string) => void;
  onSelectCustomer: (customer: Customer) => void;
  onCreateNewCustomer: () => void;
  cart: CartItem[];
  cartQuantitySummary: string;
  enableNegativeStock: boolean;
  gradeLabel: (grade: Product['grade']) => string;
  onRemove: (index: number) => void;
  onUpdateUnit: (index: number, unit: PosUnit) => void;
  onStepQuantity: (index: number, direction: 1 | -1) => void;
  onUpdateQuantity: (index: number, value: number) => void;
  onUpdatePrice: (index: number, value: number) => void;
  onUpdateLineDiscount: (index: number, value: number) => void;
  /** bulk-edit operations */
  canDiscount?: boolean;
  onBulkLineDiscount?: (indexes: number[], percent: number) => void;
  onRemoveCartLines?: (indexes: number[]) => void;
  /** organized in-invoice product swap */
  onReplaceCartItem?: (index: number, product: Product) => boolean;
  /** cost/margin data per product id — absent entries hide the hint. */
  costInfoByProductId?: Record<string, { unitCost: number; lastPurchaseCost: number | null }>;
  cartProfitSummary?: {
    revenue: number;
    cost: number;
    profit: number;
    marginPercent: number;
    coveredLines: number;
    totalLines: number;
  } | null;
  recentlyRemoved?: any;
  onUndoRemove?: () => void;
  sellingPriceTiersCount?: number;
  sellingPriceTierNames?: string[];
  activeCartIndex?: number | null;
  onSelectCartLine?: (index: number) => void;
  customerSummary?: import('./PosCustomerPicker').CustomerPosSummary | null;
  onClearCustomer?: () => void;
  /** Opens the integrated customer file dialog. */
  onOpenCustomerProfile?: () => void;
  /** Opens the serial/IMEI picker for a cart line (serial-tracked products). */
  onEditSerials?: (index: number) => void;
}
