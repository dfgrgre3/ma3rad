# Operator and Administrator Guide

This guide describes behavior that exists in the current codebase. It does not claim capabilities that are not implemented.

## 1. Sign-in and roles

- Users authenticate against the local database. Passwords are hashed; the built-in `admin` account must change its default password during setup.
- Permissions are resolved from built-in/custom roles plus per-user `GRANT`/`DENY` overrides. A user-level `DENY` always wins.
- The permission catalog is the source of truth (`src/services/PermissionService.ts`). Administrators can assign permissions in **Users → Permissions**. Built-in roles are ADMIN, MANAGER, ACCOUNTANT, SALES, CASHIER and WAREHOUSE.
- Authorization is enforced in services (`PermissionService.require`) and again in route/navigation guards. Hiding a button is not the security boundary.
- Branch scope: each user has `branch_scope = ALL` (central, requires `branches.access_all`) or `ASSIGNED` with rows in `users_branches`. Queries in finance, inventory, sales and purchasing are branch-scoped through `BranchAccessService`.

## 2. Companies and legal entities

- **Business settings → Companies** lists every company inside the signed-in user's scope.
- `companies.view`, `companies.create`, `companies.update` and `companies.delete` control access. ADMIN receives all four; MANAGER receives all except deletion by default.
- Creating a company requires a unique 2–20 character code (`A–Z`, `0–9`, `-`, `_`) and a name.
- Company hierarchy supports a parent company. Circular ownership is rejected.
- A company cannot be deactivated while it has active branches or active child companies. Deactivation never deletes historical records.
- New branches inherit the creator's company unless an explicit `companyId` is supplied. Company scope is derived from accessible branches, so a user restricted to one branch cannot read or mutate another company's records through `CompanyService` or `BranchService`.
- Every existing branch was backfilled to the seeded `cmp_main` company by migration `064_companies_and_branch_ownership`; no historical row is rewritten.

## 3. Business profiles and modules

Industry profiles (`src/config/businessProfiles.ts`) configure defaults only: units, product attributes, inventory tracking and the starting module set. They do not change historical transactions.

The module registry (`src/config/moduleRegistry.ts`) defines, for each module:

- id, label and description;
- dependencies;
- required permission codes;
- owned route prefixes;
- business events;
- configuration schema (typed settings with defaults);
- activation rules.

Administrators change modules in **Business settings → Business and modules**:

1. Selecting a module automatically includes its dependencies.
2. Validation refuses unknown modules, missing dependencies and modules whose activation rule is unmet (for example inventory when inventory tracking is off).
3. Deactivation is refused when another enabled module depends on it, or when live work would break (pending approval requests for the approvals module).
4. Saving writes the selection, navigation visibility and an append-only row in `module_activation_log` in one database transaction, then writes an audit entry.
5. Deactivation hides screens and blocks new operations at the service layer (purchasing, sales, approvals, operations, inventory, documents, projects and HR call `ModuleRegistryService.assertModuleEnabled`). Historical data is retained and reports can still read it.

The `operations` module owns branches, warehouses, fleet and deliveries. The separate `hr` module owns employees, attendance, payroll, commissions and leave, so the two can be enabled independently.

Module settings live in `module_settings` and fall back to registry defaults when unset. Writes are permission-checked (`modules.manage`) and type-validated.

| Module | Depends on | Required permission |
| --- | --- | --- |
| sales | customers | `sales.view` |
| inventory | — (requires inventory tracking) | `inventory.view` |
| customers | — | `customers.view` |
| purchasing | finance | `purchases.view` |
| finance | — | `finance.view` |
| operations | — | `branches.view` |
| reports | — | `reports.view` |
| approvals | — | `approvals.view` |
| documents | — | `documents.view` |
| projects | customers | `projects.view` |
| hr | finance | `employees.view` |

## 4. Documents and contracts

- The **Documents** and **Contracts** screens are enabled by default for every business profile and can be disabled from **Business settings → Business and modules**. Disabling blocks new writes and hides the screens; existing documents, versions, events and contracts remain readable through the service layer.
- Documents belong to a company, optionally to a branch. A user restricted to one company or branch cannot read or create records for another company, even without a branch assignment.
- `documents.view/create/update/archive/export` control access. ADMIN receives all; MANAGER receives view, create, update, archive and export; ACCOUNTANT receives view and export; SALES, CASHIER and WAREHOUSE receive view only by default. Per-user `GRANT`/`DENY` overrides apply as usual.
- Document numbering is automatic (`DOC-YYYY-NNNNNN`) unless an explicit number is supplied. Explicit numbers are unique per company, not globally.
- Versions are immutable and numbered. Adding a version never rewrites an earlier one, and every create, update, version, status change, activation, renewal and termination appends a row to `enterprise_document_events`.
- Document status flows between draft, active and archived. Archived documents reject new versions and edits but can be restored to active; there is no hard-delete action.
- `contracts.view/create/update/terminate/export` control contract access. Contracts track party, dates, value, currency, auto-renew metadata and renewal notice, and can link to a document in the same company.
- Contract status is stored as draft/active/terminated while the effective status also reports scheduled, expiring and expired based on dates and `renewalNoticeDays`. Termination requires a reason and preserves the record.
- In Electron, attachments are copied into the application-data `documents` folder, hashed with SHA-256 and limited to 25 MB. The renderer receives only a validated storage name; it never gets direct filesystem access. The browser fallback has no file vault, so attachment controls are hidden there.

## 5. Projects

- The **Projects** screen is enabled by default and owned by the `projects` module. Disabling it blocks new project, unit and product-line writes while existing projects remain readable.
- `projects.view` controls reads and `projects.create/update/delete` control mutations. ADMIN receives all; MANAGER and SALES receive view/create by default. Deletion is restricted to roles with `projects.delete` (ADMIN by default).
- A new project is assigned to the actor's accessible branch unless an explicit branch is supplied. Users restricted to one branch cannot list or open another branch's projects.
- Project deletion is refused while non-void sales invoices reference the project; close the project instead of deleting it.
- Units must belong to the same project, and product lines can only reference units from that project.
- **المتابعة والميزانية** on the project detail page covers the operational controls:
  - **المهام**: title, assignee, priority, dates and status. Dependencies are added between tasks in the same project; duplicates, self-links and circular chains are rejected. Completing a task sets its progress to 100% and records a completion time.
  - **الميزانية**: category lines with planned and actual amounts. The summary shows planned total, actual total, variance and the remaining contract value.
  - **الوقت**: dated hours per task or standalone, marked billable or not. Only 0–24 hours per entry are accepted, and the summary totals billable and non-billable hours by task.
  - **المخاطر**: severity, probability, owner, mitigation and status (open, mitigated, accepted, closed).
  - **طلبات التغيير**: cost and time impact with a pending → approved/rejected/cancelled lifecycle. Decisions require `projects.approve`; ADMIN receives it by default and administrators can grant it to other roles.
  - **المخرجات**: due date, delivery and acceptance timestamps, and status.
- All control writes are branch-scoped and audited. Every control remains readable when the `projects` module is disabled, but new writes are refused.

## 6. HR and leave

- The `hr` module owns employees, attendance, payroll, commissions and leave. It depends on `finance` because payroll posts ledger entries. Disabling HR blocks employee, attendance, payroll and leave writes while reads remain available.
- **Employees → Leave** lists branch-scoped leave requests. `hr.leave.view` controls reads, `hr.leave.request` allows creating requests, and `hr.leave.approve` allows approving or rejecting.
- Leave types are annual, sick, unpaid and other. Day counts are inclusive. A request cannot overlap another pending or approved request for the same employee.
- Request lifecycle: pending → approved/rejected, and pending or approved → cancelled. Approval can carry a note; cancellation is limited to the requester or a user with approval permission. Every action writes an audit entry.
- The dashboard summary counts pending requests and approved leave days for the current calendar year by type. It is a used-days summary, not a statutory entitlement calculation.
- **Employees → Contracts** lists branch-scoped employee contracts. `hr.contracts.view` controls reads, `hr.contracts.manage` allows creating drafts, editing drafts, activating and renewing, and `hr.contracts.terminate` allows terminating an active contract.
- Contracts are created as drafts with an automatic `CON-YYYY-NNNNNN` number. Activation requires no overlapping active contract for the same employee and records a signed date. Renewal requires a new end date after the current term and keeps the contract active.
- Effective status is calculated from dates: scheduled, active, expiring (within `renewalNoticeDays`), expired and terminated. Summary cards report active, expiring, expired and draft counts.
- Termination requires a reason and records the termination date; terminated contracts cannot be renewed or edited. Drafts can be deleted, but active and terminated contracts are retained. Every action writes an audit entry.
- **Employees → Documents** records controlled employee documents (identity, contract, certificate, medical, education, other) with issue/expiry dates, confidentiality and archive-only lifecycle. Expired documents are detected automatically and surfaced in the 30-day expiry summary. `hr.documents.view` controls reads and `hr.documents.manage` controls creation and archiving. Every action writes an audit entry.

## 7. Manufacturing

- The `manufacturing` module depends on `inventory`. It is enabled by default for inventory-tracking profiles and can be disabled otherwise.
- **Manufacturing** manages work centers, bills of materials (BOM), production orders and quality inspections. BOMs are created as drafts with at least one component and must be activated before use.
- Production order lifecycle: planned → released → in progress → completed or cancelled. Materials are copied from the BOM with planned quantities; consumption is recorded per material. Operations can be tracked per work center with planned and actual minutes.
- Completing an order consumes planned materials from the selected warehouse, receives the finished product into stock, and writes inventory transactions for both movements.
- Quality inspections (incoming, in-process, final) record inspected/accepted/rejected quantities per production order and are branch-scoped.
- `manufacturing.view` controls reads and `manufacturing.manage` controls writes. ADMIN and MANAGER receive both by default; ACCOUNTANT receives view only.
- Work centers and production orders are branch-scoped. Every action writes an audit entry.

## 8. Daily administration

- **Backup**: see `docs/backup-and-recovery.md`.
- **Audit log**: sensitive actions (settings, company and module changes, financial postings, permission changes) append to `audit_logs`. Entries record actor, action, module, entity id, before/after values and timestamp. Passwords and secrets are never logged.
- **Custom roles**: create a role, assign permission codes, then assign the role to users. Permission cache invalidates on role/override changes.
- **Changing business type**: only defaults change. Existing records keep their original meaning; a confirmation is required before saving.

## 9. Known operational limits

- Persistence is a single-device sql.js SQLite database inside Electron (with a browser-storage fallback for development). It is **not** a concurrent multi-workstation server deployment.
- There is no authenticated remote API, no server-side scheduler, and no multi-device conflict resolution. The supported deployment is **one installer, one workstation, one database file** (see `docs/offline-single-machine-ar.md`). A shared server database is out of scope by product decision, not a pending feature.
- Barcode, printing, backup paths and auto-backup depend on Electron APIs; the browser fallback is intentionally reduced.
- Backup/restore covers the SQLite database, not the Electron document vault. Copy the application-data `documents` directory together with the database backup, or attachments will be missing after restore.
- Backup/restore was unit-tested for encryption and integrity verification; it has not been exercised against a production-sized operator database in this repository.
- Performance is covered by `test/performance.test.ts` with a seeded 3,000-product / 1,200-customer / 5,000-invoice volume, but not by long-running load tests on operator hardware.
