# Authorization Inventory

Generated from the current checkout by inspecting `PermissionService.require` / `AuthService.requireAuth` usage per service. This is a point-in-time inventory, not a certification that every path is correct.

## Enforcement model

1. **Route/navigation**: `App.tsx` redirects unauthorized or disabled-module routes; `NavigationService.getRequiredPermission` maps paths to permission codes. This is UX, not the security boundary.
2. **Service**: `PermissionService.require(user, code)` throws and writes a SECURITY audit entry on failure. Mutations in most domains use this.
3. **Branch scope**: `BranchAccessService.sqlScope` / `requireBranchAccess` restrict queries and mutations. Central access requires `branches.access_all`.
4. **Company scope**: `BranchAccessService.getAccessibleCompanyIds` + `CompanyService`/`BranchService` enforce legal-entity ownership. Documents and contracts filter on their explicit `company_id`; most legacy domains inherit company scope through their branch/warehouse filters.
5. **Module lifecycle**: `ModuleRegistryService.assertModuleEnabled` blocks new operations when a module is disabled (purchasing, sales, approvals, operations, inventory).
6. **Business profile**: `ModuleRegistryService.isInventoryTracked()` makes sales, returns and voids skip stock checks, stock movements, batches and inventory cost postings when the business profile does not track inventory (services, professional services, logistics, education, healthcare administration). Line costs stay recorded; invoice-level cost/margin and the inventory ledger stay at zero because there is no stock asset to relieve. Independently of the profile, a service line (product type or base unit `SERVICE`) never moves stock in a mixed business such as a restaurant or workshop.
7. **Export/print**: `ExportService.assertAllowed` is invoked by the shared export helpers whenever a document declares a `permission`, so bulk extraction is checked at export time rather than only by hiding buttons.
8. **Database boundary**: renderer never provides SQL; the service layer queries through `DatabaseManager` with parameter binding.

## Coverage by domain

| Domain | Mutations | Reads | Notes |
| --- | --- | --- | --- |
| Sales invoices | `sales.create`, `sales.void`, `sales.refund`, `sales.discount`, `sales.credit`, `sales.approve` checked in `src/services/sales/*`; `ModuleRegistryService.assertModuleEnabled('sales')` on create/payment/return | `sales.view` enforced in `SalesService` for invoices, stats, payments, returns and returnable items | Reads now fail closed. Internal mutation flows use a private `readInvoice` that skips only the read permission, not authentication/scope. Module guards block new sales operations while leaving history readable. |
| Sales returns | `sales.refund` in `src/services/sales/returns.ts`; module guard | `sales.view` | Same enforcement as invoices. |
| Sales payments | `customers.payment`, `customers.payment.reverse` | branch scoped | Good. |
| Purchasing | `purchases.create/delete/approve`, `suppliers.payment`; module guard | `purchases.view` on invoice list/detail; internal mutation reads bypass only the view check | Three-way matching lifecycle covered by tests. |
| Suppliers | `suppliers.create/update/payment` | `suppliers.view` on details/statements/allocations; the supplier directory additionally allows `purchases.create`/`purchases.view` | Directory access lets purchase clerks pick a supplier without exposing statements or balances. |
| Inventory | `inventory.adjust/transfer/count/view` across `InventoryServicePart*`; `ModuleRegistryService.assertModuleEnabled('inventory')` on every stock mutation | `inventory.view` / branch scoped | Module guard added this increment; reads and history stay available while disabled. |
| Operations (branches, warehouses, fleet, deliveries) | `branches/warehouses/drivers/vehicles/deliveries.manage`; `ModuleRegistryService.assertModuleEnabled('operations')` on every mutation | `*.view` permissions | Module guard added this increment; history remains readable when disabled. |
| Finance/accounting | `finance.*`, `audit.view` for audit, `settings.backup` for backups | `finance.view` | Ledger writes are transactional and balanced (tested). |
| HR/payroll | `employees.*`, `payroll.*` in `EmployeeService`/`OperationsService`; `hr` module guard | branch scoped | Jurisdiction-specific payroll rules are not implemented. |
| HR leave | `hr.leave.request`, `hr.leave.approve`; `hr` module guard on writes | `hr.leave.view`; branch scoped | Inclusive day counts, overlap prevention and pending/approved/rejected/cancelled lifecycle. Approvers cannot decide a request outside their branch; cancellation is limited to the requester or an approver. |
| HR contracts | `hr.contracts.manage`, `hr.contracts.terminate`; `hr` module guard on writes | `hr.contracts.view`; branch scoped | Draft/active/terminated lifecycle, renewal with overlap prevention, effective expiry/expiring status, termination reason and audit entries. Termination is a separate permission from creation/renewal. |
| HR documents | `hr.documents.manage`; `hr` module guard on writes | `hr.documents.view`; branch scoped | Employee document metadata with type, issue/expiry dates, confidentiality, effective expiry/expiring status, 30-day expiry summary and archive-only lifecycle. |
| Projects | `projects.create/update/delete`; `projects.approve` for change-request decisions; `projects` module guard on writes | `projects.view`; branch scoped | Creation assigns the actor's accessible branch. Cross-branch reads return no record. Deletion is refused while non-void sales invoices reference the project. Tasks, dependencies, time, budgets, risks, change requests and deliverables all validate project ownership and write audit entries. Task dependencies reject duplicates, self-links and cycles. |
| Manufacturing | `manufacturing.manage`; `manufacturing` module guard on writes | `manufacturing.view`; branch scoped | Work centers, BOM lifecycle, production order release/start/completion/cancellation, material consumption, operation completion, quality inspections and maintenance records. Inventory posting on completion is automated (materials consumed, finished goods received). |
| CRM | `customers.*`, `crm.*`; module guard on create | branch scoped | Read permissions present on page level. |
| Approvals | `approvals.view/create/approve/reject/cancel`; module guard | branch scoped | Optional segregation of duties: when `approvals.requireSegregationOfDuties` is enabled, a requester cannot decide their own request. Default is off to preserve legacy behavior. |
| Settings | `settings.update`, `settings.backup` | `settings.view` |  |
| Companies | `companies.view/create/update/delete` | company scope | New in this increment. |
| Module registry | `modules.view`, `modules.manage` | settings read | New in this increment. |
| Documents | `documents.create/update/archive`; module guard on writes | `documents.view`; company scope before branch scope | Versions and events are append-only; archive is a status change, not deletion. Attachment import/open is Electron-only and validated by storage-name pattern and directory containment. |
| Contracts | `contracts.create/update/terminate`; module guard on writes | `contracts.view`; company scope before branch scope | Draft → active → terminated lifecycle, renewal and expiry calculations. Terminating requires a reason and does not delete the record. |
| Printing / ESC-POS | no service permission checks; receipt printing follows document read permissions | n/a | Report/analysis exports declare `sales.export`, `reports.export`, `products.export`, `customers.export`, `purchases.export`, `suppliers.export`, `finance.export` or `employees.export`; receipt/document printing is intentionally not treated as bulk export. |
| Notifications | no service permission checks | n/a | **Gap**: user-scoped queries only. |
| Data administration | `admin.data`, `admin.data.export/delete` |  |  |

## Confirmed gaps / next work

1. Declare an export permission on the remaining bulk-export screens (POS/sales lists, inventory lists, audit log, data administration, daily operations); the shared helper already enforces it when declared. New `purchases.export`, `suppliers.export`, `finance.export` and `employees.export` codes were added, and a one-time backfill grants each new export code to roles that already had the matching `*.view` permission, so upgrades do not remove anyone's ability to export.
2. Add module guards to reports (reports exposes no mutation paths today).
3. Extend segregation of duties beyond self-approval: configured sensitive types and amount thresholds.
4. Add `inventory.view` checks to inventory read paths that currently rely on authentication and branch scope only, allowing the stock reads needed by POS and purchasing internals.
5. Extend explicit `company_id` scope to the remaining organization-level tables; sales/purchase invoices, customers, suppliers and products now filter on it directly, while other legacy domains still inherit company scope through their branch.
6. Service lines now post a balanced direct-cost entry (`5102` debit, `2105` credit) when inventory tracking is on, and return/void reverse it. Stock valuation still reports zero stock for a no-inventory business, which is correct rather than a gap.

## Tests that exercise authorization

- `test/permissions.test.ts` – role/override resolution and service guards.
- `test/branch-access.test.ts`, `test/branch-scoped-pages.test.ts` – branch scope enforcement.
- `test/companies.test.ts` - company creation, hierarchy guards and cross-company isolation.
- `test/company-data-scope.test.ts` - customers, suppliers, products, sales and purchase invoices are filtered by `company_id`; a document with a visible branch but a foreign company stays hidden, while central access keeps full visibility.
- `test/module-registry.test.ts` – module permission and lifecycle guards.
- `test/sales-authorization.test.ts` – sales reads deny without `sales.view`; sales mutations blocked while the module is disabled.
- `test/approval-controls.test.ts` – segregation-of-duties self-approval block, opt-in.
- `test/operations-module-guard.test.ts` – operations mutations blocked when the module is disabled, history preserved.
- `test/inventory-module-guard.test.ts` – stock mutations blocked when the inventory module is disabled.
- `test/purchasing-authorization.test.ts` – purchase/supplier reads deny without view permissions, while the supplier directory stays available to purchase clerks.
- `test/export-authorization.test.ts` – export helper refuses documents whose declared permission is denied, legacy documents keep building, and new export codes are backfilled once for roles that already had the matching view permission.
- `test/services-business-sales.test.ts` - every services-style preset sells, returns and voids without stock or inventory postings; a mixed business sells service lines without stock while real goods still require it once tracking is on; service products default to the profile unit.
- `test/product-units.test.ts` – service units read as «خدمة» and the product form starts neutral (no ceramic size/thickness/prices) for non-ceramic types while ceramics keep their defaults.
- `test/purchases-without-inventory.test.ts` – a no-inventory custom profile records and deletes a purchase and a goods receipt without stock or cost layers, and refuses opening stock.
- `test/documents.test.ts` – document/contract permission denial, company and branch isolation, immutable versions, lifecycle transitions and module-deactivation guards.
- `test/electron-documents.test.cjs` – the Electron vault limits size, hashes the copy and rejects traversal/non-vault storage names.
- `test/projects.test.ts` – project permission denial, branch isolation, deletion guard, projects/HR module deactivation and HR write blocking.
- `test/project-controls.test.ts` – task dependencies and cycle rejection, budget totals/variance, time entry validation and summary, change-request approval permission, risk/deliverable lifecycle, branch isolation and module guard for controls.
- `test/hr-leave.test.ts` – leave request lifecycle, overlaps, approval permissions, branch isolation and module guard.
- `test/hr-contracts.test.ts` – contract lifecycle, renewal/overlap, permissions, branch isolation, effective expiry and module guard.
- `test/hr-documents.test.ts` – document expiry/archive, permissions, branch isolation and module guard.
- `test/manufacturing.test.ts` – work-center branch scope, BOM lifecycle, production order lifecycle, permissions, cancellation and module guard.
- `test/security-accounting-audit.test.ts` – accounting audit trail and denial paths.
- `test/electron-handlers.test.cjs`, `test/electron-security.test.ts` – IPC sender validation and exposed API surface.
