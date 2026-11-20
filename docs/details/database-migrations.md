# ترحيلات قاعدة البيانات

## نظرة عامة: كيف تعمل الترحيلات

تُدار ترحيلات قاعدة البيانات بالكامل داخل المتصفح عبر **sql.js** (SQLite مُصرَّف في الذاكرة/ملف محلي) — لا يوجد خادم قاعدة بيانات خارجي. المنطق في `src/database/migrations/index.ts` ودعمه في `support.ts` / `settings.ts` / `support_part01..03.ts`.

### آلية التطبيق (`runMigrations` في `index.ts`)

1. **مخطط تصريحي أولاً:** يُنفَّذ `SCHEMA_SQL` (من `src/database/schema.ts`) بعد حذف عبارات `CREATE INDEX` منه، لإنشاء كل الجداول الموجودة في أحدث نسخة من المخطط — حتى على قواعد البيانات القديمة.
2. **الترحيلات المعلّقة:** تُطبَّق الترحيلات الموجودة في مصفوفة `MIGRATIONS` والتي لم يُسجَّل `id` الخاص بها بعد في جدول `schema_migrations`.
3. **الفهارس والمخطط الكامل:** بعد نجاح كل الترحيلات يُعاد تنفيذ `SCHEMA_SQL` كاملاً (الجداول idempotent بـ `IF NOT EXISTS`، والفهارس تُنشأ الآن بعد أن أضافت الترحيلات الأعمدة الناقصة)، ثم يُحفظ «بصمة الحزمة» (fingerprint) في `system_settings` تحت المفتاح `__schema_bundle_v1`، ويُشغَّل `ANALYZE` مرة واحدة لإنشاء `sqlite_stat1`.
4. **المسار السريع:** عند الإقلاع، إذا طابقت البصمة المخزّنة *و* كانت كل الترحيلات مسجّلة في `schema_migrations`، يُتخطّى إعادة تشغيل المخطط كله (`schemaReplayed = true`).

### خصائص مهمة

- **الترتيب رقمي وليس ترتيب الملف:** مصفوفة `MIGRATIONS` في `index.ts` تُجمَّع بـ `.flat().sort(...)` حسب البادئة الرقمية في `id` (مثل `024_...` قبل `150_...`). ترتيب الاستيراد في الملف لا يحدد الترتيب الفعلي — المهم هو الرقم داخل `id`. لاحظ أن بعض الملفات تحوي ترحيلات متعددة الأرقام (مثل `part151.ts` يحوي 237–239)، وبعضها يحمل أرقاماً غير متسلسلة (مثل `114_` داخل `part114.ts` أو `195_` داخل `part100.ts`).
- **كل ترحيل داخل معاملة:** `BEGIN TRANSACTION` → `up(db)` → `INSERT OR REPLACE INTO schema_migrations` → `COMMIT`. عند الفشل يُنفَّذ `ROLLBACK` ويتوقف التطبيق عند أول فشل (لأن الترحيلات اللاحقة تعتمد على سابقة) ويُعاد المحاولة عند الإقلاع التالي.
- **Foreign Keys:** تُفعَّل `PRAGMA foreign_keys = ON` قبل كل شيء، ويستطيع الترحيل تعطيلها عبر `disableForeignKeys`، وتُعاد تفعيلها إجبارياً بعد كل ترحيل.
- **التحقق من الكتالوج:** `validateMigrationCatalog()` يرمي خطأ عند وجود `id` مكرر أو فارغ أو خروج عن الترتيب الرقمي (يُستدعى عند تحميل الوحدة).
- **شكل الترحيل:** كل ترحيل كائن `{ id, description, up(db) }` (النوع `Migration` في `support_part03.ts`). كثير من ملفات `partNN.ts` تصدّر **مصفوفة** من عدة ترحيلات (`MIGRATION_PART_NN: Migration[]`) بينما يصدّر بعضها ترحيلاً واحداً. Helpers مثل `addColumn`, `tableExists`, `columnExists`, `backfillReturnLedgerEntries`, `queryLedgerRows` تجعل معظم الترحيلات **idempotent** (تتحقق قبل الإضافة).
- **ملفات مساعدة وليست ترحيلات:** `part05.ts`, `part08.ts`, `part09.ts` ملفات barrel تستورد وحداتها الفرعية؛ و`part05_part01..03.ts`, `part08_part01.ts`, `part09_part01..02.ts` وحدات **دوال مساعدة** لإدخالات دفتر الأستاذ (ledger) يستخدمها الترحيل الرئيسي في `part05_part04` / `part08_part02` / `part09_part03` — لا تحوي ترحيلات بنفسها. كذلك `support_part01..03.ts` وحدات مساعدة للتعريفات والأنواع.

---

## المجموعات المبكرة: الفروع، خطوط المبيعات، المزامنة والمحاسبة (`part01`–`part13`)

### `part01.ts` — الترحيلات 001–007
- **التغييرات:** إدراج الفرع الرئيسي `br_main` في `branches` (001)؛ إضافة `branch_id` للجداول السابقة على الفروع (`warehouses`, `cash_registers`, `sales_invoices`, `purchase_invoices`, `expenses`, `customers`, `users`) مع تعبئة الصفوف القديمة بالفرع الرئيسي وفهارس فرعية (002)؛ أعمدة ربط المبيعات (`sales_rep_id`, `order_id`, `project_id` على الفواتير وعروض الأسعار والمدفوعات) (003)؛ بذر الأدوار الستة المدمجة (ADMIN/MANAGER/ACCOUNTANT/…) في `users` (004)؛ بذر مفاتيح `DEFAULT_SETTINGS` الناقصة (005)؛ عمود `is_default` على `price_lists` (005b)؛ بذر قائمة أسعار التجزئة الافتراضية (006)؛ فهارس مركّبة للأداء على دفتر الأستاذ والفواتير والمدفوعات والإشعارات (007).
- **ملاحظات:** كلها تعديلات أعمدة/بذور بيانات — لا جداول جديدة.

### `part02.ts` — الترحيلات 008–010
- **الجداول الجديدة:** `chart_of_accounts` (دليل الحسابات)، `journal_entries` + `journal_entry_lines` (القيود اليومية وسطورها)، `product_batches` (تشغيلات المنتجات/الدفعات)، وجداول مزامنة سحابية/هجين.
- **التغييرات الأخرى:** ربط فواتير المبيعات بالمشاريع (009)؛ أعمدة توافقية قديمة للموظفين (`employees`) مع تعبئة من الأعمدة القياسية (010).

### `part03.ts` — الترحيلات 011–017
- **الجداول الجديدة:** `order_status_history` (سجل حالات الطلبات) و`users_new` (إعادة بناء جدول المستخدمين لدعم الأدوار المخصصة).
- **التغييرات:** إكمال خط المبيعات (ربط العروض/الطلبات بالفواتير، مبالغ مرتجعة، مدفوعات فواتير)؛ بذر عميل «نقدي» الافتراضي للـ POS؛ صلاحيات تجاوز لكل مستخدم (`permission_effect`)؛ مفاتيح هوية بصرية/branding في `system_settings`؛ تتبع تسليم الطلبات وخط زمني للحالات ومتابعة عروض الأسعار وطرق استرداد المرتجعات؛ إسقاط قيد CHECK على الأدوار المدمجة؛ أعمدة حالة فاتورة المبيعات القديمة؛ السماح بأنواع منتجات عامة غير سيراميك؛ وحدات مخصصة للمنتجات.

### `part04.ts` — الترحيلات 018–023
- **التغييرات (أعمدة/بذور فقط):** عمود درجة/لون السيراميك على المنتجات (018)؛ تجميع مدفوعات العميل لعدة فواتير (019)؛ شروط دفع العميل وتواريخ استحقاق فواتير المبيعات (020)؛ حقول مخصصة للذمم المدينة الأخرى (021)؛ حالة نشط/مؤرشف للموردين (022)؛ حسابات مجمّع الإهلاك ومصروف الإهلاك للأصول الثابتة (023).

### `part05.ts` + `part05_part01..04.ts` — الترحيل 024
- **الملفات المساعدة:** `part05_part01..03.ts` دوال حسابية لقيود دفتر الأستاذ (أنواع صفوف المبيعات/المشتريات/المدفوعات/المصروفات، `ensureLedgerAccounts`, `postLedgerEntry` wrappers).
- **الترحيل `024_unified_accounting_ledger`:** يضيف حسابات تسوية موحّدة ويعيد تعبئة قيود متوازنة (double-entry) لكل الحركات المالية التاريخية (مبيعات، مشتريات، مدفوعات، مصروفات، مرتجعات).

### `part06.ts` — الترحيلات 025–029
- **الجداول الجديدة:** `supplier_payment_allocations` (تخصيص مدفوعات الموردين لفواتير الشراء).
- **التغييرات:** تعبئة قيود المرتجعات التاريخية (025)؛ حساب تكلفة الأصول الثابتة (026)؛ تصحيح القيود التاريخية التي ضمّت إيصالات مكررة (027)؛ حساب ذمم الموردين المدفوعة (028)؛ تعبئة تكلفة اقتناء الأصول في دفتر الأستاذ (029).

### `part07.ts` — الترحيلات 030–032
- **التغييرات (قيود/بذور حسابات):** حسابات رواتب ومخزون وتعبئة عمولات (030)؛ ترحيل تسويات المخزون التاريخية للقيود (031)؛ قيود حركات الرواتب النقدية والاستحقاقات (032).

### `part08.ts` + `part08_part01.ts` + `part08_part02.ts` — الترحيلات 033–035
- **الملف المساعد:** `part08_part01.ts` دوال تخصيص مدفوعات العملاء (`allocateLinkedPayment` وغيرها).
- **الجداول الجديدة:** `customer_payment_allocations` (تخصيص إيصالات العملاء لفواتير المبيعات).
- **التغييرات:** تخصيص المدفوعات التاريخية للتقارير المدينة (033)؛ حساب التزام الأصول المشتراة الآجلة (034)؛ ربط دفعة الجدولة (down payment) بخطة الأقساط (035).

### `part09.ts` + `part09_part01..03.ts` — الترحيلات 036–037
- **الملفات المساعدة:** `part09_part01..02.ts` دوال إعادة تصنيف قيود الأصول (`reclassifyFixedAsset` وغيرها).
- **التغييرات:** إعادة تصنيف القيود التاريخية إلى حسابات التسوية/المصروفات المعتمدة (036)؛ إزالة إعدادات ومزامنة الشبكة القديمة (`sync_*`) (037).

### `part10.ts` — الترحيلات 038–041
- **الجداول الجديدة:** `inventory_cost_layers` (طبقات تكلفة المخزون بنظام FIFO) و`inventory_cost_allocations` (تخصيصات صرف التكلفة).
- **التغييرات:** بذر طبقة افتتاحية تقديرية للمخزون القائم (038)؛ الحفاظ على ترتيب FIFO في مرتجعات الصرف (039)؛ تفعيل تكلفة FIFO للحركات الجديدة (040)؛ إنشاء تخصيصات FIFO تقديرية قابلة للعكس للمبيعات القديمة (041)؛ ربط تخصيصات FIFO ببند فاتورة المبيعات للإرجاع الدقيق.

### `part11.ts` — الترحيلات 042–046
- **التغييرات:** إعادة بناء أرصدة دليل الحسابات من سطور القيود (042)؛ تشفير/تجزئة PINs المستخدمين وإزالتها من استجابات API (043)؛ إزالة هوية النشاط التجريبي (044)؛ إعادة حساب مجمل ربح الفواتير التاريخي بدون ضريبة/شحن (045)؛ إضافة أعمدة `received_date, supplier_id, cost_price, quantity_remaining_m2, created_by` إلى `product_batches` مع تعبئة الكمية المتبقية (046).

### `part12.ts` — الترحيل 047 (دورة المشتريات الكاملة)
- **الجداول الجديدة:** `supplier_rfqs` + `supplier_rfq_items` (طلبات عروض الأسعار)، `supplier_quotations` + `supplier_quotation_items` (عروض أسعار الموردين)، `goods_receipt_notes` + `goods_receipt_notes_items` (إشعارات استلام البضائع/GRN)، `supplier_claims` + `supplier_claim_items` (مطالبات الموردين).
- **التغييرات:** أعمدة التكلفة المحمّلة (landed cost) والمطابقة الثلاثية (3-way matching) وفحص الاستلام المستقل.

### `part13.ts` — الترحيل 048 (المخازن الاحترافية)
- **الجداول الجديدة:** `warehouse_locations` (مواقع/أرفف داخل المستودع مع باركود الرف)، `product_location_stock` (مخزون لكل موقع)، `inventory_special_stocks` (مخزون خاص)، `inventory_reconciliation_logs` (سجل تسويات الجرد).
- **التغييرات:** أعمدة تعزيزات على التحويلات والعدّ (`stock_transfers`, `stock_counts`) و`branches` ثانوية.

### `enterprise.ts` + `enterprisePart01..03.ts` + `enterprisePart01_part01..03.ts` + `enterprisePart02.ts` + `enterprisePart02_part01..03.ts` + `enterprisePart03.ts` — الترحيل 049
- **الملفات الوسيطة:** `enterprise.ts` يجمّع `runEnterprisePart1..9`؛ `enterprisePart01.ts` و`enterprisePart02.ts` ملفات barrel.
- **الجداول الجديدة (المالية المؤسسية):**
  - `fiscal_years` + `fiscal_periods` (سنوات وفترات مالية OPEN/CLOSED/LOCKED) — `enterprisePart01_part01.ts`
  - `bank_accounts` + `bank_reconciliations` + `bank_reconciliation_lines` (حسابات بنكية وتسويات) — `enterprisePart01_part02.ts`
  - `cheque_status_history` (سجل حالات الشيكات) — `enterprisePart01_part03.ts`
  - `cost_centers` + `budgets` + `budget_items` (مراكز تكلفة وموازنات) — `enterprisePart02_part01.ts` (مع إضافة `cost_center_id` إلى `journal_entry_lines`, `expenses`, `sales_invoices`, `purchase_invoices`)
  - `cash_forecast_items` (توقعات التدفق النقدي) — `enterprisePart02_part01.ts`
  - `payment_gateways` + `payment_gateway_settlements` (بوابات الدفع الإلكتروني وتسويتها) — `enterprisePart02_part02.ts`
  - `currencies` + `currency_exchange_rates` (عملات متعددة وأسعار صرف) — `enterprisePart02_part02.ts`
  - مشغّلات `trg_prevent_delete_coa_*` لمنع حذف الحسابات المستخدمة — `enterprisePart02_part03.ts`
- **التغييرات على `cheques`:** أعمدة `bank_account_id, deposited_at, cleared_at, bounced_at, bounce_reason, bounce_fee, journal_entry_id, clearing_entry_id, bounce_entry_id`.
- **البذور:** `enterprisePart03.ts` يزرع حسابات مؤسسية قياسية في `chart_of_accounts` (حسابات بنوك/شيكات/بوابات دفع)، ويزرع العملات (EGP/SAR/USD/EUR/AED) والسنة المالية الحالية بفتراتها الـ12.

### `part14.ts` — الترحيلات 105–111
- **الجداول الجديدة:** `app_config_entries`, `app_config_rules`, `app_config_versions` (تكوين تطبيق ديناميكي)؛ `app_config_scope_entries`, `app_config_scope_versions` (تجاوزات بنطاق)؛ `domain_events` (سجل أحداث الأعمال append-only للـ observability/idempotency)؛ وجدول وسيط `stock_counts_type_upgrade`.
- **التغييرات:** توسيع أنواع `stock_counts`؛ إضافة `company_id` للذمم المدينة الأخرى؛ مفاتيح idempotency لمرتجعات المبيعات/المشتريات ومدفوعات العملاء.

### `part15.ts` — الترحيل 112
- **الجداول الجديدة:** `hr_job_postings` + `hr_job_candidates` (وظائف التوظيف وخط المتقدمين، بنطاق الفرع).

### `part16.ts` — الترحيلات 122–124
- **الجداول الجديدة:** `business_partners` + `partner_account_transactions` (حسابات الشركاء والملكية وسجل حركات مالي غير قابل للتعديل)؛ إضافة `branch_id` لسجلات `inventory_reconciliation_logs`؛ أعمدة هاتف/ضريبة اختيارية على `branches`.

### `part17.ts` — الترحيل 125
- **الجداول الجديدة:** `financial_calendar_events`, `financial_calendar_payments`, `financial_calendar_attachments`, `financial_calendar_audit` (تقويم مالي بنطاق الفرع).

### `part18.ts` — الترحيلات 126–127
- **الجداول الجديدة:** `fixed_asset_depreciation_periods`, `fixed_asset_disposals`, `fixed_asset_maintenance`, `fixed_asset_transfers`, `fixed_asset_count_campaigns`, `fixed_asset_count_observations`, `fixed_asset_count_snapshots`, `fixed_asset_count_audit` (دورة حياة الأصول الثابتة والإهلاك والجرد الفعلي).
- **التغييرات:** طرق إهلاك جديدة وأعمدة على `fixed_assets`؛ فهارس تواريخ استحقاق فواتير المصدر (127).

### `part19.ts` — الترحيلات 128–129
- **الجداول الجديدة:** `fixed_asset_attachments`, `fixed_asset_depreciation_requests` (مرفقات ومراجعة على مرحلتين لطلبات الإهلاك)؛ `customer_warranty_claims`, `customer_warranty_claim_events` (مطالبات الضمان/الإصلاح/الاستبدال مع سجل تدقيق).

### `part20.ts` — الترحيل 130
- **الجداول:** توسعة `partner_account_transactions` — قروض، سحوبات، تسويات، عكس قيود، وتأثيرات رصيد موقّعة على حسابات الشركاء.

### `part21.ts` — الترحيل 131
- **الجداول الجديدة:** `partner_ownership_history`, `partner_capital_history`, `partner_profit_share_history`, `partner_ownership_policies` (تاريخ الملكية ورأس المال والأرباح).

### `part22.ts` — الترحيل 132
- **الجداول الجديدة:** `user_login_pin_change_requests` (طلبات تغيير PIN بموافقة مدير).

### `part23.ts` — الترحيل 133
- **الجداول الجديدة:** `operational_field_definitions`, `operational_field_options`, `operational_field_values` (حقول مخصصة تشغيلية قابلة لإعادة الاستخدام) و`product_grade_options` (درجات منتجات قابلة للتهيئة).

### `part24.ts` — الترحيل 134
- **التغييرات:** حذف قيم `operational_field_values` عند حذف السجل التشغيلي (مشغّلات/تنظيف).

### `part25.ts` — الترحيلات 135–136
- **التغييرات:** تخزين PINs المستخدمين كنص مشفّر بمفتاح قاعدة البيانات (135)؛ عمود حالة نشط/غير نشط للعملاء (136).

### `part26.ts` — الترحيلات 137–138
- **الجداول الجديدة:** `quotation_service_items` (بنود خدمة/عمالة مسعّرة في عروض الأسعار)، `project_apartment_estimates` (مقاسات الغرف وتشطيبات الشقق لكل مشروع).

---

## الموارد البشرية: الرواتب، الحضور، العقود، الأداء، التدريب (`part27`–`part57`)

### `part27.ts` — الترحيل 139
- **الجداول الجديدة:** `payroll_runs`, `payroll_run_items` (دورات رواتب دورية بلقطات مفصّلة وتتبع دقائق الحضور).

### `part28.ts` — الترحيل 140
- **الجداول الجديدة:** `attendance_unified`, `attendance_shifts`, `employee_shift_assignments`, `attendance_breaks`, `attendance_correction_requests`, `attendance_holidays`, `attendance_audit_log` (توحيد الحضور والجدولة والبصمات والاستراحات والموافقات والتدقيق).

### `part29.ts` — الترحيل 141
- **الجداول الجديدة:** `employee_leave_balance_transactions`, `employee_leave_type_policies`, `employee_leave_attendance_links` (أرصدة إجازات مدقّقة وسياسات أنواع وربط الإجازات المعتمدة بالحضور).

### `part30.ts` — الترحيل 142
- **الجداول الجديدة:** `employee_status_history`, `employee_salary_history`, `employee_final_settlements` (دورة حياة الموظف وتاريخ الرواتب وتسويات إنهاء الخدمة).

### `part31.ts` — الترحيل 143
- **الجداول الجديدة:** `employee_job_titles`؛ توسيع ملفات الموظفين.

### `part32.ts` — الترحيل 144
- **الجداول الجديدة:** `employee_document_versions` (بيانات ملفات مستندات الموظفين المشفّرة وسجل إصدارات غير قابل للتعديل).

### `part33.ts` — الترحيل 145
- **الجداول الجديدة:** `employee_leave_accrual_policies` (سياسات استحقاق إجازات حسب الفرع/الموظف مع توليد معاملات رصيد مدقّقة).

### `part34.ts` — الترحيل 146
- **الجداول الجديدة:** `hr_candidate_interviews`, `hr_candidate_offers` (سير عمل التوظيف: مقابلات وعروض).

### `part35.ts` — الترحيل 148
- **الجداول الجديدة:** `operation_shifts`, `operation_shift_assignments`, `operation_shift_staff`, `operation_shift_handovers`, `operation_shift_incidents`, `operation_shift_production`, `employee_attendance_periods` (ورديات تشغيل 24/7 وتسليماتها وحضورها وإنتاجها لكل وردية).

### `part36.ts` — الترحيل 147
- **الجداول الجديدة:** `users_departments` (تعيينات وصول المستخدمين إلى أقسام HR).

### `part37.ts` — الترحيل 149
- **التغييرات:** وجهات دفع لكل موظف في الرواتب، مراجع تحويل، إثباتات دفع، وموافقة على العمل الإضافي على مستوى الفترة (أعمدة على `payroll_runs`/`employees` — لا جداول جديدة).

### `part38.ts` — الترحيل 150
- **الجداول الجديدة:** `payroll_tax_rules`, `payroll_tax_brackets` (محرك ضريبة رواتب تدريجي قابل للتهيئة + إعفاءات الموظفين).

### `part39.ts` — الترحيل 151
- **الجداول الجديدة:** `job_grades`, `cost_centers` (بإنشاء شرطي `IF NOT EXISTS` — آمن لأن enterprise أنشأها سابقاً في 049)، `employee_transfers`, `employee_lifecycle_events` (تسلسل هرمي للأقسام ودرجات وظيفية ومراكز تكلفة ونقل الموظفين وأحداث دورة الحياة).

### `part40.ts` — الترحيل 152
- **الجداول الجديدة:** `employee_onboarding_tasks`, `employee_custody_items`, `employee_probation_reviews` (قوائم تهيئة وأمانات ومراجعات تجربة).

### `part41.ts` — الترحيل 153
- **الجداول الجديدة:** `performance_cycles`, `performance_goals`, `performance_kpis`, `performance_evaluations`, `performance_evaluation_items`, `performance_pips`, `performance_rewards` (إدارة الأداء الكاملة).

### `part42.ts` — الترحيل 154
- **الجداول الجديدة:** `training_courses`, `training_enrollments`, `training_trainers`, `skills`, `job_skills`, `employee_skills` (التدريب والمهارات).

### `part43.ts` — الترحيل 155
- **الجداول الجديدة:** `training_expenses` + حساب مصروف تدريب مخصص.

### `part44.ts` — الترحيل 156
- **التغييرات:** وجهات دفع (خزينة/حساب بنكي) لمصروفات التدريب — أعمدة فقط.

### `part45.ts` — الترحيل 157
- **الجداول الجديدة:** `hr_violations`, `hr_warnings`, `hr_penalties`, `hr_complaints`, `hr_appeals`, `hr_case_attachments` (الانضباط والشكاوى).

### `part46.ts` — الترحيل 158
- **الجداول الجديدة:** `hr_allowances`, `hr_benefits`, `hr_loans`, `hr_loan_installments`, `hr_leave_settlements` (البدلات والمزايا والقروض وتسويات الإجازات).

### `part47.ts` — الترحيل 159
- **التغييرات:** أعمدة خصم البدلات/القروض على بنود `payroll_run_items` — لا جداول.

### `part48.ts` — الترحيل 160
- **الجداول الجديدة:** `operation_shift_swap_requests` (حد أدنى للموظفين ومتطلبات راحة ومبادلات ورديات بموافقة مدير).

### `part49.ts` — الترحيل 161
- **الجداول الجديدة:** `facility_locations`, `facility_assets`, `facility_work_orders`, `facility_contracts`, `facility_safety_records` (بداية إدارة المرافق الموحّدة).

### `part50.ts` — الترحيل 162
- **الجداول الجديدة:** `hr_self_service_requests` (خدمة ذاتية للموظفين + منح صلاحيات البوابة للأدوار).

### `part51.ts` — الترحيل 163
- **الجداول الجديدة:** `facility_maintenance_schedules` (ربط أوامر العمل بالمصروفات/المخزون + جداول صيانة وقائية دورية).

### `part52.ts` — الترحيل 164
- **التغييرات:** أعمدة IP وUser-Agent على سجل تسجيل الدخول — لا جداول.

### `part53.ts` — الترحيل 165
- **الجداول الجديدة:** `data_import_batches`, `data_import_batch_records` (تتبع استيراد العملاء/المنتجات للتراجع الآمن).

### `part54.ts` — الترحيل `164_facility_management_crud_and_work_order_lifecycle`
- **الجداول الجديدة:** `facility_work_order_logs`, `facility_work_order_attachments`, `facility_asset_transfers`, `facility_asset_maintenance_logs` (تحرير/أرشفة/سجل تغييرات للمواقع والأصول ودورة حياة كاملة لأوامر العمل).
- **ملاحظات:** رقم الترحيل `164` مكرر مع `164_login_history_request_metadata` في part52 — مسموح لأن المعرف الكامل مختلف؛ الترتيب الرقمي متساوٍ فيُحسم أبجدياً.

### `part55.ts` — الترحيل 166
- **التغييرات:** ربط أصول وأوامر العمل بالمرافق بـ `employees` (وليس فقط `users`) — أعمدة/FK فقط.

### `part56.ts` — الترحيل 167
- **الجداول الجديدة:** `payroll_social_insurance_rules`, `payroll_social_insurance_contributions`, `payroll_end_of_service_rules`, `payroll_end_of_service_settlements` (محرك التأمينات الاجتماعية المصرية «تمكين» ومكافأة نهاية الخدمة بتواريخ سريان تشريعية).

### `part57.ts` — الترحيل 168
- **الجداول الجديدة:** `hr_workforce_plans`, `hr_workforce_plan_jobs`, `hr_hiring_requisitions`, `hr_headcount_snapshots` (تخطيط القوى العاملة ومقارنة المخطط/الفعلي وتنبيهات العجز/الفائض).

---

## الإغلاق المالي، أجهزة الحضور، والمرافق المتقدمة (`part58`–`part66`)

### `part58.ts` — الترحيل 171 (سير عمل الإغلاق المالي)
- **الجداول الجديدة:** `period_close_runs`, `period_close_tasks`, `period_close_task_attachments`, `period_reconciliations`, `period_adjustments`, `period_close_reports`, `fiscal_year_openings`, `fiscal_close_approvals`, `fiscal_close_audit` (إغلاق فترات بنطاق شركة/فرع مع مهام وتسويات وأرصدة افتتاحية وموافقات وتدقيق).

### `part59.ts` — الترحيل 170
- **الجداول الجديدة:** `hr_attendance_devices`, `hr_attendance_device_records`, `hr_attendance_import_logs`, `hr_mobile_attendance_sessions` (أجهزة بصمة/حضور وبصمات خام وسجلات استيراد وجلسات موبايل).

### `part60.ts` — الترحيل 171 (موردو خدمات المرافق وعقود SLA)
- **الجداول الجديدة:** `facility_service_vendors`, `facility_vendor_evaluations`, `facility_contract_payments`, `facility_contract_renewals`, `facility_contract_amendments` (دورة حياة عقود كاملة مع SLA ومدفوعات وتجديدات وتقييمات).

### `part61.ts` — الترحيل 172 (السلامة والمخاطر)
- **الجداول الجديدة:** `facility_risk_register`, `facility_inspection_checklists`, `facility_inspection_checklist_items`, `facility_inspection_records`, `facility_inspection_record_items`, `facility_accidents`, `facility_capa`, `facility_ppe_inventory`, `facility_ppe_assignments`, `facility_fire_equipment`, `facility_evacuation_drills`, `facility_safety_training`, `facility_safety_training_attendees` (سجل مخاطر وفحوصات وحوادث وإجراءات تصحيحية ومعدات حماية وحرائق ومناورات إخلاء وتدريب سلامة).

### `part62.ts` — الترحيل 173 (المرافق)
- **الجداول الجديدة:** `facility_utility_meters`, `facility_utility_readings`, `facility_utility_bills`, `facility_utility_contracts`, `facility_utility_outages` (عدادات واستهلاك وفواتير عقود وانقطاعات + مقارنة فروع).

### `part63.ts` — الترحيل 174 (خدمات النظافة)
- **الجداول الجديدة:** `facility_cleaning_schedules`, `facility_cleaning_tasks`, `facility_cleaning_task_items`, `facility_cleaning_checklists`, `facility_cleaning_supplies`, `facility_cleaning_supply_usage` (جداول نظافة ومهام وقوائم فحص ومخزون مستلزمات مع صور قبل/بعد).

### `part64.ts` — الترحيل 175 (الصيانة التنبؤية)
- **الجداول الجديدة:** `facility_asset_health`, `facility_condition_triggers`, `facility_condition_activations`, `facility_failure_predictions`, `facility_rul_tracking` (صحة الأصول والمشغّلات الشرطية وتوقعات الأعطال والعمر الإنتاجي المتبقي RUL).

### `part65.ts` — الترحيل 176
- **التغييرات:** تخزين تجزئات مملّحة لمفاتيح الأمان المستقلة (user security keys) — جدول/أعمدة على `users`.

### `part66.ts` — الترحيل 177
- **التغييرات:** فهارس أداء لاستعلامات البحث والربط المتكررة — لا جداول.

---

## الضمانات، الفواتير الإلكترونية، والمشاريع/الشقق (`part67`–`part71`)

### `part67.ts` — الترحيلات 173–175, 190
- **الجداول الجديدة:** `warranty_claim_executions` (ربط قرارات الضمان المنفّذة بسجلاتها المالية/المبيعات/الخدمة).
- **التغييرات:** فهارس تجميعات لوحة التحكم (173)؛ أعمدة تدقيق وقيود uniqueness للفاتورة الإلكترونية ETA على الفواتير (174)؛ أعمدة ربط حسابات بنكية بمبيعات/إيصالات/استردادات POS (190).

### `part68.ts` — الترحيل 178
- **التغييرات:** احتياطي وضريبة ومدفوعات تقديرات الشقق — أعمدة على `project_apartment_estimates` وأعمدة فاتورة المبيعات المرتبطة.

### `part69.ts` — الترحيل 179
- **الجداول الجديدة:** `project_apartment_estimate_versions`, `project_apartment_estimate_quotation_links` (إصدارات غير قابلة للتعديل لمراجعات التقديرات وروابط عروض الأسعار).

### `part70.ts` — الترحيل 180
- **الجداول الجديدة:** `project_estimate_contracts`, `project_estimate_execution_setups`, `project_payment_certificates`, `project_actual_cost_entries` (ربط التقديرات المعتمدة بعقود المشاريع والجداول وشهادات الدفع والتكاليف الفعلية).

### `part71.ts` — الترحيل 181
- **التغييرات:** شروط التقدير الموجهة للعميل (طباعة/تصدير متسق) — أعمدة فقط.

---

## منصة الإدارة المركزية — الحسابات، الخطط، التراخيص (`part72`–`part85`)

### `part72.ts` — الترحيل 190
- **التغييرات (بذور):** زرع حساب مالك المنصة الوحيد، دور المنصة، الخطط، الوحدات، وفهرس الميزات في جداول `platform_*` (تعريفات موجودة في SCHEMA_SQL).

### `part73.ts` — الترحيل 191
- **الجداول الجديدة:** `platform_tenant_accounts` (ملف عملاء المنصة/المستأجرين).

### `part74.ts` — الترحيل 192
- **الجداول الجديدة:** `platform_tenant_overrides` (تجاوزات تسعير/حدود/صلاحيات لكل مستأجر فوق الخطط).

### `part76.ts` — الترحيل 193
- **الجداول الجديدة:** `platform_tenant_users` (دليل مستخدمي كل مستأجر يديره مالك المنصة).

### `part77.ts` — الترحيل 194
- **الجداول الجديدة:** `platform_license_activations` (أكواد تفعيل وشهادات وسجل تفعيل للتراخيص).

### `part79.ts` — الترحيل 195
- **الجداول الجديدة:** `platform_devices` (سجل أجهزة لكل مستأجر).

### `part80.ts` — الترحيل 196
- **الجداول الجديدة:** `platform_release_targets` (إصدارات إلزامية/حد أدنى/مجموعات طرح).

### `part81.ts` — الترحيل 197
- **الجداول الجديدة:** `platform_support_tickets`, `platform_support_messages` (تذاكر دعم مع موافقة وصول عن بُعد).

### `part82.ts` — الترحيل 198
- **الجداول الجديدة:** `platform_api_keys` (مفاتيح API لكل مستأجر بأسرار مجزّأة ونطاقات).

### `part83.ts` — الترحيل 199
- **الجداول الجديدة:** `platform_coupons` (قسائم خصم لفوترة المنصة).

### `part84.ts` — الترحيل 200
- **التغييرات:** سحب صلاحيات التقارير المالية الحساسة من الأدوار غير المالية — تحديثات بيانات/صلاحيات فقط.

### `part85.ts` — الترحيل 201
- **الجداول الجديدة:** `permission_amount_limits`, `screen_permissions`, `user_warehouse_grants` (أبعاد التخويل: حدود مبالغ وصلاحيات شاشات ومنح مستودعات).

---

## ترحيلات 100–160: المنصة، الفجوات البنيوية، وتحويل العملة (`part100`–`part160`)

### `part100.ts` — الترحيل 195
- **الجداول الجديدة:** `platform_license_changes`, `platform_subscription_changes` (سجل تغييرات التراخيص/الاشتراكات)؛ أعمدة `branches_limit`, `starts_at`, `offline_grace_period_days`, `coupling_mode` على التراخيص/الاشتراكات.
- **ملاحظات:** رقم الترحيل يتعارض رقمياً مع `195_platform_devices` في part79 — كلاهما له `id` فريد والفرز الأبجدي يحسم الترتيب.

### `part101.ts` — الترحيل 150
- **الجداول الجديدة:** `platform_plan_versions`, `platform_price_history`, `platform_subscription_price_locks`, `platform_plan_upgrade_rules` (إصدارات الخطط وقفل الأسعار وقواعد الترقية).

### `part102.ts` — الترحيل 152
- **الجداول الجديدة:** `platform_feature_overrides` (تجاوزات ميزات مستهدفة)؛ توسيع `platform_releases` (حزمة/بصمات/checksums/rollback/changelog).

### `part103.ts` — الترحيل 153
- **الجداول الجديدة:** `platform_audit_retention_archives`؛ توسيع `platform_audit_logs` (severity, actorType, tenantId, deviceId, ipAddress, oldValues/newValues, hash chaining, append-only).

### `part104.ts` — الترحيل 154
- **الجداول الجديدة:** `platform_tenant_activities`, `platform_tenant_activity_versions` (ملفات نشاط أعمال لكل مستأجر مع لقطات واسترجاع).

### `part105.ts` — الترحيل 155
- **الجداول الجديدة:** `platform_ops_jobs`, `platform_maintenance_windows`, `platform_op_approvals`, `platform_sync_log` (مركز العمليات).

### `part106.ts` — الترحيل 156
- **الجداول الجديدة:** `platform_tenant_branding`, `platform_tenant_branding_versions` (هوية بصرية/علامة بيضاء/قوالب فواتير ولقطات).

### `part107.ts` — الترحيل 157
- **الجداول الجديدة:** `platform_ui_profiles`, `platform_tenant_ui_customizations`, `platform_tenant_ui_versions` (تخصيص UI لكل مستأجر: إظهار صفحات/أزرار/حقول نماذج).

### `part108.ts` — الترحيل 158
- **الجداول الجديدة:** `platform_config_templates`, `platform_tenant_configs`, `platform_tenant_config_versions`, `platform_config_rollouts`, `platform_tenant_config_ack` (تكوين ديناميكي مركزي موقّع وطرح مرحلي).

### `part109.ts` — الترحيل 159
- **الجداول الجديدة:** `platform_server_telemetry`, `platform_central_backups`, `platform_service_incidents` (تشخيص خوادم ومراقبة موارد وتحقق نسخ احتياطي وإدارة حوادث).

### `part110.ts` — الترحيل 160
- **الجداول الجديدة:** `platform_remote_sessions`, `platform_support_canned_replies` (جلسات وصول عن بُعد SLA وملاحظات داخلية وردود جاهزة).

### `part111.ts` — الترحيل 161
- **الجداول الجديدة:** `platform_staff` (موظفو المنصة بأدوار دقيقة).

### `part112.ts` — الترحيل 162
- **الجداول الجديدة:** `platform_staff_logins`, `platform_staff_sessions`, `platform_security_incidents_log`, `platform_signing_keys` (مركز أمان المنصة: دخول/جلسات/حوادث/مفاتيح توقيع).

### `part113.ts` — الترحيل 163
- **التغييرات:** أعمدة `password_hash` وحقول مصادقة على `platform_staff` — لا جداول.

### `part114.ts` — الترحيل 114
- **التغييرات:** أعمدة تزويد/دعوة على `platform_tenant_users` (إنشاء/دعوة حسابات هوية حقيقية من Super Admin).

### `part115.ts` — الترحيل 200
- **الجداول الجديدة:** `platform_permissions`, `platform_role_permissions`, `platform_staff_invites`, `platform_staff_scopes`, `platform_trusted_devices` (RBAC دقيق للمنصة + MFA/دعوات/أجهزة/نطاق بيانات/حذف ناعم + بذرة كتالوج الصلاحيات).

### `part116.ts` — الترحيل 201
- **الجداول الجديدة:** `platform_staff_2fa` (أسرار TOTP/HOTP وبيانات استرداد مجزّأة لموظفي المنصة).

### `part117.ts` — الترحيل 202
- **التغييرات:** بذر `platform_settings.platform.dataSource = local` (مفتاح تبديل ترحيل إدارة مركزية) — بيانات فقط.

### `part118.ts` — الترحيل 203
- **التغييرات:** بذر/منح صلاحيات `platform.backups.restore/delete` لدور PLATFORM_ADMIN — بيانات صلاحيات فقط.

### `part119.ts` — الترحيل 204
- **الجداول الجديدة:** `sync_account_links`, `sync_link_permissions`, `sync_change_notes`, `sync_pending_changes` (روابط حسابات شركات وموافقات مالك على تعديلات الفروع).

### `part120.ts`–`part127.ts` — الترحيلات 205–212 (الفجوات البنيوية والقيود)
- **`part120` (205):** أعمدة نطاق فرع لجداول أعمال لم يمكن إسنادها لفرع.
- **`part121` (206):** قيود CHECK للمبالغ غير السالبة وحدود الكميات على الجداول الأساسية.
- **`part122` (207):** جدول `reconciliation_runs` (تتبع تشغيلات تدقيق الاتساق ونتائجها).
- **`part123` (208):** إعلان مفاتيح أجنبية مفقودة على جداول HR والشيكات والتدريب والحركات.
- **`part124` (209):** منع تداخل الفترات/السنوات المالية على مستوى قاعدة البيانات (مشغّلات).
- **`part125` (210):** جعل `branch_id` بقيمة `NOT NULL` على جداول فجوة النطاق من 205.
- **`part126` (211):** فرض `NOT NULL` على `branch_id`/`company_id` عبر جداول الأعمال.
- **`part127` (212):** فرض دقة المبالغ (قرش) والكميات (مليمتر مربع) عبر CHECK constraints.

### `part128.ts` — الترحيل 213
- **التغييرات:** تحويل أعمدة أموال دفتر الأستاذ من `REAL` إلى `INTEGER` (وحدات صغرى/قروش) عبر إعادة بناء الجداول.
- **ملاحظات:** أضخم ترحيل بنيوي في السلسلة — يمهّد لسلسلة 215–227.

### `part129.ts` — الترحيل 214
- **التغييرات:** توسيع CHECK `approval_requests.request_type` لعمليات موافقات موحّدة.

### `part130.ts`–`part143.ts` — الترحيلات 215–227 (تحويل العملة إلى القروش لكل النطاقات)
- كلها تحويل أعمدة مبالغ من وحدات كبرى إلى `INTEGER` piastres بآلية إعادة بناء جداول آمنة:
  - `part130` (215): فواتير/مرتجعات المبيعات.
  - `part131` (216): فواتير/مرتجعات المشتريات.
  - `part132` (217): المدفوعات وأرصدة العملاء/الموردين والمصروفات.
  - `part133` (218): حقول اشتراك/سعر على `platform_tenants` وبيانات اعتماد على `platform_tenant_users` + جدول `platform_branches`.
  - `part134` (218): أسعار المنتجات وأعمدة تكلفة المخزون.
  - `part135` (219): الطلبات/عروض الأسعار/الأقساط/الذمم/ورديات النقد.
  - `part136` (220): خط أنابيب المشتريات.
  - `part137` (221): HR/الرواتب.
  - `part138` (222): المشاريع/العقود.
  - `part139` (223): الأصول/المرافق/العمليات.
  - `part140` (224): إضافات مالية (شيكات/موازنات/تسويات).
  - `part141` (225): فوترة المنصة.
  - `part142` (226): متفرقات.
  - `part143` (227): أرصدة الخزينة وإجماليات عروض الأسعار.

### `part144.ts` — الترحيل 228
- **الجداول الجديدة:** `employee_branch_assignments`؛ أعمدة بائع/عمولة/هدف على الموظفين (ربط مندوب المبيعات بفروع).

### `part145.ts`–`part149.ts` — الترحيلات 229–233
- `part145` (229): فهرس/تعديل قيود فريدة على مرجع `approval_requests` للسماح بعدة طلبات موافقة مستهلكة لسجل واحد.
- `part146` (230): استثناء الصف المتعارض من مشغّلات تداخل الفترات ليدعم UPSERT.
- `part147` (231): السماح بحالتي `ON_HOLD` و`READY` في CHECK حالات الطلبات.
- `part148` (232): ربط `sales_order_id` وأعمدة ملاحظات بـ `production_orders`.
- `part149` (233): عمود `page_paths` على `platform_feature_flags` لربط ميزة بصفحات.

---

## التصنيع، القطاعات الصناعية، والسيراميك (`part150`–`part160`)

### `part150.ts` — الترحيلات 234–236
- **التغييرات:** عمود `produced_qty` على `production_orders` للإنجاز الجزئي (234)؛ فهرس فريد جزئي لضمان BOM نشط واحد لكل منتج (235)؛ توحيد `bom_items.unit` إلى وحدة المخزون الأساسية (236).

### `part151.ts` — الترحيلات 237–239
- **الجداول الجديدة:** `bom_operations` (قوالب توجيه BOM: مركز عمل + دقائق لكل وحدة), `manufacturing_downtime` (أحداث توقف مرتبطة بمراكز العمل/العمليات/أوامر الإنتاج).
- **التغييرات:** `overhead_per_hour` على `work_centers` و`reserved_qty` على `production_order_materials`.

### `part152.ts` — الترحيلات 240–241
- **التغييرات:** أعمدة سير عمل الموافقات على `production_orders` (240)؛ `operator_id` على عمليات الإنتاج و`production_order_id` على `product_batches` (241).

### `part153.ts` — الترحيلات 242–243
- **الجداول الجديدة:** `manufacturing_defect_codes`, `manufacturing_quality_check_defects`, `production_qc_holds` (خطة AQL وأكواد عيوب وحجب جودة قبل الاستلام).
- **التغييرات:** أعمدة AQL على `manufacturing_quality_checks` و`requires_final_qc` على BOMs.

### `part154.ts` — الترحيل 244
- **التغييرات:** أعمدة نسب إعادة العمل (rework lineage) على `production_orders`.

### `part155.ts` — الترحيلات 245–248
- **الجداول الجديدة:** `production_operation_labor` (عمالة العمليات), `manufacturing_mps_entries` (إدخالات MPS), `material_issue_lots` (نسَبة دفعات مواد الإنتاج).
- **التغييرات:** تكرار الصيانة `recurrence_interval`؛ حساب WIP `1205` في دليل الحسابات.

### `part156.ts` — الترحيلات 247–251 (القطاعات الصناعية + HSE + شحن + خطوط إنتاج)
- **الضيافة:** `hotel_room_types`, `hotel_rooms`, `hotel_reservations`, `hotel_folio_entries`, `hotel_housekeeping_tasks`.
- **الورشة:** `workshop_work_orders`, `workshop_work_order_parts`, `workshop_inspection_items`, `workshop_customer_approvals`.
- **التعليم:** `edu_classes`, `edu_class_schedules`, `edu_enrollments`, `edu_attendance`, `edu_fee_installments`.
- **الفوترة الزمنية:** `time_entries`, `time_billing_batches`, `time_billing_batch_items`.
- **الصحة والسلامة:** `hse_incidents`, `hse_permits`, `hse_inspections`, `hse_trainings`.
- **أخرى:** `product_expiry_lots`, `shipment_qc_checks` (فحص جودة قبل الشحن)، `production_lines` (سطور إنتاج + `work_centers.production_line_id`).

### `part157.ts` — الترحيل 252
- **الجداول الجديدة:** `ceramic_area_quotes` (قياسات مساحات الصالات).

### `part158.ts` — الترحيل 253
- **التغييرات:** روابط عروض أسعار على `ceramic_area_quotes` — أعمدة فقط.

### `part159.ts` — الترحيلات 254–255
- **الجداول الجديدة:** `ceramic_service_orders`, `ceramic_commissions` (سير عمل خدمات السيراميك والعمولات)؛ `project_subcontractors`, `project_site_daily_reports`, `project_site_report_items` (مقاولو الباطن وتقارير الموقع اليومية).

### `part160.ts` — الترحيلات 256–259
- **الجداول الجديدة:** `project_estimate_line_progress` (كميات منفّذة لكل بند تقدير), `subcontractor_certificates` (مطالبات إنجاز مقاولي الباطن).
- **التغييرات:** `estimate_kind` على `project_apartment_estimates`؛ حقول عقد على `project_subcontractors`.

---

## ملفات `steps/inline-*.ts` — الترحيلات المُضمَّنة المرقّمة (014–259)

هذه الملفات تضم ترحيلات أُضيفت لاحقاً داخل `index.ts` باسمائها الرقمية (وليس كأجزاء `partNN`). كلها idempotent عبر helpers.

### `steps/inline-014.ts` — الترحيلات 014, 050–059
- `014_payroll_notification_settings`: إعدادات إشعارات رواتب لكل فرع (استحقاق/تأخر).
- `050_cash_shift_auto_close`: تتبع ورديات الكاشير المغلقة آلياً.
- `051_cheques_represented_status`: حالة «معاد تقديمه» للشيكات.
- `052_purchase_invoice_due_dates`: تواريخ استحقاق فواتير الموردين لتوقعات التدفق.
- `053_sales_batch_return_traceability`: تتبع استهلاك الدفعات لكل بند بيع واستعادتها في المرتجعات — جداول `sales_invoice_batch_allocations`, `sales_return_batch_allocations`.
- `054_sales_financial_reconciliations`: لقطات تسوية مالية مبيعات مراجعة — جدول `sales_financial_reconciliations`.
- `055_remove_unmodified_sample_records`: حذف سجلات تجريبية غير معدّلة (بنوك/مراكز تكلفة/بوابات/مواقع/هاتف نقدي).
- `056_supplier_payment_idempotency`: منع تكرار مدفوعات الموردين عند إعادة المحاولة.
- `057_explicit_user_branch_scope`: نطاق فروع معيّن/مركزي للمستخدمين المحليين.
- `058_branch_scoped_approvals_and_action_permissions`: نطاق `approval_requests` بالفروع وتقسيم صلاحيات الإجراءات عالية التأثير.
- `059_invoice_created_at_list_indexes`: فهارس `created_at` لقوائم الفواتير الأحدث أولاً.

### `steps/inline-060.ts` — الترحيلات 060–066
- **الجداول الجديدة:** `companies` (كيانات قانونية), `module_activation_log` + `module_settings` (دورة حياة سجل الوحدات وإعداداتها), `enterprise_documents`, `enterprise_document_versions`, `enterprise_document_events` (إدارة وثائق مركزية بإصدارات غير قابلة للتعديل ودورة عقد).
- `060`–`062`: ربط حركات النقد وقيود دفتر الأستاذ ومعاملات HR بالفروع (أعمدة + إنشاء صناديق فروع).
- `064`: إضافة `company_id` للكيانات وربط الفروع الحالية بشركة افتراضية.
- `066`: تعبئة فروع المشاريع وفهرسة نطاقها وتسجيل projects/HR في الوحدات المحفوظة.

### `steps/inline-067.ts` — الترحيلات 067–073 (التصنيع الأساسي)
- **الجداول الجديدة (14 جدولاً):** `employee_leave_requests` (طلبات إجازات)؛ مجموعة `project_*`: `project_tasks`, `project_task_dependencies`, `project_time_entries`, `project_budget_lines`, `project_risks`, `project_change_requests`, `project_deliverables`؛ `employee_contracts`, `employee_documents`؛ التصنيع: `work_centers`, `bills_of_materials`, `bom_items`, `production_orders`, `production_order_materials`, `production_order_operations`.
- `072`: أعمدة `company_id` للجداول الأساسية + تعبئة من ملكية الفرع.
- `073`: ربط أوامر الإنتاج بالمستودعات لترحيل المخزون.

### `steps/inline-074.ts` — الترحيلات 074–086
- **الجداول الجديدة:** `manufacturing_quality_checks` (فحوصات جودة), `manufacturing_maintenance` (صيانة معدات), `held_orders` (طلبات POS معلّقة للاسترداد), `sales_invoice_payments` (مدفوعات متعددة الطرق لكل فاتورة), `promotion_usage`.
- `076`/`077`: إعدادات تنظيمية (سنة مالية/منطقة/لغة) وإعدادات رواتب لكل شركة — أعمدة على `companies`.
- `078`: تتبع قرار الجودة (scrap/rework/return/accept).
- `079`: حسابات تكلفة الخدمة لتقييد متوازن.
- `080`: أعمدة `uom`/`quantity` عامة بجانب `quantity_m2` مع مشغّلات تعبئة (إيقاف افتراض الأمتار المربعة).
- `081`/`082`: تعبئة `company_id` على كل جدول بنطاقي وإلزامه عند الإدراج؛ ربط قيود اليومية بالشركة المالكة.
- `084`/`086`: تثبيت طلبات POS المعلّقة في قاعدة البيانات؛ قواعد عروض أسعار (percent/amount/BOGO/bundle/coupon) بنطاق وتاريخ.

### `steps/inline-087.ts` — الترحيلات 087–098 (طبقة المزامنة)
- **الجداول الجديدة:** `sync_entity_versions`, `sync_conflicts` (تعارضات مراجعة), `sync_bootstrap_progress` (نشر أولي قابل للاستئناف), `sync_entity_policies` (سياسات مزامنة للأدمن), `sync_remote_records` + `sync_remote_records__tmp`, `sync_remote_purchase_records`/`sync_remote_purchase_entities`, `sync_remote_entities` + `sync_remote_entities__tmp` (لقطات بعيدة منفصلة عن الأرصدة المحلية), `activity_configuration_versions`.
- `087`/`095`/`096`: نطاق مستأجر/فرع لأحداث المزامنة؛ تحقق أجهزة الفروع ونشاطها وحداثة مزامنتها؛ نوع الجهاز وأكواد تفعيل أحادية.
- `097`/`098`: تجاوزات مصطلحات أعمال على مستوى المؤسسة + لقطات إصدارات تكوين أنشطة append-only.

### `steps/inline-099.ts` — الترحيلات 099–114 (مطاعم، إيداعات، 2FA، تسعير)
- **الجداول الجديدة:** `restaurant_tables`, `restaurant_menu_items`, `restaurant_orders`, `restaurant_order_items` (طاولات/قائمة/طلبات مطعم + تذاكر مطبخ وروابط إنتاج وصفات ومفاتيح idempotency للفواتير)، `order_deposits` (إيداعات الطلبات وروابط الإيصال/التسوية)، `user_2fa` (أسرار TOTP/HOTP وبيانات استرداد)، `product_form_field_preferences`, `product_tone_options` (تفضيلات نموذج المنتج ودرجات السيراميك المُدارة).
- `100`: ربط إغلاقات التسوية المالية بالفرع النشط.
- `101`–`103`: حساب التزام «إيداعات الطلبات»، فصل حالات التسليم/الفوترة/المالية للطلبات، نوع النشاط التجاري الافتراضي.
- `102_canonical_pricing_promotions`: ربط حقول العروض القديمة بحقول خدمة التسعير المستخدمة في POS.
- `103_legacy_fixed_asset_count_snapshot_columns`: تعبئة أعمدة حالة/موقع إلزامية في جداول جرد الأصول القديمة.
- `104_journal_entries_reference_unique`: uniqueness على `(reference_type, reference_id)` للقيود عندما تسمح البيانات.
- `113_table_first_invoice_default`: قالب فاتورة بسيط للمثبتات على القالب القديم.
- **ملاحظات:** أرقام الترحيلات مكررة عددياً (101/102/103 تظهر لكل تسلسل مختلف) — الفرز الأبجدي يحسم الترتيب.

### `steps/inline-115.ts` — الترحيلات 115–121, 170–172 (ذمم ومرتجعات وفترة فرعية)
- `115`: نطاق `supplier_claims` بالفرع المالك لمستندات المصدر.
- `116`: لقطات وحذف tombstones للمصروفات في مزامنة سجلات الأعمال.
- `117`–`121`: سلسلة تسوية مرتجعات المبيعات والضرائب وأرصدة الائتمان (شاملة VAT) وسير عمل تدقيق تاريخي — إعادة حساب الإشعارات التاريخية وضبطها بسجلات تدقيق.
- **الجداول الجديدة (170–172):** `finance_subledger_control_baselines`, `finance_subledger_control_baselines_company`, `finance_subledger_coverage`, `finance_subledger_events`, `finance_subledger_manual_reconciliations`, `finance_subledger_party_baselines`, `finance_subledger_party_baselines_company`, `fiscal_period_subledger_snapshots`, `sales_return_reconciliations`, `sales_return_reconciliation_reviews` (دفتر أستاذ فرعي على مستوى الشريك + خط أساس تاريخي + حراسة فترات مقفلة + مطابقة فواتير الشراء المرتجعة).

### `steps/inline-178.ts` — الترحيلات 178–189 (المخزون المتقدم)
- **الجداول الجديدة:** `warehouse_location_movements` (تدقيق كل تعيين/تحرير كمية في المواقع), `stock_transfer_operations`, `stock_transfer_batch_allocations`, `stock_transfer_receipts` (دفعات وتكلفة عبر مستودع العبور idempotent), `product_warehouse_planning` (تجاوزات إعادة الطلب لكل مستودع).
- `178`: حفظ مصدر GRN/فاتورة الشراء/الدفعة/المورد على طبقات FIFO.
- `179`: حفظ فروقات الكميات ونطاق مقارنة دفتر الأستاذ لتسويات المخزون.
- `181`: كميات/أسعار مخزون خاص مخفّضة قابلة للبيع ومصادر بنود فواتيرها.
- `182`: نوع المستودع كقيمة مقيّدة بدل الاستنتاج من الاسم.
- `183`: مراحل موافقة/ترحيل مستقلة لتسويات المخزون.
- `184`: تكلفة استلام الوحدة وتعديلات التكلفة المحمّلة على طبقات FIFO.
- `185`: تتبع الدفعات/الطبقات عبر العبور وجعل الصرف/الاستلام idempotent.
- `186`: مصدر وتصرّف المرتجعات + تدقيق نقل المواقع + عدّ على مستوى الصناديق.
- `187`: تخطيط إعادة الطلب لكل مستودع وسياسة «متتبَّع مخزونياً».
- `188`: `branch_id`/`company_id` لعروض الأسعار مع تعبئة من المستودع.
- `189`: بصمة الطلب الموحّد لإعادة محاولات مرتجعات المبيعات idempotent.

### `steps/inline-190.ts` — الترحيلات 190–197
- **الجداول الجديدة:** `approval_policies`, `approval_decisions` (سياسات موافقات ديناميكية قابلة للتهيئة وقراراتها), `order_deposit_refunds` + `order_deposit_refunds_partial` (استردادات إيداعات كاملة/جزئية بسجلات عكس فريدة).
- `190`: ربط كل بند مرتجع مبيعات ببند فاتورته الأصلي.
- `191`: إبقاء سجل استخدام العروض مع تسجيل عكس إلغاء الفواتير.
- `194`: فصل رسوم الفواتير الإضافية لحساب إيراد مستقل.
- `196`: قرارات سير عمل الموافقات.
- `197`: فرز/درجة دفعات المخزون.

---

## ملخص التغطية

- **~153 ملف `part*.ts`:** الأجزاء 01–160 (مع فجوات مقصودة: لا يوجد part75/78/86–99 كملفات — هذه الأرقام محجوزة/مغطاة عبر `steps/inline-*` أو غير مستخدمة).
- **9 ملفات `steps/inline-*.ts`:** ترحيلات مُضمّنة بأرقام 014–259.
- **12 ملف `enterprise*.ts`:** التنفيذ الموزّع للترحيل `049_finance_and_accounting_enterprise` (المالية المؤسسية).
- **ملفات مساعدة بلا ترحيلات:** `index.ts` (المنسّق)، `support.ts`/`settings.ts`/`support_part01..03.ts` (أنواع وثوابت وأدوات)، وملفات `part05_part*`, `part08_part01`, `part09_part01..02` (دوال حسابية للقيود)، وملفات barrel `part05.ts`/`part08.ts`/`part09.ts`/`enterprisePart01.ts`/`enterprisePart02.ts`.
- **الترحيلات في المجموع:** ~260 ترحيلاً رقمياً (001–259 مع تكرارات أبجدية للترتيب)، كلها تُطبَّق مرة واحدة وتُسجَّل في `schema_migrations`.

> ملاحظة توثيقية: بعض الملفات تعيد استخدام أرقام ترحيلات (مثل `101_`, `102_`, `103_`, `164_`, `171_`, `173_`, `195_`, `218_`) لتسلسلات منفصلة؛ هذا مقصود والفرز في `index.ts` يعتمد على `(الرقم، ثم النص)` فيبقى الترتيب حتمياً.

---

## ملحق: الجداول التي ينشئها `SCHEMA_SQL` مباشرة

خارج نطاق ملفات الترحيلات، ينشئ `src/database/schema.ts` (عبر `SCHEMA_SQL`) المخطط الأساسي (~550 جدولاً) دفعة واحدة — جداول أساسية مثل `users`, `branches`, `products`, `customers`, `suppliers`, `sales_invoices`, `purchase_invoices`, `orders`, `quotations`, `employees`, `warehouses`, `system_settings`, وجداول `platform_*` الأساسية، وغيرها. الترحيلات أعلاه تضيف الجداول المتخصصة والتعديلات التاريخية فوق هذا الأساس.

---

*آخر تحديث: توثيق شامل مبني على قراءة الملفات الفعلية في `src/database/migrations/`.*
