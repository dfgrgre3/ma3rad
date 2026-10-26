// Default settings and branch identity shared by database setup and migrations.
export const DEFAULT_SETTINGS: Record<string, string> = {
  showroomName: '',
  tagline: '',
  phone: '',
  phone2: '',
  address: '',
  taxNumber: '',
  commercialRecord: '',
  currency: 'EGP',
  currencySymbol: 'ج.م',
  defaultTaxPercentage: '0',
  isTaxInclusive: '0',
  enableNegativeStock: '0',
  costingMethod: 'FIFO',
  receiptHeader: 'أهلاً بكم ونتشرف بخدمتكم',
  receiptFooter: 'البضاعة المباعة ترد خلال 14 يوماً بالحالة الأصلية ومع الفاتورة\nشكراً لزيارتكم',
  autoBackupIntervalHours: '24',

  // Added alongside the branches / approvals / delivery modules.
  defaultBranchId: 'br_main',
  discountApprovalThresholdPercent: '10',
  requireApprovalForStockAdjustments: '1',
  requireApprovalForPriceChanges: '1',
  lowStockAlertThresholdM2: '20',
  defaultDeliveryFee: '0',
  installmentGraceDays: '3',
  sessionTimeoutMinutes: '480',
  maxFailedLoginAttempts: '5',

  // Branding & appearance — controlled from the Admin Control Center.
  brandName: 'CeramiSys ERP',
  brandShortName: 'C',
  brandLogoDataUrl: '',
  brandPrimaryColor: '#0284c7',
  brandAccentColor: '#4f46e5',
  themeMode: 'light',
  fontFamily: 'Cairo',
  showBrandText: '1',
  sidebarStyle: 'default',
};

// Keys added after the original settings backfill. Migration 012 inserts any
// missing key into databases that were created before it existed.
export const EXTENDED_SETTINGS_KEYS = [
  'brandName', 'brandShortName', 'brandLogoDataUrl', 'brandPrimaryColor',
  'brandAccentColor', 'themeMode', 'fontFamily', 'showBrandText', 'sidebarStyle',
];

export const DEFAULT_BRANCH_ID = 'br_main';

// ─── SQLite introspection helpers ─────────────────────────────────────────────
