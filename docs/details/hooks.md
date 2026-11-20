# توثيق الـ Custom Hooks

توثيق شامل لجميع الـ hooks الموجودة تحت `src/hooks/` في تطبيق ERP المبني بـ React و TypeScript. كل قسم يوضح الغرض، التوقيع، وما يرجعه الـ hook أو الدالة، بالإضافة إلى الخدمات والمخازن التي يعتمد عليها.

## الجذر

### `src/hooks/usePlatformFeature.ts`
- **الغرض:** فحص feature flags الخاصة بالمنصة وإظهار/إخفاء الميزات أو رفضها برمجيًا.
- **التوقيع:** `usePlatformFeature(code: string): boolean` — يتحقق من العلم، تفعيله، ونسبة الـ rollout حسب هوية المستخدم؛ `assertPlatformFeature(code: string, context?: { tenantId?: string; userId?: string }): void` — يرمي خطأً عند تعطيل الميزة أو استثناء tenant أو إخفاق الـ rollout؛ `usePlatformModule(code: string): boolean` — يتحقق من تفعيل module code.
- **يعتمد على:** `PlatformAdminService`.

## `domains/admin`

### `src/hooks/domains/admin/useAuditLogs.ts`
- **الغرض:** إدارة صفحة سجل المراجعة مع إحصاءات، فلترة، بحث مؤجل، وترقيم صفحات.
- **التوقيع:** `useAuditLogs()` بدون معاملات؛ يرجع `logs`، `stats`، `modules`، `total`، `page`، `totalPages`، فلاتر `selectedModule` و`selectedSource` و`search` و`dateFrom` و`dateTo`، حالة التحميل والأخطاء، `expandedLog`، وأفعال `setPage` و`setSelectedModule` و`setSelectedSource` و`setSearch` و`setDateFrom` و`setDateTo` و`toggleExpand` و`refresh`.
- **يعتمد على:** `AuditService` ونوعَي `AuditTimelineEntry` و`AuditTimelineStats`.

## `domains/auth`

### `src/hooks/domains/auth/useAppSession.ts`
- **الغرض:** إدارة مهام الجلسة أثناء تسجيل الدخول: سياق الإعدادات، انتهاء الجلسة بالخمول، إغلاق الورديات المجدولة، heartbeat، والتنبيهات المجدولة.
- **التوقيع:** `useAppSession(dbReady: boolean, currentUser: User | null, onSessionExpired: () => void): void` — لا يرجع قيمة؛ يدير effects فقط.
- **يعتمد على:** `AuthService`، `SettingsService`، `BusinessTypeService`، `AppConfigService`، `NotificationService`، و`CashierService` بشكل lazy.

### `src/hooks/domains/auth/useAppStartup.ts`
- **الغرض:** تهيئة قاعدة البيانات، استعادة الجلسة، تشغيل Web Worker، جدولة النسخ الاحتياطي والصيانة، مزامنة الفروع، إغلاق الورديات المنتهية، وفلش قاعدة البيانات عند الخروج.
- **التوقيع:** `useAppStartup()` بدون معاملات؛ يرجع `dbReady`، `initError`، `recoveryRequired`، `recoveryBusy`، `currentUser`، وأفعال `setCurrentUser` و`retryInit` و`createFreshDatabase`.
- **يعتمد على:** `DatabaseManager`، `databaseAsyncService`، `AuthService`، `PermissionService`، `CentralLicenseService`، `BackupScheduler`، `NotificationService`، `ConsistencyAuditService`، `LicenseNotificationService`، `SyncEngine`/`SyncWorker`/`MasterDataSyncService`/`SyncPolicyService`، و`ReservationService`.

### `src/hooks/domains/auth/usePagePermissions.ts`
- **الغرض:** واجهة موحدة لفحص صلاحيات صفحة عبر بادئة صلاحيات.
- **التوقيع:** `usePagePermissions(base: string, user?: User | null)`؛ يرجع `{ can, view, action, section, any, all, assert, base }`، حيث تفحص `action(name)` عن `base.name`، و`section(name)` عن `base.section.name.view`، و`assert(name)` يرمي خطأً عند غياب الصلاحية.
- **يعتمد على:** `usePermission`، `AuthService`، و`PermissionService`.

### `src/hooks/domains/auth/usePermission.ts`
- **الغرض:** فحص صلاحيات المستخدم الحالي أو مستخدم محدد، مع إعادة التقييم عند وصول تكوين مركزي جديد.
- **التوقيع:** `usePermission(user?: User | null): (code: string) => boolean` — يرجع دالة `can(code)`؛ و`useAnyPermission(user?: User | null): (codes: string[]) => boolean` — يرجع دالة تتحقق من أي كود.
- **يعتمد على:** `AuthService`، `PermissionService`، و`CENTRAL_CONFIG_CHANGED_EVENT` من `CentralLicenseService`.

### `src/hooks/domains/auth/useRouteAccess.ts`
- **الغرض:** تقييم مسار/رابط بنفس قواعد حارس المسارات الرئيسية بناءً على صلاحيات `all` و`any`.
- **التوقيع:** `useRouteAccess(): (path: string) => boolean` — يرجع دالة تتحقق من صلاحيات المسار.
- **يعتمد على:** `NavigationService` و`usePermission`.

### `src/hooks/domains/auth/useScreenPermission.ts`
- **الغرض:** فحص الوصول الموحّد لشاشة أو مسار، مع إمكانية فحص صلاحية تبويب/قسم داخل الشاشة.
- **التوقيع:** `useScreenPermission(path: string, user?: User | null): ScreenAccess` — يرجع `{ allowed, missing }`؛ و`useScreenTabPermission(path: string, tabKey: string, user?: User | null): ScreenAccess` — يضيف فحص صلاحية التبويب إذا كانت معرّفة.
- **يعتمد على:** `AuthService`، `PermissionChecker`، و`screenRegistry` (`screenRequirementFor`، `screenPermissionBase`، `tabPermissionCode`).

### `src/hooks/domains/auth/useTabPermissions.ts`
- **الغرض:** تقييم صلاحيات مجموعة تبويبات على شاشة، بحيث القائمة الفارغة تعني تبويبًا عامًا وقائمة الأكواد تتطلب أي صلاحية منها.
- **التوقيع:** `useTabPermissions<T extends string>(requirements: Record<T, readonly string[]>, user?: User | null): (tab: T) => boolean` — يرجع دالة `canTab(tab)`.
- **يعتمد على:** `useAnyPermission` و`AuthService`/`PermissionService` عبر `usePermission`.

## `domains/config`

### `src/hooks/domains/config/useAppConfig.ts`
- **الغرض:** ملف تجميعي (barrel) يعيد تصدير hooks محرك الإعدادات الديناميكية من الجزءين `part01` و`part02`.
- **التوقيع:** لا يعرّف hook جديدًا؛ يعيد تصدير `useAppConfig`، `useConfigText`، `usePageConfig`، `useSectionConfig`، `useFieldConfig`، `useConfigEntries`، `useConfigRules`، `usePolicyNumber`، و`usePolicyBoolean`.
- **يعتمد على:** `useAppConfig_part01` و`useAppConfig_part02`.

### `src/hooks/domains/config/useAppConfig_part01.ts`
- **الغرض:** ربط React بمحرك Dynamic Application Configuration ومتابعة التغييرات لحظيًا.
- **التوقيع:** `useAppConfig(): AppConfigState`؛ `useConfigText(key: string, fallback: string): string`؛ `usePageConfig(pathname?: string)` يرجع `{ enabled, label, order, entry }`؛ `useSectionConfig(sectionId: string, pathname?: string)` يرجع `{ enabled, label, entry }`؛ `useFieldConfig(formId: string, fieldKey: string): AppConfigFieldState`؛ `useConfigEntries(domain: AppConfigEntry['domain']): AppConfigEntry[]`.
- **يعتمد على:** `AppConfigService`، `normalizePagePath`/`appConfiguration`، و`react-router-dom`.

### `src/hooks/domains/config/useAppConfig_part02.ts`
- **الغرض:** قراءة قواعد الإعدادات والسياسات الرقمية/المنطقية من حالة التكوين.
- **التوقيع:** `useConfigRules(kind?: AppConfigRule['kind']): AppConfigRule[]`؛ `usePolicyNumber(key: string, fallback: number): number`؛ `usePolicyBoolean(key: string, fallback: boolean): boolean`.
- **يعتمد على:** `useAppConfig` و`AppConfigService` عبر `useAppConfig_part01`.

### `src/hooks/domains/config/useBusinessTerm.ts`
- **الغرض:** جلب مصطلحات النشاط التجاري، نصوص الصفحات حسب النشاط، ونصوص المسار، وبيانات ملف النشاط التجاري.
- **التوقيع:** `useBusinessTerm(key: BusinessTermKey): string`؛ `useActivityPageCopy(page: ActivityPageKey): ActivityPageCopy | undefined`؛ `useActivityPathCopy(): ActivityPageCopy | undefined`؛ `useBusinessProfileMeta()` يرجع `{ businessType, label, description, profile }`.
- **يعتمد على:** `TerminologyService`، `SettingsService`، `BusinessTypeService`، `businessProfiles`، `activityPageCopy`، `activityPathCopy`، و`useTheme`.

### `src/hooks/domains/config/useDace.ts`
- **الغرض:** واجهة مبسطة لقراءة التكوين الديناميكي، الميزات، الوحدات، الإجراءات الديناميكية، والصلاحيات الفعلية.
- **التوقيع:** `useConfiguration()` يرجع كائنًا بدوال `AppConfigService`؛ `useFeature(id: string, user?: User | null)`؛ `useModule(id: string)`؛ `useDynamicAction(id: string, user?: User | null)`؛ `useEffectivePermissions(codes: string[], user?: User | null)` يرجع مصفوفة `{ code, allowed }`؛ و`assertDynamicActionAllowed(id: string, actor?: User | null): void`.
- **يعتمد على:** `AppConfigService`، `FeatureService`، `ModuleRegistryService`، `ActionRegistryService`، `PermissionService`، و`AuthService`.

### `src/hooks/domains/config/useNavigationGroups.ts`
- **الغرض:** توفير مجموعات التنقل للمكونات الداخلية وتوليدها للمستخدم مع تحديثها عند تغيّر الإعدادات أو التكوين المركزي.
- **التوقيع:** `NavigationGroupsProvider({ groups: NavGroupDef[]; children: ReactNode })`؛ `useSharedNavigationGroups(): NavGroupDef[]`؛ `useNavigationGroups(user: User | null): NavGroupDef[]`.
- **يعتمد على:** `NavigationService`، `SettingsService`، `AppConfigService`، `CENTRAL_CONFIG_CHANGED_EVENT` من `CentralLicenseService`، وContext خاص بالمشروع.

## `domains/daily`

### `src/hooks/domains/daily/useExpenseCategories.ts`
- **الغرض:** تحميل تصنيفات المصروفات المتاحة مرة واحدة عند تركيب الـ hook.
- **التوقيع:** `useExpenseCategories()` بدون معاملات؛ يرجع `{ categories: ExpenseCategory[], error: string }`.
- **يعتمد على:** `CashierService` ونوع `ExpenseCategory`.

### `src/hooks/domains/daily/useLists.ts`
- **الغرض:** تحميل قوائم العملاء والمنتجات والمخازن المستخدمة في الشاشات اليومية.
- **التوقيع:** `useLists()` بدون معاملات؛ يرجع `{ customers: Customer[], products: Product[], warehouses: WarehouseRow[], error: string }`.
- **يعتمد على:** `CustomerService`، `ProductService`، و`OperationsService`.

### `src/hooks/domains/daily/useRegisters.ts`
- **الغرض:** تحميل الخزائن/الصناديق بشكل غير متزامن مع حماية من تحديث state بعد unmount.
- **التوقيع:** `useRegisters()` بدون معاملات؛ يرجع `{ registers: CashRegister[], error: string }`.
- **يعتمد على:** `CashierService` ونوع `CashRegister`.

### `src/hooks/domains/daily/useSuppliers.ts`
- **الغرض:** تحميل قائمة مختصرة بالموردين النشطين من قاعدة البيانات.
- **التوقيع:** `useSuppliers()` بدون معاملات؛ يرجع `{ suppliers: Pick<Supplier, 'id' | 'name' | 'phone'>[], error: string }`.
- **يعتمد على:** `DatabaseManager` مباشرة باستعلام SQL على جدول `suppliers`.

## `domains/dashboard`

### `src/hooks/domains/dashboard/useExecutiveCommandCenter.ts`
- **الغرض:** إدارة لوحة القيادة التنفيذية مع نطاق زمني، تحديث، وإحصاء/تفاصيل المؤشرات (drilldown).
- **التوقيع:** `useExecutiveCommandCenter()` بدون معاملات؛ يرجع `range` و`setRange` و`data` و`loading` و`error` و`lastUpdated` و`refresh` و`drilldownKey` و`drilldown` و`drilldownLoading` و`drilldownError` و`openDrilldown(key)` و`closeDrilldown()`.
- **يعتمد على:** `executiveCommandService` وأنواع `CommandRange` و`DrilldownKey` و`DrilldownResult` و`ExecutiveCommandOverview`.

### `src/hooks/domains/dashboard/useExecutiveDashboard.ts`
- **الغرض:** بناء بيانات لوحة المؤشرات التنفيذية (KPIs، مبيعات يومية، منتجات، فواتير، عملاء مدينون، مخزون منخفض) حسب نطاق زمني.
- **التوقيع:** `useExecutiveDashboard()` بدون معاملات؛ يرجع `range` و`setRange` و`loading` و`loadError` و`kpis` و`dailySales` و`topProducts` و`recentInvoices` و`debtCustomers` و`branchData` و`lowStock` و`lastRefresh` و`refresh`.
- **يعتمد على:** `dashboardMetricsService` و`date-fns` وأيقونات `lucide-react` وأنواع dashboard.

### `src/hooks/domains/dashboard/useExecutiveQueries.ts`
- **الغرض:** دالة توافقية قديمة تستدعي خدمة لوحة المؤشرات الموحدة؛ ليست React hook رغم التسمية.
- **التوقيع:** `runExecutiveQueries(fromStr: string, toStr: string): Promise<ExecutiveDashboardData | null>` — دالة async عادية.
- **يعتمد على:** `dashboardMetricsService`.

### `src/hooks/domains/dashboard/useOverviewDashboardData.ts`
- **الغرض:** تحميل وتنسيق بيانات لوحة النظرة العامة: مؤشرات، مخططات، منتجات، عملاء، توزيع مدفوعات، مشتريات اليوم، وتحليلات مشتريات مشتقة.
- **التوقيع:** `useOverviewDashboardData(): OverviewDashboardData` — يرجع كل مجموعات البيانات، حالات `loading`/`refreshing`/`purchasesLoading`، أخطاء `dashboardError`/`purchasesError`، و`loadData`، بالإضافة إلى `purchaseHourly` و`purchasePeakHour` و`purchasePaymentMix` و`purchaseTopSuppliers` و`purchaseTopItems` و`purchaseQuantitiesByUnit`.
- **يعتمد على:** `dashboardMetricsService` و`AccountingService` و`getProductUnitLabel`.

## `domains/database`

### `src/hooks/domains/database/useDatabaseAsync.ts`
- **الغرض:** تغليف عمليات قاعدة البيانات غير المتزامنة عبر Web Worker مع حالة loading/error.
- **التوقيع:** `useDatabaseAsync<T = unknown>(): UseDatabaseAsyncResult<T>` — يرجع `data` و`loading` و`error` و`isReady` و`runQuery(sql, params?)` و`runCommand(sql, params?)` و`runExec(sql)` و`exportDb()` و`importDb(bytes)` و`reset()`؛ و`initializeDatabaseAsync(): Promise<void>` تهيئ Worker مرة واحدة.
- **يعتمد على:** `DatabaseManager` و`databaseAsyncService`.

## `domains/licensing`

### `src/hooks/domains/licensing/useCentralFeaturePermission.ts`
- **الغرض:** تقييم صلاحيات الميزات على مستوى الصفحة من التكوين المركزي مع تحديث عند تغيّر الإعدادات أو التركيز.
- **التوقيع:** `useCentralFeaturePermission(pathname?: string)` — يرجع `{ visible, canView, canEdit, canDelete, canExportPrint }` للمسار الحالي أو المسار الممرر.
- **يعتمد على:** `CentralFeaturePermissionService` و`CENTRAL_CONFIG_CHANGED_EVENT` من `CentralLicenseService` و`react-router-dom`.

### `src/hooks/domains/licensing/useCentralUsageLimit.ts`
- **الغرض:** قراءة حالة حد الاستخدام المركزي لمقياس معين وتحديثها عند وصول تكوين جديد.
- **التوقيع:** `useCentralUsageLimit(metric: CentralUsageMetric): CentralUsageState`.
- **يعتمد على:** `CentralUsageLimitService` و`CENTRAL_CONFIG_CHANGED_EVENT` من `CentralLicenseService`.

## `domains/treasury`

### `src/hooks/domains/treasury/useCashier.ts`
- **الغرض:** إدارة شاشة الخزينة: الورديات، الصناديق، المصروفات، تصنيفات المصروفات، جدول الإغلاق التلقائي، والإشعارات.
- **التوقيع:** `useCashier()` بدون معاملات؛ يرجع حالة `currentUser` و`registers` و`activeShift` و`operationsShift` و`lastClosedShift` و`shiftRegisterId` و`autoCloseEnabled`/`autoCloseTime` و`expenses` و`categories` وحالات المودالات والإشعارات، بالإضافة إلى `isLoading` و`expectedEndingCash` و`loadData` و`openShift` و`closeShift` و`addExpense` و`saveSchedule` و`suggestedOpeningBalance`.
- **يعتمد على:** `CashierService` و`OperationsShiftService` و`LayoutContext` و`CeramicMath`.

## `pages/customers/partners`

### `src/hooks/pages/customers/partners/usePartnersPage.ts`
- **الغرض:** ViewModel كامل لصفحة الشركاء: قائمة الشركاء، كشف الحساب، الحركات، رأس المال، توزيع الأرباح، العكس، التصدير والطباعة، مع صلاحيات وأفعال الحفظ.
- **التوقيع:** `usePartnersPage()` بدون معاملات؛ يرجع كائنًا ضخمًا يشمل `can` والصلاحيات `canManage`/`canTransact`/`canAdjust`/`canReverse`/`canDistribute`/`canPrint`/`canExport`، والقوائم `partners` و`visiblePartners` و`overview` و`registers` و`bankAccounts` و`capitalHistory` و`statement` و`distributionHistory` و`batchLines`، وحقول النماذج `partnerDraft` و`transactionDraft` و`profitTotal` و`allocations` و`statementFilters` وغيرها، وحالات `loading`/`error`/`saving`/`modal`/`selectedId`/`tab`/`search`، والمشتقات `selected` و`activeOwnership` و`activeProfitShare` و`pendingProfits` و`outstandingLoans` و`ownershipPreview`، والأفعال `refresh` و`selectPartner` و`openNewPartner` و`openEditPartner` و`openTransaction` و`openProfitDistribution` و`openReversal` و`savePartner` و`saveTransaction` و`saveReversal` و`setProfitAmount` و`fillAutomaticShares` و`saveProfitDistribution` و`toggleBatch` و`exportCsv` و`printStatement`.
- **يعتمد على:** `PartnerService` و`usePermission` و`useToast` و`partnersModel` ونوعَي `BusinessPartner` و`PartnerOverview`.

## `pages/inventory/stock-transfers`

### `src/hooks/pages/inventory/stock-transfers/useStockTransfers.ts`
- **الغرض:** دمج hook البيانات مع hook الإجراءات لتوفير واجهة كاملة لصفحة تحويلات المخزون.
- **التوقيع:** `useStockTransfers()` بدون معاملات؛ يرجع كل ما يرجعه `useStockTransfersData` و`useTransferActions`، مع إضافة `openCreateModal()` و`addRequestRow()` اللذين يستخدمان أول منتج افتراضيًا.
- **يعتمد على:** `useStockTransfersData` و`useTransferActions`.

### `src/hooks/pages/inventory/stock-transfers/useStockTransfersData.ts`
- **الغرض:** تحميل بيانات صفحة التحويلات: التبويب، التحويلات، المخازن، المنتجات، ملخص المخازن، والفلاتر.
- **التوقيع:** `useStockTransfersData()` بدون معاملات؛ يرجع `activeTab` و`setActiveTab` و`transfers` و`workflowTransfers` و`warehouses` و`allProducts` و`warehouseSummary` و`selectedWarehouse` و`setSelectedWarehouse` و`statusFilter` و`setStatusFilter` و`loading` و`loadData`.
- **يعتمد على:** `InventoryService` و`ProductService` و`AuthService` و`PermissionService` و`useToast` و`helpers` و`StockTransferTab`.

### `src/hooks/pages/inventory/stock-transfers/useTransferActions.ts`
- **الغرض:** إدارة إجراءات تحويلات المخزون: إنشاء طلب، اعتماد، تجهيز، إرسال، استلام بكميات مفقودة/تالفة، رفض، وعرض التفاصيل.
- **التوقيع:** `useTransferActions(onSuccess: () => void)`؛ يرجع حالات المودالات والنماذج `showCreateModal` و`fromWhId`/`toWhId` و`requestNotes` و`requestItems` و`receivingTransfer` و`receivingItems` و`receiptInputs` و`detailTransfer`/`detailItems`، والأفعال `handleOpenCreate` و`handleAddItemRow` و`handleRemoveItemRow` و`handleCreateSubmit` و`handleApprove` و`handlePrepare` و`handleDispatch` و`handleOpenReceive` و`handleReceiveSubmit` و`handleReject` و`handleViewDetails`.
- **يعتمد على:** `InventoryService` و`useToast` وأنواع `ReceiptInput` و`TransferRequestItem`.

## `pages/sales/pos`

### `src/hooks/pages/sales/pos/usePosActivityCopy.ts`
- **الغرض:** اختيار نصوص نقطة البيع المناسبة لنشاط الأعمال الحالي مع fallback للعائلة ثم الافتراضي.
- **التوقيع:** `usePosActivityCopy(): PosActivityCopy`.
- **يعتمد على:** `BusinessTypeService` و`businessProfiles` و`posActivityCopy` و`useTheme`.

### `src/hooks/pages/sales/pos/usePosBarcodeSearch.ts`
- **الغرض:** البحث عن منتج بالباركود/SKU أو إضافة نتيجة وحيدة من نتائج البحث عند إرسال النموذج.
- **التوقيع:** `usePosBarcodeSearch(options: UsePosBarcodeSearchOptions)` يرجع `useCallback` لمعالج submit؛ الخيارات تتضمن `products` و`filteredProducts` و`searchQuery` و`setSearchQuery` و`barcodeInputRef` و`addToCart` و`notify`.
- **يعتمد على:** نوعَي `Product` و`Toast` فقط من جهة الخدمات.

### `src/hooks/pages/sales/pos/usePosCart.ts`
- **الغرض:** إدارة سلة البيع: إضافة/حذف/تراجع عن الحذف، تحديث الكميات والوحدات والأسعار والخصومات والملاحظات، تطبيق أسعار العميل ومنع الأصناف المنتهية.
- **التوقيع:** `usePosCart(options: UsePosCartOptions)`؛ الخيارات تتضمن `can` و`notify` و`pricingService` و`selectedCustomer` و`stockOf` و`allowDuplicateItems`؛ يرجع `cart` و`setCart` و`applyCustomerPricing` و`addToCart` و`addDiscountedToCart` و`addCalculatedToCart` و`updateCartQuantity` و`stepCartQuantity` و`updateCartUnit` و`updateCartPrice` و`updateCartLineDiscount` و`updateCartNotes` و`removeFromCart` و`recentlyRemoved` و`undoRemoveFromCart`.
- **يعتمد على:** `PricingService` و`ExpiryService` و`CeramicMath` و`uom`/`productUnits` و`cartUtils`.

### `src/hooks/pages/sales/pos/usePosCatalog.ts`
- **الغرض:** إدارة فلاتر وبحث وترتيب كتالوج المنتجات والبحث عن العملاء في POS.
- **التوقيع:** `usePosCatalog(options: UsePosCatalogOptions)`؛ الخيارات تتضمن `products` و`categories` و`customers` و`stockOf`؛ يرجع حالات البحث والفلاتر `searchQuery` و`selectedCategory` و`selectedBrand` و`selectedGrade` و`selectedSize` و`selectedColor` و`customerSearch` و`inStockOnly` و`sortMode`، والمخرجات `filteredProducts` و`visibleCategories` و`visibleBrands` و`hasCeramicCatalog` و`visibleSizes` و`visibleColors` و`filteredCustomers` و`hasActiveFilters` و`clearFilters`.
- **يعتمد على:** `CategoryWithCount` وأنواع `Product`/`Customer`/`SortMode` فقط من جهة الخدمات.

### `src/hooks/pages/sales/pos/usePosCheckout.ts`
- **الغرض:** التحقق من السلة والمخزون والأسعار والخصومات وحد الائتمان ونقاط الولاء، ثم إنشاء فاتورة البيع مع منع التكرار ومعالجة موافقات الخصم وتحذيرات خلط الدرجات.
- **التوقيع:** `usePosCheckout(options: UsePosCheckoutOptions)`؛ الخيارات object ضخم يضم `can` و`notify` وحالة السلة والعميل والمخزن والوردية والإعدادات والخصومات والضرائب والشحن والدفعات والمدفوعات methods، إضافة إلى الخدمات `salesService` و`cashierService` و`batchService` و`loyaltyService` وcallbacks الحالة؛ يرجع `{ isProcessing, setIsProcessing, handleCheckout }`.
- **يعتمد على:** `SalesService` و`CashierService` و`BatchService` و`LoyaltyService` و`PricingService` و`ExpiryService` و`AppConfigService` و`ApprovalService` و`discountPolicy`.

### `src/hooks/pages/sales/pos/usePosCustomerCreation.ts`
- **الغرض:** إنشاء عميل جديد من نافذة POS مع فحص الصلاحية ومنع تكرار رقم الهاتف.
- **التوقيع:** `usePosCustomerCreation(options: UsePosCustomerCreationOptions)`؛ الخيارات تتضمن `can` و`notify` و`customerService` وsetters للعملاء والعميل المحدد ونقاط الولاء ونموذج العميل؛ يرجع `{ handleCreateCustomer }`.
- **يعتمد على:** `CustomerService` ونوع `Customer`.

### `src/hooks/pages/sales/pos/usePosCustomerDisplay.ts`
- **الغرض:** ملف تجميعي يعيد تصدير `usePosCustomerDisplay` من `part02` بعد تحميل `part01`.
- **التوقيع:** لا يعرّف hook جديدًا؛ يعيد تصدير `usePosCustomerDisplay`.
- **يعتمد على:** `usePosCustomerDisplay_part01` و`usePosCustomerDisplay_part02`.

### `src/hooks/pages/sales/pos/usePosCustomerDisplay_part01.ts`
- **الغرض:** تعريف أنواع بيانات شاشة العميل ودالة `renderCustomerDisplay` التي تكتب HTML آمنًا داخل نافذة العرض.
- **التوقيع:** `renderCustomerDisplay(display: Window, data: CustomerDisplayData, labels: CustomerDisplayLabels): void`؛ `CustomerDisplayData` يحوي `items` و`subtotal` و`discount` و`tax` و`total` و`paid` و`change`؛ `UsePosCustomerDisplayOptions` يعرّف مدخلات الـ hook.
- **يعتمد على:** `PosActivityCopy` و`CartItem` و`Toast` فقط من جهة الأنواع.

### `src/hooks/pages/sales/pos/usePosCustomerDisplay_part02.ts`
- **الغرض:** فتح نافذة عرض للعميل، تحديثها مع بيانات السلة والإجماليات، واستخدام نصوص النشاط الحالي.
- **التوقيع:** `usePosCustomerDisplay(options: UsePosCustomerDisplayOptions): { openCustomerDisplay }`؛ الخيارات تتضمن `cart` و`lineSubtotal` و`discountAmount` و`promotionDiscount` و`loyaltyDiscount` و`taxAmount` و`totalAmount` و`paidAmount` و`changeDue` و`notify`.
- **يعتمد على:** `usePosActivityCopy` و`renderCustomerDisplay` و`round2`.

### `src/hooks/pages/sales/pos/usePosHeldOrders.ts`
- **الغرض:** حفظ واسترجاع وحذف الطلبات المعلقة محليًا وفي قاعدة البيانات لكل مستخدم، مع مزامنة localStorage وDB.
- **التوقيع:** `usePosHeldOrders(options: UsePosHeldOrdersOptions)`؛ الخيارات object ضخم يضم `heldOrderService` و`currentUserId` وحالة السلة والعميل والمخزن والخصومات والضرائب والشحن والمدفوعات و`paymentType` و`couponCode` و`redeemPoints` و`loyaltyDiscount` و`setIsHeldModalOpen` و`notify`؛ يرجع `{ heldOrders, holdCurrentOrder, resumeHeldOrder, deleteHeldOrder }`.
- **يعتمد على:** `HeldOrderService` و`CustomerService` و`uom` و`HELD_STORAGE_KEY` و`HeldOrder`/`CartItem`.

### `src/hooks/pages/sales/pos/usePosInvoicePreview.ts`
- **الغرض:** بناء معاينة فاتورة قابلة للطباعة مع تصدير Excel وإرسال WhatsApp.
- **التوقيع:** `usePosInvoicePreview(options: UsePosInvoicePreviewOptions)`؛ الخيارات `{ printService: PrintService; setInvoicePreview: Dispatch<SetStateAction<InvoicePreview | null>> }`؛ يرجع `{ openInvoicePreview(invoice: any) }`.
- **يعتمد على:** `PrintService` و`exportToExcel` و`openWhatsAppChat` و`CeramicMath` و`formatProductQuantity`.

### `src/hooks/pages/sales/pos/usePosKeyboardShortcuts.ts`
- **الغرض:** ربط اختصارات لوحة المفاتيح لنقطة البيع مثل F1–F10 وEscape وDelete و+/-.
- **التوقيع:** `usePosKeyboardShortcuts(options: UsePosKeyboardShortcutsOptions): void` — لا يرجع قيمة؛ الخيارات تتضمن callbacks الإتمام والمودالات والمخزون/الدفع/تعليق الطلب وتعديل السلة.
- **يعتمد على:** `InvoicePreview` و`Toast` فقط من جهة الأنواع.

### `src/hooks/pages/sales/pos/usePosShiftActions.ts`
- **الغرض:** ملف تجميعي يعيد تصدير `usePosShiftActions` من `part02` بعد تحميل `part01`.
- **التوقيع:** لا يعرّف hook جديدًا؛ يعيد تصدير `usePosShiftActions`.
- **يعتمد على:** `usePosShiftActions_part01` و`usePosShiftActions_part02`.

### `src/hooks/pages/sales/pos/usePosShiftActions_part01.ts`
- **الغرض:** تعريف خيارات وردية POS ودالة `escapeHtml` المساعدة.
- **التوقيع:** `escapeHtml(value: unknown): string`؛ `UsePosShiftActionsOptions` يعرّف `can` و`notify` و`cashierService` و`registerId` و`openingBalance` و`setOpeningBalance` و`currentUserId` و`effectiveUserId` و`activeShift` و`expectedClosingCash` و`setActiveShift` و`closingCash` و`setClosingCash` و`closingNotes` و`setClosingNotes` وsetters للمودالات.
- **يعتمد على:** `CashierService` و`CashShift` و`Toast` فقط من جهة الأنواع.

### `src/hooks/pages/sales/pos/usePosShiftActions_part02.ts`
- **الغرض:** فتح وإغلاق وردية الكاشير في POS وطباعة تقرير Z.
- **التوقيع:** `usePosShiftActions(options: UsePosShiftActionsOptions)`؛ يرجع `{ handleOpenShift, handleCloseShift, printZReport }`.
- **يعتمد على:** `CashierService` و`CeramicMath` و`writeAndPrintWindow` و`escapeHtml`.

### `src/hooks/pages/sales/pos/usePosTotals.ts`
- **الغرض:** حساب إجماليات الفاتورة وضرائبها وخصوماتها والدفعات والرصيد المتبقي والباقي المتوقع للوردية.
- **التوقيع:** `calculatePosTotals(options: UsePosTotalsOptions)` يرجع `{ lineSubtotal, lineDiscountTotal, subtotal, taxableBase, taxAmount, totalAmount, remainingAmount, changeDue, expectedClosingCash }`؛ و`usePosTotals(options: UsePosTotalsOptions)` يرجع نفس القيم إضافة إلى `cartQuantitySummary`.
- **يعتمد على:** `getUomLabel` و`round2` و`CartItem`/`CashShift`.

### `src/hooks/pages/sales/pos/usePosView.ts`
- **الغرض:** ViewModel رئيسي لصفحة نقطة البيع: يجمع تحميل المنتجات والعملاء والمخزون والورديات والإعدادات، كل hooks الفرعية، الدفع المختلط، العروض والولاء، الإلغاء، PIN/override، المودالات، وprint/customer display.
- **التوقيع:** `usePosView(): PosViewVm` بدون معاملات؛ يرجع كائنًا ضخمًا يشمل `navigate` و`currentUser`/`actingUser`/`effectiveUser` وكل حالات المنتجات والعملاء والمخازن والصناديق والوردية والإعدادات والمخزون والخصومات والضرائب والدفعات والمدفوعات و`cart` والمودالات والـ toasts والفواتير، وكل خدمات POS، وكل hooks الفرعية (`usePosCatalog` و`usePosCart` و`usePosHeldOrders` و`usePosTotals` و`usePosCheckout` و`usePosCustomerDisplay` و`usePosShiftActions` و`usePosInvoicePreview` و`usePosKeyboardShortcuts`)، والأفعال `notify` و`can` و`stockOf` و`loadStock` و`loadInitialData` و`loadMoreProducts`/`loadMoreCustomers` و`clearCart` و`cyclePaymentType` و`handleVoidInvoice` و`handlePinLogin` و`handleManagerOverride` وغيرها.
- **يعتمد على:** `ProductService` و`OperationalFieldService` و`InventoryService` و`CustomerService` و`CategoryService` و`SalesService` و`AuthService` و`BatchService` و`CashierService` و`HeldOrderService` و`LoyaltyService` و`PrintService` و`PricingService` و`PermissionService` و`FinanceEnterpriseService` و`EmployeeService` و`LayoutContext`.

## `platform`

### `src/hooks/platform/useCentralDataSource.ts`
- **الغرض:** تحديد ما إذا كانت شاشات إدارة المنصة تقرأ/تكتب عبر الخادم المركزي أم محليًا، مع كشف سوء الإعداد.
- **التوقيع:** `getCentralDataSourceState(): CentralDataSourceState` — ليست hook reactive؛ ترجع `{ enabled, available, active, misconfigured }`.
- **يعتمد على:** `platformAdminService` و`platformAdminApiClient`.

### `src/hooks/platform/usePlatformPermission.ts`
- **الغرض:** فحص صلاحيات إدارة المنصة برمجيًا عبر صلاحية granular أو module/action قديم.
- **التوقيع:** `canPlatformPermission(code: string): boolean`؛ `canPlatform(moduleKey: string, action?: string): boolean` — كلاهما دالة عادية وليست hook reactive.
- **يعتمد على:** `PlatformAuthorizationService` و`PlatformStaffAuthService` و`AuthService`.

## `shared`

### `src/hooks/shared/useIdempotencyKey.ts`
- **الغرض:** توليد مفتاح idempotency ثابت لكل عملية إرسال حتى إعادة التعيين، لمنع التكرار عند الضغط المزدوج أو retry.
- **التوقيع:** `useIdempotencyKey(): { getKey: () => string; resetKey: () => void }`.
- **يعتمد على:** `useRef`/`useCallback` و`crypto.randomUUID` فقط.

### `src/hooks/shared/useMediaQuery.ts`
- **الغرض:** قراءة media query بشكل تفاعلي مع تحديث عند تغير المطابقة، مع اختصارات جاهزة للشاشات واللمس.
- **التوقيع:** `useMediaQuery(query: string): boolean`؛ `useIsDesktop(): boolean` للاستعلام `(min-width: 1024px)`؛ `useIsTouch(): boolean` للاستعلام `(pointer: coarse)`.
- **يعتمد على:** `window.matchMedia` فقط.
