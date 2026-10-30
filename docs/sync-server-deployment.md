# Direct branch-to-branch synchronization

Each branch runs its own PostgreSQL-backed event server and keeps its
operational data local to each desktop's SQLite database. Desktops connect to
their branch server over the LAN. The two branch servers exchange only events
originating at their own branch over a direct WireGuard tunnel; there is no
cloud relay or shared operational database.

The peer protocol keeps a durable cursor per remote branch and accepts
replicated events only from the configured source branch. This prevents
events received from a peer from being echoed back indefinitely. Replication
runs every five seconds when both servers are reachable; outages leave the
cursor unchanged and are retried automatically.

## Network requirements

- One always-on host per branch running Docker Compose, PostgreSQL, and the
  sync server. Keep each PostgreSQL service private to its Docker network.
- A static LAN address for each host and LAN DNS names reachable by that
  branch's desktop devices.
- A direct WireGuard site-to-site tunnel between the two branch hosts. Each
  WireGuard tunnel address must be routable from the other host.
- For direct WireGuard, each site's router must permit the configured inbound
  UDP port and forward it to its WireGuard endpoint. A public address or a
  working dynamic DNS name is needed. CGNAT or a blocked inbound UDP port can
  prevent direct peer connectivity; globally routable IPv6 is another direct
  option. In a CGNAT/blocked-port case, direct-only operation will not work
  without changing the ISP/network arrangement.
- TLS certificates trusted by the sync-server container and all Windows
  desktops. The certificate SANs must cover the LAN and WireGuard names used
  by clients and peers. Do not disable certificate validation.
- Host firewall rules that allow TCP 47821 only from the branch LAN and the
  WireGuard peer. Do not bind/publish the service on a public interface.
- Per-device and per-peer bearer tokens with at least 32 random bytes. Keep
  actual `.env` files and tokens out of source control.

The tunnel is only for traffic between branch servers. Desktop devices use
their branch LAN endpoint; they do not need WireGuard installed.

Use separate `/32` WireGuard addresses for the two server hosts so overlapping
home LAN subnets do not need to be routed. A minimal host configuration has
this shape; keep private keys outside the repository:

```ini
# Branch 1: /etc/wireguard/wg0.conf
[Interface]
Address = 10.77.0.1/32
ListenPort = 51820
PrivateKey = <branch-1-private-key>

[Peer]
PublicKey = <branch-2-public-key>
Endpoint = <branch-2-public-ip-or-ddns>:51820
AllowedIPs = 10.77.0.2/32
PersistentKeepalive = 25
```

Configure branch 2 reciprocally with `10.77.0.2/32`, its own private key,
branch 1's public key and endpoint, and `AllowedIPs = 10.77.0.1/32`. Forward
UDP 51820 at both routers to the corresponding WireGuard host. Use a
WireGuard-only DNS name for the peer HTTPS endpoint that resolves to its
tunnel address; the public IP/DDNS endpoint is used only by WireGuard.
Confirm the host routes Docker's `sync-egress` traffic through its WireGuard
interface and that replies return through the tunnel.

## Configure the two servers

1. Copy `sync-server/.env.example` to `.env` on the first branch host. Assign
   stable tenant, branch, and device IDs. Set
   `SYNC_LAN_PUBLISH_ADDRESS` and `SYNC_WIREGUARD_PUBLISH_ADDRESS` to that
   host's actual LAN and WireGuard interface addresses.
2. Install the TLS certificate chain as `sync-server/certs/fullchain.pem` and
   its private key as `sync-server/certs/private-key.pem`. The TLS certificate
   must match the LAN and WireGuard names used in the configuration.
3. Generate two distinct peer tokens: one issued by branch 1 for branch 2,
   and one issued by branch 2 for branch 1. Put each issued token in the
   recipient's `CERAMISYS_SYNC_PEERS` entry and in the issuer's
   `CERAMISYS_SYNC_CLIENTS` peer identity. Never reuse a desktop token as a
   peer token.
4. On branch 1, set `CERAMISYS_SYNC_PEERS` to branch 2's WireGuard HTTPS
   endpoint and branch 2's token issued to branch 1. The local peer identity
   in `CERAMISYS_SYNC_CLIENTS` must use `canServePeerSync: true` and
   `canReplicateBranches: ["branch-2"]`.
5. On branch 2, create the reciprocal configuration with the branch IDs,
   peer IDs, URLs, and tokens swapped. Use the same `tenantId` at both sites.
   Set `canManageSyncPolicies: true` on exactly one designated device across
   the tenant. If branch 1 owns policy authority, add
   `canReplicatePolicies: true` only to branch 2's peer-branch-1 credential.
   Do not grant `canReadAllBranches` to peer credentials; peer endpoints
   expose only the authenticated branch's own source events.

   For example, when branch 1 is the policy authority, branch 2's peer entries
   follow this shape (replace every token with the corresponding value issued
   by the other server):

   ```dotenv
   CERAMISYS_SYNC_CLIENTS='[{"token":"<branch-2-desktop-token>","tenantId":"company-1","branchId":"branch-2","deviceId":"device-2"},{"token":"<branch-2-issued-to-branch-1>","tenantId":"company-1","branchId":"branch-2","deviceId":"peer-branch-1","canServePeerSync":true,"canReplicateBranches":["branch-1"],"canReplicatePolicies":true}]'
   CERAMISYS_SYNC_PEERS='[{"peerId":"branch-1","url":"https://branch-1.wg.example:47821","token":"<branch-1-issued-to-branch-2>","tenantId":"company-1","branchId":"branch-1","localDeviceId":"peer-branch-1"}]'
   ```
6. Configure each desktop with its local branch server's LAN HTTPS URL and
   its unique device identity/token using
   `CERAMISYS_SYNC_URL`, `CERAMISYS_SYNC_TOKEN`,
   `CERAMISYS_SYNC_TENANT_ID`, `CERAMISYS_SYNC_BRANCH_ID`, and
   `CERAMISYS_SYNC_DEVICE_ID`. Also set
   `CERAMISYS_SYNC_POLICY_AUTHORITY=true` only on the designated
   policy-authority desktop. Install/trust the certificate issuer on each
   desktop, then sign out/in before restarting the app, or launch it from a
   shell that has the updated Windows user environment.
7. Verify the WireGuard tunnel and both HTTPS endpoints before enabling
   synchronization. From each branch LAN, open
   `https://<branch-lan-name>:47821/ready`; from the other branch host, verify
   the peer's WireGuard HTTPS endpoint. Then run `docker compose up -d --build`
   at both sites and inspect each sync-server log for peer synchronization
   failures.
8. Back up each branch's PostgreSQL volume and each desktop's local database.
   Test restoring both before using synchronization for business-critical
   records.

The example `.env` is a branch-1 template; it is not a shared configuration
for both sites. The branch-2 server needs its own `.env`, certificate, tokens,
and static addresses.

## Docker network boundary

The Compose file publishes sync-server TCP 47821 separately on the configured
LAN and WireGuard addresses. PostgreSQL has no published port and remains on
the internal `database-private` network. The sync-server also has a dedicated
outbound Docker network so it can reach its WireGuard peer; the host must route
the peer's WireGuard subnet correctly. Do not attach PostgreSQL to that
outbound network.

`PGSSLMODE=disable` applies only to PostgreSQL traffic on the unpublished
internal Docker network. Inter-site sync requests use HTTPS with certificate
verification. Desktop traffic also uses HTTPS.

## Data and synchronization boundaries

This deployment does not turn branch servers into shared ERP application
servers. Desktop business writes still occur in each device's SQLite database,
and the event server stores only validated synchronization events. The branch
server does not open or replicate a desktop SQLite file, and it does not
provide instant shared-database visibility between devices on the same LAN.

Only entities already connected to the sync outbox and registered inbound
handlers are synchronized. The current implementation includes selected
master-data records and read-only sales document snapshots; it does not make
inventory, accounting, restaurant orders, or every ERP module centrally
authoritative. A server acknowledgement means an event was durably stored,
not that every destination applied it.

The peer layer replicates events only; it does not resolve business conflicts
or alter the existing field allowlists, policies, and destination handlers.
Do not enable additional entity policies without reviewing the data and
conflict behavior for that entity.

## Local checks

```powershell
npm --prefix sync-server test
npm run typecheck
```

Before production, run acceptance tests against two disposable PostgreSQL
instances connected through a test WireGuard tunnel. Verify offline recovery,
duplicate-event handling, policy propagation, TLS validation, firewall
restrictions, database backups, and restoration.
