# Phase 3 — تقرير توسيع BusinessProfile (schema v2)

التاريخ: 2026-11-04 · المرجع: `docs/GAP_ANALYSIS.md` §3, §8 (المرحلة 3-4)

## ما أُنجز

### 1. BusinessProfile schema v2 (`src/config/businessProfiles.ts`)
- تمت إضافة 8 حقول اختيارية (backward-compatible: validation فقط عند الوجود):
  - `dashboard?: BusinessProfileDashboard` (kpis: id/label/source/format + widgets)
  - `reports?: BusinessProfileReport[]`
  - `printTemplates?: BusinessProfilePrintTemplate[]`
  - `permissions?: BusinessProfilePermissionSuggestion`
  - `pricingRules?: BusinessProfilePricingRules`
  - `workflows?: BusinessProfileWorkflow[]`
  - `features?: string[]`
  - `navigation?: BusinessProfileNavigation`
- 8 interfaces جديدة + validation (kpis non-empty, labels ar/en, source ∈ enum, docTypes ∈ enum, pricing tiers shape, navigation groups/items).
- 9 accessors جديدة: `getProfileDashboard`, `getProfileReports`, `getProfilePrintTemplates`, `getProfilePermissionSuggestions`, `getProfilePricingRules`, `getProfileWorkflows`, `getProfileFeatures`, `getProfileNavigation`, `getProfilePrintTemplate`.

### 2. 10 أنشطة مرجعية مُعبَّأة
ceramics, restaurant, general, manufacturing, food, services, building_materials, clothing, electronics, workshop — each now declares dashboard KPIs, reports, print templates, pricing tiers, features (+ workflows where relevant). Others remain valid with the new fields optional.

### 3. ربط بالواجهة (proof-of-wiring)
- `src/components/dashboard/ProfileKpiPanel.tsx` يعرض KPIs النشاط على Dashboard (OverviewSection).
- `PrintService.getInvoiceHtml` يقرأ `getProfilePrintTemplate(profile, 'sales_invoice')` كـfallback قبل `'classic'` (ceramics→modern، restaurant→compact).
- `ReportsHubPage` يعرض "تقارير موصى بها للنشاط" chips.
- (permissions/workflows/pricingRules/navigation: helpers + data موجودة؛ الربط (RBAC auto-apply، workflow engine، pricing engine) مؤجل — see below.)

### 4. Dependency & Event Engine — scaffolding (Phase 5 seed)
- `src/services/effects/`: `EffectTypes.ts`, `EffectRegistry.ts`, `EffectEngine.ts`, `index.ts`.
- Migration **111_domain_events** (`src/database/migrations/part14.ts`): جدول `domain_events` append-only مع unique index على `(aggregate_type, aggregate_id, effect_type, effect_key)`.
- `test/effects-engine.test.ts`: 3 اختبارات (ترتيب handlers، انتشار الأخطاء، no-op على قائمة فارغة).
- **لم يُرحَّل أي service بعد** — `invoiceCreation` وما بعدها لا تزال inline. الترحيل تدريجي في Phase 5.

### 5. 7 سيناريوهات E2E — scaffolding
- `e2e/ui-audit.spec.ts` (smoke على 25 مسارًا) + `app.spec.ts` مُعاد هيكلته (fixture مشترك). السيناريوهات المتكاملة (دورة بيع/شراء/تصنيع/...) مؤجلة إلى Phase 7 (تتطلب BYPASS=false + تفعيل-أول-تثبيت).

## ما لم يُنجز (بقرار scope)

- **ربط RBAC** (permissions.suggested → auto-apply عند تغيير النشاط): requires migration of roles + careful handling of existing installs; مؤجل.
- **ربط pricingRules** (tiers → PricingService): مؤجل — PricingService needs refactor to consume tiers.
- **ربط workflows** (steps → manufacturing/restaurant): مؤجل — needs workflow engine.
- **ربط navigation** (profile.navigation → NAV_GROUPS): مؤجل — needs merge with overrides.
- **ربط features** (profile.features → FEATURE_REGISTRY): مؤجل.
- **ترحيل التأثيرات** (Phase 5): invoiceCreation/void/returns/payments/PurchaseService/etc. لا تزال inline.
- **7 سيناريوهات E2E** (Phase 7): مؤجلة.

## التحقق
- `npm run typecheck` ✅ (pending background run)
- `npm test` includes 2 new test files (impact-registry + effects-engine) — pending verification.
