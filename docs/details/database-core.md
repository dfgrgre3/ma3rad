# طبقة قاعدة البيانات (Database Layer)

توثيق شامل لملفات `src/database/` في تطبيق **Ceramics ERP** (معمارية React + TypeScript). هذا الملف يغطي مدير قاعدة البيانات، المخطط (`schema/`)، والمستودعات (`repositories/`). مجلد `src/database/migrations/` موثَّق في ملف منفصل.

## نظرة عامة على المعمارية

- **المحرك:** SQLite عبر مكتبة **sql.js** (WASM) — قاعدة البيانات تعيش كاملة في الذاكرة (`Database` من sql.js) وتُحفظ كـ **لقطة ثنائية (snapshot)** على القرص/المتصفح.
- **التخزين (persistence):** ثلاث طرق مدعومة حسب البيئة —
  1. **Electron file API** (`window.ceramisys.db`): كتابة ملف مشفّر على القرص، مع مسار كتابة متزامنة حظراً (blocking IPC) للعمليات المالية الحرجة.
  2. **IndexedDB** (`ceramisys_database` / store `snapshots`) مع **تشفير AES-GCM** عبر Web Crypto في بيئات الإنتاج.
  3. **localStorage** (base64) كاحتياطي/تطوير فقط.
- **Web Worker:** نسخة مكرّرة (replica) من القاعدة داخل `databaseWorker.ts` تُستخدم لتنفيذ استعلامات `SELECT` الثقيلة خارج خيط الواجهة. الخيط الرئيسي هو الكاتب الوحيد؛ الطفرات تُمرَّر إلى العامل كعبارات SQL عادية عبر عدّاد `mutationSeq` (بدون نقل اللقطات الكاملة إلا عند الاستيراد/الاستعادة).
- **الخدمات:** لا توجد مستودعات كيان-بكيان تقليدية؛ الوصول للبيانات يتم عبر `DatabaseManager.query/run` من طبقة الخدمات، مع `ledger.ts` كمساعد محاسبة مركزي.

---

## مدير قاعدة البيانات

### `src/database/databaseManager.ts`

- **الغرض:** نقطة دخول/واجهات مساعدة لتهيئة نسخة sql.js داخل Web Worker وإعادة تصدير `DatabaseManager`.
- **الأعضاء الرئيسية:**
  - `initializeWorkerDatabase()` — يهيّئ نسخة `SQL.Database()` في سياق العامل (singleton `workerDb`).
  - `runWorkerQuery(sql)` — ينفّذ استعلام خام على نسخة العامل ويعيد الصفوف.
  - إعادة تصدير `DatabaseManager` من `./repositories/databaseManager`.
- **ملاحظات:** هذا الملف ليس هو المدير الرئيسي؛ هو غلاف خاص بسياق العامل، بينما `DatabaseManager` الحقيقي في `repositories/databaseManager.ts`.

### `src/database/databaseWorker.ts`

- **الغرض:** Web Worker مستقل ينفّذ كل عمليات SQLite (sql.js) في خيط خلفي حتى لا يتجمّد البرنامج عند الضغط على الأزرار.
- **الأعضاء الرئيسية:**
  - `DbWorkerRequest` / `DbWorkerResponse` — بروتوكول الرسائل: `init`, `query`, `run`, `exec`, `export`, `import`, `close`.
  - مستمع `self.addEventListener('message', ...)` — يوزّع الرسائل على دوال `DatabaseManager` ويعيد `{ type: 'ok' | 'error', id, payload }`.
- **ملاحظات:** العامل يحتفظ بنسخة استعلام فقط — يستدعي `suppressPersistence()` ثم `initializeEngineOnly()` لأن مفتاح فك التشفير موجود في الخيط الرئيسي، وتدفع النسخة الرئيسية الحالة عبر `import`.

### `src/database/databaseAsyncService.ts`

- **الغرض:** خدمة Promise-based للتواصل مع `databaseWorker.ts` — واجهة async غير حاجبة لكل عمليات SQLite.
- **الأعضاء الرئيسية:**
  - `initDatabaseAsync()` / `prewarmDatabaseWorker()` — إنشاء العامل وتهيئته مبكراً عند الإقلاع.
  - `queryAsync<T>(sql, params)` — SELECT داخل العامل؛ الكتابات السابقة تصل عبر ترتيب postMessage.
  - `runAsync(sql, params)` / `execAsync(sql)` — تُنفَّذ على الخيط الرئيسي وتُمرَّر للعامل تلقائياً.
  - `exportDatabaseAsync()` / `importDatabaseAsync(bytes)` — لقطة ثنائية عبر Transferable.
  - `closeDatabaseAsync()` / `isDatabaseReady()` / `registerMutationForwarder()` — إغلاق، حالة، وربط `handleMainMutation`.
- **ملاحظات:** منطق المزامنة: `mutationSeq` + `lastSyncedSeq` + `workerDirty`؛ الطفرات تُرسل كـ run/exec عادية، والاستبدال الكامل يفرض مزامنة بلقطة. كل العمليات تُسلسل عبر `opQueue` مع مهلة 120 ثانية (`WORKER_OP_TIMEOUT_MS`). بيئات بلا Worker (اختبارات Node) تسقط تلقائياً على `DatabaseManager` الرئيسي.

### `src/database/repositories/databaseManager.ts`

- **الغرض:** صنف `DatabaseManager` (Singleton) — المدير المركزي لقاعدة SQLite في الذاكرة، و"الملف الرئيسي رفيع" يفوّض التنفيذ لموديولات `databaseManager/` الفرعية.
- **الأعضاء الرئيسية:**
  - `getInstance()` / `setNumberFormatter()` — إنشاء المفردة وتسجيل منسّق ترقيم المستندات من `AppConfigService`.
  - `initialize()` / `initializeEngineOnly()` / `createFreshAfterRecovery()` — تحميل المحرك واللقطة وإدارة الاسترداد.
  - `getDatabase()` / `getDb()` — يعيد `Database` façade (Proxy) مع تتبع الطفرات وكاش الاستعلامات.
  - `query<T>()`, `run()`, `queryPage()`, `nextNumber(prefix)` — استعلام/كتابة/ترقيم متسلسل (`INV-2026-000001`).
  - `executeTransaction()`, `executeFinancialTransaction()`, `executeDurableTransaction()` — معاملات BEGIN/SAVEPOINT مع حفظ فوري/متزامن للعمليات المالية.
  - `queryAsync/runAsync/execAsync/exportDatabaseAsync/importDatabaseAsync` — واجهة async المفوَّضة لـ `databaseAsyncService`.
  - `exportDatabaseBytes()`, `importDatabaseBytes()`, `exportDatabaseBinary()`, `importDatabaseBinary()`, `readImportTablesBinary()`, `inspectDatabaseBinary()` — تصدير/استيراد/فحص اللقطات الثنائية (منطق الدمج في `binaryIO.ts`).
  - `saveToStorage()`, `scheduleDebouncedSave()`, `flush()`, `getStorageBackend()`, `getPersistenceStatus()`, `getLastPersistError()`, `suppressPersistence()` — إدارة الحفظ على القرص.
  - `getMutationSeq()`, `setMutationForwarder()` — عدّاد الطفرات وربط مزامنة العامل.
  - `getQueryStats()`, `getSlowQueryStats()`, `getQueryCacheStats()` — إحصاءات الأداء وكاش الاستعلامات.
- **ملاحظات:** الحالة الخاصة (db, SQL, transactionDepth, queryCache, mutationSeq, persistQueue, saveChain...) معرّفة هنا وتُشارك مع الموديولات عبر `DatabaseManagerInternals` في `internals.ts`. الـ façade من `databaseAccess.ts` هو نقطة الدخول الفعلية للعمليات.

### `src/database/repositories/databaseManager/constants.ts`

- **الغرض:** ثوابت ومفاتيح تشغيل مشتركة بين موديولات المدير.
- **الأعضاء الرئيسية:** `DB_STORAGE_KEY` ('ceramisys_erp_sqlite_db'), `LEGACY_X86_BUILD`, أنواع `DatabaseFileApi` و`IdleCallbackHost`، `DatabaseManagerState`، `getDatabaseManagerState()` (يخزّن `instance` و`numberFormatter` على `globalThis`).
- **ملاحظات:** `DB_STORAGE_KEY` يُستخدم في `initialization.ts` و`persistence.ts` لقراءة/كتابة لقطة localStorage.

### `src/database/repositories/databaseManager/utils.ts`

- **الغرض:** أدوات مساعدة منخفضة المستوى للتحويلات ومعالجة الأخطاء.
- **الأعضاء الرئيسية:** `persistenceErrorMessage()` (تفكيك أخطاء fs/Electron), `bytesToBase64()`, `base64ToBytes()`, `toUint8Array()`.
- **ملاحظات:** تُستخدم في `storage.ts` (localStorage fallback) و`persistence.ts`.

### `src/database/repositories/databaseManager/internals.ts`

- **الغرض:** واجهة `DatabaseManagerInternals` التي تتيح لموديولات `databaseManager/` الوصول إلى الحقول الخاصة لـ `DatabaseManager` (TS private compile-time فقط).
- **الأعضاء الرئيسية:** أنواع `DatabaseStorageBackend`, `MutationForwarder`, `QueryCacheEntry`, `SlowQueryRecord`, `PendingSnapshot`؛ وواجهة `DatabaseManagerInternals` (db, SQL, transactionDepth, queryCache, mutationSeq, persistQueue, storageBackend...).
- **ملاحظات:** يجب أن تبقى أسماء الحقول متزامنة مع `repositories/databaseManager.ts`.

### `src/database/repositories/databaseManager/engine.ts`

- **الغرض:** تحميل محرك sql.js وملف WASM، وتطبيق إعدادات الأداء (PRAGMAs).
- **الأعضاء الرئيسية:** `initializeSqlEngine(host)` (حلّ `initSqlJs` عبر المتصفح/Electron/Node مع fallback لـ `sql-wasm-browser.js` و`createRequire`)، `resolveSqlJs()`, `applyPerformancePragmas(db)` (`foreign_keys=ON`, `synchronous=NORMAL`, `temp_store=MEMORY`, `cache_size=-4000`).
- **ملاحظات:** يُستدعى من `initialization.ts` و`databaseManager.ts` (`initializeEngineOnly`).

### `src/database/repositories/databaseManager/initialization.ts`

- **الغرض:** منطق تهيئة القاعدة: تحميل المحرك + قراءة اللقطة المحفوظة بالتوازي، فتح القاعدة، النسخ الاحتياطي قبل هجرة، تشغيل الهجرات، البذر الأولي، ومخزون `createFreshAfterRecovery`.
- **الأعضاء الرئيسية:** `initializeDatabase(host)` (orchestrator رئيسي)، `createFreshAfterRecovery(host)`؛ دوال داخلية مثل `loadSavedBytes`, `openDatabase`, `selectStorageBackend`, `backupBeforeGrossProfitMigration`, schema signature/seeding.
- **ملاحظات:** يقرأ من `storage.ts` (file API/IndexedDB/localStorage) ويشغّل هجرات `../../migrations`؛ يطبّق PRAGMAs عبر `engine.ts` ويهيّئ `sequence_counters` والبذر الأولي (`DEFAULT_BRANCH_ID` من migrations/settings).

### `src/database/repositories/databaseManager/databaseAccess.ts`

- **الغرض:** `getDatabase()` — بناء `Proxy` façade فوق `sql.js Database` يضيف تتبع الطفرات، كاش الاستعلامات، وتمرير الطفرات للعامل — و`nextNumber()` مولّد أرقام المستندات المتسلسلة.
- **الأعضاء الرئيسية:** `getDatabase(host)` (Proxy مع معالجة run/exec وتخزين النتائج المؤقتة)، `nextNumber(host, prefix)` (`PREFIX-YYYY-NNNNNN` من جدول `sequence_counters` + `numberFormatter` اختياري).
- **ملاحظات:** الواجهة الفعلية التي تستخدمها كل خدمات التطبيق؛ `exec` الفاشلة تُمرَّر للعامل أيضاً لأنها قد تكون طبّقت جمل جزئية.

### `src/database/repositories/databaseManager/mutationSync.ts`

- **الغرض:** تتبع "الوسخ" (dirty) وعدّاد الطفرات وتمرير الطفرات إلى نسخة العامل.
- **الأعضاء الرئيسية:** `markDirty()`, `getMutationSeq()`, `suppressPersistence()`, `setMutationForwarder()`, `forwardMutation()`, `notifyDatabaseReplaced()` (إشعار `reset` عند الاستيراد/الاستعادة).
- **ملاحظات:** يُستدعى من `databaseAccess.ts` و`queries.ts` و`transactions.ts` و`binaryIO.ts`؛ `forwardMutation` لا يرمي أخطاء أبداً حتى لا يكسر الكتابة الناجحة محلياً.

### `src/database/repositories/databaseManager/queries.ts`

- **الغرض:** تنفيذ الاستعلامات، تحويل مفاتيح snake_case إلى camelCase، كاش الاستعلامات، إحصاءات الأداء، و`queryPage` للاستعلامات المقسّمة.
- **الأعضاء الرئيسية:** `query()`, `run()`, `queryPage()`, `trackQuery()`، `createQueryCacheKey()`, `getCachedQuery()`, `setCachedQuery()`, `isMutatingSql()`, `clearQueryCache()`، `getQueryStats()`, `getSlowQueryStats()`, `getQueryCacheStats()`.
- **ملاحظات:** عتبة الاستعلام البطيء 250ms؛ حدود الكاش (TTL 5s، 300 مدخل، 16MB على البناء الحديث) تُضبط من `LEGACY_X86_BUILD` في constants.

### `src/database/repositories/databaseManager/persistence.ts`

- **الغرض:** تصدير اللقطة الثنائية، الحفظ المؤجل (debounced/idle)، التسلسل المتسلسل للحفظ، الفلاش، والحفظ المتزامن الحاجز (blocking IPC) للعمليات المالية.
- **الأعضاء الرئيسية:** `scheduleDebouncedSave()`, `saveToStorage(force)`, `cancelIdleSave()`, `flush()`, `exportSnapshot()`, `persistSnapshotSynchronously()`, `getStorageBackend()`, `getPersistenceStatus()`, `getLastPersistError()`.
- **ملاحظات:** يختار backend بين file (Electron `window.ceramisys.db`)، IndexedDB، localStorage؛ يحترم `persistenceSuppressed` (العامل) و`dirtySinceLastSave`/`mutationSeq` لتجنّب تصدير DB كامل بدون تغييرات؛ `SAVE_MIN_INTERVAL_MS = 3000` يمنع عواصف الحفظ.

### `src/database/repositories/databaseManager/storage.ts`

- **الغرض:** قراءة/كتابة لقطة القاعدة في IndexedDB مع تشفير AES-GCM عبر Web Crypto، وسقوط إلى localStorage base64.
- **الأعضاء الرئيسية:** `readBrowserSnapshot()`, `writeBrowserSnapshot(bytes, key)`, `deleteBrowserSnapshot()`, `getBrowserSnapshotEncryptionState()`؛ دوال داخلية لمفاتيح التشفير (`ceramisys_database` IDB v2، مخزن `snapshots`/`keys`).
- **ملاحظات:** في الإنتاج لا يُحفظ نص صريح أبداً؛ مفتاح غير قابل للاستخراج يُخزَّن في IDB وJWK قديم في `ceramisys_db_encryption_key` بـ localStorage. يتعرّف على لقطات SQLite عبر الترويسة `SQLite format 3\0`.

### `src/database/repositories/databaseManager/transactions.ts`

- **الغرض:** تنفيذ المعاملات المتداخلة (BEGIN/SAVEPOINT) مع خيارات الحفظ الفوري/الدائم للعمليات المالية.
- **الأعضاء الرئيسية:** `executeTransaction(host, callback, {immediatePersist, durableSync})`, `executeFinancialTransaction()` (immediate + durableSync)، `executeDurableTransaction()` (async callback + `flush()` قبل الإرجاع)، `rollbackTransaction()` داخلي.
- **ملاحظات:** يعيد استخدام `persistSnapshotSynchronously` و`markDirty` و`clearQueryCache`؛ يرفض بدء معاملات جديدة بعد `lastPersistError` بـ `AppError('DATABASE_PERSIST_FAILED')`؛ يتتبع `immediatePersistRequested`/`durableSyncRequested` عبر معاملات متداخلة حتى COMMIT الأبعد.

### `src/database/repositories/databaseManager/binaryIO.ts`

- **الغرض:** تصدير/استيراد القاعدة كـ Uint8Array ثنائي، استخراج جداول النسخ الاحتياطي للدمج، وفحص لقطات النسخ بدون المساس بالقاعدة الحية.
- **الأعضاء الرئيسية:** `exportDatabaseBytes()` (db.export()), `importDatabaseBytes()` (مع `PRAGMA integrity_check` + `foreign_key_check` + تحقق من الجداول المطلوبة users/products/system_settings/sales_invoices)، `exportDatabaseBinary()`, `readImportTablesBinary()`, `importDatabaseBinary()`، `inspectDatabaseBinary()` (integrity + عدّادات invoices/products/customers/journal entries).
- **ملاحظات:** `importDatabaseBytes` يستبدل `h.db` ويستدعي `notifyDatabaseReplaced` لتعليم العامل بإعادة مزامنة؛ يُستخدم أيضاً من `databaseWorker.ts` (import/export).

### `src/database/repositories/ledger.ts`

- **الغرض:** مساعد الترحيل المحاسبي المركزي — يبني القيود المتوازنة في دفتر الأستاذ (GL) مع التحقق من التوازن والفترات المقفلة والتحديث الذري للأرصدة.
- **الأعضاء الرئيسية:**
  - `queryLedgerRows<T>(db, sql, params)` — تنفيذ SQL على كائن `Database` الخام وإرجاع صفوف.
  - `postLedgerEntry(db, posting)` — التحقق من التاريخ/الفترة/الحسابات، توليد رقم قيد `JV-YYYY-NNNNNN` عبر `sequence_counters`، إدراج `journal_entries` + `journal_entry_lines`، تحديث `chart_of_accounts.balance`، وكتابة `finance_subledger_events` للأطراف.
  - `reverseLedgerEntry(db, entryId, posting)` — قيد عكسي متوازن لقيد مرحّل موجود.
  - `paymentAccountCode(type)` — تعيين طريقة الدفع لحساب الخزينة (1101/1102/1105/1106).
  - `assertLedgerDateOpenForPosting(db, date)` — رفض الترحيل في فترات `CLOSED`/`LOCKED` أو بعد `accounting_closed_until_date`.
- **ملاحظات:** يخزّن المبالغ كـ **piastres** (INTEGER، 1 EGP = 100) عبر `toPiastres`/`roundMoney` من `utils/money`؛ يستنتج `branch_id`/`company_id` من مرجع القيد (فواتير، مدفوعات، مخزون...)؛ أنواع المراجع المدعومة: SALES/PURCHASE_INVOICE, SALES/PURCHASE_RETURN, CUSTOMER/SUPPLIER_PAYMENT, EXPENSE, PAYROLL_*, COMMISSION_*, INVENTORY_*, CHEQUE_*, ORDER_DEPOSIT...؛ الجداول: `journal_entries`, `journal_entry_lines`, `chart_of_accounts`, `sequence_counters`, `fiscal_periods`, `fiscal_years`, `system_settings`, `finance_subledger_events`, `finance_subledger_coverage`.

---

## المخطط (schema)

### `src/database/schema/index.ts`

- **الغرض:** يجمع كل أجزاء المخطط `SCHEMA_PART_01..28` + `DATABASE_INDEXES` في ثابت `SCHEMA_SQL` واحد يُنفَّذ عند إنشاء قاعدة جديدة.
- **الأعضاء الرئيسية:** `SCHEMA_SQL` (string.raw مُدمج بـ `\n`).
- **ملاحظات:** رأس الملف يوثّق قرار تخزين المبالغ المالية **piastres (INTEGER)** في جداول GL والمبيعات (الهجرات 213/215) بينما المشتريات/الأطراف/المصروفات/تكلفة المخزون تبقى `REAL` مع CHECK (هجرة 212) حتى هجرتها.

### `src/database/schema/indexes.ts`

- **الغرض:** فهارس إضافية `CREATE INDEX IF NOT EXISTS` لتحسين أداء التقارير والجداول الكبيرة (تُنفَّذ بعد إنشاء الجداول).
- **الأعضاء الرئيسية:** `DATABASE_INDEXES` (كتلة SQL خام).
- **ملاحظات:** تغطي `sales_invoices`, `customers`, `cheques`, `purchase_invoices`, `employees`, `payroll_transactions`, `warehouse_stock`, `products`, `customer_payments`, `supplier_payments`, `expenses`, `cash_registers`, `audit_logs`, `approval_requests`, `sales_invoice_items`, `purchase_invoice_items`, `branches` — مثل `idx_sales_invoices_remaining` الجزئي و`idx_warehouse_stock_quantity` الجزئي.

### `src/database/schema/part-01.ts`

- **الغرض:** المخطط التأسيسي — المستخدمون والصلاحيات والمنتجات والمخازن (أول جزء مع pragma comment وتحذير REAL→INTEGER).
- **الأعضاء الرئيسية:** `SCHEMA_PART_01` (SQL خام).
- **ملاحظات:** الجداول: `users`, `permissions`, `user_permissions`, `categories`, `brands`, `products`, `warehouses`, `warehouse_stock`, `product_batches` + فهارس.

### `src/database/schema/part-02.ts`

- **الغرض:** حركات المخزون والأطراف والمدفوعات النقدية والمصروفات.
- **الأعضاء الرئيسية:** `SCHEMA_PART_02`.
- **ملاحظات:** الجداول: `inventory_transactions` (CHECK على الأنواع PURCHASE/SALE/TRANSFER/.../VOID)، `customers`, `suppliers`, `cash_registers`, `cash_shifts`, `expense_categories`, `expenses`.

### `src/database/schema/part-03.ts`

- **الغرض:** فواتير المبيعات والمرتجعات وفواتير المشتريات (الإجمالي مخزّن INTEGER piastres).
- **الأعضاء الرئيسية:** `SCHEMA_PART_03`.
- **ملاحظات:** الجداول: `sales_invoices`, `sales_invoice_items`, `sales_returns`, `sales_return_items`, `purchase_invoices`.

### `src/database/schema/part-04.ts`

- **الغرض:** عناصر فواتير الشراء، المدفوعات، عروض الأسعار، والإعدادات/السجلات العامة.
- **الأعضاء الرئيسية:** `SCHEMA_PART_04`.
- **ملاحظات:** الجداول: `purchase_invoice_items`, `customer_payments`, `supplier_payments`, `quotations`, `quotation_items`, `audit_logs`, `system_settings`, `backup_history`, `sequence_counters`, `notifications`.

### `src/database/schema/part-05.ts`

- **الغرض:** الهيكل التنظيمي — الفروع والأقسام والموظفون والإجازات والعمولات.
- **الأعضاء الرئيسية:** `SCHEMA_PART_05`.
- **ملاحظات:** الجداول: `branches` (FK إلى users)، `departments`, `employees`, `employee_leaves`, `commissions`, `employee_branch_assignments`.

### `src/database/schema/part-06.ts`

- **الغرض:** دورة الطلبات — طلبات العملاء وطلبات/أوامر الشراء واستلامها.
- **الأعضاء الرئيسية:** `SCHEMA_PART_06`.
- **ملاحظات:** الجداول: `orders`, `order_items`, `purchase_requests`, `purchase_request_items`, `purchase_orders`, `purchase_order_items`, `purchase_order_receipts`, `purchase_order_receipt_items`.

### `src/database/schema/part-07.ts`

- **الغرض:** مشتريات الموردين — طلبات عرض السعر، عروض الموردين، إشعارات الاستلام، والمطالبات.
- **الأعضاء الرئيسية:** `SCHEMA_PART_07`.
- **ملاحظات:** الجداول: `supplier_rfqs`, `supplier_rfq_items`, `supplier_quotations`, `supplier_quotation_items`, `goods_receipt_notes`, `goods_receipt_note_items`, `supplier_claims`, `supplier_claim_items`.

### `src/database/schema/part-08.ts`

- **الغرض:** الذمم المدينة (receivables) والمرتجعات ومرتجعات الشراء وتحويلات المخزون.
- **الأعضاء الرئيسية:** `SCHEMA_PART_08`.
- **ملاحظات:** الجداول: `receivables` (حقول JSON ديناميكية)، `receivable_updates`, `receivable_attachments`, `customer_payment_promises`, `purchase_returns`, `purchase_return_items`, `stock_transfers`, `stock_transfer_items`.

### `src/database/schema/part-09.ts`

- **الغرض:** جرد المخزون والتسويات والخصائص/المتغيرات (variants) للمنتجات.
- **الأعضاء الرئيسية:** `SCHEMA_PART_09`.
- **ملاحظات:** الجداول: `stock_counts`, `stock_count_items`, `stock_adjustments`, `stock_adjustment_items`, `stock_reservations`, `attributes`, `attribute_options`, `product_attribute_values`, `product_variants`.

### `src/database/schema/part-10.ts`

- **الغرض:** وسائط المنتجات، قوائم الأسعار، الفواتير الإلكترونية، وولاء العملاء.
- **الأعضاء الرئيسية:** `SCHEMA_PART_10`.
- **ملاحظات:** الجداول: `product_images`, `product_documents`, `price_lists`, `price_list_items`, `customer_price_overrides`, `price_change_history`, `electronic_invoices`, `loyalty_tiers`, `customer_loyalty`, `loyalty_transactions`.

### `src/database/schema/part-11.ts`

- **الغرض:** ربط الفروع بالمخازن والمستخدمين، التحليلات، الإشعارات، العروض والحملات والعملاء المحتملون.
- **الأعضاء الرئيسية:** `SCHEMA_PART_11`.
- **ملاحظات:** الجداول: `branch_warehouses` (UNIQUE branch+warehouse)، `users_branches`، `analytics_snapshots`, `notification_preferences`, `promotions`, `promotion_targets`, `campaigns`, `leads`.

### `src/database/schema/part-12.ts`

- **الغرض:** CRM والمشاريع — أنشطة العملاء، المشاريع، السائقون والمركبات.
- **الأعضاء الرئيسية:** `SCHEMA_PART_12`.
- **ملاحظات:** الجداول: `crm_activities` (CHECK: lead XOR customer)، `projects`, `project_units`, `project_products`, `drivers`, `vehicles`.

### `src/database/schema/part-13.ts`

- **الغرض:** صيانة المركبات، التسليمات، وخطط التقسيط.
- **الأعضاء الرئيسية:** `SCHEMA_PART_13`.
- **ملاحظات:** الجداول: `vehicle_maintenance`، `deliveries`, `delivery_items`, `installment_plans`, `installments`.

### `src/database/schema/part-14.ts`

- **الغرض:** سير الموافقات، RBAC (roles/permissions)، الجلسات، الرواتب والحضور، والشيكات.
- **الأعضاء الرئيسية:** `SCHEMA_PART_14`.
- **ملاحظات:** الجداول: `approval_requests`, `approval_policies`, `approval_decisions`, `roles`, `role_permissions`, `user_sessions`, `login_history`, `payroll_transactions`, `attendance`, `cheques`.

### `src/database/schema/part-15.ts`

- **الغرض:** الأصول الثابتة، سجل هجرات المخطط، الكيانات الديناميكية، مواقع المخزون المتقدمة.
- **الأعضاء الرئيسية:** `SCHEMA_PART_15`.
- **ملاحظات:** الجداول: `fixed_assets`, `schema_migrations`, `dynamic_entity_types`, `dynamic_records`, `dynamic_import_batches`, `warehouse_locations`, `product_location_stock`, `inventory_special_stocks`.

### `src/database/schema/part-16.ts`

- **الغرض:** مطابقة المخزون، شجرة الحسابات، قيود اليومية، السنوات والفترات المالية، الحسابات البنكية وتسوياتها.
- **الأعضاء الرئيسية:** `SCHEMA_PART_16`.
- **ملاحظات:** الجداول: `inventory_reconciliation_logs`، `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `fiscal_years`, `fiscal_periods`, `bank_accounts`, `bank_reconciliations`؛ محفّزات `trg_prevent_update/delete_inv_tx` و`trg_prevent_excess_reservation_*` لحماية سلامة المخزون.

### `src/database/schema/part-17.ts`

- **الغرض:** بنود التسوية البنكية، مراكز التكلفة، الموازنات، التوقعات النقدية، بوابات الدفع، العملات وأسعار الصرف — وحماية حسابات الدليل.
- **الأعضاء الرئيسية:** `SCHEMA_PART_17`.
- **ملاحظات:** الجداول: `bank_reconciliation_lines`, `cheque_status_history`, `cost_centers`, `budgets`, `budget_items`, `cash_forecast_items`, `payment_gateways`, `payment_gateway_settlements`, `currencies`, `currency_exchange_rates`؛ محفّز `trg_prevent_delete_coa_*` يمنع حذف حساب له قيود/فروع.

### `src/database/schema/part-18.ts`

- **الغرض:** أساس المزامنة أوفلاين أولاً (offline-first) متعدد الفروع — outbox/inbox/تعارضات/أجهزة.
- **الأعضاء الرئيسية:** `SCHEMA_PART_18`.
- **ملاحظات:** الجداول: `sync_outbox`, `sync_inbox`, `sync_cursor`, `sync_branches`, `sync_devices`, `sync_tombstones`, `sync_entity_versions`, `sync_conflicts`, `sync_bootstrap_progress`, `sync_audit_log`.

### `src/database/schema/part-19.ts`

- **الغرض:** لوحة مالك المنصة (Platform Super Admin) — المستأجرون، الخطط، الاشتراكات، الفوترة، الوحدات، الإصدارات، الهوية، الدعم الفني، والتخصيص.
- **الأعضاء الرئيسية:** `SCHEMA_PART_19` + `platform_audit` (VIEW يجمع سجلات التدقيق).
- **ملاحظات:** ~45 جدول `platform_*`: tenants, plans/plan_versions/price_history/upgrade_rules, subscriptions(+price_locks/changes), licenses(+changes), invoices(+items), payments, modules, feature_flags, releases, audit_logs, branches, settings, tenant_activities(+versions), ops_jobs, maintenance_windows, op_approvals, sync_log, branding(+versions), ui_profiles/customizations(+versions), config_templates/configs(+versions/rollouts/ack), server_telemetry, central_backups, service_incidents, support_canned_replies, remote_sessions, staff(+logins/sessions), security_incidents_log, signing_keys.

### `src/database/schema/part-20.ts`

- **الغرض:** حسابات دخول عملاء المنصة (tenant accounts) الصادرة من مالك المنصة.
- **الأعضاء الرئيسية:** `SCHEMA_PART_20`.
- **ملاحظات:** الجداول: `platform_tenant_accounts` (username + password_hash + activation_code، FK إلى platform_tenants).

### `src/database/schema/part-21.ts`

- **الغرض:** تجاوزات ميزات/حدود لكل مستأجر دون تغيير خطته الأساسية.
- **الأعضاء الرئيسية:** `SCHEMA_PART_21`.
- **ملاحظات:** الجداول: `platform_tenant_overrides` (kind: MODULE/FEATURE/LIMIT/PERMISSION).

### `src/database/schema/part-22.ts`

- **الغرض:** دليل مستخدمي كل مستأجر (سجلات إدارة/توفير، ليست حسابات دخول فعلية).
- **الأعضاء الرئيسية:** `SCHEMA_PART_22`.
- **ملاحظات:** الجداول: `platform_tenant_users` (provisioning_status/mode + identity_user_id).

### `src/database/schema/part-23.ts`

- **الغرض:** سجل تفعيل/إلغاء/تجديد/نقل التراخيص (أونلاين وأوفلاين).
- **الأعضاء الرئيسية:** `SCHEMA_PART_23`.
- **ملاحظات:** الجداول: `platform_license_activations` (license_id, tenant_id, device_id, mode ONLINE/OFFLINE).

### `src/database/schema/part-24.ts`

- **الغرض:** سجل الأجهزة لكل مستأجر مع كشف الاستنساخ (clone_suspected).
- **الأعضاء الرئيسية:** `SCHEMA_PART_24`.
- **ملاحظات:** الجداول: `platform_devices` (hardware_id, license_id, os, app_version, ip_address).

### `src/database/schema/part-25.ts`

- **الغرض:** تتبع نشر الإصدارات لكل مستأجر، سجل دفع الإعدادات عن بُعد، صندوق الصادر، والإشعارات.
- **الأعضاء الرئيسية:** `SCHEMA_PART_25`.
- **ملاحظات:** الجداول: `platform_release_targets`, `platform_tenant_config_push`, `platform_outbox`, `platform_notifications`.

### `src/database/schema/part-26.ts`

- **الغرض:** تذاكر الدعم الفني ورسائلها مع إمكانية طلب/موافقة الوصول عن بُعد.
- **الأعضاء الرئيسية:** `SCHEMA_PART_26`.
- **ملاحظات:** الجداول: `platform_support_tickets`, `platform_support_messages`.

### `src/database/schema/part-27.ts`

- **الغرض:** مفاتيح API لكل مستأجر (تُخزَّن مجزّأة key_hash).
- **الأعضاء الرئيسية:** `SCHEMA_PART_27`.
- **ملاحظات:** الجداول: `platform_api_keys` (key_prefix, key_hash UNIQUE, scopes JSON, expires_at).

### `src/database/schema/part-28.ts`

- **الغرض:** كوبونات الخصم وأحداث المزامنة المطبقة (deduplication).
- **الأعضاء الرئيسية:** `SCHEMA_PART_28`.
- **ملاحظات:** الجداول: `platform_coupons` (PERCENT/FIXED, plan_id, first_payment_only, min_subtotal)، `sync_applied_events`.

---

## المستودعات (repositories)

> ملاحظة بنيوية: مجلد `src/database/repositories/` لا يحتوي مستودعات كيان-بكيان تقليدية (UserRepository, InvoiceRepository...)؛ بل يحتوي **مدير قاعدة البيانات الكامل** (`databaseManager.ts` + موديولاته) و**مساعد دفتر الأستاذ** (`ledger.ts`). الوصول للكيانات يتم من طبقة الخدمات عبر `DatabaseManager.query/run` مباشرة.

### `src/database/repositories/databaseManager.ts`

*(موثَّق أعلاه ضمن قسم مدير قاعدة البيانات — هو المدير الرئيسي Singleton.)*

### `src/database/repositories/ledger.ts`

*(موثَّق أعلاه ضمن قسم مدير قاعدة البيانات — مساعد الترحيل المحاسبي: `journal_entries`, `journal_entry_lines`, `chart_of_accounts`, `sequence_counters`, `fiscal_*`, `finance_subledger_events`.)*

### `src/database/repositories/databaseManager/` (13 ملفاً)

*(موثَّقة أعلاه — تفكيك داخلي للـ `DatabaseManager`: constants, utils, internals, engine, initialization, databaseAccess, mutationSync, queries, persistence, storage, transactions, binaryIO, asyncApi.)*

### ملخص الكيانات المغطاة في طبقة البيانات

| المجال | الكيانات/الجداول |
|---|---|
| الهوية والصلاحيات | users, permissions, user_permissions, roles, role_permissions, user_sessions, login_history |
| المنتجات والمخزون | products, categories, brands, product_batches, product_variants, attributes, product_images/documents, warehouses, warehouse_stock, inventory_transactions, stock_* |
| المبيعات | sales_invoices(+items), sales_returns(+items), quotations(+items), orders(+items), price_lists, promotions, campaigns, leads, customer_loyalty |
| المشتريات | purchase_invoices(+items), purchase_requests/orders/receipts, supplier_rfqs/quotations, goods_receipt_notes, supplier_claims, purchase_returns |
| الأطراف والمدفوعات | customers, suppliers, customer_payments, supplier_payments, receivables, cheques, cash_registers, cash_shifts, expenses |
| المحاسبة | chart_of_accounts, journal_entries(+lines), fiscal_years/periods, bank_accounts/reconciliations(+lines), cost_centers, budgets, currencies, payment_gateways |
| الموارد البشرية | branches, departments, employees, employee_leaves, commissions, payroll_transactions, attendance, approval_* |
| التشغيل | drivers, vehicles(+maintenance), deliveries, installment_plans/installments, projects, crm_activities |
| المنصة (SaaS) | platform_* (~70 جدول: tenants, plans, subscriptions, licenses, billing, devices, support, config...) |
| المزامنة | sync_* (outbox, inbox, conflicts, devices, tombstones...) |
