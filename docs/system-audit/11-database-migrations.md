# 11 — ترحيلات قاعدة البيانات

> **القاعدة:** 133 ترحيلاً مطبّقاً في الإنتاج (حتى `131_partner_capital_and_ownership_history`).
> **الملفات:** `src/database/migrations*.ts` (25 ملفاً) + `src/database/db.ts` + `src/database/migrations.ts`.
> **القاعدة الذهبية:** لا تغيير destructif على قاعدة إنتاج؛ انسخ أولاً واختبر الترحيل على نسخة.

---

## 1. كيف يُطبَّق الترحيل

1. عند بدء التطبيق، `runMigrations(db)` (في `migrations.ts`) تُنفَّذ قبل أي خدمة.
2. **`createSchemaTables`**: إنشاء الجداول الناقصة (بدون فهارس) داخل معاملة.
3. **`applyPendingMigrations`**: تطبيق الترحيلات غير المطبّقة (التي لا توجد في `schema_migrations`) **بالترتيب**، كل ترحيل داخل معاملة `BEGIN/COMMIT` مع `ROLLBACK` عند الفشل.
4. **`createSchemaIndexes`**: إعادة تشغيل المخطط (مع الفهارس) بعد نجاح كل الترحيلات.
5. **FK enforcement**: يُفعَّل قبل الترحيلات ويعاد بعد كل ترحيل (`setForeignKeysEnabled`).
6. **تأخر/فشل:** إذا فشل ترحيل، يتوقف التطبيق عن تطبيق اللاحقين، ويُحفظ النسخة (preserve corrupt)، ويُعاد المحاولة при الإطلاق التالي.
7. **نسخة احتياطية قبل ترحيلات حساسة:** `backupBeforeGrossProfitMigration` ينسخ قبل `045_reconcile_invoice_gross_profit` (وأي ترحيل يُسجّل كحساس).

---

## 2. خصائص كتالوج الترحيلات

- **التحقق عند التحميل:** `validateMigrationCatalog()` يمنع:
  - IDs فارغة/مكررة.
  - ترتيب غير تصاعدي (بحسب البادئة الرقمية).
- **Idempotent:** كل ترحيل يُسجَّل في `schema_migrations`؛ إعادة التشغيل لا يُعيد تطبيقه.
- **Idempotency في القيود:** `postLedgerEntry` يمنع تكرار قيد لنفس `(reference_type, reference_id)`.
- **Idempotency في الدفعات:** `supplier_payment_idempotency`, `customer_payment_idempotency`, `return_idempotency_keys`, `sales_return_customer_credits`.
- **FK/Indexes:** 266 فهرساً، 53 محفّزاً تُنشأ بعد الترحيلات.

---

## 3. قائمة الترحيلات (ملخص حسب الأعداد)

<|start|> النطاق | الملفات | الوصف |
|---|---|---|
| `001`–`010` | `part01.ts` | الفروع، خط المبيعات، الأدوار، الإعدادات، price lists |
| `011`–`020` | `part02.ts`–`part05.ts` | خطوط المبيعات، صلاحيات المستخدم، الأصناف والوحدات، التصنيفات، tone |
| `021`–`040` | `part06.ts`–`part12.ts` | الموردون، الأصول، دفتر الأستاذ الموحّد، FIFO، backfill |
| `041`–`060` | `part13.ts`–`part16.ts` | المخزون والمستودعات، الفرع/الشركة، التدفقات (HR، 프로젝트) |
| `061`–`080` | `part17.ts`–`part18.ts` | التصنيع، الشركة، HR (عقود/مستندات)، الجودة |
| `081`–`100` | `part19.ts`–`part20.ts` | company scope، journal scope، sync، activity config، المطاعم |
| `101`–`120` | `part20.ts`–`part21.ts` | 2FA، canonical pricing، journal unique، sync business records، مرتجعات البيع/الضريبة |
| `121`–`131` | `part21.ts` + `enterprise*.ts` | partner accounts، inventory reconciliation، financial calendar، fixed asset lifecycle، warranty claims، partner capital/ownership |
| enterprise | `enterprise.ts`/`Part01–03` | وحدات enterprise إضافية |

> القائمة الكاملة مطبوعة عند الإطلاق (133 معرفاً). `schema_migrations` في الإنتاج يحتوي 133 صفاً.

---

## 4. الترحيلات الحساسة (أمثلة)

| الترحيل | لماذا حساس | الضابط |
|---|---|---|
| `045_reconcile_invoice_gross_profit` | يُعيد حساب إجمالي فواتير البيع | نسخة احتياطية trước (`backupBeforeGrossProfitMigration`) |
| `024_unified_accounting_ledger` | يوحّد قيود الأستاذ | backfill + فحص توازن |
| `041_backfill_legacy_fifo_returns` | يُعيد بناء طبقات FIFO للمرتجعات | transaction + فحص سلامة |
| `042_reconcile_chart_account_balances` | يُعيد حساب أرصدة الحسابات | مراجعة مالية |
| `122_partner_accounts`, `130`, `131` | يُضيف جداول شركاء ورأس مال | إضافة صرفة (additive) |

---

## 5. قواعد إضافة ترحيل جديد (إلزامية)

1. **لا حذف/إعادة تسمية** أعمدة أو جداول في الإنتاج دون ترحيل backward-compatible.
2. **أضف ترحيلاً جديداً** (لا تُعدّل ترحيلاً قديماً) — IDs تصاعدياً (الليالي: `132_...`).
3. **كل ترحيل في معاملة** (`BEGIN/COMMIT`) مع `ROLLBACK` عند الخطأ.
4. **FK handling:** عطّل FKs (`PRAGMA foreign_keys = OFF`) فقط إذا لزم، وأعد تفعيلها в finally.
5. **البيانات:** استخدم `INSERT ... SELECT` أو `UPDATE` idempotent (لا تُكرّر عند إعادة التشغيل).
6. **النسخ:** إذا كان الترحيل يُعدّل بيانات (وليس إضافة صرفة)، أضف نسخة احتياطية في `db.ts` قبل التطبيق.
7. **التحقق:** شغّل `npm test` (الذي يُنشئ قاعدة من الصفر ويطبّق 133 ترحيلاً) + اختبار على نسخة إنتاج.
8. **التوثيق:** حدّث هذا الملف + `07-implementation-log.md`.
9. **validateMigrationCatalog** يجب أن يمر (لا IDs مكررة/غير مرتبة).

---

## 6. التحقق (إعادة إنتاج)

```bash
# 1) قاعدة جديدة: migrations تُطبّق من الصفر
npm test   # كل اختبار ينشئ قاعدة جديدة ويُطبّق 133 ترحيلاً

# 2) على نسخة إنتاج (للقراءة/الاختبار فقط)
node scripts/db-audit.cjs "$env:TEMP\opencode\ceramisys-audit-plain.sqlite"

# 3) فحص ترحيل على نسخة (بدون لمس الإنتاج)
#    - انسخ ceramisys.sqlite
#    - فك التشفير (db-decrypt-audit.cjs)
#    - شغّل runMigrations على نسخة في اختبار مخصص
```

---

## 7. ملاحظات

- لا توجد ترحيلات **مضافة** في هذه الجلسة؛ التغييرات كانت في الكود (TypeScript/تواريخ) ولا تؤثر على المخطط.
- `schema_migrations` في الإنتاج = 133 صفاً، مطابق لـ `MIGRATIONS.length`.
- أي تغيير في `schema.ts` (SCHEMA_SQL) يجب أن يمر عبر `createSchemaTables`/`createSchemaIndexes` وليس بتعديل ترحيل قديم.
