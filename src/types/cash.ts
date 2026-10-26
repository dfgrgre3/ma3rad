import type { PaymentType, PaymentStatus } from './sales';

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
  autoClosed?: boolean | number;
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
