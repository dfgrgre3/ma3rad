// Database Domain Types & Interfaces

export type BuiltInUserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'SALES' | 'WAREHOUSE' | 'ACCOUNTANT';
// `(string & {})` preserves autocomplete for the built-ins while allowing
// admin-defined custom roles without a code change.
export type UserRole = BuiltInUserRole | (string & {});

export interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt?: string;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string;
}

export type CeramicGrade = 'GRADE_1' | 'GRADE_2' | 'GRADE_3' | 'COMMERCIAL';
export type UnitType = 'M2' | 'LINEAR_METER' | 'BOX' | 'PIECE' | 'KG' | 'TON' | 'SET' | 'CUSTOM';

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

export type InventoryTransactionType = 
  | 'PURCHASE'
  | 'SALE'
  | 'PURCHASE_RETURN'
  | 'SALES_RETURN'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT_ADD'
  | 'ADJUSTMENT_SUB'
  | 'DAMAGE'
  | 'OPENING_BALANCE'
  | 'STOCK_COUNT';

export interface InventoryTransaction {
  id: string;
  transactionNumber: string;
  type: InventoryTransactionType;
  productId: string;
  productName?: string;
  productSku?: string;
  warehouseId: string;
  warehouseName?: string;
  quantityM2: number; // موجب أو سالب
  boxesCount?: number;
  unitCost: number;
  totalCost: number;
  referenceType?: 'INVOICE' | 'PURCHASE' | 'TRANSFER' | 'ADJUSTMENT' | 'COUNT';
  referenceId?: string;
  notes?: string;
  performedBy: string;
  performedByName?: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  phone2?: string;
  nationalId?: string;
  address?: string;
  city?: string;
  customerType: 'RETAIL' | 'CONTRACTOR' | 'WHOLESALE' | 'ENGINEER';
  creditLimit: number;
  paymentTermsDays?: number;
  currentBalance: number; // مدين (+) أو دائن (-)
  totalPurchases: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  companyName?: string;
  phone: string;
  email?: string;
  taxNumber?: string;
  commercialRecord?: string;
  address?: string;
  isActive?: number;
  currentBalance: number; // مستحق له (+) أو لنا (-)
  totalPurchases: number;
  paymentTermsDays?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentType = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT' | 'MIXED';

export type InvoiceStatus = 'COMPLETED' | 'HOLD' | 'VOID' | 'DRAFT';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate?: string | null;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  warehouseId: string;
  warehouseName?: string;
  shiftId?: string;
  
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  shippingCost: number; // مشال ونقل
  totalAmount: number;
  
  paidAmount: number;
  remainingAmount: number;
  paymentType: PaymentType;
  paymentStatus: PaymentStatus;
  invoiceStatus: InvoiceStatus;
  
  totalCost: number; // إجمالي تكلفة البضاعة
  grossProfit: number; // الربح الإجمالي
  returnedAmount?: number; // إجمالي المرتجعات المرتبطة بالفاتورة
  orderId?: string | null;
  projectId?: string | null;
  
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  
  items?: SalesInvoiceItem[];
}

export interface SalesInvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  productName: string;
  productSku: string;
  productGrade: CeramicGrade;
  size: string;
  
  soldBy: 'M2' | 'BOX' | 'PIECE';
  quantityM2: number; // الكمية الصافية بالمتر
  boxesCount: number; // عدد الكراتين
  piecesCount: number; // عدد القطع
  
  unitPrice: number; // سعر المتر أو القطعة
  originalUnitPrice: number;
  unitCost: number; // تكلفة المتر لحساب الربح
  
  discountAmount: number;
  totalPrice: number;
  totalCost: number;
  profit: number;
  
  metersPerBox: number;
  piecesPerBox: number;
}

export interface SalesReturn {
  id: string;
  returnNumber: string;
  originalInvoiceId: string;
  originalInvoiceNumber: string;
  customerId: string;
  customerName?: string;
  warehouseId: string;
  date: string;
  totalAmount: number;
  refundedAmount: number;
  remainingToBalance: number; // تم إضافته لرصيد العميل
  reason: string;
  refundMethod?: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'BALANCE';
  createdBy: string;
  createdAt: string;
  items?: SalesReturnItem[];
}

export interface SalesReturnItem {
  id: string;
  returnId: string;
  productId: string;
  productName: string;
  grade: CeramicGrade;
  quantityM2: number;
  boxesCount: number;
  unitPrice: number;
  unitCost: number;
  totalRefund: number;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber?: string;
  date: string;
  supplierId: string;
  supplierName?: string;
  warehouseId: string;
  warehouseName?: string;
  
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingCost: number;
  totalAmount: number;
  
  paidAmount: number;
  remainingAmount: number;
  paymentType: PaymentType;
  paymentStatus: PaymentStatus;
  
  notes?: string;
  createdBy: string;
  createdAt: string;
  items?: PurchaseInvoiceItem[];
}

export interface PurchaseInvoiceItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName: string;
  grade: CeramicGrade;
  
  quantityM2: number;
  boxesCount: number;
  unitCost: number;
  totalCost: number;
  
  metersPerBox: number;
  piecesPerBox: number;
}

export interface CashRegister {
  id: string;
  name: string;
  currentBalance: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface CashShift {
  id: string;
  shiftNumber: string;
  registerId: string;
  registerName?: string;
  userId: string;
  userName: string;
  openedAt: string;
  closedAt?: string;
  openingBalance: number;
  
  totalSalesCash: number;
  totalSalesCard: number;
  totalSalesTransfer: number;
  totalCustomerPayments: number;
  totalSupplierPayments: number;
  totalExpenses: number;
  totalRefunds: number;
  
  expectedEndingCash: number;
  actualEndingCash?: number;
  cashDifference?: number; // عجز أو زيادة
  
  status: 'OPEN' | 'CLOSED';
  closingNotes?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
}

export interface Expense {
  id: string;
  category: string;
  categoryId?: string;
  amount: number;
  registerId: string;
  shiftId?: string;
  paymentType: PaymentType;
  date: string;
  recipient?: string;
  description: string;
  performedBy: string;
  performedByName?: string;
  createdAt: string;
}

export interface CustomerPayment {
  id: string;
  receiptNumber: string;
  customerId: string;
  invoiceId?: string | null;
  customerName?: string;
  amount: number;
  paymentType: PaymentType;
  date: string;
  registerId?: string;
  shiftId?: string;
  notes?: string;
  performedBy: string;
  createdAt: string;
}

export interface SupplierPayment {
  id: string;
  receiptNumber: string;
  supplierId: string;
  supplierName?: string;
  amount: number;
  paymentType: PaymentType;
  date: string;
  registerId?: string;
  notes?: string;
  performedBy: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  recordId?: string;
  oldValues?: string;
  newValues?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface SystemSettings {
  showroomName: string;
  tagline?: string;
  phone: string;
  phone2?: string;
  address: string;
  taxNumber?: string;
  commercialRecord?: string;
  currency: string;
  currencySymbol: string;
  defaultTaxPercentage: number;
  isTaxInclusive: boolean;
  enableNegativeStock: boolean;
  costingMethod: 'AVERAGE_COST' | 'FIFO';
  thermalPrinterName?: string;
  /** Printer firmware codepage selected via ESC t n — 54 = Windows-1256 (Arabic) on most ESC/POS devices. */
  thermalCodepage?: number;
  /** Receipt paper width — determines the ESC/POS line width (58mm=32 chars, 80mm=48 chars). */
  thermalPaperWidth?: '58' | '80';
  /** How raw bytes reach the printer: OS spooler (winspool/CUPS) or direct TCP 9100. */
  thermalTransport?: 'system' | 'network';
  /** Network printer host (IP) when thermalTransport is 'network'. */
  thermalHost?: string;
  /** Network printer TCP port; ESC/POS default is 9100. */
  thermalPort?: number;
  a4PrinterName?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  logoPath?: string;
  autoBackupIntervalHours: number;

  // Branding & appearance (admin control center)
  brandName?: string;
  brandShortName?: string;
  brandLogoDataUrl?: string;
  brandPrimaryColor?: string;
  brandAccentColor?: string;
  themeMode?: 'light' | 'dark' | 'system';
  fontFamily?: string;
  showBrandText?: boolean;
  sidebarStyle?: 'default' | 'compact' | 'hidden';

  // Operational settings surfaced in the admin center
  lowStockAlertThresholdM2?: number;
  discountApprovalThresholdPercent?: number;
  requireApprovalForStockAdjustments?: boolean;
  requireApprovalForPriceChanges?: boolean;
  defaultDeliveryFee?: number;
  installmentGraceDays?: number;
  sessionTimeoutMinutes?: number;
  maxFailedLoginAttempts?: number;
  defaultBranchId?: string;
}

// ─── HR / Employees ────────────────────────────────────────────────────────────

export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED';
export type SalaryType = 'MONTHLY' | 'DAILY';
export type PayrollTxType = 'ADVANCE' | 'BONUS' | 'DEDUCTION' | 'SALARY_PAYOUT';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';

export interface Employee {
  id: string;
  name: string;
  location: string;
  role: string;
  phone: string;
  email: string;
  baseSalary: number;
  salaryType: SalaryType;
  status: EmployeeStatus;
  joinedDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollTransaction {
  id: string;
  employeeId: string;
  employeeName?: string;
  type: PayrollTxType;
  amount: number;
  date: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  notes: string;
  recordedBy: string;
  createdAt: string;
}

export interface EmployeeFinancials {
  baseSalary: number;
  advances: number;
  bonuses: number;
  deductions: number;
  payouts: number;
  netDue: number;
}

// ─── ELECTRONIC INVOICING ─────────────────────────────────────────────────────

export type ElectronicInvoiceStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface ElectronicInvoice {
  id: string;
  invoiceNumber: string;
  salesInvoiceId: string;
  customerId: string;
  status: ElectronicInvoiceStatus;
  xmlFilePath?: string | null;
  pdfFilePath?: string | null;
  submissionDate?: string | null;
  acceptedDate?: string | null;
  rejectionReason?: string | null;
  taxAuthorityReference?: string | null;
  totalTax: number;
  totalAmount: number;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateElectronicInvoiceDTO {
  salesInvoiceId: string;
  customerId: string;
}

// ─── LOYALTY PROGRAM ──────────────────────────────────────────────────────────

export type LoyaltyTransactionType = 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUST';

export interface LoyaltyTier {
  id: string;
  name: string;
  minPoints: number;
  discountPercentage: number;
  benefits?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CustomerLoyalty {
  id: string;
  customerId: string;
  currentPoints: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  tierId?: string | null;
  joinedAt: string;
  lastActivityAt: string;
  tierName?: string | null;
}

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  type: LoyaltyTransactionType;
  points: number;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface EarnLoyaltyPointsDTO {
  customerId: string;
  points: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
}

export interface RedeemLoyaltyPointsDTO {
  customerId: string;
  points: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
}

// ─── MULTI-BRANCH ─────────────────────────────────────────────────────────────

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  managerId?: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  managerName?: string | null;
}

export interface BranchWarehouse {
  id: string;
  branchId: string;
  warehouseId: string;
  isPrimary: boolean;
  warehouseName?: string | null;
}

export interface UserBranch {
  userId: string;
  branchId: string;
}

export interface CreateBranchDTO {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  managerId?: string;
  isDefault?: boolean;
}

// ─── ADVANCED ANALYTICS ───────────────────────────────────────────────────────

export interface AnalyticsSnapshot {
  id: string;
  metricName: string;
  metricValue: number;
  dimension?: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface SalesAnalytics {
  period: string;
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
  totalProfit: number;
  topProducts: Array<{ productId: string; productName: string; quantity: number; revenue: number }>;
  topCustomers: Array<{ customerId: string; customerName: string; totalSpent: number; orderCount: number }>;
  salesByDay: Array<{ date: string; amount: number; count: number }>;
}

// ─── NOTIFICATION PREFERENCES ─────────────────────────────────────────────────

export interface NotificationPreference {
  id: string;
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  lowStockAlerts: boolean;
  paymentDueAlerts: boolean;
  systemAlerts: boolean;
}

export interface UpdateNotificationPreferencesDTO {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  lowStockAlerts?: boolean;
  paymentDueAlerts?: boolean;
  systemAlerts?: boolean;
}
