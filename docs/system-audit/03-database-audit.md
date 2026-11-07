# 03 — تدقيق قاعدة البيانات

> **القاعدة المفحوصة:** نسخة مفكوكة التشفير من قاعدة الإنتاج
> `%APPDATA%\CeramiSysERP\data\ceramisys.sqlite`
> **أدوات الفحص:** `scripts/db-audit.cjs` (قراءة فقط) + استعلامات مباشرة على نسخة `ceramisys-audit-plain.sqlite`.
> **تاريخ الفحص:** 2026-11-07.

---

## 1. بيانات الحجم والبنية

| المؤشر | القيمة |
|---|---|
| حجم الملف | 5,357,568 بايت (~5.1 MB) |
| `PRAGMA integrity_check` | `ok` |
| `PRAGMA foreign_key_check` | 0 مخالفة |
| عدد الجداول | 224 |
| عدد الأعمدة | 2,533 |
| عدد الفهارس | 266 |
| عدد المحفزات (Triggers) | 53 |
| Views | 0 |
| الترحيلات المطبّقة | 133 |
| إجمالي الصفوف | 11,722 |
| حجم الصفحة | 4,096 |
| `user_version` | 0 (الاعتماد على جدول `schema_migrations`) |

---

## 2. أبرز الجداول من حيث عدد الصفوف

| الجدول | الصفوف | الدلالة |
|---|---|---|
| `role_permissions` | 7,009 | ربط الأدوار بالصلاحيات |
| `permissions` | 4,313 | كتالوج الصلاحيات المولّد (3,892 واجهة + 421 غير واجهة) |
| `system_settings` | 143 | إعدادات النظام |
| `schema_migrations` | 133 | سجل الترحيلات |
| `chart_of_accounts` | 35 | دليل الحسابات الافتراضي |
| `fiscal_periods` | 12 | الفترات المالية |
| `login_history` | 7 | سجل الدخول |
| `roles` | 6 | الأدوار المدمجة |
| `user_sessions` | 6 | جلسات |
| `currencies` | 5 | العملات |
| `expense_categories` | 5 | تصنيفات المصروفات |

---

## 3. حالة بيانات الأعمال في نسخة الإنتاج

| الكيان | العدد |
|---|---|
| المستخدمون | 1 (admin) |
| العملاء | 1 (عميل نقدي/افتراضي) |
| الموردون | 0 |
| المنتجات | 0 |
| فواتير البيع | 0 |
| فواتير الشراء | 0 |
| القيود اليومية | 0 |
| الخزائن | 1 |
| المستودعات | 2 |
| سجلات التدقيق | 3 |

**الاستنتاج:** النسخة قريبة من تثبيت جديد. سلامة البنية ممتازة، لكن **لا يمكن** استخدامها لإثبات صحة تدفقات مالية حقيقية. التحقق الوظيفي يعتمد على 460 اختباراً.

---

## 4. فحوصات السلامة المالية (15 فحصاً)

جميعها ناجحة (`0` مخالفة):

| الفحص | النتيجة |
|---|---|
| قيود يومية غير متوازنة (مدين ≠ دائن) | ✅ 0 |
| مجموع سطور القيد لا يطابق رأس القيد | ✅ 0 |
| فواتير بيع بدون بنود | ✅ 0 |
| فواتير شراء بدون بنود | ✅ 0 |
| رصيد العميل لا يطابق مستنداته (فرق > 0.01) | ✅ 0 |
| رصيد المورد لا يطابق مستنداته | ✅ 0 |
| إجمالي الخزائن ≠ حساب النقدية `1101` | ✅ 0 |
| أرصدة مخزون سالبة | ✅ 0 |
| أرصدة مخزون بدون مستودع صالح | ✅ 0 |
| مجموع بنود فاتورة بيع ≠ إجماليها | ✅ 0 |
| مجموع بنود فاتورة شراء ≠ إجماليها | ✅ 0 |
| أرقام فواتير بيع مكررة | ✅ 0 |
| أرقام فواتير شراء مكررة | ✅ 0 |
| سطور قيود يتيمة | ✅ 0 |
| حركات/أرصدة مخزون لأصناف غير موجودة | ✅ 0 |

---

## 5. مجالات الجداول (تصنيف وظيفي)

| المجال | أمثلة جداول |
|---|---|
| الهوية والصلاحيات | `users`, `roles`, `permissions`, `role_permissions`, `user_permissions`, `user_sessions`, `login_history`, `two_factor_*` |
| الشركات والفروع | `companies`, `branches`, `branch_warehouses`, `branch_devices` |
| المنتجات | `products`, `categories`, `brands`, `attributes`, `product_tones`, `product_units`, `price_lists`, `promotions` |
| المخزون | `warehouses`, `warehouse_stock`, `inventory_transactions`, `inventory_cost_layers`, `product_batches`, `stock_reservations`, `inventory_counts`, `stock_transfers` |
| المبيعات | `sales_invoices`, `sales_invoice_items`, `sales_invoice_payments`, `sales_returns`, `sales_return_items`, `customer_payments`, `customer_payment_allocations`, `orders`, `quotations`, `held_orders` |
| المشتريات | `purchase_invoices`, `purchase_invoice_items`, `purchase_orders`, `purchase_requests`, `goods_receipts`, `purchase_returns`, `supplier_payments`, `supplier_claims` |
| المحاسبة | `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `fiscal_periods`, `fiscal_closures`, `bank_accounts`, `cheques`, `budgets`, `cost_centers`, `fixed_assets` |
| العملاء والموردون | `customers`, `suppliers`, `customer_supply_requests`, `customer_warranty_claims` |
| الشركاء | `partner_transactions`, `partner_capital_history`, `partner_profit_batches`, `partner_attachments` |
| الموارد البشرية | `employees`, `attendance`, `payroll`, `leave_requests`, `employee_contracts`, `employee_documents`, `recruitment_*` |
| التصنيع | `boms`, `production_orders`, `production_materials`, `production_operations`, `quality_checks`, `maintenance_orders` |
| المشاريع | `projects`, `project_tasks`, `project_budgets`, `project_risks`, `project_change_requests`, `project_time_entries` |
| النظام | `system_settings`, `audit_logs`, `domain_events`, `backup_history`, `schema_migrations`, `module_registry`, `configuration_versions`, `sync_*` |

---

## 6. القيود والمحفزات

- **53 محفزاً** تغطي أساساً: تحديث المخزون، تحديث أرصدة العملاء/الموردين، منع الحذف غير الآمن، وتحديث الطوابع الزمنية.
- **266 فهرساً** تشمل فهارس مركبة على `branch_id`, `company_id`, `date`, `customer_id`, `supplier_id`, `product_id`, `invoice_status`.
- **المفاتيح الأجنبية:** مُفعّلة ومُتحقَّق منها (`foreign_key_check` نظيف).
- **لا توجد Views** — كل القراءات عبر استعلامات الخدمات.

---

## 7. التشفير والحفظ

- ملف القاعدة ليس SQLite خاماً؛ يبدأ بترويسة `CERAMISYS-DB\0v1\0` ثم AES-256-GCM.
- المفتاح يُنشأ عشوائياً (32 بايت) ويُخزَّن مشفّراً عبر `safeStorage` في `database-key.enc`.
- يوجد مسار استرداد: مفتاح استرداد مشفّر بـ scrypt (N=2¹⁵, r=8, p=1) + AES-256-GCM.
- الحفظ يتم بكتابة الملف كاملاً (SQL.js) مع نسخة احتياطية قبل الاستبدال، والتحقق من `PRAGMA integrity_check` بعد الاستيراد.

---

## 8. المخاطر والملاحظات

| # | الملاحظة | الخطورة | التوصية |
|---|---|---|---|
| DB-1 | SQL.js يحمّل القاعدة كاملة في الذاكرة ويكتب الملف كاملاً عند الحفظ | متوسطة | مراقبة حجم القاعدة؛ عند تجاوز ~200MB يُنصح بالانتقال إلى SQLite أصلي (better-sqlite3) |
| DB-2 | لا توجد Views ولا طبقة قراءة موحّدة للتقارير | منخفضة | توحيد استعلامات التقارير في خدمات القراءة |
| DB-3 | `user_version = 0` والاعتماد على `schema_migrations` | منخفضة | توثيق ذلك في فحص الإصدار |
| DB-4 | نسخة الإنتاج خالية من بيانات الأعمال | عالية للتحقق | تنفيذ جولة قبول على قاعدة تجريبية ممتلئة قبل الإنتاج |
| DB-5 | الاعتماد على حفظ كامل الملف يزيد زمن الكتابة مع النمو | متوسطة | قياس دوري عبر `performanceMonitor` |

---

## 9. إعادة إنتاج الفحص

```powershell
# 1) نسخ القاعدة المشفرة
Copy-Item "$env:APPDATA\CeramiSysERP\data\ceramisys.sqlite" "$env:TEMP\opencode\ceramisys-audit.sqlite"

# 2) فك التشفير (يتطلب Electron)
npx electron scripts/db-decrypt-audit.cjs "$env:TEMP\opencode\ceramisys-audit.sqlite" "$env:TEMP\opencode\ceramisys-audit-plain.sqlite"

# 3) الفحص للقراءة فقط
node scripts/db-audit.cjs "$env:TEMP\opencode\ceramisys-audit-plain.sqlite"
```

> الأدوات لا تكتب في قاعدة الإنتاج؛ تقرأ نسخة فقط.
