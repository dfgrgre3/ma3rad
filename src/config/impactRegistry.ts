/**
 * System Dependency & Impact Registry (seed — يُبنى عليه في Phase 5).
 *
 * Each core business operation declares the parts of the system that MUST be
 * affected when it happens, with the current implementation status.
 * `missing` effects are known gaps (documented for Phase 5's Dependency &
 * Event Engine), NOT silent regressions.
 *
 * Historical documents are never rewritten by configuration changes; each
 * operation states its `historicalDocs` policy explicitly.
 */

export type ImpactStatus = 'wired' | 'partial' | 'missing';

export interface ImpactTarget {
  /** Stable dotted identifier, e.g. 'inventory.stock', 'cash.register'. */
  target: string;
  status: ImpactStatus;
  /** Required when status === 'missing' or 'partial'. */
  note?: string;
  /** Primary implementation files (best effort, informational). */
  files?: string[];
}

export type HistoricalDocsPolicy = 'unchanged' | 'cascade';

export interface ImpactOperation {
  id: string;
  labelAr: string;
  labelEn: string;
  /** "unchanged" = historical documents keep their values; "cascade" = none currently. */
  historicalDocs: HistoricalDocsPolicy;
  effects: ImpactTarget[];
}

export const IMPACT_REGISTRY: readonly ImpactOperation[] = [
  {
    id: 'product.create',
    labelAr: 'إضافة منتج',
    labelEn: 'Create product',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'inventory.stock', status: 'partial', note: 'لا يُنشأ رصيد مخزني عند الإنشاء — يُنشأ أول رصيد عند أول شراء/حركة', files: ['src/services/products/ProductService.ts'] },
      { target: 'pos.availability', status: 'wired', files: ['src/hooks/pos/usePosCatalog.ts'] },
      { target: 'purchasing.availability', status: 'wired', files: ['src/services/purchases/PurchaseService.ts'] },
      { target: 'pricing.priceLists', status: 'partial', note: 'الربط بقوائم الأسعار يدوي من صفحة التسعير', files: ['src/services/sales/PricingService.ts'] },
      { target: 'reports.catalog', status: 'wired', files: ['src/pages/reports/reports-hub/reportCatalog.ts'] },
      { target: 'barcode.generation', status: 'partial', note: 'توليد/ربط الباركود يدوي؛ لا يتولّد تلقائيًا', files: ['src/pages/products/barcodes-print/BarcodesPrintPage.tsx'] },
    ],
  },
  {
    id: 'product.price.update',
    labelAr: 'تعديل سعر منتج',
    labelEn: 'Update product price',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'pos.currentPrice', status: 'wired', note: 'يُقرأ السعر لحظة البيع', files: ['src/services/sales/PricingService.ts'] },
      { target: 'pricing.priceLists', status: 'partial', note: 'قوائم/عروض التسعير تُحدَّث يدويًا ولا تُزامَن تلقائيًا', files: ['src/services/sales/PricingService.ts'] },
      { target: 'quotes.existing', status: 'wired', note: 'عروض الأسعار القائمة تحتفظ بالأسعار وقت إنشائها (مستند تاريخي)', files: ['src/services/sales/QuotationService.ts'] },
      { target: 'reports.sales', status: 'wired', note: 'تقارير تعتمد سعر البيع وقت الفاتورة', files: ['src/pages/reports/sales/SalesReportsPage.tsx'] },
    ],
  },
  {
    id: 'sales.invoice.create',
    labelAr: 'إصدار فاتورة مبيعات',
    labelEn: 'Create sales invoice',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'inventory.stock', status: 'wired', files: ['src/services/sales/invoiceCreation.ts'] },
      { target: 'inventory.fifo', status: 'wired', files: ['src/services/inventory/InventoryCostingService.ts'] },
      { target: 'inventory.batches', status: 'wired', files: ['src/services/inventory/BatchService.ts'] },
      { target: 'inventory.transaction', status: 'wired', files: ['src/services/sales/invoiceCreation.ts'] },
      { target: 'customer.balance', status: 'wired', files: ['src/services/sales/invoiceCreation.ts'] },
      { target: 'cash.register', status: 'wired', files: ['src/services/sales/invoiceCreation.ts'] },
      { target: 'cash.shiftTotals', status: 'wired', files: ['src/services/sales/invoiceCreation.ts'] },
      { target: 'ledger.journal', status: 'wired', note: 'قيد UNIQUE على (reference_type, reference_id) منذ migration 104', files: ['src/database/repositories/ledger.ts', 'src/database/migrations/index.ts'] },
      { target: 'sync.outbox', status: 'wired', files: ['src/sync/BusinessRecordSyncService.ts'] },
      { target: 'audit.log', status: 'partial', note: 'مساران متوازيان (INSERT داخل المعاملة + AuditService.log صامت بعد COMMIT)', files: ['src/services/sales/invoiceCreation.ts', 'src/services/security/AuditService.ts'] },
    ],
  },
  {
    id: 'sales.return.create',
    labelAr: 'مرتجع مبيعات / استبدال',
    labelEn: 'Create sales return / exchange',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'inventory.stock', status: 'wired', files: ['src/services/sales/returns.ts'] },
      { target: 'inventory.fifo', status: 'wired', files: ['src/services/inventory/InventoryCostingService.ts'] },
      { target: 'inventory.batches', status: 'wired', files: ['src/services/inventory/BatchService.ts'] },
      { target: 'customer.balance', status: 'wired', files: ['src/services/sales/returns.ts'] },
      { target: 'cash.register', status: 'wired', note: 'عبر options.registerId || cr_main — يوصى بحل كاشير البيع الأصلي', files: ['src/services/sales/returns.ts'] },
      { target: 'cash.shiftTotals', status: 'partial', note: 'يُضاف total_refunds لكن لا تُطرح مبيعات الوردية — دلالة صحيحة، تقارير الإقفال تعتمد الفصل', files: ['src/services/sales/returns.ts'] },
      { target: 'ledger.journal', status: 'wired', files: ['src/services/sales/returns.ts'] },
      { target: 'exchange.atomicity', status: 'missing', note: 'exchangeSale = مرتجع (معاملة) ثم فاتورة (معاملة)؛ فشل الثانية يترك مرتجعًا بدون بديل — يحتاج SAVEPOINT ملفوف/تعويض في Phase 5', files: ['src/services/sales/SalesService.ts'] },
      { target: 'ui.idempotency', status: 'wired', note: 'Phase 0: الواجهة تمرر idempotencyKey والخدمة/DB تفرضان unique', files: ['src/pages/sales/returns/ReturnsPage.tsx'] },
    ],
  },
  {
    id: 'sales.invoice.void',
    labelAr: 'إلغاء فاتورة مبيعات',
    labelEn: 'Void sales invoice',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'inventory.stock', status: 'wired', files: ['src/services/sales/invoiceVoid.ts'] },
      { target: 'inventory.fifo', status: 'wired', files: ['src/services/inventory/InventoryCostingService.ts'] },
      { target: 'inventory.batches', status: 'wired', files: ['src/services/inventory/BatchService.ts'] },
      { target: 'customer.balance', status: 'wired', files: ['src/services/sales/invoiceVoid.ts'] },
      { target: 'cash.register', status: 'wired', note: 'Phase 0: العكس على كاشير البيع الأصلي (الوردية ← افتراضي الفرع ← افتراضي عام)', files: ['src/services/sales/invoiceVoid.ts'] },
      { target: 'cash.shiftTotals', status: 'wired', note: 'Phase 0: تُطرح total_sales_cash/card/transfer بحد MAX(0)', files: ['src/services/sales/invoiceVoid.ts'] },
      { target: 'ledger.journal', status: 'wired', files: ['src/services/sales/invoiceVoid.ts', 'src/database/repositories/ledger.ts'] },
    ],
  },
  {
    id: 'purchase.invoice.create',
    labelAr: 'إصدار فاتورة توريد',
    labelEn: 'Create purchase invoice',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'inventory.stock', status: 'wired', files: ['src/services/purchases/PurchaseService.ts'] },
      { target: 'inventory.costing', status: 'wired', note: 'التكلفة المتوسطة المرجحة + طبقة FIFO', files: ['src/services/purchases/PurchaseService.ts', 'src/services/inventory/InventoryCostingService.ts'] },
      { target: 'supplier.balance', status: 'wired', files: ['src/services/purchases/PurchaseService.ts'] },
      { target: 'cash.register', status: 'wired', note: 'للجزء النقدي على كاشير الفرع', files: ['src/services/purchases/PurchaseService.ts'] },
      { target: 'ledger.journal', status: 'wired', files: ['src/services/purchases/PurchaseService.ts'] },
      { target: 'customer.supplyAllocation', status: 'wired', note: 'تخصيص الوارد للطلبيات داخل نفس المعاملة', files: ['src/services/customers/CustomerSupplyService.ts'] },
      { target: 'receipt.numbering', status: 'wired', note: 'Phase 0: nextNumber بدل PAY-<timestamp>', files: ['src/services/purchases/PurchaseService.ts'] },
    ],
  },
  {
    id: 'purchase.return.create',
    labelAr: 'مرتجع مشتريات',
    labelEn: 'Create purchase return',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'inventory.stock', status: 'wired', files: ['src/services/purchases/PurchaseReturnService.ts'] },
      { target: 'inventory.fifo', status: 'wired', files: ['src/services/purchases/PurchaseReturnService.ts'] },
      { target: 'supplier.balance', status: 'wired', files: ['src/services/purchases/PurchaseReturnService.ts'] },
      { target: 'cash.register', status: 'wired', note: 'يُضاف للدرج النقدي عند استرداد نقدي (is_default = 1 — يُوحّد لاحقًا لحل كاشير الفرع)', files: ['src/services/purchases/PurchaseReturnService.ts'] },
      { target: 'ledger.journal', status: 'wired', files: ['src/services/purchases/PurchaseReturnService.ts'] },
      { target: 'ui.idempotency', status: 'wired', note: 'Phase 0', files: ['src/pages/purchasing/purchase-returns/PurchaseReturnsPage.tsx'] },
    ],
  },
  {
    id: 'customer.payment.create',
    labelAr: 'تحصيل من عميل',
    labelEn: 'Collect from customer',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'customer.balance', status: 'wired', files: ['src/services/sales/payments.ts', 'src/services/customers/CustomerService.ts'] },
      { target: 'sales.invoices.paidStatus', status: 'wired', files: ['src/services/sales/payments.ts'] },
      { target: 'cash.register', status: 'wired', files: ['src/services/sales/payments.ts'] },
      { target: 'cash.shiftTotals', status: 'wired', files: ['src/services/sales/payments.ts'] },
      { target: 'ledger.journal', status: 'wired', note: 'unique (reference_type, reference_id) منذ 104؛ customer_payments.idempotency_key منذ 110', files: ['src/database/repositories/ledger.ts'] },
      { target: 'installments.plan', status: 'wired', files: ['src/services/finance/InstallmentService.ts'] },
      { target: 'ui.idempotency', status: 'wired', note: 'Phase 0', files: ['src/components/daily/PaymentModals.tsx', 'src/pages/finance/debts-dashboard/DebtsDashboardPage.tsx'] },
    ],
  },
  {
    id: 'supplier.payment.create',
    labelAr: 'سداد مورد',
    labelEn: 'Pay supplier',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'supplier.balance', status: 'wired', files: ['src/services/suppliers/SupplierService.ts', 'src/services/purchases/PurchaseService.ts'] },
      { target: 'purchase.invoices.paidStatus', status: 'wired', files: ['src/services/purchases/PurchaseService.ts', 'src/services/suppliers/SupplierService.ts'] },
      { target: 'cash.register', status: 'wired', files: ['src/services/suppliers/SupplierService.ts'] },
      { target: 'ledger.journal', status: 'wired', files: ['src/database/repositories/ledger.ts'] },
      { target: 'ui.idempotency', status: 'wired', note: 'Phase 0', files: ['src/components/suppliers/SuppliersView.tsx', 'src/components/daily/PaymentModals.tsx'] },
    ],
  },
  {
    id: 'expense.create',
    labelAr: 'تسجيل مصروف',
    labelEn: 'Record expense',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'cash.register', status: 'wired', files: ['src/services/finance/CashierService.ts'] },
      { target: 'cash.shiftTotals', status: 'wired', files: ['src/services/finance/CashierService.ts'] },
      { target: 'ledger.journal', status: 'wired', files: ['src/services/finance/CashierService.ts'] },
      { target: 'pnl.statement', status: 'wired', note: 'عبر القيد المزدوج', files: ['src/database/repositories/ledger.ts'] },
      { target: 'sync.outbox', status: 'missing', note: 'المصروف غير ضمن كيانات المزامنة', files: ['src/services/finance/CashierService.ts'] },
    ],
  },
  {
    id: 'inventory.transfer',
    labelAr: 'تحويل مخزني',
    labelEn: 'Stock transfer',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'inventory.stockSource', status: 'wired', note: 'عند dispatch', files: ['src/services/inventory/InventoryServicePart08.ts'] },
      { target: 'inventory.stockDestination', status: 'wired', note: 'عند receive (أو INSERT صف جديد)', files: ['src/services/inventory/InventoryServicePart10.ts'] },
      { target: 'inventory.transaction', status: 'wired', files: ['src/services/inventory/InventoryServicePart09.ts', 'src/services/inventory/InventoryServicePart10.ts'] },
      { target: 'ledger.transferLoss', status: 'partial', note: 'قيد TRANSFER_LOSS مالي (5201/1104) لكن بلا حركة inventory_transactions للكمية المفقودة ⇒ تفاوت دفتري', files: ['src/services/inventory/InventoryServicePart10.ts'] },
      { target: 'workflow.compensation', status: 'missing', note: 'خطوات REQUESTED→…→RECEIVED معاملات مستقلة؛ لا تعويض/saga عند التراجع بعد الشحن', files: ['src/services/inventory/InventoryServicePart08.ts'] },
    ],
  },
  {
    id: 'user.permission.update',
    labelAr: 'تغيير صلاحية مستخدم',
    labelEn: 'Update user permission',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'ui.navigation', status: 'wired', files: ['src/services/config/NavigationService.ts'] },
      { target: 'ui.routeGuard', status: 'partial', note: 'بنيويًا يعمل لكن OPEN_ALL_PAGES=true يلغيه في وضع التطوير', files: ['src/router/RouteGuard.tsx'] },
      { target: 'services.authorization', status: 'wired', note: 'PermissionService.require في كل خدمة', files: ['src/services/auth/PermissionService.ts'] },
      { target: 'electron.ipcGuard', status: 'wired', files: ['electron/security/ipcGuard.js'] },
    ],
  },
  {
    id: 'accounting.taxSetting.update',
    labelAr: 'تغيير إعداد ضريبي / محاسبي',
    labelEn: 'Update tax / accounting setting',
    historicalDocs: 'unchanged',
    effects: [
      { target: 'sales.invoice.new', status: 'wired', note: 'يُطبَّق على الفواتير الجديدة فقط', files: ['src/services/sales/invoiceCreation.ts'] },
      { target: 'purchase.invoice.new', status: 'wired', files: ['src/services/purchases/PurchaseService.ts'] },
      { target: 'documents.historical', status: 'wired', note: 'لا تُعاد كتابتها أبدًا', files: [] },
      { target: 'reports.tax', status: 'partial', note: 'تُحسب من مستندات المستودع مباشرة؛ راجع reports scoping في Phase 3 من التدقيق السابق', files: ['src/pages/reports/tax-report/TaxReportPage.tsx'] },
      { target: 'periods.closed', status: 'wired', note: 'postLedgerEntry يرفض الترحيل داخل فترة مغلقة', files: ['src/database/repositories/ledger.ts'] },
    ],
  },
] as const;

export const IMPACT_OPERATION_IDS: readonly string[] = IMPACT_REGISTRY.map((op) => op.id);
