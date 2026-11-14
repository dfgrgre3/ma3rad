# License Management System - Implementation Plan

## Executive Summary

This plan addresses the enhancement of the existing license management system in CeramiSys ERP to meet the comprehensive requirements specified. The codebase already has a solid foundation with:
- **PlatformAdminService** - Server-side license/subscription management
- **LicenseGuard + LicenseValidator** - Client-side cryptographic validation (Ed25519)
- **CentralLicenseService** - Client ↔ Central server communication
- **Hardware ID binding** - Device fingerprinting with clone detection
- **Activation audit logs** - Complete history of license operations

The plan focuses on **closing gaps**, **enforcing central-only issuance**, **adding missing entities** (branches, grace periods), **automated notifications**, and **strict subscription/license separation**.

---

## 1. Current Architecture Analysis

### 1.1 Existing Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `PlatformAdminService` | `src/services/domains/platform/PlatformAdminService.ts` | Super Admin console: tenant, plan, subscription, license CRUD |
| `PlatformLicense` type | `src/services/domains/platform/platformTypes.ts` | Technical license entity (device-bound) |
| `PlatformSubscription` type | `src/services/domains/platform/platformTypes.ts` | Commercial subscription entity (service entitlement) |
| `LicenseValidator` | `electron/security/licenseValidator.js` | Ed25519 signature, HWID binding, offline lease, clock rollback |
| `LicenseGuard` | `electron/licenseGuard.js` | Encrypted license storage, load/save, offline license apply |
| `CentralLicenseService` | `src/services/domains/licensing/CentralLicenseService.ts` | Client ↔ Central API (activate, validate, heartbeat, config) |
| `hardwareId.js` | `electron/hardwareId.js` | Stable device fingerprint (motherboard UUID, BIOS, disk, CPU) |
| DB Schema | `src/database/schema/part-19.ts`, `part-23.ts`, `part-24.ts` | Tables: `platform_licenses`, `platform_subscriptions`, `platform_license_activations`, `platform_devices` |

### 1.2 Current Data Model (Key Fields)

**PlatformSubscription (Commercial)**
```typescript
{
  id, tenantId, planId, status, startDate, endDate,
  seats, price, billingCycle, autoRenew
}
```

**PlatformLicense (Technical)**
```typescript
{
  id, tenantId, subscriptionId, planId, licenseKey, status,
  issuedAt, activatedAt, expiresAt, seats, deviceLimit,
  hardwareId, activationCode, certificate, transferCount,
  modules[], features[], notes
}
```

**PlatformDevice (Registry)**
```typescript
{
  id, tenantId, licenseId, hardwareId, name, os, appVersion,
  status (ACTIVE/SUSPENDED/REVOKED/OFFLINE), cloneSuspected
}
```

---

## 2. Requirements Gap Analysis

| # | Requirement | Current Status | Gap Severity |
|---|-------------|----------------|--------------|
| 1 | **Central-only license issuance** | Local issuance exists (dev-only, gated by `platform.localIssuance`) | 🔴 Critical - Must enforce in production |
| 2 | **Cryptographic signing & verification** | ✅ Ed25519 implemented in `LicenseValidator` | ✅ Done |
| 3 | **License binding: customer, plan, devices, branches** | Customer, plan, devices ✅; **branches ❌** | 🟡 High |
| 4 | **Start/end dates + offline grace period** | `validUntil`, `offlineLeaseExpiresAt` ✅; grace period config ❌ | 🟡 High |
| 5 | **Limits: users, devices, branches, modules** | Users(seats), devices, modules ✅; **branches ❌** | 🟡 High |
| 6 | **Activation attempt logs (success/fail)** | ✅ `platform_license_activations` with status | ✅ Done |
| 7 | **Revoke license, suspend/release device remotely** | Local API ✅; **remote from central server ❌** | 🟡 High |
| 8 | **HWID duplication / clone detection** | `platform_devices.cloneSuspected` flag ✅; detection logic needs hardening | 🟡 High |
| 9 | **Renewal & license change logs** | ✅ Audit logs + activation logs | ✅ Done |
| 10 | **Expiry notifications (subscription & license)** | Dashboard shows expiring ❌; **automated scheduled notifications ❌** | 🟡 High |
| 11 | **Subscription (commercial) ≠ License (technical) separation** | Separate tables ✅; **enforcement rules ❌** | 🔴 Critical |

---

## 3. Implementation Plan

### Phase 1: Core Data Model Extensions (Week 1)

#### 1.1 Add Branch Limit to License & Subscription

**Files to modify:**
- `src/services/domains/platform/platformTypes.ts` - Add `branchesLimit` to `PlatformLicense` and `PlatformSubscription`
- `src/database/schema/part-19.ts` - Add `branches_limit` column to `platform_licenses` and `platform_subscriptions`
- `src/database/migrations/` - New migration for schema changes
- `src/services/domains/platform/PlatformAdminService.ts` - Update `issueLicense`, `renewLicense`, `changeTenantPlan` to handle branches

**Changes:**
```typescript
// PlatformLicense
branchesLimit: number;  // Max branches allowed by this license
branchesUsed: number;   // Current branch count (computed)

// PlatformSubscription
branchesLimit: number;  // From plan or override
```

#### 1.2 Add Offline Grace Period Configuration

**Files to modify:**
- `src/services/domains/platform/platformTypes.ts` - Add `offlineGracePeriodDays` to `PlatformPlan` and `PlatformLicense`
- `src/database/schema/part-19.ts` - Add column to `platform_plans` and `platform_licenses`
- `electron/security/licenseValidator.js` - Use grace period for offline lease calculation

**Logic:**
- Plan defines default grace period (e.g., 14 days)
- License can override per-tenant
- Certificate payload includes `offlineLeaseExpiresAt = now + gracePeriod`
- Client validates against `offlineLeaseExpiresAt` (already implemented)

#### 1.3 Add License Start Date (Distinct from Issued At)

**Files to modify:**
- `platformTypes.ts` - Add `startsAt` to `PlatformLicense` (separate from `issuedAt`)
- Schema + migration
- `PlatformAdminService.issueLicense()` - Accept optional `startsAt` (default = now)

---

### Phase 2: Central-Only Issuance Enforcement (Week 1-2)

#### 2.1 Remove/Guard Local Issuance Path

**Files to modify:**
- `src/services/domains/platform/PlatformAdminService.ts` - `issueLicense()` method
- `src/config/appConfiguration_part06.ts` - Add `platform.localIssuance` setting (default: false)

**Implementation:**
```typescript
// In issueLicense():
const allowLocalIssuance = this.setting('platform.localIssuance') === 'true';
if (!allowLocalIssuance) {
  throw new Error('إصدار التراخيص يتم من الخادم المركزي فقط. استخدم واجهة الإدارة المركزية.');
}
```

#### 2.2 Central Server License Issuance API Contract

**Endpoint:** `POST /api/v1/admin/licenses/issue` (already allowlisted in `centralApi.js`)

**Request:**
```json
{
  "tenantId": "string",
  "planId": "string",
  "months": 12,
  "seats": 5,
  "branchesLimit": 3,
  "deviceLimit": 5,
  "startsAt": "2026-01-01T00:00:00Z",  // optional
  "offlineGracePeriodDays": 14,         // optional, defaults to plan
  "modules": ["sales", "inventory"],    // optional, defaults to plan
  "notes": "string"
}
```

**Response:**
```json
{
  "license": {
    "id": "lic_...",
    "licenseKey": "CS-XXXX-XXXX-XXXX-XXXX",
    "status": "ISSUED",
    "issuedAt": "2026-01-01T00:00:00Z",
    "expiresAt": "2027-01-01T00:00:00Z",
    "certificate": { "payload": {...}, "signature": "base64" },
    "activationCode": "ABCD-EFGH-IJKL"
  },
  "subscription": { ... }
}
```

#### 2.3 Client-Side: Receive & Store Central-Issued License

**Files to modify:**
- `src/services/domains/licensing/CentralLicenseService.ts` - Add `fetchLicense()` or extend `fetchConfig()`
- `electron/licenseGuard.js` - Already handles `saveLicense()` with certificate validation

**Flow:**
1. Admin issues license from Central Admin Console
2. Central server generates Ed25519-signed certificate with HWID (or null for account mode)
3. Client receives license via configuration fetch or dedicated endpoint
4. `LicenseGuard.saveLicense()` validates signature + HWID binding
5. Encrypted license stored locally via Electron safeStorage

---

### Phase 3: Subscription ↔ License Separation Rules (Week 2)

#### 3.1 Define Separation Rules

| Scenario | Subscription Change | License Change | Rule |
|----------|-------------------|----------------|------|
| Plan upgrade | New subscription row | New license issued (revoke old) | **Explicit admin action required** |
| Renewal | Extend `end_date` | Extend `expires_at` | **Can be coupled** (default) |
| Suspension | Status → SUSPENDED | Status → SUSPENDED | **Coupled by default**, overridable |
| Cancellation | Status → CANCELLED | Status → REVOKED | **Coupled** |
| Device limit change | Update `devices_limit` | Update `device_limit` | **Decoupled** - license can be more restrictive |
| Branch limit change | Update `branches_limit` | Update `branches_limit` | **Decoupled** |
| Module change | Update `included_modules` | Update `modules` | **License ⊆ Subscription** (license cannot exceed) |

#### 3.2 Implement Enforcement in PlatformAdminService

**Files to modify:**
- `src/services/domains/platform/PlatformAdminService.ts`

**New Methods:**
```typescript
// Explicit coupling controls
async coupleSubscriptionLicense(tenantId: string, couple: boolean): Promise<void>
async setLicenseExpiryFromSubscription(licenseId: string): Promise<void>
async setSubscriptionExpiryFromLicense(subscriptionId: string): Promise<void>

// Validation: license modules must be subset of subscription plan modules
private validateLicenseModulesSubset(license: PlatformLicense, subscription: PlatformSubscription): void
```

**Database:**
- Add `coupling_mode` column to `platform_tenants` or `platform_subscriptions`:
  - `FULL` - Subscription and license always in sync (legacy behavior)
  - `EXPIRY_ONLY` - Only expiry dates sync
  - `NONE` - Fully independent (requires explicit admin actions)

---

### Phase 4: Remote Device Management (Week 2-3)

#### 4.1 Central Server Device Registry API

**Endpoints to add to `centralApi.js` allowlist:**
- `GET /api/v1/admin/devices` - List all devices (with filters)
- `POST /api/v1/admin/devices/suspend` - Suspend device
- `POST /api/v1/admin/devices/release` - Release device (unbind)
- `POST /api/v1/admin/devices/revoke` - Revoke device (mark clone suspected)

**Device Status Transitions:**
```
ACTIVE → SUSPENDED (admin action, device cannot validate)
ACTIVE → REVOKED (clone suspected, permanent)
SUSPENDED → ACTIVE (admin action)
ACTIVE → OFFLINE (heartbeat timeout, auto)
OFFLINE → ACTIVE (heartbeat received)
```

#### 4.2 Client-Side: Heartbeat Includes Device Status

**Files to modify:**
- `src/services/domains/licensing/CentralLicenseService.ts` - `heartbeat()` method
- `electron/licenseGuard.js` - `loadLicense()` should check for remote suspend

**Heartbeat Response:**
```json
{
  "deviceStatus": "ACTIVE" | "SUSPENDED" | "REVOKED",
  "licenseStatus": "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED",
  "configVersion": 123,
  "actions": ["REVALIDATE_LICENSE", "REFETCH_CONFIG"]
}
```

**Client Behavior:**
- On `SUSPENDED`/`REVOKED` device status → `loadLicense()` returns `active: false, reason: 'device_suspended_remotely'`
- App enters locked state until resolved

#### 4.3 Clone Detection Hardening

**Current:** `platform_devices.clone_suspected` flag set manually

**Enhanced Detection Logic (in PlatformAdminService):**
```typescript
// In registerDevice() or periodic job:
async detectCloneDevices(): Promise<void> {
  // 1. Same HWID registered to multiple tenants
  const duplicateHwids = this.db.query(`
    SELECT hardware_id, COUNT(DISTINCT tenant_id) as tenant_count
    FROM platform_devices
    WHERE status IN ('ACTIVE', 'SUSPENDED')
    GROUP BY hardware_id
    HAVING tenant_count > 1
  `);
  
  // 2. Same license activated on multiple HWIDs simultaneously
  const multiDeviceLicenses = this.db.query(`
    SELECT l.id, COUNT(DISTINCT d.hardware_id) as device_count
    FROM platform_licenses l
    JOIN platform_devices d ON d.license_id = l.id
    WHERE l.status = 'ACTIVE' AND d.status = 'ACTIVE'
    GROUP BY l.id
    HAVING device_count > l.device_limit
  `);
  
  // 3. Rapid HWID changes for same license (transfer_count threshold)
  const suspiciousTransfers = this.db.query(`
    SELECT license_id, COUNT(*) as transfer_count
    FROM platform_license_activations
    WHERE action = 'TRANSFER' AND created_at > date('now', '-30 day')
    GROUP BY license_id
    HAVING transfer_count > 3
  `);
  
  // Mark devices as clone_suspected, create audit entries, notify admins
}
```

---

### Phase 5: Automated Expiry Notifications (Week 3)

#### 5.1 Notification Types to Add

| Notification Type | Trigger | Recipient | Channels |
|-------------------|---------|-----------|----------|
| `LICENSE_EXPIRING_SOON` | License expires in 30/14/7/1 days | Tenant admin, Platform admin | In-app, Email |
| `SUBSCRIPTION_EXPIRING_SOON` | Subscription ends in 30/14/7/1 days | Tenant admin, Platform admin | In-app, Email |
| `LICENSE_EXPIRED` | License status → EXPIRED | Tenant admin | In-app, Email |
| `SUBSCRIPTION_EXPIRED` | Subscription status → EXPIRED | Tenant admin | In-app, Email |
| `OFFLINE_LEASE_EXPIRING` | Offline lease expires in 3/1 days | Device user | In-app (local) |
| `DEVICE_SUSPENDED_REMOTELY` | Central server suspends device | Device user | In-app (local) |
| `CLONE_DETECTED` | Clone detection job finds violation | Platform admin | In-app, Email |

#### 5.2 Implementation

**Files to create/modify:**
- `src/services/domains/notifications/LicenseNotificationService.ts` - New service
- `src/database/schema/` - Add notification types to `notifications` table (if needed)
- `src/hooks/domains/auth/useAppStartup.ts` - Schedule periodic check
- `electron/main.js` - Background job for offline lease warnings

**Scheduler (using existing patterns):**
```typescript
// In LicenseNotificationService
async checkExpiringLicensesAndSubscriptions(): Promise<void> {
  const horizons = [30, 14, 7, 1]; // days
  
  for (const days of horizons) {
    const cutoff = addDays(new Date(), days).toISOString();
    
    // Licenses
    const expiringLicenses = this.db.query(`
      SELECT l.*, t.name as tenantName, t.id as tenantId
      FROM platform_licenses l
      JOIN platform_tenants t ON t.id = l.tenant_id
      WHERE l.status IN ('ACTIVE', 'ISSUED')
        AND l.expires_at IS NOT NULL
        AND date(l.expires_at) = date(?)
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.reference_type = 'LICENSE' AND n.reference_id = l.id
            AND n.type = 'LICENSE_EXPIRING_SOON'
            AND n.created_at > date('now', '-1 day')
        )
    `, [cutoff]);
    
    // Create notifications for each...
  }
}
```

**Client-Side Offline Lease Warning:**
```javascript
// In LicenseGuard.loadLicense() or periodic check
if (license.payload.offlineLeaseExpiresAt) {
  const daysLeft = (new Date(license.payload.offlineLeaseExpiresAt) - Date.now()) / (1000*60*60*24);
  if (daysLeft <= 3 && daysLeft > 0) {
    // Show in-app warning: "Offline lease expires in X days. Connect to internet."
  }
}
```

---

### Phase 6: Enhanced Audit & Compliance (Week 3-4)

#### 6.1 License Change Log (Immutable)

**New Table:** `platform_license_changes`
```sql
CREATE TABLE platform_license_changes (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  subscription_id TEXT,
  change_type TEXT NOT NULL,  -- 'ISSUE', 'RENEW', 'SUSPEND', 'REVOKE', 'TRANSFER', 'MODULE_CHANGE', 'LIMIT_CHANGE', 'COUPLING_CHANGE'
  old_values TEXT,            -- JSON
  new_values TEXT,            -- JSON
  actor_id TEXT,
  actor_name TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE CASCADE
);
```

**Integration:** Call from all license mutation methods in `PlatformAdminService`

#### 6.2 Subscription Change Log

**New Table:** `platform_subscription_changes` (similar structure)

#### 6.3 Export Compliance Reports

**New Method in PlatformAdminService:**
```typescript
async exportLicenseComplianceReport(filters: {
  tenantId?: string;
  dateFrom?: string;
  dateTo?: string;
  includeActivations?: boolean;
  includeChanges?: boolean;
}): Promise<Blob>  // Excel/CSV
```

---

### Phase 7: UI/UX Enhancements (Week 4)

#### 7.1 Platform Admin Console Pages

| Page | Route | Features |
|------|-------|----------|
| License List | `/platform/licenses` | Filter by status, tenant, plan, expiry; bulk actions |
| License Detail | `/platform/licenses/:id` | Timeline of activations, changes, devices; actions: renew, suspend, revoke, transfer |
| Device Registry | `/platform/devices` | List all devices; filter by tenant, license, status; actions: suspend, release, revoke |
| Subscription List | `/platform/subscriptions` | Separate from licenses; show coupling status |
| Coupling Rules | `/platform/settings/coupling` | Configure default coupling mode per tenant/plan |

#### 7.2 Tenant-Facing License Status Page

**Route:** `/settings/license-status` (or similar)

**Shows:**
- Current license status (Active/Expiring/Expired/Suspended)
- Days until expiry
- Offline lease status (if applicable)
- Bound device info
- Modules enabled
- Limits: seats, devices, branches used vs allowed
- "Renew" button → redirects to central portal or shows contact info

---

## 4. Technical Specifications

### 4.1 Certificate Payload Structure (Enhanced)

```typescript
interface LicenseCertificatePayload {
  // Identity
  licenseKey: string;           // CS-XXXX-XXXX-XXXX-XXXX
  customerId: string;           // tenantId
  subscriptionId: string;       // subscriptionId
  
  // Validity
  startsAt: string;             // ISO date (license effective start)
  validUntil: string;           // ISO date (license expiry)
  offlineLeaseExpiresAt: string; // ISO date (offline grace expiry)
  
  // Limits
  maxDevices: number;
  maxSeats: number;
  maxBranches: number;          // NEW
  allowedModules: string[];     // Module codes
  allowedFeatures: string[];    // Feature flags
  
  // Binding
  hardwareId?: string;          // Null for account mode
  bindingMode: 'hardwa' | 'account';
  
  // Metadata
  issuedAt: string;             // ISO date (issuance timestamp)
  revoked: boolean;             // Server-side revocation
  version: number;              // Certificate format version
}
```

### 4.2 Central API Endpoints (License-Related)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/licensing/activate` | POST | Device cred | Initial device activation |
| `/api/v1/licensing/validate` | POST | Device cred | Periodic license validation |
| `/api/v1/licensing/heartbeat` | POST | Device cred | Device heartbeat + status check |
| `/api/v1/admin/licenses/issue` | POST | Platform owner | Issue new license (central only) |
| `/api/v1/admin/licenses/:id/renew` | POST | Platform owner | Renew license |
| `/api/v1/admin/licenses/:id/suspend` | POST | Platform owner | Suspend license |
| `/api/v1/admin/licenses/:id/revoke` | POST | Platform owner | Revoke license |
| `/api/v1/admin/licenses/:id/transfer` | POST | Platform owner | Transfer to new HWID |
| `/api/v1/admin/devices` | GET | Platform owner | List devices |
| `/api/v1/admin/devices/:id/suspend` | POST | Platform owner | Suspend device |
| `/api/v1/admin/devices/:id/release` | POST | Platform owner | Release device |
| `/api/v1/admin/devices/:id/revoke` | POST | Platform owner | Revoke device (clone) |
| `/api/v1/configuration/current` | GET | Device cred | Get signed config + license |
| `/api/v1/configuration/public-key` | GET | Public | Get Ed25519 public key |

### 4.3 Database Migration Checklist

- [ ] `platform_licenses`: Add `branches_limit`, `starts_at`, `offline_grace_period_days`, `coupling_mode`
- [ ] `platform_subscriptions`: Add `branches_limit` (if not in plan override)
- [ ] `platform_plans`: Add `branches_limit`, `offline_grace_period_days`
- [ ] New table: `platform_license_changes`
- [ ] New table: `platform_subscription_changes`
- [ ] New table: `platform_license_notifications` (or use existing `notifications` with new types)
- [ ] Indexes on new columns for query performance

---

## 5. Testing Strategy

### 5.1 Unit Tests

| Module | Test Cases |
|--------|------------|
| `LicenseValidator` | Valid signature, invalid signature, expired, not yet valid, HWID mismatch, revoked, offline lease expired, perpetual license |
| `PlatformAdminService.issueLicense` | Valid input, missing tenant, invalid plan, local issuance blocked, central issuance path |
| `PlatformAdminService.renewLicense` | Renew from expiry date, renew from now, subscription sync |
| `Coupling rules` | FULL mode sync, EXPIRY_ONLY, NONE mode independence |
| `Clone detection` | Multi-tenant HWID, over-limit devices, rapid transfers |

### 5.2 Integration Tests

- Full activation flow: Central issue → Client receive → Validate → Store
- Offline lease: Valid license → Disconnect network → Work until lease expiry → Block
- Remote suspend: Central suspend device → Client heartbeat → License invalid
- Subscription/license decoupling: Change subscription without license change, vice versa

### 5.3 End-to-End Tests (Playwright)

- Admin issues license from Platform Console
- Tenant activates on new device
- License expires → notifications sent
- Admin revokes license → device locked
- Clone detection triggers alert

---

## 6. Rollout Plan

| Phase | Duration | Risk | Mitigation |
|-------|----------|------|------------|
| 1. Data Model | 1 week | Low | Backward-compatible migrations |
| 2. Central-Only Issuance | 1-2 weeks | Medium | Feature flag `platform.localIssuance` for transition |
| 3. Separation Rules | 1 week | Medium | Default to current behavior (FULL coupling) |
| 4. Remote Device Mgmt | 2 weeks | High | Staged rollout: logging only → alerting → enforcement |
| 5. Notifications | 1 week | Low | Opt-in per tenant initially |
| 6. Audit/Compliance | 1-2 weeks | Low | Append-only tables, no breaking changes |
| 7. UI | 1-2 weeks | Low | Behind feature flags |

---

## 7. File Modification Summary

### Core Services (TypeScript)
```
src/services/domains/platform/platformTypes.ts          # Type definitions
src/services/domains/platform/PlatformAdminService.ts   # Business logic
src/services/domains/licensing/CentralLicenseService.ts # Client ↔ Central API
src/services/domains/notifications/LicenseNotificationService.ts  # NEW
```

### Database
```
src/database/schema/part-19.ts                          # Core tables
src/database/schema/part-23.ts                          # Activations
src/database/schema/part-24.ts                          # Devices
src/database/migrations/partXX_license_enhancements.ts  # NEW migration
```

### Electron (Main Process)
```
electron/licenseGuard.js                                # License storage/validation
electron/security/licenseValidator.js                   # Certificate validation
electron/hardwareId.js                                  # HWID generation
electron/centralApi.js                                  # API allowlist
```

### Configuration
```
src/config/appConfiguration_part06.ts                   # Feature flags
src/config/featureRegistry.ts                           # Feature flags
```

### UI (React)
```
src/pages/platform/PlatformLicensesPage.tsx             # NEW/Enhanced
src/pages/platform/PlatformDevicesPage.tsx              # NEW
src/pages/platform/PlatformSubscriptionsPage.tsx        # NEW/Enhanced
src/pages/settings/LicenseStatusPage.tsx                # NEW
```

---

## 8. Acceptance Criteria

### Must Have (P0)
- [ ] Licenses can **only** be issued from central server (local issuance blocked in production)
- [ ] License certificate includes **branches limit** and **offline grace period**
- [ ] **Subscription ≠ License** separation enforced with configurable coupling
- [ ] **Remote device suspend/release/revoke** from central admin console
- [ ] **Automated expiry notifications** (30/14/7/1 days) for both subscription and license
- [ ] **Clone detection** alerts platform admin on duplicate HWID / over-limit devices

### Should Have (P1)
- [ ] License change log (immutable audit trail)
- [ ] Subscription change log
- [ ] Compliance report export (Excel)
- [ ] Tenant-facing license status page
- [ ] Offline lease expiry warning in client app

### Nice to Have (P2)
- [ ] Device registry UI with real-time status
- [ ] Bulk license operations
- [ ] Webhook integration for external systems
- [ ] License usage analytics dashboard

---

## 9. Dependencies & Risks

| Dependency | Risk | Mitigation |
|------------|------|------------|
| Central Admin Server API | Server not ready | Mock server for client development; parallel development |
| Ed25519 key rotation | Key compromise | Support multiple active keys; `setPublicKey()` in validator |
| Electron safeStorage | Unavailable on some Linux | Fallback to encrypted file with password; clear error messages |
| Offline grace period | Clock manipulation | Monotonic clock check (already implemented) + server time sync |
| Migration of existing licenses | Data loss | Backward-compatible schema; default values for new columns |

---

## 10. Next Steps

1. **Review & approve** this plan with stakeholders
2. **Create detailed tickets** for each phase (GitHub issues / Jira)
3. **Set up central server API** contract (OpenAPI spec)
4. **Begin Phase 1** - Data model extensions (lowest risk, highest foundation value)
5. **Weekly sync** to track progress and adjust scope

---

*Document Version: 1.0*  
*Author: Implementation Planning Agent*  
*Date: 2026-01-14*