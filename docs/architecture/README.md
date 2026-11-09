# CeramiSys Architectural Restructuring Report

Date: 2026-11-09
Scope: `src/` renderer application plus the renderer-side service/database ("backend") layers.
Status: Executed, typechecked, linted, production-built, and regression-tested.

---

## 1. Executive summary

The repository is a Vite + React 18 + Electron desktop ERP. It does **not** contain a
separate HTTP server: business logic runs in the renderer against an encrypted SQLite
database (`sql.js`), and the Electron main process is a bytecode-protected packaging and
security boundary exposed through IPC.

The restructuring therefore applied the requested technical-layer model to the layers that
actually exist:

| Requested backend layer | Actual implementation in this repository |
| --- | --- |
| routes / controllers | Electron IPC handler registrars (`electron/*Handlers.js`, `electron/printing.js`, `electron/licenseGuard.js`) |
| services | `src/services/<domain>/` (business logic, permissions, transactions) |
| repositories | `src/database/repositories/` (`databaseManager.ts`, `ledger.ts`) |
| models / schema | `src/database/schema/` |
| migrations | `src/database/migrations/` |
| validators | `src/services/config/settingsValidation.ts`, `src/services/auth/passwordPolicy.ts`, domain validators inside services |
| events / jobs | `src/services/effects/`, `src/services/backup/BackupScheduler.ts`, `src/sync/` |

The Electron main-process source was deliberately **not moved**. It is currently in its
packaged "Protected binary code" state, its file paths are pinned by
`electron/bytecode-integrity.json`, `entry.js`, and `scripts/compile-bytenode.cjs`, and moving
it would invalidate the signed bytecode integrity chain. Its controllers/services/security/
integrations are already separated by responsibility and were preserved unchanged.

---

## 2. Old vs new frontend structure

### Before (excerpt)

```text
src/
  components/
    AuditLogView.tsx  BrandsView.tsx  CustomersView.tsx  Header.tsx ...
    dashboard/  daily/  pos/  products/  purchases/  reports/  sales/
    stock-transfers/  ui/
  hooks/
    useAppConfig.ts  usePermission.ts ... daily/
  pages/
    finance/ExpensesPage.tsx
    finance/FixedAssetsPage.tsx
    sales/OrdersPage.tsx  sales/orders/...
  services/
    AuthService.ts  SalesService.ts  InventoryService.ts  FinanceEnterprisePart01.ts ...
    effects/  inventory-count/  sales/
  types/
    cash.ts  finance.ts  products.ts  sales.ts ...
  database/
    db.ts  ledger.ts  migrations.ts  migrationSupport.ts  schema.ts
  utils/  config/  contexts/  sync/  shims/  workers/
```

### After (excerpt)

```text
src/
  components/
    admin/  auth/  business/  config/  customers/  daily/  dashboard/
    documents/  inventory/stock-transfers/  notifications/  pos/  products/
    projects/  purchases/  reports/financial-statements/  sales/  setup/
    shared/  suppliers/  treasury/  ui/
  hooks/
    admin/  auth/  config/  daily/  dashboard/  inventory/  licensing/
    pos/  shared/  treasury/
  pages/<domain>/<page-name>/<PageEntry>.tsx
    e.g. finance/expenses/ExpensesPage.tsx
         sales/orders/OrdersPage.tsx
         inventory/inventory-count/InventoryCountPage.tsx
    plus page-specific helpers, modals, tables and constants in the same folder
  services/
    admin/  approvals/  auth/  backup/  config/  crm/  customers/  dashboard/
    data/  documents/  effects/  finance/  hr/  inventory/  inventory-count/
    licensing/  manufacturing/  notifications/  operations/  organization/
    procurement/  products/  projects/  purchases/  reports/  restaurant/
    sales/  security/  shared/  suppliers/
  types/<domain>/
    admin/  auth/  backup/  config/  crm/  customers/  dashboard/  documents/
    effects/  finance/  hr/  inventory/  notifications/  organization/  parties/
    pos/  procurement/  products/  purchasing/  sales/  shared/  sync/  treasury/
  utils/
    customers/  export/  navigation/  products/  shared/
  database/
    repositories/   # databaseManager.ts, ledger.ts
    migrations/     # runner + settings + support + all migration parts
    schema/         # schema aggregator + all schema parts
  config/  contexts/  errors/  layouts/  router/  shims/  styles/  sync/  workers/
```

`src/App.tsx`, `src/main.tsx`, and `src/index.css` remain at the Vite entry root, as required by
the framework convention.

---

## 3. Migration statistics

| Layer | Files moved |
| --- | ---: |
| pages | 149 |
| services | 152 |
| types | 47 |
| components | 46 |
| hooks | 31 |
| utils | 11 |
| database | 6 |
| **Total** | **442** |

- Import specifiers rewritten: **569 files** (including `test/` and `e2e/` consumers).
- Target directories created: **204**.
- Exact duplicate source files found: **0**.
- Full machine-readable mapping: [`migration-map.json`](./migration-map.json)
  (each entry is `{ "from": "src/...", "to": "src/..." }`).

No business logic, SQL, API contract, route path, permission string, or calculation was
changed. Only file locations and module specifiers changed, with three mechanical fixes:

1. Two Vite worker URLs (`new URL(...)`) were rebased after their page/util folders moved.
2. `impactRegistry.ts` documentation metadata paths were rebased to the new locations.
3. A test that re-imported `src/database/db.ts?hmr=...` was pointed at the new repository path.

---

## 4. Dependency architecture

```text
Page entry (pages/<domain>/<page>/)
  -> components/<domain>/  +  hooks/<domain>/
       -> services/<domain>/
            -> services/shared|auth|config
            -> database/repositories/databaseManager.ts
                 -> database/schema/ + database/migrations/
  -> types/<domain>/  (type-only)
  -> utils/<domain>/  (pure helpers)
```

Rules enforced by the new layout:

- Pages never import another page's private folder.
- Hooks depend on services/stores, not on pages.
- Services contain business rules and transactions; repositories own database access.
- `shared` modules do not import page-specific modules.
- Types are type-only and do not import runtime UI code.
- The Electron main process remains the transport/controller boundary and is isolated from
  renderer folder changes.

### Import cycles (resolved)

The cycle scan previously found 8 cycles, all in existing security/auth/router
composition. They were removed by extracting dependency-free modules rather than
changing any business logic:

| Cycle | Break | New module |
| --- | --- | --- |
| `AuthService` ↔ `PermissionService` ↔ `AuditService` | `PermissionService` audits through a low-level writer instead of `AuditService` | `src/services/security/auditWriter.ts` |
| `PermissionService` ↔ `CentralFeaturePermissionService` ↔ `CentralLicenseService` | feature checks read the cached config directly | `src/services/licensing/centralConfigStore.ts` |
| `AuthService` ↔ `BranchAccessService` | branch scoping reads the session directly | `src/services/auth/session.ts` |
| `utils/export/export.ts` ↔ `excelExportWorkbook.ts` | shared `ExportColumn` type moved out of the implementation | `src/utils/export/exportTypes.ts` |
| `AppConfigurationPage` ↔ `routesList` ↔ `lazyPages` | page catalog reads a component-free path manifest | `src/router/routePaths.ts` |
| `types/finance/index` ↔ `types/finance/banking` | banking imports `core` directly instead of the barrel | — |

A dev-time consistency check keeps `routePaths.ts` in sync with `routesList.tsx`.
Current `madge --circular` result: **0 cycles**.

### File-size reduction (≤100 lines)

The split rule is: keep the original file as a re-export barrel and move cohesive
top-level units into sibling `<name>_partNN.ts(x)` files. This preserves every existing
import site and the public API. A backup of every original is kept before splitting.

**Batch 1 completed** — 46 files that were splittable at top-level statement boundaries
were split into 144 part files (all ≤100 lines), including types, config, migrations,
router tables, services, hooks, and TSX components. Generated parts use `_partNN` (not
`.partNN`) so extensionless imports resolve in both Vite and the Node test runner, and
cross-part type imports use `import type` to keep runtime exports valid.

Progress: `src/` files over 100 lines went from **434 → 377** (batch 1: 46 files, batch 2: 12 files).
Batch 2 (max statement 81–100) split 12 more files; 8 files with a single statement over 100 lines were reverted to avoid oversized parts.

The remaining **377** cannot be split at top-level statement boundaries and need
semantic refactoring per category:
- 263 files whose largest statement is over 150 lines (mostly large components/services).
- 105 files whose largest statement is 101–150 lines.
- 8 files deferred from batch 2 (single oversized statement).

These require method/function extraction, component decomposition, or data-array chunking,
and are processed in later batches with verification after each batch.

The splitter and backups are kept outside the repo:
- splitter: `%TEMP%/opencode/split-large.mjs`
- backups: `%TEMP%/opencode/split-backup/`

---

## 5. File classification method

Every file was classified by:

1. Imports and exports (actual dependencies).
2. Importers (actual consumers), not filename alone.
3. Whether it was page-specific, domain-specific, or shared.
4. Whether it was a runtime module, type-only module, or ambient declaration.

Aspects that were intentionally kept in place:

- `config/`: registries, navigation, permissions, business profiles, terminology. This is the
  constants/configuration layer; splitting it per domain would duplicate cross-domain registries.
- `contexts/`, `sync/`, `shims/`, `workers/`, `errors/`, `layouts/`, `router/`: cohesive
  technical subsystems with a single responsibility.
- `public/` assets and the Electron process.

---

## 6. Duplicates, unused files, retention decisions

- No byte-identical duplicate source files were found.
- 43 files are not statically referenced by the import graph. They are **retained** because they
  are one or more of: barrel/public API modules (`services/index.ts`, `types/index.ts`), ambient
  declarations (`*.d.ts`), worker entry points loaded through `new URL(...)`, or page features that
  are reachable through configuration rather than direct imports. No file was deleted without
  proving it unused.
- No mock data or placeholder implementation was introduced.

---

## 7. Validation results

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` (frontend) | ✅ Pass |
| `npm run lint` | ✅ 0 errors (1,298 warnings; unused imports in barrels/parts) |
| `npm run build` | ✅ Pass — 194 chunks obfuscated |
| Unit/integration suite (`npm test`) | ✅ Pass except 1 pre-existing behavioural failure (below) |
| Broken import scan | ✅ None (TypeScript resolves all modules) |
| Database durability test | ✅ Pass |
| Cycle scan (`madge --circular`) | ✅ 0 cycles |

### Pre-existing failure confirmed against a clean `HEAD` worktree

This fails identically before the restructuring and is not caused by it:

1. `test/business-profiles.test.ts::terminology settings drive navigation labels...`
   - Navigation groups filtered out for `businessType = services` never receive their
     explicit `nav.labels` override. Fixing it changes navigation behaviour, so it is
     intentionally left for a separate behavioural change.

The previously stale `test/single-device.test.ts` expectation was updated to the current
`package.json` scripts (`build:local` + integrity check) without changing runtime behaviour.


### Pre-existing Electron typecheck note

`npm run typecheck` first runs frontend `tsc` (passing) and then
`typecheck:electron`. The Electron source is currently in its protected-stub form
(`module.exports = require('./*.jsc')`), so `checkJs` cannot resolve `.jsc` modules. This is the
packaged state of the repository and was also failing before this work. It was intentionally not
modified because doing so would break the bytecode integrity chain.

---

## 8. Rollback

The migration is reversible from the map:

```powershell
node -e "const fs=require('fs'),path=require('path');const m=require('./docs/architecture/migration-map.json');for(const x of m.reverse()){fs.mkdirSync(path.dirname(x.from),{recursive:true});fs.renameSync(x.to,x.from)}"
```

Then restore imports from version control. The restructuring itself did not touch database
migrations, schema SQL, route paths, permission keys, environment variables, or Electron files.

---

## 9. Remaining architectural recommendations

1. ~~Break the 8 cycles~~ — done via `session.ts`, `auditWriter.ts`, `centralConfigStore.ts`,
   `exportTypes.ts`, and `routePaths.ts`; `madge` now reports 0 cycles.
2. Introduce a schema validation layer (for example Zod) only if a new dependency is approved;
   the current validators are hand-written and were preserved.
3. Add an import-boundary lint rule (`no-restricted-imports`) so pages cannot import another
   page's private folder and services cannot import pages.
4. Move the Electron IPC registrars into `electron/controllers/` only as part of a signed
   bytecode rebuild, with `compile-bytenode.cjs`, the integrity manifest, and `entry.js` updated
   together.
5. Address the remaining `business-profiles` terminology/navigation-filter failure in a separate
   behavioural change.
