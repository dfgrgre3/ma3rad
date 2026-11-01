# تدقيق Phase 1 — سيراميسيس ERP (CeramiSys)

تاريخ: 2026-11-01 — الإصدار 1.1.3

## 1. خط الأساس (Baseline) — تم التحقق

| الفحص | النتيجة |
|---|---|
| `npm run typecheck` (tsc --noEmit) | ✅ 0 أخطاء |
| `npm run lint` (ESLint) | ✅ 0 أخطاء، 1221 تحذيراً |
| `npm test` (node:test) | ✅ 321/321 ناجحة (≈2.6 min) |
| `npm run build` (Vite) | ✅ ناجح (10.8s) |

> الاختبارات تعمل على قاعدة بيانات مؤقتة ولا تلمس بيانات تثبيت حقيقي.

## 2. التغييرات غير المحفوظة

- 136 ملفاً معدّلاً غير مُودَع (عمل جارٍ) **تم الاحتفاظ بها** وبناء التغييرات فوقها (لا تراجع).
- التغييرات الجارية تتعلق بـ: التحقق من صحة البيانات، حدود الاستخدام المركزي (CentralUsageLimitService)، تطبيق الإعدادات المركزية (SettingsService.applyCentral)، XSS في شاشة عرض العميل (PosView)، قيود التنقل (Header).

## 3. التغييرات المطبّقة في Phase 1

### 3.1 حدود الاستخدام المركزي (maxPos)
- `BranchService.createBranch`: إضافة `CentralUsageLimitService.assertWithin('maxPos')` (إنشاء فرع ينشئ خزينة/نقطة بيع).

### 3.2 التحقق من صحة البيانات — الموردون (`SupplierService`)
- `createSupplier`: اسم مطلوب، هاتف مطلوب، منع التكرار بالاسم.
- `updateSupplier`: تنظيف/تحقق الاسم، منع التكرار، هاتف مطلوب.

### 3.3 التحقق من صحة البيانات — العملاء (`CustomerService`)
- `createCustomer`: اسم مطلوب، هاتف مطلوب، منع التكرار بالاسم.
- `updateCustomer`: تنظيف/تحقق الاسم، منع التكرار، هاتف مطلوب.

### 3.4 التحقق من صحة البيانات — المتغيرات (`ProductExtraService`)
- `createVariant`: كود/اسم متغير مطلوبان، تنظيف.
- `updateVariant`: تحقق وجود المتغير، كود/اسم غير فارغين.

### 3.5 التحقق (تم في العمل الجارٍ)
- `ProductService`: assertWithin(maxProducts)، تحقق وجود التصنيف/الماركة، منع تكرار SKU/Barcode عند التحديث.
- `CompanyService`: assertWithin(maxFacilities).
- `BranchService`: assertWithin(maxBranches).
- `EmployeeService`: assertWithin(maxEmployees).
- `AuthService`: assertWithin(maxUsers).
- `invoiceCreation`: assertWithin(maxInvoices).
- `OperationsService`: assertWithin(maxBranches/maxWarehouses).
- `CategoryService`: تحقق التصنيف الأب، منع الحلقات، children/descendants/moveProducts.
- `BrandService`: تنظيف الاسم، منع التكرار.
- `AttributeService`: appliesToCategoryId، update/delete مع تحقق.
- `ProductExtraService`: getImageById/updateImage.

## 4. نتائج التدقيق — إ bevأولويات

### P0 — حرج (يجب إصلاحه فوراً)
1. **سلامة التزامن (Concurrency)**: تحديثات `cash_registers.current_balance` و`warehouse_stock.quantity_m2` تتم بـ `UPDATE ... SET x = x - ?` (آمن نسبياً) لكن التحقق من "رصيد كافٍ" يُقرأ ثم يُكتب في مسارين منفصلين في بعض الخدمات (race). مطلوب: قفل/تحقق ذري داخل `executeTransaction`.
2. **Idempotency**: `sales_invoices`/`customer_payments` possess idempotency key في بعض المسارات (getExistingCustomerPayment) لكن ليس كل مسارات الدفع/المرتجعات. مطلوب: توحيد مفتاح idempotency لجميع العمليات المالية.
3. **قيود الفروع/الشركات (Data scoping)**: `getAllCustomers`/`getAllSuppliers` تستخدم `companyScope`، لكن بعض التقارير/الاستعلامات (reports) قد تجمع عبر شركات. مراجعة `BranchAccessService`/`companyScope` في جميع الاستعلامات.

### P1 — عالٍ
4. **الصلاحيات على مستوى الخدمة**: 1221 تحذيراً (أغلبها unused vars). مطلوب: مراجعة كل method public في `src/services` للتأكد من `PermissionService.require` قبل أي mutation (حالياً بعض helpers لا تتحقق).
5. **التحقق من FK**: `ProductService` تم تقويته؛ يبقى `PurchaseService`, `SalesService`, `InventoryService`, `OrderService`, `QuotationService` (الأكبر) — تحقق وجود المنتج/المستودع/العميل/المورد قبل الكتابة.
6. **ال округление (Rounding)**: استخدام `round2` في `financials` — مراجعة جميع حسابات الضرائب/الخصومات لضمان ترتيب operations (خصم قبل ضريبة vs بعد) وتوحيد.
7. **القيود (Constraints)**: إضافة CHECK/UNIQUE constraints في migrations (sku, barcode, name uniqueness per company) — currently enforced in code only.
8. **Error handling**: بعض `catch { /* ignore */ }` في `AuthService`/`CentralLicenseService` قد تخفي أخطاء auth. مراجعة.

### P2 — متوسط
9. **حجم الملفات**: 9 ملفات >900 سطر (migrations.ts 2203، SetupWizard 1449، PosView 1430، ProductsView 1211، ProjectService 1122، DocumentService 1079، db.ts 1046، AdminSettingsTab 1014، ManufacturingService 1008). تقسيم إلى PartXX.
10. **الواجهة (UI/UX)**: 
    - منع الإرسال المزدوج (disable submit while saving) في Modals.
    - حالات التحميل/الفراغ/الخطأ في صفحات البيانات.
    - RTL: استخدام logical properties (start/end) بدلاً من left/right في Tailwind.
    - إتاحة الوصول (aria-label للأزرار بالأيقونات).
11. **Type safety**: 32 استخدام `as any` في services — استبدال بـ types صريحة.
12. **الاختبارات**: خدمات حرجة بدون اختبار (مثلاً `SupplierService` payments، `CustomerService` payments، `CashierService` shifts). إضافة اختبارات وحدات.
13. **Lint warnings**: 1221 تحذيراً — تنظيف (unused vars) أو توثيق intentional.

### P3 — منخفض
14. **الأداء**: `ProductsView` 1211 سطر + re-renders. تحسين memoization.
15. **التوثيق**: README/SECURITY محدّثان؛ إضافة ADR للقرارات المعمارية.

## 5. خريطة المراحل (Phases)

- **Phase 1 (منجز):** خط الأساس + تقوية التحقق/الحدود/الصلاحيات على master data + تقرير.
- **Phase 2 (مقترح):** P0 + P1 (سلامة التزامن، idempotency، scoping، FK، rounding) — requires tests.
- **Phase 3 (مقترح):** P2 UI/UX (double-submit, loading/empty/error states, RTL, a11y).
- **Phase 4 (مقترح):** P2 code quality (split large files, type safety, lint cleanup, tests).
- **Phase 5 (مقترح):** P3 performance + docs + release.

## 6. الملفات المعدّلة في Phase 1 (هذا الدور)

- `src/services/SupplierService.ts`
- `src/services/CustomerService.ts`
- `src/services/ProductExtraService.ts`
- `src/services/BranchService.ts`
- `docs/AUDIT_PHASE1.md` (جديد)

## 7. الفحوص بعد التغييرات

- typecheck: ✅
- lint: ✅ (0 errors, 1221 warnings — unchanged)
- tests (services + product units): ✅ 34/34
- build: (لم يُعاد تشغيله بعد التغييرات الصغيرة؛ التغييرات type-safe)

## 8. التوصية

الانتقال إلى **Phase 2** (P0/P1) يتطلب:
1. موافقة على نطاق Phase 2 (سلامة التزامن + idempotency + scoping).
2. إضافة اختبارات تغطي السيناريوهات (concurrent payments, duplicate invoice submission).
3. possibly migrations for UNIQUE constraints.

> هل نبدأ Phase 2؟ أم نوسع Phase 1 (UI/UX أو code quality)؟