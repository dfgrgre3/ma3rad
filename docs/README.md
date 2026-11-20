# توثيق صفحات وأزرار النظام (MA3RAD ERP)

توثيق شامل لكل صفحات التطبيق وعناصرها التفاعلية (الأزرار، التبويبات، إجراءات الصفوف، المودالات).
تم استخراجه من الكود المصدري مباشرة.

## بنية المشروع

- **Framework:** React + TypeScript + Vite
- **Routing:** `react-router-dom` — التعريف في `src/router/routesList.tsx` (مسارات التطبيق) و`src/pages/platform/PlatformRoutes.tsx` (مسارات `/platform/*`)
- **Pages:** `src/pages/<module>/` — بعض الصفحات القديمة موجودة كمكونات في `src/components/`

## ملفات التوثيق حسب القسم

| الملف | القسم | عدد الصفحات تقريباً |
|---|---|---|
| [platform-a.md](platform-a.md) | لوحة تحكم المنصة (الجزء الأول: Dashboard حتى Health) | 17 |
| [platform-b.md](platform-b.md) | لوحة تحكم المنصة (الجزء الثاني: Support حتى Plan Catalog) | 17 |
| [hr.md](hr.md) | الموارد البشرية والرواتب | 20 |
| [finance.md](finance.md) | المالية والخزينة | 17 |
| [inventory.md](inventory.md) | المخزون والمستودعات | 14 |
| [operations.md](operations.md) | العمليات: فروع، أسطول، موظفون، ورديات | 14 |
| [sales-daily-verticals.md](sales-daily-verticals.md) | المبيعات، POS، اليومي، القطاعات | ~25 |
| [settings-admin.md](settings-admin.md) | الإعدادات، الإدارة، الموافقات، المستندات | ~20 |
| [purchasing-products.md](purchasing-products.md) | المشتريات، المنتجات، الأسعار والعروض | ~20 |
| [reports-crm-customers-projects.md](reports-crm-customers-projects.md) | التقارير، CRM، العملاء، المشاريع، لوحة التحكم | ~25 |

## ملفات التوثيق التفصيلي (docs/details/)

توثيق على مستوى الملفات لكل طبقات المشروع — كل ملف بمساره وغرضه وأعضائه المصدّرة:

| الملف | النطاق |
|---|---|
| [details/services-platform.md](details/services-platform.md) | خدمات المنصة (107 ملفات) |
| [details/services-hr.md](details/services-hr.md) | خدمات الموارد البشرية (58) |
| [details/services-finance.md](details/services-finance.md) | خدمات المالية (59) |
| [details/services-operations.md](details/services-operations.md) | خدمات العمليات (49) |
| [details/services-sales-auth.md](details/services-sales-auth.md) | خدمات المبيعات + المصادقة (75) |
| [details/services-inventory-reports.md](details/services-inventory-reports.md) | المخزون + الجرد + التقارير (70) |
| [details/services-misc1.md](details/services-misc1.md) | مشاريع/تصنيع/عملاء/إعدادات/أدمن/تراخيص/داشبورد/مشتريات (~104) |
| [details/services-misc2.md](details/services-misc2.md) | منتجات/مستندات/موافقات/إشعارات/أمن + قطاعات (~53) |
| [details/services-infra-shared.md](details/services-infra-shared.md) | البنية التحتية + الخدمات المشتركة + المزامنة (44) |
| [details/database-core.md](details/database-core.md) | مدير قاعدة البيانات + المخطط + المستودعات |
| [details/database-migrations.md](details/database-migrations.md) | كل الترحيلات (~178 ملف) |
| [details/types.md](details/types.md) | كل الأنواع interfaces/types (~76 ملف) |
| [details/config.md](details/config.md) | السجلات والإعدادات (~55 ملف) |
| [details/hooks.md](details/hooks.md) | كل الـ custom hooks (52) |
| [details/components.md](details/components.md) | كل مكونات src/components (123) |
| [details/core-app.md](details/core-app.md) | الراوتر، التخطيط، السياقات، utils، sync، workers |

## ملاحظات

- بعض المسارات تُعيد التوجيه (redirect) إلى مسارات أخرى — موثّق في الملف المعني.
- بعض الصفحات تعمل كتبويبات داخل صفحة مركزية (مثل ReceivablesHub وReportsHub) — موثّقة في أقسامها.
- مسارات `/platform/*` مخصصة لمشرفي المنصة (SaaS) فقط ومحميّة بـ `PlatformRouteGuard`.
