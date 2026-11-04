# تدقيق الفجوات — رؤية «Business Activity Engine + Dependency & Impact Engine + Interactive UI Audit»

التاريخ: 2026-11-04 · النطاق: قراءة فقط (لم يُعدّل أي كود) · المنهجية: 4 جولات تدقيق متوازية (المحرك، انتشار النشاط في الواجهة، محرك التأثير، تغطية الاختبارات) + تحقق يدوي من الأعلام الحرجة.

> هذا التقرير يقيس الوضع الحالي مقابل الرؤية المقترحة (4 طبقات: Business Profile Engine / Core ERP / Dependency & Event Engine / Validation & Audit Engine)، ثم يقترح خطة تنفيذ مرحلية.

---

## 1. ملخص تنفيذي

| المحور | الجاهزية التقديرية | الحكم |
|---|---|---|
| محرك النشاط (Business Activity Engine) | ~35–45% | قوالب + defaults تعمل؛ "المحرك" الذي يقود النظام كله غير موجود |
| انتشار النشاط في الواجهة | ضعيف | يؤثر فعليًا في: الوحدات، وحدات القياس، خصائص المنتج، المصطلحات (3 قوالب). لا يؤثر في: Dashboard، التقارير، الطباعة، الصلاحيات، POS |
| محرك التبعية والتأثير (Dependency & Event Engine) | غير موجود | التأثيرات (مخزون/كاش/أرصدة/قيود) مكوّنة يدويًا ومكررة؛ لا domain events |
| Interactive UI Audit + E2E | شبه معدوم | 3 اختبارات E2E فقط، صفر `data-testid`، لا CI لـe2e، لا تصنيف PASS/PARTIAL/UI_ONLY/… |
| أساس التكامل (معاملات ذرّية + FK + scoping) | جيد | يُبنى فوقه، وليس استبداله |

**أهم 3 مخاطر فورية:**

1. `OPEN_ALL_PAGES = true` و `BYPASS_FIRST_RUN_SETUP = true` (`src/config/setupLifecycle.ts:24,31`) — يلغيان فعليًا كل حجب الصفحات/القوائم المبني على الوحدات (RouteGuard, NavigationService, MainLayout, Header). تبقى فقط الطبقة الخدمية (`assertModuleEnabled`) فعّالة.
2. **تحيّز السيراميك** في البذور والقوالب والقيم الافتراضية والـfallbacks (`src/database/db.ts` seeds، `migrationSettings.ts:3`، `BusinessTypeService.ts:4`، قوالب الطباعة، `productFormModel.ts`).
3. **نوافذ عدم اتساق معروفة** (انظر §5): عكس الكاش على `is_default = 1` بدل الكاشير الأصلي، عدم عكس `cash_shifts.total_sales_*` عند الإلغاء، تدفّقات متعددة المعاملات بلا تعويض، فجوة durability بين COMMIT والحفظ على القرص.

---

## 2. ما هو موجود ويستحق البناء عليه (لا نهدمه)

1. **كتالوج الأنشطة:** 149 نشاطًا في 14 عائلة (`src/config/activityCatalog.ts`)، كل نشاط يرث قالبًا من 25 profile JSON مع تحقق كامل (`businessProfiles.ts:229-261`).
2. **Module Registry غني:** 12 موديولًا مع dependencies وpermissions ومسارات مملوكة وbusiness events وmodule settings وقواعد activation (`src/config/moduleRegistry.ts`) + `validateModuleSelection` + dependency closure.
3. **طبقة تخصيص ما بعد الإعداد قوية:** `AdminSettingsTab` (تبويب النشاط) — وحدات/وحدات قياس/خصائص/نموذج عمل/trackInventory/مصطلحات؛ `ModuleRegistryService.setEnabledModules` مع blockers وسجل تفعيل append-only؛ `activity_configuration_versions` (migration 098) مع snapshots؛ `AppConfigurationPage` (استوديو تكوين: ترقيم/طباعة/صفحات/سياسات مع scopes: platform→tenant→activity→company→branch→device→user).
4. **Hot switch فعلي:** تغيير النشاط لا يتطلب إعادة تشغيل؛ `getEffectiveBusinessType()` تُقرأ من DB في كل استدعاء.
5. **مصطلحات:** `TerminologyService` بأولوية (تخصيص المنشأة ← قالب النشاط ← الافتراضي العربي) + override editor.
6. **Infrastructure للتكامل:** `executeTransaction` (BEGIN/COMMIT حقيقي + SAVEPOINT، `src/database/db.ts:766`)، `postLedgerEntry` (idempotent برمجيًا)، scoping عبر `BranchAccessService`، FK validation في المسارات الحرجة، rounding موحّد (`toMinorUnits/round2`)، idempotency keys في returns/supplier payment (غير موصولة بالواجهة).
7. **اختبارات الخدمات ممتازة:** 80 ملف `node:test` تغطي lifecycles كاملة على SQLite مؤقتة (sales/purchasing/inventory/finance/manufacturing/permissions/scoping) — 321 اختبارًا ناجحًا.

---

## 3. الفجوات مقابل خصائص تعريف النشاط الـ14

| # | الخاصية | الحالة | الدليل / الملاحظة |
|---|---|---|---|
| 1 | `activityId` | جزئي | النشاط يُعرَّف بـ`id` في activityCatalog، والقالب بـ`id`؛ لا خاصية حرفية موحّدة في `BusinessProfile` |
| 2 | `modules` | ✅ موجود | `enabledByDefault/optional` + تحقق إلزامي بتغطية الـ12 موديولًا (`businessProfiles.ts:205-214`) — لكن الاقتران هشّ (إضافة موديول ⇒ تعديل 25 ملفًا) |
| 3 | `features` | ❌ غائب | `FEATURE_REGISTRY` (15 feature) غير مربوطة بالنشاط؛ لا واجهة تفعيل محلية |
| 4 | `navigation` | جزئي (بنية ثابتة + overrides) | `NAV_GROUPS` ثابتة؛ الإخفاء حسب الوحدة + overrides يدوي (`nav.hidden.manual/labels/groupsOrder/itemsOrder`) — لا شيء داخل تعريف النشاط نفسه |
| 5 | `dashboard` (KPIs) | ❌ غائب | `ExecutiveDashboard.tsx` / `useOverviewDashboardData.ts` كلها hardcoded؛ `gradeSales` (فرز سيراميك) تظهر دائمًا بلا شرط |
| 6 | `productSchema` | جزئي | `productAttributes` في كل القوالب؛ `productAttributeDefinitions` (typed) في 5 فقط (ceramics, clothing, cosmetics, electronics, food)؛ تُزرع في جدول `attributes` عبر `BusinessProfileService.applyFromSettings()`؛ لا variants/required/scopes كاملة |
| 7 | `units` (+conversion) | جزئي | 11 وحدة في `BUSINESS_UNITS`؛ تحويل محدود يشتق من **المنتج** لا من النشاط (`src/utils/uom.ts`)؛ لا SET/SERVICE/LINEAR_METER conversions؛ لا قواعد تحويل في التعريف |
| 8 | `pricingRules` | ❌ غائب تمامًا | لا أي مفتاح `pricingRules` في src؛ PricingService بلا بُعد نشاط؛ نسب الجملة/VIP ثوابت عامة (`CartLine.tsx:57-73`) |
| 9 | `workflows` | ❌ غائب كتعريف | المطعم منفّذ فعليًا (طاولات/مطبخ/وصفات، migration 099) لكن غير مشروط بالنشاط — فقط بالوحدة + `orders.view`؛ باقي القطاعات مجرد `support` strings |
| 10 | `documents` | جزئي | موديول documents + contracts؛ لا قوالب لكل نشاط؛ `support.industrySpecificDocumentTemplates: "not-implemented"` في **كل** الـ25 قالبًا |
| 11 | `reports` | جزئي | كتالوج `REPORT_DEFINITIONS` ثابت عالمي؛ لا فلترة بالنشاط؛ `industrySpecificReports: "not-implemented"` في الكل |
| 12 | `permissions` (suggested) | جزئي | صلاحيات على مستوى الموديول فقط؛ لا "صلاحيات مقترحة لكل نشاط" (grep = 0) |
| 13 | `printTemplates` | ❌ غائب كتعريف | محرك override عام فقط (`APP_CONFIG_PRINT_CATALOG` + `AppConfigService.getPrintTemplate`)؛ تحيّز سيراميك صلب في `PrintService.ts`؛ 4 قوالب عامة فقط |
| — | شرط «defaults لا تمنع التخصيص» | ✅ محقق جزئيًا وقوي | وحدات/خصائص/وحدات قياس/نموذج عمل قابلة للتغيير بعد الإعداد؛ التعطيل لا يحذف بيانات |

**الخلاصة:** موجود بالكامل = `modules` فقط. جزئي = activityId, navigation, productSchema, units, documents, reports, permissions. غائب = dashboard, features, pricingRules, workflows, printTemplates.

---

## 4. انتشار النشاط في الواجهة اليوم (WIRED / PARTIAL / STATIC)

| المجال | الحالة | ملاحظة |
|---|---|---|
| السايدبار/التنقل | PARTIAL | بنية ثابتة؛ الفلترة حسب الوحدات + صلاحيات + overrides — **معطّلة فعليًا بسبب `OPEN_ALL_PAGES`**؛ التسميات per-activity (3 قوالب فقط) |
| لوحة المعلومات | STATIC | صفر مراجع للنشاط في كل صفحات الداشبورد |
| المنتجات والنموذج | PARTIAL | الوحدات/الخصائص مربوطة؛ لكن الفرز/المقاس/SKU/فلتر "الفرز" بـ14 فرع `businessType === 'ceramics'` (`ProductsView.tsx:251,254,879,1032`)؛ `productFormModel.ts` سيراميك-أولًا؛ البذور سيراميك ثابتة |
| POS | STATIC (بالنشاط) | يتكيف مع المنتج لا النشاط؛ "وضع المطعم" صفحة منفصلة `/restaurant` مشروطة بالوحدة |
| التقارير | STATIC | لا أي مرجع للنشاط في الكتالوج أو الصفحات |
| قوالب الطباعة | STATIC | إعداد عام + تحيّز سيراميك في المحتوى والعينات |
| الصلاحيات/RBAC | STATIC | كتالوج عالمي؛ لا suggested-per-activity |
| التصنيع/Workflows | PARTIAL | صفحة التصنيع عامة؛ تُفتح بتفعيل وحدة manufacturing |
| SetupWizard / AdminSettingsTab | WIRED | اختيار النشاط يزرع الوحدات/الخصائص — مع تكرار كامل للمنطق بين الملفين |
| Route Guards | WIRED بنيويًا / معطّل تنفيذيًا | `OPEN_ALL_PAGES=true` في RouteGuard, NavigationService, MainLayout, Header |

**أعلى 10 مواضع يجب نقلها إلى المحرك المركزي:** فروع `businessType === 'ceramics'` في ProductsView؛ `productFormModel` (GRADES/SURFACES/emptyForm)؛ `BusinessProfileSupportNotice` (ولّدها من `profile.support`)؛ بذور DB و`migrationSettings.ts:3`؛ ملامح PrintService السيراميكية؛ قواعد تسعير POS؛ خرائط Terminology/Navigation (انقلها لـNAV_GROUPS نفسها)؛ توحيد use-case `applyBusinessProfile()` بين SetupWizard وAdminSettingsTab؛ `ACTIVITY_TYPE_MAP` في CentralConfigApplier (اشتقّه من activityCatalog)؛ حارس موحّد `canAccessPath()` يلغي ازدواجية ملكية المسارات بين moduleRegistry وNavigationService.

---

## 5. الفجوات في «System Dependency & Impact Engine»

**لا يوجد محرك تأثير مركزي** (لا event bus ولا domain events ولا effect registry). الموجود فقط:

- `executeTransaction` (ذرّية ممتازة كحد فاصل) — لا تعرف شيئًا عن "التأثيرات".
- `postLedgerEntry` — idempotent برمجيًا (check-then-insert **بلا unique index** على `journal_entries(reference_type, reference_id)`).
- `src/sync/` (Outbox/Inbox + `EventDispatcher`) — **للمزامنة بين الفروع فقط**؛ لا يعيد تنفيذ منطق الأعمال عند الاستلام، ولا يصلح كتأثيرات محلية دون إعادة تصميم.
- SQL Triggers ~20 — كلها سلامة/ثبات (append-only، سقف reserved، FK)؛ **لا trigger ينشر حدثًا**.
- التدقيق بثلاثة مسارات متوازية (INSERT مباشر داخل المعاملة ~36 موضعًا / `AuditService.log` بعد COMMIT ولا يرمي أبدًا / `auditLogger.ts` للواجهة فقط).

**التأثيرات مكوّنة يدويًا ومكررة**: كتلة «خصم/إضافة `warehouse_stock` + `inventory_transactions` + FIFO + capture» (في invoiceCreation, invoiceVoid, returns, PurchaseService, PurchaseReturnService, InventoryServicePart08–13, countSessionService)، كتلة «`cash_registers` + `cash_shifts`»، كتلة «عكس السند كاملًا» منسوخة 3 مرات في `sales/payments.ts`.

**نوافذ عدم اتساق معروفة (تُصلح قبل/مع بناء المحرك):**

1. `voidSalesInvoice` يعكس الكاش على `WHERE is_default = 1` بينما البيع أضاف على كاشير الوردية/المختار ⇒ درج الكاش قد لا يعود لنفس الرصيد.
2. البيع يزيد `cash_shifts.total_sales_cash/card/transfer` لكن الإلغاء **لا يطرحها** ⇒ تقارير الوردية/الإقفال تُبالغ.
3. `exchangeSale` = معاملتان مستقلتان ⇒ فشل الثانية يترك مرتجعًا مُرحّلًا بلا بديل (لا SAVEPOINT ملفوف، لا تعويض).
4. **فجوة durability:** COMMIT في الذاكرة ثم `saveToStorage()` غير متزامن مع debounce 150ms — انهيار بينهما = فقدان آخر عمليات مع نجاح الواجهة (sql.js بلا WAL على القرص).
5. كتابة الملف كاملة (full-file overwrite) — لا قفل بين نسخ مفتوحة على نفس الملف (آخر كاتب يفوز).
6. `receipt_number = PAY-<timestamp>` في مسارات الموردين — قابل للتصادم مع unique ⇒ فشل المعاملة كاملة.
7. idempotency keys موجودة في الخدمات لكن **الواجهة لا تمررها إطلاقًا** ⇒ double-submit يعتمد على React state فقط.
8. `postLedgerEntry` بلا قيد DB ⇒ أي نقل لخادم/Worker يكسر check-then-insert.
9. `AuditService.log` بعد COMMIT — فشل = فقدان صامت للسجل.
10. الفقد أثناء النقل (TRANSFER_LOSS) يُقيَّد ماليًا (5201/1104) **بلا حركة `inventory_transactions`** ⇒ تفاوت دفتري بين المستودعين.
11. فحص التكرار/الائتمان/المخزون read-then-check — آمن فقط لأن sql.js أحادي الخيط.

**الموضع المقترح للمحرك (لا يغيّر sql.js) — طبقة تأثيرات داخل نفس المعاملة:**

- `src/services/effects/EffectTypes.ts` — `EffectType` (`stock.deduct`, `stock.restore`, `cash.move`, `shift.accumulate`, `customer.balance`, `supplier.balance`, `ledger.post`, `inventory.transaction.insert`, `audit.log`, `sync.capture`, `batch.*`, `fifo.*`) + حمولاتها.
- `src/services/effects/EffectRegistry.ts` — تسجيل handlers (نمط `EventDispatcher` في `src/sync/` لكن لنطاق محلي).
- `src/services/effects/EffectEngine.ts` — `runInTransaction(effects[])` داخل `executeTransaction` القائم + جدول `domain_events` (append-only، unique على `(aggregate_type, aggregate_id, effect_type, effect_key)`) لـobservability وidempotency.
- `src/services/effects/effects/*.ts` — handler لكل أثر (تُستخرج حرفيًا من الملفات المكررة أعلاه).
- Migration جديد: `domain_events` + unique على `journal_entries(reference_type, reference_id)`.
- **نقل `countSessionService.ts` من `src/pages/` إلى `src/services/InventoryCountService.ts`** (منطق أعمال حرج خارج طبقة الخدمات).

---

## 6. الفجوات في «Interactive UI Audit» والاختبارات الترابطية

| البند | الوضع |
|---|---|
| e2e (Playwright + Electron) | ملف واحد `e2e/app.spec.ts`: تفعيل ← دخول ← داشبورد ← تنقل واحد. **لا سيناريو عمل** (sales/purchases/manufacturing/expenses/inventory/permissions/activity-switch) |
| data-testid | **0** (~1,313 زر، ~794 input، ~320 select، ~120 شاشة/مسار) |
| aria-label | 191 (غير منهجي)؛ `role="tab"` = 1 فقط |
| CI (`.github/workflows/ci.yml`) | lint → typecheck → test → electron:pack — **لا يشغّل e2e** |
| تصنيف PASS/PARTIAL/UI_ONLY/DISCONNECTED/BROKEN/UNVERIFIED | غير موجود؛ لا صفحة تدقيق داخلية، لا سكرpt، لا manifest |
| اختبارات UI فعلية | ملف واحد (`financial-statements-ui.test.ts` بـjsdom) — proof-of-concept فقط |
| test/ (unit/integration) | ممتاز على مستوى الخدمات/DB (80 ملف، 321 اختبارًا) — لا يثبت أن الواجهة تعمل |
| توثيق التدقيق | AUDIT_PHASE1/2 backend/أمان؛ UI/UX مؤجلة لـ"Phase 3" ولم تُنفّذ؛ 1221 تحذير lint؛ 32 `as any`؛ متبقيات Phase 2 (reports scoping, rounding في Promotion/Pricing/Commission, UNIQUE/CHECK) |

**التوصية الأداتية:** Playwright + Electron `_electron.launch` هو الأساس (يعيد استخدام seed-db + mockLicenseApi)؛ jsdom لشاشة واحدة فقط؛ **صفحة تدقيق داخلية (dev-only) للجرد والإحصاء فقط** وليست بديلاً عن Playwright. ابدأ بالشاشات عالية المخاطر (POS/Sales/Purchases/Inventory/Finance/Admin).

**التقدير (مهندس واحد):** بنية e2e + fixtures 3–5 أيام · data-testid للعناصر الحرجة 2–4 أسابيع (أو الاعتماد على getByRole + lint rule) · السيناريوهات السبعة 15–25 يومًا · تدقيق ~120 شاشة 4–6 أسابيع ⇒ **~6–10 أسابيع** (4–6 بمهندَين).

---

## 7. مخاطر عابرة يجب حسمها قبل التوسع

1. **`OPEN_ALL_PAGES` / `BYPASS_FIRST_RUN_SETUP`** — قلبها وإلا كل منطق ModuleGuard/NavigationService بلا أثر. إن كانت مؤقتة للتطوير فيجب توثيق القرار وموعد الإيقاف.
2. **توحيد `category` مع العائلات** في الـ25 قالبًا (restaurant=`food-service` غير مطابق لأي familyId؛ يُصحَّح عند التركيب بـ`category=familyId` فقط).
3. **تقليل هشاشة اقتران "كل قالب يصنّف الـ12 موديولًا"** (أو الوراثة من العائلة مع تجاوزات) — إضافة موديول حاليًا تُلزم تعديل 25 ملفًا.
4. **تعميم `productAttributeDefinitions` على بقية القوالب** + دعم lifecycle للحقول (required/variants/scopes).
5. **Seed packs لكل نشاط** بدل بذور سيراميك ثابتة (`db.ts:516-564` + migrations): categories/brands/warehouses/COA/settings.
6. **توحيد مسار التدقيق** (INSERT داخل المعاملة) وإلغاء/دمج `AuditService.log` الصامت.
7. **قرار durability:** إجبار `db:save` متزامن بعد كل معاملة حرجة (أو على الأقل قبل إبلاغ الواجهة بالنجاح)، أو خطة انتقال لـbetter-sqlite3 في main (قرار أكبر).
8. **تفعيل idempotency من الواجهة** لكل كتابة حرجة + unique على `journal_entries(reference_type, reference_id)`.
9. **توحيد use-case `applyBusinessProfile(type, additionalIds)`** يستدعيه SetupWizard وAdminSettingsTab.
10. **إصلاحات الاتساق (§5 البنود 1,2,4,6,7,10)** — يفضّل كـ"Phase 0" قبل بناء المحرك.

---

## 8. خطة التنفيذ المقترحة (مراحل المستخدم الثمانية مُفككة)

**المرحلة 0 — تثبيت سريع (3–5 أيام)**
قلب الأعلام بعد مراجعة · `voidSalesInvoice` (عكس الكاش على نفس الكاشير + طرح `cash_shifts.total_sales_*`) · استبدال `PAY-<timestamp>` بـ`nextNumber` · unique index لـ`journal_entries` · تمرير idempotency keys من النماذج · نقل `countSessionService` إلى services · توحيد مسار audit داخل المعاملة.
**مخرج:** لا نوافذ عدم اتساق معروفة؛ أساس نظيف للمحرك.

**المرحلة 1 — Critical UI Audit (بالشاشات عالية المخاطر أولاً)**
fixture `app` (seed+activate+login) + helper `expectInteractive`؛ manifest JSON للعناصر بالتصنيف الستة؛ سكربت جرد static يغطي ~120 شاشة؛ التقرير كـartifact في CI.
**مخرج:** `docs/UI_AUDIT_MANIFEST.json` + `docs/UI_AUDIT_REPORT.md` بعدّادات لكل شاشة.

**المرحلة 2 — خريطة العلاقات (تكاد تُنجز من التدقيق)**
تحويل §5 إلى **dependency manifest** (`src/config/impactRegistry.ts`): لكل عملية (createProduct, updatePrice, sell, return, purchase, expense, collect, transfer, voidInvoice, changePermission, changeTaxSetting) قائمة تأثيرات + سياسة المستندات التاريخية (لا تُعاد كتابتها أبدًا).
**مخرج:** `impactRegistry.ts` + توثيق.

**المرحلة 3 — BusinessProfile schema v2**
إضافة: `activityId`, `features` (مربوطة بـFEATURE_REGISTRY), `navigation` (عناصر/ترتيب/أيقونات per profile), `dashboard.kpis`, `pricingRules`, `workflows`, `documents`, `reports`, `printTemplates`, `permissions.suggested`؛ migration جديد (`schemaVersion: 2` يقبل v1 ويرقّيه) + تحقق؛ توحيد `category` مع families؛ تعميم attribute definitions.
**مخرج:** تعريف نشاط كامل + اختبارات validation + توثيق schema.

**المرحلة 4 — ربط الوحدات/القوائم/النماذج بالنشاط**
نقل فروع ceramics إلى المحرك (`getProfileProductPreset`, capability flags مثل `supportsGradeFilter`)؛ `productFormModel` يشتق من schema؛ `BusinessProfileSupportNotice` يُولّد من `profile.support`؛ seed packs لكل نشاط؛ توحيد `applyBusinessProfile()`؛ اشتقاق `ACTIVITY_TYPE_MAP`؛ التقارير/القوالب/الصلاحيات تقرأ من التعريف.
**مخرج:** اختيار النشاط يعيد تشكيل النظام فعليًا (قوائم + داشبورد + نماذج + طباعة) وليس defaults فقط.

**المرحلة 5 — Dependency & Event Engine**
بناء `src/services/effects/*` (§5) + migration `domain_events`؛ التأثيرات تُكتب داخل نفس المعاملة؛ استبدال النداءات اليدوية تدريجيًا (invoiceCreation → void → returns → payments → PurchaseService → PurchaseReturn → CashierService → Inventory* → count)؛ `capture` بعد COMMIT فقط.
**مخرج:** كل عملية تكتب سجل تأثيرات مترابطًا؛ فشل أي تأثير = rollback الكل؛ observability كاملة.

**المرحلة 6 — ربط الإعدادات بتأثيراتها**
كل `module_settings`/إعداد له تأثير موثّق: `costingMethod` تُطبَّق في PlanFifo/computeWeightedAverageCost؛ `allowCreditSales` في التحقق من الائتمان؛ `sellingPriceTiersCount` في التسعير؛ الإعدادات الضريبية ⇒ الفواتير **الجديدة** فقط + التقارير (لا إعادة حساب تاريخي)؛ PrintService يقرأ `profile.printTemplates` كـfallback.
**مخرج:** لا إعداد «شكلي» — كل مفتاح يقود سلوكًا حقيقيًا أو يُوسم صراحةً كواجهة فقط.

**المرحلة 7 — السيناريوهات المتكاملة E2E**
7 مواصفات (`e2e/sales-cycle.spec.ts` …): دورة البيع الكاملة (عميل ← منتج ← سعر ← فاتورة ← آجل ← تحصيل ← مرتجع ← تقارير)، دورة الشراء حتى السداد، دورة التصنيع، دورة المصروفات، دورة المخزون (استلام ← تحويل ← جرد ← تسوية)، دورة الصلاحيات (إنشاء مستخدم ← تقييد عمليات)، **دورة تغيير النشاط وإعادة تشكيل البرنامج** — مع أدوار متعددة وقابلية إلغاء/تراجع/تكرار (ضغطتين على حفظ ≠ عمليتان).
**مخرج:** `npm run e2e` أخضر في CI (xvfb/headless) + تقرير لكل سيناريو.

**المرحلة 8 — التقرير النهائي**
تجميع نتائج UI_AUDIT_REPORT + E2E + impactRegistry: المشكلات المتبقية مصنّفة (P0/P1/P2) مع مالكين ومواعيد؛ تحديث AUDIT_PHASE3.md.
**مخرج:** `docs/AUDIT_FINAL.md` + قرار الإطلاق.

**التسلسل المقترح:** 0 ← (1 تبدأ بالتوازي على شاشات POS/Sales) ← 2 ← 3 ← 4 ← 5 ← 6 ← 7 ← 8. المرحلتان 1 و2 يمكن أن تسيرا بالتوازي؛ 5 تعتمد على 0 و2.

---

## 9. قرارات مطلوبة من المالك قبل البدء

1. **الأولوية:** نبدأ بـPhase 0 (إصلاحات ذرّية) أم Phase 1 (التدقيق)؟ التوصية: **Phase 0 أولًا** ثم Phase 1 بالتوازي مع 2/3.
2. **النطاق:** نستهدف الـ149 نشاطًا دفعة واحدة أم نبدأ بـ10 أنشطة مرجعية (ceramics, restaurant, manufacturing, food, general, services, building_materials, clothing, electronics, workshop) ونعمّم؟ التوصية: **10 ثم تعميم**.
3. **الأعلام:** هل قلب `OPEN_ALL_PAGES` مسموح الآن أم مؤجل عمدًا؟ (يؤثر في كل خطة التدقيق.)
4. ** durability:** نقبل حلًا وسطًا (flush إجباري بعد المعاملة الحرجة) أم نخطط للانتقال إلى better-sqlite3 في main الآن؟ (قرار معماري يؤثر على §5.)
5. **الموارد:** مهندس واحد (~6–10 أسابيع للتدقيق+E2E وحدهما) أم فريق؟
6. **الخادم المركزي:** هل `CENTRAL_API_URL`/الترخيص يؤثر في تصميم `domain_events` (نشر للخادم بعد COMMIT) أم محلي فقط؟

---

## 10. الخلاصة بجملة

CeramiSys يملك **هيكل «قوالب + تجاوزات» ناضجًا** (وحدات، hot switch، سجل إصدارات، scoping، معاملات ذرّية)، لكنه **يفتقد «المحرك» نفسه**: النشاط لا يقود الداشبورد والتقارير والطباعة والتسعير والصلاحيات، ولا يوجد محرك تبعية/تأثير مركزي، وتدقيق الواجهة/E2E شبه معدوم — وخطة §8 تبني هذه الطبقات الأربع بالترتيب الصحيح دون هدم الأساس السليم.
