# تدقيق Phase 2 — P0/P1 (سلامة التزامن + Idempotency + Scoping + FK + округление)

تاريخ: 2026-11-01

## 1. التغييرات المطبّقة

### PurchaseService (`src/services/PurchaseService.ts`)
- `createPurchase`: تحقق وجود المخزن (throw 'المخزن المحدد غير موجود.') بدلاً من companyId null صامت.
- `createPurchase`: تحقق حالة المورد (is_active) — منع فاتورة توريد لمورد معطل.

### SalesService (verified, no change)
- `createSalesInvoice`: تحقق وجود المنتج/نشاطه (buildPreparedItem)، تحقق العميل (validateDiscountAndCredit)، تحقق المخزن (resolveCashRegister → requireWarehouseAccess)، تحقق الرصيد (assertAvailableStock)، تحقق الخصم/الائتمان.
- `voidSalesInvoice`, `returnSale`, `recordInvoicePayment`, `deleteInvoicePayment`: كلها داخل `executeTransaction` مع تحقق صلاحيات ونطاق فرع.

## 2. التحقق (Verification)

### 2.1 سلامة التزامن (Concurrency / Atomicity)
- **SQLite write locking**: قاعدة البيانات `sql.js` تُستخدم في عملية واحدة (Electron main). كتابات متعددة تُسلسل عبر قفل قاعدة البيانات. جميع المسارات المالية (بيع، شراء، دفع، مرتجع، إلغاء) مغلفة بـ `executeTransaction`.
- **التحقق من الرصيد قبل الخصم**: `assertAvailableStock` (invoiceCreation) و `getAvailableStockM2` يحسبان `quantity - reserved`، مع `plannedByProduct` لتتبع الكمية المخططة داخل نفس الفاتورة.
- **cash_registers.current_balance**: تحديثات `x = x + ?` / `x = x - ?` ذرّية (لا read-then-write manual في المسارات المفحوصة). `recordInvoicePayment`، `deleteInvoicePayment`، `voidSalesInvoice` تستخدم هذه الصيغة.
- **النتيجة**: لا race condition على مستوى DB في تطبيق desktop أحادي العملية. المخاطر المتبقية: reentrancy (double-submit) — مُعالجة في UI (disabled={saving}) و idempotency keys.

### 2.2 Idempotency
- `CustomerService`: `getExistingCustomerPayment` (idempotency key + تحقق اختلاف الطلب).
- `SupplierService`: `recordPayment` (idempotency key، migration 056).
- `SalesService.recordCustomerPaymentAllocations`: يقبل `idempotencyKey`.
- **النتيجة**: idempotency مُطبّق على دفعات العملاء/الموردين. فواتير البيع/الشراء تستخدم `nextNumber` (تسلسل) — لا Not-idempotent-key، لكن double-submit مُعالَج في UI.

### 2.3 Scoping (فروع/شركات)
- `BranchAccessService`: `sqlScope`, `companyScope`, `requireWarehouseAccess`, `requireRegisterAccess`, `requireShiftAccess`, `requireBranchAccess`.
- جميع services (Sales, Purchase, Customer, Supplier, Cashier, Inventory) تستخدم scoping في reads/mutations.
- `fetchPurchases`/`readPurchaseById`/`fetchReturns` تستخدم scope.clause + companyScope.clause.
- **النتيجة**: scoping مُطبّق بانتظام. مراجعة تقارير (reports/*) أظهرت استخدام `BranchAccessService` في الغالب. **توصية**: مراجعة `src/pages/reports/*` و `src/services/*Report*` للتأكد من scoping (Phase 3).

### 2.4 تحقق FK (Foreign Keys)
- `ProductService`: تحقق category/brand existence + uniqueness SKU/barcode (Phase 1).
- `PurchaseService`: تحقق supplier existence + active، warehouse existence، product existence (preparePurchaseItems)، branch/company.
- `SalesService`: تحقق product existence/active، customer existence، warehouse access، stock availability.
- `CustomerService`/`SupplierService`: تحقق uniqueness name (Phase 1).
- `CategoryService`: تحقق parent existence + cycle prevention (Phase 1).
- **النتيجة**: FK validation مُطبّق في المسارات الحرجة. **توصية**: إضافة UNIQUE/CHECK constraints في migrations (Phase 4).

### 2.5 округление (Rounding)
- `financials.ts`: `toMinorUnits`/`fromMinorUnits`/`round2` (integer minor units).
- `computeSaleLine`, `computeSaleTotals`, `computeReturnImpact`, `computeWeightedAverageCost` تستخدم minor units.
- `PurchaseService`/`SalesService` gebruiken `round2` للإجماليات/الضرائب/الخصومات.
- **النتيجة**: округление موحد. **توصية**: مراجعة `PromotionService`/`PricingService`/`CommissionService` (Phase 3).

## 3. الفحوص

- typecheck ✅ · lint ✅ (0 errors) · build ✅
- tests: 321/321 ✅

## 4. التوصية (Phase 3)

- مراجعة reports scoping (src/pages/reports/*, src/services/*Report*).
- округление в Promotion/Pricing/Commission.
- إضافة UNIQUE/CHECK constraints (migrations).
- تقسيم الملفات الكبيرة (>900 سطر).
- UI/UX: empty/error states, RTL logical properties, a11y.
- type safety: استبدال 32 `as any`.

## 5. الملفات المعدّلة (Phase 2)

- `src/services/PurchaseService.ts` (warehouse existence + supplier active)
- `docs/AUDIT_PHASE2.md` (جديد)