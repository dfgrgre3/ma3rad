# توحيد الصلاحيات — تصميم النظام الموحد (البند 1.3)

> حالة الوثيقة: مسودة تصميم للمراجعة — لم يُنفَّذ أي تغيير كود بعد.
> النطاق: صلاحيات المستخدم/الدور/الفرع/المخزن/الشاشة/التبويب/الزر/العملية/حدود المبالغ/رؤية التكلفة والربح، مع فرض موحد محليًا (داخل المستأجر) ومركزيًا (منصة الإدارة).

---

## 1. الوضع الحالي والفجوات

### 1.1 ما يوجد اليوم

| الطبقة | المكوّن | الدور |
|---|---|---|
| كتالوج محلي | `src/services/domains/auth/permissions/catalog.ts` (~1000 سطر) | تعريف صلاحيات `module.action` مع `kind` (page/action/section/field) و`route` اختياري |
| فحص محلي | `PermissionChecker` | يدمج `role_permissions` + `user_permissions` (GRANT/DENY) + wildcards + aliases |
| مسارات — خريطة 1 | `PAGE_VIEW_PERMISSIONS` في `src/config/permissionMatrix.ts` | مسار → صلاحية عرض صفحة |
| مسارات — خريطة 2 | `ROUTE_PERMISSIONS` في `src/config/routePermissions.ts` | مسار → `all`/`any` صلاحيات |
| مسارات — مصدر 3 | عناصر `NavigationService`/قوائم التنقل | لكل عنصر قائمة صلاحية خاصة |
| حارس المسار | `RouteGuard.tsx` → `canAccessPage()` | يعرض رسالة رفض (لا redirect) |
| الأزرار/الأقسام | `PermissionGate` / `GuardedButton` / `usePermission` | إخفاء UI فقط؛ الفرض الحقيقي في الخدمات |
| طبقة الخدمات | `PermissionService.require/requireAny` | فرض فعلي + audit عند الرفض |
| مركزي — صفحة | `CentralFeaturePermissionService` | view/edit/delete/export لكل `pageUrl` + `hiddenMenus` — تتقدم على المحلي |
| مركزي — صلاحيات | `PlatformAuthorizationService` + `central-server/identity.js` | مصفوفة `platform_role_permissions` لمستخدمي المنصة |
| موافقات | `approval_policies` | `mode` (DIRECT/APPROVAL/DISABLED) + `max_value` + `scope_type` — أقرب ما يوجد لحدود المبالغ لكن لنطاق الموافقات فقط |

### 1.2 الفجوات المؤكدة

1. **ثلاثة مصادر لحقيقة «من يفتح أي مسار»** (`PAGE_VIEW_PERMISSIONS`، `ROUTE_PERMISSIONS`، عناصر التنقل) — أي اختلاف بينها ينتج تضاربًا.
2. **التبويبات غير مربوطة بصلاحيات** — التبويب حالة داخلية (`useState`) في كل صفحة؛ لا يوجد كيان «تبويب» في نموذج الصلاحيات، لذلك قد تُفتح الصفحة بصلاحية X بينما تبويبها الافتراضي يعرض بيانات تتطلب Y.
3. **`scope` شكلي** — توقيع `can(user, code, scope?)` موجود لكن `scope` يُستخدم فقط لتمرير مسار الصفحة إلى `CentralFeaturePermissionService`؛ لا يوجد ربط فعلي بالفرع أو المخزن رغم وجود جدولي `users_branches` و`branch_warehouses`.
4. **لا حدود مبالغ** — لا يوجد ربط بين الصلاحية وقيمة العملية (الخصم، المرتجع، التحويل، المصروف). أقرب شيء `approval_policies.max_value` لكنه لنطاق الموافقات لا للصلاحيات.
5. **لا أبعاد رؤية مالية** — لا يوجد تمييز بين «اطلاع على سعر البيع» و«اطلاع على تكلفة الشراء/هامش الربح» (مثال موظف المبيعات في المتطلبات).
6. **ازدواجية تراتبية** — القيود المركزية تتقدم على المحلية (`allowsPermission` أولًا) لكن لا توجد دلالة موحدة «ماذا يحدث عند التعارض» موثقة لكل بُعد.

---

## 2. النموذج المستهدف

### 2.1 الكيانات والعلاقات

```
User ──< UserRoleAssignment >── Role ──< RolePermissionGrant >── PermissionCode
User ──< UserPermissionOverride (GRANT/DENY) >── PermissionCode
User ──< UserScopeGrant >── Scope(BRANCH|WAREHOUSE) ──> Branch/Warehouse
Role ──< RoleAmountLimit >── Operation ──> max_amount
User ──< UserAmountLimit >── Operation ──> max_amount   (overrideRole)
PermissionCode ──> sensitivity flags: { revealCost, revealProfit, amountSensitive }
Screen (route+tab) ──> required PermissionCode(s)
```

### 2.2 صيغة كود الصلاحية الموحدة

نمط هرمي موحد بدل الأكواد المسطّحة الحالية:

```
<domain>.<screen>.<tab>.<element>.<action>
```

أمثلة:

```
sales.invoice.view            # شاشة
sales.invoice.tab.items.view  # تبويب
sales.invoice.tab.payments.view
sales.invoice.btn.discount    # زر/عملية
sales.invoice.op.discount     # عملية مالية
inventory.product.cost.view   # رؤية تكلفة
sales.report.profit.view      # رؤية ربح
```

القواعد:
- الأجزاء الفارغة تعني «غير مقيد على هذا البُعد» — `sales.invoice.*` يغطي كل ما تحته (wildcard هرمي).
- **التوافق الخلفي إلزامي**: كل كود جديد يُسجَّل في الكتالوج مع `legacy` يشير للكود القديم (`inventory.view` → `inventory.screen.stock.view` مثلًا). `hasRoleGrant` الحالية تدعم هذا النمط بالفعل عبر `GRANULAR_LEGACY_MAP` — نمدّه ولا نعيد اختراعه.
- الأكواد القديمة تبقى صالحة قراءةً؛ الكتابة الجديدة تستخدم الصيغة الهرمية فقط.

### 2.3 أبعاد التقييم (بترتيب الفرض)

لكل طلب `(user, permissionCode, context)` حيث `context = { path, tab?, branchId?, warehouseId?, amount?, operation? }`:

| # | البُعد | المصدر | السلوك |
|---|---|---|---|
| 1 | تعطيل مركزي (kill-switch) | `CentralFeaturePermissionService` / قيود المنصة | DENY مطلق — لا يتجاوزه شيء محلي |
| 2 | صلاحية الشاشة/التبويب | خريطة الشاشات الموحدة | يجب توفر كود الشاشة أولًا؛ تبويب داخل الشاشة يُفحص بكوده الخاص |
| 3 | نطاق الفرع/المخزن | `user_scope_grants` الجديدة | إن طُلب `branchId`/`warehouseId` صراحة في السياق: يجب أن يكون ضمن نطاق المستخدم (أو `ALL`/`GLOBAL`) |
| 4 | صلاحية الدور + تجاوزات المستخدم | `role_permissions` + `user_permissions` | DENY المستخدم يتقدم على GRANT الدور (كما هو حاليًا) |
| 5 | حد المبلغ | `permission_amount_limits` | `amount > max` → رفض أو تحويل لموافقة (حسب `approval_policies`) |
| 6 | رؤية التكلفة/الربح | `sensitivity` على كود الصلاحية + أكواد `*.cost.view`/`*.profit.view` | إخفاء الحقول في الـ DTO وليس فقط في UI |

الناتج ليس boolean فقط بل `Decision { allowed, reason, requiredCode, missingDimension }` لتُستخدم في:
- UI: إخفاء/تعطيل التبويب أو الزر مع tooltip يشرح السبب (`missingDimension: 'amount'` → «تجاوز حد الصلاحية»).
- الخدمات: `require()` يرمي بالسبب نفسه.
- Audit: تسجيل البُعد المرفوض تحديدًا.

---

## 3. نموذج البيانات

### 3.1 محلي (SQLite — `src/database/schema/`)

```sql
-- ربط المستخدم بفروع/مخازن مسموحة (تكملة users_branches الموجودة)
CREATE TABLE IF NOT EXISTS user_warehouse_grants (
  user_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  PRIMARY KEY (user_id, warehouse_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
);

-- حدود مبالغ لكل (صلاحية، دور أو مستخدم)
CREATE TABLE IF NOT EXISTS permission_amount_limits (
  id TEXT PRIMARY KEY,
  permission_code TEXT NOT NULL,          -- كود العملية (مثال: sales.invoice.op.discount)
  scope_type TEXT NOT NULL CHECK(scope_type IN ('ROLE','USER')),
  scope_id TEXT NOT NULL,                 -- role code أو user id
  max_amount REAL NOT NULL,
  currency TEXT DEFAULT 'LYD',
  on_exceed TEXT NOT NULL DEFAULT 'DENY' CHECK(on_exceed IN ('DENY','REQUIRE_APPROVAL')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(permission_code, scope_type, scope_id)
);

-- خريطة الشاشات الموحدة: المسار + مفتاح التبويب → كود الصلاحية
-- تحل محل PAGE_VIEW_PERMISSIONS + ROUTE_PERMISSIONS + صلاحيات عناصر القوائم
CREATE TABLE IF NOT EXISTS screen_permissions (
  screen_key TEXT PRIMARY KEY,            -- '/inventory' أو '/inventory::tab=ledger'
  path_pattern TEXT NOT NULL,             -- يدعم :param
  tab_key TEXT,                           -- NULL = الشاشة نفسها
  required_all TEXT NOT NULL DEFAULT '[]',-- JSON array
  required_any TEXT NOT NULL DEFAULT '[]',
  label_ar TEXT
);

-- أعلام الحساسية المالية على الصلاحيات (بديل/توسعة لحقل kind في الكتالوج)
ALTER TABLE permissions ADD COLUMN sensitivity TEXT DEFAULT 'NONE';
-- قيم: NONE | COST | PROFIT | COST_PROFIT | AMOUNT
```

ملاحظات:
- `users_branches` موجودة؛ نضيف `user_warehouse_grants` ونوحّد الواجهة: «نطاق فارغ = كل الفروع/المخازن» للأدوار الإدارية، و«نطاق معرّف = تقييد».
- لا ننقل `PAGE_VIEW_PERMISSIONS`/`ROUTE_PERMISSIONS` إلى DB فورًا — المرحلة الأولى تولّد `screen_permissions` من الكود الموحّد وتبقي الخرائط القديمة كـ fallback أثناء الترحيل.

### 3.2 مركزي (`central-server/lib/db.js`)

```sql
-- حدود على مستوى المنصة لكل مستأجر (أمن أعلى من المحلي)
CREATE TABLE IF NOT EXISTS tenant_permission_limits (
  tenant_id TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  max_amount REAL,
  cost_visible INTEGER,                   -- NULL = لا تقييد
  profit_visible INTEGER,
  disabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, permission_code)
);

-- توسيع platform_scopes الحالية لتشمل أبعادًا إضافية عند الحاجة
-- (اليوم scope_type='TENANT' فقط — تبقى كافية لأن الفرع/المخزن محليان داخل المستأجر)
```

آلية الدفع للتقييدات الجديدة نفس آلية `tenant_feature_config` الحالية: خادم مركزي → config موقّع → `centralConfigStore` في العميل → `CentralFeaturePermissionService`.

---

## 4. محرك التقييم الموحد

ملف جديد مقترح: `src/services/domains/auth/authorization/AuthorizationService.ts`

```ts
type Decision =
  | { allowed: true }
  | { allowed: false; reason: DenyReason; requiredCode: string; dimension?: Dimension };

interface AuthContext {
  path: string;
  tab?: string;
  branchId?: string;
  warehouseId?: string;
  amount?: number;
  operation?: string;   // كود العملية المالي
}

evaluate(user, code, ctx): Decision
require(user, code, ctx): void          // يرمي + audit
```

خط الأنابيب داخل `evaluate`:

1. `CentralFeaturePermissionService.isPermissionDisabled(code)` → deny.
2. حلّ كود الشاشة من `ctx.path + ctx.tab` عبر `screen_permissions` → إن لم يتحقق `required_any` → deny بالبعد `screen`.
3. إن وُجد `ctx.branchId/warehouseId`: تحقق من `user_scope_grants`/`users_branches` → deny بالبعد `scope`.
4. `loadSets(user)` الحالي (role + overrides + wildcards) → deny بالبعد `grant`.
5. إن `amount` وُجد: ابحث `permission_amount_limits` (USER ثم ROLE) → deny/`REQUIRE_APPROVAL` بالبعد `amount`.
6. أعلام `sensitivity`: إن الكود يكشف تكلفة/ربحًا ولم يملك المستخدم كود `*.cost.view`/`*.profit.view` → deny بالبعد `sensitivity` (يُطبَّق في طبقة DTO أيضًا).

`PermissionChecker` الحالي يبقى الواجهة العامة؛ `AuthorizationService` يُستدعى داخله فيُضاف البُعد الجديد دون كسر الاستدعاءات (~مئات المواضع `can/require` لا تتغير).

---

## 5. ربط الشاشات والتبويبات — حل مشكلة «المسار ≠ التبويب»

السبب الجذري: لا يوجد كيان «شاشة» موحد؛ كل صفحة تبني تبويباتها بحرية وكل مسار له ثلاث خرائط.

**الحل:**

1. **`ScreenRegistry`** — مصدر واحد في الكود (TS) يولّد منه `screen_permissions`:
   ```ts
   {
     key: '/products',
     pathPattern: '/products',
     tabs: {
       'overview':    { any: ['products.view'] },
       'batches':     { any: ['products.batches.view', 'products.view'] },
       'prices':      { any: ['products.pricing.view'] },
     },
   }
   ```
2. **`useScreenPermission(tabKey)`** hook جديد: يقرأ التبويب النشط من الصفحة ويعيد `Decision` — الصفحات تستبدل منطق «أظهر كل التبويبات» بـ«أظهر فقط المسموح، وبدّل الافتراضي لأول مسموح».
3. **إصلاح الحالة الحرجة**: إن كان التبويب الافتراضي مرفوضًا → التحويل لتبويب مسموح أو رسالة موحدة بدل شاشة فارغة/أعطال.
4. `NavigationService` يقرأ نفس `ScreenRegistry` — عنصر القائمة يظهر فقط إن تحقق `required_any` للشاشة الافتراضية.

**الترحيل**: المرحلة الأولى تغطي الصفحات ذات التبويبات الأكثر استخدامًا (products, inventory, finance, sales, purchases, hr, admin) ثم نعمّم. الصفحات بلا تبويبات تكتسب ربطًا تلقائيًا لأن الشاشة = المسار.

---

## 6. حدود المبالغ ورؤية التكلفة/الربح

### 6.1 حدود المبالغ

- تُربط **بالعملية** لا بالزر: `sales.invoice.op.discount`، `sales.return.op.post`، `inventory.adjustment.op.post`، `finance.expense.op.create`.
- مصدر الحد: `permission_amount_limits` (ROLE افتراضي، USER يتجاوزه).
- عند `on_exceed = REQUIRE_APPROVAL`: الخدمة لا ترفض بل تنشئ `approval_requests` موجودة أصلًا (`request_type='OTHER'` أو نوع جديد `AMOUNT_LIMIT`) — إعادة استخدام `approval_policies` القائمة بدل بناء محرك ثانٍ.
- التحقق في الخدمة **و** في UI (تعطيل الزر مع رسالة الحد) — نفس نمط `GuardedButton`.

### 6.2 رؤية التكلفة/الربح

- إضافة `sensitivity` على `PermissionDef` في الكتالوج: `NONE | COST | PROFIT | COST_PROFIT | AMOUNT`.
- أكواد رؤية مخصصة: `*.cost.view`، `*.profit.view` تُضاف للكتالوج وتُزرع لأدوار الإدارة فقط.
- **نقطة فرض حاسمة**: الإخفاء في الـ DTO/service (`ProductService`، استعلامات التقارير) — إخفاء عمود في جدول React وحده لا يكفي لأن البيانات تصل للعميل.
- الأولوية: products (cost_price, wholesale), inventory valuation, purchases, reports (profit-loss, statements), sales analytics.

---

## 7. الفرض المزدوج (محلي + مركزي)

| الطبقة | المحلي (داخل المستأجر) | المركزي (المنصة) |
|---|---|---|
| نموذج | `AuthorizationService` أعلاه | `platform_permission_catalog` + `tenant_permission_limits` |
| توزيع | مباشر — SQLite محلي | config موقّع → `centralConfigStore` |
| التقدم | المحلي هو الأساس | تقييدات المنصة **تتقدم دائمًا** (DENY فقط — المنصة لا تستطيع منح ما منعه المستأجر محليًا، وهذا مقصود: المستأجر يدير نفسه ضمن سقف الاشتراك) |
|Audit| `writeAuditLog` الحالي + البُعد المرفوض | `platform_audit_events` |

قاعدة ذهبية موثقة: **المنصة تقيّد ولا توسّع** — كل قرار مركزي إما `disabled` أو حد أقصى/سقف رؤية، ولا يمكنه إضافة صلاحية لمستخدم مستأجر.

---

## 8. مراحل التنفيذ المقترحة

| المرحلة | المحتوى | الملفات الرئيسية | الحجم |
|---|---|---|---|
| **0 — التدقيق** | تقرير آلي: لكل مسار في `routesList` قارن `PAGE_VIEW_PERMISSIONS` × `ROUTE_PERMISSIONS` × صلاحية عنصر القائمة؛ ولكل صفحة تبويبات أدرج التبويبات الفعلية | سكربت `scripts/audit-permissions.mjs` | صغير |
| **1 — الأساس** | `AuthorizationService` + `Decision` + ربط `sensitivity` في الكتالوج + `user_warehouse_grants` + `permission_amount_limits` + seed | `auth/authorization/*`, `migrations`, `catalog.ts` | متوسط |
| **2 — الشاشات والتبويبات** | `ScreenRegistry` + `useScreenPermission` + توحيد مصادر المسار الثلاثة (المسارات القديمة fallback) + تغطية الصفحات التبويبية | `config/screens/*`, صفحات products/inventory/sales/finance | كبير |
| **3 — الأبعاد المالية** | ربط حدود المبالغ في الخدمات (discount/return/adjust/expense) + إخفاء cost/profit في DTOs + `REQUIRE_APPROVAL` | خدمات sales/purchases/inventory/finance/reports | كبير |
| **4 — المركزي** | `tenant_permission_limits` + توزيع config + مطابقة `routeManifest`/`platformPermissionCatalog` | `central-server/*`, `CentralFeaturePermissionService` | متوسط |
| **5 — مصفوفة الأدوار** | UI إدارة: مصفوفة (شاشة×تبويب×زر) + حدود مبالغ + نطاق فروع/مخازن لكل دور/مستخدم | `pages/admin/*` | متوسط |

كل مرحلة مستقلة وقابلة للنشر؛ المراحل 1–2 تحل مشكلة «المسار ≠ التبويب» المذكورة صراحة في البند.

---

## 8.5 نتائج المرحلة 0 (تدقيق آلي — `scripts/audit-permissions.mjs`)

التقرير الكامل: `docs/permissions-audit-report.md` (+ `.json`). أبرزه:

- **159 مسارًا** قورن بين المصادر الثلاثة: 135 مدخل `PAGE_VIEW_PERMISSIONS`، 129 قاعدة `ROUTE_PERMISSIONS`، 133 عنصر قائمة.
- **تضاربان مؤكدان** بين حارس المسار وقواعد المسار/التبويبات:
  - `/finance/debts` — الحارس يتطلب `finance.view` بينما القاعدة تتطلب `finance.debts.view` (مستخدم قد يجتاز أحدهما ويفشل في الآخر).
  - `/employees/payroll/notification-settings` — الحارس `employees.payroll.view` مقابل القاعدة `employees.payroll.manage`.
- **6 مسارات بلا صلاحية حارس إطلاقًا** (الحارس يسمح للجميع): `/crm` (قاعدة يتيمة بلا route)، و`/hr/alerts`، `/hr/attendance-devices`، `/hr/clearance`، `/hr/social-insurance`، `/hr/workforce-planning`.
- **أُصلحت لاحقًا**: أُضيفت PageSpecs للمسارات الستة (`hr_alerts`, `hr_workforce_planning`, `hr_clearance`, `hr_social_insurance`, `hr_attendance_devices`, `payroll_notifications`) + override لـ`/finance/debts` في `PAGE_VIEW_PERMISSIONS` + حذف قاعدة `/crm` اليتيمة — بعد الإصلاح: **0 تضارب، 0 مسار مكشوف** (إعادة تشغيل `node scripts/audit-permissions.mjs`).
- **ربط التبويبات (مرحلة 2 جزئية)**: رُبطت التبويبات التي تعبر حدود صلاحيات مختلفة — `AfterSalesPage` (تبويب analytics → `sales.analytics.view`)، `EmployeesPage` (تبويب attendance → `employees.attendance.view`؛ finance/analytics كانا مقيّدين بـmanage)، `StockTransfersPage` (تبويب summary → `inventory.view`). تبويبات صفحات HR الفرعية والتقارير تبقى تحت صلاحية الصفحة لأن الكتالوج لا يعرّف أكوادًا أدق لها — ربطها يتطلب توسيع `SectionSpec` بأكواد legacy مستقلة (مرحلة 5).
- **التبويبات**: 70 ملف صفحة يحوي تبويبات — 50 مفلترة بشكل ما (route-rules أو permission-checks أو platform-rbac) و**20 بلا أي فحص**، أغلبها صفحات HR (`clearance`, `benefits`, `discipline`, `organization`, `performance`, `self-service`, `social-insurance`, `training`, `workforce-planning`, `attendance-devices`) إضافة إلى `ReportsHubPage`، `AfterSalesPage`، مكوّنات `EmployeeTabs`/`StockTransfersTabs`/`SupplierHeader`.
- **حجم الكتالوج**: 4017 صلاحية دقيقة منها 511 صلاحية قسم/تبويب — يعزز حاجة التصميم لمصفوفة مجمّعة بدل 4000 صف في UI الأدوار.
- ملاحظة منهجية: تصنيف «تبويب محروس» heuristic على مستوى الملف؛ بعض الصفحات قد تفوّض الفحص لمكوّنات أبنائها — القائمة نقطة بداية للمراجعة اليدوية في المرحلة 2 وليست أحكامًا نهائية.

## 9. مخاطر وأسئلة مفتوحة

1. **حجم الكتالوج**: ~آلاف الأكواد المحتملة بعد التفكيك الهرمي — يحتاج سياسة «توليد عند الطلب» بدل إدراج كل تبويب/زر كصف في مصفوفة الأدوار (مصفوفة مجمّعة على مستوى الشاشة افتراضيًا).
2. **الأداء**: `loadSets` مخزّن مؤقتًا لكل مستخدم؛ إضافة أبعاد scope/amount تتطلب إما توسيع الكاش أو جلب كسول — يجب قياسه على أكبر قاعدة.
3. **التبويبات الديناميكية**: بعض الصفحات تبني تبويبات من البيانات (مثل tabs حسب حالة طلب) — `tab_key` يجب أن يكون من سجل ثابت لا من بيانات حية.
4. **`scope` الحالي**: إما نعيد تعريفه بـ context struct (كسر توقيع ~مئات الاستدعاءات) أو نبقيه ونسنده للـ path فقط — التوصية: نسخة جديدة `evaluate(user, code, ctx)` وترك `can/require` كغلاف يمرر `{path: scope}`.
5. **العملات**: حدود المبالغ تحتاج `currency`؛ النظام متعدد العملات جزئيًا — نحتاج قرارًا: حد واحد بالعملة الأساسية أم لكل عملة.
6. **التوافق مع `OPEN_ALL_PAGES`**: وضع «افتح كل الصفحات» يتجاوز البوابات — يجب أن يبقى مقصورًا على التطوير ويُوثَّق أنه لا يعفي الخدمات من `require`.
7. **سؤال للمراجعة**: هل تُدار الأدوار متعددة لكل مستخدم (RoleAssignment) أم دور واحد + overrides كما هو حاليًا؟ المخطط المقترح يفترض تعدد أدوار؛ إن كان الدور الواحد قرارًا نهائيًا نبسّط `UserRoleAssignment`.

## 8.6 حالة التنفيذ — المرحلتان 1 و2

**المرحلة 1 (منفّذة)**: `AuthorizationService.evaluate` يقيّم الأبعاد central → screen → grant → scope → amount → sensitivity ويعيد `Decision` بسبب الرفض. `PermissionChecker.can/require/requireAny` تفوّض له دون كسر التوقيعات. الجداول `user_warehouse_grants` + `permission_amount_limits` + عمود `permissions.sensitivity` في `part85` (201_authorization_dimensions). أكواد `finance.cost.view`/`finance.profit.view` + بذر اشتقاقها للأدوار المالية فقط.

**المرحلة 2 (منفّذة)**:
- `src/config/screenRegistry.ts` — المصدر الموحد الذي يدمج `ROUTE_PERMISSIONS` + عناصر `NAV_GROUPS` (بنفس منطق `NavigationService.permissionRoutes`: صلاحيات العنصر تتقدم على المجموعة، وأول قاعدة لنفس المسار تكسب) + `PAGE_VIEW_PERMISSIONS`. `screenRequirementFor(path)` يعيد المتطلب الموحّد (قاعدة المسار all/any + كود ui.* للصفحة، مع دعم الأنماط `:param`) — مطابق لدلالة RouteGuard + useRouteAccess معًا.
- `PermissionSeeder.seedScreenPermissions` يملأ `screen_permissions` من `listScreens()` (154 شاشة) — آمن للتكرار ويتخطى القواعد القديمة بلا الجدول.
- بُعد `screen` في `AuthorizationService.checkScreen` — يعمل عند تمرير `ctx.path` فقط، فيستفيد كل `can(code, scope)` الحالي تلقائيًا دون كسر استدعاءات الخدمات بدون سياق.
- `src/hooks/domains/auth/useScreenPermission.ts` — `useScreenPermission(path)` و`useScreenTabPermission(path, tabKey)`؛ التبويب يُقيَّد فقط إذا كانت صلاحية قسمه معرّفة في المصفوفة (fail-open على المفاتيح غير المعرّفة).
- اختبار `test/screen-registry.test.ts` (6 اختبارات خضراء) + `audit-permissions.mjs` ما زال 0 تضارب.

**ما تبقّى**: ربط حدود المبالغ وscope فعليًا في الخدمات (مرحلة 3)، إخفاء cost/profit في الـDTOs، `REQUIRE_APPROVAL` → طلبات موافقة فعلية، `tenant_permission_limits` مركزي (مرحلة 4)، ومصفوفة الأدوار UI (مرحلة 5). ملاحظة: `NavigationService.getRequiredPermissionGroups` و`RouteGuard` ما زالا يقرآن من مصفديهما القديمتين — الدمج الكامل لهما داخل ScreenRegistry مؤجل لتفادي كسر دلالة `{all, any}` التي تعتمدها الاختبارات.

## 8.7 حالة التنفيذ — المرحلة 3 (جزئية)

- **سياق موسّع**: `PermissionChecker.can/require/canAny/requireAny` و`PermissionService` تقبل `ctx?: AuthContext` اختياريًا (branchId/warehouseId/amount/currency/operation) دون كسر التوقيعات — `{path: scope, ...ctx}`.
- **حدود المبالغ مربوطة فعليًا**: `createSalesInvoice` يعيد تقييم `ui.sales.invoices.create` بعد احتساب `totals.totalAmount` الفعلي مع `branchId`/`warehouseId` — فيفرض `permission_amount_limits` (DENY يرفض، REQUIRE_APPROVAL ينشئ طلبًا).
- **REQUIRE_APPROVAL → طلبات حقيقية**: `AuthorizationService.createAmountApprovalRequest` يدرج في `approval_requests` (request_type='OTHER', reference_type='AUTH_AMOUNT_LIMIT', payload يحمل operationCode/amount/limit) مع عدم تكرار الطلب المعلق لنفس (مستخدم، عملية)، ويعيد `approvalRequestId` في Decision + audit. `branch_id` يُحل من ctx ثم users_branches ثم أول فرع. تنفيذ الأثر بعد الموافقة يبقى لكل عملية على حدة (لاحقًا).
- **إخفاء التكلفة/الربح في DTOs**: `invoiceQueries_part02` يصفّر `totalCost`/`grossProfit`/`unitCost`/`totalCost(item)`/`profit` في `fetchInvoiceStats` و`fetchInvoiceById` لمن لا يملك `finance.cost.view`/`finance.profit.view` (fallback `ui.finance.overview.view` للترحيل)؛ `ProductService.productColumns` يعتمد `finance.cost.view` مع نفس البديل.
- **اختبارات**: `test/authorization-dimensions.test.ts` (3 اختبارات: DENY، REQUIRE_APPROVAL+dedupe، screen) — كلها خضراء. `tsc` نظيف؛ فشل `sales.test.ts`/`permissions.test.ts` الموجود مسبقًا (`mustChangePassword`/`invoice_status`) غير مرتبط.

**متبقٍ من المرحلة 3**: ربط amount/scope في بقية الخدمات المالية (مدفوعات/مشتريات/مصروفات)، إخفاء cost/profit في DTOs أخرى (قوائم الأسعار، تقييم المخزون، التقارير)، وتنفيذ الأثر بعد اعتماد طلب المبلغ.

### المرحلة 3 — توسعة ربط amount/scope (دفعة ثانية)

رُبط `ctx {branchId, amount, operation}` في الخدمات المالية الرئيسية (فوق `OperationApprovalGate` القائم — الطبقتان متكاملتان: policy gate للاعتمادات التجارية، و`permission_amount_limits` للحدود الصلبة لكل دور/مستخدم):

- `CustomerService.recordPayment` — سند القبض (amount + branchId بعد حل الفرع من الصندوق).
- `SupplierService.recordPayment` — سند الصرف للمورد.
- `CashierService.addExpense` — المصروفات النقدية.
- `PurchaseService.createPurchase` — إجمالي فاتورة الشراء بعد landed costs والضريبة.
- `PurchaseService.recordPayment` — سند صرف فاتورة شراء (على `value` الفعلي المخصوم).

`tsc --noEmit` نظيف. متبقٍّ: DTOs تكلفة/ربح إضافية (قوائم أسعار/مخزون متقدمة)، وتنفيذ الأثر بعد اعتماد طلب المبلغ، و`tenant_permission_limits` (مرحلة 4).

### المرحلة 3 — إخفاء cost/profit في DTOs (دفعة ثانية)

- `src/services/domains/auth/sensitiveFields.ts` جديد: `financialFieldVisibility()` + `maskSensitiveFields/maskCostFields/maskProfitFields` — مصدر موحد (finance.cost.view / finance.profit.view مع fallback ui.finance.overview.view) يغطي camelCase وsnake_case.
- `invoiceQueries_part02` رُحّلت للمساعد المشترك (نفس سلوك الإخفاء السابق).
- `InventoryServicePart01.queryWarehouseStock`: `costPrice` يُصفَّر لغير المصرَّح.
- `BatchService.getBatchesForProduct/getBatchById`: `costPrice` للدفعات يُصفَّر لغير المصرَّح.
- `ProductService.productColumns` + `invoiceQueries_part02` (سابقًا): التكلفة/الربح في المنتجات والفواتير.

`tsc --noEmit` نظيف. متبقٍّ: DTOs متقدمة أخرى (InventoryIntelligenceService/InventoryServicePart04-14 — معظمها عمليات داخلية أو صفحات محمية بـinventory.view)، وتنفيذ الأثر بعد اعتماد طلب المبلغ، وtenant_permission_limits (مرحلة 4).

### المرحلة 3 — تنفيذ الأثر بعد اعتماد طلب المبلغ (مكتمل)

`AuthorizationService.consumeApprovedAmountRequest`: عند REQUIRE_APPROVAL يبحث عن طلب AUTH_AMOUNT_LIMIT معتمد (APPROVED + reference_id IS NULL) لنفس المستخدم والعملية (`operationCode` في payload)، بشرط أن requested_value ≥ المبلغ المطلوب وتطابق الفرع عند توفره. عند التطابق يستهلكه ذرّيًا (`reference_id = 'consumed:<id>'` بشرط مرجعي IS NULL — single-use) ويسجل audit 'استهلاك اعتماد مبلغ' ثم يسمح بالعملية. الاختبار `authorization-dimensions.test.ts` يغطي الدورة كاملة: رفض → طلب معلق → اعتماد → سماح → استهلاك → رفض مجدد بطلب جديد (4/4 خضراء).

### المرحلة 4 — القيود المركزية tenant_permission_limits (مكتملة جزئيًا)

- `central-server/lib/db.js`: جدول `tenant_permission_limits` (tenant_id, permission_code, max_amount, cost_visible, profit_visible, disabled).
- `central-server/routes/config.js`: `GET/PUT /admin/config/permission-limits` بنفس نمط tenant_feature_config (tenant-scoped، '' = عام، تسجيل تدقيق ضمني عبر middleware).
- `centralConfigStore.getCachedPermissionLimits()`: يقرأ `config.permissionLimits` من الـblob الموقّع.
- `AuthorizationService.checkCentralPermissionLimits`: يُفرض في بُعد `central` قبل الشاشة — disabled=1 رفض كلي، maxAmount سقف نهائي لا يتجاوزه اعتماد محلي (حتى لو على_exceed=REQUIRE_APPROVAL)، وcost_visible/profit_visible=0 يمنعان حساسية COST/PROFIT.

**فجوة معروفة**: معالج `/api/v1/configuration/current` الذي يبني الـconfig الموقّع غير موجود في central-server هذا المستودع (موجود فقط في routeManifest كقائمة سماح لـElectron proxy) — لذا دمج permissionLimits في الـblob الموقّع يحتاج إما تنفيذ ذلك المعالج أو نشرًا خارجيًا. CRUD الإداري والفرض المحلي جاهزان.

التحقق: tsc نظيف، authorization-dimensions 4/4.

### المرحلة 5 — واجهة إدارة الأبعاد (مكتملة)

- `src/services/domains/auth/permissions/authorizationAdminService.ts`: CRUD لـ`permission_amount_limits` (upsert مع ON CONFLICT، تحقق من المبلغ غير السالب، audit) و`user_warehouse_grants` (setWarehouseGrants_list semantics: فارغ = غير مقيّد) — كلها خلف `roles.manage`.
- `AdminRolesTab`: قسم «حدود المبالغ» تحت المصفوفة — نطاق ROLE (الدور المحدد) أو USER (قائمة مستخدمين)، جدول بالحدود + نموذج إضافة/حذف، datalist بأكواد الكتالوج.
- `AdminUsersTab`: زر «نطاق المخازن» لكل مستخدم (بجانب نطاق الفروع/الأقسام) — modal بنفس نمط branch-scope مع توضيح دلالة «فارغ = كل المخازن».

`tsc --noEmit` نظيف.

### ربط scope المخازن في عمليات التحويل والتسوية

- `AuthContext.warehouseIds?: string[]` جديد — كل المخازن تُقيَّم ضد `user_warehouse_grants` (وقاعدة «فارغ = غير مقيّد» + قبول مخزن يتبع فرعًا مسموحًا).
- `InventoryServicePart08.createTransferRequest`: ctx بالـwarehouseIds للمخزنين المصدر والوجهة.
- `InventoryServicePart10.receiveTransfer`: إعادة تقييم `inventory.transfer.receive` داخل المعاملة بعد جلب معرفات المخازن من سجل التحويل.
- `InventoryServicePart14.createAdjustment`: ctx بـwarehouseId للمخزن.

`tsc` نظيف؛ authorization-dimensions 4/4 + stock-ledger-balance 1/1.

### إخفاء cost/profit في خدمات الذكاء المخزني (دفعة أخيرة)

- `InventoryIntelligenceService.getLowMarginAlerts`: التقرير نفسه هامش ربح — يُرجع [] لمن لا يملك `finance.profit.view`.
- `getDeadStock`: `unitCost`/`stockValue` تُصفَّر بلا `finance.cost.view`، و`reason` يُبنى بدون القيمة النقدية (الفلتر minValue يعمل على القيمة الحقيقية داخليًا).
- `getCountVarianceAnalysis`: `unitCost`/`varianceValue` تُصفَّر قبل الاشتقاق — severity والتجميعات تخرج أصفارًا دون تسريب.
- `InventoryServicePart12.getReorderPlanning`: `unitCost`/`suggestedOrderValue` مُقنَّعة في الصف المُرجع.
- `InventoryServicePart13`: `reconcileInventoryWithGL` يتطلب `finance.cost.view` صراحة (التقرير كله تقييم نقدي)؛ `getReconciliationLogs` يُقنّع الحقول النقدية الخمسة.
- `suggestTransfers` لا يسرّب تكلفة في مخرجاته — لم يُمسّ.

ملاحظة: `inventory-intelligence.test.ts` يظهر فشلان بتناقض عامل 100 في قيم نقدية (200 مقابل 20000، 11 مقابل 1100) — مرتبط بتحويل scaling الذي يجريه المستخدم (part139/unscaleMoneyRow)، وليس بالإخفاء (المستخدم admin يملك ALL والتخطيط/الهوامش تعمل). ترتيب ORDER BY بقيمة التكلفة يبقى تسريبًا نسبيًا مقبولًا وموثقًا.

### دفعة أخيرة: شركاء + لوحة التحكم + تقارير المبيعات

- `PartnerService.postTransaction`:(ctx) بُعد amount/branchId/operation='partners.transaction' على كود الإجراء (adjust/transactions) — تسويات الشركاء وحدودها صارت مقيّدة.
- `AccountingService.getDashboardMetrics`: grossProfit/netProfit/profitMargin مُقنَّعة بلا finance.profit.view؛ inventoryValuationCost بلا finance.cost.view (valuationSale يبقى — سعر بيع).
- `getSalesTrendLast7Days`/`getCategorySalesReport`/`getBrandSalesReport`: حقل profit مُقنَّع بلا finance.profit.view — كانت تتطلب sales.view فقط.

`tsc --noEmit` نظيف.

ملاحظة: خطأ `useAppStartup.ts` المؤقت (ReservationService) اختفى في إعادة الفحص — تعديل المستخدم جارٍ ويعمل.

### إخفاء الربح في مقارنات ولوحة AccountingService (إكمال)

- `getMonthlyComparison`/`getDailyComparison`/`getYearlyComparison`: `profit` في currentMonth/previousMonth مُقنَّع بلا finance.profit.view (كانت تتطلب sales.view/ui.sales.invoices.view فقط).
- `getNetSalesAnalysis`: `netProfit` مُقنَّع بلا profit view، `returnedCost` بلا cost view.
- التقارير المالية heavyweight (P&L, purchase/expense reports, valuation) تبقى خلف `ui.finance.overview.view`/`finance.view` — بوابات مالية أصلًا.

`tsc --noEmit` نظيف.
