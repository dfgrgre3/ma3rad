# النواة وتطبيقات طبقة التطبيق (Core / App)

## كيف يُشغَّل التطبيق (Bootstrap)

1. **`src/main.tsx`**: نقطة الدخول. يبدأ مراقبة أداء المُصيّر، يثبّت مستمعات `error`/`unhandledrejection` التي تُبلّغ الأخطاء إلى `window.ceramisys.diagnostics.reportError`، ثم يعرض `<App>` داخل `React.StrictMode` (مع `Profiler` في وضع التطوير). يستورد `index.css`.
2. **`src/app/App.tsx`**: يهيّئ قاعدة البيانات والجلسة عبر `useAppStartup()`، يتحقق من التفعيل المركزي (معطّل حاليًا بـ `BYPASS_FIRST_RUN_ACTIVATION` وفحص الترخيص معطّل بـ `_SKIP_LICENSE_CHECK`)، يزامن الإعدادات/المؤسسة/heartbeat/فحص التحديثات عبر خدمات الترخيص المركزية، يشغّل مراقبة الأمان والصحة بعد جاهزية القاعدة، ويقرر شاشة الدخول:
   - قاعدة غير جاهزة → شاشة تحميل skeleton أو خطأ تهيئة.
   - لا مستخدم → `LoginPage` أو صفحات ما قبل المصادقة (`PlatformOwnerSetupPage`, `PlatformStaffInviteAcceptPage` عبر الـ hash).
   - مستخدم مسجّل → `ThemeProvider` → `ToastProvider` → `ErrorBoundary` → `HashRouter` → `AppRouter` (مع `SetupWizard` عند أول تشغيل، و`ForcePasswordChangeModal` عند الحاجة).
3. **`src/app/App.tsx` → `AppRouter`** (`src/router/AppRouter.tsx`): يُعرّف مسارين رئيسيين: `/platform/*` (lazy `PlatformRoutes` للمستخدمين الإداريين للمنصة) و`/` داخل `MainLayout` كمسار أب يحتوي كل مسارات `appRoutes` كمسارات أبناء، وكل عنصر مسار يُغلَّف بـ `<S>` (= `ModuleGuard`). المسار `/` يحوّل إلى `resolveUserLandingPath()`.
4. **`MainLayout`** (`src/layouts/MainLayout.tsx`): القشرة العامة — `Header` + `Sidebar` (أو تنقّل علوي حسب الإعداد) + `Outlet` للمحتوى + شريط حالة سفلي، ويُطبّق حارس صلاحيات المسار الثاني عبر `NavigationService.getRequiredPermissionGroups`.
5. **`routesList.tsx` + `lazyPages*`**: جدول المسارات `appRoutes` (~180 مسارًا) حيث كل صفحة `React.lazy` من `lazyPages_part01–04`، مع توجيهات `Navigate` للمسارات المُعاد تسميتها. `routePaths.ts` يحوي `APP_ROUTE_PATHS` (قائمة مسارات ثابتة بدون استيراد المكونات لتجنّب الدورات).

## الحُرّاس (Guards)

- **`S` = `ModuleGuard`** (`src/router/RouteGuard.tsx`): مكوّن حارس يُغلّف كل صفحة داخل `appRoutes`. يفرض بالترتيب: `PermissionService.canAccessPage` (صلاحيات المستخدم على المسار)، ثم في وضع `OPEN_ALL_PAGES` يمرّر مباشرة، وإلا يتحقق من: ظهور الصفحة في إعدادات المنصة المركزية (`CentralFeaturePermissionService.isPageVisible`)، قوائم الوحدات المسموحة (`allowedModules`)، تفعيل الصفحة (`AppConfigService.isPageEnabled`)، إخفاء الأنشطة (`isActivityPathHidden`)، وعضوية الوحدة في وحدات نوع النشاط (`getBusinessModuleForPath` + `parseEnabledModules` + `trackInventory`). عند الرفض يحوّل إلى `/dashboard` أو يعرض رسالة «لا صلاحية». كما يسجّل المسار الحالي في `CentralFeaturePermissionService.setCurrentPath` لتقييم صلاحيات الأزرار/الإجراءات في الطبقات غير المرتبطة بـ React، ويلفّ المحتوى بـ `Suspense` + `PageLoader` و`page-transition-wrapper`.
- **`PlatformRouteGuard`** (`src/pages/platform/PlatformRoutes.tsx`, خارج نطاق هذا الملف لكن مرتبط بالتوجيه): يحرس مسارات `/platform/*` للأدوار `SUPER_ADMIN`, `PLATFORM_ADMIN`, `SUPPORT_AGENT`, `OPERATIONS_ENGINEER`, `BILLING_SPECIALIST`, `LICENSE_MANAGER`، عبر `PlatformAuthorizationService.canAccessRouteGranular` مع تجاوز صلاحيات اختياري من `PlatformStaffAuthService`؛ عند الرفض يحوّل إلى `/platform`، وإذا لم يكن المستخدمًا إداريًا منصة يحوّل `PlatformRoutes` إلى `/dashboard`.

---

## التوجيه (Router)

### `src/router/AppRouter.tsx`
- **الغرض:** المكوّن الجذري للتوجيه داخل `HashRouter`؛ يركّب مسار `/platform/*` و`MainLayout` + `appRoutes`.
- **المحتوى/الأعضاء:** `AppRouter` (مكوّن، props: `currentUser`, `onLogout`, `onSwitchUser`)، `AppRouterProps`، lazy `PlatformRoutes`. المسار `index` يحوّل إلى `resolveUserLandingPath(currentUser, getPersistedLocation(currentUser.id))`؛ مسار `crm` يحوّل إلى `/crm/dashboard`؛ كل مسار في `appRoutes` يُغلَّف بـ `<S currentUser>`.

### `src/router/RouteGuard.tsx`
- **الغرض:** حارس الصفحات والمُحمّل؛ يُعرّف `ModuleGuard` والاختصار `S` و`PageLoader`.
- **المحتوى/الأعضاء:** `PageLoader` (سبينر تحميل)، `ModuleGuard` (فحص الصلاحيات/الوحدات/المنصة/الإعدادات/الأنشطة + `Suspense`)، `S = ModuleGuard`. يعتمد على: `SettingsService`, `BusinessTypeService`, `AppConfigService`, `PermissionService`, `CentralLicenseService`, `CentralFeaturePermissionService`, `businessProfiles`, `moduleRegistry`, `setupLifecycle.OPEN_ALL_PAGES`, `activityPageVisibility`.

### `src/router/index.ts`
- **الغرض:** نقطة إعادة تصدير موجزة للموجّه.
- **المحتوى/الأعضاء:** `AppRouter`, `AppRouterProps`, `ModuleGuard`, `S`, `PageLoader`.

### `src/router/lazyPages.ts`
- **الغرض:** غلاف تجميعي (barrel) يعيد تصدير كل الصفحات الكسولة من الأجزاء الأربعة ويُعرّف 7 صفحات كسولة إضافية مباشرة.
- **المحتوى/الأعضاء:** يعيد تصدير كل رموز `lazyPages_part01..04` + `lazy` مباشر: `InventoryAlertsPage`, `HotelPage`, `WorkshopPage`, `EducationPage`, `TimeBillingPage`, `CeramicsPage`, `RetailWorkspacePage`, `ExpiryPage` (و`PlatformSuperAdminDashboard`, `PlatformUserPlatformPermissionsPage` من part04).

### `src/router/lazyPages_part01.ts`
- **الغرض:** تعريفات `React.lazy` للصفحات: لوحة التحكم، المبيعات وPOS، المنتجات والتسعير، المخزون الأساسي.
- **المحتوى/الأعضاء:** `DashboardView`, `ExecutiveDashboard`, `PosView`, `RestaurantPage`, `SalesView`, `SalesAnalyticsPage`, `SalesHubPage`, `InvoiceCyclePage`, `CustomerStatementPage`, `SalesOrdersDepositsPage`, `AfterSalesPage`, `QuotationsPage`, `OrdersPage`, `ReturnsPage`, `TodaySalesPage`, `TodayPurchasesPage`, `TodayExpensesPage`, `TodayDebtsPage`, `ProductsView`, `ProductCatalogHubPage`, `ProductDetailPage`, `ProductAttributesPage`, `BarcodesPrintPage`, `CategoriesView`, `BrandsView`, `PricingPage`, `PromotionsPage`, `InventoryView`, `InventoryHubPage`, `LocationStockPage`, `StockLedgerPage`, `StockTransfersView`, `InventoryCountPage`.

### `src/router/lazyPages_part02.ts`
- **الغرض:** تعريفات `React.lazy`: بقية المخزون، الفروع/المستودعات/الأسطول/التسليم، الموظفون والموارد البشرية، التصنيع، CRM.
- **المحتوى/الأعضاء:** `InventoryValuationPage` … `InventoryReconciliationPage`, `BranchesPage`, `WarehousesPage`, `FleetDashboardPage`, `FacilityManagementPage`, `DeliveriesPage`, `DriversPage`, `VehiclesPage`, `EmployeesPage`, `AttendancePage`, `PayrollPage`, `CommissionsPage`, `LeavePage`, `EmployeeContractsPage`, `EmployeeDocumentsPage`, `RecruitmentPage`, `ManufacturingPage`, `HrDashboardPage` … `PayrollNotificationSettingsPage`, `CustomersView`, `CRMHubPage`, `CustomerDetailPage`, `PartnersPage`, `CustomerImportedProductsPage`, `ReadyDeliveriesPage`, `CrmDashboardPage`, `LeadsPage`, `PipelinePage`, `CrmActivitiesPage`, `CampaignsPage`.

### `src/router/lazyPages_part03.ts`
- **الغرض:** تعريفات `React.lazy`: المشتريات والموردون، المالية، المشاريع والإنشاءات، التقارير الأساسية.
- **المحتوى/الأعضاء:** `SuppliersView` … `SupplierStatementPage`, `CashierView`, `FinanceOverviewPage` … `FixedAssetsPage` (صفحات المالية كاملة), `ProjectsPage`, `ProjectDetailPage`, `ProjectExecutionPage`, `SiteManagementPage`, `GeneralBoqPage`, `ReportsView`, `ReportsHubPage`, `TaxReportPage`, `ProfitLossPage`.

### `src/router/lazyPages_part04.ts`
- **الغرض:** تعريفات `React.lazy`: التقارير المتبقية، الموافقات/المستندات/الأمان، الإعدادات، الصفحات الخاصة بالمنصة وصفحة 404.
- **المحتوى/الأعضاء:** `FinancialStatementsPage` … `PurchaseInventoryReportPage`, `ApprovalsPage`, `DocumentsPage`, `NotificationsView`, `AuditLogView`, `SecurityCenterPage`, `SyncStatusPage`, `SyncConflictsPage`, `AdminPage`, `DataDeletionPage`, `DynamicDataPage`, `AppConfigurationView`, `ConfigurationStudioView`, `DataImportPage`, `SettingsHubPage`, `ApprovalSettingsPage`, `LicenseModeSettingsPage`, `CentralActivationView`, `UsersView`, `BackupPage`, `SystemHealthPage`, `NotFoundPage`, `ApartmentEstimatePage`, `OperationsShiftsPage`, `PlatformSuperAdminDashboard`, `PlatformUserPlatformPermissionsPage`.

### `src/router/navigationPersistence.ts`
- **الغرض:** barrel يدمج منجزَي الحفظ/الاسترجاع لحالة التنقل لكل مستخدم.
- **المحتوى/الأعضاء:** يعيد تصدير `getPersistedLocation` (part01) و`saveNavigationLocation`, `getPersistedScrollPosition`, `saveNavigationScrollPosition` (part02).

### `src/router/navigationPersistence_part01.ts`
- **الغرض:** قراءة/كتابة لقطة التنقل المخزّنة في `localStorage` (`ceramisys_navigation_v1_<userId>`).
- **المحتوى/الأعضاء:** `NavigationSnapshot` (version, lastLocation, scrollPositions), `StoragePort`, `STORAGE_PREFIX`, `MAX_SAVED_SCROLL_POSITIONS = 50`, `storageKey`, `isAppLocation`, `getStorage`, `readSnapshot`, `writeSnapshot`, `getPersistedLocation`.

### `src/router/navigationPersistence_part02.ts`
- **الغرض:** دوال حفظ/قراءة موضع التمرير والموقع الأخير، مع حد أقصى 50 موقعًا.
- **المحتوى/الأعضاء:** `saveNavigationLocation`, `getPersistedScrollPosition`, `saveNavigationScrollPosition` (يُزيل أقدم المواقع عند تجاوز الحد).

### `src/router/navigationShortcuts.ts`
- **الغرض:** barrel لميزات الاختصارات/المفضلة/الأخيرة في التنقل.
- **المحتوى/الأعضاء:** يعيد تصدير `NavigationShortcuts`, `NAVIGATION_SHORTCUTS_EVENT`, `canonicalNavigationPath`, `getNavigationShortcuts`, `toggleNavigationFavorite`, `recordRecentNavigation`.

### `src/router/navigationShortcuts_part01.ts`
- **الغرض:** الأنواع وثوابت تخزين الاختصارات وقراءة اللقطة من `localStorage` (`ceramisys_navigation_shortcuts_v1_<userId>`).
- **المحتوى/الأعضاء:** `NavigationShortcuts` (favorites, recent[]), `StoragePort`, `STORAGE_PREFIX`, `NAVIGATION_SHORTCUTS_EVENT`, `MAX_RECENT_PAGES = 10`, `PATH_ALIASES` (خريطة مسارات قديمة→جديدة), `EMPTY_SHORTCUTS`, `storageKey`, `getStorage`, `canonicalNavigationPath`, `readShortcuts`.

### `src/router/navigationShortcuts_part02.ts`
- **الغرض:** كتابة الاختصارات وإرسال حدث تغييرها، وتصفية المفضلة/الأخيرة حسب المسارات المسموحة للمستخدم.
- **المحتوى/الأعضاء:** `writeShortcuts` (مع `notifyShortcutsChanged` عبر `CustomEvent`), `accessibleShortcuts`, `getNavigationShortcuts`, `toggleNavigationFavorite`, `recordRecentNavigation`.

### `src/router/routePaths.ts`
- **الغرض:** قائمة مسارات `APP_ROUTE_PATHS` كـ `const` بدون استيراد مكونات — مرجع ثابت للمسارات يمنع الدورات الاستيرادية ويُتحقق منه مقابل `routesList`.
- **المحتوى/الأعضاء:** `APP_ROUTE_PATHS` (~180 مسارًا بما فيها `products/:id`, `customers/:id`, `reports/:reportId`, `*`).

### `src/router/routesList.tsx`
- **الغرض:** جدول المسارات الفعلي `appRoutes` الذي يستهلكه `AppRouter`؛ يربط كل مسار بعنصر `React.lazy` أو `Navigate` لإعادة التوجيه.
- **المحتوى/الأعضاء:** `RouteDef` (`path`, `element`), `appRoutes` (~180 `RouteDef` مجمّعة: Dashboard/Sales/Products/Inventory/Branches/CRM/Purchasing/Finance/Projects/HR/Reports/Admin/Settings/`*`)، وفحص تزامن مع `APP_ROUTE_PATHS` (يسجّل `console.error` عند الاختلاف).

### `src/router/userLanding.ts`
- **الغرض:** يحدد الصفحة التي يهبط عليها المستخدم بعد تسجيل الدخول.
- **المحتوى/الأعضاء:** `resolveUserLandingPath(user, persistedLocation)` — الموقع المحفوظ يغلب للأدوار غير `CASHIER` إذا كان مسموحًا؛ وإلا `ROLE_HOME_CANDIDATES` لكل دور (CASHIER→`/pos`, SALES→`/pos`, WAREHOUSE→`/inventory/hub`, ACCOUNTANT→`/finance`, …) ثم `NavigationService.getFirstAccessiblePath`. دوال داخلية: `DEFAULT_HOME_CANDIDATES`, `normalizeAppLocation`, `isUserAllowedPath`.

---

## التخطيط (Layouts)

### `src/layouts/MainLayout.tsx`
- **الغرض:** القشرة الرئيسية بعد تسجيل الدخول: رأس + شريط جانبي/تنقل علوي + `<Outlet>` + شريط حالة، مع حفظ/استعادة موقع التمرير والموقع الأخير وتطبيق حارس صلاحيات المسار.
- **المحتوى/الأعضاء:** `MainLayout` (props: `currentUser`, `onLogout`, `onSwitchUser`). يعتمد على `Header`, `Sidebar`, `NavigationGroupsProvider`/`useNavigationGroups`, `CalculatorPanel`, `NotesPanel`, `AppConfigRuntime`, `ConfigSection`/`ConfigText`, `useTheme` (اتجاه الواجهة ونمط التنقل من الإعدادات), `LayoutContext`, `navigationPersistence`, `navigationShortcuts`, `ShortcutsHelpDialog`, اختصارات لوحة المفاتيح (F1، Ctrl+B، Alt+1..9 للمفضلة)، عدّاد الإشعارات غير المقروءة كل 30 ثانية، درج جانبي للجوال، وأزرار الآلة الحاسبة/الملاحظات العائمة في شريط الحالة.

---

## السياقات (Contexts)

### `src/contexts/ThemeContext.ts`
- **الغرض:** تعريف نوع سياق الثيم.
- **المحتوى/الأعضاء:** `ThemeMode` ('light'|'dark'|'system'), `ThemeContextValue` (`settings`, `mode`, `resolvedMode`, `isDark`, `setMode`, `toggleMode`, `refresh`, `applyBrand`), `ThemeContext`.

### `src/contexts/ThemeProvider.tsx`
- **الغرض:** مزوّد الثيم — يقرأ `SystemSettings` من `SettingsService` ويطبّق متغيرات CSS (`--cerami-*`, `--brand-*`) على `documentElement` مع دعم الوضع الداكن والنظام والتجاوز المحلي.
- **المحتوى/الأعضاء:** `ThemeProvider` (`children`, `ready`). دوال داخلية: `readLocalOverride` (مفتاح `ceramisys_theme_override`)، `systemPrefersDark`، `resolve`، `setPrimaryTokens` (يحسب hover/pressed/soft وألوان متباينة عبر `utils/shared/themeContrast`). `setMode` يكتب في قاعدة البيانات إن كان للمستخدم صلاحية `ui.settings.hub.update` وإلا يتجاوز محليًا.

### `src/contexts/useTheme.ts`
- **الغرض:** خطّاف الوصول إلى سياق الثيم مع خطأ عند الاستخدام خارج المزوّد.
- **المحتوى/الأعضاء:** `useTheme(): ThemeContextValue`.

### `src/contexts/DashboardRefreshContext.tsx`
- **الغرض:** سياق لإجبار تحديث لوحة التحكم (`refreshToken` + `refresh`).
- **المحتوى/الأعضاء:** `DashboardRefreshContextValue`, `DashboardRefreshContext`, `useDashboardRefresh()` (قد يرجع `null`).

### `src/contexts/LayoutContext.ts`
- **الغرض:** سياق بسيط يمرّر `currentUser` للتخطيط/المكونات العميقة.
- **المحتوى/الأعضاء:** `LayoutContext` بقيمة `{ currentUser: User | null }`.

---

## الأدوات المساعدة (Utils)

### `src/utils/logger.ts`
- **الغرض:** مسجّل موحّد بمستويات وذاكرة تاريخ وسياقات؛ لا يطبع في الإنتاج (نقطة ربط لمراقبة خارجية).
- **المحتوى/الأعضاء:** `LogLevel`, `LogEntry`, `class Logger` (`debug/info/warn/error`, `getHistory`, `clearHistory`, `getSlowQueryStats` → `null`)، `logger` (نسخة جاهزة)، `createLogger`, `withErrorHandling`, `withPerformanceMonitoring`.

### `src/utils/money.ts`
- **الغرض:** حسابات مالية دقيقة بوحدة القروش (piastres) — ترحيل migration 213؛ كل العمليات بوحدات كبرى (جنيه) في الواجهة وتُخزَّن صحيحة في القاعدة.
- **المحتوى/الأعضاء:** `MAJOR_UNITS_PER_MINOR = 100`, `toPiastres`, `fromPiastres`, `roundMoney`, `addMoney`, `subMoney`, `mulMoney`, `pctOf`, `allocateMoney` (توزيع متناسب مع استيعاب الباقي في آخر حصة)، `formatMoney` (ar-EG بخانتين عشريتين)، `unscaleMoneyRow` (يقسم حقول snake/camel مرة واحدة فقط).

### `src/utils/navigation/resolvePageTitle.ts`
- **الغرض:** حلّ عنوان الصفحة ومسار التنقل (breadcrumbs) من هيكل القوائم المتاحة للمستخدم، بما فيها مسارات التفاصيل (`/customers/:id`…).
- **المحتوى/الأعضاء:** `PageBreadcrumb`, `ResolvedPageTitle`, `resolveNavigationBreadcrumbs`, `resolvePageTitle`، `DETAIL_ROUTES` داخلي.

### `src/utils/products/ceramicMath.ts`
- **الغرض:** حسابات منتجات السيراميك: كراتين↔م²، قطع، أسعار، إجمالي سطر، تنسيق عملة/مساحة.
- **المحتوى/الأعضاء:** `class CeramicMath` بميثودات static: `calculateBoxes`, `calculateMetersFromBoxes`, `calculatePiecesFromBoxes`, `calculateBoxPrice`, `calculateMeterPrice`, `calculateLineTotal`, `formatCurrency`, `formatM2`.

### `src/utils/products/productUnits.ts`
- **الغرض:** تسميات وحدات المنتجات وسلوكها في الفواتير والمخزون.
- **المحتوى/الأعضاء:** `UNIT_LABELS` (Record لـ `UnitType`)، `getProductUnitLabel` (السيراميك افتراضيًا م²/متر طولي)، `formatProductQuantity`, `getStockQuantityLabel`, `isServiceProduct`.

### `src/utils/products/uom.ts`
- **الغرض:** barrel لطبقة تحويل وحدات القياس.
- **المحتوى/الأعضاء:** يعيد تصدير `AREA_UNITS`, `LENGTH_UNITS`, `UomProduct`, `normalizeUom`, `getUomLabel`, `conversionFactor`, `convertQuantity`, `toBaseQuantity`, `fromBaseQuantity`, `isSameUom`, `baseQuantityAsM2`, `getSellableUnits`, `pricePerUnit`, `basePriceFromUnitPrice`, `isWholeUnit`.

### `src/utils/products/uom_part01.ts`
- **الغرض:** أساس طبقة UoM: نوع المنتج، تسميات الوحدات، `AREA_UNITS`/`LENGTH_UNITS`، التطبيع `normalizeUom` (مع وحدات `CUSTOM:<name>`) و`getUomLabel`.
- **المحتوى/الأعضاء:** `UomProduct`, `UNIT_LABELS`, `AREA_UNITS`, `LENGTH_UNITS`, `normalizeUom`, `getUomLabel`.

### `src/utils/products/uom_part02.ts`
- **الغرض:** حساب معامل التحويل بين وحدتين لمنتج معيّن (BOX عبر `metersPerBox`/`piecesPerBox`، M2↔PIECE، KG↔TON).
- **المحتوى/الأعضاء:** `conversionFactor(from, to, product): number | null`.

### `src/utils/products/uom_part03.ts`
- **الغرض:** تحويل الكميات فعليًا ورمي خطأ عربي واضح عند استحالة التحويل، مع دوال للقاعدة/العرض والمساحة.
- **المحتوى/الأعضاء:** `convertQuantity`, `toBaseQuantity`, `fromBaseQuantity`, `isSameUom`, `baseQuantityAsM2`, `baseQuantityAsM2Box`.

### `src/utils/products/uom_part04.ts`
- **الغرض:** الوحدات القابلة للبيع لمنتج ما (الأساسية أولًا ثم sellUnit ثم القابلة للاشتقاق) وأسعار الوحدة.
- **المحتوى/الأعضاء:** `getSellableUnits`, `pricePerUnit`.

### `src/utils/products/uom_part05.ts`
- **الغرض:** تحويل سعر الوحدة إلى سعر الوحدة الأساسية والعكس، وكشف الوحدات الصحيحة فقط (صناديق/قطع/طقم/خدمة/مخصصة).
- **المحتوى/الأعضاء:** `basePriceFromUnitPrice`, `isWholeUnit`.

### `src/utils/shared/date.ts`
- **الغرض:** أدوات تاريخ محلية (بدون UTC drift).
- **المحتوى/الأعضاء:** `localDateString(date?)` → `YYYY-MM-DD`, `addLocalDays(date, days)`.

### `src/utils/shared/externalLinks.ts`
- **الغرض:** دعم الميزات الاختيارية المتصلة بالإنترنت (مشاركة واتساب) مع نسخ الرسالة للحافظة عند انقطاع الاتصال — التطبيق يعمل offline بالكامل.
- **المحتوى/الأعضاء:** `isOnline`, `openExternalShare`, `buildWhatsAppUrl`, `normalizeWhatsAppPhone` (تحويل الأرقام المصرية إلى بادئة 20)، `openWhatsAppChat` (مع معالجة الرسائل الطويلة >5000 حرف).

### `src/utils/shared/printWindow.ts`
- **الغرض:** كتابة HTML في نافذة طباعة جديدة وتشغيل `print()` عند التحميل أو بعد مهلة 1 ثانية.
- **المحتوى/الأعضاء:** `writeAndPrintWindow(printWindow, html, closeAfterPrint)`.

### `src/utils/shared/themeContrast.ts`
- **الغرض:** حسابات تباين الألوان (WCAG) لاختيار ألوان نصوص مقروءة على الأسطح المخصصة.
- **المحتوى/الأعضاء:** `normalizeHexColor`, `contrastRatio`, `accessibleForeground`, `mixHexColors`, `readableColorOnSurface` (بحث ثنائي لخلط يحقق نسبة 4.5).

### `src/utils/export/exportTypes.ts`
- **الغرض:** نوع عمود التصدير المشترك بدون اعتماديات (لتجنّب دورات الاستيراد).
- **المحتوى/الأعضاء:** `ExportColumn` (`key`, `label`, `type?`, `align?`).

### `src/utils/export/csv.ts`
- **الغرض:** تهريب خلية CSV وتحييد صيغ الصيغ (formulas) لمنع تنفيذ الخلايا عند فتحها في Excel/Sheets.
- **المحتوى/الأعضاء:** `csvCell(value)` — يسبق النص بعلامة اقتباس `'` إذا بدأ بـ `= + - @` أو محرف تحكم، ويضاعف علامات الاقتباس.

### `src/utils/export/excelExportWorkbook.ts`
- **الغرض:** بناء ملف XLSX حقيقي (RTL) عبر `xlsx` — يعمل في الـ Web Worker (`excelExport.worker`).
- **المحتوى/الأعضاء:** `ExcelWorkbookRequest` (`title`, `subtitle`, `columns`, `rows`, `companyName`, `kpis?`)، `createExcelWorkbook(request): Uint8Array` — صفوف meta (اسم الشركة/العنوان/مؤشرات) + ترويسة + بيانات، أعمدة RTL و`!cols`.

### `src/utils/export/export.ts`
- **الغرض:** محرك التصدير الموحّد: HTML للطباعة/PDF (مع ترويسة الشركة وبطاقات KPI)، طباعة عبر iframe خفي، حفظ PDF عبر جسر Electron أو حوار الطباعة، وتصدير Excel عبر Worker مع fallback متزامن.
- **المحتوى/الأعضاء:** `ExportColumn` (إعادة تصدير)، `ExportOptions` (يشمل `permission` إلزامية)، `buildExportHtml`, `printHtml`, `downloadPdf`, `exportToExcel` (يفرض الصلاحية عبر `ExportService.assertAllowed`، ينشئ `workers/excelExport.worker.ts`، مهلة 120ث)، `exportToPdf`. دوال داخلية: `safeName`, `assertExportPermission`.

### `src/utils/customers/customerStatementSharing.ts`
- **الغرض:** barrel لمشاركة كشف حساب العميل (تصدير + واتساب).
- **المحتوى/الأعضاء:** يعيد تصدير `getCustomerStatementExportOptions` (part01) و`shareCustomerStatementOnWhatsApp` (part03).

### `src/utils/customers/customerStatementSharing_part01.ts`
- **الغرض:** بناء `ExportOptions` لكشف الحساب الكامل (أعمدة/صفوف/KPIs) وتسميات أنواع العملاء.
- **المحتوى/الأعضاء:** `CustomerStatement` (نوع من `CustomerService.getCustomerStatement`)، `customerTypeLabels` (قطاعي/مقاول/جملة/مهندس)، `formatCurrency`, `getTotals`, `getCustomerStatementExportOptions` (permission `customers.export`).

### `src/utils/customers/customerStatementSharing_part02.ts`
- **الغرض:** بناء رسالة نصية عربية لكشف الحساب مناسبة لإرسالها عبر واتساب.
- **المحتوى/الأعضاء:** `buildCustomerStatementWhatsAppMessage(statement)` — بيانات العميل + KPIs + تفصيل الحركات.

### `src/utils/customers/customerStatementSharing_part03.ts`
- **الغرض:** تدفق المشاركة الكامل: توليد PDF لكشف الحساب + فتح واتساب بالرسالة (مع نسخ النص للرسائل الطويلة) + تنبيهات المستخدم بنتيجة كل خطوة.
- **المحتوى/الأعضاء:** `shareCustomerStatementOnWhatsApp(statement): Promise<void>`.

---

## المزامنة (Sync)

### `src/sync/index.ts`
- **الغرض:** barrel يصدّر كل أنواع `types/sync` وكل خدمات/مستودعات المزامنة.
- **المحتوى/الأعضاء:** `export *` من `types/sync/index.ts` و28 ملف sync (Outbox/Inbox/Idempotency/Cursor/EventSerializer/EventValidator/ConflictResolver/SyncPolicy/BranchRegistry/DeviceRegistry/SyncAuditLogger/SyncHealthMonitor/RetryScheduler/Pull/Push/SyncEngine/SyncWorker/ElectronSyncTransport/AccountLink/PendingChange/SyncChangeApproval/SyncStatus/MasterData/BusinessRecord/Sales/Purchase/Inventory).

### `src/sync/SyncEngine.ts`
- **الغرض:** المحرك المركزي لدورة المزامنة: استرجاع الوارد → تطبيق → جلب من النقل → دفع الصادر → تحديث الصحة.
- **المحتوى/الأعضاء:** `class SyncEngine` بأعضاء عامة: `outbox`, `inbox`, `cursor`, `push`, `pull`, `health`, `retry`, `audit`, `dispatcher`. دوال: `setTransport`, `enqueueChange`, `runCycle` (يمنع التداخل عبر `activeCycle`)، `executeCycle` (recoverInFlight → applyIncoming للمعلّق → transport.pullEvents → applyIncoming → cursor → pushOnce → health/touchBranch)، `pullOnceRemote`, `status`.

### `src/sync/SyncWorker.ts`
- **الغرض:** عامل خلفية يشغّل `runCycle` على فاصل زمني (افتراضي 30 ثانية، ≥1000ms) مع منع التداخل وإيقاف نظيف.
- **المحتوى/الأعضاء:** `SyncEngineLike`, `class SyncWorker` — `start`, `stop`, `stopAndWait`, `tick`, `isRunning`.

### `src/sync/CursorManager.ts`
- **الغرض:** حفظ/قراءة/reset مؤشر السحب لكل scope في جدول `sync_cursor`.
- **المحتوى/الأعضاء:** `class CursorManager` — `getCursor`, `setCursor`, `resetCursor`.

### `src/sync/EventSerializer.ts`
- **الغرض:** تسلسل/فك تسلسل أحداث المزامنة ودفعاتها JSON.
- **المحتوى/الأعضاء:** `class EventSerializer` — `serialize`, `deserialize`, `serializeBatch`, `deserializeBatch` (ترمي خطأ عند عدم صلاحية الشكل).

### `src/sync/EventValidator.ts`
- **الغرض:** تحقق صارم من بنية `SyncEvent` قبل التطبيق: الحقول الإلزامية، أنواع العمليات، إصدارات صحيحة، تسلسل JSON، عمق ≤40، ومنع الحقول الحساسة (password/token/secret…).
- **المحتوى/الأعضاء:** `class EventValidator` — `validate` → `{valid, errors}`, `assertValid`. ثوابت داخلية: `VALID_OPS`, `VALID_SCOPES`, `SENSITIVE_FIELD`.

### `src/sync/IdempotencyService.ts`
- **غرض:** طبقة رفيعة لمنع تكرار الأحداث الواردة عبر `InboxRepository`.
- **المحتوى/الأعضاء:** `class IdempotencyService` — `isNew(eventId)`, `recordReceived(event)`.

### `src/sync/SyncAuditLogger.ts`
- **الغرض:** سجل تدقيق للمزامنة في جدول `sync_audit_log` (معرّف `sal_*`).
- **المحتوى/الأعضاء:** `class SyncAuditLogger` — `log({tenantId, branchId, deviceId, action, details})`, `list(limit=100)`.

### `src/sync/SyncHealthMonitor.ts`
- **الغرض:** تتبّع حالة الاتصال/آخر نجاح/آخر خطأ وعمق الطوابير لإنتاج `SyncStatus`.
- **المحتوى/الأعضاء:** `class SyncHealthMonitor` — `setConnected`, `setLastSuccess`, `setLastError`, `status()` (متصل + عدّادات pending/failed/deadLetter من الـ Outbox).

### `src/sync/RetryScheduler.ts`
- **الغرض:** جدولة إعادة المحاولة بتراجع أسّي مع jitter وتصنيف الأخطاء العابرة (شبكة/timeout/429/5xx).
- **المحتوى/الأعضاء:** `class RetryScheduler` — `nextDelayMs(attempts)`, `nextRetryAt(attempts)`, `isTransientError(error)` (baseMs=1000, maxMs=60000).

### `src/sync/ElectronSyncTransport.ts`
- **الغرض:** تطبيق `SyncTransport` فوق جسر IPC في Electron (`window.ceramisys` sync bridge).
- **المحتوى/الأعضاء:** `SyncIpcBridge` (`pushEvents`, `pullEvents`)، `class ElectronSyncTransport` — `pushEvents`, `pullEvents` يفوّضان للجسر.

### `src/sync/InboxRepository.ts`
- **الغرض:** مستودع الأحداث الواردة `sync_inbox` مع منع التكرار الصارم (ON CONFLICT + مقارنة محتوى الحدث لكشف تصادم eventId).
- **المحتوى/الأعضاء:** `class InboxRepository` — `recordReceived` (يرجع bool، يرمي عند تصادم المحتوى)، `markApplied`, `markDuplicate`, `markFailed`, `prepareForRetry`, `markRejected`, `isDuplicate`, `getStatus`, `listPending(1..500)`, `countReceived`.

### `src/sync/OutboxRepository.ts`
- **الغرض:** طابور الأحداث الصادرة `sync_outbox` مع حالات PENDING/IN_FLIGHT/FAILED/DEAD_LETTER/ACKNOWLEDGED، استرجاع IN_FLIGHT، وتصفية ذكية في `listPending` (سياسات `sync_entity_policies`، ترتيب sync_policy أولًا، تخطّي الأحداث الأقدم غير المؤكدة لنفس الكيان، وتأجيل المنتجات حتى اكتمال آبائها category/brand).
- **المحتوى/الأعضاء:** `class OutboxRepository` — `enqueue` (uuid eventId)، `listPending(limit, policyGate)`، `markInFlight`, `recoverInFlight`, `markAcknowledged`, `markFailed`, `markDeadLetter`, `countPending/countFailed/countDeadLetter`, `getById`, `purgeAcknowledged(days=30)`.

### `src/sync/DeviceRegistry.ts`
- **الغرض:** سجل الأجهزة `sync_devices` (تسجيل/تحقق/تعطيل/إلغاء/لمس آخر ظهور) مع أكواد التفعيل.
- **المحتوى/الأعضاء:** `class DeviceRegistry` — `register`, `verify`, `revoke`, `disable`, `touch`, `list(branchId?)`.

### `src/sync/BranchRegistry.ts`
- **الغرض:** سجل الفروع `sync_branches` مع إصدار/استهلاك رموز تفعيل تربط الجهاز بفرع (وتنشئ سجل الجهاز تلقائيًا).
- **المحتوى/الأعضاء:** `class BranchRegistry` — `register`, `issueActivationCode` (`BR-XXXXXXXX`)، `consumeActivationCode` (يربط الجهاز بالفرع وينشئه)، `verify`, `revoke`, `disable`, `touch`, `list(tenantId?)`, `get`.

### `src/sync/ConflictResolver.ts`
- **الغرض:** منطق مقارنة/حل التعارضات الحقولية مع سياسات لكل نوع كيان وتسميات عربية للحقول.
- **المحتوى/الأعضاء:** أنواع `ConflictPolicy`, `FieldDiffStatus`, `MergeStrategy`, `FieldDiff`, `AutoResolution`؛ `class ConflictResolver` — `policyFor` (SOURCE_WINS: price_list/brand/category/settings؛ APPEND_ONLY: فواتير/مدفوعات/حركات)، `detectConcurrentEdit`, `resolveVersion`, `compareFields` (CONFLICT→REMOTE_ONLY→LOCAL_ONLY→SAME)، `autoResolve` (FIELD_MERGE للحقول الآمنة مثل notes/address فقط)، `buildMergedPayload`؛ خرائط داخلية `FIELD_LABELS`, `LAST_WRITE_WINS_FIELDS`, `SKIP_FIELDS`, `SOURCE_WINS_TYPES`, `APPEND_ONLY_TYPES`.

### `src/sync/PullChangesService.ts`
- **الغرض:** تطبيق الأحداث الواردة: تحقق ← تسجيل في الـ Inbox ← إرسال للمعالج المسجّل لكل `entityType` ← تعليم APPLIED/FAILED/DUPLICATE.
- **المحتوى/الأعضاء:** `class EventDispatcher` (`register`, `dispatch` — المعالج قد يرجع `void|'DEFERRED'|Promise`)، `class PullChangesService` — `applyIncoming(events)` → `{applied, duplicates, failed}` مع منع معالجة الحدث نفسه بالتوازي.

### `src/sync/PushChangesService.ts`
- **الغرض:** دفع دفعة من الـ Outbox عبر `SyncTransport` مع تحقق صارم من الاستجابة (acknowledged/failed بدون تكرار أو معرفات مجهولة)، ووسم DEAD_LETTER بعد `maxAttempts=8` أو للأخطاء غير العابرة.
- **المحتوى/الأعضاء:** `class PushChangesService` — `setTransport`, `pushOnce(batchSize 1..500)` → `{sent, failed}`، `failEvent` داخلي.

### `src/sync/SyncStatusService.ts`
- **الغرض:** تجميع قراءة فقط لحالة المزامنة الكاملة: الاتصال، آخر نجاح/خطأ، عدّادات الطوابير والتعارضات والاعتمادات المعلّقة، وصف لكل فرع (online خلال 5 دقائق من آخر اتصال).
- **المحتوى/الأعضاء:** `class SyncStatusService` — `overview(runtime?)` → `SyncOverview`، `branches()` → `SyncBranchStatus[]`، `touchBranch(branchId, syncedAt?)`. يعتمد على `SyncPolicyService`, `AccountLinkService`, `PendingChangeService`.

### `src/sync/SyncChangeApprovalService.ts`
- **الغرض:** قرارات المالك (ADMIN/SUPER_ADMIN فقط) على التعديلات المعلّقة: الاعتماد يعيد التقاط السجل إلى الـ outbox متجاوزًا البوابة مرة واحدة، والرفض يترك البيانات ويرسل ملاحظة للطالب.
- **المحتوى/الأعضاء:** `class SyncChangeApprovalService` — `listPending`, `list`, `get`, `decide(id, approved, {notes, recipients})` (معاملة + سجل audit + إشعار)، `cancel`, `sendNotes`؛ `requireOwner` داخلي.

### `src/sync/SyncPolicyService.ts`
- **الغرض:** سياسات المزامنة لكل نوع كيان (enabled/outbound/inbound/dataScope/managedByHeadOffice) مع هوية الجهاز الثابتة، بوابات الإرسال/الاستقبال، تسجيل/تطبيق سياسات `sync_policy` الواردة، وتخزين السجلات التجارية الواردة في `sync_remote_records`/`sync_remote_entities`.
- **المحتوى/الأعضاء:** `SUPPORTED_SYNC_ENTITIES` (23 نوعًا مع تسميات عربية + تعليق حدود التغطية: لا HR/قيود/منصة)، `SupportedSyncEntity`, `SyncEntityPolicy`، `SUPPORTED_SYNC_ENTITY_TYPES`؛ `class SyncPolicyService` — `configureIdentity`, `isPolicyAuthority`, `currentIdentity`, `pushGate`، `list`, `get`, `update` (ينشر حدث sync_policy للـ outbox)، `canSend`, `canReceive`, `publishUnmanagedPolicies`, `registerHandler`, `recordRemote`، `applyRemote` داخلي، `assertSupported` داخلي.

### `src/sync/PendingChangeService.ts`
- **الغرض:** تجميع تعديلات الفروع/الحسابات المرتبطة بانتظار موافقة المالك (`sync_pending_changes`) مع سياسة AUTO/ALWAYS/OFF في `system_settings`، إشعارات المالك، وملاحظات القرار (`sync_change_notes`).
- **المحتوى/الأعضاء:** `CHANGE_APPROVAL_MODE_KEY`, `ChangeApprovalMode`، `class PendingChangeService` — `getMode`, `setMode` (للمالك فقط)، `isApprovalRequired` (لا تشتغل للمالك/AUTO فقط عند وجود مزامنة فعلية)، `currentLink`, `stage` (داخل معاملة العمل؛ يحدّث الطلب المعلّق الموجود)، `list`, `get`, `findPendingFor`, `countPending`, `markStatus`, `listNotes`, `addNotes`, `notifyDecision`؛ `entityLabel`, `operationLabel`, `describeChange`.

### `src/sync/AccountLinkService.ts`
- **الغرض:** ربط هذا التثبيت بحساب شركة آخر: إصدار كود `LK-` أو API token مع كلمة سر bcrypt، تحقق الجهة الأخرى، حالة PENDING/ACTIVE/DISABLED/REVOKED، صلاحيات لكل رابط (`sync_link_permissions`)، وخيار `requiresApproval`.
- **المحتوى/الأعضاء:** `SYNC_CENTER_MANAGE` (`ui.admin.sync_center.manage`)، `class AccountLinkService` — `issue`, `linkWithCode`, `linkWithApiToken`, `verifyAndActivate`, `list`, `listActive`, `get`, `getSummary`, `revoke`, `disable`, `enable`, `setRequiresApproval`, `setPermissions`, `getPermissions`, `canPerform`, `findActiveLinkForDevice`, `touch`؛ `requireManager` داخلي.

### `src/sync/MasterDataSyncService.ts`
- **الغرض:** مزامنة البيانات الرئيسية (9 أنواع: categories/brands/products/customers/suppliers/operational fields/field options/field values/grade options) مع نسخ bootstrap دفعي (`sync_bootstrap_progress`)، إدارة الإصدارات (`sync_entity_versions`)، وتسجيل التعارضات في `sync_conflicts` مع حلّ KEEP_LOCAL/ACCEPT_REMOTE/AUTO_MERGED.
- **المحتوى/الأعضاء:** `MasterEntityType`, `SyncConflict`, `ResolvedConflict`, `SyncBootstrapEntityProgress`, `SyncBootstrapProgress`؛ `class MasterDataSyncService` — `configure`, `isConfigured`، `getBootstrapProgress`, `publishExistingDataBatch`، `capture` (يحترم سياسات الإرسال وبوابة الاعتماد)، `captureApproved`، `registerHandlers`، `listOpenConflicts`, `listResolvedConflicts`, `resolveConflict`، `applyIncoming` (يتحقق من الإصدار/tenant/dataScope ويسجّل تعارضًا عند التعارض)، ودوال داخلية: `writeIncomingRow` (upsert آمن مع فحص المراجع قبل الحذف أو تعطيل is_active)، `recordConflict`, `logResolution`, `nextLocalVersion`, `getVersion`, `saveVersion`, `availableColumns`, `readEntity`؛ خرائط `ENTITY_SPECS`, `BOOTSTRAP_ORDER`.

### `src/sync/BusinessRecordSyncService.ts`
- **الغرض:** مزامنة المستندات التجارية (8 أنواع: فواتير/مرتجعات بيع وشراء، دفعات عميل/مورد، تحويل مخزون، مصروف) بلقطات header+lines كاملة (`{record:{header,lines}}`) مع تحقق صارم من الحقول والأحجام (≤1MB، ≤10000 سطر) وتخزينها الواردة في `sync_remote_*` دون تطبيق محلي.
- **المحتوى/الأعضاء:** `BusinessRecordType`, `RecordSpec`؛ `class BusinessRecordSyncService` — `capture`, `captureApproved`, `registerHandler`, `listRemoteRecords`، `applyIncoming`, `readSnapshot`, `availableColumns`, `assertSnapshotFields`؛ `RECORD_SPECS` يحدد الجداول والأعمدة المسموحة لكل نوع.

### `src/sync/SalesSyncService.ts`
- **الغرض:** خدمة مجال المبيعات فوق `SyncEngine`: enqueue لأحداث sales_invoice/sales_return/customer_payment/sales_order/sales_quotation/held_order وتطبيقها الوارد بكتابة upsert ديناميكية (مع تحويل حقول المال إلى قروش ×100) وتسجيل `sync_applied_events`.
- **المحتوى/الأعضاء:** `class SalesSyncService` — `init`، `enqueueInvoice`, `enqueueReturn`, `enqueueCustomerPayment`, `enqueueSalesOrder`، `applySalesInvoice/Return/CustomerPayment/SalesOrder/SalesQuotation/HeldOrder`، `getSyncStatus`, `runCycle`, `countPending`؛ نسخة جاهزة `salesSyncService`. ملاحظة: `enqueueSalesQuotation`/`enqueueHeldOrder` غير موجودتين رغم تسجيل المعالجَين (الـ enqueue متاح عبر `engine.enqueueChange`).

### `src/sync/PurchaseSyncService.ts`
- **الغرض:** نفس نمط SalesSyncService لمجال المشتريات: purchase_invoice/purchase_return/supplier_payment/purchase_order مع upsert ديناميكي وتسجيل `sync_applied_events`.
- **المحتوى/الأعضاء:** `class PurchaseSyncService` — `init`, `enqueuePurchaseInvoice`, `enqueuePurchaseReturn`, `enqueueSupplierPayment`, `enqueuePurchaseOrder`, `apply*` الأربعة، `getSyncStatus`, `runCycle`, `countPending`؛ نسخة جاهزة `purchaseSyncService`.

### `src/sync/InventorySyncService.ts`
- **الغرض:** نفس النمط لمجال المخزون: stock_transfer/inventory_transaction/stock_adjustment.
- **المحتوى/الأعضاء:** `class InventorySyncService` — `init`, `enqueueStockTransfer`, `enqueueInventoryTransaction`, `enqueueStockAdjustment`, `apply*` الثلاثة، `getSyncStatus`, `runCycle`, `countPending`؛ نسخة جاهزة `inventorySyncService`.

---

## العمال (Workers)

### `src/workers/excelExport.worker.ts`
- **الغرض:** Web Worker يبني ملف Excel (xlsx) في خيط خلفي عبر `createExcelWorkbook` ويرسل البايتات بنقل (transfer) لتفادي نسخ الذاكرة.
- **المحتوى/الأعضاء:** `self.onmessage` يستقبل `ExcelWorkbookRequest` ويرد `{bytes}` أو `{error}`؛ يُنشأ من `utils/export/export.ts` عبر `new Worker(new URL(...))`.

### `src/workers/spreadsheetImport.worker.ts`
- **الغرض:** Web Worker يحلّل ملف جداول (Excel/CSV) الوارد عبر `parseSpreadsheetBuffer` من `SpreadsheetImportService` ويرسل النتيجة مع نقل الـ ArrayBuffer.
- **المحتوى/الأعضاء:** `self.onmessage` يستقبل `{buffer, fileName}` ويرد بالنتيجة أو `{error}`.

---

## الأخطاء (Errors)

### `src/errors/appError.ts`
- **الغرض:** خطأ تطبيقي موحّد بكود قابل لإعادة المحاولة + محوّل `toAppError` لأي قيمة مجهولة.
- **المحتوى/الأعضاء:** `class AppError extends Error` (`code` افتراضي `UNEXPECTED_ERROR`, `retryable`)، `toAppError(value, fallbackCode, fallbackMessage)` — يحافظ على AppError، ويلتقط code/retryable من Error أو كائن عادي مع `cause`.

---

## نقطة الدخول (App / main / shims / styles)

### `src/main.tsx`
- **الغرض:** نقطة دخول React: مراقبة الأداء، التقاط أخطاء النافذة/الوعود إلى `window.ceramisys.diagnostics`، وتثبيت `createRoot` على `#root`.
- **المحتوى/الأعضاء:** `startRendererPerformanceMonitoring`, `reportSlowReactRender`, `reportRendererError`، مستمعا `window 'error'` و`'unhandledrejection'`، `React.StrictMode` + `Profiler` (dev فقط) حول `<App>`، استيراد `index.css`.

### `src/app/App.tsx`
- **الغرض:** جذر التطبيق — ينسّق التهيئة (قاعدة البيانات/الجلسة)، خدمات الترخيص والتكوين المركزية، أول تشغيل/معالج الإعداد، شاشة الدخول، والحالات الوسيطة (تحميل/خطأ/حظر ترخيص).
- **المحتوى/الأعضاء:** `App` (مُصدَّر `memo`). يعتمد على `useAppStartup`, `useAppSession`, `DatabaseManager`, `AuthService`, `CentralLicenseService`, `CentralConfigApplier`, `CentralEstablishmentService`, `SettingsService`, `AppConfigService`, `config/setupLifecycle` (`shouldShowFirstRunSetup`, `BYPASS_*`)، `APP_VERSION`, `AppRouter`, `LoginPage`, lazy `PlatformStaffInviteAcceptPage`/`PlatformOwnerSetupPage`/`SetupWizard`، `ForcePasswordChangeModal`, `ThemeProvider`, `ToastProvider`, `ErrorBoundary`, `UpdateNotification`, `CentralRestoreNotification`, `DatabasePersistenceStatus`، وخدمات `securityService/auditLogger/performanceMonitor/localCache/systemHealth/CentralTelemetryService`. كشف مسارات ما قبل المصادقة عبر `location.hash` (`#/accept-staff-invite/<token>`, `#/platform-owner-setup`). فحص الترخيص الدوري **معطّل** (`_SKIP_LICENSE_CHECK = true`)، وفحص إعداد «hasBusinessData» يفحص ~40 جدول أعمال. ملف `App.tsx.bak` موجود كنسخة احتياطية قديمة (خارج النطاق).

### `src/shims/crypto.ts`
- **الغرض:** بديل متصفح لسطح `crypto.randomBytes` الصغير الذي يحتاجه bcryptjs 2.x.
- **المحتوى/الأعضاء:** `randomBytes(length): Uint8Array` عبر `crypto.getRandomValues`.

### `src/shims/iterator-helpers.ts`
- **الغرض:** polyfill لأسلوب Iterator Helpers (`Iterator.prototype.map/filter/take/…`) لنسخ Chromium القديمة (Electron 22 / Windows 7 ia32) لأن pdfjs-dist يفحص `Iterator.prototype.join` عند التحميل ويسقط بدونها.
- **المحتوى/الأعضاء:** `installIteratorHelpers()` تُستدعى عند الاستيراد — تُعرّف `globalThis.Iterator` مع `map`, `filter`, `take`, `drop`, `flatMap`, `reduce`, `toArray`, `forEach`, `some`, `every`, `find`, `join`, و`Iterator.from`.

### `src/index.css`
- **الغرض:** ورقة الأنماط العامة — (سطر واحد في التوثيق) تستورد خطوط Cairo بأوزان 400/600/700/800 من `@fontsource` ثم `styles/design-tokens.css` وتتضمن بقية أنماط التطبيق (~1900 سطر).

### `src/styles/design-tokens.css`
- **الغرض:** نظام الرموز اللونية/المسافات/الخطوط الموحّد (`:root` فاتح و`.dark` داكن) الذي تستهلكه كل المكونات وتُحدَّث قيمه runtime من `ThemeProvider`.
- **المحتوى/الأعضاء:** متغيرات `--cerami-*` (primary/surface/canvas/text/border/status success/danger/warning/chart/tooltip/scrollbar/shadow/focus-ring/motion)، رموز `--ui-*` (spacing, control heights, font sizes, radii, transition)، `color-scheme`، ومتغيرات الوضع الداكن الكاملة.

---

## ملاحظات تغطية

- جميع ملفات `src/router/` (14)، `src/layouts/` (1)، `src/contexts/` (5)، `src/utils/` (23)، `src/sync/` (28)، `src/workers/` (2)، `src/errors/` (1)، `src/app/App.tsx`، `src/main.tsx`، `src/shims/` (2)، `src/index.css`، `src/styles/design-tokens.css` موثّقة أعلاه.
- `PlatformRouteGuard` يعيش في `src/pages/platform/PlatformRoutes.tsx` (خارج النطاق لكنه وُصف في قسم الحُرّاس لأنه جزء من آلية التوجيه `/platform/*`).
- `src/app/App.tsx.bak` ملف احتياطي قديم، غير موثّق كملف فعّال.
- ملفات `*_partNN.ts` هي تقسيمات داخلية لأحجام الملفات الكبيرة؛ يستهلكها الـ barrel المقابل.
- ملاحظة دقيقة: في `SalesSyncService` يُسجَّل معالجَا `sales_quotation` و`held_order` لكن لا توجد دوال `enqueue*` مخصصة لهما (الإدراج متاح عبر `engine.enqueueChange` مباشرة).
- ملاحظة دقيقة: في `PurchaseSyncService` و`InventorySyncService` لا تُحوَّل حقول المال إلى قروش عند التطبيق الوارد (بخلاف `SalesSyncService`).
- `ConflictResolver.ts` موجود ويُصدَّر من `sync/index.ts` لكن لا يظهر استدعاؤه داخل `MasterDataSyncService` (الذي يسجّل التعارضات ويفوّض الحل للواجهة).
- `SyncWorker` هو عامل زمني داخل الخيط الرئيسي (ليست Web Worker)؛عمال الويب الحقيقيون فقط في `src/workers/`.
- `logger.getSlowQueryStats()` يعيد `null` دائمًا (placeholder).
- `DashboardRefreshContext` لا يوجد مزوّد له داخل هذا النطاق — يُنشأ السياق ويُستهلك عبر `useDashboardRefresh` فقط.
- في `App.tsx` فحص الترخيص الدوري معطّل عمدًا (`_SKIP_LICENSE_CHECK = true`) وتعليق عربي يشير إلى أن «الترخيص مدعوم Always».
- `resolvePageTitle`/`canonicalNavigationPath` يعتمدان على مسارات `NavigationService` الفعلية، لذا العناوين تعتمد على صلاحيات المستخدم.
- `Money` helpers تفترض جنيه مصري (100 قرش) حسب migration 213.
- `xlsx` تُستخدم فقط داخل worker التصدير؛ و`csvCell` محايدة للصيغ.
- `spreadsheetImport.worker` يستدعي `parseSpreadsheetBuffer` من `services/infrastructure/data/SpreadsheetImportService` (خارج النطاق).
- جداول المزامنة المعنية: `sync_outbox`, `sync_inbox`, `sync_cursor`, `sync_audit_log`, `sync_devices`, `sync_branches`, `sync_entity_policies`, `sync_entity_versions`, `sync_bootstrap_progress`, `sync_conflicts`, `sync_pending_changes`, `sync_change_notes`, `sync_account_links`, `sync_link_permissions`, `sync_remote_records`, `sync_remote_entities`, `sync_applied_events`.
- لم يتم تعديل أي ملف مصدري؛ أُنشئ هذا الملف فقط.
</content>
</invoke>
