# تقرير الإنجاز — Phases 0 → 5 (proof-of-concept)

التاريخ: 2026-11-04 · المرجع: `docs/GAP_ANALYSIS.md`

## التحقق (كله أخضر)
| الفحص | النتيجة |
|---|---|
| `npm run typecheck` | ✅ 0 خطأ |
| `npm test` | ✅ **366+ pass, 0 fail** (360 baseline + 6 جدد) |
| `npm run build` | ✅ نجح (175 ملفًا) |
| `npx playwright test e2e/ui-audit.spec.ts` | ✅ 25/25 مسارًا PASS، 0 pageerror |
| `npx playwright test e2e/app.spec.ts` | ✅ 1 pass · 2 skipped (bypass/dev-flag + no release) |

## ما أُنجز

### Phase 0 — تثبيت الأساس
- `voidSalesInvoice`: عكس الكاش على الكاشير الأصلي + طرح `cash_shifts.total_sales_*` (MAX(0)).
- `PAY-<timestamp>` → `nextNumber('PAY')` (PurchaseService, SupplierService).
- Migration 104: unique index على `journal_entries(reference_type, reference_id)` (لا يلمس الدفتر القديم).
- Migration 110: `customer_payments.idempotency_key` + unique index.
- Idempotency keys wired from UI (7 شاشات) + `recordInvoicePayment`/`PurchaseService.recordPayment` accept keys.
- `countSessionService` moved to `src/services/inventory-count/`.
- `getManagedBusinessPaths` covers `/reports/category/*`.
- `productUnits` tolerates `undefined`.
- `ledger.ts` debug line fixed (بدون حذف عمل المستخدم).
- توثيق `docs/PHASE0_REPORT.md`, `docs/IMPACT_MAP.md`.

### Phase 1 — Interactive UI Audit (groundwork)
- `scripts/ui-audit/scan.mjs` → `docs/ui-audit/manifest.json` (4023 عنصر / 244 ملف).
- `e2e/support/app.fixture.ts` (fixture مشترك).
- `e2e/ui-audit.spec.ts` (smoke: 25 مسارًا PASS).
- `docs/ui-audit/README.md` (منهجية + حالات + workflow).
- `npm run ui-audit:scan`.

### Phase 2 — Dependency & Impact Registry
- `src/config/impactRegistry.ts` (10 عمليات + أهداف + حالات + سياسة المستندات التاريخية).
- `test/impact-registry.test.ts` (3 اختبارات).

### Phase 3 — BusinessProfile schema v2
- 8 حقول اختيارية (dashboard, reports, printTemplates, permissions, pricingRules, workflows, features, navigation) + 8 interfaces + validation.
- 9 accessors (`getProfileDashboard`, `getProfileReports`, `getProfilePrintTemplates`, `getProfilePermissionSuggestions`, `getProfilePricingRules`, `getProfileWorkflows`, `getProfileFeatures`, `getProfileNavigation`, `getProfilePrintTemplate`).
- 10 أنشطة مرجعية مُعبَّأة (ceramics, restaurant, general, manufacturing, food, services, building_materials, clothing, electronics, workshop).
- `ProfileKpiPanel` (Dashboard), `PrintService` profile-template fallback, `ReportsHubPage` "تقارير موصى بها".
- `docs/PHASE3_REPORT.md`.

### Phase 4 — Wiring (RBAC / pricing / workflows / features / navigation)
- `BusinessProfileService.applyPermissionsFromSettings()` (non-destructive RBAC auto-apply) wired into AdminSettingsTab save + SetupWizard.
- `getPricingTierFactor(profile, tierId, fallback)` → CartLine factors (wholesale/min_price/distributor/vip) driven by profile.
- Workflow panels on ManufacturingPage + RestaurantPage.
- Features + navigation panels on AdminSettingsTab (business tab).
- `docs/PHASE4_REPORT.md` (this file includes all).

### Phase 5 — Dependency & Event Engine (proof-of-concept)
- `src/services/effects/`: `EffectTypes`, `EffectRegistry`, `EffectEngine`, `index`.
- `src/services/effects/handlers/salesInvoiceHandlers.ts`: handlers for `ledger.post`, `audit.log`, `sync.capture`.
- Migration **111_domain_events** (جدول append-only + unique index).
- `createSalesInvoice` migrated: side-effects now dispatched via `EffectEngine.run()` inside the transaction (handlers throw → rollback). `insertAuditLog` helper removed; `postLedgerEntry`/`BusinessRecordSyncService` imports dropped from invoiceCreation.
- `test/effects-engine.test.ts`: 3 اختبارات (ترتيب، انتشار أخطاء، no-op).
- sales.test.ts + integration + receivables + permissions + services + data-integrity: **64/64 pass**.

## ما بقي (لإطلاق)
- Phase 5 (full): migrate remaining operations (void, returns, payments, purchase, transfer, expense, inventory count) to emit effects; remove duplicated inline blocks; unify audit path (INSERT inside transaction vs AuditService.log post-COMMIT).
- Phase 6: ربط الإعدادات بتأثيراتها (costingMethod, pricing rules, tax settings → new invoices/reports only).
- Phase 7: 7 سيناريوهات E2E (sales cycle, purchases, manufacturing, expenses, inventory, permissions, activity-switch) — needs BYPASS=false + activation selectors update + CI job.
- Deep merge: profile.navigation → NAV_GROUPS; profile.features → FEATURE_REGISTRY gating; profile.permissions → role-management UI surfacing.
- durability: flush متزامن لـ`db:save` (قرار معماري).
- قلب `OPEN_ALL_PAGES`/`BYPASS_FIRST_RUN_SETUP` (قرار: مؤقتًا true).

## ملفات الدفعة (Phase 3+ + Phase 5)
- `M` src/config/businessProfiles.ts, src/services/PrintService.ts, src/services/BusinessProfileService.ts
- `M` src/components/dashboard/OverviewSection.tsx, src/components/dashboard/ProfileKpiPanel.tsx (??), src/components/pos/CartLine.tsx
- `M` src/pages/reports/ReportsHubPage.tsx, src/pages/admin/AdminSettingsTab.tsx, src/pages/manufacturing/ManufacturingPage.tsx, src/pages/restaurant/RestaurantPage.tsx
- `M` src/services/sales/invoiceCreation.ts, src/services/sales/invoiceVoid.ts (Phase 0)
- `M` src/database/migrations/part14.ts (110, 111)
- `??` src/services/effects/* (5 files), src/components/dashboard/ProfileKpiPanel.tsx, test/effects-engine.test.ts, test/impact-registry.test.ts, docs/*
- 10 profile JSONs (ceramics, restaurant, general, manufacturing, food, services, building_materials, clothing, electronics, workshop)
- `M` package.json (test script + ui-audit:scan)
- `M` .gitignore (ui-audit artifacts)
- `M` e2e/app.spec.ts, e2e/support/app.fixture.ts, e2e/ui-audit.spec.ts

الأساس (معاملات ذرّية + scoping + FK + idempotency + hot-switch) سليم وقادر على حمل الطبقات (Business Profile Engine / Core ERP / Dependency & Event Engine / Validation & Audit Engine) incrementally.
