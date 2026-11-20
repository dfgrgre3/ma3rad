# تحليل بنية الأنشطة (Activity Architecture)

> Written for: مطوّر يعمل على المشروع ويريد معرفة الوضع الحالي قبل تنفيذ صفحات مستقلة لكل نشاط.
> الحالة: **محدّث** — يعكس طبقة تخصيص العناصر/الأزرار التي أُضيفت بعد النسخة السابقة.
> ملاحظة: يوجد عمل غير مُلتزَم (uncommitted) كبير على نفس الميزة؛ راجع `git status` قبل أي تعديل.

---

## 1. نظرة عامة على المشروع

- **الاسم:** `ceramisys-erp` (سيراميسيس) — نظام ERP مكتبي، مبني على Electron + React + TypeScript + Vite.
- **الخلفية المركزية:** `central-server/` (Express) للتراخيص والصلاحيات، وتكامل Electron في `electron/`.
- **قاعدة البيانات:** طبقة `src/database` مع migrations مقسّمة (`part*.ts`).
- **الحجم الفعلي (حالي):** ~589 ملفاً في `src/pages`، ~162 مساراً في `src/router/routesList.tsx`، ~144 بنداً في القائمة الجانبية.

---

## 2. الأنشطة المدعومة

`src/config/activityCatalog.ts` يعرّف **9 عائلات و25 نشاطاً**، كل نشاط مرتبط بملف JSON في `src/config/business-profiles/` يحمل: الوحدات المفعّلة، التقارير، لوحة المعلومات، التنقل، قوالب الطباعة، الصلاحيات المقترحة، قواعد التسعير، وسير العمل.

| العائلة | الأنشطة |
|---|---|
| التجارة والمعارض (retail) | ceramics، sanitary، furniture، home_appliances، electronics، clothing، food، cosmetics، automotive، building_materials، lighting، ecommerce، general |
| التوزيع (distribution) | import_export، logistics |
| التصنيع (manufacturing) | manufacturing |
| المقاولات (construction) | construction |
| النقل/الصيانة (transport) | workshop |
| الضيافة (hospitality) | hospitality، restaurant |
| الصحة (healthcare) | healthcare_admin |
| التعليم (education) | education |
| الخدمات المهنية (professional_services) | professional_services، services، custom |

النشاط الافتراضي `ceramics` — **قرار مقصود**، لا يُغيَّر.

---

## 3. طبقات التخصيص حسب النشاط (ما يعمل اليوم)

### 3.1 إخفاء الصفحات — `activityPageVisibility.ts`
- `FAMILY_HIDDEN_PATHS`: مسارات مخفية لكل عائلة.
- `ACTIVITY_HIDDEN_PATHS`: استثناءات إضافية لكل نشاط.
- `ACTIVITY_EXCLUSIVE_PATHS`: مسارات حصرية لنشاط واحد (مثل `/ceramics`).
- الإخفاء تراكمي، يدعم `*` لمطابقة مقطع واحد (مثلاً `/customers/*/imported-products`).
- **نقاط التطبيق:** `RouteGuard.tsx` (تحويل إلى `/dashboard`)، `NavigationService.ts` (القائمة)، `activityHubTabs.ts`، `DashboardPage.tsx`، `ReceivablesHubPage.tsx`.

### 3.2 الأزرار/التبويبات/العناصر داخل الصفحات — `activityElementSpec.ts` (الأحدث)
- `PAGE_ELEMENT_RULES`: قواعد لـ**~131 مساراً** و~500 عنصر.
- كل قاعدة عنصر تدعم:
  - `hiddenFor` / `onlyFor`: إخفاء حسب نشاط أو عائلة.
  - `hiddenPath` / `hiddenPaths`: إخفاء تلقائي مرتبط بإخفاء صفحة أخرى (زر "POS" يختفي إذا `/pos` مخفي).
  - `labels`: إعادة تسمية العنصر حسب النشاط (نشاط يتقدم على عائلة).
- `resolveElementRules`: يطابق المسار الدقيق ثم أقرب مسار أب — فصفحات `/customers/:id` ترث قواعد `/customers`.
- دوال مساعدة: `resolveActivitySubTabs` (تبويبات داخلية غير مرتبطة بمسارات) و`resolveActivityTabs` (أي شريط تبويبات).

### 3.3 التحكّمات بلا مسار — `activityUiRules.ts`
`HIDDEN_CONTROLS` لإخفاء عناصر بلا صفحة مخصصة (مثل `products.barcode-labels`، `sales.promotions`، `inventory.expiry-batches`).

### 3.4 خطافات الوصول — `src/hooks/domains/config/useActivityUi.ts`
- `useActivityPathHidden(path)` — المسار مخفي؟
- `useActivityControlHidden(controlId)` — عنصر تحكم مخفي؟
- `useActivityElement` / `useActivityElementHidden` / `useActivityElementLabel` / `useActivityElements` — حالة العنصر (ظهور + تسمية) على المسار الحالي.
- `<ActivityGate>` (`src/components/ui/ActivityGate.tsx`) — wrapper يُخفي أبناءه حسب `path` أو `control` أو `element`.

### 3.5 الواجهة الموحّدة — `activitySpec.ts`
`getActivitySpec(id)` يعيد كائناً واحداً لكل نشاط يجمّع: `hiddenPaths`، `isPathHidden`، `navLabel`، `pathCopy`، `element(s)`، `tabs`. لا يملك بيانات — يفوّض للمصادر الموجودة. مخصص للمراحل القادمة.

### 3.6 التسميات والنصوص
- `activityNavLabels.ts` (~541 سطراً): تسميات بنود القائمة.
- `activityPathCopy_part01..04.ts`: عنوان/وصف كل مسار.
- `activityPageCopy_activities.ts` + `activityPageCopy_families.ts`: نصوص صفحات الـhub (ترتيب الحل: نشاط ← عائلة ← الافتراضي).
- `businessTerminology_*` + `terminology/profiles/*.json` + `useBusinessTerm`: مصطلحات الكيانات.
- `posActivityCopy.ts`: نصوص نقطة البيع حسب النشاط.

### 3.7 لوحة المعلومات — `activityDashboard.ts`
~34 تعيين `ActivityDashboardKind` (ceramics، restaurant، hospitality، education، workshop، manufacturing، construction، professional، retail، distribution، generic). معظم الأنشطة التجارية تتشارك لوحة `retail`.

### 3.8 الحقول والتقارير — `activityFieldPresets.ts` + ملفات الـprofile
- `productAttributeDefinitions` تضيف حقولاً مقترحة لنموذج المنتج فقط.
- `reports` في كل profile تعرّف تقارير النشاط (ceramics 16، general 13، مطعم/صحة 5 لكلٍّ — لم تُفحص الـ25 كلها).

---

## 4. التغطية الفعلية — أين نحن

| الطبقة | التغطية |
|---|---|
| إخفاء الصفحات | **شامل** — كل المسارات عبر `RouteGuard` + `NavigationService` |
| تسميات القائمة/عناوين الصفحات | واسع؛ `PageHeader` يطبّق `pathCopy` تلقائياً على أي عنوان نصي |
| قواعد العناصر (أزرار/تبويبات) | ~131 مساراً بقواعد معرّفة؛ **كل مسار بقواعد غير فارغة رُبط الآن بمكوّناته** (11 دفعة تغطية: daily/purchases، customer-statement، orders-deposits+reservations، ceramics، shifts، fiscal-closing، cashier/cashboxes، ready-deliveries) |
| ملفات تستخدم hooks/ActivityGate النشاط | لا يزال ~15% من الملفات، لكن **كل صفحة ذات قواعد عناصر مستهلكة** |

### صفحات بلا عناصر معلنة (لا تحتاج ربطاً)
`/sales/cycle`، `/retail`، `/hr/dashboard`، `/hr/alerts`، payroll calendar/notification-settings، `/settings`، `/admin`، `/notifications`، `/finance/cash-forecast`، `/inventory/warehouse-stock`، `/inventory/showroom-stock`، `/customers/imported-products` — قواعدها `{}` فارغة أو عناصرها غير موجودة في الواجهة (أزرار قراءة فقط).

---

## 5. الفجوات الجوهرية المتبقية

1. **الوظائف لا تتغير فعلاً** — "فاتورة جديدة" تُسمّى "أمر إنتاج" للتصنيع لكنها تفتح نفس النموذج. لا توجد نماذج/سير عمل مختلفة لكل نشاط (فاتورة مقاولات ≠ فاتورة سوبرماركت في الحقول والمتطلبات). **الحل المقترح في القسم 7.3.**
2. **العناصر داخل الصفحات المربوطة مغطاة الآن** — كل قاعدة غير فارغة في `PAGE_ELEMENT_RULES` مستهلكة عبر `ActivityGate`/hooks. ما تبقى هو إضافة قواعد *جديدة* لعناصر لم تُعلن بعد (أزرار ثانوية داخل الصفحات).
3. **النماذج لا تتغير حقولها** إلا حقول المنتج؛ نماذج الفاتورة/الطلب/المشروع ثابتة.
4. **مصدر الحقيقة مشتت** على ~8 ملفات config — إضافة نشاط تتطلب تعديل عدة أماكن بالتزامن.
5. **عمل غير مُلتزَم ضخم** على نفس الميزة (`git status` يُظهر عشرات الملفات المعدّلة + migrations) — أي عمل جديد يجب أن يُبنى عليه أو يُنسَّق معه أولاً.

---

## 6. التصميم المقترح للتحويل الديناميكي

**المبدأ:** نفس الصفحات، لكن كل عنصر (زر/حقل/تبويب/نص) يُقرأ من تعريف النشاط — بلا صفحات منفصلة وبلا حذف بيانات.

### قاعدة البيانات المعرفية
- `hiddenFor`/`onlyFor` على مستوى العنصر (موجود في `activityElementSpec`).
- `hiddenPath` يربط إخفاء الزر بإخفاء صفحته الهدف تلقائياً — لا تكرار للقوائم.
- ترتيب الحل: قاعدة النشاط ← قاعدة العائلة ← الافتراضي (نفس نمط `getActivityPageCopy`).

### ما تبقى لتنفيذه
1. **تغطية الصفحات المتبقية** — ربط ~500 ملف بالـhooks حيث يلزم (أولوية: daily، customers، reports، manufacturing، ثم sales/finance/inventory).
2. **حقول النماذج حسب النشاط** — تعميم `productAttributeDefinitions` إلى نماذج الفاتورة/الطلب/المشروع عبر مفاتيح `activityFieldPresets`.
3. **سير العمل حسب النشاط** — `workflows` في الـprofile موجودة كبنية؛ تحتاج ربطاً بالواجهة (خطوات إلزامية/اختيارية).
4. **توحيد المصدر** — ملف واحد لكل نشاط (أو توليد الملفات الحالية منه) لتفادي التعديل المتزامن في 8 أماكن.
5. **اختبارات** — `test/activity-ui.test.ts` و`activity-spec.test.ts` موجودان؛ تُضاف اختبارات تحقق أن كل نشاط يرى قائمته المتوقعة بعد كل دفعة تغطية.

### ترتيب التنفيذ المقترح
dفعات صغيرة لكل مجلد: (1) جرد الأزرار/النصوص الثابتة، (2) إضافة قواعد في `PAGE_ELEMENT_RULES`/`HIDDEN_CONTROLS`، (3) استبدال النص الثابت بمفتاح `labels`/مصطلح، (4) تشغيل `npm test`/lint للمجلد.

---

## 7. آلية تغيير الحقول/الوظائف لكل نشاط (تصميم)

### 7.1 الحقول — موجودة وتعمل
`activityFieldPresets.ts` (`ACTIVITY_FIELD_PRESETS`) يعرّف حقولاً مخصصة لكل نشاط على مستوى `entityType` (`customers`, `orders`, `sales_invoices`, `quotations`, `products`, `projects`, `suppliers`, `sales_returns`, `purchase_invoices`, `purchase_orders`). تُزرع idempotently في `operational_field_definitions` عند تطبيق الـprofile، وتُعرض عبر `OperationalFieldsForm/Filter/Chips/Summary` داخل نماذج العملاء والمنتجات والمشتريات والمبيعات والموردين.

**الفجوة (تم تقليصها):** كانت `purchase_invoices` (3 حقول) و`purchase_orders` (1) شحيحة — أُضيفت حقول استيراد/جمارك ولوجستيات وتصنيع ومقاولات وأغذية (`INCOTERM`, `LETTER_OF_CREDIT`, `PORT_OF_LOADING`, `CUSTOMS_BROKER`, `FREIGHT_COST`, `VEHICLE_PLATE`, `DRIVER_NAME`, `QC_STATUS`, `WORK_ORDER_REF`, `RETENTION_PERCENT`, `MEASUREMENT_NO`, `BATCH_NUMBER`, `EXPIRY_DATE`...). بقي `employees`/`leads`/`vehicles`/`warehouses`/`branches` بلا presets — توسعة مستقبلية = صفوف `f(entityType, ...)` فقط.

### 7.2 الوظائف/الأزرار — نمطان موجودان
1. **إخفاء/تسمية عنصر داخل صفحة** — `PAGE_ELEMENT_RULES` + hooks (منفّذ).
2. **سير عمل مستند** — `workflows` في ملفات الـprofile معرّفة كبنية وتُعرض كشارات في `ManufacturingPage`، لكن **لا تُفرض**: لا إلزام بترتيب خطوات ولا إخفاء زر تحويل حسب النشاط.

### 7.3 `DOC_ELEMENT_RULES` — منفّذ ✅
`src/config/activityDocumentSpec.ts` يطبّق نفس نمط `PAGE_ELEMENT_RULES` لكن بمفتاح = نوع المستند (`/doc/sales_invoice`, `/doc/sales_order`, `/doc/quotation`, `/doc/purchase_invoice`) — فيُطبَّق أينما عُرض المستند وليس داخل صفحة واحدة فقط. يدعم `hiddenFor`/`onlyFor`/`hiddenPath`/`labels`/`required`، ويُقرأ عبر `useDocElements(docPath)` / `useDocElementHidden` / `useDocElementLabel` في `useActivityUi.ts`.

القواعد الأولى المفعّلة:
- **فاتورة بيع:** `receipt-thermal` مخفي للمكاتب الخدمية (B2B)، `return` مخفي لغير البائعين للبضائع.
- **عرض سعر:** `convert-to-order` مخفي للعائلات الخدمية؛ `send` له تسميات لكل نشاط («إرسال للضيف/للنزيل/للمريض/لولي الأمر»).
- **أمر بيع:** `delivery` يتبع إخفاء `/deliveries` تلقائياً.
- **فاتورة شراء:** `claim` مقصور على `import_export`/`logistics`/`manufacturing`.

الربط تم في `SalesModals`، `QuotationModals`، `OrderDetailModal_part02`، `OrdersTable` — مع الحفاظ على شروط الصلاحيات (`canUpdate`/`canApprove`...) فتبقى طبقة الأمان كما هي.

### 7.4 المتبقي
1. ✅ زر الطباعة في `PurchasesView` مربوط بـ`/doc/purchase_invoice`. المتبقي: `PurchaseInvoiceModal` وباقي نماذج المستندات (مرتجعات/أوامر شراء) — لا تحتوي حالياً أزرار إجراءات مستندية.
2. ✅ فرض الحقول المطلوبة حسب النشاط: `ACTIVITY_REQUIRED_FIELDS` + `isFieldRequiredByActivity` في `activityDocumentSpec.ts`، تُطبَّق في `OperationalFieldService` **عند الإنشاء فقط** (السجلات القديمة تبقى قابلة للتعديل). القواعد الحالية: import_export (INCOTERM)، logistics (VEHICLE_PLATE)، construction (CONTRACT_VALUE/SITE_ADDRESS للمشروع)، food (EXPIRY_DATE). علامة `*` في النموذج لا تظهر لها بعد — الرفض عند الحفظ برسالة.
3. ✅ فرض `workflows` عبر `DOC_WORKFLOW_GATES`: التصنيع لا يصدر فاتورة من أمر قبل `READY`/`PARTIAL` (يُخفي الزر في `OrderDetailModal_part02` ويرفض في `convertToInvoice`). نشاط جديد = سطر واحد في الخريطة.
4. ✅ presets لكيانات `employees`/`leads`/`vehicles`/`warehouses` في `ACTIVITY_MASTER_FIELD_PRESETS` (مدمجة في `getActivityFieldPresets`، مع `test/activity-field-presets-master.test.ts`). ويشمل `branches`.
5. اختبارات: كل نشاط يرى أزرار مستنده المتوقعة — `test/activity-document-spec.test.ts` يغطي الدقة الحالية.

---

## 8. قرارات محسومة

- النشاط الافتراضي `ceramics` مقصود.
- **نفس الصفحة بمحتوى ومصطلحات وأزرار مختلفة** — لا صفحات منفصلة.
- الأنشطة الـ25 تبقى كما هي.
- الإخفاء للعرض فقط — تغيير النشاط **لا يحذف بيانات**.
