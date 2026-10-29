# Universal ERP implementation checklist

Status reflects work completed in this repository, not aspirational capability. Update this file after each verified increment.

## Phase 1: Repository audit

- [x] Map current stack, modules, persistence, Electron boundary, access controls and tests.
- [x] Record existing functionality and preservation requirements.
- [x] Identify architectural gaps and prioritize follow-up work.
- [x] Run and record current typecheck, complete test suite and production build.
- Assessment: `docs/enterprise-assessment.md`.

## Phase 2: Stabilize the core

- [ ] Build a complete mutation/read/export authorization inventory by domain service.
  - Started: `docs/authorization-inventory.md` records current coverage and confirmed gaps (sales reads, printing, notifications, remaining module guards).
- [x] Verify finance posting balance, atomicity, reversal behavior and immutable posted history. Existing tests pass (`finance-enterprise-lifecycle`, `financials`, `security-accounting-audit`).
- [x] Verify stock movement and negative-stock policy across all mutation paths. Existing tests pass (`inventory-professional-lifecycle`, `data-integrity`).
- [ ] Document and exercise backup integrity and recovery against a copy of a real-format database.
  - Runbook written (`docs/backup-and-recovery.md`); production-size restore not yet exercised.
- [x] Add fixes and regression coverage for confirmed issues only.

## Phase 3: Universal enterprise foundation

- [x] Define organization and legal-entity ownership model and migration/backfill plan.
  - `companies` table, `branches.company_id`, migration `064_companies_and_branch_ownership`. Existing branches are backfilled to `cmp_main` without changing other data.
- [x] Add additive schema migration and cross-company isolation at service boundaries.
  - `CompanyService` + `BranchAccessService.getAccessibleCompanyIds/requireCompanyAccess`; `BranchService` validates company ownership on create/update. Tests: `test/companies.test.ts`.
  - `enterprise_documents` and `enterprise_contracts` carry explicit `company_id`/`branch_id` columns and are filtered by company before branch, so organization-level records cannot leak through a missing branch.
  - Not yet applied to every legacy domain table: most existing records still reach company scope through their branch.
- [x] Extend typed module registry with dependencies, permission metadata, configuration and lifecycle checks.
  - `src/config/moduleRegistry.ts`, `src/services/ModuleRegistryService.ts`, migration `063_module_registry_lifecycle`, permission codes `modules.view`/`modules.manage`, UI integrated in setup and admin settings. Tests: `test/module-registry.test.ts`.
  - Service guards cover purchasing, sales, approvals, operations, inventory, documents, projects and HR; reports exposes no mutation paths, only export/print permissions remain open.
- [x] Preserve existing company/branch/user data and ceramic defaults during setup evolution.
- [x] Add organization-level fiscal, currency, locale and time-zone configuration with historical transaction snapshots where needed.
  - `companies` now carries `fiscal_year_start_month`, `time_zone`, `locale`, `date_format` (migration `076_company_organization_settings`) with defaults and company-scoped read/write through `CompanyService`. Currency already existed. Historical snapshots remain a follow-up for period-closing/reporting.
- [x] Provide a company management UI (`src/components/CompaniesPanel.tsx`).

## Phase 4: Existing business modules

- [ ] Audit sales lifecycle, invoice numbering, returns, receipts and allocations.
  - Read authorization (`sales.view`) and module guards now enforced in `SalesService`; lifecycle audit still open.
- [ ] Audit purchasing requests, orders, receipts, supplier invoices and three-way matching.
- [ ] Audit inventory transaction provenance, costing, reservations, counts and transfers.
- [ ] Audit accounting posting rules, periods, reconciliation and financial statements.
- [ ] Audit dashboard metric definitions and export permissions.
  - Export permissions now declared on purchase returns, incoming products, supplier statements, other receivables, commissions, customer statements, invoice cycle and sales returns; new `purchases.export`, `suppliers.export`, `finance.export` and `employees.export` codes are backfilled once to roles that already had the matching view permission. Test: `test/export-authorization.test.ts`. Remaining: POS/sales list screens, inventory lists, audit log and daily operations.

Existing regression suites for these areas pass but the audits above are not complete.

## Phase 4b: Business-type neutrality

- [x] Sales, sales returns and invoice voids honor the business profile: when `trackInventory` is off, they skip stock checks, stock movements, batches and inventory ledger postings instead of requiring a stock row that never exists. Test: `test/services-business-sales.test.ts`.
- [x] Invoice-level cost and margin stay zero without inventory tracking (there is no stock asset to relieve), while line costs remain recorded for costing insight.
- [x] Mixed businesses (restaurants, workshops, contractors) can sell service lines without stock even while inventory tracking is on: a product whose `product_type` is `SERVICE` or whose base unit is `SERVICE` never moves stock, never relieves inventory cost, and never restores either on return/void. Goods receipts follow the same rule. Test: `test/services-business-sales.test.ts`.
- [x] Turning inventory tracking back on restores the stock requirement for real goods, so ceramics behavior is unchanged.
- [x] Fixed a systemic camelCase/snake_case defect: `DatabaseManager.query` normalizes columns to camelCase, but sales creation, sales returns, purchase preparation, goods receipt and the inventory adjustment/transfer/reserve/issue paths still read `product_type`, `base_unit`, `meters_per_box`, `pieces_per_box` and `cost_price`. Those reads silently returned `undefined`, which made ceramic defaults and service detection unreliable. All affected reads are now camelCase (or SQL-aliased), verified by the mixed-business test.
- [x] All preset profiles that declare a services model (`services`, `logistics`, `professional_services`, `education`, `healthcare_admin`) are exercised selling without stock in the same test file, not just the `services` preset.
- [x] Purchasing honors the business profile: with inventory tracking off, purchase invoices and purchase deletion skip stock rows, cost layers, inventory transactions and inventory ledger postings; the purchase is expensed instead. Opening stock is refused. Test: `test/purchases-without-inventory.test.ts`.
- [x] Goods receiving (GRN) follows the same rule: accepted quantities and purchase-order progress are recorded, but no stock row, batch or inventory transaction is created when tracking is off. Test: `test/purchases-without-inventory.test.ts`.
- [x] Product creation defaults follow the business profile when tracking is off: general product type, profile unit (for example `SERVICE`) and no floor surface. Unit labels now describe services as «خدمة» instead of «م²». Test: `test/services-business-sales.test.ts`.
- [x] Product form, Excel import and pricing labels follow the business profile: non-ceramic products start with no size/thickness/finish, a neutral surface, the profile's first unit, quantity 1 per box and zero prices; the opening-stock tab and stock creation are hidden when tracking is off; Excel import honors a `productType` column and skips stock when tracking is off. Tests: `test/product-units.test.ts`.
- [x] Product variants tab only appears for ceramic products; the variant grid keeps ceramic wording where it still applies.
- [x] Products and POS hide ceramic-only controls for service/general catalogues: the grade filter is hidden outside a ceramics profile, dimension/grade table columns collapse when no ceramic rows are on the page, and POS hides grade/size filters, tiling calculator button and F8 shortcut when the catalogue contains no stock-tracked ceramic items.

## Phase 5: Optional enterprise modules

- [x] Projects: budgets, task dependencies, time, risk/change and client deliverables.
  - Foundation completed: projects are now a registry module (`/projects`), reads require `projects.view`, writes require `projects.create/update/delete`, and all project and sub-entity operations are branch-scoped. Creation assigns the actor's accessible branch; cross-branch reads return no record; deletion is refused while non-void sales invoices reference the project. Project and unit changes require the referenced unit to belong to the same project. Tests: `test/projects.test.ts`.
  - Project controls are implemented in `ProjectService` and exposed on the project detail page under **المتابعة والميزانية**: tasks with priority/assignee/dates/progress and dependency links (duplicates, self-links and cycles are rejected), billable time entries with an hours summary, budget lines with planned/actual totals and variance against contract value, a risk register with severity/probability/mitigation, change requests whose decisions require `projects.approve`, and client deliverables with delivered/accepted timestamps. All reads require `projects.view`, writes require `projects.update`, and decisions require `projects.approve`. Tests: `test/project-controls.test.ts`.
  - Still open: project-level Gantt/resource levelling, automatic change-request approval workflow, and invoicing approved change requests.
- [ ] HR: contracts, attendance, leave, controlled employee documents and jurisdiction-configurable payroll.
  - Existing employees, attendance, payroll and commissions are an `hr` registry module (`/employees`, `/hr`) with a service-layer deactivation guard on all HR mutations. Operations no longer owns the HR paths, so the two modules can be enabled independently.
  - Leave management is implemented (`/employees/leave`): branch-scoped requests with annual/sick/unpaid/other types, inclusive day counts, overlap prevention, pending/approved/rejected/cancelled lifecycle, approval notes, yearly summary and audit entries. Permissions: `hr.leave.view`, `hr.leave.request`, `hr.leave.approve`. Tests: `test/hr-leave.test.ts`, including module deactivation.
  - Employee contracts are implemented (`/employees/contracts`): draft/active/terminated lifecycle, contract numbering, renewal with overlap prevention, expiry/expiring/effective status, termination with reason, renewal notice days, salary and currency, summary cards and audit entries. Permissions: `hr.contracts.view`, `hr.contracts.manage`, `hr.contracts.terminate`. Tests: `test/hr-contracts.test.ts`, including permissions, overlap, branch isolation, expiry and module guard.
  - Controlled employee documents are implemented (`/employees/documents`): identity, contract, certificate, medical, education and other records with issue/expiry dates, confidentiality, effective expiry/expiring status, 30-day expiry summary and archive-only lifecycle. Permissions: `hr.documents.view`, `hr.documents.manage`. Tests: `test/hr-documents.test.ts`, including permissions, branch isolation, expiry and module guard.
  - Still open: jurisdiction-configurable payroll rules.
- [x] Documents/contracts and approval workflow lifecycle.
  - Central document register with company/branch scope, immutable numbered versions, append-only `enterprise_document_events`, draft/active/archived status transitions and expiry tracking. Contracts support draft → active → terminated, renewal, auto-renew metadata, expiry/expiring status and optional linking to a same-company document. No hard-delete path.
  - Permissions: `documents.view/create/update/archive/export` and `contracts.view/create/update/terminate/export`. Enforced in `DocumentService`, not only in UI.
  - Electron-only attachment vault (`electron/documentHandlers.js`) imports a file into the app-data `documents` directory, computes SHA-256, rejects path traversal and files over 25 MB, and opens only validated storage names. The renderer never receives filesystem access.
  - Module `documents` covers `/documents` and `/contracts`; deactivation blocks new writes but keeps history readable. Tests: `test/documents.test.ts`, `test/electron-documents.test.cjs`.
  - Workflow approvals remain the existing `approvals` module; documents/contracts can now trigger approval requests via `DocumentService.requestActivationApproval` (creates an approval request; deciding it activates the contract/document). Tests: `test/document-approval-trigger.test.ts`.
- [x] Manufacturing core: BOM, work centers, production orders, material consumption, operation tracking, quality inspections and maintenance.
  - Implemented module `manufacturing` with work centers, BOM (draft/active/archived), BOM items, production orders (planned/released/in-progress/completed/cancelled), material consumption, operation completion, quality checks (incoming/in-process/final with inspected/accepted/rejected quantities) and maintenance records (preventive/corrective/predictive, scheduled/in-progress/completed/cancelled, cost tracking). Branch-scoped and audited. Permissions: `manufacturing.view`, `manufacturing.manage`. Tests: `test/manufacturing.test.ts`, `test/manufacturing-quality.test.ts`, `test/manufacturing-maintenance.test.ts`.
  - Inventory posting on completion is automated (materials consumed, finished product received, inventory transactions written). WIP valuation is available via `ManufacturingService.getWipValuation()` (in-progress/released orders with planned material cost). Quality disposition actions are available via `recordQualityDisposition` (accept/scrap/rework/return, with scrap reducing stock + inventory transaction). Quality disposition UI remains open.
- [x] Ensure deactivation restricts new operations without deleting history. Enforced by module registry guards and verified in `test/module-registry.test.ts`.

## Phase 6: Enterprise deployment

- [x] Document supported single-device SQLite deployment limits (`docs/administration-guide.md`).
- [x] Deployment scope decided: single offline workstation only. No shared authenticated API/server database will be built; installation, upgrade, backup, restore and troubleshooting live in `docs/offline-single-machine-ar.md`.
- [x] Backup, restore and recovery operations documented (`docs/administration-guide.md`, `docs/backup-and-recovery.md`); there is no server to monitor, so monitoring is limited to the in-app audit log, error log and backup verification.

## Phase 7: Validation and release

- [x] Run typecheck, all tests and production build (see latest validation).
- [x] Run Electron packaging (`npm run electron:pack` produced `release/win-unpacked`).
- [ ] Run migration/recovery checks against a production database copy.
- [x] Add cross-company isolation tests (`test/companies.test.ts`).
- [x] Add realistic-volume performance tests before claiming scalability: `test/performance.test.ts` seeds 3,000 products, 1,200 customers and 5,000 invoices and asserts bounded timings for seeding, product listing and an annual sales aggregate.
- [x] Publish operator/admin and backup/recovery documentation (`docs/administration-guide.md`, `docs/backup-and-recovery.md`).
- [x] Report only verified capabilities and measured limits.

### Latest validation (2026-10-28)

- `npm run typecheck`: passed.
- `npm test`: passed, 205 tests, 0 failures (latest run; the Electron suites add platform-conditional cases). Previous 173-test baseline plus `test/company-data-scope.test.ts` (explicit `company_id` enforcement on master data and transaction documents), service-cost assertions in `test/services-business-sales.test.ts`, `test/performance.test.ts` (500-product insert timing plus a seeded 3,000-product / 1,200-customer / 5,000-invoice volume) and `test/single-device.test.ts` (single-instance lock, offline guard, no server/sync dependencies and no renderer network calls).
- `npm run build`: passed; Vite emitted the existing `node:module` externalization notice for the browser build and a mixed static/dynamic import warning for `NotificationService`; both are non-fatal.
- `npm run electron:pack`: passed; `release/win-unpacked` contains the packaged app (Electron 45, x64). The unpacked build uses the default Electron icon and is unsigned, which is expected for an internal single-workstation install.
- `npm run electron:dist`: passed; produced `release/CeramiSys ERP Setup 1.1.3.exe` (NSIS x64, ~133 MB) and its block map. Still unsigned.
- A fresh database applies 84 migrations; production-sized migration/restore on an operator copy is still untested.
- Defect fixed while adding coverage: `PurchaseService.ensurePurchaseHasNoReturns` queried a non-existent `purchase_returns.original_invoice_id` column, so purchase deletion always failed; it now uses `original_purchase_id` (verified by the deletion path in `test/purchases-without-inventory.test.ts`).

### New migrations

- `063_module_registry_lifecycle`: append-only `module_activation_log`, typed `module_settings`.
- `064_companies_and_branch_ownership`: `companies`, `branches.company_id`, default-company seeding and backfill.
- `065_documents_and_contracts`: `enterprise_documents`, `enterprise_document_versions`, `enterprise_contracts`, append-only `enterprise_document_events`, indexes and company/branch defaults. Additive only; no historical rows are rewritten.
- `066_projects_and_hr_module_hardening`: backfills project branch ownership to the main branch, indexes `projects.branch_id`, and adds `documents`, `projects` and `hr` to an already-saved module selection so existing installations do not lose screens.
- `067_hr_leave_requests`: branch-scoped `employee_leave_requests` with lifecycle status, deciding user/note, indexes and foreign keys.
- `068_project_controls`: `project_tasks`, `project_task_dependencies`, `project_time_entries`, `project_budget_lines`, `project_risks`, `project_change_requests` and `project_deliverables`, with status/priority check constraints and indexes. Additive only.
- `069_hr_employee_contracts`: `employee_contracts` with draft/active/terminated lifecycle, branch scope, renewal notice days, termination fields and indexes. Additive only.
- `070_hr_employee_documents`: `employee_documents` with type, issue/expiry dates, confidentiality, archive status and indexes. Additive only.
- `071_manufacturing_core`: work centers, BOMs, BOM items, production orders, production order materials and operations with status constraints and indexes. Additive only.
- `072_company_scope_columns`: explicit `company_id` on core business tables with branch-derived backfill. Additive only.
- `073_manufacturing_warehouse`: `warehouse_id` on `production_orders` with default-warehouse backfill and index. Additive only.
- `074_manufacturing_quality_checks`: branch-scoped `manufacturing_quality_checks` with inspection type/result constraints and inspected/accepted/rejected quantities. Additive only.
- `075_manufacturing_maintenance`: branch-scoped `manufacturing_maintenance` with maintenance type/status constraints, work-center and branch foreign keys, cost and scheduling fields. Additive only.

- `076_company_organization_settings`: `fiscal_year_start_month`, `time_zone`, `locale`, `date_format` columns on `companies` with defaults/backfill. Additive only.
- `077_company_payroll_settings`: `payroll_tax_rate`, `overtime_multiplier`, `working_days_per_month` columns on `companies` with defaults/backfill. Additive only.
- `078_quality_disposition`: `disposition`, `disposition_qty`, `disposition_at` columns on `manufacturing_quality_checks` with defaults/backfill. Additive only.
- `079_service_cost_accounts`: seeds accounts `5102` (direct service cost, EXPENSE) and `2105` (accrued service cost, LIABILITY) so service lines post a balanced cost entry. Additive only; no existing balances change.
- `080_uom_quantity_columns`: generic `uom`/`quantity` columns on invoice/return lines, inventory transactions and warehouse stock, backfilled from the product base unit with insert/update triggers. Additive only.
- `081_company_scope_backfill`: fills missing `company_id` on company-scoped tables, adds insert triggers that inherit the branch owner (or the main company) so new rows are never invisible, and indexes the scope columns. Additive only.
- `082_journal_company_scope`: adds `journal_entries.company_id`, backfills it from the branch owner (falling back to `cmp_main`), indexes it and installs an insert trigger, so accounting reports can be scoped by legal entity. Additive only; no entry is deleted or renumbered.

### Selling in a unit other than the base unit

`src/utils/uom.ts` exposes `getSellableUnits`, `pricePerUnit` and `basePriceFromUnitPrice` alongside the existing quantity converters. The POS now keeps two quantities per line: `soldQuantity` in the unit the cashier picked (from `products.sell_unit`, `BOX`, `PIECE`, `TON`, …) and `quantityM2` in the product base unit. `createSalesInvoice` accepts `{ uom, quantity, unitPrice }`, converts them through the base unit, and stores `quantity_m2`/`quantity`/`uom` in base units with a per-base `unit_price` while computing the line total from the sell-unit arithmetic (2 boxes × 144 = 288 exactly, no rounding drift). Lines that do not send `uom` keep the legacy "already in base unit" meaning, so quick sale, imports and pre-existing documents are unaffected; returns keep working because they are based on base-unit quantities and per-base prices. Coverage: `test/sale-units.test.ts`.

Returns accept the same explicit unit: `returnSale` items may carry `{ uom, quantity }`, which `normalizeReturnUnits` converts to base units before the "not more than sold" check, so a user can return "1 box" of a piece-based product and get exactly one box's worth refunded (base quantity × base price). The returns screen exposes a per-line unit picker built from `getSellableUnits`, shows the price and line total in the chosen unit, and echoes the base-unit equivalent.

Quotations and orders use the same conversion through `resolveSaleUnits` in `src/services/sales/unitResolution.ts`: their item inputs accept `{ uom, quantity }`, store base-unit quantity and per-base price in the existing `quantity_m2`/`unit_price` columns (no schema change), and compute each line total in the entered unit. Converting a quotation to an invoice/order or an order to an invoice therefore preserves the total exactly, and the invoice inherits the product's base unit as `sold_by` (services stay on their single `SERVICE` unit). Both screens expose a per-line unit picker from `getSellableUnits` and check order availability in base units. Coverage: `test/order-quotation-units.test.ts`.

### Company scope enforcement

`072_company_scope_columns` only added the columns; the query-level enforcement now lives in `BranchAccessService.companyScope(column)` and is applied to:

- sales invoice list/detail (`sales/invoiceQueries.ts`),
- purchase invoice list/detail (`PurchaseService`),
- customer directory/detail (`CustomerService`),
- supplier directory/detail (`SupplierService`),
- product directory/detail/barcode lookup (`ProductService`),
- employee list/detail (`EmployeeService`),
- warehouse list, warehouse stock and inventory transaction history (`InventoryServicePart01`/`Part03`),
- new sales/purchase invoices and new warehouses, which stamp the owning `company_id` at creation time.

The clause is strict `company_id IN (<accessible companies>)`; `081_company_scope_backfill` filled every previously empty value (from the branch, the warehouse or the main company) and insert triggers keep new rows from becoming invisible. Central users (`branch_scope = ALL`/ADMIN) are unrestricted. Coverage: `test/company-data-scope.test.ts` (master data, warehouses in an accessible branch but a foreign company, plus transaction documents whose `branch_id` matches but `company_id` does not).

### Accounting company isolation

Journal entries carry an explicit `company_id` (`082_journal_company_scope`): `postLedgerEntry` derives it from the branch that owns the posting (`resolvePostingCompanyId`), falling back to `cmp_main`, and an insert trigger repairs any row written elsewhere. Every reader therefore filters by **branch and company together**:

- `FinancialStatementsService` — reconciliation, trial balance, income statement, general ledger, customer/supplier aging.
- `AccountingService` — P&L and trial-balance report.
- `SalesFinancialReconciliationService` — net sales/cost of sales vs the ledger, AR/AP balances and inventory value.
- `FinanceEnterpriseService` — multi-dimensional P&L and budget actuals (`FinanceEnterpriseContract01.ledgerScope`).
- `FinanceExtrasService` — journal browser; `getJournalLines` refuses an entry outside the caller's scope.

`test/company-data-scope.test.ts` posts one main-company entry, one beta entry and one mis-owned legacy row, then proves a main-company user sees revenue `100` (enterprise P&L and GL both), cannot fetch the beta entry's lines, and that a central user still sees `450` across all three.

### Cycle audit

`test/cycle-audit.test.ts` audits the sale, purchase, inventory and accounting cycles against each other rather than in isolation:

- **Sale cycle:** document numbering (`INV`/`RET`/`REC`/`TX-SALE`), header totals vs lines, exactly one stock movement per invoice, ledger debit to AR equal to the unpaid remainder, cash equal to the paid amount, revenue credited in full, customer balance equal to the remainder, receipt allocation rows, over-allocation rejected atomically, proportional cash refund on returns, and "return more than sold" rejected with no writes.
- **Purchase cycle:** PO → GRN → supplier invoice, stock moved once by the GRN only, AP credited with the full invoice while inventory is debited with the received value, supplier balance equal to the remainder, three-way matching (`MATCHED`, `PRICE_VARIANCE` = price delta × invoiced qty, `QTY_VARIANCE` = quantity delta × price), over-receipt rejected without stock changes, and receiving the remainder closes the order.
- **Inventory:** warehouse stock only moves through inventory transactions (deltas reconcile), transfer legs cancel out, reservations never exceed on-hand and release cleanly, and no row has `reserved_m2 > quantity_m2`.
- **Accounting:** every posted journal entry balances against its header, the trial balance sums to zero, each `chart_of_accounts.balance` equals its posted movement, and a closed `accounting_closed_until_date` blocks a sale with a full rollback (no invoice, no stock change).

The audit also exposed a real defect: `transferStock` passed the human-readable `TX-TRF-IN-…` number as `inventory_cost_layers.source_transaction_id`, which has a foreign key to `inventory_transactions.id`. Every FIFO transfer therefore failed with `FOREIGN KEY constraint failed`. `InventoryServicePart03` now records the actual transaction ids, so transfers under the default FIFO costing method post correctly.

### Business profile attributes

`BusinessProfileService` turns `businessConfig.productAttributes` into real `attributes` rows, so selecting a profile (setup wizard or admin settings) yields a product form with the expected fields. The code is deterministic from the name, re-applying a profile is idempotent, and manually created attributes are never removed. Existing installations are healed lazily when a user with `products.create` opens the products page. Coverage: `test/business-profiles.test.ts`.

### Backup restore and packaging

`test/backup-restore.test.ts` restores a real backup taken after a posted sale: it stubs the desktop backup API, verifies the `pre_restore` snapshot is written first, restores the file, and then proves the post-backup sale is gone, stock and invoices equal the snapshot, `PRAGMA integrity_check` is `ok`, the migration history survives, a corrupt file is refused without swapping the live handle, and sales still post afterwards. `test/performance.test.ts` now also times receivables aging over 5 000 invoices (the heaviest dashboard read) and the invoice list.

Packaging was verified end to end with `electron-builder`: `--dir` produces `release/win-unpacked` and `--win nsis` produces `release/CeramiSys ERP Setup 1.1.3.exe` (~133 MB plus a blockmap), with `dist/index.html`, `electron/main.js` and `package.json` inside `app.asar`. `release/` is git-ignored. Known gaps recorded rather than hidden: the installer uses the default Electron icon (no `.ico` in the repo) and is unsigned.

### End-to-end tests (Playwright + Electron)

`npm run e2e` builds the bundle and drives it inside Electron with Playwright (`e2e/app.spec.ts`):

1. **Fresh installation** — the app opens the login screen, `admin` logs in, and the first-run setup wizard appears (no products, no invoices).
2. **Existing installation** — a prepared data directory (migrated database with `setup_completed = '1'`) logs straight into the dashboard, the setup wizard is absent, and hash routing loads the sales screen.
3. **Packaged build** — launches `release/win-unpacked/CeramiSys ERP.exe`, i.e. the exact payload the installer ships from `app.asar`, and reaches the dashboard.

Two small testability hooks were added to `electron/main.js`: `CERAMISYS_USER_DATA_DIR` redirects the profile to a throwaway folder (so a test never touches a real installation's data), and `CERAMISYS_E2E=1` suppresses DevTools. Production behaviour is unchanged when the variables are unset.

### Verification log (latest)

- `npm run typecheck` ✅
- `npm test` ✅ 224 tests / 0 failures
- `npm run build` ✅
- `npx electron-builder --dir` / `--win nsis` ✅
- `npx playwright test` ✅ 3/3