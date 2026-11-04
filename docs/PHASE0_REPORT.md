# Phase 0 — تقرير التنفيذ (تثبيت الأساس قبل المحرك)

التاريخ: 2026-11-04 · النطاق: إصلاحات الاتساق والمتانة فقط (لا ميزات جديدة) · المرجع: `docs/GAP_ANALYSIS.md` §8

## ما أُنجز

### 1. `voidSalesInvoice` — عكس الكاش على الكاشير الصحيح
- كان: الخصم على `WHERE is_default = 1` بينما البيع يضيف على كاشير الوردية/الفرع ⇒ درج الكاش لا يعود لنفس الرصيد.
- الآن: ترتيب الحل = كاشير الوردية (`cash_shifts.register_id`) ← افتراضي الفرع (`branch_id`, `is_active`, `is_default DESC`) ← أول درج `is_default = 1`. لا يتطلب صلاحية كاشير (الإلغاء مصرّح به بصلاحية `sales.void`).
- الملف: `src/services/sales/invoiceVoid.ts`

### 2. `voidSalesInvoice` — عكس `cash_shifts` (total_sales_cash/card/transfer)
- كان: البيع يزيد العدادات ولا يُلغي يزيدها عند الإلغاء ⇒ تقارير الوردية/الإقفال مُبالغ فيها.
- الآن: تُطرح القيم لكل طريقة دفع (مع تجميع `BANK_TRANSFER`/`CHEQUE` في `total_sales_transfer`)، مع `MAX(0, …)` كحد أمان للبيانات القديمة، وفfallback إلى `paymentType` للفواتير القديمة بلا صفوف split.

### 3. أرقام إيصالات الموردين دون تصادم
- كان: `` `PAY-${Date.now()…}` `` مع `receipt_number UNIQUE` ⇒ تصادم محتمل يُسقط المعاملة كاملة.
- الآن: `nextNumber('PAY')` داخل المعاملة وبعد فحص الـidempotency (نفس نمط `nextNumber('REC')`).
- الملفات: `src/services/PurchaseService.ts`, `src/services/SupplierService.ts`

### 4. قيد محاسبي واحد لكل مستند (قيد DB)
- Migration **`104_journal_entries_reference_unique`** (`src/database/migrations.ts`):
  - إن وُجدت صفوف مكررة `(reference_type, reference_id)` في قاعدة قديمة ⇒ **لا يُعَدَّل الدفتر إطلاقًا**؛ يُتخطى إنشاء القيد الفريد مع تحذير، ويبقى الـidempotency البرمجي كما هو.
  - في القواعد الجديدة/النظيفة يُنشأ `UNIQUE INDEX … WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL`.
- Migration **`110_customer_payment_idempotency`** (`src/database/migrations/part14.ts`): عمود `customer_payments.idempotency_key` + unique index جزئي.

### 5. تمرير Idempotency keys من الواجهة (كان: المفاتيح موجودة في الخدمات وغير مستخدمة)
- Hook جديد: `src/hooks/useIdempotencyKey.ts` (مفتاح ثابت لكل محاولة، يُعاد توليده بعد النجاح).
- نقاط الربط: `SuppliersView`، `CustomersView`، `SupplierDetailPage`، `DebtsDashboardPage` (طرف المورد كان بلا مفتاح — الآن يمرر `paymentGroupKey`)، `PaymentModals` (بيع/شراء/عميل)، `ReturnsPage` (مرتجع مبيعات)، `PurchaseReturnsPage` (مرتجع مشتريات).
- خدمات `recordInvoicePayment` (Sales) و`PurchaseService.recordPayment` أصبحت تقبل `idempotencyKey` اختياري مع فحص تطابق (invoice/amount/paymentType أو allocations) و`UNIQUE` index ⇒ double-click آمن على مستوى DB لا فقط زر معطل.

### 6. نقل `countSessionService.ts` خارج `src/pages`
- كان: منطق أعمال حرج (خصم مخزون + قيد محاسبي + FIFO عند اعتماد الجرد) تحت `src/pages/inventory/inventory-count/`.
- الآن: `src/services/inventory-count/` (`countSessionService.ts`, `countSessionData.ts`, `branchAccess.ts`, `types.ts`) مع تحديث كل الاستيرادات والاختبارات (`test/inventory-professional-lifecycle.test.ts`). الواجهات (.tsx) و`helpers.ts` بقيت في pages.

### 7. إصلاحان مُلحَقان بتشغيل الاختبارات (كانت فاشلة على HEAD)
- `src/config/moduleRegistry.ts`: تسجيل `/reports/category/{core,operations,sales,credit,inventory,finance,forecast}` كوحدات مملوكة لوحدة `reports` (كان التنقل يشير إليها وهي غير مسجلة ⇒ اختبار "all business navigation entries are controlled by a configurable module" يسقط).
- `src/utils/productUnits.ts`: `getProductUnitLabel`/`formatProductQuantity`/`getStockQuantityLabel` تتحمل الآن `undefined` (فاتورة بلا أصناف كانت تُسقط `PrintService.getInvoiceHtml` ⇒ اختبار app-configuration يسقط).

### 8. إصلاح سطر تصحيح للمستخدم (لا يحذف عمله)
- `src/database/ledger.ts` يحتوي سطور `[DEBUG-POST]`/`[DEBUG-CLOSED]` غير مُلتزمة (عمل قيد التقدم للمستخدم)؛ كان سطر `today` غير معرّف ويكسر `npm run typecheck`. تم حذف `today` من كائن التصحيح فقط (المعنى محفوظ: `postingDate` موجودة). **سطور التصحيح نفسها لم تُمس.**

## ما لم يُنجز (قرار مؤجل)

| البند | السبب |
|---|---|
| قلب `OPEN_ALL_PAGES` / `BYPASS_FIRST_RUN_SETUP` إلى `false` | افتعلها المالك كتجاوز مؤقت للتطوير؛ قلبها يغيّر سلوك التشغيل المحلي ويحتاج قرارًا صريحًا (انظر أدناه) |
| توحيد مسار التدقيق (`AuditService.log` بعد COMMIT ← INSERT داخل المعاملة) | تغيير سلوكي ("لا يرمي أبدًا" متعمد)؛ يتطلب مراجعة كل مواضع الاستدعاء (~36) وتأثيره على sync/capture — يُنقل إلى Phase 5 مع محرك التأثيرات |
| durability: flush متزامن لـ`db:save` بعد المعاملة الحرجة | قرار معماري (sql.js مقابل better-sqlite3 في main)؛ يرجى حسم القرار المطلوب في GAP_ANALYSIS §9 البند 4 |

## ملاحظات للمالك

- **14 خطأ lint** كلها في ملفات عمله قيد التقدم (`electron/entry.js`, `electron/licenseGuard.js`, `electron/security/*` (ملفات جديدة غير مُلتزمة), `electron/tailscaleService.js`, `src/services/BackupServicePart01.ts`, وملفات في HEAD مثل `src/services/SettingsService.ts:120`) — **لا علاقة لها بتغييرات هذه الدفعة** ولم تُمس. الاختبارات والبناء يعتمدان على قرار المالك بشأنها.
- `npm test` كان يفشل على نفس الاختبارين حتى قبل هذه الدفعة (نتيجة HEAD)، وقد أُصلحا هنا.
- لم تُنفذ `npm run build` (لم يتغير منطق التطبيق الخارجي)؛ تم التحقق عبر `typecheck` و`lint` (0 خطأ في ملفات الدفعة) و`npm test`.
