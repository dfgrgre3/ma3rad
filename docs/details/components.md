# توثيق مكوّنات الواجهة — `src/components`

توثيق شامل لكل ملفات `.tsx` تحت `src/components/` (~123 ملفًا). ملاحظة عامة: عدة ملفات هي **إعادة تصدير (re-export)** لصفحات تحت `src/pages/` موثّقة في ملفات أخرى — أُدرجت بإيجاز.

---

## admin — إدارة النظام

### `src/components/admin/AuditLogView.tsx`
- **الغرض:** عرض سجل التدقيق الإداري.
- **Props/واجهة:** لا props.
- **ملاحظات:** مجرد `export { AuditLogPage as AuditLogView }` من `pages/admin/audit/AuditLogPage` — الصفحة نفسها موثقة في وثائق الصفحات.

### `src/components/admin/CompaniesPanel.tsx`
- **الغرض:** لوحة إدارة الكيانات القانونية/الشركات (إنشاء، تعديل، تعطيل) عبر `CompanyService` مع فرض الصلاحيات.
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** تستخدم `DataTable`، `usePermission`، `CentralLimitGuard`؛ تُخفى بالكامل بدون `companies.view`.

### `src/components/admin/UsersView.tsx`
- **الغرض:** عرض إدارة المستخدمين.
- **Props/واجهة:** لا props.
- **ملاحظات:** إعادة تصدير `UsersPage` من `pages/admin/users/UsersPage`.

---

## auth — المصادقة والتفعيل

### `src/components/auth/CentralActivationView.tsx`
- **الغرض:** شاشة تفعيل الترخيص المركزي: إدخال حساب/كلمة مرور/هاتف/كود تفعيل/اسم جهاز، ثم `CentralLicenseService.activate` وتوفير الحساب المحلي وتطبيق الإعدادات المركزية.
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** تُستخدم في مسار التفعيل الأولي؛ تعرض حالة التفعيل والإعدادات المُخزّنة.

### `src/components/auth/ForcePasswordChangeModal.tsx`
- **الغرض:** نافذة إجبارية لتغيير كلمة المرور ومفتاح الأمان عند `mustChangePassword` أو أول دخول.
- **Props/واجهة:** `user: User`، `onSuccess: (updatedUser: User) => void`.
- **ملاحظات:** خطوتان (`password` ثم `security-key`)؛ تدير التركيز داخل النافذة وتستدعي `AuthService`.

### `src/components/auth/PermissionGate.tsx`
- **الغرض:** حارس صلاحيات تصريحي لمحتوى JSX وأزرار محمية.
- **Props/واجهة:** `permission?`، `anyOf?`، `allOf?`، `deny?`، `user?`، `fallback?`، `children`؛ ومكوّن إضافي `GuardedButton` بنفس المنطق مع تحقق عند النقر عبر `PermissionService.hasRoleGrant`.
- **ملاحظات:** الإخفاء ليس تفويضًا — الخدمات تتحقق مجددًا عبر `PermissionService.require`.

---

## business — ملف النشاط

### `src/components/business/BusinessProfileSupportNotice.tsx`
- **الغرض:** لافتة توضح حالة دعم قدرات ملف النشاط التجاري المختار (منفذ/جزئي/غير منفذ).
- **Props/واجهة:** `businessType: string`.
- **ملاحظات:** يُستخدم داخل خطوات الإعداد وصفحات الإعدادات؛ مصدره `config/businessProfiles`.

---

## config — محرك الإعداد الديناميكي (DACE)

### `src/components/config/AppConfigRuntime.tsx`
- **الغرض:** مكوّن غير مرئي (mount واحد) يطبّق قواعد الإعدادات على DOM الحي: إخفاء عناصر بـ selectors واستبدال نصوص مرئية.
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** يتجاهل عناصر النموذج (`input`/`select`/...) وصفحة `/settings/app-configuration`؛ يعمل داخل نطاق `[data-app-config-scope]`.

### `src/components/config/ConfigField.tsx`
- **غرض:** غلاف حقل نموذج يطبّق إعدادات المحرك: إخفاء الحقل، إلزامه، وتعريض التسمية المُهيأة عبر data-attributes.
- **Props/واجهة:** `form: string`، `name: string`، `label?`، `className?`، `children`.
- **ملاحظات:** يسجّل الهدف في `appConfigTargets`؛ يُرجع `null` عند تعطيل الحقل.

### `src/components/config/ConfigSection.tsx`
- **الغرض:** قسم مسمّى داخل صفحة يمكن إخفاؤه/تسميته/إعادة ترتيبه من محرك الإعدادات.
- **Props/واجهة:** `id: string`، `page?: string` (افتراضيًا المسار الحالي)، `title?`، `className?`، `children`.
- **ملاحظات:** يُرجع `null` عند تعطيل القسم؛ بديل له قواعد selector للأقسام غير المُجهّزة.

### `src/components/config/ConfigText.tsx`
- **الغرض:** يعرض نصًا قابلاً للتعديل إداريًا مع fallback ثابت.
- **Props/واجهة:** `k: string` (مفتاح النص)، `fallback: string`، `as?: ElementType`، `className?`.
- **ملاحظات:** مبني على `useConfigText`.

### `src/components/config/ConfiguredActionButton.tsx`
- **الغرض:** زر تُشتق تسميته ووضوحه وحالته من محرك الإعدادات مع فحص الصلاحيات عبر `ActionRegistryService`.
- **Props/واجهة:** `actionId: string`، `fallbackLabel?`، `icon?`، `className?`، `disabled?`، `children?`، `onClick?`، `title?`.
- **ملاحظات:** يدعم `confirm` من تعريف الإجراء؛ يُخفي نفسه عند `!action.visible`.

---

## customers — العملاء

### `src/components/customers/CustomersView.tsx`
- **الغرض:** صفحة/عرض إدارة العملاء: قائمة، بحث، فلاتر حقول تشغيلية، تحصيل دفعات، كشف حساب وواتساب، CRUD كامل.
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** مغلّفة كبيرة تستخدم `DataTable`/`Modal`/`FilterToolbar` وخدمات `CustomerService` و`FinanceEnterpriseService`؛ صلاحيات دقيقة لكل إجراء.

---

## daily — العمليات اليومية (Modals)

### `src/components/daily/DailyModalShared.tsx`
- **الغرض:** أدوات مشتركة لنوافذ العمليات اليومية.
- **Props/واجهة:** `ModalShell` (`title`, `subtitle?`, `onClose`, `children`, `wide?`, `busy?`) — غلاف نافذة بـ focus-trap وEsc؛ و`LoadErrorNotice` (`message: string`) — تنبيه خطأ تحميل القوائم.
- **ملاحظات:** `ModalShell` بديل مبسّط عن `ui/Modal`؛ تصدّره `DailyModals.tsx`.

### `src/components/daily/DailyModals.tsx`
- **الغرض:** ملف تجميع (barrel) لإعادة تصدير مكوّنات النوافذ اليومية.
- **Props/واجهة:** لا props — يعيد تصدير `ModalShell` و`QuickSaleModal` و`QuickPurchaseModal` و`ExpenseModal` و`PaymentModal`/`DetailsModal`/`VoidModal` ونوع `PaymentTarget`.
- **ملاحظات:** لا منطق مستقل.

### `src/components/daily/ExpenseModal.tsx`
- **الغرض:** نافذة تسجيل مصروف يومي (فئة، مبلغ، بيان، مستلم، نوع دفع، خزينة).
- **Props/واجهة:** `initial?: any`، `onClose: () => void`، `onSaved: () => void`.
- **ملاحظات:** يستخدم `CashierService`، `useExpenseCategories`، `useRegisters`، و`ModalShell`.

### `src/components/daily/PaymentModals.tsx`
- **الغرض:** ثلاث نوافذ لتحصيل/دفع/إلغاء دفعات: `PaymentModal` (سداد فاتورة/شراء/عميل)، `DetailsModal` (تفاصيل دفعة)، `VoidModal` (إلغاء سند).
- **Props/واجهة:** `PaymentTarget = { kind: 'sale'|'purchase'|'customer'; id; branchId?; name; remaining }`؛ `PaymentModal({ target, onClose, onSaved })`.
- **ملاحظات:** يدعم أنواع الدفع والبنوك (`FinanceEnterpriseService`) والمفاتيح Idempotency.

### `src/components/daily/QuickPurchaseModal.tsx`
- **الغرض:** نافذة شراء سريع متعدد البنود (مورد، مخزن، فواتير أسطر، دفع).
- **Props/واجهة:** `onClose: () => void`، `onSaved: () => void`.
- **ملاحظات:** يستخدم `PurchaseService` و`ProductPicker` و`useLists`/`useSuppliers`؛ يحسب الإجمالي عبر `round2`.

### `src/components/daily/QuickSaleModal.tsx`
- **الغرض:** نافذة بيع سريع (POS مصغّر): عميل، مخزن، أسطر منتجات، خصم بضوابط سياسة الخصم، ضريبة افتراضية من الإعدادات، دفع.
- **Props/واجهة:** `onClose: () => void`، `onSaved: () => void`.
- **ملاحظات:** الأغنى من نوافذ daily — فحص أرصدة المخزون، اعتمادات `ApprovalService`، باركود، طباعة ضمنية عبر `onSaved`.

---

## dashboard — لوحة التحكم

### `src/components/dashboard/AttentionRequiredSection.tsx`
- **الغرض:** شريط "يتطلب انتباهك" بروابط للمخزون الناقص/النفد والديون المتأخرة.
- **Props/واجهة:** `metrics: DashboardMetrics`.
- **ملاحظات:** يُخفى تلقائيًا عند عدم وجود أي من المؤشرات الثلاثة.

### `src/components/dashboard/CategoryDistributionCard.tsx`
- **الغرض:** رسم دائري (Recharts Pie) لتوزيع المبيعات حسب الفئة.
- **Props/واجهة:** `categorySales: CategoryDistributionItem[]`.
- **ملاحظات:** بطاقة تحليلية ثابتة التنسيق.

### `src/components/dashboard/DashboardHeader.tsx`
- **غرض:** ترويسة لوحة التحكم: عنوان الصفحة، التاريخ، آخر مزامنة، زر تحديث، وعرض الفرع النشط.
- **Props/واجهة:** `today: string`، `currentUser: User | null`، `lastSyncedAt: Date | null`، `isRefreshing: boolean`، `onRefresh: () => void`.
- **ملاحظات:** يستخدم `PageHeader` و`BranchAccessService` و`PermissionService`.

### `src/components/dashboard/DashboardLoader.tsx`
- **الغرض:** مؤشر تحميل بسيط "جاري تحميل المؤشرات".
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** عنصر عرض فقط.

### `src/components/dashboard/DashboardSectionNav.tsx`
- **الغرض:** تنقّل أفقي بين أقسام لوحة التحكم (tabs) بنمط `win-pivot`.
- **Props/واجهة:** `activeTab`، `onSelectSection(sectionId)`، `sections?: DashboardSectionConfig[]` (افتراضي `SECTIONS_CONFIG`).
- **ملاحظات:** يدعم badges لكل قسم.

### `src/components/dashboard/DashboardView.tsx`
- **الغرض:** عرض لوحة التحكم الرئيسية.
- **Props/واجهة:** لا props.
- **ملاحظات:** إعادة تصدير `DashboardPage` من `pages/dashboard/dashboard/DashboardPage` — موثقة في وثائق الصفحات.

### `src/components/dashboard/OverviewKpiGrid.tsx`
- **الغرض:** شبكة مؤشرات KPI الرئيسية للوحة (مبيعات، ربح، فواتير...) مع Tile قابل للنقر يوجّه لمسار.
- **Props/واجهة:** `metrics: DashboardMetrics`، `monthlyComparison: MonthlyComparison | null`، `profitMarginPercent: string`، `averageTicket: number`؛ يصدّر أيضًا `KpiTile` و`OverviewKpiGridProps` و`TONE_CLASS`.
- **ملاحظات:** ملف تجميع يعيد تصدير من `OverviewKpiGrid_part01`.

### `src/components/dashboard/OverviewKpiGrid_part01.tsx`
- **الغرض:** تعريفات `KpiTile`/`TONE_CLASS`/أنواع الـ props لشبكة KPI.
- **Props/واجهة:** `KpiTile({ label, value, hint?, icon, tone?, to? })`.
- **ملاحظات:** جزء أول من التقسيم (الأنواع + Tile).

### `src/components/dashboard/OverviewKpiGrid_part02.tsx`
- **الغرض:** تنفيذ `OverviewKpiGrid` الفعلي (شبكتا المؤشرات المالية والتشغيلية مع مؤشرات النمو).
- **Props/واجهة:** `OverviewKpiGridProps` كما في part01.
- **ملاحظات:** جزء ثانٍ — الحسابات واقتصاص الأرقام و`growthHint`.

### `src/components/dashboard/OverviewSection.tsx`
- **الغرض:** قسم "نظرة عامة" في لوحة التحكم: يجمع كل البطاقات (KPI، مخططات، قوائم) ويحمّل بياناتها عبر `useOverviewDashboardData`.
- **Props/واجهة:** `onDataLoaded?: () => void`.
- **ملاحظات:** يدعم التحديث التلقائي عبر `useDashboardRefresh`.

### `src/components/dashboard/PaymentMethodsCard.tsx`
- **الغرض:** مخطط أعمدة (BarChart) لتوزيع الإيرادات حسب طريقة الدفع.
- **Props/واجهة:** `paymentDistribution: PaymentDistributionItem[]`.
- **ملاحظات:** بطاقة تحليلية.

### `src/components/dashboard/ProfileKpiPanel.tsx`
- **الغرض:** لوحة مؤشرات خاصة بملف النشاط التجاري (مصدرها `getProfileDashboard`) — قيم فعلية من خدمات المبيعات/المخزون/المالية/المشاريع.
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** يجلب بياناته بنفسه لكل KPI حسب `source` و`format`.

### `src/components/dashboard/QuickActions.tsx`
- **الغرض:** شبكة اختصارات سريعة ثابتة (فاتورة بيع، منتجات، مشتريات، ذمم).
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** قائمة `QUICK_ACTIONS` ثابتة داخليًا.

### `src/components/dashboard/RecentActivitiesFeed.tsx`
- **الغرض:** تغذية "الأنشطة الأخيرة بالنظام" بأيقونة حسب النوع (بيع/شراء/مخزون) وتنسيق زمني.
- **Props/واجهة:** `recentActivities: RecentActivityItem[]`.
- **ملاحظات:** عرض فقط.

### `src/components/dashboard/SalesTrendCard.tsx`
- **الغرض:** مخطط مساحي (AreaChart) لحركة المبيعات آخر 7 أيام.
- **Props/واجهة:** `chartData: SalesTrendPoint[]`.
- **ملاحظات:** حالة فارغة عند انعدام المبيعات.

### `src/components/dashboard/SectionCard.tsx`
- **الغرض:** غلاف بطاقة قسم في اللوحة (عنوان، وصف، أيقونة، badge، زر رجوع للأعلى، anchor `id`).
- **Props/واجهة:** `id`, `title`, `subtitle`, `icon`, `iconBg?`, `iconColor?`, `badge?`, `onScrollTop?`, `children`.
- **ملاحظات:** يُستخدم مع `DashboardSectionNav` للتنقل بين الأقسام.

### `src/components/dashboard/TodayPurchasesPanel.tsx`
- **الغرض:** لوحة مشتريات اليوم: النتائج، التوزيع بالساعة، خلط الدفع، أفضل الموردين/الأصناف.
- **Props/واجهة:** `canViewPurchases`, `todayPurchases: DailyPurchaseResult | null`, `isLoading`, `error`, `onRetry`, `purchaseHourly`, `purchasePeakHour`, `purchasePaymentMix`, `purchaseTopSuppliers`, `purchaseTopItems`.
- **ملاحظات:** يستقبل كل بياناته جاهزة من `OverviewSection`.

### `src/components/dashboard/TopCustomersCard.tsx`
- **الغرض:** قائمة أفضل العملاء حسب إجمالي المشتريات.
- **Props/واجهة:** `topCustomers: TopCustomerItem[]`.
- **ملاحظات:** عرض فقط.

### `src/components/dashboard/TopProductsCard.tsx`
- **الغرض:** قائمة أكثر الأصناف طلبًا (أعلى 5) بالكمية والإيراد.
- **Props/واجهة:** `topProducts: TopSellingProduct[]`.
- **ملاحظات:** عرض فقط.

### `src/components/dashboard/activity/ActivityDashboardPanel.tsx`
- **الغرض:** لوحة مؤشرات مخصصة للنشاط الحالي (تُعرض في تبويب Dashboard للمراكز مثل المبيعات/المخزون/المشتريات).
- **Props/واجهة:** `React.FC` بلا props — تجلب بياناتها عبر `ActivityDashboardService.getDashboard()` وتدعم `useDashboardRefresh`.
- **ملاحظات:**_tiles_ وlist blocks داخلية؛ يحترم الثيم.

### `src/components/dashboard/activity/ActivityHubSummary.tsx`
- **الغرض:** شريط KPI مضغوط أعلى تبويبات مراكز المبيعات/المخزون/المشتريات.
- **Props/واجهة:** `maxTiles?: number` (افتراضي 6).
- **ملاحظات:** يجلب `ActivityDashboardService.getDashboard()` ويعرض أول N tiles.

---

## documents — المستندات

### `src/components/documents/DocumentPreviewModal.tsx`
- **الغرض:** نافذة معاينة مستند HTML (فاتورة/كشف) مع طباعة PDF وحفظ Excel وواتساب.
- **Props/واجهة:** `title`, `subtitle?`, `fileName`, `html`, `onClose`, `onDownloadExcel?`, `onWhatsApp?`.
- **ملاحظات:** يستخدم `utils/export` (`downloadPdf`, `printHtml`)؛ يستخدمها `SalesModals`.

---

## inventory — المخزون

### `src/components/inventory/InventoryView.tsx`
- **الغرض:** صفحة المخزون: أرصدة حسب المخزن، تبويبات (مخزون/غير نشط/سجلات)، ونافذة تحويل بين مخازن.
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** مغلّفة كبيرة بـ `InventoryService`/`ProductService`؛ تسمية الوحدات عبر `useBusinessTerm`.

### `src/components/inventory/stock-transfers/StockTransfersView.tsx`
- **الغرض:** عرض تحويلات المخزون.
- **Props/واجهة:** لا props.
- **ملاحظات:** إعادة تصدير `StockTransfersPage` من `pages/inventory/stock-transfers/StockTransfersPage`.

---

## notifications — الإشعارات

### `src/components/notifications/NotificationsView.tsx`
- **الغرض:** عرض الإشعارات.
- **Props/واجهة:** لا props.
- **ملاحظات:** إعادة تصدير `NotificationsPage` من `pages/common/notifications/NotificationsPage`.

---

## products — المنتجات

### `src/components/products/BrandsView.tsx`
- **الغرض:** عرض العلامات التجارية.
- **Props/واجهة:** لا props.
- **ملاحظات:** إعادة تصدير `BrandsPage` من `pages/products/brands/BrandsPage`.

### `src/components/products/CalculatorPanel.tsx`
- **الغرض:** آلة حاسبة عائمة (:+-×÷) قابلة للسحب والتكبير/التصغير.
- **Props/واجهة:** `onClose?: () => void`، `floating?: boolean` (افتراضي false).
- **ملاحظات:** مستقلة تمامًا؛ إدارة حالة يدوية للعرض/المشغّل/التخزين.

### `src/components/products/CategoriesView.tsx`
- **الغرض:** عرض الفئات.
- **Props/واجهة:** لا props.
- **ملاحظات:** إعادة تصدير `CategoriesPage` من `pages/products/categories/CategoriesPage`.

### `src/components/products/CeramicCalculatorModal.tsx`
- **الغرض:** حاسبة بلاط/سيراميك: حساب مساحة أرضية/جدران/مختلط مع خصومات فتحات (أبواب/نوافذ بأحجام جاهزة) وإضافة للسلة.
- **Props/واجهة:** `isOpen: boolean`، `onClose: () => void`، `products: Product[]`، `onAddToCart?: (product, quantityM2, boxesCount) => void`.
- **ملاحظات:** يستخدم `ProductPicker`؛ ثوابت `DOOR_SIZES`/`WINDOW_SIZES` داخلية.

### `src/components/products/OperationalFieldsChips.tsx`
- **الغرض:** عرض مضغوط لحقول النشاط التشغيلية كسلسلة chips "اسم: قيمة" في صفوف القوائم.
- **Props/واجهة:** `fields: OperationalFieldDefinition[]`، `values: Record<string,string> | undefined`، `max?: number` (افتراضي 3).
- **ملاحظات:** يعرض "—" عند غياب القيم؛ يستخدمه `PurchasesView` وغيره.

### `src/components/products/OperationalFieldsFilter.tsx`
- **الغرض:** فلاتر للحقول التشغيلية القابلة للتصفية (`isFilterable`) — select للـ SELECT وinput للنوع النصي.
- **Props/واجهة:** `fields`، `values: OperationalFieldFilters`، `onChange(values)`؛ دالة مساعدة `matchesOperationalFieldFilters(recordId, fields, values, storedValues)`.
- **ملاحظات:** يُرجع null عند عدم وجود حقول قابلة للتصفية.

### `src/components/products/OperationalFieldsForm.tsx`
- **الغرض:** نموذج إدخال الحقول التشغيلية لأنواعها (BOOLEAN/SELECT/MULTI_SELECT/نص/رقم) داخل قسم teal.
- **Props/واجهة:** `fields`، `values: Record<string,string>`، `onChange(values)`، `title?` (افتراضي "حقول إضافية")، `readOnly?`.
- **ملاحظات:** MULTI_SELECT يخزّن JSON array؛ يُرجع null بلا حقول.

### `src/components/products/OperationalFieldsRecordEditor.tsx`
- **الغرض:** زر "حقول إضافية" يفتح نافذة حوار لتحرير قيم الحقول التشغيلية لسجل واحد مع حفظ عبر callback.
- **Props/واجهة:** `recordLabel: string`، `fields`، `initialValues`، `canEdit: boolean`، `onSave(values)`.
- **ملاحظات:** زر التحرير يظهر فقط عند `canEdit`؛ يغلّف `OperationalFieldsForm`.

### `src/components/products/OperationalFieldsSummary.tsx`
- **الغرض:** عرض ملخّص dl للحقول التشغيلية المعبّأة فقط (مع ترجمة قيم SELECT/MULTI_SELECT لتسمياتها).
- **Props/واجهة:** `fields`، `values: Record<string,string>`.
- **ملاحظات:** يُرجع null عند عدم وجود قيم.

### `src/components/products/ProductFormModal.tsx`
- **الغرض:** نافذة إنشاء/تعديل منتج ضخمة متعددة التبويبات (بيانات، صور، متغيرات/درجات، مخزون افتتاحي، حقول تشغيلية...).
- **Props/واجهة:** `ProductFormModalProps` — `open`, `canCreate`, `canUpdate`, `editingProduct`, `rememberedFields`, `fieldPreferenceOptions`, `onSaveSelectedFields`, `onRegenerateBarcode`, `onRegenerateSku`, `toneOptions`, `onAddTone`, `onDeleteTone`, `productSingularLabel`, `onClose`, `tabs`, `activeTab`, `setActiveTab`, `onSubmit`, `formData`, `setFormData`, `canCreateCategory`, ... (مزيد في الواجهة).
- **ملاحظات:** مكوّن عرض فقط — كل الحالة والمنطق في `ProductsView`/`useProductFormEditor`؛ يستخدم `Field` (FormField) و`OperationalFieldsForm`.

### `src/components/products/ProductPicker.tsx`
- **الغرض:** منتقي منتج ببحث مباشر (suggestions منسّقة) مع ترقيم 25/صفحة وفلترة بفئات/علامات/خصائص و`allowedProductIds`.
- **Props/واجهة:** `value: string`، `onChange(productId, product)`, `selectedLabel?`, `id?`, `ariaLabel?`, `placeholder?`, `allowedProductIds?: string[]`, `required?`, `disabled?`, `className?`.
- **ملاحظات:** يستخدم `ProductService`/`CategoryService`/`BrandService` و`Modal`؛ لوحة اقتراحات عبر portal مع تموضع محسوب.

### `src/components/products/ProductUi.tsx`
- **الغرض:** أدوات UI مشتركة لقسم المنتجات.
- **Props/واجهة:** يعيد تصدير `FormField as Field` من `ui/FormField`؛ و`ListPagination` (`page`, `totalPages`, `totalItems`, `pageSize`, `onPageChange`, `onPageSizeChange`).
- **ملاحظات:** ملف مساعد صغير.

### `src/components/products/ProductsCards.tsx`
- **الغرض:** ملف تجميع لعرض المنتجات كبطاقات.
- **Props/واجهة:** يعيد تصدير `ProductsCardsProps` (من part01) و`ProductsCards` (من part02).
- **ملاحظات:** انظر part01/part02.

### `src/components/products/ProductsCards_part01.tsx`
- **الغرض:** تعريف `ProductsCardsProps` — كل صلاحيات العرض والإجراءات وكولباكاتها (`stockOf`, `stockTone`, `onOpenDetails/Edit/Stock`, `onDuplicate`, `onToggleActive`, `onDelete`, `onToggleProductSelection`).
- **Props/واجهة:** واجهة فقط (لا مكوّن).
- **ملاحظات:** جزء من التقسيم.

### `src/components/products/ProductsCards_part02.tsx`
- **الغرض:** تنفيذ `ProductsCards`: شبكة بطاقات منتجات بصورة، شارة مخزون، checkbox تحديد، وأزرار إجراءات حسب الصلاحيات.
- **Props/واجهة:** `ProductsCardsProps`.
- **ملاحظات:** يستخدم `OperationalFieldsChips` للقيم التشغيلية.

### `src/components/products/ProductsTable.tsx`
- **الغرض:** تنفيذ عرض المنتجات كجدول `DataTable` بأعمدة ديناميكية (سعر/تكلفة حسب الصلاحية، مخزون، حقول تشغيلية، إجراءات).
- **Props/واجهة:** `ProductsTableProps` — مشابه لـ `ProductsCardsProps` مع إضافات `hasCeramicRows`, `onTogglePageSelection`, `onOpenBarcodes`.
- **ملاحظات:** نفس مصدر البيانات والأكشنز like البطاقات.

### `src/components/products/ProductsView.tsx`
- **الغرض:** صفحة/عرض المنتجات الرئيسية: قائمة، فلاتر، بحث، استيراد/تصدير Excel، CRUD عبر `ProductFormModal`، تعديل مخزون، باركودات، مجمّعات حسب النشاط.
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** أكبر مكوّن في products — يملك كل الحالة ويستخدم `ProductsTable`/`ProductsCards`/`ProductFormModal`/`ProductsViewFilters`/`ProductsViewModals` وخدمات `ProductService` و`InventoryService` و`OperationalFieldService` و`AppConfigService`.

### `src/components/products/ProductsView/ProductsViewFilters.tsx`
- **الغرض:** شريط فلاتر وعرض المنتجات: بحث، تبديل table/cards، فلاتر فئة/علامة/درجة/حقل تشغيلي/خاصية، حالة مخزون، فرز، تفعيل.
- **Props/واجهة:** `ProductsViewFiltersProps` — ~30 prop: حالات وبُعد (`search`, `viewMode`, `selectedCategory/Brand/Grade/CustomField/Attribute/StockStatus/SortBy/ProductStatus`، setters، `categories`, `brands`, `attributes`, `gradeOptions`, `operationalFields`, `businessConfig`، `onRefresh`, `onClearFilters`, `onCategoryFilterChange`).
- **ملاحظات:** يستخدم `FilterToolbar` و`FormField`.

### `src/components/products/ProductsView/ProductsViewModals.tsx`
- **الغرض:** نافذتا المنتجات: `ProductStockModal` (إضافة كمية مخزون لكل مخزن) و`ProductImportModal` (استيراد Excel مع قالب ونتائج).
- **Props/واجهة:** `StockRow`/`ProductStockModalProps` (`open`, `onClose`, `stockProduct`, `stockRows`, `setStockRows`, `stockReason`, `setStockReason`, `stockSaving`, `onSave`)؛ `ProductImportResult` (`created`, `errors`)؛ `ProductImportModalProps` (`open`, `onClose`, `isImporting`, `importResult`, `onDownloadTemplate`, `onImportFile`, `importInputRef`).
- **ملاحظات:** كلاهما مبني على `ui/Modal`.

---

## projects — المشاريع

### `src/components/projects/ProjectControlsPanel.tsx`
- **الغرض:** لوحة تحكم مشروع شاملة: مهام، مخاطر، طلبات تغيير، مخرجات، بنود ميزانية، قيود وقت — كلها عبر `ProjectService`.
- **Props/واجهة:** `projectId: string`، `canUpdate: boolean`، `canApprove: boolean`.
- **ملاحظات:** جداول `DataTable` ونماذج inline؛ خرائط تسميات عربية للحالات/الأولويات/الخطورة داخل الملف.

---

## purchases — المشتريات

### `src/components/purchases/PurchaseInvoiceModal.tsx`
- **الغرض:** نافذة إدخال فاتورة شراء: مورد، بنود `ProductPicker`، مخزن، ربط بأمر شراء/GRN، مصاريف وصول، فحص تكرار.
- **Props/واجهة:** `PurchaseInvoiceModalProps` — `dto: PurchaseInvoiceDto`، `setDto`، `suppliers`, `products`, `warehouses`, `grns`, `openPos`، `onSelectGrn(grnId)`، `duplicateCheck {isDuplicate,message?}`، `subtotal`, `totalLandedExpenses`, `finalTotal`, `canCreate`, `onClose`, `onSubmit`، `operationalFields`, `operationalFieldValues`, `onOperationalFieldValuesChange`.
- **ملاحظات:** مكوّن عرض فقط — الحالة في `PurchasesView`؛ يستخدم `OperationalFieldsForm`.

### `src/components/purchases/PurchasesView.tsx`
- **الغرض:** صفحة/عرض المشتريات: قائمة فواتير، فلاتر، حقول تشغيلية، إنشاء/عرض/طباعة عبر `PurchaseInvoiceModal` وخدمات المشتريات/المخزون/المشتريات.
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** مغلّفة كبيرة؛ تستخدم `OperationalFields*` components.

---

## reports — التقارير

### `src/components/reports/ReportsView.tsx`
- **الغرض:** صفحة التقارير العامة: مبيعات، مشتريات، مصروفات، تقييم مخزون، مبيعات حسب فئة/علامة — مع فلاتر تاريخ وتصدير Excel/PDF.
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** يجلب من `SalesService`/`AccountingService` ويستخدم `DataTable`/`StatCard`/`exportToExcel/Pdf`.

### `src/components/reports/SalesFinancialReconciliation.tsx`
- **الغرض:** لوحة مصالحة مالية للمبيعات: فحوصات `SalesFinancialCheck` وإغلاق `SalesFinancialClosure` مع أسباب وختم زمني.
- **Props/واجهة:** `dateFrom: string`، `dateTo: string`.
- **ملاحظات:** صلاحيات `ui.finance.*` مع `canUseCentralClosure` من الخدمة.

### `src/components/reports/financial-statements/AgingPanel.tsx`
- **الغرض:** جدول أعمار الذمم (0-30/31-60/61-90/91-120/+120) مع صف إجمالي.
- **Props/واجهة:** `aging: { rows: AgingRow[]; bucket: AgingBucket }`.
- **ملاحظات:** مبني على `DataTable` + `formatCurrency` من `./format`.

### `src/components/reports/financial-statements/BalanceSheetPanel.tsx`
- **الغرض:** عرض الميزانية العمومية: أصول/التزامات/حقوق ملكية بأقسام ملوّنة.
- **Props/واجهة:** `balance: BalanceSheet` (`StatementLine[]` داخلية).
- **ملاحظات:** مكوّن عرض فقط.

### `src/components/reports/financial-statements/CashFlowPanel.tsx`
- **الغرض:** بطاقة تدفقات نقدية: أرصدة افتتاحية/ختامية، إجمالي داخلة/خارجة، صافي، وجدول شهري.
- **Props/واجهة:** `cash: { months: CashFlowMonth[]; totals: CashFlowMonth; balances: {opening,closing} }`.
- **ملاحظات:** يستخدم `DataTable`.

### `src/components/reports/financial-statements/FinancialStatementsHeader.tsx`
- **الغرض:** ترويسة القوائم المالية: تبويبات (دخل/ميزانية/تدفقات/أعمار/أستاذ مساعد/أستاذ/مصالحة)، نوع aging، تواريخ، تحديث وتصدير.
- **Props/واجهة:** `tab`, `agingType`, `asOf`, `from`, `to`, `loading`، وكل callbacks: `onTabChange`, `onAgingTypeChange`, `onAsOfChange`, `onFromChange`, `onToChange`, `onRefresh`, `onExport`، `visibleTabs?`؛ يصدّر نوعي `FinancialStatementsTab` و`AgingType`.
- **ملاحظات:** يستخدم `PageHeader`.

### `src/components/reports/financial-statements/GeneralLedgerPanel.tsx`
- **الغرض:** دفتر الأستاذ العام لحساب محدد: اختيار حساب، أرصدة افتتاحية/ختامية، جدول حركات.
- **Props/واجهة:** `accounts: LedgerAccount[]`، `accountId: string`، `ledger: {opening,lines,closing} | null`، `onAccountChange(accountId)`.
- **ملاحظات:** يستخدم `DataTable`.

### `src/components/reports/financial-statements/IncomeStatementPanel.tsx`
- **الغرض:** قائمة الدخل: إيرادات (بضاعة/شحن/أخرى)، COGS، مجمل، مصروفات، صافي ربح وهامش.
- **Props/واجهة:** `statement: IncomeStatement` (نوع مُصدَّر من نفس الملف).
- **ملاحظات:** صفوف داخلية `Row`؛ عرض فقط.

### `src/components/reports/financial-statements/ReconciliationPanel.tsx`
- **الغرض:** مصالحة الأستاذ العام مع سجلات العملاء/الموردين/المخزون: ملخص حالة + جدول فروقات.
- **Props/واجهة:** `checks: ReconciliationCheck[]`.
- **ملاحظات:** يستخدم `DataTable`؛ حالة MATCH/DIFFERENCE/NOT_COMPARABLE.

### `src/components/reports/financial-statements/SubledgerPanel.tsx`
- **الغرض:** الأستاذ المساعد لطرف (عميل/مورد): كشف حساب بحركات موسومة بمصدرها (فواتير/مدفوعات/شيكات).
- **Props/واجهة:** `partyType: 'CUSTOMER'|'SUPPLIER'`، `parties: PartyOption[]`، `partyId`, `statement: PartyStatement | null`، `onTypeChange`, `onPartyChange`.
- **ملاحظات:** خريطة `sourceLabels` عربية داخلية؛ يستخدم `DataTable`.

---

## sales — المبيعات

### `src/components/sales/CustomerStatementWhatsAppOptions.tsx`
- **الغرض:** خيارات مشاركة كشف حساب العميل عبر واتساب (ملخص، فواتير، طلب توريد، سجل مدفوعات).
- **Props/واجهة:** `statement: CustomerStatement`، `buttonClassName`, `buttonLabel`, `showTrigger?` (افتراضي true)، `initiallyOpen?`، `onClose?`.
- **ملاحظات:** يستخدم `CustomerSupplyService`/`SalesService`/`openWhatsAppChat`/`shareCustomerStatementOnWhatsApp`.

### `src/components/sales/SalesModals.tsx`
- **الغرض:** كل نوافذ شاشة المبيعات: تفاصيل فاتورة، تحصيل دفعة، إلغاء فاتورة، معاينة مستند، كشف حساب، مرتجع، حقول تشغيلية.
- **Props/واجهة:** `SalesModalsProps` — `selected`, `setSelected`, `payments`, `voidTarget`/`setVoidTarget`/`voidReason`/`submitVoid`, `payTarget`/`setPayTarget`/`payAmount`/`payType`/`payBankAccountId`/`bankAccounts`/`payNotes`/`submitPayment`, `docPreview`/`setDocPreview`, `statement`/`setStatement`/`statementExportOptions`, صلاحيات `canView*`/`canRefund`/`canCollect`/`canVoid`/`canExportCustomers`, `saving`, وأكشنز `printInvoice`/`printThermalReceipt`/`openInvoicePreview`/`openStatement`/`goToReturn`/`openPayment`/`openVoid`/`buildExportHtml`/`exportToExcel`، وحقول تشغيلية.
- **ملاحظات:** مكوّن واحد ضخم مركزي تستخدمه `SalesView`؛ يبني على `SalesUi` و`DocumentPreviewModal`.

### `src/components/sales/SalesUi.tsx`
- **الغرض:** أدوات UI داخلية للمبيعات.
- **Props/واجهة:** `IconButton({title,onClick,children,tone?})`؛ `Modal({children,onClose,wide?})` (غلاف نافذة بـ Esc + focus)؛ `InfoBox({label,value,sub?})`؛ `SummaryRow({label,value,strong?,tone?})`.
- **ملاحظات:** ملاحظة: `Modal` هنا أقدم/أبسط من `ui/Modal`.

### `src/components/sales/SalesView.tsx`
- **الغرض:** صفحة/عرض المبيعات الرئيسي: قائمة فواتير مفصّحة، بحث/فلاتر، إحصائيات، طباعة/تصدير، ويفوّض النوافذ إلى `SalesModals`.
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** مغلّفة كبيرة بـ `SalesService`/`CustomerService`/`InventoryService`/`PrintService`؛ ثوابت `PAGE_SIZE=20`.

---

## setup — معالج الإعداد الأولي

### `src/components/setup/SetupWizard.tsx`
- **الغرض:** معالج إعداد النظام متعدد الخطوات (شركة، فرع، نشاط، محاسبة/أمان، مراجعة) مع حفظ مسودة وفحوصات نظام.
- **Props/واجهة:** `SetupWizardProps` — `onComplete` (يُستدعى عند `finishSetup`).
- **ملاحظات:** يجمع حالة `SetupForm` ويستخدم `SetupWizardHeader/Footer` وخطوات `steps/*` وملفات `SetupWizard/*` المساعدة (.ts).

### `src/components/setup/SetupWizard/SetupWizardFooter.tsx`
- **الغرض:** تذييل المعالج: زرا السابق/التالي/بدء الاستخدام مع تعطيل حسب `canContinue`/`passwordValid`/`saving`.
- **Props/واجهة:** `step`, `canContinue`, `passwordValid`, `saving`, `onPrevious`, `onNext`, `onFinish`.
- **ملاحظات:** يعتمد على `STEPS` من `setupConstants`.

### `src/components/setup/SetupWizard/SetupWizardHeader.tsx`
- **الغرض:** ترويسة المعالج: عنوان + مؤشر "الخطوة X من 5" + شريط تقدم مرئي.
- **Props/واجهة:** `step: number`.
- **ملاحظات:** عرض فقط.

### `src/components/setup/SetupWizard/steps/AccountingStep.tsx`
- **الغرض:** خطوة "المحاسبة/الأمان": عملة، ضرائب، تفعيل مخزون، وبيانات المدير الافتراضي (اسم/مستخدم/كلمة مرور جديدة) حسب `options`.
- **Props/واجهة:** `AccountingStepProps` — `options`, `form`, `set`, `setForm`, `businessConfig`, `setInventoryEnabled`, `security: DefaultAdminState`, `adminProfileError`, `passwordPolicyError`, `newPassword`, `setNewPassword`, `confirmPassword`, `setConfirmPassword`, `passwordVisible`, `setPasswordVisible`, `optionControl`.
- **ملاحظات:** يستخدم `inputClass`/`labelClass` و`optionControl` للتحكم في إظهار/تخطي الأقسام.

### `src/components/setup/SetupWizard/steps/ActivityStep.tsx`
- **الغرض:** خطوة اختيار النشاط التجاري: نوع النشاط، أنشطة فرعية، وحدات، نموذج عمل، مع لافتة حدود الدعم.
- **Props/واجهة:** `ActivityStepProps` — `options`, `form`, `set`, `businessConfig`, `visibleBusinessTypes`, `activitySearch`, `setActivitySearch`, `activityFamily`, `setActivityFamily`, `selectBusinessType`, `toggleAdditionalActivity`, `toggleModule`, `updateBusinessConfig`, `optionControl`.
- **ملاحظات:** يستخدم `BusinessProfileSupportNotice` وثوابت `businessProfiles`/`moduleRegistry`.

### `src/components/setup/SetupWizard/steps/BranchStep.tsx`
- **الغرض:** خطوة الفرع/المخزن الافتراضيين: اسم الفرع، هاتف، اسم المخزن (قابلة للتخطي عبر `options.branch`).
- **Props/واجهة:** `BranchStepProps` — `options`, `form`, `set`, `optionControl`.
- **ملاحظات:** حقل `fieldset` معطّل عند إيقاف التخصيص.

### `src/components/setup/SetupWizard/steps/CompanyStep.tsx`
- **الغرض:** الخطوة الأولى: بيانات الشركة/المعرض + فحص النظام الفعلي (`systemChecks`) مع إعادة فحص.
- **Props/واجهة:** `CompanyStepProps` — `options`, `form`, `set`, `setForm`, `systemChecks`, `visibleSystemChecks`, `systemChecksRunning`, `onRecheckSystemChecks`, `optionControl`.
- **ملاحظات:** يستخدم `CURRENCIES` و`optionControl`.

### `src/components/setup/SetupWizard/steps/ReviewStep.tsx`
- **الغرض:** الخطوة الأخيرة: ملخص كل الإعدادات (معرض، قانوني، مدير، فرع، مخزن، نشاط، وحدات، نموذج عمل، عملة).
- **Props/واجهة:** `ReviewStepProps` — `options`, `form`, `businessConfig`, `security`, `currencySymbol`.
- **ملاحظات:** عرض فقط.

---

## shared — مكوّنات مشتركة على مستوى التطبيق

### `src/components/shared/CentralRestoreNotification.tsx`
- **الغرض:** بانر ثابت أسفل الشاشة عند طلب المنصة المركزية استعادة نسخة قاعدة بيانات التطبيق على هذا الجهاز.
- **Props/واجهة:** `React.FC` بلا props — يشترك عبر `window.ceramisys.centralAppBackup.onPendingRestore`.
- **ملاحظات:** التطبيق الفعلي يتم من صفحة النسخ الاحتياطية.

### `src/components/shared/DatabasePersistenceStatus.tsx`
- **الغرض:** مراقب/إشعار حالة حفظ قاعدة البيانات (saved/saving/error/unavailable) مع تنبيهات toast وتحذير "غير مشفّرة" مؤقت.
- **Props/واجهة:** `React.FC` بلا props — يستخدم `DatabaseManager.getInstance()`.
- **ملاحظات:** يميّع تكرار نفس الخطأ عبر `lastShownPersistenceError`.

### `src/components/shared/GlobalSearch.tsx`
- **الغرض:** بحث شامل (Ctrl+K): صفحات، منتجات، عملاء، موردون، فواتير — مع تنقّل لوحة مفاتيح ومفضلة/أخيرة.
- **Props/واجهة:** `open: boolean`، `onClose: () => void`، `currentUser: User | null`.
- **ملاحظات:** يستخدم `useDeferredValue`، `navigationShortcuts`، `PermissionService`، وأسماء كيانات ديناميكية.

### `src/components/shared/Header.tsx`
- **الغرض:** ترويسة التطبيق الرئيسية: عنوان الصفحة الحالي، بحث، جرس إشعارات، مساعدة اختصارات، قائمة جانبية للجوال، `ProfileMenu`/`HeaderNav` حسب `navigationLayout`.
- **Props/واجهة:** `currentUser: User | null`، `unreadNotifications?: number`، `onLogout?`، `onSwitchUser?`، `onOpenSidebar?`، `onOpenShortcuts?`، `navigationLayout?: 'sidebar' | 'header'`.
- **ملاحظات:** يفتح `GlobalSearch` داخليًا.

### `src/components/shared/HeaderNav.tsx`
- **الغرض:** تنقّل أفقي علوي للمجموعات (وضع `navigationLayout='header'`) بلوحات منسدلة عبر portal.
- **Props/واجهة:** `onOpenQuickCommand: () => void`.
- **ملاحظات:** يعتمد على `useSharedNavigationGroups`؛ يُغلق عند تغيير المسار.

### `src/components/shared/NotesEditor.tsx`
- **الغرض:** محرر ملاحظات شخصي (localStorage): قائمة، بحث، إنشاء/حذف، مزامنة بين النوافذ عبر حدث مخصص.
- **Props/واجهة:** `compact?: boolean`.
- **ملاحظات:** مفتاح `executive-dashboard-notes-v2` مع ترحيل من مفتاح قديم.

### `src/components/shared/NotesPanel.tsx`
- **الغرض:** لوحة عائمة "دفتر ملاحظاتي" قابلة للسحب/التصغير/التكبير/تغيير الحجم تلفّ `NotesEditor`.
- **Props/واجهة:** `onClose: () => void`.
- **ملاحظات:** موضعها/حالتها تُدار داخليًا بـ pointer events.

### `src/components/shared/ShortcutsHelpDialog.tsx`
- **الغرض:** نافذة مساعدة الاختصارات (F1): اختصارات عامة واختصارات POS حسب المسار.
- **Props/واجهة:** `open: boolean`، `onClose: () => void`.
- **ملاحظات:** يقرأ `useLocation` لاختيار مجموعة الاختصارات المناسبة.

### `src/components/shared/Sidebar.tsx`
- **الغرض:** القائمة الجانبية الرئيسية: مجموعات تنقّل ديناميكية (صلاحيات/ترتيب من NavigationService)، تجميع مفتوح/مطوي محفوظ، ثيم، زر اختصارات.
- **Props/واجهة:** `collapsed?: boolean`، `onToggleCollapsed?`، `mobile?: boolean`، `onNavigate?`، `onOpenShortcuts?`.
- **ملاحظات:** يفتح تلقائيًا مجموعة المسار الحالي؛ يحفظ المجموعات المفتوحة في localStorage.

### `src/components/shared/UpdateNotification.tsx`
- **الغرض:** إشعار تحديث التطبيق (Electron): حالات idle/checking/downloading/downloaded/error مع زر تثبيت.
- **Props/واجهة:** `React.FC` بلا props — يستمع لـ `window.ceramisys.updater`.
- **ملاحظات:** قابل للطي؛ يقرأ `getStatus` و`onStatus`.

---

## suppliers — الموردون

### `src/components/suppliers/SuppliersView.tsx`
- **الغرض:** صفحة/عرض الموردين: قائمة، بحث، إحصائيات، كشف حساب، دفعات، تصدير CSV، حقول تشغيلية، CRUD/تفعيل.
- **Props/واجهة:** `React.FC` بلا props.
- **ملاحظات:** مغلّفة كبيرة بـ `SupplierService`؛ CSV محمي من حقن الصيغ (`csvCell`).

---

## sync — المزامنة والربط

### `src/components/sync/AccountLinksPanel.tsx`
- **الغرض:** إدارة روابط الحسابات مع الفروع/النشاطات المركزية: إنشاء/نسخ رمز ربط، حالة (PENDING/ACTIVE/DISABLED/REVOKED)، وضع موافقات التغييرات (AUTO/ALWAYS/OFF).
- **Props/واجهة:** `React.FC` بلا props (راجِع التوقيع الدقيق داخل الملف — لوحة مستقلة).
- **ملاحظات:** يستخدم `AccountLinkService`/`PendingChangeService`/`BranchAccessService` من `src/sync`.

### `src/components/sync/SyncChangeApprovalsPanel.tsx`
- **الغرض:** صندوق وارد اعتمادات المالك لتعديلات الفروع/الحسابات المرتبطة: قبول/رفض مع ملاحظات تُشعر مقدّم الطلب.
- **Props/واجهة:** `requestedBy?: string` (تقييد لقائمة مقدّم)، `canDecide?: boolean`.
- **ملاحظات:** يستخدم `SyncChangeApprovalService`؛ الاعتماد يدفع السجل إلى outbox المزامنة.

### `src/components/sync/SyncStatusPanel.tsx`
- **الغرض:** لوحة صحة المزامنة: حالة الاتصال، آخر اتصال ناجح، عمق الطابور، التعارضات، اعتمادات معلقة، حضور الفروع.
- **Props/واجهة:** `React.FC` بلا props — `SyncStatusService` + `StatCard` من `ui/Card`.
- **ملاحظات:** عرض حي مع تحديث دوري.

---

## treasury — الخزينة

### `src/components/treasury/CashierView.tsx`
- **الغرض:** عرض الخزينة/الكاشير.
- **Props/واجهة:** لا props.
- **ملاحظات:** إعادة تصدير `CashierPage` من `pages/operations/cashier/CashierPage`.

---

## ui — نظام التصميم (Design System Primitives)

مكوّنات أساسية مشتركة. غالبيتها مبني على كلاسات `erp-*`/`ui-*`/`win-*` المركزية.

### `src/components/ui/Button.tsx`
- زر موحّد + `buttonClass()`؛ props: `variant` (primary/secondary/ghost/danger/success)، `size` (sm/md/lg)، `iconOnly`، `block`، `loading`، `leadingIcon`.

### `src/components/ui/Can.tsx`
- حارس صلاحية مبسّط (`permission`, `user?`, `fallback?`) فوق `usePermission` — بديل أخف لـ `PermissionGate`.

### `src/components/ui/Card.tsx`
- `Card` (`padding`, `muted`)، `CardHeader` (`title`, `description?`, `icon?`, `actions?`)، و`StatCard` (`label`, `value`, `hint?`, `icon?`, `tone?`).

### `src/components/ui/CentralLimitGuard.tsx`
- يخفي children عند بلوغ حد ترخيص مركزي (`metric: CentralUsageMetric`, `fallback?`) عبر `useCentralUsageLimit`.

### `src/components/ui/ChangePasswordModal.tsx`
- نموذج تغيير كلمة المرور (حالية/جديدة/تأكيد) داخل `Modal`؛ props كلها controlled: `current`, `next`, `confirm`, `busy`, setters، `onClose`, `onSubmit`.

### `src/components/ui/DataTable.tsx`
- جدول عام typed `DataTable<T>`: `columns: DataTableColumn<T>[]` (`key`,`header`,`render`,`width`,`align`,`hideBelow`)، `rows`, `rowKey`، حالات loading/error/empty، `onRowClick`، صفوف موسّعة `isRowExpanded`/`renderExpandedRow`، ترقيم `page/pageCount/total/pageSize/onPageChange`، `stickyHeader`، `dense`، `footer`.

### `src/components/ui/ErrorBoundary.tsx`
- class boundary يلتقط أخطاء العرض، يبلّغ `CentralTelemetryService` + diagnostics المحلي، ويعرض شاشة خطأ مع إعادة محاولة/تحميل. props: `children` فقط.

### `src/components/ui/FilterToolbar.tsx`
- `<section>` حاوية لفلاتر: `ariaLabel`, `className?`, `children`.

### `src/components/ui/FormField.tsx`
- حقل نموذج بـ label إلزامي/تلميح: `id?`, `label`, `required?`, `hint?`, `visuallyHidden?`, `children` — يحقن id/aria تلقائيًا في عنصر التحكم.

### `src/components/ui/Modal.tsx`
- غلاف modal موحّد (portal): `open`, `onClose`, `title`, `description?`, `icon?`, `size` (sm/md/lg/xl)، `children`, `footer?`, `busy?`, `closeOnBackdrop?`, `className?` — focus trap، Esc، قفل تمرير، استعادة تركيز.

### `src/components/ui/PageHeader.tsx`
- ترويسة صفحة موحّدة: `title`, `description?`, `eyebrow?`, `icon?`, `actions?`, `meta?`, `bordered?`, `disableActivityCopy?` — تستبدل نصًا بنسخة النشاط عند توفرها.

### `src/components/ui/ProfileMenu.tsx`
- قائمة حساب المستخدم في الترويسة: اسم/دور، اختيار فرع، تبديل حساب، إشعارات (موبايل)، ثيم، تغيير كلمة المرور، رمز الدخول PIN، لوحة المنصة، إعادة تشغيل التطبيق، خروج. props: `currentUser`, `unreadNotifications?`, `onLogout?`, `onSwitchUser?`, `branches`, `activeBranchId`, `onBranchChange`.

### `src/components/ui/StateViews.tsx`
- ملف تجميع يعيد تصدير كل حالات العرض (انظر parts). props: لا شيء.

### `src/components/ui/StateViews_part01.tsx`
- `StateView` الأساسية + أنواع `StateTone`/`StateAction`/`StateViewProps` (`tone`, `title?`, `description?`, `icon?`, `action?`, `compact?`, `role?`).

### `src/components/ui/StateViews_part02.tsx`
- `LoadingState` (`label?`, `compact?`) و`EmptyState` و`NoResultsState` (`onClear?`, `clearLabel?`).

### `src/components/ui/StateViews_part03.tsx`
- `ErrorState` (`message?`, `onRetry?`)، `SuccessState`، `WarningState`، `InfoState` — كلها فوق `StateView`.

### `src/components/ui/Toast.tsx`
- ملف تجميع: يعيد تصدير `ToastProvider` و`useToast` (انظر parts).

### `src/components/ui/Toast_part01.tsx`
- تعريفات Toast: `ToastKind`, `ToastItem`, `ToastApi` (`show/success/error/warning/info`)، `ToastContext`، أنماط/أيقونات كل نوع.

### `src/components/ui/Toast_part02.tsx`
- `ToastProvider`: إدارة قائمة التوستات (حد 5، إخفاء بعد 3 ثوانٍ) + اعتراض `window.alert` وتحويله لتوست تلقائيًا.

### `src/components/ui/Toast_part03.tsx`
- `useToast()`: هوك يعيد `ToastApi` من السياق (يرمي خطأ خارج Provider).
