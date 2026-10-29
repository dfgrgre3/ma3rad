# Central PostgreSQL sync service

The repository now includes a PostgreSQL-backed durable event relay in
`sync-server/`. It implements the existing device-authenticated
`/sync/push` and `/sync/pull` protocol, so configured desktop clients can use
it as `CERAMISYS_SYNC_URL`. It is a first deployment layer, not a central ERP
application server: business writes still happen in each device's local
SQLite database, and only entities already wired to the local sync outbox are
transmitted. In particular, this does not yet make inventory, accounting,
restaurant orders, or all ERP modules centrally authoritative.

## Requirements

- A server that can run Docker Compose and remain available to the branches.
- A customer-managed VPN that routes each desktop device to the server.
- A DNS name covered by a TLS certificate trusted by the desktop devices.
- A unique random bearer token for every device, kept out of source control.
- Backups of the PostgreSQL volume and a tested restore procedure.

The relay binds to the server's VPN interface through Docker port publishing.
PostgreSQL is not published outside the private Docker network. The public
relay listener requires TLS 1.2 or newer. Do not expose it directly to the
public Internet or put bearer tokens in this repository.

## Server setup

1. Copy `sync-server/.env.example` to `sync-server/.env` and replace every
   placeholder with unique credentials and the server's VPN address.
2. Put the TLS certificate chain at `sync-server/certs/fullchain.pem` and its
   private key at `sync-server/certs/private-key.pem`. Protect the private key
   using the server operating system's file permissions.
3. Configure `CERAMISYS_SYNC_CLIENTS` with one unique entry per device. Assign
   stable tenant, branch, and device IDs. Set `canManageSyncPolicies: true` on
   exactly the designated head-office device.
4. From `sync-server/`, run `docker compose up -d --build`, then verify
   `https://<server-name>:47821/ready` from a VPN-connected machine.
5. On each desktop, configure the existing `CERAMISYS_SYNC_URL`,
   `CERAMISYS_SYNC_TOKEN`, `CERAMISYS_SYNC_TENANT_ID`,
   `CERAMISYS_SYNC_BRANCH_ID`, and `CERAMISYS_SYNC_DEVICE_ID` settings, then
   restart the application.
6. Back up PostgreSQL regularly, and test restoring the database before using
   synchronization for business-critical data.

The Compose file intentionally does not publish PostgreSQL's port. The
container-to-container database connection is isolated to the Compose network.
`PGSSLMODE=disable` applies only to this private container network; standalone
production deployments require PostgreSQL TLS verification. The Compose
configuration explicitly enables this exception because the database is
reachable only on its isolated, unpublished container network.

## Current functional boundary

The service durably stores validated, deduplicated sync events in PostgreSQL,
enforces tenant/device identity, branch visibility, and head-office entity
policies, and returns a per-event acknowledgement. Its protocol is compatible
with the current desktop sync transport. Existing application handlers still
determine which master-data and report snapshots are sent and what is applied
on receipt. A local sync acknowledgement does not mean a remote invoice or
inventory operation has been posted.

This is not yet the agreed central-authority/offline-queue architecture.
Replacing local write authority requires domain APIs and PostgreSQL
transactions for each ERP module, outbox capture in the same transaction,
branch-owned financial/inventory ledgers, device-prefixed offline document
numbers, and explicit rules for operations that must wait for connectivity.
Do not enable additional entity policies or treat this relay as a substitute
for those controls.

## Local checks

```powershell
npm --prefix sync-server install
npm --prefix sync-server test
npm run typecheck
```

End-to-end PostgreSQL acceptance tests must run against a disposable PostgreSQL
instance before production deployment. Docker/PostgreSQL was not available in
the development environment used for this implementation.
