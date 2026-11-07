# 02 — تدقيق الوظائف الحالية

> **الطريقة:** جرد المسارات الفعلية من `src/router/routesList.tsx`، مطابقة كل مسار بصفحته وخدمته، ثم التحقق من وجود تغطية اختبارية ومنع الصلاحيات. لم يُعتمد على وجود الملف فقط؛ تم تتبع استدعاءات الخدمة داخل الصفحة.

---

## 1. مؤشرات عامة

| المؤشر | القيمة |
|---|---|
| المسارات المسجّلة | 149 مساراً (منها تحويلات `Navigate`) |
| صفحات/مكوّنات تحت `src/pages` | 223 ملف TSX |
| الخدمات | ~130 ملف خدمة/جزء |
| جداول القاعدة | 224 جدولاً |
| الصلاحيات المولّدة | 4,313 كوداً (3,892 واجهة + 421 غير واجهة) |
| اختبارات | 460 اختباراً في 84 ملفاً — كلها ناجحة |

---

## 2. المبيعات ونقطة البيع

| المسار | الصفحة | الحالة | ملاحظات |
|---|---|---|---|
| `/dashboard` | `DashboardView` | ✅ مكتمل | لوحة تنفيذية + مؤشرات حسب الصلاحية |
| `/pos` | `PosView` | ✅ مكتمل | بيع سريع، دفع مختلط، خصومات، عروض |
| `/sales` | `SalesHubPage` | ✅ مكتمل | مركز المبيعات |
| `/sales/cycle` | `InvoiceCyclePage` | ✅ مكتمل | دورة الفاتورة |
| `/sales/statement` | `CustomerStatementPage` | ✅ مكتمل | كشف حساب عميل + واتساب |
| `/sales/orders-deposits` | `SalesOrdersDepositsPage` | ✅ مكتمل | عربون/طلبات |
| `/sales/after-sales` | `AfterSalesPage` | ✅ مكتمل | ما بعد البيع/ضمان |
| `/sales/analytics` | `SalesAnalyticsPage` | ✅ مكتمل | تحليلات |
| `/quotations` | `QuotationsPage` | ✅ مكتمل | عروض أسعار ومتابعة |
| `/orders` | `OrdersPage` | ✅ مكتمل | طلبات وتحويل إلى فاتورة |
| `/returns` | `ReturnsPage` | ✅ مكتمل | مرتجعات بيع برصيد/نقدي/بنكي |
| `/daily/sales` | `TodaySalesPage` | ✅ مكتمل | مبيعات اليوم |
| `/restaurant` | `RestaurantPage` | ✅ مكتمل | طاولات/مطبخ (وحدة مستقلة) |

**التغطية الاختبارية:** `sales.test.ts`, `services-business-sales.test.ts`, `sales-authorization.test.ts`, `sale-units.test.ts`, `promotion-pos.test.ts`, `sales-reports.test.ts`.

---

## 3. المشتريات والتوريد

| المسار | الصفحة | الحالة |
|---|---|---|
| `/purchases` | `PurchasesView` | ✅ فواتير شراء + تكاليف وصول (Landed Cost) |
| `/purchases/requests` | `PurchaseRequestsPage` | ✅ طلبات شراء |
| `/purchases/quotations` | `SupplierQuotationsPage` | ✅ عروض موردين |
| `/purchases/orders` | `PurchaseOrdersPage` | ✅ أوامر شراء |
| `/purchases/receipts` | `GoodsReceiptsPage` | ✅ استلام بضاعة |
| `/purchases/incoming` | `IncomingProductsPage` | ✅ بضاعة واردة |
| `/purchases/returns` | `PurchaseReturnsPage` | ✅ مرتجعات شراء |
| `/purchases/claims` | `SupplierClaimsPage` | ✅ مطالبات موردين |
| `/purchases/statement` | `SupplierStatementPage` | ✅ كشف مورد |
| `/suppliers` | `SuppliersView` | ✅ ملفات الموردين |

**التغطية:** `purchasing-lifecycle.test.ts`, `purchasing-authorization.test.ts`, `purchases-without-inventory.test.ts`.

---

## 4. المخزون والمستودعات

| المسار | الحالة |
|---|---|
| `/inventory` و`/inventory/hub` | ✅ مركز المخزون |
| `/inventory/warehouse-stock` | ✅ مخزون المستودعات |
| `/inventory/showroom-stock` | ✅ مخزون المعرض |
| `/inventory/ledger` | ✅ سجل حركة المخزون |
| `/inventory/transfers` | ✅ تحويلات بين المواقع |
| `/inventory/counts` | ✅ جرد المخزون |
| `/inventory/valuation` | ✅ تقييم المخزون (FIFO) |
| `/inventory/adjustments` | ✅ تسويات المخزون |
| `/inventory/stock-reservations` | ✅ حجوزات المخزون |
| `/inventory/reorder-planning` | ✅ إعادة الطلب |
| `/inventory/locations` | ✅ مواقع التخزين |
| `/inventory/damage-quarantine` | ✅ التالف والحجر |
| `/inventory/reconciliation` | ✅ مطابقة المخزون |

**التغطية:** `inventory-professional-lifecycle.test.ts`, `inventory-module-guard.test.ts`, `inventory-valuation` داخل `services.test.ts`.

---

## 5. المالية والمحاسبة

| المسار | الحالة |
|---|---|
| `/cashboxes` | ✅ الخزائن والورديات |
| `/finance` | ✅ نظرة عامة مالية |
| `/finance/calendar` | ✅ التقويم المالي |
| `/finance/receivables` + `/debts` + `/other-receivables` + `/installments` | ✅ المديونيات والتقسيط |
| `/finance/expenses` | ✅ المصروفات |
| `/finance/accounts` | ✅ دليل الحسابات |
| `/finance/journal` | ✅ القيود اليومية |
| `/finance/cheques` | ✅ الشيكات |
| `/finance/fiscal-closing` | ✅ الإقفال المالي |
| `/finance/bank-reconciliation` | ✅ مطابقة البنك |
| `/finance/budgets-cost-centers` | ✅ الموازنات ومراكز التكلفة |
| `/finance/cash-forecast` | ✅ التدفق النقدي المتوقع |
| `/finance/epayment-settlements` | ✅ تسويات الدفع الإلكتروني |
| `/finance/assets` | ✅ الأصول الثابتة |

**التغطية:** `finance-enterprise-lifecycle.test.ts`, `financials.test.ts`, `financial-statements-ui.test.ts`, `receivables.test.ts`, `branch-ledger-reports.test.ts`, `financial-calendar-events.test.ts`, `cycle-audit.test.ts`.

---

## 6. العملاء والشركاء وCRM

| المسار | الحالة |
|---|---|
| `/customers` و`/customers/:id` | ✅ العملاء وكشف الحساب |
| `/customers/imported-products` | ✅ منتجات واردة للعميل |
| `/customers/ready-deliveries` | ✅ تجهيز التسليم |
| `/partners` | ✅ الشركاء: رأس المال، الملكية، الأرباح، المسحوبات، القروض، المرفقات، سجل التغييرات |
| `/crm/...` (hub/leads/pipeline/activities/campaigns) | ✅ إدارة العلاقات |

**ملاحظة تدقيق:** صفحة الشركاء تغطي فعلياً الحقول الجديدة: `ownershipMode`, `ownershipBasis`, `initialPaidAmount`, `initialPaymentType`, حفظ مرفقات الحركة، اختيار البنك للتحويل، واستعراض سجل رأس المال. تم التحقق من تمرير الحقول إلى `PartnerService` (السطور 335–388 من `PartnersPage.tsx`).

**التغطية:** `partners.test.ts` (14 اختباراً ناجحاً بعد الإصلاحات).

---

## 7. الموارد البشرية

| المسار | الحالة |
|---|---|
| `/employees` | ✅ الموظفون |
| `/employees/attendance` | ✅ الحضور والانصراف |
| `/employees/payroll` | ✅ الرواتب |
| `/employees/commissions` | ✅ العمولات |
| `/employees/leave` | ✅ الإجازات |
| `/employees/contracts` | ✅ العقود |
| `/employees/documents` | ✅ مستندات الموظفين |
| `/employees/recruitment` | ✅ التوظيف |
| `/hr/dashboard` | ✅ لوحة HR |

**التغطية:** `hr-leave`, `hr-recruitment`, `hr-contracts`, `hr-documents`, أجزاء من `permissions.test.ts`.

---

## 8. التصنيع والمشاريع والعمليات

| المسار | الحالة |
|---|---|
| `/manufacturing` | ✅ قوائم مواد، أوامر إنتاج، جودة، صيانة، WIP |
| `/projects` و`/projects/:id` | ✅ مشاريع، مهام، تبعيات، موازنات، مخاطر، تسليمات، طلبات تغيير |
| `/fleet/dashboard`, `/deliveries`, `/drivers`, `/vehicles` | ✅ العمليات والأسطول |

**التغطية:** `manufacturing*.test.ts` (5 ملفات)، `projects.test.ts`, `project-controls.test.ts`, `operations-module-guard.test.ts`.

---

## 9. الإدارة والأمان والتقارير

| المسار | الحالة |
|---|---|
| `/reports` ومركز التقارير | ✅ تقارير مالية/مبيعات/مشتريات/ضرائب/POS |
| `/approvals` | ✅ الموافقات |
| `/documents` و`/contracts` | ✅ المستندات والعقود |
| `/notifications` | ✅ الإشعارات |
| `/audit` | ✅ سجل التدقيق |
| `/security` | ✅ مركز الأمان و2FA |
| `/admin`, `/users`, `/admin/sync-conflicts`, `/admin/data-deletion` | ✅ الإدارة |
| `/data-import`, `/data-import/types` | ✅ استيراد البيانات |
| `/settings` | ✅ الإعدادات الشاملة |
| `/backup` | ✅ النسخ الاحتياطي والاستعادة |
| `/system-health` | ✅ صحة النظام |

---

## 10. نتائج تدقيق الواجهة الآلي

- أداة `scripts/ui-audit` أنتجت `docs/ui-audit/manifest.json` و`smoke-report.json`.
- 24 مساراً أساسياً تم فحصها آلياً: **كلها PASS** (تغيّر محتوى الصفحة، تفاعل، لا أخطاء كونسول).
- `gaps.json` أبلغ عن 3 حالات `button-without-handler` في:
  - `src/components/auth/PermissionGate.tsx`
  - `src/components/ui/Can.tsx`
  - `src/components/ui/CentralLimitGuard.tsx`
- **تقييم:** إيجابيات كاذبة (false positives)؛ الأداة التقطت `<button>` داخل تعليقات توثيقية (JSDoc) وليس عناصر فعلية. لا إجراء مطلوب.

---

## 11. فجوات/ملاحظات وظيفية

1. **لا توجد بيانات أعمال إنتاجية** في نسخة القاعدة المفحوصة (0 منتجات، 0 فواتير)؛ لذلك التحقق من الوظائف يعتمد على الاختبارات وليس على سيناريو بيانات حقيقية.
2. **مسار `/reports/tax` وغيرها** تحويلات إلى تبويبات مركز التقارير — سلوك مقصود وليس فقدان صفحات.
3. **عمق بعض الوحدات** (التصنيع/المشاريع/المطاعم) مغطى باختبارات لكنه أقل استخداماً في الواجهة اليومية؛ يوصى بجولة قبول أعمال قبل الإنتاج.
4. **لا توجد فجوات "أزرار بلا وظيفة"** مؤكدة بعد استبعاد إيجابيات أداة الفحص.
