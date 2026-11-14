# Platform Tenants Page Enhancement - Implementation Plan

## Overview
Enhance the PlatformTenantsPage with bulk operations, remote control tab, advanced filters, CSV import, and real-time sync propagation.

---

## Phase 1: Backend Core (Week 1)

### 1.1 Email/SMS Notification Service
- **File**: `src/services/domains/notifications/NotificationServicePart01.ts`
- Add `sendEmail(to, subject, body)` and `sendSMS(to, body)` methods
- Integrate with existing notification preferences

### 1.2 Webhook/Outbox for Tenant Changes
- **File**: `src/services/domains/platform/PlatformAdminService.ts`
- Modify `setTenantStatus`, `changeTenantPlan`, `archiveTenant`, `cancelTenantSubscription` to enqueue outbox events
- **File**: `src/sync/SyncPolicyService.ts`
- Add platform tables to `SUPPORTED_SYNC_ENTITIES`

### 1.3 Bulk Operations Service Methods
- **File**: `src/services/domains/platform/PlatformAdminService.ts`
- Add: `bulkChangeTenantStatus`, `bulkChangeTenantPlan`, `bulkSendActivation`, `bulkExportTenants`, `bulkImportTenants`

### 1.4 Remote Control Data Aggregation
- **File**: `src/services/domains/platform/PlatformAdminService.ts`
- Add: `getTenantRemoteControl(tenantId)` - combines config, devices, push history

### 1.5 AuthService Tenant Integration
- **File**: `src/services/domains/auth/AuthService.ts`
- Add: `validateTenantCredentials`, `createTenantSession`

---

## Phase 2: Database Schema

### 2.1 New Table: platform_tenant_config_push
- **File**: `src/database/schema/part-*.ts`
- Columns: id, tenant_id, config_json, pushed_by, status, pushed_at, acknowledged_at, error_message, retry_count, created_at

---

## Phase 3: Frontend Enhancements (Week 2-3)

### 3.1 Bulk Selection Toolbar
- Add `selectedIds: Set<string>` state
- Header checkbox + row checkboxes
- Floating toolbar with bulk actions

### 3.2 Advanced Filters
- Date range picker (createdAt, subscriptionExpiresAt)
- Outstanding amount range
- Device utilization filter
- Health score filter
- Filter presets (localStorage)

### 3.3 CSV Import Modal
- File input with preview
- Column mapping UI
- Validation preview
- Progress indicator

### 3.4 Remote Control Tab (New)
- Applied Configuration display
- Config push form with preview
- Push history table
- Device status section
- Force sync button

### 3.5 Enhanced Detail View
- Last sync timestamp
- Sync status indicator
- Plan change impact preview

---

## Phase 4: Polish & Testing (Week 4)

- Detail modal periodic refresh
- Filter presets save/load
- End-to-end testing
- Export/Import round-trip verification

---

## Key Files to Modify

| File | Priority |
|------|----------|
| `src/services/domains/platform/PlatformAdminService.ts` | Critical |
| `src/services/domains/notifications/NotificationServicePart01.ts` | Critical |
| `src/services/domains/auth/AuthService.ts` | High |
| `src/sync/SyncPolicyService.ts` | High |
| `src/sync/OutboxRepository.ts` | High |
| `src/pages/platform/PlatformTenantsPage.tsx` | Critical |
| `src/pages/platform/components/PlatformUI.tsx` | High |
| `src/database/schema/part-*.ts` | Medium |

---

## Verification Checklist

- [ ] Create tenant → auto-send activation email/SMS
- [ ] Bulk select 10 tenants → change status to SUSPENDED → all update + outbox events
- [ ] Bulk change plan → new licenses issued for all
- [ ] CSV import → preview → map columns → import → verify created tenants
- [ ] Remote Control tab → view applied config → push new config → verify tenant receives it
- [ ] Tenant status change → outbox event enqueued → sync relay delivers to tenant ERP
- [ ] Detail modal shows real-time last_seen/sync status
- [ ] Filter presets save/load correctly
- [ ] Export/Import round-trip preserves data