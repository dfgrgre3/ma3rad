# CeramiSys ERP: Enterprise Architecture Assessment

Assessment date: 2026-10-27

## Current state

CeramiSys is a React 18, TypeScript, Vite and Electron desktop application. It persists a sql.js SQLite database through a narrow preload API in Electron and falls back to browser local storage outside Electron. Electron enables context isolation and disables renderer Node integration; IPC handlers validate the sender frame. The application is therefore a single-device desktop system today, not a shared multi-user server deployment.

The codebase already contains substantial showroom ERP functionality: sales and POS, quotations and orders, CRM, purchasing and receiving, inventory movements/transfers/counts/valuation, finance and journal entries, financial statements, branches, warehouses, employees/payroll, projects, approvals, permissions, audit events, backup/recovery, import/export, Arabic-first UI and business-profile setup. The project includes unit/integration and Electron boundary tests. These are existing assets to retain and verify, not modules to replace.

## Architecture map

| Concern | Current implementation | Assessment |
| --- | --- | --- |
| Renderer and navigation | `src/App.tsx`, `src/layouts`, `src/pages`, `src/components`, `src/config/navigation*` | Large but modular page/component tree. Route authorization and configured module visibility exist. |
| Domain logic | `src/services/*` | Many domain services exist; several large services are split across numbered `Part` files. Service-level authorization is present in some domains and needs systematic coverage. |
| Persistence | `src/database/db.ts`, `src/database/schema/*`, `src/database/migrations*` | sql.js database manager, parameterized service queries, schema split into parts, ordered migrations with a migration ledger and transaction handling. Browser fallback is explicitly less protected than Electron file storage. |
| Electron | `electron/main.js`, `databaseHandlers.js`, `appHandlers.js`, `printing.js`, `preload.js`, `security.js` | Preload exposes named capabilities, context isolation is on, IPC sender validation and navigation restrictions exist. Keep this boundary narrow and test each handler. |
| Identity and access | `AuthService`, `PermissionService`, `BranchAccessService`, `usePermission` | Password hashing, permission catalog/roles/user overrides, branch access and company scope exist. Documents and contracts use explicit `company_id`; most legacy domains still inherit company scope through their branch. |
| Business profiles/modules | `src/config/businessProfiles.ts`, `SetupWizard.tsx` | Industry profiles adjust units and initial modules. A typed module registry now carries dependencies, permissions, settings and lifecycle rules, and service guards block new operations when a module is disabled. |
| Tests | `test/*`, `package.json` | Broad regression coverage includes database recovery, migrations, security, branch access, financial lifecycle, purchasing and inventory. Results must be refreshed against the current checkout before release. |

## Gaps and risks to address

1. **Single-device deployment limit:** the local SQLite/sql.js persistence model has no shared authenticated API or concurrency controls suitable for multiple workstations. Do not market it as a multi-location concurrent deployment.
2. **Company scope is only partially applied:** legal entities and cross-company isolation exist for companies, branches, documents and contracts. Most legacy transaction domains still derive company scope from their branch, so records without a branch need explicit ownership before they can be treated as fully isolated.
3. **Module lifecycle is implemented for the main operational modules:** the registry has dependencies, permissions, settings and lifecycle checks, and service guards cover purchasing, sales, approvals, operations, inventory, documents, projects and HR. Remaining modules should adopt the same guard before claiming universal lifecycle enforcement.
4. **Industry neutrality is incomplete:** setup and settings retain showroom/ceramic vocabulary and transaction/product assumptions. Profile defaults do not make every domain industry-neutral.
5. **Authorization consistency needs audit:** there is a permission service and many service checks, but coverage must be inventoried per mutation and sensitive read/export path. UI checks alone are insufficient.
6. **Operational documentation is incomplete:** a documented backup verification/recovery runbook, deployment sizing limits, and future server-backed deployment path should accompany implementation.
7. **Maintainability:** numbered service/schema parts and overlapping domain services increase the cost of tracing transaction boundaries. Refactor only alongside verified behavior, not as a broad rewrite.

## Preserve intact

- Existing customer, supplier, product, stock, sales, purchasing, accounting, employee, branch, user and audit records.
- Ordered migration history and existing recovery behavior.
- Current Electron packaging and the named preload API.
- Existing permission semantics and branch-specific transaction workflows.
- Existing ceramic/showroom setup defaults and business workflows.

No destructive schema rewrite is part of this assessment. Any future scope change must be additive, migration-led, backed up, transactional where possible, and exercised against a representative pre-change database.

## Prioritized implementation roadmap

1. **Stabilize and baseline:** run typecheck, full existing test suite and production build; resolve confirmed defects; document backup/recovery and security boundaries.
2. **Core controls:** inventory service-layer authorization and company/branch scoping; close confirmed bypasses; standardize audit and transactional mutation patterns for critical finance/inventory operations.
3. **Organization foundation:** add organization/legal entity and explicit company ownership using additive migrations and safe backfills; test same-company and cross-company access. Keep existing branch IDs and historical meaning.
4. **Module registry:** make module definitions typed and declarative (dependencies, permissions, configuration, routes and lifecycle); validate activation/deactivation in a domain service; keep historical data on deactivation.
5. **Industry-neutral configuration:** replace showroom-only configuration concepts with compatible organization/business settings while retaining old keys as aliases; expand typed product/service capabilities and jurisdiction-configurable finance/HR settings.
6. **Complete existing modules:** audit and connect sales, procurement, accounting, inventory and reporting lifecycles; prioritize identified gaps by impact and testability.
7. **Advanced modules:** project controls, documents/contracts, HR leave, employee contracts, controlled employee documents and manufacturing core (BOM, work centers, production orders) are implemented; jurisdiction-configurable payroll, inventory posting for manufacturing, WIP valuation, quality and maintenance remain open.
8. **Deployment:** the product is scoped to a single offline workstation. An authenticated API/shared server database is deliberately **not** implemented; the supported operations are documented in `docs/offline-single-machine-ar.md` (install, upgrade, backup, restore, troubleshooting).

## Database and migration strategy

- Continue using `schema_migrations` and ordered additive migrations; do not replace the database file or rewrite old migrations.
- Make each migration idempotent where feasible, transactional, and stop subsequent migrations after failure (the current runner follows this policy).
- Before data-shape changes, create and verify a backup; record row counts and `PRAGMA foreign_key_check` results in migration validation.
- Backfill new company ownership to the existing default branch/company mapping without changing historical dates, amounts, numbers, or status.
- Add foreign keys, unique constraints and indexes only after validating legacy rows; report conflicts instead of silently dropping or rewriting records.
- Keep SQL parameterized. Keep database access in services/database layer, never renderer-provided SQL.
- A server-backed deployment is a separate architecture increment; SQLite desktop storage remains supported for single-device use.

## Completion status

This file is an initial repository assessment, not a claim that the universal ERP objective is complete. The roadmap checklist in `docs/enterprise-roadmap.md` tracks implementation and verification status.
