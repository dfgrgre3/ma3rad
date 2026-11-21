# Tenant API — `/api/v1/tenant/v1`

Read-only API that lets a customer (tenant) query its own platform data. Each
key is scoped to exactly one tenant — a key can never read another tenant's
rows.

## Authentication

```
Authorization: Bearer pk_<48+ hex chars>
```

Keys are created by a platform admin in **Tenant detail → API العميل** (or via
`POST /api/v1/admin/tenants/:id/api-keys`). The plaintext key is returned **once**
at creation; only its SHA-256 hash is stored. Keys support scopes (`read`, `*`)
and optional expiry. Revocation takes effect immediately.

Platform staff keys (Security Center → API keys) are **rejected** on this
surface — only tenant-owned keys work here.

## Base URL

```
https://<central-host>/api/v1/tenant/v1
```

## Endpoints

All responses use the shared envelope: `{ success, data, error, message, requestId }`.

### `GET /me`

Tenant identity, plan summary, and the API key used.

```bash
curl -s https://<host>/api/v1/tenant/v1/me \
  -H "Authorization: Bearer $TENANT_API_KEY" | jq .data
```

### `GET /subscription`

Current subscription (TRIAL/ACTIVE/PAST_DUE) plus plan pricing summary.

### `GET /licenses`

All issued licenses: key, status, validity window, seats/device limits,
module and feature sets.

### `GET /usage`

Consumption vs limits: seats, active devices, open branches, module count.

### `GET /devices`

Registered devices: name, hardware id, status, first/last seen. No credentials
are ever exposed.

### `GET /entitlements`

Effective modules and features after plan defaults + tenant overrides.

## Errors

| Status | Meaning                                            |
|--------|----------------------------------------------------|
| 401    | Missing, malformed, revoked, or expired key        |
| 403    | Valid key without the required scope, or a staff key |
| 404    | Tenant no longer exists                            |

## Example

```bash
export TENANT_API_KEY="pk_..."
BASE="https://<host>/api/v1/tenant/v1"

curl -s "$BASE/me"            -H "Authorization: Bearer $TENANT_API_KEY" | jq .data.tenant
curl -s "$BASE/subscription"  -H "Authorization: Bearer $TENANT_API_KEY" | jq .data
curl -s "$BASE/usage"         -H "Authorization: Bearer $TENANT_API_KEY" | jq .data.usage
curl -s "$BASE/devices"       -H "Authorization: Bearer $TENANT_API_KEY" | jq '.data.devices[] | {name,status,lastSeenAt}'
```
