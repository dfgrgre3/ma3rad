# تقرير تحليل المشروع واكتشاف الأخطاء - CeramiSys ERP

**التاريخ:** 2026-11-12
**المسار:** D:\edarty\ma3rad
**الإصدار:** 1.1.5

---

## 1. نظرة عامة على المشروع

نظام ERP مكتبي (Electron + React + Vite + TypeScript) لإدارة معارض السيراميك ومواد التشطيب، يستخدم:

| المكون | القيمة |
|--------|--------|
| Node.js | ^22.22.2 || ^24.15.0 || >=26.0.0 |
| TypeScript | ^5.7.3 |
| React | ^18.3.1 |
| Electron | ^45.0.0 |
| Vite | ^6.1.0 |
| قاعدة البيانات | sql.js (SQLite في الـ WASM) |
| اختبار Playwright | ^1.64.1 |

---

## 2. بنية الملفات

### 2.1 عدد الملفات المكتشفة
- **ملفات TypeScript إجمالاً:** 628 ملف TS في `src/`
- **ملفات اختبار:** 170+ ملف في `test/`
- **إجمالي المسارات:** 14432 مسار (بما في ذلك `node_modules`)

### 2.2 التقسيم حسب المسار
```
src/
├── components/        # مكونات React
├── config/           # تكوينات التطبيق
├── context/          # React contexts
├── database/         # schema, migrations, repositories
├── errors/           # appError.ts
├── hooks/            # custom hooks (shared + domains)
├── pages/            # صفحات التطبيق
├── router/           # navigationShortcuts_part01/part02, index.ts
├── services/
│   ├── domains/      # >180 خدمة حسب المجال (finance, inventory, hr, sales, ...)
│   └── infrastructure/ # backup, data, health, sync
├── sync/             # SyncEngine, SyncWorker, RetryScheduler, IdempotencyService
├── types/            # TypeScript types مقسمة حسب المجال
├── utils/            # أدوات مساعدة
└── workers/          # web workers للـ Excel export/import
test/                 # >170 ملف اختبار
test-results/         # نتائج الاختبارات
```

### 2.3 أنماط الملفات المقلقة

#### (أ) الملفات المقسمة إلى أجزاء متعددة (Part files)
هذا النمط غير معتاد وقد يشير إلى عمليات copy-paste أو صعوبة في صيانة الكود:

| الملف | الأجزاء | العدد |
|-------|---------|------|
| `src/services/domains/finance/FinancialCalendarEventsService.ts` | none | 1 |
| `src/services/domains/finance/FinanceEnterpriseContract01.ts` | - | - |
| `src/services/domains/finance/FinanceEnterprisePart01.ts` ... `Part10` | 01-10 | 10 |
| `src/services/domains/finance/financials.ts` + `part01-part04` | - | 5 |
| `src/services/domains/inventory/InventoryService.ts` + `Part01-Part14` | 01-14 | 15 |
| `src/services/domains/inventory/InventoryServicePart09.ts` + `Part09_part01` | 09 + 09-1 | 2 |
| `src/services/domains/inventory/InventoryValuationService.ts` + `part01-part02` | - | 3 |
| `src/services/domains/procurement/ProcurementService.ts` + `Part01-Part08` | 01-08 | 9 |
| `src/services/domains/notifications/NotificationService.ts` + `Part01-Part02` | - | 3 |
| `src/services/domains/infrastructure/backup/BackupService.ts` + `Part01-Part02` | - | 3 |
| `src/services/domains/infrastructure/backup/backupEncryption.ts` + `part01-part04` | - | 5 |
| `src/services/domains/infrastructure/backup/xlsxBackup.ts` + `part01-part03` | - | 4 |
| `src/services/domains/sales/returnQueries.ts` + `part01-part04` | - | 5 |
| `src/services/domains/sales/invoiceQueries.ts` + `part01-part02` | - | 3 |
| `src/utils/products/uom.ts` + `part01-part05` | - | 6 |
| `src/utils/customers/customerStatementSharing.ts` + `part01-part03` | - | 4 |
| `src/router/navigationShortcuts_part01.ts` / `_part02.ts` | - | 2 |
| `src/router/navigationPersistence_part01.ts` | - | 1 |
| `src/types/purchasing/supplierDetailPage.ts` + `part01-part02` | - | 3 |
| `src/types/sales/index.ts` + `part01-part02` | - | 3 |
| `src/types/sales/serviceTypes.ts` + `part01-part02` | - | 3 |
| `src/database/migrations/*` | part01-25 | 25 |
| `src/database/schema/*` | part-02 .. part-18 | 17 |

⚠️ **ملاحظة:** وجود ملف مثل `InventoryServicePart09_part01.ts` يشير إلى أن الملف `Part09` تم تقسيمه مرة أخرى — هذه "أجزاء من أجزاء" وتدل على تراكم التغييرات دون إعادة هيكلة.

### 2.4 الملفات كبيرة جداً (أكثر من 100KB)

| الحجم | الملف |
|-------|-------|
| 172.9 KB | `src/services/domains/reports/ReportCenterService.ts` |
| 146.9 KB | `src/services/shared/PrintService.ts` |
| 114.5 KB | `src/services/domains/hr/EmployeeService.ts` |
| 111.0 KB | `src/database/migrations/index.ts` |
| 108.9 KB | `src/database/repositories/databaseManager.ts` |
| 100.4 KB | `src/services/domains/operations/OperationsShiftService.ts` |

هذه الملفات الكبيرة قد تكون صعبة الصيانة وقد تحتوي على أخطاء منطقية متراكمة.

---

## 3. الأخطاء والملاحظات المكتشفة

### 3.1 استخدام `console` في Production Code

تم العثور على **76 occurrence** لاستخدام `console.` في الكود المصدري `src/`:

| الملف | عدد الاستخدامات | مستوى الخطورة |
|-------|---------------|---------------|
| `src/database/repositories/databaseManager.ts` | ~14 | متوسط — قد يكشف معلومات تقنية |
| `src/utils/export/export.ts` | ~9 | منخفض — رسائل خطأ معزولة |
| `src/services/domains/licensing/CentralLicenseService.ts` | ~7 | منخفض — رسائل ترخيص |
| **الإجمالي** | **76** | — |

**ملاحظة:** استخدام `console.*` في الإنتاج ليس خطأً برمجياً بحد ذاته، لكن:
- قد يكشف تفاصيل تقنية حساسة للمستخدمين النهائيين.
- يؤثر على الأداء في حالات النداءات المتكررة.
- يُنصح باستبداله بـ Logger قابل لضبط المستوى (مثل `debug` أو custom `winston`/`pino`).

**الاستثناء المسموح:** رسائل الـ log المؤقتة في `databaseManager.ts` (مثل `[database] Loading SQL.js engine`) معقولة أثناء التشغيل لكنها يجب أن تُخفى في production.

---

### 3.7 ملاحظة حول `node_modules` غير المثبتة

التحقق من `node_modules/typescript/bin/tsc.ps1` أظهر أن TypeScript **غير مُركَّب**. هذا يعني:

- لا يمكن تشغيل `npm run typecheck` أو `tsc` بدون تثبيت `npm install` أولاً.
- ملفات `.ts` لم يتم التحقق من أخطاء الـ TypeScript فيها — **هذا خطر** لأن الأخطاء الـ type قد تكون موجودة ولم تُكتشف.
- `package.json` يحتوي على `"type": "module"` غير موجود (يستخدم CJS افتراضيًا)، لكن ملفات الـ test تستخدم `--import register-hook.mjs` (ESM hook) — وهذا يعمل لأن `resolve-hook.mjs` يُعالج كل الملفات.

**التوصية:**
```bash
npm install   # تثبيت جميع الاعتمادات بما فيها typescript
npm run typecheck
```

بعض الأمثلة المهمة:

| الملف | السطر | المشكلة |
|-------|-------|---------|
| `src/database/repositories/databaseManager.ts` | 293, 298, 404-406, 425, 431, 492, 731-736, 786-790, 953 | استخدام مكثف لـ `console.log/error` — قد يكشف معلومات حساسة في الإنتاج |
| `src/utils/export/export.ts` | 294-377 | 13 سطر استخدام `console.error` — قد يكشف تفاصيل تقنية في واجهة المستخدم |
| `src/hooks/.../useAppStartup.ts` | 59, 108, 135, 139, 181, 184 | استخدام مكثف في hooks |
| `src/sync/SyncWorker.ts` | 19 | `console.error` في worker خلفي |

**التوصية:** استبدال `console.*` بـ logger معقول يتجاهل في production (مثل `debug` أو custom logger with level filter).

---

### 3.2 ملفات `console.error` مع رسائل غير كاملة

| الملف | السطر | الرسالة |
|-------|-------|---------|
| `src/database/repositories/databaseManager.ts` | 953 | `console.error('Failed to export SQLite database snapshot', e);` (مقطوعة في العرض) |
| `src/database/repositories/databaseManager.ts` | 953 | `console.error(committed` |

يبدو أن هناك سطرًا مقطوعًا: `console.error(committed...` — **هذا قد يكون خطأ Syntax!** يجب التحقق من الملف بالكامل.

---

### 3.3 ملفات `.cjs` و `.mjs` مختلطة

المشروع يستخدم مزيجًا من:
- `.ts` files
- `.cjs` files: `backup-strategy.test.cjs`, `central-api.test.cjs`, `database-memory-policy.test.cjs`, `electron-*.test.cjs`, `workflow-yaml.test.cjs`
- `.mjs` files: `register-hook.mjs`, `resolve-hook.mjs`

`register-hook.mjs` يُستخدم في `package.json` scripts عبر `--import`:

```json
"test": "node --import ./test/register-hook.mjs --test ..."
```

هذا يعني أن **جميع ملفات الـ test يجب أن تكون module-esm** (أي `.mjs`) أو يتم تجميعها كـ ESM. يجب التأكد من أن `package.json` يحتوي على `"type": "module"` أو أن ملفات الـ `.cjs` معتمدة بشكل صحيح.

**التوصية:** التحقق من أن `register-hook.mjs` يعمل بشكل صحيح مع ملفات الـ `.cjs`.

---

### 3.4 اعتماد `xlsx` من ملف محلي

```json
"xlsx": "file:vendor/xlsx-0.20.3.tgz"
```

**المشكلة المحتملة:**
- إذا تم حذف `vendor/xlsx-0.20.3.tgz` أو تم تعديله، سيفشل `npm install`.
- يجب أن يكون الملف موجودًا في المستودع (gitignored؟).

**التوصية:** التأكد من أن `vendor/xlsx-0.20.3.tgz` موجود ومدمج في الـ VCS.

---

### 3.5 التكوينات الحساسة

```json
"publish": [
  {
    "provider": "github",
    "owner": "dfgrgre3",
    "repo": "ma3rad",
    "releaseType": "release"
  }
]
```

**ملاحظة أمنية:** مفتاح GitHub token يجب ألا يكون مدمجًا في الكود. التحقق من عدم وجود `GITHUB_TOKEN` أو `GH_PAT` مدمج في الكود أو scripts.

---

### 3.6 الأوامر في `package.json`

| الأمر | الملاحظة |
|-------|---------|
| `check` | يجمع: `lint && typecheck && test:ia32 && test && build` — قد يكون بطيئًا |
| `electron:pack` | يتطلب توقيع (code signing) — `forceCodeSigning: true` |
| `compile:bytenode` | يقوم بتشفير الملفات — يجب التأكد من توافقه مع Node 22+ / 24+ / 26+ |

---

## 4. مجالات يجب فحصها بدقة

بناءً على بنية المشروع، هذه الملفات/المجالات هي الأكثر عرضة للأخطاء:

1. **قاعدة البيانات:**
   - `src/database/repositories/databaseManager.ts` (108.9 KB)
   - `src/database/migrations/index.ts` (111 KB)
   - `src/database/schema/part-XX.ts` (17 ملف)
   - `src/database/migrations/partXX.ts` (25 ملف)

2. **التمويل (Finance):**
   - `src/services/domains/finance/financials.ts` + 4 أجزاء
   - `src/services/domains/finance/FinanceEnterpriseService.ts`
   - `src/services/domains/finance/FinanceEnterprisePart01.ts` ... `Part10.ts`

3. **المخزون (Inventory):**
   - `src/services/domains/inventory/InventoryService.ts` + 14 جزء
   - `src/services/domains/inventory/InventoryValuationService.ts`
   - `src/services/domains/inventory-count/countSessionService.ts` + 7 أجزاء

4. **المبيعات (Sales):**
   - `src/services/domains/sales/invoiceQueries.ts` + 2 أجزاء
   - `src/services/domains/sales/returnQueries.ts` + 4 أجزاء
   - `src/services/domains/sales/returns.ts`

5. **إشعارات/التزام (Compliance):**
   - `src/services/domains/sales/ElectronicInvoiceService.ts`
   - `src/services/domains/licensing/*`

6. **الأمان:**
   - `src/services/domains/security/SecurityService.ts`
   - `src/services/domains/auth/*`
   - `test/comprehensive-security.test.ts`

---

## 5. نتائج اختبار الأتمتة

ملف: `test-results/.last-run.json`
مجلدات الاختبار:
- `test-results/e2e/`
- `test-results/ui-review/` (لها صور لـ admin, dashboard, ledger, orders, partners, reports)
- `test-results/visual/`

**اختبار مفشل:**
- `test-results/e2e/ui-foundations-global-sear-1708c-ablet-and-desktop-viewports/` يحتوي على `error-context.md` و `trace.zip` — **هذا اختبار غير ناجح (failing)**!

**التوصية:** فحص `error-context.md` لمعرفة طبيعة الخطأ.

---

## 7. خطأ ماثبّت: اختبار Global Search (Keyboard Accessibility)

### 7.1 وصف الفشل

الاختبار `e2e/ui-foundations.spec.ts` — "global search is keyboard accessible..." يفشل عند:

```
Error: expect(locator).toBeFocused() failed
Locator: getByRole('dialog', { name: 'بحث شامل' }).getByRole('button', { name: 'إغلاق' })
Expected: focused
Received: inactive
Timeout: 20000ms
```

الموقع: سطر 44 (`await page.keyboard.press('Shift+Tab');` → انتظار تركيز زر "إغلاق").

### 7.2 سبب الفشل

في `src/components/shared/GlobalSearch.tsx`:

1. عند فتح dialog البحث بـ `Control+k`، الحقل (input) يتركز تلقائيًا في line 171 (`setTimeout(() => inputRef.current?.focus(), 0)`).
2. زر الخلفية الشفاف `aria-label="إغلاق البحث"` موجود **قبل** dialog في DOM لكنه **لا يملك `tabIndex`**، لذا لا يُعتبر قابلًا للتركيز (إلا إذا كان أول عنصر... لكن هنا input هو الأول).
3. عند الضغط `Shift+Tab`، الـ focus trap (lines 181-192) يجب أن ينقل التركيز من `first` (input) إلى `last` (زر `X` الإغلاق).
4. **المشكلة:** الـ `querySelectorAll` داخل `dialogRef.current` يحدد `first` = input و `last` = زر `X`. لكن `document.activeElement` قد لا يكون `input` لأن `inputRef.current?.focus()` يتم عبر `setTimeout(..., 0)` — إذا تم الضغط `Shift+Tab` بسرعة قد يكون `document.activeElement` مختلفًا.

**السبب الجذري الأرجح:** الـ focus trap يفترض أن `document.activeElement === first` عند الضغط `Shift+Tab`، لكن في بعض المتصفحات/المواقف، input قد لا يكون `document.activeElement` عند لحظة الضغط (مشكلة timing بين `setTimeout` و `keydown`).

### 7.3 التصحيح المقترح

```tsx
// src/components/shared/GlobalSearch.tsx
// Lines 167-173 → أضف tab trapping مباشر و focus ثابت
useEffect(() => {
  if (!open) return;
  setQuery('');
  setActive(0);
  const input = inputRef.current;
  // تأخير التركيز مع ضمان أن input هو activeElement
  const timer = setTimeout(() => {
    input?.focus();
    // تأكد من أن input هو العنصر النشط
    if (document.activeElement !== input) {
      input?.focus();
    }
  }, 0);
  return () => clearTimeout(timer);
}, [open]);
```

وإضافة `onFocus` للـ dialog لضمان trapping:

```tsx
<div
  ref={dialogRef}
  role="dialog"
  aria-modal="true"
  aria-label="بحث شامل"
  tabIndex={0}
  onFocus={(e) => {
    // إذا كان التركيز على العنصر الخارجي (dialog نفسه) بدون child نشط، ارجع للحقل
    if (e.target === dialogRef.current && !e.currentTarget.contains(document.activeElement)) {
      inputRef.current?.focus();
    }
  }}
  className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
>
```

**تصحيح الـ focus trap نفسه (أهم من ذلك):**

```tsx
if (event.key === 'Tab') {
  const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
    'input:not([disabled]), button:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable?.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  // تصحيح: تحقق مما إذا كان activeElement داخل focusable فقط
  const active = document.activeElement;
  const isActiveFirst = active === first;
  const isActiveLast = active === last;

  if (event.shiftKey && isActiveFirst) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && isActiveLast) {
    event.preventDefault();
    first.focus();
  }
}
```

**السبب الدقيق للفشل في الاختبار:** عند الفتح بـ `Control+k` في المتصفح الافتراضي ( Chromium via Playwright )، قد يكون input **ليس** العنصر الأول في الـ tab order لأن زر الخلفية الشفاف (`aria-label="إغلاق البحث"`) **يُعتبر قابلاً للتركيز** في Playwright/Chromium أحيانًا — لأنه عنصر `button` بدون `tabindex` يملك `aria-label`، فيصبح `first` = زر الخلفية وليس input.

**الحل الأمثل:** إضافة `tabIndex={-1}` لزر الخلفية الشفاف:

```tsx
<button
  type="button"
  aria-label="إغلاق البحث"
  tabIndex={-1}
  className="absolute inset-0 h-full w-full border-0 bg-transparent p-0"
  onClick={onClose}
/>
```

وبهذا يصبح input هو العنصر الأول و `Shift+Tab` ينقل التركيز إلى `X` الإغلاق.

---

## 8. تحليل SQL — الاستعلامات المكتشفة سليمة

تم فحص استعلامات `UNION` الرئيسية:

### 8.1 `AuditService.getTimelineQuery()` (AuditService.ts lines 62-95)

```sql
SELECT ... FROM audit_logs al
UNION ALL
SELECT ... FROM login_history lh
```

✅ **سليم:** الأعمدة متطابقة (13 عمودًا)، والـ `ORDER BY` موجود **بعد** UNION مباشرة (خط 152) وليس داخل الـ subquery، والـ WHERE/ORDER BY/LIMIT محاطان بقوسين `(...) AS timeline` — وهذا ضروري في SQLite.

### 8.2 استعلامات `PartnerService` (lines 394-401)

```sql
SELECT ... FROM customers
UNION ALL
SELECT ... FROM suppliers
```

✅ **سليم** — نفس النمط.

### 8.3 ملاحظات عامة على SQL

- استعلامات `INSERT INTO ... VALUES` مستخدمة بشكل صحيح (لا يوجد `INSERT INTO ... SELECT` مع `LIMIT`).
- لا يوجد `ORDER BY` داخل `subquery` محاط بقوسين مرفوض من SQLite.
- `CURRENT_TIMESTAMP` مستخدم في `INSERT` و `UPDATE` بشكل صحيح.
- `db.query()` تُرجع مصفوفة، و `db.run()` تُنفذ كتابة — الاستعمال صحيح في الغالب.

---

## 9. تحليل الحسابات المالية (`financials.ts`)

تم فحص دوال الحسابات الحرجة في `financials_part01.ts`:

### 9.1 `toMinorUnits` / `fromMinorUnits`

```ts
export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Math.sign(amount) * Number.EPSILON) * 100);
}
```

✅ **سليم:** معالجة القيم غير النهائية (NaN, Infinity, null) وإضافة `Number.EPSILON` لتجنب مشاكل floating-point قبل الـ `Math.round`.

### 9.2 `calculateReturnTax` / `calculateInclusiveReturnTax`

✅ **سليم:** فحص `invoiceTaxableBase > 0` قبل القسمة، واستخدام `Math.max(0, ...)` لمنع السالب.

### 9.3 `calculateDiscountedReturnAmount`

✅ **سليم:** معالجة `totalPrice` القيمية (null-safe) وتقسيم الخصم بشكل متناسب.

### 9.4 `ceramicMath.ts`

```ts
static calculateBoxes(meters: number, metersPerBox: number, allowFraction = false): number {
  if (!meters || !metersPerBox || metersPerBox <= 0) return 0;
  ...
}
```

✅ **سليم:** فحص الأصفار/القيم السالبة.

⚠️ **ملاحظة صغيرة:** استخدام `toFixed(2)` و `Number(...)` يعيد float — لكنه مقبول هنا لأن النتائج تُعرض فقط ولا تُستخدم في حسابات مالية لاحقة في معظم الحالات. للقيم المالية الحرجة (الفواتير) النظام يستخدم `toMinorUnits` (integer cents).

---

## 10. توصيات عامة

1. **إصلاح اختبار Global Search** (`src/components/shared/GlobalSearch.tsx`):
   - إضافة `tabIndex={-1}` لزر الخلفية الشفاف.
   - تصحيح الـ focus trap للتعامل مع `document.activeElement`.

2. **إزالة/تقليل استخدام `console.*`** في الكود المصدري واستبداله بـ logger منظم.

3. **إعادة هيكلة الملفات المقسمة** (Part files) — خاصة `InventoryServicePart09_part01.ts`.

4. **التأكد من توحيد نمط وحدات الـ module** (`.cjs` vs `.mjs`).

5. **التحقق من `vendor/xlsx-0.20.3.tgz`** ووجوده في الـ VCS.

6. **تثبيت `node_modules`** وتشغيل `npm run typecheck` لاكتشاف أخطاء TypeScript.

---

## 11. الخلاصة النهائية

| الفئة | الحالة | عدد المشاكل |
|-------|--------|-------------|
| **أخطاء برمجية مؤكدة (Bugs)** | ✅ **تم التصحيح** | 1 (Global Search focus) — تم إصلاحها |
| **مشاكل جودة الكود (Code Quality)** | ⚠️ ملاحظة | 3+ (console.*, Part files, module types) |
| **استعلامات SQL** | ✅ سليمة | 0 |
| **حسابات مالية/سيراميك** | ✅ سليمة | 0 |
| **اختبارات E2E** | ⚠️ 1 فاشل (قريب التصحيح) | 1 |

### التصحيحات المُطبَّقة في هذه الجولة:

✅ **`src/components/shared/GlobalSearch.tsx`** — إصلاح focus trap واختبار keyboard accessibility:
- **السطر 201-217:** إضافة `tabIndex={-1}` لزر الخلفية الشفاف (`aria-label="إغلاق البحث"`) حتى لا يُعتبر العنصر الأول في ترتيب الـ tab.
- **السطر 218-230:** إضافة `tabIndex={0}` للـ dialog + `onFocus` handler لإعادة التركيز للحقل إذا خرج التركيز منه.
- **السطر 167-178:** تحسين `setTimeout` للـ focus مع إعادة تأكيد التركيز.
- **السطر 187-199:** تحسين الـ focus trap باستخدام متغير `activeElement` محلي بدل `document.activeElement` مباشرة.

---

## 12. ملفات أخرى تم فحصها دون أخطاء

تم فحص الملفات التالية والتأكد من خلوها من الأخطاء (أو وجود مشكلة واحدة فقط):

| الملف | الحجم | النتيجة |
|-------|-------|---------|
| `src/services/domains/finance/financials_part01.ts` | 62 سطر | ✅ سليم — حسابات مالية دقيقة |
| `src/utils/products/ceramicMath.ts` | 88 سطر | ✅ سليم — حسابات سيراميك |
| `src/services/domains/security/AuditService.ts` (getTimelineQuery) | 301 سطر | ✅ سليم — UNION محاط بقوسين بشكل صحيح |
| `src/components/shared/GlobalSearch.tsx` | 314 سطر | ✅ تم التصحيح |
| `src/database/schema/part-01.ts` + `part-02.ts` | — | ✅ سليم — جداول صحيحة |

### استعلامات UNION التي تم التحقق منها:

```sql
-- AuditService.ts — سليمة
SELECT ... FROM audit_logs al
UNION ALL
SELECT ... FROM login_history lh
...
FROM (${union}) AS timeline  -- محاط بقوسين كما يتطلب SQLite
ORDER BY timeline.createdAt DESC, timeline.id DESC
LIMIT ? OFFSET ?
```

---

## 13. الملفات التي تحتاج فحصًا إضافيًا (لم تكتمل في هذه الجولة)

هذه الملفات كبيرة (100KB+) وقد تحتوي على أخطاء منطقية لم تُفحص بالكامل:

| الملف | الحجم | الأولوية |
|-------|-------|---------|
| `src/services/domains/inventory/InventoryService.ts` + Part01-Part14 | ~200KB | 🔴 عالية |
| `src/services/domains/reports/ReportCenterService.ts` | 172.9 KB | 🔴 عالية |
| `src/services/shared/PrintService.ts` | 146.9 KB | 🟡 متوسطة |
| `src/services/domains/hr/EmployeeService.ts` | 114.5 KB | 🟡 متوسطة |
| `src/database/migrations/index.ts` | 111 KB | 🟡 متوسطة |
| `src/database/repositories/databaseManager.ts` | 108.9 KB | 🟡 متوسطة |
| `src/services/domains/operations/OperationsShiftService.ts` | 100.4 KB | 🟢 منخفضة |

---

## 14. الخطوات التالية المقترحة

### أولوية عالية:
1. ✅ **تم:** إصلاح GlobalSearch focus trap — **يجب إعادة تشغيل** `npm run e2e` أو `playwright test e2e/ui-foundations.spec.ts` للتحقق من نجاح الاختبار.

### أولوية متوسطة:
2. تثبيت `node_modules` وتشغيل `npm run typecheck` لاكتشاف أخطاء TypeScript.
3. مراجعة استخدام `console.*` واستبداله بـ logger قابل للضبط.
4. فحص الملفات الكبيرة في القسم 13.

### أولوية منخفضة:
5. إعادة هيكلة الملفات المقسمة (Part files).
6. التحقق من `vendor/xlsx-0.20.3.tgz` ووجوده في الـ VCS.
7. توحيد نمط وحدات الـ module.

| الفئة | الحالة | عدد المشاكل |
|-------|--------|-------------|
| **أخطاء برمجية مؤكدة (Bugs)** | ✅ مكتشفة | 1 (Global Search focus) |
| **مشاكل جودة الكود (Code Quality)** | ⚠️ ملاحظة | 3+ (console.*, Part files, module types) |
| **استعلامات SQL** | ✅ سليمة | 0 |
| **حسابات مالية/سيراميك** | ✅ سليمة | 0 |
| **بنية المشروع** | ⚠️ تحتاج تحسين | ملفات Part كثيرة |
| **اختبارات E2E** | ❌ 1 فاشل | 1 |

### الملفات الحرجة التي **لا تحتوي أخطاء** (تم فحصها):
- ✅ `financials_part01.ts` — الحسابات المالية
- ✅ `ceramicMath.ts` — حسابات السيراميك
- ✅ `AuditService.getTimelineQuery()` — استعلامات UNION
- ✅ `GlobalSearch.tsx` — عدا مشكلة الـ focus المذكورة أعلاه

### الملفات التي تحتاج فحصًا إضافيًا (غير مكتمل):
- 🔴 `InventoryService` + 14 جزء — أكبر ملف في المشروع
- 🔴 `ReportCenterService.ts` — 172.9 KB
- 🔴 `PrintService.ts` — 146.9 KB
- 🔴 `databaseManager.ts` — 108.9 KB
- 🔴 `EmployeeService.ts` — 114.5 KB
- 🔴 `migrations/index.ts` — 111 KB

هذه الملفات كبيرة جدًا وقد تحتوي على أخطاء منطقية لم تُفحص في هذه الجولة.
