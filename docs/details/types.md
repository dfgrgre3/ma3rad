# أنواع TypeScript — `src/types/`

كتالوج شامل لتعريفات الأنواع والواجهات والثوابت في مجلد `src/types/`. كل قسم يخص مجلدًا فرعيًا، وكل مدخل يصف ملفًا واحدًا.

---

## فهرس الجذر `src/types/`

### `src/types/index.ts`
- **المحتوى:** نقطة إعادة التصدير المركزية — يعيد تصدير كل أنواع النطاقات الأساسية: `auth/identity`، `products` و`products/catalog`، `inventory/transactions`، `parties`، `sales`، `purchasing`، `treasury/cash`، `hr/workforce`، `customers/customerPrograms`، `organization`، `inventory`، `finance`، `documents`، `projects/apartmentEstimate`، `projects/estimateMeasurement`.

### `src/types/asset-imports.d.ts`
- **المحتوى:** تعريفات ambient لوحدات عامل pdfjs (`pdf.worker.min.mjs?url`) كنص URL سلسلة.

### `src/types/electron.d.ts`
- **المحتوى:** واجهة `Window.ceramisys` الكاملة للـ Electron preload (قاعدة بيانات مشفرة، نسخ احتياطي، مزامنة، طابعات، تراخيص، مستندات، تحديث) + `CentralAppBackupInfo` و`AppUpdateStatus`.

### `src/types/qrcode.d.ts`
- **المحتوى:** تعريف ambient مبسط لوحدة `qrcode` (دالة `toDataURL` فقط).

### `src/types/vite-env.d.ts`
- **المحتوى:** تعريفات `ImportMetaEnv` وثوابت البناء `__BYPASS_FIRST_RUN_ACTIVATION__` و`__CERAMISYS_LEGACY_BUILD__`.

---

## أنظمة الإدارة `admin`

### `src/types/admin/audit.ts`
- **المحتوى:** `AuditFilterState` فلاتر صفحة سجل التدقيق، `getModuleColor` ألوان وحدات التدقيق، `formatJson` تنسيق JSON للعرض.

### `src/types/admin/dataAdmin.ts`
- **المحتوى:** أنواع إدارة البيانات — `TableInfo`/`ColumnInfo` معلومات الجداول والأعمدة، `StorageStats` إحصاءات التخزين، `DataImportConflictPolicy` سياسة تعارض الاستيراد، `DataImportSheet`/`DataImportPreview`/`DataImportResult` معاينة وتنفيذ استيراد البيانات.

---

## المصادقة `auth`

### `src/types/auth/identity.ts`
- **المحتوى:** `BuiltInUserRole`/`UserRole` أدوار المستخدمين المدمجة والمخصصة، `Role` دور النظام، `User` بيانات المستخدم، `Permission` صلاحية النظام.

---

## النسخ الاحتياطي والأمان `backup`

### `src/types/backup/index.ts`
- **المحتوى:** مجمّع يعيد تصدير أنواع `index_part01` (النسخ والأمان) و`index_part02` (السجلات والأمان) بصراحة.

### `src/types/backup/index_part01.ts`
- **المحتوى:** `BackupInfo`/`BackupStats`/`BackupStatus` معلومات وإحصاءات النسخ الاحتياطي، `SecurityConfig` إعدادات التشفير والأمان، `SecurityMetrics` مقاييس الأمان.

### `src/types/backup/index_part02.ts`
- **المحتوى:** `LogEntry` سجل أحداث التدقيق، `ActiveSession`/`LoginRecord` الجلسات ومحاولات الدخول، `SecurityOverview` نظرة عامة على الأمان.

---

## الإعدادات `config`

### `src/types/config/navigation.ts`
- **المحتوى:** `NavItemDef` عنصر تنقل واحد، `NavGroupDef` مجموعة تنقل بأيقونة وصلاحيات.

---

## إدارة العملاء المحتملين `crm`

### `src/types/crm/index.ts`
- **المحتوى:** `LeadStage` مراحل عميل محتمل، `Lead` بيانات العميل المحتمل، `CrmActivity` نشاط متابعة CRM.

---

## العملاء `customers`

### `src/types/customers/customerPrograms.ts`
- **المحتوى:** `ElectronicInvoice`/`ElectronicInvoiceStatus` الفواتير الإلكترونية، `LoyaltyTier`/`CustomerLoyalty`/`LoyaltyTransaction` برنامج الولاء، DTOs لكسب واستبدال النقاط.

---

## لوحات المعلومات `dashboard`

### `src/types/dashboard/components.ts`
- **المحتوى:** `SectionId`/`DashboardSectionConfig`/`SECTIONS_CONFIG` أقسام لوحة التحكم، `CHART_COLORS` ألوان الرسوم، أنواع نقاط البيانات (`SalesTrendPoint`، `TopSellingProduct`، `PaymentDistributionItem`...) و`QuickActionItem`.

### `src/types/dashboard/executive.ts`
- **المحتوى:** `KPI` بطاقة مؤشر تنفيذي، `DailySale`/`TopProduct`/`RecentInvoice`/`DebtCustomer`/`LowStockItem` صفوف المؤشرات، `DateRange` نطاق زمني، `paymentStatusLabel` تسميات حالة الدفع.

### `src/types/dashboard/executiveCommand.ts`
- **المحتوى:** `DrilldownKey`/`DrilldownResult`/`DrilldownColumn`/`DrilldownRow` نتيجة التنقيب في المؤشرات، `CommandPeriod` فترة الأمر، صفوف التحليل (`CashAccountRow`، `ProductSaleRow`، `SlowMovingRow`، `BranchPerformanceRow`...)، `ExecutiveCommandOverview` نظرة مركز القيادة الشاملة، `COMMAND_RANGES` النطاقات الجاهزة.

### `src/types/dashboard/todayPurchases.ts`
- **المحتوى:** `TabKey`/`SortKey`/`SortDir` تبويبات وفرز مشتريات اليوم، `PurchaseFilters` فلاتر الفواتير، `SupplierStat` إحصاءات مورد اليوم، `PurchaseDetailsTarget`/`PurchaseVoidTarget` أهداف عرض وإلغاء.

---

## المستندات والعقود `documents`

### `src/types/documents/index.ts`
- **المحتوى:** مجمّع يعيد تصدير أنواع المستندات (`index_part01`/`index_part02`) والعقود (`index_part02`/`index_part03`).

### `src/types/documents/index_part01.ts`
- **المحتوى:** `DocumentStatus`/`DocumentConfidentiality` حالات وسرية المستند، `EnterpriseDocument` مستند المؤسسة، `EnterpriseDocumentVersion` إصدار المستند، DTOs الإنشاء والتحديث والإصدار.

### `src/types/documents/index_part02.ts`
- **المحتوى:** `DocumentFilters` فلاتر المستندات، `ContractStatus`/`ContractPartyType`/`ContractEffectiveStatus` حالات العقد، `EnterpriseContract` عقد المؤسسة.

### `src/types/documents/index_part03.ts`
- **المحتوى:** `CreateContractDTO`/`UpdateContractDTO` إنشاء وتحديث العقود، `ContractFilters` فلاتر العقود، `DocumentModuleSummary` ملخص وحدة المستندات، `DocumentCompanyOption` خيار شركة.

---

## محرك التأثيرات `effects`

### `src/types/effects/index.ts`
- **المحتوى:** `EffectType` أنواع التأثيرات الجانبية للمحرك، `EffectPayload`/`Effect` حمولة التأثير، `EffectHandler`/`EffectContext` سياق تنفيذ التأثير داخل معاملة.

---

## المالية `finance`

### `src/types/finance/index.ts`
- **المحتوى:** إعادة تصدير `core` (الفترات المالية والمصارف والموازنات) و`banking` (التنبؤ والبوابات).

### `src/types/finance/core.ts`
- **المحتوى:** مجمّع يعيد تصدير أنواع الفترات المالية والحسابات المصرفية والموازنات والتنبؤ النقدي من الأجزاء الثلاثة.

### `src/types/finance/core_part01.ts`
- **المحتوى:** `FiscalPeriodStatus`/`FiscalWorkflowState` حالات السنة والفترة المالية، `FiscalYear`/`FiscalPeriod` الكيانات، `BankAccount` حساب بنكي، `BankReconciliationStatus`/`BankReconciliation` التسوية المصرفية.

### `src/types/finance/core_part02.ts`
- **المحتوى:** `BankReconciliationLine` سطر التسوية، `ExtendedChequeStatus`/`ChequeStatusHistory` حالات وسجل الشيكات، `CostCenter` مركز التكلفة، `BudgetStatus`/`Budget` الموازنة.

### `src/types/finance/core_part03.ts`
- **المحتوى:** `BudgetItem` بند الموازنة بحساباته، `CashForecastItem` عنصر التدفق النقدي المتوقع.

### `src/types/finance/banking.ts`
- **المحتوى:** `CashForecastDaySummary` ملخص يومي للتنبؤ النقدي، `PaymentGateway`/`PaymentGatewaySettlement` بوابات الدفع والتسويات، `Currency` عملة متعددة الأبعاد، `MultiDimensionalReportFilters` فلاتر التقارير متعددة الأبعاد.

---

## الموارد البشرية `hr`

### `src/types/hr/workforce.ts`
- **المحتوى:** `EmployeeStatus`/`SalaryType`/`PayrollTxType`/`AttendanceStatus` حالات الموظف والرواتب والحضور، `Employee`/`PayrollTransaction`/`Attendance` الكيانات، `EmployeeFinancials` ملخص مستحقات الموظف.

### `src/types/hr/employeesPage.ts`
- **المحتوى:** `Employee` نموذج موظف موسّع للصفحة، `FinancialTransaction` معاملة مالية للموظف، `AttendanceRecord` سجل حضور، `PayrollPayable` مستحقات الرواتب، `EmployeeFormState` حالة نموذج الموظف، `STATUS_LABELS`/`TX_TYPES` تسميات الحالة والمعاملات، `EmployeeTab` تبويبات الصفحة.

### `src/types/hr/contract.ts`
- **المحتوى:** `ContractType`/`ContractStatus`/`ContractEffectiveStatus` حالات العقد، `ContractSalaryComponent` مكون راتب، `EmployeeContract` عقد الموظف، DTOs الإنشاء والتحديث والتجديد والإنهاء، `EmployeeFinalSettlement` التسوية النهائية، سجلات تاريخ الراتب والحالة، `ContractFilters`/`ContractSummary` الفلاتر والملخص.

### `src/types/hr/leave.ts`
- **المحتوى:** `LeaveType`/`LeaveStatus` أنواع وحالات الإجازة، `EmployeeLeaveRequest` طلب إجازة، DTOs الإنشاء والفلاتر و`LeaveSummary` ملخص الإجازات.

### `src/types/hr/commission.ts`
- **المحتوى:** `CommissionRow` صف عمولة موظف، `CommissionStats` إحصاءات العمولات.

### `src/types/hr/recruitment.ts`
- **المحتوى:** حالات التوظيف (`RecruitmentJobStatus`، `RecruitmentApprovalStatus`، `RecruitmentCandidateStatus`، `RecruitmentInterviewResult`، `RecruitmentOfferStatus`)، `RecruitmentJob`/`RecruitmentCandidate`/`RecruitmentInterview`/`RecruitmentOffer` الكيانات، DTOs الإنشاء والتقييم والتوظيف، `RecruitmentSummary` الملخص.

### `src/types/hr/document.ts`
- **المحتوى:** أنواع وسرية مستندات الموظف (`HrDocumentType`، `HrDocumentStatus`، `HrDocumentConfidentiality`)، `EmployeeDocument` المستند، `EmployeeDocumentVersion` الإصدار، `EmployeeDocumentAuditEntry` سجل التدقيق، DTOs والفلتر والملخص.

---

## المخزون `inventory`

### `src/types/inventory/index.ts`
- **المحتوى:** مجمّع يعيد تصدير أنواع المخزون الخاص (`index_part01`) والتحويلات والمطابقة (`index_part02`).

### `src/types/inventory/index_part01.ts`
- **المحتوى:** `SpecialStockCategory`/`SpecialStockStatus` فئات وحالات المخزون الخاص، `WarehouseLocation` موقع داخل المخزن، `ProductLocationStock` رصيد منتج في موقع، `SpecialStock` سجل مخزون خاص.

### `src/types/inventory/index_part02.ts`
- **المحتوى:** `TransferStatus` حالات التحويل بين المخازن، `TransferItem` بند التحويل، `ReorderItemPlan` خطة إعادة الطلب، `InventoryReconciliation` مطابقة المخزون.

### `src/types/inventory/transactions.ts`
- **المحتوى:** `InventoryTransactionType` أنواع حركة المخزون، `InventoryTransaction` حركة مخزون واحدة (شراء/بيع/تحويل/تسوية).

### `src/types/inventory/countSessions.ts`
- **المحتوى:** `CountType`/`CountSessionStatus` أنواع وحالات جلسة الجرد، `CountSession` الجلسة، `CountItem` بند الجرد بالانحراف، `WarehouseOption`/`CountProductOption`/`VisibleCountItem` خيارات العرض.

### `src/types/inventory/stockTransfers.ts`
- **المحتوى:** `StockTransferTab` تبويبات التحويلات، `TransferRequestItem`/`ReceiptInput` مدخلات الطلب والاستلام، `WarehouseSummaryRow`/`WarehouseSummaryGroup` ملخص حركة المخازن، وواجهات خصائص المكونات (Props) للجداول والمودالات.

---

## الإشعارات `notifications`

### `src/types/notifications/index.ts`
- **المحتوى:** `NotificationType` كل أنواع الإشعارات النظامية، `Notification` إشعار مستخدم واحد.

---

## المؤسسة `organization`

### `src/types/organization/index.ts`
- **المحتوى:** مجمّع يعيد تصدير أنواع الفروع والشركات والتحليلات وتفضيلات الإشعارات.

### `src/types/organization/index_part01.ts`
- **المحتوى:** `Branch` فرع المؤسسة، `Company` شركة كيان تجاري، `CreateCompanyDTO` إنشاء شركة، `BranchWarehouse` ربط فرع بمخزن.

### `src/types/organization/index_part02.ts`
- **المحتوى:** `UserBranch` ربط مستخدم بفرع، `CreateBranchDTO` إنشاء فرع، `AnalyticsSnapshot`/`SalesAnalytics` تحليلات المبيعات، `NotificationPreference`/`UpdateNotificationPreferencesDTO` تفضيلات الإشعارات.

---

## الأطراف `parties`

### `src/types/parties/index.ts`
- **المحتوى:** `Customer` عميل بأرصدته وحد ائتمانه، `Supplier` مورد برصيد مدين/دائن.

---

## نقطة البيع `pos`

### `src/types/pos/index.ts`
- **المحتوى:** `PosUnit`/`SortMode` وحدة البيع وفرزه، `CartItem` عنصر سلة POS، `HeldOrder` فاتورة معلقة، `Toast`/`InvoicePreview` رسائل وعرض فاتورة، `HELD_STORAGE_KEY` مفتاح التخزين، دوال `round2`/`compareText` مساعدة.

---

## المشتريات المتقدمة `procurement`

### `src/types/procurement/index.ts`
- **المحتوى:** مجمّع يعيد تصدير `part01` (طلبات عروض الموردين والاستلام والمطالبات) و`part02` (المطابقة والتكاليف والموردين).

### `src/types/procurement/part01.ts`
- **المحتوى:** مجمّع للأنواع الثلاثة الفرعية: مقترحات إعادة الطلب، طلبات عروض الأسعار `SupplierRfq*`، عروض الموردين `SupplierQuotation*`، استلام البضائع `GoodsReceipt*`، مطالبات المورد `SupplierClaim*`.

### `src/types/procurement/part01_part01.ts`
- **المحتوى:** `ReorderSuggestion` مقترح إعادة طلب، `SupplierRfqRow`/`SupplierRfqItem` طلب عرض سعر، `SupplierQuotationRow` عرض مورد.

### `src/types/procurement/part01_part02.ts`
- **المحتوى:** `SupplierQuotationItem` بند عرض سعر، `GoodsReceiptRow`/`GoodsReceiptItem` إشعار استلام وفحص البضاعة.

### `src/types/procurement/part01_part03.ts`
- **المحتوى:** `SupplierClaimRow`/`SupplierClaimItem` مطالبة مورد (نقص/تلف/سعر).

### `src/types/procurement/part02.ts`
- **المحتوى:** `ThreeWayMatchingResult` نتيجة مطابقة ثلاثية الفواتير، `LandedCostBreakdownItem` تكلفة الشحن الموزعة، `SupplierScorecard` بطاقة أداء المورد، `ProductPriceHistoryEntry` تاريخ أسعار المنتج.

---

## المنتجات `products`

### `src/types/products/index.ts`
- **المحتوى:** `CeramicGrade`/`UnitType` درجات ووحدات المنتج، `Product` المنتج الكامل بأسعاره ومخزونه، `ProductBatch` دفعة سيراميك بلون وعيار، `ToneMixingConflict` تعارض خلط النغمات.

### `src/types/products/catalog.ts`
- **المحتوى:** `Category`/`Brand` تصنيف وعلامة، `WAREHOUSE_TYPES`/`WarehouseType`/`isWarehouseType`/`WAREHOUSE_TYPE_LABELS` أنواع المخازن، `Warehouse` مخزن، `WarehouseStock` رصيد منتج في مخزن.

### `src/types/products/productDetailPage.ts`
- **المحتوى:** `StockSummary` ملخص مخزون المنتج، `SalesRow`/`PurchaseRow`/`ActivityRow` صفوف المبيعات والمشتريات والنشاط، `ProductEditForm` نموذج تعديل المنتج.

---

## المشاريع والتقديرات `projects`

### `src/types/projects/estimateMeasurement.ts`
- **المحتوى:** `Measure` أنواع القياس في التقدير، `EstimateWall`/`EstimateOpening` جدار وفتحة، `EstimateRoom` غرفة بقياسات وأشكال متعددة، `EstimateLine` بند تكلفة تقدير، `EstimateAttachment` مرفق تقدير.

### `src/types/projects/apartmentEstimate.ts`
- **المحتوى:** `ApartmentEstimate` تقدير شقة كامل، `EstimateVersionStatus`/`ApartmentEstimateVersion` إصدارات التقدير، `ApartmentEstimateQuotationLink` ربط عرض السعر، `SaveApartmentEstimateInput` مدخل الحفظ، `EstimatePayment` دفعة مقدمة.

---

## المشتريات `purchasing`

### `src/types/purchasing/index.ts`
- **المحتوى:** `PurchaseInvoice` فاتورة شراء كاملة، `PurchaseInvoiceItem` بند فاتورة الشراء بالكميات والتكاليف.

### `src/types/purchasing/components.ts`
- **المحتوى:** `PurchaseInvoiceDto` كائن إنشاء فاتورة شراء (بنود وتكاليف شحن/جمارك وتوزيع).

### `src/types/purchasing/supplierDetailPage.ts`
- **المحتوى:** مجمّع يعيد تصدير تبويبات صفحة المورد (`Tab`/`TABS`/`PAY_STATUS_BADGES`/`ORDER_STATUS_BADGES`) وصفوف الفواتير والمدفوعات والطلبات والمرتجعات وكشف الحساب وتاريخ الأسعار.

### `src/types/purchasing/supplierDetailPage_part01.ts`
- **المحتوى:** `Tab`/`TABS` تبويبات صفحة المورد، شارات حالة الدفع والطلبات، `SupplierInvoiceRow`/`SupplierPaymentRow`/`SupplierOrderRow`/`SupplierReturnRow` صفوف الجداول.

### `src/types/purchasing/supplierDetailPage_part02.ts`
- **المحتوى:** `PurchasePriceHistoryRow` تاريخ أسعار الشراء، `SupplierStatementTransaction`/`SupplierStatement` كشف حساب المورد، `EditSupplierFormData`/`RecordPaymentFormData` نماذج التعديل والدفع.

---

## المبيعات `sales`

### `src/types/sales/index.ts`
- **المحتوى:** مجمّع يعيد تصدير أنواع الدفع والحالة والفواتير والمرتجعات من الجزأين.

### `src/types/sales/index_part01.ts`
- **المحتوى:** `PaymentType`/`InvoiceStatus`/`PaymentStatus` حالات الدفع والفاتورة، `SalesInvoice` فاتورة البيع الكاملة (مبالغ، شحن، خصومات، تقسيم دفع، توصيل).

### `src/types/sales/index_part02.ts`
- **المحتوى:** `SalesInvoiceItem` بند فاتورة البيع بالتكلفة والربح، `SalesReturn`/`SalesReturnItem` مرتجع بيع وبنوده مع مصير البضاعة.

### `src/types/sales/ordersPage.ts`
- **المحتوى:** `PAGE_SIZE`/`STATUS_LABELS`/`getOrderStatusLabel`/`getOrderActionLabels` تسميات حالات الطلب حسب النشاط، `fmt` تنسيق العملة، `Line`/`FormState`/`emptyForm` نموذج أمر البيع.

### `src/types/sales/reservation.ts`
- **المحتوى:** `ReservationStatus`/`ReservationReference` حالات وحالات مرجعية الحجز، `StockReservation` حجز مخزون بمرجع وتاريخ انتهاء.

### `src/types/sales/reservationsPage.ts`
- **المحتوى:** `ReservationReferenceType`/`DepositPaymentType`/`ReservationTab` أنواع صفحة الحجوزات، `WarehouseOption`/`ReservationAvailability`/`NewReservationForm`/`ReservationStats`، دوال `createEmptyNewReservationForm`/`computeReservationStats`.

### `src/types/sales/serviceTypes.ts`
- **المحتوى:** مجمّع يعيد تصدير أنواع إنشاء البيع والفواتير والمرتجعات من الجزأين.

### `src/types/sales/serviceTypes_part01.ts`
- **المحتوى:** `CreateSaleDTO` كائن إنشاء عملية بيع كاملة (بنود، مدفوعات مقسمة، ولاء، عروض)، `InvoiceFilters`/`InvoiceStats` فلاتر وإحصاءات الفواتير.

### `src/types/sales/serviceTypes_part02.ts`
- **المحتوى:** `ReturnDisposition` مصير المرتجع، `ReturnableItem` بند قابل للإرجاع، `ReturnStats` إحصاءات المرتجعات، `ReturnRequestItem` بند طلب إرجاع.

---

## مشترك `shared`

### `src/types/shared/pagination.ts`
- **المحتوى:** `PageResult<T>` نتيجة ترقيم صفحات عامة، `normalizePage`/`normalizePageSize` تطبيع أرقام الصفحات.

---

## المزامنة `sync`

### `src/types/sync/index.ts`
- **المحتوى:** `SyncOperation`/`SyncDataScope`/`SyncDeliveryStatus`/`SyncInboxStatus` حالات المزامنة، `SyncEvent` حدث مزامنة، `SyncPushResult`/`SyncPullResult`/`SyncTransport`/`SyncStatus` النقل والحالة، `AccountLink*` ربط الحسابات، `PendingChange*` الموافقات المعلقة، `SyncBranchStatus`/`SyncOverview` حالة الفروع والمزامنة.

---

## الخزينة `treasury`

### `src/types/treasury/cash.ts`
- **المحتوى:** `CashRegister`/`CashShift` صندوق ووردية نقدية بأرصدتها وت totals، `ExpenseCategory`/`Expense` مصروف، `CustomerPayment`/`SupplierPayment` سندات القبض والصرف، `AuditLog` سجل تدقيق، `InvoiceSectionId`/`InvoiceTableColumnId` أقسام وحقول تصميم الفاتورة، `SystemSettings` كل إعدادات النظام (طباعة، علامة تجارية، سياسات المخزون، حدود الكاشير، POS).
