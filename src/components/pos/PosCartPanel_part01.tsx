import type { Customer, Product } from '../../types';
import type { CustomerService } from '../../services/customers/CustomerService';
import { PosCustomerPicker } from './PosCustomerPicker';
import type { CartItem, PosUnit } from '../../types/pos';

export interface PosCartPanelProps {
  selectedCustomer: Customer | null;
  customerService: Pick<CustomerService, 'getCustomersPage'>;
  customerSearch: string;
  filteredCustomers: Customer[];
  canCreateCustomer: boolean;
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
  recentlyRemoved?: any;
  onUndoRemove?: () => void;
  sellingPriceTiersCount?: number;
  sellingPriceTierNames?: string[];
  activeCartIndex?: number | null;
  onSelectCartLine?: (index: number) => void;
  customerSummary?: import('./PosCustomerPicker').CustomerPosSummary | null;
  onClearCustomer?: () => void;
}
