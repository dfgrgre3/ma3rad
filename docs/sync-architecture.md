# Offline-First Multi-Branch Synchronization — Current Status

## Overview

The application remains an offline-capable Electron desktop app with a
renderer-owned SQLite database implemented by `sql.js`. A built-in Node HTTP
relay and HTTPS-only inter-site client are now available in the Electron main
process. The relay uses a separate append-only, AES-GCM-encrypted journal; it
never exposes or opens the business database file.

An optional PostgreSQL-backed event relay is also available in `sync-server/`
for a customer-managed VPN server. It implements the same push/pull protocol
with durable event and policy tables. It does not change the local SQLite
databases into a central ERP database or add new domain handlers.

This is a partial multi-branch synchronization implementation, not a
production-wide ERP sync. Transactional outbox capture and inbound handlers
cover categories, brands, products, customers, and suppliers. Sales invoices,
invoice voids, and sales returns can also be synchronized as read-only report
snapshots in a separate remote-record store. These snapshots never create
local invoices, cash movements, customer balances, inventory movements, or
ledger entries. Detailed payment references, purchasing, inventory, employee,
settings, and attachment data are not synchronized.

## Target decisions

- Support both one-device branches and a local-server/multiple-client branch.
- Use a customer-operated WireGuard VPN for inter-site traffic where a
  reachable route exists; do not assume it solves NAT/CGNAT or add a hosted
  relay.
- Define authority and conflict handling per entity before enabling sync.

The business database remains renderer-owned. The new relay is a distinct
service boundary that persists only validated sync events; it does not apply
business writes. This avoids exposing the database, but does not replace the
future need for transactionally integrated domain handlers.

## Layers

1. Desktop UI — React in the Electron renderer.
2. Application services — selected master-data mutations write sync events in
   the same transaction as their local database changes.
3. Local persistence — `sql.js` SQLite database, with migrations and Electron file persistence.
4. Sync schema — outbox, inbox, cursor, registries, tombstones, and audit tables.
5. Sync classes — `src/sync/*`; an Electron IPC transport delegates network access to the main process.
6. Electron — persists the database, runs the optional relay/client, and blocks renderer network requests.
7. Packaging — existing Electron Builder/NSIS configuration; clean-machine sync setup has not been tested.

## Database tables

- `sync_outbox` — pending/failed/acknowledged events.
- `sync_inbox` — received events with deduplication.
- `sync_cursor` — per-scope pull cursor.
- `sync_branches` — registered branches.
- `sync_devices` — registered devices.
- `sync_tombstones` — tombstone schema; the current master-data handler carries deletions in the event payload.
- `sync_audit_log` — audit trail.
- `sync_entity_versions` — latest synchronized version per tenant/entity.
- `sync_conflicts` — open conflicts and their local/remote snapshots.
- `sync_bootstrap_progress` — resumable cursor for initial publication of existing master data.
- `sync_entity_policies` — administrator settings for supported entity types, direction, and visibility scope.
- `sync_remote_records` — immutable received sales-document event history.
- `sync_remote_entities` — latest sales report snapshot per source branch and document.

## Implemented foundation (`src/sync`)

The repository provides the listed classes and schema tables. It supports
persisting an outbox event in a caller-owned database transaction, recovering
interrupted in-flight events, retryable failed inbox application, batch
acknowledgement checks, and cursor advancement only when pulled events apply.
Outbox batches retain database enqueue order so entity versions and bootstrap
parent records are not reordered by timestamp ties or random event IDs.
An event also waits for every older unacknowledged event for the same tenant
entity, including events in retry backoff or dead-letter state, so a later
snapshot cannot overtake a delayed earlier version. Product events wait for
older category and brand events to be acknowledged so foreign-key parents are
present before products are applied.
Inbox insertion is conflict-safe by event ID, rejects reuse of an ID with
different event content, and prevents duplicate dispatch while one engine
instance is already applying that event. The foundational inbox workflow does
not itself make arbitrary business handlers atomic with inbox status, or
coordinate processing across separate application processes; the five
master-data handlers do persist their changes and applied status atomically.
Events carry a `TENANT` or `BRANCH` visibility scope; the safe default is
`BRANCH`. The relay enforces
device-bound tenant/branch identity, hides branch-scoped events from other
branches, and allows explicitly authorized head-office devices to read them.
It rejects sensitive credential-like payload keys, caps batches and payloads,
and encrypts its durable journal with an OS-protected key.

When complete client settings are supplied, the worker registers inbound
handlers for categories, brands, products, customers, and suppliers. Their
create/update/delete events are captured by the corresponding application
services in the same SQLite transaction as the business mutation. Inbound
snapshots use per-entity allowlists; account balances, purchase/sales totals,
product stock, and product image paths are intentionally excluded. Out-of-order
versions, concurrent edits, and incompatible local records are recorded as
conflicts rather than silently overwriting the local row. Administrators with
`admin.view` can review and resolve these conflicts from
`/admin/sync-conflicts`; accepting a remote snapshot or keeping a local
snapshot also records the chosen state for propagation.

Administrators can begin publishing the existing master-data directory from
the same page. This is an explicit, resumable operation with batches of at
most 100 records; categories and brands are published before dependent
products. It publishes customer and supplier contact data tenant-wide, so the
page requires confirmation before the first batch. It does not publish stock,
account balances, images, or non-master-data history.

The administration page also exposes per-entity enablement, outbound and
inbound switches, and `TENANT`/`BRANCH` visibility for the five supported
master-data entity types and read-only sales-invoice/return report snapshots.
Sales snapshots use field allowlists and are captured in the same transaction
as invoice creation, voiding, or return creation. Inbound snapshots are
validated, deduplicated, and stored atomically with inbox application in the
separate report tables; they are never applied to operational sales tables.
Sales policies are disabled by default on new installs. Customer/supplier
contact sharing and tenant-wide sales report sharing require explicit
confirmation before outbound sync is enabled. Policies are stored in the local database. A
disabled inbound event is durably retained in the inbox and applied when the
policy is re-enabled. Policy changes reset that entity's bootstrap cursor.
The configured head-office device publishes policy changes as tenant-scoped
events. The relay accepts these events only from device tokens configured
with `canManageSyncPolicies: true`; other devices retain the events locally
until the head office publishes their policies. The client must also set
`CERAMISYS_SYNC_POLICY_AUTHORITY=true` to expose policy editing in the UI.
Other entity types cannot be enabled from this page because their
business-safe capture and inbound projection handlers do not exist yet.

This limited integration does not make the overall system production-ready.
Other business mutations are not connected to the outbox, and there are no
financial/inventory handlers or complete cross-device reconciliation workflow.
Branch/device registries remain local database records; the relay's per-device
bearer-token list is configuration, not an enrollment/revocation workflow.
Health is logged, not presented in an administration screen.

## Relay protocol

- `POST /sync/push` — authenticated event batches with per-event acknowledgement.
- `GET /sync/pull?scope=<tenant>&cursor=<sequence>&limit=<n>` — authorized
  events and the next durable sequence cursor.
- `GET /health` — unauthenticated liveness only; it exposes no tenant data.

The relay authenticates bearer tokens using constant-time comparisons, binds
each token to one tenant, branch, and device, limits failed authentication
attempts, and requires TLS for non-loopback listeners. `TENANT` events are
visible within their tenant; `BRANCH` events are visible only to devices in
their source branch and authorized head-office devices. The relay does not
provide user-level permission checks, token enrollment UI, token rotation, or
revocation.

## Local configuration

The current opt-in setup uses Windows environment variables (restart the app
after changing them). A branch client needs all of:

- `CERAMISYS_SYNC_URL` — the trusted HTTPS relay URL.
- `CERAMISYS_SYNC_TOKEN` — a unique random token with at least 32 bytes.
- `CERAMISYS_SYNC_TENANT_ID`, `CERAMISYS_SYNC_BRANCH_ID`,
  `CERAMISYS_SYNC_DEVICE_ID` — stable assigned identities.

An instance that hosts the relay additionally sets
`CERAMISYS_SYNC_CLIENTS` to a JSON array of authorized device entries with
`token`, `tenantId`, `branchId`, `deviceId`, and optional
`canReadAllBranches: true` for head-office readers or
`canManageSyncPolicies: true` for the single policy-authority device. It may set
`CERAMISYS_SYNC_HOST` (defaults to `127.0.0.1`), `CERAMISYS_SYNC_PORT`
(defaults to `47821`), `CERAMISYS_SYNC_TLS_CERT`, and
`CERAMISYS_SYNC_TLS_KEY`. The relay journal is written under the app's local
data directory and must be included in an operator-managed backup plan.

These settings are an interim deployment mechanism; there is no in-app branch
setup, pairing, token issuance, or certificate management screen yet. Never
put bearer tokens in source control or expose an untrusted listener.

## Delivery semantics

The intended semantics are at-least-once delivery with idempotent processing.
The five implemented master-data handlers apply each event and record its
inbox status in the same SQLite transaction; event-ID deduplication prevents
reapplying an already recorded event. Other event types still have no business
handler. An HTTP success response is not proof of application; acknowledgements
must be per event.

## Conflict policy

`MasterDataSyncService` records version gaps, stale/concurrent changes, and
incompatible local records in `sync_conflicts`; an operator can keep the local
snapshot or accept the remote snapshot through its API. This is not yet a
conflict-review UI or a complete authority policy. `ConflictResolver` remains
a policy-label helper for other entity types. Financial and inventory conflict
policies must be designed and tested before those entities are synchronized.

## Retry

The retry helper calculates exponential backoff with jitter and recognizes
some transient errors. The transport does not currently expose `Retry-After`;
dead-letter reprocessing and operational alerts are not connected to a UI.

## Network connectivity

Renderer networking remains blocked. Only the Electron main process makes
outbound sync requests. The relay binds to loopback by default; a LAN listener
requires explicit configuration and TLS certificate/key files. WireGuard can
protect inter-site routes without a paid relay but cannot create reachability
through CGNAT by itself. Public addressing, router configuration, or a
customer-operated reachable endpoint may still be required.

## Windows integration

Electron has a single-instance lock and the existing installer bundles the
runtime. The optional relay is hosted by the running desktop process, not
installed as a Windows service; the app must remain open on the relay machine.
The worker is stopped and awaited before the renderer flushes its database on
graceful close.

## Backup & restore

Outbox, inbox, and cursor tables are in the business SQLite database. The relay
journal is a separate encrypted file and needs explicit local backup coverage.
A tested cross-device restore/reconciliation procedure is not implemented;
restoring an old database can also restore stale cursors, and the OS-protected
journal key is device-bound.

## Licensing / cost

No new package or SaaS dependency was added for the relay; it uses Node's
built-in HTTP/TLS/crypto APIs and the existing SQLite/sql.js foundation. A full
direct/transitive license inventory has not been produced. Software licensing
does not remove operational costs for network access, public addressing, VPN
setup, certificates, hardware, or support.

## Required work before production use

1. Add an in-app setup flow for the documented topology and securely issue,
   rotate, and revoke per-device credentials.
2. Add integration tests for independent branch databases and relay-mediated
   exchange, then complete transactionally integrated handlers for each
   additional in-scope entity, with duplicate-effect and conflict tests.
3. Extend the event model for per-user permissions, settings
   versions, and resumable attachments before claiming those are synchronized.
4. Add dead-letter repair, sync-health UI, safe diagnostics,
   backup/restore reconciliation, and network configuration instructions.
5. Add multi-process/two-installation, authorization, outage, restore, and clean
   Windows installation tests. Audit all shipped dependency licenses and
   resulting operating costs.
