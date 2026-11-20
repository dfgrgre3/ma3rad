# طبقة التكوين والسجلات — `src/config`

## نظرة عامة

`src/config` هي الطبقة التعريفية المركزية التي تجعل تطبيق ERP واحدًا قابلاً للتخصيص حسب **النشاط التجاري** و**خطة المستأجر** و**صلاحيات المستخدم** دون تغيير الكود. الملفات هنا بيانات صرفة أو دوال نقية في معظمها؛ الحالة الفعلية (الوحدات المفعّلة، التكوينات المحفوظة، الترخيص) تعيش في الخدمات و`SettingsService`/قاعدة البيانات.

### كيف تتكامل المكونات

- **تحديد النشاط والنشاط التجاري:** `activityCatalog.ts` يعرّف 9 عائلات نشاط و25 نشاطًا قابلًا للاختيار. `businessProfiles.ts` يحمّل 25 ملف JSON من `business-profiles/`، يتحقق منها، ويبني ملفات الأنشطة encima القوالب المشتركة. معظم ملفات `activity*` تستخدم `getEffectiveBusinessType()` و`getBusinessProfile()` ثم تطبق ترتيبًا ثابتًا: **تخصيص النشاط → افتراضي العائلة → الافتراضي العام/تعريف الصفحة نفسه**.
- **قدرات النظام والوحدات:** `moduleRegistry.ts` هو المصدر الأساسي لـ12 وحدة أعمال، ولكل وحدة مساراتها وتبعياتها وصلاحياتها وأحداثها وإعداداتها. `capabilityCatalog.ts` يعيد تقديم نفس السجل بمصطلح "capability" مع ربط الميزات والإجراءات. `featureRegistry.ts` و`actionRegistry.ts` يعرّفان الميزات والأزرار/الإجراءات القابلة للضبط، بينما `platformModuleMap.ts` و`featurePageMap.ts` يترجمان بين رموز المنصة المركزية ومعرّفات التطبيق.
- **التنقل والصلاحيات والشاشات:** `navigation.tsx` و`navigationGroups01/02.ts` يعرّفان قوائم المستخدم مع بيانات الأيقونات والصلاحيات. `routePermissions.ts` يضيف قواعد على مستوى المسار، و`permissionMatrix.ts` يولّد مصفوفة صلاحيات دقيقة للصفحات والأقسام والإجراءات، و`screenRegistry.ts` يدمج كل ذلك في متطلب موحد للشاشة. `activityPageVisibility.ts` يخفي صفحات لا تناسب النشاط داخل هذه البنية.
- **نسخ الواجهة حسب النشاط:** طبقة `activityPageCopy*` و`activityPathCopy*` و`activityNavLabels.ts` و`activityHubTabs.ts` و`activityDashboard.ts` و`activityOrderLabels.ts` و`posActivityCopy.ts` تحوّل نفس الشاشات إلى لغة كل نشاط (مثلاً «الطلب» بدل «الفاتورة» في المطعم). `activityFieldPresets.ts` يضيف حقولًا تشغيلية مخصصة حسب النشاط.
- **التكوين الديناميكي:** `appConfiguration*.ts` تعرّف مخطط targets/قواعد/لقطات التكوين والتحقق منها. `appConfigTargets.ts` يسمح للمكونات بتسجيل عناصر قابلة للتهيئة، و`configurationScopes*.ts` يحدد ترتيب النطاقات (منصة ← مستأجر ← نشاط ← شركة ← فرع ← جهاز ← مستخدم) ومن يحق له التجاوز. `setupLifecycle.ts` يتحكم في معالج التهيئة الأولية وأعلام التطوير، و`appVersion.ts` يعرّف إصدار التطبيق.
- **نماذج عرض موحدة:** `tenantPageCatalog.ts` يجمع المسارات والتنقل والشاشات والوحدات في كتالوج صفحات واحد تستخدمه معالجات المنصة. `businessTerminology*.ts` و`terminology/*.json` يحلان المصطلحات العربية الافتراضية والخاصّة بالنشاط. `impactRegistry.ts` يوثّق الآثار الجانبية للعمليات الأساسية وحالة ربطها.

---

### `src/config/actionRegistry.ts`

- **الغرض:** سجل مركزي لكل إجراء قابل للضبط إداريًا عبر محرك التكوين الديناميكي.
- **المحتوى:** يعرّف `ActionDefinition` و`ACTION_REGISTRY` و`getActionDefinition()` و`isKnownAction()`. كل إجراء يحمل `id` و`label` و`module` اختياريًا و`permissions` و`locations` و`policyKey` و`confirmByDefault` و`sensitive` و`featureId` و`roleCodes`. يتضمن إجراءات عامة (`common.save/cancel/print/export/import`) وإجراءات منتجات وعملاء وموردين ومبيعات ومشتريات ومخزون ومالية وموافقات. يوضح التعليق أن الإخفاء ليس تفويضًا؛ الصلاحيات تُفرض في طبقة الخدمة.

### `src/config/activityCatalog.ts`

- **الغرض:** كتالوج عائلات الأنشطة التجارية والأنشطة القابلة للاختيار داخل كل عائلة.
- **المحتوى:** يعرّف `ActivityFamilyDefinition` و`ActivityDefinition` و`BUSINESS_ACTIVITY_FAMILIES` و`getActivityFamily()` و`getActivityRows()`. العائلات التسع هي `retail` و`distribution` و`manufacturing` و`construction` و`transport` و`hospitality` و`healthcare` و`education` و`professional_services`، وتنتج 25 نشاطًا مثل `ceramics` و`restaurant` و`import_export` و`workshop` و`custom`، لكل منها `profileId` مرتبط بقالب في `business-profiles`.

### `src/config/activityDashboard.ts`

- **الغرض:** يحدد نوع لوحة المعلومات المختصرة ونص تبويبها ونسختها حسب النشاط.
- **المحتوى:** يعرّف `ActivityDashboardKind` و`ActivityDashboardSpec` و`getActivityDashboardKind()` و`getActivityDashboardSpec()` و`getActivityDashboardCopy()`. الأنواع تشمل `ceramics` و`restaurant` و`hospitality` و`education` و`workshop` و`manufacturing` و`construction` و`professional` و`retail` و`distribution` و`generic`. يحل النوع أولًا من خريطة النشاط ثم عائلة النشاط، بينما يأتي العنوان والوصف من `activityPageCopy` أو ملف النشاط.

### `src/config/activityFieldPresets.ts`

- **الغرض:** يعرّف الحقول التشغيلية الإضافية المخصصة لكل نشاط (مشروع، موقع، مقاس، رقم لوحة، حالة طاولة...).
- **المحتوى:** يعرّف `ActivityFieldDataType` و`ActivityFieldPreset` و`ACTIVITY_FIELD_PRESETS` و`getActivityFieldPresets()`. كل preset يحدد `entityType` و`code` و`name` و`dataType` و`unit` و`isRequired` و`isFilterable` و`options`. يخدم كيانات مثل `customers` و`products` و`sales_invoices` و`quotations` و`orders` و`sales_returns` و`suppliers` و`purchase_invoices` و`projects` و`purchase_orders`.

### `src/config/activityHubTabs.ts`

- **الغرض:** يخصص تبويبات مراكز المبيعات والمخزون والمشتريات حسب النشاط ويخفي ما لا ينطبق.
- **المحتوى:** يعرّف `ActivityHubId` (`sales`/`inventory`/`purchasing`) و`HubTabLike` و`resolveHubTabs()`. يضم `ACTIVITY_TAB_LABELS` تخصيصات لكل hub/tab/activity و`FAMILY_TAB_LABELS` كبديل على مستوى العائلة. `resolveHubTabs()` يزيل التبويب إذا كان مساره مخفيًا عبر `isActivityPathHidden()` ثم يستبدل التسمية بتخصيص النشاط أو العائلة.

### `src/config/activityNavLabels.ts`

- **الغرض:** يخصص تسميات عناصر القائمة الجانبية للأنشطة التي يتغير لفظها فعلًا.
- **المحتوى:** يعرّف `ACTIVITY_NAV_PATHS` و`ActivityNavPath` و`getActivityNavLabel()` (default export أيضًا). المسارات المغطاة تشمل `/pos` و`/orders` و`/quotations` و`/returns` و`/sales/after-sales` و`/partners` و`/projects` و`/projects/execution` و`/projects/sites` و`/projects/boq` و`/suppliers` و`/reports` و`/documents` و`/daily/sales` و`/daily/purchases` و`/restaurant` و`/manufacturing` و`/construction-estimate` و`/retail` و`/crm/dashboard`. البيانات مقسمة إلى `FAMILY_NAV_LABELS` للعائلات التسع و`ACTIVITY_NAV_LABELS` للأنشطة الـ25.

### `src/config/activityOrderLabels.ts`

- **الغرض:** يكيف نصوص حالات وأزرار الطلبات حسب النشاط دون تغيير آلة الحالات.
- **المحتوى:** يعرّف `ACTIVITY_ORDER_STATUS_LABELS` و`ACTIVITY_ORDER_ACTION_LABELS`. الأول يترجم حالات `OrderStatus` مثل `PENDING` و`CONFIRMED` و`PROCESSING` و`PARTIAL` و`READY` و`ON_HOLD` و`COMPLETED` إلى عبارات نشاطية (مثلاً «في المطبخ» للمطعم و«قيد الإنتاج» للتصنيع). الثاني يخصص تسميات `confirm` و`start` حسب النشاط.

### `src/config/activityPageCopy.ts` و`activityPageCopyTypes.ts` و`activityPageCopy_families.ts` و`activityPageCopy_activities.ts`

- **الغرض:** نظام النصوص الدلالية للصفحات الرئيسية حسب النشاط، مع رجوع احتياطي على مستوى العائلة.
- **المحتوى:** `activityPageCopyTypes.ts` يعرّف `ActivityPageKey` (`dashboard` و`customers` و`products` و`sales` و`orders` و`inventory` و`purchasing` و`finance` و`reports` و`crm` و`operations` و`projects` و`purchaseOrders` و`pos` و`returns` و`quotations` و`afterSales` و`partners` و`hr` و`documents`) و`ActivityPageCopy`. `activityPageCopy_families.ts` يعرّف `FAMILY_PAGE_COPY` للعائلات التسع، و`activityPageCopy_activities.ts` يعرّف `ACTIVITY_PAGE_COPY` للأنشطة الـ25. `activityPageCopy.ts` يعيد تصدير الأنواع ويوفر `getActivityPageCopy()` و`getActivityLabel()`؛ الترتيب هو تخصيص النشاط ثم العائلة ثم `undefined`.

### `src/config/activityPageVisibility.ts`

- **الغرض:** يخفي صفحات فردية لا تناسب النشاط أو عائلته، إضافة إلى إخفاء الوحدات الكامل.
- **المحتوى:** يعرّف `getActivityHiddenPaths()` و`isActivityPathHidden()` وdefault export. البيانات الداخلية مقسمة إلى `FAMILY_HIDDEN_PATHS` لكل عائلة، و`ACTIVITY_HIDDEN_PATHS` لتخصيصات إضافية، و`ACTIVITY_EXCLUSIVE_PATHS` للصفحات الحصرية مثل `/ceramics`. الإخفاء تراكمي ويعمل بالمطابقة الدقيقة أو كبادئة مسار.

### `src/config/activityPathCopy.ts` و`activityPathCopyTypes.ts` و`activityPathCopy_part01-04.ts`

- **الغرض:** يوفر عنوانًا ووصفًا لكل مسار عمل حسب عائلة النشاط عندما لا توجد نسخة دلالية أغنى.
- **المحتوى:** `activityPathCopyTypes.ts` يعرّف `ActivityCopyFamilyId` (نفس العائلات التسع) و`PATH_SEMANTIC_KEYS` و`PATH_PREFIX_SEMANTIC_KEYS` لتفويض المسارات المغطاة بنسخة الصفحات الدلالية. ملفات `part01` إلى `part04` هي أجزاء من نفس السجل `ACTIVITY_PATH_FAMILY_COPY`:
  - `part01`: العمليات اليومية، تحليلات/دورة/كشف المبيعات، المطعم وحاسبة المقايسة، المنتجات والتسعير، ومخزون المخازن/المعارض.
  - `part02`: الموردون والعملاء، CRM، المشتريات، التوصيل والسائقون والمركبات والأسطول والعمليات.
  - `part03`: الخزائن والمالية ومركز التصنيع.
  - `part04`: الحضور والرواتب والعقود والمستندات والتوظيف والموارد البشرية.

  `activityPathCopy.ts` يدمج الأجزاء في `ACTIVITY_PATH_FAMILY_COPY` ويوفر `normalizeActivityPath()` و`getActivityPathCopy()` وdefault export. الترتيب هو مفتاح دلالي من `activityPageCopy` ثم نسخة المسار على مستوى العائلة.

### `src/config/appConfigTargets.ts`

- **الغرض:** سجل داخلي وقت التشغيل للعناصر القابلة للتهيئة التي تسجلها مكونات الواجهة.
- **المحتوى:** يعرّف `ConfigTargetDefinition` (`domain` و`key` و`label` و`description` و`pagePath`) و`registerConfigTarget()` و`getRegisteredConfigTargets()` و`subscribeConfigTargets()`. يحتفظ بخريطة `domain:key` وقائمة مستمعين، ويعيد دالة إلغاء التسجيل.

### `src/config/appConfiguration.ts` و`appConfiguration_part01-07.ts`

- **الغرض:** مخطط محرك «التكوين الديناميكي للتطبيق» والبيانات الافتراضية والتحقق منه.
- **المحتوى:**
  - `appConfiguration.ts`: مجمّع يحمّل الأجزاء السبعة ويعيد تصدير واجهتها العامة.
  - `part01`: `APP_CONFIG_SCHEMA_VERSION`، `AppConfigDomain` (page/section/field/text/module/action/feature/policy/numbering/print)، `APP_CONFIG_DOMAINS`، `APP_CONFIG_DOMAIN_LABELS`، `AppConfigEntry`، و`AppConfigRuleAction`.
  - `part02`: `AppConfigRule`، `AppConfigSnapshot`، `AppConfigNumbering`، `DEFAULT_NUMBER_TEMPLATE`، و`APP_CONFIG_TEXT_CATALOG` للنصوص العامة.
  - `part03`: `APP_CONFIG_POLICY_CATALOG` لسياسات مثل حد الخصم ومهلة الجلسة ومخزون منخفض، و`APP_CONFIG_NUMBERING_CATALOG` لأنواع المستندات المرقمة.
  - `part04`: `APP_CONFIG_PRINT_CATALOG` لعناوين وقوالب الطباعة، وأنماط التحقق `PAGE_KEY_PATTERN` و`ENTRY_KEY_PATTERN` و`DOMAIN_SET`، ودوال التطبيع/البناء مثل `normalizePagePath()` و`normalizeConfigKey()` و`entryId()` و`isAppConfigDomain()` ومساعدات التحقق `asRecord()` و`boundedString()` و`boundedInteger()`.
  - `part05`: `validateAppConfigEntry()` و`validateAppConfigRule()` مع تنظيف المدخلات والحدود.
  - `part06`: `validateAppConfigSnapshot()` و`parseAppConfigSnapshot()` و`serializeAppConfigSnapshot()` و`isSecuritySensitiveConfigKey()`؛ يتحقق من الإصدار والحدود ويزيل التكرار ويحدد المفاتيح الحساسة للأمان/الترخيص.
  - `part07`: `formatDocumentNumber()` لتطبيق قوالب `{prefix}` و`{year}` و`{month}` و`{day}` و`{seq:N}`.

### `src/config/appVersion.ts`

- **الغرض:** يوفر رقم إصدار التطبيق للترخيص والتحديثات وصحة النظام.
- **المحتوى:** يعرّف `APP_VERSION` من ثابت البناء `__APP_VERSION__` إن وُجد، ثم `npm_package_version`، ثم القيمة الاحتياطية `'1.1.4'`.

### `src/config/business-profiles/*.json`

- **الغرض:** ملفات بيانات قوالب ملفات الأنشطة الـ25 التي يستهلكها `businessProfiles.ts`.
- **المحتوى:** كل ملف يعرّف `schemaVersion` و`profileVersion` و`id` و`name` ثنائي اللغة و`description` و`category` و`configuration` (businessModel/trackInventory/units/customUnits/productAttributes/productAttributeDefinitions) و`modules.enabledByDefault` و`modules.optional` و`support`، مع أقسام اختيارية مثل `dashboard` و`reports` و`printTemplates` و`features` و`pricingRules` و`permissions` و`workflows` و`navigation`. الملفات هي:
  - `automotive.json` — قطع غيار وسيارات.
  - `building_materials.json` — مواد بناء وتشطيب.
  - `ceramics.json` — سيراميك وبورسلين.
  - `clothing.json` — ملابس وأحذية.
  - `construction.json` — مقاولات ومشروعات.
  - `cosmetics.json` — عطور ومستحضرات تجميل.
  - `custom.json` — نشاط مخصص.
  - `ecommerce.json` — تجارة إلكترونية.
  - `education.json` — تعليم وتدريب.
  - `electronics.json` — أجهزة وإلكترونيات.
  - `food.json` — مواد غذائية وسوبر ماركت.
  - `furniture.json` — أثاث وديكور.
  - `general.json` — معرض متعدد الأنشطة / القالب العام.
  - `healthcare_admin.json` — إدارة صحية إدارية.
  - `home_appliances.json` — أجهزة منزلية.
  - `hospitality.json` — ضيافة.
  - `import_export.json` — استيراد وتصدير.
  - `lighting.json` — إضاءة وكهرباء.
  - `logistics.json` — لوجستيات ونقل.
  - `manufacturing.json` — تصنيع وإنتاج.
  - `professional_services.json` — خدمات مهنية.
  - `restaurant.json` — مطعم أو كافيه.
  - `sanitary.json` — أدوات صحية.
  - `services.json` — شركة خدمات أو صيانة.
  - `workshop.json` — ورشة أو خدمات تشغيل.

### `src/config/businessProfiles.ts`

- **الغرض:** يحمّل قوالب JSON، يتحقق منها، ويبني كتالوج الأنشطة وملفات النشاط الفعلية ودوال الإعدادات.
- **المحتوى:** يستورد ملفات `business-profiles` و`MODULE_REGISTRY`/`MODULE_IDS`/`getHiddenModulePaths`/`getManagedModulePaths`/`getModulePathOwner` و`BUSINESS_ACTIVITY_FAMILIES`/`getActivityRows`/`ActivityDefinition`. يعرّف واجهات `BusinessProfile` و`BusinessConfiguration` و`BusinessProfileDashboard` و`BusinessProfileReport` و`BusinessProfilePrintTemplate` و`BusinessProfilePermissionSuggestion` و`BusinessProfilePricingRules` و`BusinessProfileWorkflow` و`BusinessProfileNavigation` و`BusinessProfileAttributeDefinition` و`BusinessProfileAttributeDataType` و`BusinessModel` و`BusinessCapabilityStatus` و`BusinessProfileCapability`، وثوابت `BUSINESS_UNITS` و`BUSINESS_CONFIGURATION_SCHEMA_VERSION`. يصدّر `BUSINESS_PROFILES` (25 قالبًا متحققًا)، `BUSINESS_ACTIVITY_CATALOG` (25 نشاطًا)، `BUSINESS_TYPES`، `BUSINESS_ACTIVITY_FAMILY_OPTIONS`، `BUSINESS_MODULES`، ودوال الوصول مثل `getBusinessProfile()` و`getBusinessProfileCapabilities()` و`getBusinessProfileTemplateId()` و`getProfileDashboard()` و`getProfileReports()` و`getProfilePrintTemplates()` و`getProfilePermissionSuggestions()` و`getProfilePricingRules()` و`getProfileWorkflows()` و`getProfileFeatures()` و`getProfileNavigation()` و`getProfilePrintTemplate()`/`getProfilePrintTmp()` و`getPricingTierFactor()` و`getDefaultBusinessConfiguration()` و`getActivityModuleIds()` و`serializeBusinessConfiguration()` و`parseBusinessConfiguration()` و`getProfileModuleIds()` و`parseEnabledModules()` و`getProfileHiddenPaths()` و`getBusinessModuleForPath()` و`getManagedBusinessPaths()`.

### `src/config/businessTerminology.ts` و`businessTerminology_part01-03.ts` و`businessTerminology_profiles_extra.ts`

- **الغرض:** نظام المصطلحات العربية للنشاط، من الافتراضيات العامة إلى تجاوزات الملف والنشاط.
- **المحتوى:**
  - `businessTerminology.ts`: مجمّع يعيد تصدير الأنواع والقيم العامة.
  - `part01`: يحمّل `terminology/ar.json` ويعرّف `BusinessLanguage` و`BUSINESS_TERMINOLOGY` (تعريفات مفاتيح مثل `entities.customers.singular` و`modules.sales` و`documents.salesInvoices`) و`BusinessTermKey` و`BUSINESS_TERM_DEFAULTS`.
  - `part02`: يدمج `terminology/profiles/*.json` مع `EXTRA_BUSINESS_PROFILE_TERMINOLOGY` في `BUSINESS_PROFILE_TERMINOLOGY`، ويعرّف `BusinessTermOverrides` و`BUSINESS_TERM_KEYS` و`resolveBusinessTerm()`؛ الترتيب هو تجاوز المستخدم ثم تخصيص الملف ثم الافتراضي العربي.
  - `part03`: `validateBusinessTermOverrides()` الذي يقبل مفاتيح معروفة فقط، وينظف القيم العربية، ويرفض التكرار، ويتجاهل مفاتيح اللغات غير العربية للترحيل.
  - `businessTerminology_profiles_extra.ts`: تخصيصات مضمنة للأنشطة التي لا تملك ملف JSON منفصلًا، مثل `automotive` و`construction` و`education` و`healthcare_admin` و`restaurant` و`general` و`custom`.

### `src/config/terminology/*.json`

- **الغرض:** ملفات JSON لخرائط المصطلحات العربية الافتراضية والخاصّة بملفات محددة.
- **المحتوى:** `ar.json` يعيّن كل `BusinessTermKey` إلى نصه العربي الافتراضي. `profiles/ceramics.json` و`profiles/services.json` و`profiles/professional_services.json` يقدمان تجاوزات جزئية حسب مفتاح المصطلح واللغة `ar`. بقية الأنشطة مغطاة عبر `businessTerminology_profiles_extra.ts`.

### `src/config/capabilityCatalog.ts` و`capabilityCatalog_part01-02.ts`

- **الغرض:** واجهة «القدرات» فوق سجل الوحدات، لربط الوحدات بالميزات والإجراءات والشاشات.
- **المحتوى:** `part01` يعرّف `CapabilityRequirements` و`CapabilitySettingDefinition` و`CapabilitySelectionOptions` و`CapabilitySelectionValidation` و`CapabilityDefinition`، ويبني `CAPABILITY_CATALOG` من `MODULE_REGISTRY` مع ربط `features` و`actions`، و`REGISTRY_BY_ID` و`getCapabilityDefinition()` و`isKnownCapability()` و`isKnownScreen()` و`getCapabilityDependencyClosure()` و`withCapabilityDependencies()`. `part02` يوفّر `validateCapabilitySelection()` و`getCapabilityPathOwner()` و`getManagedCapabilityPaths()` و`getHiddenCapabilityPaths()` فوق دوال الوحدات. `capabilityCatalog.ts` يعيد تصدير هذه الواجهة مع دوال تعريف الوحدات و`ACTION_REGISTRY` و`FEATURE_REGISTRY`.

### `src/config/configurationScopes.ts` و`configurationScopes_part01-03.ts`

- **الغرض:** يحدد سلسلة نطاقات التكوين وسلطتها وقواعد من يحق له التجاوز.
- **المحتوى:** `part01` يعرّف `ConfigurationScopeType` (`platform`/`tenant`/`activity`/`company`/`branch`/`device`/`user`) و`CONFIGURATION_SCOPE_PRECEDENCE` و`CONFIGURATION_SCOPE_TYPES` و`CONFIGURATION_SCOPE_LABELS` و`ConfigurationScopeContext` و`ConfigurationScopeRef` و`isConfigurationScopeType()` و`configurationScopeRef()`. `part02` يوفّر `resolveConfigurationScopeChain()` و`normalizeScopeContext()` و`serializeScopeContext()` و`describeScope()` و`ScopeOverrideDecision`. `part03` يوفّر `canOverrideAtScope()` و`scopeAuthority()`، ويمنع تعديل المنصة محليًا ويقيد المفاتيح الحساسة إلى مستوى المستأجر على الأقل.

### `src/config/featurePageMap.ts`

- **الغرض:** يربط رموز أعلام ميزات المنصة بالمسارات التي تملكها.
- **المحتوى:** يعرّف `FEATURE_CODE_TO_PAGE_PATHS` لرموز مثل `multi_branch` و`advanced_reports` و`restaurant_mode` و`audit_export`، و`hiddenPathsForDisabledFeatures()` لإرجاع المسارات المملوكة للميزات غير المفعّلة. التعليق يطلب مزامنته مع `central-server/lib/featurePageMap.js`.

### `src/config/featureRegistry.ts`

- **الغرض:** كتالوج الميزات/أعلام الميزات مع ربطها بالوحدات والصلاحيات.
- **المحتوى:** يعرّف `FeatureDefinition` (`id` و`label` و`module` اختياري و`permissions` و`defaultEntitled`) و`FEATURE_REGISTRY`. الميزات تشمل `core.erp` ووحدات `module.sales` و`module.inventory` و`module.customers` و`module.purchasing` و`module.finance` و`module.operations` و`module.manufacturing` و`module.approvals` و`module.crm` و`module.projects` و`module.restaurant` وميزات مثل `feature.pos.offline` و`feature.reports.export` و`feature.branch.sync`.

### `src/config/impactRegistry.ts`

- **الغرض:** يوثّق العمليات التجارية الأساسية وما يجب أن تتأثر به كل منها وحالة التنفيذ الحالية.
- **المحتوى:** يعرّف `ImpactStatus` و`ImpactTarget` و`HistoricalDocsPolicy` و`ImpactOperation` و`IMPACT_REGISTRY` و`IMPACT_OPERATION_IDS`. كل عملية تذكر `historicalDocs` و`effects` بأهداف مثل `inventory.stock` و`ledger.journal` و`cash.register` و`sync.outbox` و`audit.log` وحالات `wired`/`partial`/`missing` وملفات التنفيذ المرجعية. العمليات الـ13 تشمل إنشاء/تعديل المنتجات، فواتير ومرتجعات وإلغاء المبيعات، فواتير ومرتجعات المشتريات، مدفوعات العملاء والموردين، المصروفات، التحويلات المخزنية، تحديث صلاحيات المستخدم، وتغيير الإعداد الضريبي/المحاسبي.

### `src/config/moduleRegistry.ts`

- **الغرض:** السجل الأساسي للوحدات التجارية: المسارات والتبعيات والصلاحيات والأحداث والإعدادات وقواعد التفعيل.
- **المحتوى:** يعرّف `ModuleSettingType` و`ModuleSettingDefinition` و`ModuleActivationRules` و`ModuleDefinition` و`MODULE_REGISTRY` (12 وحدة: `sales` و`inventory` و`customers` و`purchasing` و`finance` و`operations` و`reports` و`approvals` و`documents` و`projects` و`hr` و`manufacturing`) و`MODULE_IDS` و`getModuleDefinition()` و`isKnownModule()` و`getModuleDependencyClosure()` و`withModuleDependencies()` و`ModuleSelectionOptions` و`ModuleSelectionValidation` و`validateModuleSelection()` و`getModulePathOwner()` و`getManagedModulePaths()` و`getHiddenModulePaths()`. كل وحدة تذكر `label` و`description` و`dependencies` و`permissions` و`paths` و`businessEvents` و`settings` و`activation`؛ مثال: `inventory` يتطلب `requiresInventoryTracking`.

### `src/config/navigation.tsx`

- **الغرض:** نقطة التجميع الرئيسية لتعريفات التنقل في التطبيق.
- **المحتوى:** يدمج `NAV_GROUPS_01` و`NAV_GROUPS_02` في `NAV_GROUPS`، يعيد تصدير أنواع التنقل من `../types/config/navigation`، ويعرّف `NAV_STORAGE_KEYS` لمفاتيح التخزين المحلي (`nav.hidden.manual` و`nav.hiddenGroups.manual` و`nav.labels` و`nav.groupsOrder` و`nav.itemsOrder` و`nav.groupAssignments` و`nav.customGroups`).

### `src/config/navigationGroups01.ts`

- **الغرض:** الجزء الأول من شجرة التنقل: المجموعات التجارية والتشغيلية الأساسية.
- **المحتوى:** يعرّف `NAV_GROUPS_01: NavGroupDef[]` بسبع مجموعات: `dashboard` (الرئيسية)، `daily` (مركز العمل اليومي)، `sales` (المبيعات ونقاط البيع والطلبات والعروض)، `inventory` (المخزون والمستودعات والمنتجات والتسعير)، `purchasing` (الموردون والمشتريات)، `crm` (العملاء والمشاريع وعلاقات العملاء)، و`finance` (المالية والحسابات). كل مجموعة لها `id` و`label` و`icon` و`color` وعناصر `items` تحتوي `label` و`to` و`icon` وصلاحيات `perm`/`perms`/`anyPerms` وخصائص مثل `highlight`.

### `src/config/navigationGroups02.ts`

- **الغرض:** الجزء الثاني من شجرة التنقل: العمليات والموارد البشرية والتقارير والمستندات وإدارة النظام.
- **المحتوى:** يعرّف `NAV_GROUPS_02: NavGroupDef[]` بخمس مجموعات: `operations` (الأسطول والفروع والمخازن والورديات والتوصيل والتصنيع والورشة)، `hr` (الموظفون والحضور والرواتب والإجازات والعقود والتوظيف والبوابة الذاتية)، `reports` (مركز التقارير وفئاتها)، `documents` (الموافقات والمستندات والعقود)، و`system` (الإدارة والاستيراد والإشعارات والتدقيق والمستخدمون والنسخ الاحتياطي والصحة والإعدادات والترخيص). يستورد `DATA_IMPORT_ACCESS_PERMISSIONS` من `routePermissions.ts` لتقييد مركز استيراد البيانات.

### `src/config/permissionMatrix.ts`

- **الغرض:** يولّد مصفوفة صلاحيات دقيقة للصفحات والأقسام والإجراءات.
- **المحتوى:** يعرّف `PermissionKind` (page/action/section/field) و`GranularPermissionDef` وقوائم `PAGES` الداخلية (~164 مواصفة صفحة) ومجموعات إجراءات قياسية مثل `READ` و`WRITE` و`APPROVE` و`FINANCE` و`CONFIG` و`DOCS` و`ANALYTICS`. يبني `GRANULAR_PERMISSIONS` عبر `buildPermissions()`، ويشتق `GRANULAR_LEGACY_MAP` و`GRANULAR_LEGACY_ALIASES` و`PAGE_VIEW_PERMISSIONS`. اصطلاح الأكواد هو `ui.<module>.<page>.view` و`ui.<module>.<page>.<action>` و`ui.<module>.<page>.section.<section>.view/manage/export`، مع `legacy`/`legacyAliases` للترقية.

### `src/config/platformModuleMap.ts`

- **الغرض:** يترجم رموز وحدات الكتالوج في المنصة إلى معرّفات `MODULE_REGISTRY` في التطبيق.
- **المحتوى:** يعرّف `PLATFORM_MODULE_TO_REGISTRY_IDS` لرموز مثل `sales` و`pos` و`inventory` و`purchases` و`customers` و`crm` و`finance` و`cashier` و`reports` و`hr` و`projects` و`manufacturing` و`documents` و`restaurant`، و`platformCodesToRegistryIds()` التي تُسقط الرموز المجهولة وتعيد معرّفات فريدة. يجب مزامنته مع `central-server/lib/platformModuleMap.js`.

### `src/config/posActivityCopy.ts`

- **الغرض:** يكيف نصوص نقطة البيع حسب النشاط (الفاتورة/الطلب، التوصيل/الشحن، رسوم الخدمة...).
- **المحتوى:** يعرّف `PosActivityCopy` بحقول مثل `invoiceLabel` و`adjustmentsTitle` و`shippingLabel` و`extraFeesLabel` و`paymentTitle` و`checkoutLabel` و`cartTitle` و`heldLabel` و`walkInLabel` و`successTitle` وحقول شاشة عرض العميل. يعرّف `POS_DEFAULT_COPY` و`POS_FAMILY_COPY` (retail/distribution/hospitality) و`POS_ACTIVITY_COPY` لتخصيصات النشاط مثل `ceramics` و`ecommerce` و`restaurant`.

### `src/config/routePermissions.ts`

- **الغرض:** خريطة صلاحيات مسارات على مستوى المسار تغطي صفحات التطبيق.
- **المحتوى:** يعرّف `RoutePermissionRule` (`path` و`all` و`any`) و`DATA_IMPORT_ACCESS_PERMISSIONS` و`ROUTE_PERMISSIONS` (~142 قاعدة). كل قاعدة تتطلب كل أكواد `all` وواحدًا على الأقل من `any`؛ المطابقة تعتمد أطول مسار في `NavigationService` و`screenRegistry`. تغطي القواعد الرئيسية والتشغيل اليومي والمبيعات والمطعم/الفندق/الورشة والمنتجات والتسعير والمخزون والفروع والمشتريات والمالية والمشاريع والموارد البشرية والتقارير والموافقات والمستندات والإدارة والإعدادات.

### `src/config/screenRegistry.ts`

- **الغرض:** يوحّد تعريف الشاشات ومتطلباتها من ثلاث مصادر: قواعد المسارات، عناصر القوائم، وصلاحيات العرض الدقيقة.
- **المحتوى:** يعرّف `ScreenRequirement` و`ScreenDef` و`screenRequirementFor()` و`listScreens()` و`screenPermissionBase()` و`hasTabPermission()` و`tabPermissionCode()`. يدمج `ROUTE_PERMISSIONS` و`NAV_GROUPS` و`PAGE_VIEW_PERMISSIONS`، يطبق «أول قاعدة تفوز» للقوائم، ويختار أطول مسار مطابق. الناتج يُستخدم لبذر `screen_permissions` وتقييم بُعد `screen` في `AuthorizationService`.

### `src/config/setupLifecycle.ts`

- **الغرض:** يقرر متى يظهر معالج الإعداد الأولي ويوفر أعلام تشغيل خاصة بالتطوير/المحلي.
- **المحتوى:** يعرّف `FirstRunSetupEvidence` و`shouldShowFirstRunSetup()` التي تظهر الإعداد فقط عند عدم الاكتمال وعدم وجود بيانات أعمال أو تكوين قديم. يعرّف `BYPASS_FIRST_RUN_ACTIVATION` من ثابت البناء، و`BYPASS_FIRST_RUN_SETUP=false`، و`OPEN_ALL_PAGES=false` لتجاوز البوابات عند الحاجة.

### `src/config/tenantPageCatalog.ts`

- **الغرض:** يبني كتالوج قراءة موحد لكل صفحات تطبيق المستأجر مع تسمياتها العربية والوحدة المالكة.
- **المحتوى:** يعرّف `TenantPage` و`TenantPageGroup` و`listTenantPages()` و`listTenantPageGroups()` و`resetTenantPageCatalogCache()`. يجمع `APP_ROUTE_PATHS` من `../router/routePaths`، وتسميات `NAV_GROUPS`، وتسميات `listScreens()` مع دعم أنماط `:param`، وملكية `getModulePathOwner()` من `MODULE_REGISTRY`. يُستخدم في معالج خطة المنصة لعرض/تقييد كل صفحة.
