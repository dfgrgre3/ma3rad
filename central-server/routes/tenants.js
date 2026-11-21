'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { recordAuditEvent } = require('../lib/audit');
const { authenticatePlatformUser, requirePlatformPermission, getScopedTenantIds, assertTenantAccess, tenantScopePredicate } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.view', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { search = '', status = '', planId = '' } = req.query;
      const scoped = await getScopedTenantIds(req);
      // LIMITED staff with no assigned tenants see an empty list (fail closed).
      if (Array.isArray(scoped) && scoped.length === 0) {
        return res.json([]);
      }
      let sql = 'SELECT * FROM platform_tenants WHERE 1=1';
      const params = [];
      const scopePredicate = tenantScopePredicate('id', scoped);
      sql += scopePredicate.clause;
      params.push(...scopePredicate.params);

      if (search) {
        sql += ' AND (name LIKE ? OR code LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      if (planId) {
        sql += ' AND plan_id = ?';
        params.push(planId);
      }

      sql += ` ORDER BY created_at DESC`;
      const rows = await db.all(sql, params);
      res.json(await enrichTenants(db, rows));
    } catch (err) {
      next(err);
    }
  }
);

const TENANT_STATUSES = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'];
const TENANT_STATUS_TRANSITIONS = {
  TRIAL: ['ACTIVE', 'SUSPENDED', 'CANCELLED'],
  ACTIVE: ['SUSPENDED', 'EXPIRED', 'CANCELLED'],
  SUSPENDED: ['ACTIVE', 'CANCELLED'],
  EXPIRED: ['ACTIVE', 'CANCELLED'],
  CANCELLED: ['TRIAL'],
};

function mapTenant(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contactName: row.contact_name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    country: row.country ?? null,
    city: row.city ?? null,
    address: row.address ?? null,
    businessType: row.business_type ?? null,
    status: row.status,
    planId: row.plan_id ?? null,
    planName: null,
    planPrice: null,
    subscriptionStartedAt: row.subscription_started_at ?? null,
    subscriptionExpiresAt: row.subscription_expires_at ?? null,
    seatsLimit: Number(row.seats_limit) || 1,
    branchesLimit: Number(row.branches_limit) || 1,
    devicesLimit: Number(row.devices_limit) || 1,
    notes: row.notes ?? null,
    activeLicenses: 0,
    licensesTotal: 0,
    devicesUsed: 0,
    outstanding: 0,
    subscriptionId: row.subscription_id ?? null,
    price: row.price ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TENANT_LIST_SQL = `
  SELECT t.*,
         p.name AS plan_name, p.price AS plan_price,
         (SELECT COUNT(*) FROM platform_subscriptions s WHERE s.tenant_id = t.id AND s.status IN ('ACTIVE','TRIAL')) AS active_licenses,
         (SELECT COUNT(*) FROM platform_licenses l WHERE l.tenant_id = t.id) AS licenses_total,
         (SELECT COUNT(*) FROM platform_devices d
          JOIN platform_licenses l ON l.id = d.license_id
          WHERE l.tenant_id = t.id AND d.status = 'ACTIVE') AS devices_used,
         COALESCE((
           SELECT SUM(i.total - COALESCE(i.paid_amount, 0))
           FROM platform_invoices i
           WHERE i.tenant_id = t.id AND i.status IN ('SENT','PARTIAL','OVERDUE')
         ), 0) AS outstanding
  FROM platform_tenants t
  LEFT JOIN platform_plans p ON p.id = t.plan_id`;

function mapEnrichedTenant(row) {
  return {
    ...mapTenant(row),
    planName: row.plan_name ?? null,
    planPrice: row.plan_price != null ? Number(row.plan_price) || 0 : null,
    activeLicenses: Number(row.active_licenses) || 0,
    licensesTotal: Number(row.licenses_total) || 0,
    devicesUsed: Number(row.devices_used) || 0,
    outstanding: Number(row.outstanding) || 0,
  };
}

async function enrichTenants(db, rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const [subs, licenses, devices, invoices, plans] = await Promise.all([
    db.all(`SELECT tenant_id, COUNT(*) AS c FROM platform_subscriptions WHERE tenant_id IN (${placeholders}) AND status IN ('ACTIVE','TRIAL') GROUP BY tenant_id`, ids),
    db.all(`SELECT tenant_id, COUNT(*) AS c FROM platform_licenses WHERE tenant_id IN (${placeholders}) GROUP BY tenant_id`, ids),
    db.all(`SELECT l.tenant_id, COUNT(*) AS c FROM platform_devices d JOIN platform_licenses l ON l.id = d.license_id WHERE l.tenant_id IN (${placeholders}) AND d.status = 'ACTIVE' GROUP BY l.tenant_id`, ids),
    db.all(`SELECT tenant_id, COALESCE(SUM(total - COALESCE(paid_amount,0)),0) AS outstanding FROM platform_invoices WHERE tenant_id IN (${placeholders}) AND status IN ('SENT','PARTIAL','OVERDUE') GROUP BY tenant_id`, ids),
    db.all(`SELECT id, name, price FROM platform_plans`),
  ]);
  const planById = new Map(plans.map((p) => [p.id, p]));
  const count = (rows2, key) => new Map(rows2.map((r) => [r[key], Number(r.c) || 0]));
  const subMap = count(subs, 'tenant_id');
  const licMap = count(licenses, 'tenant_id');
  const devMap = count(devices, 'tenant_id');
  const outMap = new Map(invoices.map((r) => [r.tenant_id, Number(r.outstanding) || 0]));
  return rows.map((row) => {
    const plan = row.plan_id ? planById.get(row.plan_id) : null;
    return {
      ...mapTenant(row),
      planName: plan?.name ?? null,
      planPrice: plan ? Number(plan.price) || 0 : null,
      activeLicenses: subMap.get(row.id) || 0,
      licensesTotal: licMap.get(row.id) || 0,
      devicesUsed: devMap.get(row.id) || 0,
      outstanding: outMap.get(row.id) || 0,
    };
  });
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function generateActivationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from(crypto.randomBytes(4)).map((b) => alphabet[b % alphabet.length]).join('');
  return `${seg()}-${seg()}-${seg()}`;
}

function generateTemporaryPassword() {
  return `Tmp-${crypto.randomBytes(6).toString('hex')}`;
}

function mapAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    username: row.username,
    email: row.email ?? null,
    fullName: row.full_name ?? null,
    isActive: Boolean(row.is_active),
    activationCode: row.activation_code ?? null,
    lastActivatedAt: row.last_activated_at ?? null,
    lastLoginAt: row.last_login_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSubscriptionRow(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    planId: row.plan_id,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date ?? null,
    seats: Number(row.seats) || 1,
    price: Number(row.price) || 0,
    billingCycle: row.billing_cycle,
    autoRenew: Boolean(row.auto_renew),
    branchesLimit: Number(row.branches_limit) || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLicenseRow(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    subscriptionId: row.subscription_id ?? null,
    planId: row.plan_id ?? null,
    licenseKey: row.license_key,
    status: row.status,
    issuedAt: row.issued_at,
    startsAt: row.starts_at ?? null,
    expiresAt: row.expires_at ?? null,
    seats: Number(row.seats) || 1,
    deviceLimit: Number(row.device_limit) || 1,
    branchesLimit: Number(row.branches_limit) || 1,
    modules: parseJson(row.modules, []),
    features: parseJson(row.features, []),
    activationCode: row.activation_code ?? null,
    certificate: row.certificate ?? null,
    offlineGracePeriodDays: row.offline_grace_period_days ?? null,
    couplingMode: row.coupling_mode ?? 'FULL',
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInvoiceRow(row) {
  return {
    id: row.id,
    number: row.number,
    tenantId: row.tenant_id,
    subscriptionId: row.subscription_id ?? null,
    issueDate: row.issue_date,
    dueDate: row.due_date ?? null,
    status: row.status,
    currency: row.currency ?? 'EGP',
    subtotal: Number(row.subtotal) || 0,
    discount: Number(row.discount) || 0,
    tax: Number(row.tax) || 0,
    total: Number(row.total) || 0,
    paidAmount: Number(row.paid_amount) || 0,
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
}

function mapAuditRow(row) {
  return {
    id: row.id,
    actorId: row.actor_id ?? null,
    actorName: row.actor_name ?? null,
    actorType: row.actor_type ?? 'PLATFORM',
    tenantId: row.tenant_id ?? null,
    action: row.action,
    entityType: row.resource_type ?? null,
    entityId: row.resource_id ?? null,
    details: row.after_data ?? row.before_data ?? null,
    severity: 'INFO',
    status: 'SUCCESS',
    ipAddress: row.ip_address ?? null,
    createdAt: row.created_at,
  };
}

function mapTenantUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    username: row.username ?? null,
    fullName: row.full_name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: row.role,
    status: row.status,
    isActive: row.status === 'ACTIVE',
    notes: row.notes ?? null,
    provisioningStatus: row.provisioning_status ?? 'NOT_REQUESTED',
    provisioningMode: row.provisioning_mode ?? null,
    identityUserId: row.identity_user_id ?? null,
    scope: row.scope ?? null,
    inviteExpiresAt: row.invite_expires_at ?? null,
    provisionedAt: row.provisioned_at ?? null,
    lastError: row.last_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Tenant-identity provisioning queue ──────────────────────────────────────
// Every mutation of a directory user that is (or will be) provisioned into the
// tenant ERP's local `users` table enqueues one job. The tenant device claims
// and executes it through /api/v1/device/provisioning/*.

async function enqueueProvisioningJob(db, { tenantId, tenantUserId, event, payload }) {
  const id = `tpj_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now = nowIso();
  await db.run(
    `INSERT INTO platform_tenant_provisioning_jobs (id, tenant_id, tenant_user_id, event, payload, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [id, tenantId, tenantUserId, event, JSON.stringify(payload || {}), now, now]
  );
  return id;
}

async function cancelPendingProvisioningJobs(db, tenantUserId) {
  const now = nowIso();
  await db.run(
    `UPDATE platform_tenant_provisioning_jobs
        SET status = 'CANCELLED', completed_at = ?, updated_at = ?
      WHERE tenant_user_id = ? AND status IN ('PENDING', 'CLAIMED')`,
    [now, now, tenantUserId]
  );
}

function isProvisionableRow(row) {
  const status = row?.provisioning_status;
  return Boolean(status) && status !== 'DIRECTORY_ONLY' && status !== 'NOT_REQUESTED';
}

function mapOverrideRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    kind: row.kind,
    code: row.code,
    value: row.value ?? null,
    isEnabled: Boolean(row.is_enabled),
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPaymentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    invoiceId: row.invoice_id ?? null,
    invoiceNumber: row.invoice_number ?? null,
    tenantId: row.tenant_id,
    amount: Number(row.amount) || 0,
    method: row.method,
    reference: row.reference ?? null,
    paidAt: row.paid_at,
    notes: row.notes ?? null,
  };
}

function mapRemoteConfigRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.config_key,
    value: row.config_value ?? null,
    scope: row.scope,
    targetDeviceIds: parseJson(row.target_device_ids, []),
    status: row.status,
    appliedAt: row.applied_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlanRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    billingCycle: row.billing_cycle,
    price: Number(row.price) || 0,
    monthlyPrice: Number(row.monthly_price) || 0,
    yearlyPrice: Number(row.yearly_price) || 0,
    currency: row.currency ?? 'EGP',
    seatsLimit: Number(row.seats_limit) || 1,
    branchesLimit: Number(row.branches_limit) || 1,
    devicesLimit: Number(row.devices_limit) || 1,
    storageLimitMb: Number(row.storage_limit_mb) || 500,
    maxProducts: Number(row.max_products) || 1000,
    maxWarehouses: Number(row.max_warehouses) || 2,
    trialDays: Number(row.trial_days) || 14,
    includedModules: parseJson(row.included_modules, []),
    features: parseJson(row.features, []),
    permissions: parseJson(row.permissions, []),
    isActive: Boolean(row.is_active),
    isDefault: Boolean(row.is_default),
    sortOrder: Number(row.sort_order) || 0,
    subscriberCount: Number(row.subscriber_count) || 0,
    offlineGracePeriodDays: Number(row.offline_grace_period_days) || 14,
    versioned: Boolean(row.versioned),
    currentVersion: row.current_version ?? null,
  };
}

router.get(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.view', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const tenant = await db.get(`${TENANT_LIST_SQL} WHERE t.id = ?`, [req.params.id]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, tenant.id))) return;
      const [enriched] = await enrichTenants(db, [tenant]);
      res.json(enriched);
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const existing = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [id]);
      if (!existing) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, id))) return;

      const {
        name, code, contactName, email, phone, country, city, address,
        businessType, notes, seatsLimit, branchesLimit, devicesLimit,
      } = req.body || {};

      if (code !== undefined && String(code).trim().toUpperCase() !== existing.code) {
        const clash = await db.get('SELECT 1 FROM platform_tenants WHERE code = ? AND id != ?', [String(code).trim().toUpperCase(), id]);
        if (clash) return res.status(400).json({ error: 'Tenant code already exists' });
      }

      const now = nowIso();
      await db.run(
        `UPDATE platform_tenants SET
           name = ?, code = ?, contact_name = ?, email = ?, phone = ?, country = ?, city = ?,
           address = ?, business_type = ?, notes = ?, seats_limit = ?, branches_limit = ?,
           devices_limit = ?, updated_at = ?
         WHERE id = ?`,
        [
          name !== undefined ? String(name).trim() : existing.name,
          code !== undefined ? String(code).trim().toUpperCase() : existing.code,
          contactName !== undefined ? contactName : existing.contact_name,
          email !== undefined ? email : existing.email,
          phone !== undefined ? phone : existing.phone,
          country !== undefined ? country : existing.country,
          city !== undefined ? city : existing.city,
          address !== undefined ? address : existing.address,
          businessType !== undefined ? businessType : existing.business_type,
          notes !== undefined ? notes : existing.notes,
          seatsLimit !== undefined ? Math.max(1, Number(seatsLimit) || 1) : existing.seats_limit,
          branchesLimit !== undefined ? Math.max(1, Number(branchesLimit) || 1) : existing.branches_limit,
          devicesLimit !== undefined ? Math.max(1, Number(devicesLimit) || 1) : existing.devices_limit,
          now, id,
        ]
      );

      const updated = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: id,
        action: 'TENANT_UPDATED',
        resourceType: 'platform_tenants',
        resourceId: id,
        beforeData: { name: existing.name, status: existing.status },
        afterData: { name: updated.name, status: updated.status },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.json(mapTenant(updated));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/status',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { status } = req.body || {};
      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [id]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, id))) return;
      if (!TENANT_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Allowed: ${TENANT_STATUSES.join(', ')}` });
      }
      const allowed = TENANT_STATUS_TRANSITIONS[tenant.status] || [];
      if (status !== tenant.status && !allowed.includes(status)) {
        return res.status(400).json({ error: `Cannot transition tenant from ${tenant.status} to ${status}` });
      }
      await db.run('UPDATE platform_tenants SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: id,
        action: 'TENANT_STATUS_CHANGED',
        resourceType: 'platform_tenants',
        resourceId: id,
        beforeData: { status: tenant.status },
        afterData: { status },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      const updated = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [id]);
      res.json(mapTenant(updated));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/archive',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.delete', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [id]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, id))) return;
      if (tenant.status === 'CANCELLED') {
        return res.status(400).json({ error: 'Tenant is already cancelled/archived' });
      }
      await db.run(`UPDATE platform_tenants SET status = 'CANCELLED', updated_at = ? WHERE id = ?`, [nowIso(), id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: id,
        action: 'TENANT_ARCHIVED',
        resourceType: 'platform_tenants',
        resourceId: id,
        beforeData: { status: tenant.status },
        afterData: { status: 'CANCELLED' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.json({ data: { id, status: 'CANCELLED' }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

/** Aggregated tenant profile: subscription, licenses, devices, recent audit. */
router.get(
  '/:id/profile',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.view', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [id]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, id))) return;

      const [tenantRow, subscriptions, licenses, devices, invoices, payments, account, auditRows, branchCount] = await Promise.all([
        db.get(`${TENANT_LIST_SQL} WHERE t.id = ?`, [id]),
        db.all('SELECT * FROM platform_subscriptions WHERE tenant_id = ? ORDER BY created_at DESC', [id]),
        db.all('SELECT * FROM platform_licenses WHERE tenant_id = ? ORDER BY created_at DESC', [id]),
        db.all('SELECT * FROM platform_devices WHERE tenant_id = ? ORDER BY last_seen_at DESC', [id]),
        db.all('SELECT * FROM platform_invoices WHERE tenant_id = ? ORDER BY created_at DESC', [id]),
        db.all('SELECT p.*, i.number AS invoice_number FROM platform_payments p LEFT JOIN platform_invoices i ON i.id = p.invoice_id WHERE p.tenant_id = ? ORDER BY p.paid_at DESC', [id]),
        db.get('SELECT * FROM platform_tenant_accounts WHERE tenant_id = ?', [id]),
        db.all('SELECT * FROM platform_audit_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200', [id]),
        db.get("SELECT COUNT(*) AS c FROM platform_tenant_branches WHERE tenant_id = ? AND status != 'CLOSED'", [id]),
      ]);
      if (!tenantRow) return res.status(404).json({ error: 'Tenant not found' });
      const [enrichedTenant] = await enrichTenants(db, [tenantRow]);
      const plan = enrichedTenant.planId ? await db.get('SELECT * FROM platform_plans WHERE id = ?', [enrichedTenant.planId]) : null;

      const mappedLicenses = licenses.map(mapLicenseRow);
      const activeLicenses = mappedLicenses.filter((l) => l.status === 'ACTIVE' || l.status === 'ISSUED');
      const modulesCount = new Set(activeLicenses.flatMap((l) => l.modules || [])).size;
      const devicesUsed = devices.filter((d) => d.status === 'ACTIVE').length;
      const mappedAudit = auditRows.map(mapAuditRow);
      const activationLog = mappedAudit.filter((e) =>
        /ACTIVAT|LICENSE|DEVICE/i.test(String(e.entityType ?? '')) || /ACTIVAT/i.test(String(e.action)));
      const changeLog = mappedAudit.filter((e) =>
        ['TENANT', 'SUBSCRIPTION', 'LICENSE', 'INVOICE', 'PAYMENT'].includes(String(e.entityType)));

      res.json({
        data: {
          tenant: enrichedTenant,
          plan: mapPlanRow(plan),
          account: mapAccount(account),
          subscriptions: subscriptions.map(mapSubscriptionRow),
          licenses: mappedLicenses,
          invoices: invoices.map(mapInvoiceRow),
          payments: payments.map(mapPaymentRow),
          devices: devices.map((d) => ({
            id: d.id,
            licenseId: d.license_id,
            hardwareId: d.hardware_id,
            name: d.name,
            status: d.status,
            firstActivatedAt: d.first_activated_at,
            lastSeenAt: d.last_seen_at,
            cloneSuspected: Boolean(d.clone_suspected),
          })),
          usage: {
            seatsLimit: enrichedTenant.seatsLimit,
            devicesLimit: enrichedTenant.devicesLimit,
            devicesUsed,
            branchesLimit: enrichedTenant.branchesLimit,
            branchesUsed: branchCount?.c ?? 0,
            modulesCount,
          },
          activationLog,
          changeLog,
          activityLog: mappedAudit,
        },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.create', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { name, code, contactName, email, phone, country, city, address, businessType } = req.body || {};

      // Scoped staff may not create tenants outside their scope; creating a new
      // tenant would land it in a scope they have no rights to observe.
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped)) {
        return res.status(403).json({ error: 'Scoped staff cannot create tenants' });
      }

      if (!name || !code) {
        return res.status(400).json({ error: 'Name and code are required' });
      }

      const id = `tenant_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const tenantCode = String(code).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');

      const existing = await db.get('SELECT 1 FROM platform_tenants WHERE code = ?', [tenantCode]);
      if (existing) {
        return res.status(400).json({ error: 'Tenant code already exists' });
      }

      await db.run(
        `INSERT INTO platform_tenants (id, code, name, contact_name, email, phone, country, city, address, business_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantCode, String(name).trim(), contactName, email, phone, country, city, address, businessType]
      );

      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: id,
        action: 'TENANT_CREATED',
        resourceType: 'platform_tenants',
        resourceId: id,
        afterData: { code: tenantCode, name: String(name).trim() },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(201).json(tenant);
    } catch (err) {
      next(err);
    }
  }
);

/** Create the tenant's ERP admin account (credentials returned once). */
router.post(
  '/:id/account',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [id]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!(await assertTenantAccess(req, res, id))) return;

      const existing = await db.get('SELECT * FROM platform_tenant_accounts WHERE tenant_id = ?', [id]);
      if (existing) return res.status(400).json({ error: 'Tenant already has an account' });

      const base = String(req.body?.username || tenant.name || 'user')
        .trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24) || 'user';
      let username = base;
      let index = 2;
      while (await db.get('SELECT 1 FROM platform_tenant_accounts WHERE username = ?', [username])) {
        username = `${base}${index}`.slice(0, 24);
        index += 1;
      }

      const temporaryPassword = req.body?.password || generateTemporaryPassword();
      const activationCode = generateActivationCode();
      const accountId = `tacc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_tenant_accounts
          (id, tenant_id, username, email, full_name, password_hash, is_active, activation_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [
          accountId, id, username,
          req.body?.email ?? tenant.email ?? null,
          req.body?.fullName ?? tenant.contact_name ?? null,
          await bcrypt.hash(String(temporaryPassword), 10),
          activationCode, now, now,
        ]
      );
      const account = await db.get('SELECT * FROM platform_tenant_accounts WHERE id = ?', [accountId]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: id,
        action: 'TENANT_ACCOUNT_CREATED',
        resourceType: 'platform_tenant_accounts',
        resourceId: accountId,
        afterData: { username },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(201).json({ account: mapAccount(account), temporaryPassword, activationCode });
    } catch (err) {
      next(err);
    }
  }
);

/** Rotate the tenant account password; the plaintext is returned once. */
router.post(
  '/:id/account/reset-password',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      if (!(await assertTenantAccess(req, res, id))) return;
      const account = await db.get('SELECT * FROM platform_tenant_accounts WHERE tenant_id = ?', [id]);
      if (!account) return res.status(404).json({ error: 'Tenant account not found' });

      const temporaryPassword = generateTemporaryPassword();
      await db.run(
        'UPDATE platform_tenant_accounts SET password_hash = ?, updated_at = ? WHERE id = ?',
        [await bcrypt.hash(temporaryPassword, 10), nowIso(), account.id]
      );
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: id,
        action: 'TENANT_ACCOUNT_PASSWORD_RESET',
        resourceType: 'platform_tenant_accounts',
        resourceId: account.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.json({ temporaryPassword });
    } catch (err) {
      next(err);
    }
  }
);

/** Update the tenant account profile; optional password sets a new one. */
router.put(
  '/:id/account',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      if (!(await assertTenantAccess(req, res, id))) return;
      const account = await db.get('SELECT * FROM platform_tenant_accounts WHERE tenant_id = ?', [id]);
      if (!account) return res.status(404).json({ error: 'Tenant account not found' });

      const { username, email, fullName, password } = req.body || {};
      let nextUsername = account.username;
      if (username !== undefined) {
        nextUsername = String(username).trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,24}$/.test(nextUsername)) {
          return res.status(400).json({ error: 'username must be 3-24 chars of a-z, 0-9, . _ -' });
        }
        if (nextUsername !== account.username) {
          const clash = await db.get('SELECT 1 FROM platform_tenant_accounts WHERE username = ? AND id != ?', [nextUsername, account.id]);
          if (clash) return res.status(400).json({ error: 'Username already taken' });
        }
      }
      if (password !== undefined && password !== null && String(password).length > 0 && String(password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const sets = ['username = ?', 'email = ?', 'full_name = ?', 'updated_at = ?'];
      const params = [
        nextUsername,
        email !== undefined ? email : account.email,
        fullName !== undefined ? (fullName ? String(fullName).trim() : null) : account.full_name,
        nowIso(),
      ];
      if (password !== undefined && password !== null && String(password).length > 0) {
        sets.push('password_hash = ?');
        params.push(await bcrypt.hash(String(password), 10));
      }
      params.push(account.id);
      await db.run(`UPDATE platform_tenant_accounts SET ${sets.join(', ')} WHERE id = ?`, params);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: id,
        action: 'TENANT_ACCOUNT_UPDATED',
        resourceType: 'platform_tenant_accounts',
        resourceId: account.id,
        beforeData: { username: account.username },
        afterData: { username: nextUsername, passwordChanged: Boolean(password) },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      const updated = await db.get('SELECT * FROM platform_tenant_accounts WHERE id = ?', [account.id]);
      res.json(mapAccount(updated));
    } catch (err) {
      next(err);
    }
  }
);

/** Suspend/reactivate the tenant's ERP admin account. */
router.post(
  '/:id/account/status',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { isActive } = req.body || {};
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive (boolean) is required' });
      }
      if (!(await assertTenantAccess(req, res, id))) return;
      const account = await db.get('SELECT * FROM platform_tenant_accounts WHERE tenant_id = ?', [id]);
      if (!account) return res.status(404).json({ error: 'Tenant account not found' });
      await db.run('UPDATE platform_tenant_accounts SET is_active = ?, updated_at = ? WHERE id = ?', [isActive ? 1 : 0, nowIso(), account.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: id,
        action: isActive ? 'TENANT_ACCOUNT_ACTIVATED' : 'TENANT_ACCOUNT_SUSPENDED',
        resourceType: 'platform_tenant_accounts',
        resourceId: account.id,
        beforeData: { isActive: Boolean(account.is_active) },
        afterData: { isActive },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      const updated = await db.get('SELECT * FROM platform_tenant_accounts WHERE id = ?', [account.id]);
      res.json(mapAccount(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── Tenant directory users ──────────────────────────────────────────────────

router.get(
  '/:id/users',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.view', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      if (!(await assertTenantAccess(req, res, req.params.id))) return;
      const rows = await db.all('SELECT * FROM platform_tenant_users WHERE tenant_id = ? ORDER BY created_at DESC', [req.params.id]);
      res.json(rows.map(mapTenantUserRow));
    } catch (err) { next(err); }
  }
);

router.post(
  '/:id/users',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { fullName, username, email, phone, role, notes, scope, provisioningMode, password } = req.body || {};
      if (!fullName || String(fullName).trim().length < 2) {
        return res.status(400).json({ error: 'fullName is required' });
      }
      if (!(await assertTenantAccess(req, res, id))) return;

      const mode = provisioningMode === 'INVITE' ? 'INVITE' : 'DIRECT_CREATE';
      const provisionIdentity = req.body?.provisionIdentity !== false;
      const now = nowIso();
      const userId = `tuser_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const baseUsername = String(username || fullName || 'user')
        .trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 24) || 'user';
      let finalUsername = baseUsername;
      let idx = 2;
      while (await db.get('SELECT 1 FROM platform_tenant_users WHERE tenant_id = ? AND username = ?', [id, finalUsername])) {
        finalUsername = `${baseUsername}${idx}`.slice(0, 24);
        idx += 1;
      }

      const inviteCode = generateActivationCode();
      const temporaryPassword = password || generateTemporaryPassword();
      const inviteCodeHash = await bcrypt.hash(inviteCode, 10);
      const tempHash = await bcrypt.hash(String(temporaryPassword), 10);
      const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const provisioningStatus = !provisionIdentity ? 'DIRECTORY_ONLY' : mode === 'INVITE' ? 'INVITED' : 'PENDING';
      const status = provisionIdentity && mode === 'INVITE' ? 'INVITED' : 'ACTIVE';

      await db.run(
        `INSERT INTO platform_tenant_users
          (id, tenant_id, username, full_name, email, phone, role, status, notes, provisioning_status, provisioning_mode,
           scope, invite_code, temporary_password, invite_expires_at, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [userId, id, finalUsername, String(fullName).trim(), email ?? null, phone ?? null,
         role || 'USER', status, notes ?? null, provisioningStatus, provisionIdentity ? mode : null,
         scope ?? null, provisionIdentity ? inviteCodeHash : null, provisionIdentity ? tempHash : null,
         provisionIdentity ? inviteExpiresAt : null, now, now]
      );
      const row = await db.get('SELECT * FROM platform_tenant_users WHERE id = ?', [userId]);
      if (provisionIdentity) {
        await enqueueProvisioningJob(db, {
          tenantId: id,
          tenantUserId: userId,
          event: 'PROVISION',
          payload: {
            username: finalUsername,
            fullName: String(fullName).trim(),
            email: email ?? null,
            phone: phone ?? null,
            role: role || 'USER',
            temporaryPassword: String(temporaryPassword),
            mode,
            inviteExpiresAt,
          },
        });
      }
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: id,
        action: 'TENANT_USER_CREATED', resourceType: 'platform_tenant_users', resourceId: userId,
        afterData: { username: finalUsername, role: role || 'USER', provisioningStatus },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      res.status(201).json({
        user: mapTenantUserRow(row),
        inviteCode: provisionIdentity ? inviteCode : null,
        temporaryPassword: provisionIdentity ? temporaryPassword : null,
        provisioned: false,
      });
    } catch (err) { next(err); }
  }
);

router.put(
  '/:id/users/:userId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id, userId } = req.params;
      const existing = await db.get('SELECT * FROM platform_tenant_users WHERE id = ? AND tenant_id = ?', [userId, id]);
      if (!existing) return res.status(404).json({ error: 'User not found' });
      if (!(await assertTenantAccess(req, res, id))) return;
      const { fullName, username, email, phone, role, notes, status } = req.body || {};
      const nextUsername = username !== undefined
        ? String(username).trim().toLowerCase()
        : existing.username;
      await db.run(
        `UPDATE platform_tenant_users SET username=?, full_name=?, email=?, phone=?, role=?, notes=?, status=?, updated_at=? WHERE id=?`,
        [
          nextUsername,
          fullName !== undefined ? String(fullName).trim() : existing.full_name,
          email !== undefined ? email : existing.email,
          phone !== undefined ? phone : existing.phone,
          role !== undefined ? role : existing.role,
          notes !== undefined ? notes : existing.notes,
          status !== undefined ? status : existing.status,
          nowIso(), userId,
        ]
      );
      if (isProvisionableRow(existing)) {
        await enqueueProvisioningJob(db, {
          tenantId: id,
          tenantUserId: userId,
          event: 'UPDATE',
          payload: {
            username: nextUsername,
            previousUsername: nextUsername !== existing.username ? existing.username : null,
            fullName: fullName !== undefined ? String(fullName).trim() : existing.full_name,
            email: email !== undefined ? email : existing.email,
            phone: phone !== undefined ? phone : existing.phone,
            role: role !== undefined ? role : existing.role,
            isActive: (status !== undefined ? status : existing.status) === 'ACTIVE',
          },
        });
      }
      const row = await db.get('SELECT * FROM platform_tenant_users WHERE id = ?', [userId]);
      res.json(mapTenantUserRow(row));
    } catch (err) { next(err); }
  }
);

router.delete(
  '/:id/users/:userId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id, userId } = req.params;
      const existing = await db.get('SELECT * FROM platform_tenant_users WHERE id = ? AND tenant_id = ?', [userId, id]);
      if (!existing) return res.status(404).json({ error: 'User not found' });
      if (!(await assertTenantAccess(req, res, id))) return;
      await cancelPendingProvisioningJobs(db, userId);
      if (isProvisionableRow(existing)) {
        await enqueueProvisioningJob(db, {
          tenantId: id,
          tenantUserId: userId,
          event: 'DELETE',
          payload: { username: existing.username },
        });
      }
      await db.run('DELETE FROM platform_tenant_users WHERE id = ?', [userId]);
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: id,
        action: 'TENANT_USER_DELETED', resourceType: 'platform_tenant_users', resourceId: userId,
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      res.json({ data: { id: userId, deleted: true } });
    } catch (err) { next(err); }
  }
);

router.post(
  '/:id/users/:userId/status',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id, userId } = req.params;
      const { isActive } = req.body || {};
      if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive (boolean) is required' });
      const existing = await db.get('SELECT * FROM platform_tenant_users WHERE id = ? AND tenant_id = ?', [userId, id]);
      if (!existing) return res.status(404).json({ error: 'User not found' });
      if (!(await assertTenantAccess(req, res, id))) return;
      await db.run('UPDATE platform_tenant_users SET status = ?, is_active = ?, updated_at = ? WHERE id = ?',
        [isActive ? 'ACTIVE' : 'SUSPENDED', isActive ? 1 : 0, nowIso(), userId]);
      if (isProvisionableRow(existing)) {
        await enqueueProvisioningJob(db, {
          tenantId: id,
          tenantUserId: userId,
          event: 'STATUS',
          payload: { username: existing.username, isActive },
        });
      }
      const row = await db.get('SELECT * FROM platform_tenant_users WHERE id = ?', [userId]);
      res.json(mapTenantUserRow(row));
    } catch (err) { next(err); }
  }
);

router.post(
  '/:id/users/:userId/resend-invite',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id, userId } = req.params;
      const existing = await db.get('SELECT * FROM platform_tenant_users WHERE id = ? AND tenant_id = ?', [userId, id]);
      if (!existing) return res.status(404).json({ error: 'User not found' });
      if (!(await assertTenantAccess(req, res, id))) return;
      const inviteCode = generateActivationCode();
      const temporaryPassword = generateTemporaryPassword();
      const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await db.run(
        `UPDATE platform_tenant_users SET invite_code=?, temporary_password=?, invite_expires_at=?,
           provisioning_status='INVITED', status='INVITED', last_error=NULL, updated_at=? WHERE id=?`,
        [await bcrypt.hash(inviteCode, 10), await bcrypt.hash(temporaryPassword, 10), inviteExpiresAt, nowIso(), userId]
      );
      await enqueueProvisioningJob(db, {
        tenantId: id,
        tenantUserId: userId,
        event: 'PROVISION',
        payload: {
          username: existing.username,
          fullName: existing.full_name,
          email: existing.email,
          phone: existing.phone,
          role: existing.role,
          temporaryPassword: String(temporaryPassword),
          mode: 'INVITE',
          inviteExpiresAt,
        },
      });
      const row = await db.get('SELECT * FROM platform_tenant_users WHERE id = ?', [userId]);
      res.json({ user: mapTenantUserRow(row), inviteCode, temporaryPassword });
    } catch (err) { next(err); }
  }
);

// ─── Tenant overrides ────────────────────────────────────────────────────────

router.get(
  '/:id/overrides',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.view', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      if (!(await assertTenantAccess(req, res, req.params.id))) return;
      const rows = await db.all('SELECT * FROM platform_tenant_overrides WHERE tenant_id = ? ORDER BY created_at DESC', [req.params.id]);
      res.json(rows.map(mapOverrideRow));
    } catch (err) { next(err); }
  }
);

router.post(
  '/:id/overrides',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { kind, code, value, isEnabled, notes } = req.body || {};
      if (!code || !String(code).trim()) return res.status(400).json({ error: 'code is required' });
      if (!(await assertTenantAccess(req, res, id))) return;
      const overrideId = `tover_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_tenant_overrides (id, tenant_id, kind, code, value, is_enabled, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [overrideId, id, kind || 'MODULE', String(code).trim(), value ?? null, isEnabled === false ? 0 : 1, notes ?? null, now, now]
      );
      const row = await db.get('SELECT * FROM platform_tenant_overrides WHERE id = ?', [overrideId]);
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: id,
        action: 'TENANT_OVERRIDE_ADDED', resourceType: 'platform_tenant_overrides', resourceId: overrideId,
        afterData: { kind: kind || 'MODULE', code },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      res.status(201).json(mapOverrideRow(row));
    } catch (err) { next(err); }
  }
);

router.delete(
  '/:id/overrides/:overrideId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id, overrideId } = req.params;
      const existing = await db.get('SELECT * FROM platform_tenant_overrides WHERE id = ? AND tenant_id = ?', [overrideId, id]);
      if (!existing) return res.status(404).json({ error: 'Override not found' });
      if (!(await assertTenantAccess(req, res, id))) return;
      await db.run('DELETE FROM platform_tenant_overrides WHERE id = ?', [overrideId]);
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: id,
        action: 'TENANT_OVERRIDE_REMOVED', resourceType: 'platform_tenant_overrides', resourceId: overrideId,
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      res.json({ data: { id: overrideId, deleted: true } });
    } catch (err) { next(err); }
  }
);

// ─── Payments ────────────────────────────────────────────────────────────────

router.post(
  '/:id/payments',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.billing.create', 'platform.billing.manage', 'platform.tenants.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { amount, method, invoiceId, reference, notes, paidAt } = req.body || {};
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
      if (!(await assertTenantAccess(req, res, id))) return;

      const paymentId = `pay_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_payments (id, invoice_id, tenant_id, amount, method, reference, notes, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, invoiceId ?? null, id, value, method || 'CASH', reference ?? null, notes ?? null, paidAt || now, now]
      );

      if (invoiceId) {
        const invoice = await db.get('SELECT * FROM platform_invoices WHERE id = ? AND tenant_id = ?', [invoiceId, id]);
        if (invoice) {
          const paidAmount = (Number(invoice.paid_amount) || 0) + value;
          const total = Number(invoice.total) || 0;
          const newStatus = paidAmount >= total ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : invoice.status;
          await db.run('UPDATE platform_invoices SET paid_amount = ?, status = ?, updated_at = ? WHERE id = ?',
            [paidAmount, newStatus, now, invoiceId]);
        }
      }

      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: id,
        action: 'PAYMENT_RECORDED', resourceType: 'platform_payments', resourceId: paymentId,
        afterData: { amount: value, method: method || 'CASH', invoiceId: invoiceId ?? null },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT p.*, i.number AS invoice_number FROM platform_payments p LEFT JOIN platform_invoices i ON i.id = p.invoice_id WHERE p.id = ?', [paymentId]);
      res.status(201).json(mapPaymentRow(row));
    } catch (err) { next(err); }
  }
);

// ─── Remote control / config push ────────────────────────────────────────────

router.get(
  '/:id/remote',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.view', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      if (!(await assertTenantAccess(req, res, id))) return;
      const [devices, configs, history] = await Promise.all([
        db.all('SELECT * FROM platform_devices WHERE tenant_id = ? ORDER BY last_seen_at DESC', [id]),
        db.all('SELECT * FROM platform_remote_config WHERE tenant_id = ? AND status = \'APPLIED\' ORDER BY updated_at DESC LIMIT 50', [id]),
        db.all('SELECT * FROM platform_remote_config WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50', [id]),
      ]);
      res.json({
        devices: devices.map((d) => ({
          id: d.id, licenseId: d.license_id, hardwareId: d.hardware_id, name: d.name,
          status: d.status, firstActivatedAt: d.first_activated_at, lastSeenAt: d.last_seen_at,
          cloneSuspected: Boolean(d.clone_suspected),
        })),
        appliedConfig: configs[0] ? mapRemoteConfigRow(configs[0]) : null,
        configPushHistory: history.map(mapRemoteConfigRow),
        lastSync: null,
      });
    } catch (err) { next(err); }
  }
);

router.post(
  '/:id/remote/config',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { key, value, scope, targetDeviceIds } = req.body || {};
      if (!key || !String(key).trim()) return res.status(400).json({ error: 'key is required' });
      if (!(await assertTenantAccess(req, res, id))) return;
      const configId = `rcfg_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_remote_config (id, tenant_id, config_key, config_value, scope, target_device_ids, status, applied_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'APPLIED', ?, ?, ?)`,
        [configId, id, String(key).trim(), value != null ? String(value) : null,
         scope || 'TENANT', JSON.stringify(Array.isArray(targetDeviceIds) ? targetDeviceIds : []), now, now, now]
      );
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: id,
        action: 'REMOTE_CONFIG_PUSHED', resourceType: 'platform_remote_config', resourceId: configId,
        afterData: { key, scope: scope || 'TENANT' },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT * FROM platform_remote_config WHERE id = ?', [configId]);
      res.status(201).json(mapRemoteConfigRow(row));
    } catch (err) { next(err); }
  }
);

router.post(
  '/:id/remote/sync',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      if (!(await assertTenantAccess(req, res, id))) return;
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: id,
        action: 'TENANT_SYNC_REQUESTED', resourceType: 'platform_tenants', resourceId: id,
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      res.json({ data: { tenantId: id, syncRequested: true }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ─── Tenant branches ─────────────────────────────────────────────────────────

function mapBranchRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    city: row.city ?? null,
    country: row.country ?? null,
    address: row.address ?? null,
    phone: row.phone ?? null,
    status: row.status,
    seatsLimit: row.seats_limit,
    devicesLimit: row.devices_limit,
    isMain: Boolean(row.is_main),
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getTenantOr404(db, req, res, id) {
  const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [id]);
  if (!tenant) { res.status(404).json({ error: 'Tenant not found' }); return null; }
  if (!(await assertTenantAccess(req, res, id))) return null;
  return tenant;
}

router.get(
  '/:id/branches',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.view', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      if (!(await getTenantOr404(db, req, res, id))) return;
      const rows = await db.all(
        'SELECT * FROM platform_tenant_branches WHERE tenant_id = ? ORDER BY is_main DESC, name ASC',
        [id]
      );
      res.json({ data: rows.map(mapBranchRow), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.post(
  '/:id/branches',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const tenant = await getTenantOr404(db, req, res, id);
      if (!tenant) return;
      const { code, name, city, country, address, phone, seatsLimit, devicesLimit, isMain, notes } = req.body || {};
      if (!code || !name) return res.status(400).json({ error: 'code and name are required' });

      const branchCode = String(code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      const dup = await db.get('SELECT 1 FROM platform_tenant_branches WHERE tenant_id = ? AND code = ?', [id, branchCode]);
      if (dup) return res.status(400).json({ error: 'Branch code already exists for this tenant' });

      const { c: used } = await db.get(
        "SELECT COUNT(*) AS c FROM platform_tenant_branches WHERE tenant_id = ? AND status != 'CLOSED'", [id]
      ) ?? { c: 0 };
      if (used >= (tenant.branches_limit ?? 1)) {
        return res.status(409).json({ error: `Branch limit reached (${tenant.branches_limit})` });
      }

      const branchId = `br_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_tenant_branches
         (id, tenant_id, code, name, city, country, address, phone, seats_limit, devices_limit, is_main, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [branchId, id, branchCode, String(name).trim(), city, country, address, phone,
         Math.max(1, Number(seatsLimit) || 1), Math.max(1, Number(devicesLimit) || 1),
         isMain ? 1 : 0, notes, now, now]
      );
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: id,
        action: 'TENANT_BRANCH_CREATED', resourceType: 'platform_tenant_branches', resourceId: branchId,
        afterData: { code: branchCode, name },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT * FROM platform_tenant_branches WHERE id = ?', [branchId]);
      res.status(201).json({ data: mapBranchRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.put(
  '/:id/branches/:branchId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id, branchId } = req.params;
      if (!(await getTenantOr404(db, req, res, id))) return;
      const branch = await db.get('SELECT * FROM platform_tenant_branches WHERE id = ? AND tenant_id = ?', [branchId, id]);
      if (!branch) return res.status(404).json({ error: 'Branch not found' });
      const { code, name, city, country, address, phone, status, seatsLimit, devicesLimit, isMain, notes } = req.body || {};
      if (status && !['ACTIVE', 'SUSPENDED', 'CLOSED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid branch status' });
      }
      if (code) {
        const branchCode = String(code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        const dup = await db.get('SELECT 1 FROM platform_tenant_branches WHERE tenant_id = ? AND code = ? AND id != ?', [id, branchCode, branchId]);
        if (dup) return res.status(400).json({ error: 'Branch code already exists for this tenant' });
      }
      await db.run(
        `UPDATE platform_tenant_branches SET
           code = COALESCE(?, code), name = COALESCE(?, name), city = COALESCE(?, city),
           country = COALESCE(?, country), address = COALESCE(?, address), phone = COALESCE(?, phone),
           status = COALESCE(?, status), seats_limit = COALESCE(?, seats_limit),
           devices_limit = COALESCE(?, devices_limit), is_main = COALESCE(?, is_main),
           notes = COALESCE(?, notes), updated_at = ?
         WHERE id = ?`,
        [
          code ? String(code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') : null,
          name != null ? String(name).trim() : null,
          city ?? null, country ?? null, address ?? null, phone ?? null,
          status ?? null,
          seatsLimit != null ? Math.max(1, Number(seatsLimit) || 1) : null,
          devicesLimit != null ? Math.max(1, Number(devicesLimit) || 1) : null,
          isMain != null ? (isMain ? 1 : 0) : null,
          notes ?? null, nowIso(), branchId,
        ]
      );
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: id,
        action: 'TENANT_BRANCH_UPDATED', resourceType: 'platform_tenant_branches', resourceId: branchId,
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT * FROM platform_tenant_branches WHERE id = ?', [branchId]);
      res.json({ data: mapBranchRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

router.delete(
  '/:id/branches/:branchId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id, branchId } = req.params;
      if (!(await getTenantOr404(db, req, res, id))) return;
      const branch = await db.get('SELECT * FROM platform_tenant_branches WHERE id = ? AND tenant_id = ?', [branchId, id]);
      if (!branch) return res.status(404).json({ error: 'Branch not found' });
      if (branch.is_main) {
        return res.status(409).json({ error: 'Cannot delete the main branch — reassign is_main first' });
      }
      await db.run("UPDATE platform_tenant_branches SET status = 'CLOSED', updated_at = ? WHERE id = ?", [nowIso(), branchId]);
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name, tenantId: id,
        action: 'TENANT_BRANCH_CLOSED', resourceType: 'platform_tenant_branches', resourceId: branchId,
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      res.json({ data: { id: branchId, status: 'CLOSED' }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ─── Tenant API keys ─────────────────────────────────────────────────────────
// Customer-scoped keys for /api/v1/tenant/v1/*. The plaintext key is returned
// exactly once at creation; only its SHA-256 is stored.

const API_KEY_SCOPES = new Set(['read', '*']);

function mapApiKeyRow(row) {
  if (!row) return null;
  let scopes = [];
  try { scopes = JSON.parse(row.scopes || '[]'); } catch { scopes = []; }
  return {
    id: row.id,
    tenantId: row.tenant_id ?? null,
    name: row.name,
    prefix: row.prefix ?? null,
    scopes: Array.isArray(scopes) ? scopes : [],
    isActive: Boolean(row.is_active) && !row.revoked_at,
    lastUsedAt: row.last_used_at ?? null,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? null,
  };
}

router.get(
  '/:id/api-keys',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.view', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      if (!(await getTenantOr404(db, req, res, id))) return;
      const rows = await db.all(
        'SELECT * FROM platform_api_keys WHERE tenant_id = ? ORDER BY created_at DESC',
        [id]
      );
      res.json(rows.map(mapApiKeyRow));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/api-keys',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const tenant = await getTenantOr404(db, req, res, id);
      if (!tenant) return;

      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      const scopes = Array.isArray(req.body?.scopes) && req.body.scopes.length
        ? [...new Set(req.body.scopes.map(String))]
        : ['read'];
      const invalidScope = scopes.find((s) => !API_KEY_SCOPES.has(s));
      if (invalidScope) {
        return res.status(400).json({ error: `Unsupported scope '${invalidScope}'. Allowed: ${[...API_KEY_SCOPES].join(', ')}` });
      }
      const expiresInDays = req.body?.expiresInDays != null ? Number(req.body.expiresInDays) : null;
      if (expiresInDays != null && (!Number.isFinite(expiresInDays) || expiresInDays <= 0)) {
        return res.status(400).json({ error: 'expiresInDays must be a positive number' });
      }

      const { hashApiKey, KEY_PATTERN } = require('../lib/apiKeyAuth');
      const keyId = `key_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const plainKey = `pk_${crypto.randomBytes(24).toString('hex')}`;
      if (!KEY_PATTERN.test(plainKey)) throw new Error('generated key failed format check');
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_api_keys
           (id, tenant_id, key_type, name, key_hash, prefix, scopes, is_active, expires_at, created_by, created_at)
         VALUES (?, ?, 'TENANT', ?, ?, ?, ?, 1, ?, ?, ?)`,
        [keyId, id, name.slice(0, 120), hashApiKey(plainKey), plainKey.slice(0, 12), JSON.stringify(scopes), expiresAt, req.platformUser?.id, now]
      );
      const row = await db.get('SELECT * FROM platform_api_keys WHERE id = ?', [keyId]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: id,
        action: 'TENANT_API_KEY_CREATED',
        resourceType: 'platform_api_keys',
        resourceId: keyId,
        afterData: { name, scopes },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(201).json({ ...mapApiKeyRow(row), key: plainKey });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id/api-keys/:keyId',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.update', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { id, keyId } = req.params;
      if (!(await getTenantOr404(db, req, res, id))) return;
      const key = await db.get('SELECT * FROM platform_api_keys WHERE id = ? AND tenant_id = ?', [keyId, id]);
      if (!key) return res.status(404).json({ error: 'API key not found' });
      await db.run('UPDATE platform_api_keys SET is_active = 0, revoked_at = ? WHERE id = ?', [nowIso(), keyId]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId: id,
        action: 'TENANT_API_KEY_REVOKED',
        resourceType: 'platform_api_keys',
        resourceId: keyId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.json({ data: { id: keyId, revoked: true }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
