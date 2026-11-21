'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { authenticatePlatformUser, requirePlatformPermission } = require('../middleware/auth');
const { recordAuditEvent } = require('../lib/audit');

const router = express.Router();

const parseJson = (value, fallback = []) => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return fallback;
  }
};

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const pick = (body, keys, fallback) => {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null) return body[key];
  }
  return fallback;
};

const pickBool = (body, keys, fallback) => {
  const value = pick(body, keys, undefined);
  if (value === undefined) return fallback;
  return value === true || value === 1 || value === '1' || value === 'true';
};

const jsonStringify = (value) => JSON.stringify(parseJson(value));

const PLAN_SELECT = `
  SELECT p.*,
    (SELECT COUNT(*) FROM platform_subscriptions s
      WHERE s.plan_id = p.id AND s.status IN ('ACTIVE','TRIAL')) AS subscriber_count
  FROM platform_plans p
`;

const mapVersion = (row) => ({
  id: String(row.id),
  planId: String(row.plan_id),
  version: num(row.version, 1),
  name: String(row.name),
  description: row.description ?? null,
  billingCycle: row.billing_cycle,
  price: num(row.price, 0),
  monthlyPrice: num(row.monthly_price, 0),
  yearlyPrice: num(row.yearly_price, 0),
  currency: row.currency ?? 'EGP',
  seatsLimit: num(row.seats_limit, 1),
  branchesLimit: num(row.branches_limit, 1),
  devicesLimit: num(row.devices_limit, 1),
  storageLimitMb: num(row.storage_limit_mb, 500),
  maxProducts: num(row.max_products, 1000),
  maxWarehouses: num(row.max_warehouses, 2),
  trialDays: num(row.trial_days, 14),
  includedModules: parseJson(row.included_modules),
  features: parseJson(row.features),
  permissions: parseJson(row.permissions),
  isActive: true,
  isDefault: false,
  sortOrder: 0,
  offlineGracePeriodDays: num(row.offline_grace_period_days, 14),
  effectiveFrom: String(row.effective_from ?? row.created_at),
  isCurrent: Boolean(row.is_current),
  changeNote: row.change_note ?? null,
  createdBy: row.created_by ?? null,
  createdAt: String(row.created_at),
});

const mapPriceHistory = (row) => ({
  id: String(row.id),
  planId: String(row.plan_id),
  oldPrice: num(row.old_price, 0),
  newPrice: num(row.new_price, 0),
  changedAt: String(row.created_at ?? row.effective_from ?? ''),
  changedBy: String(row.actor_name ?? row.actor_id ?? ''),
});

const mapUpgradeRule = (row) => ({
  id: String(row.id),
  fromPlanId: String(row.from_plan_id),
  toPlanId: String(row.to_plan_id),
  allowed: Boolean(row.allowed),
  requiresApproval: Boolean(row.requires_approval),
  upgradeFeePercent: num(row.upgrade_fee_percent, 0),
  notes: row.notes ?? null,
  createdAt: String(row.created_at ?? ''),
  updatedAt: String(row.updated_at ?? row.created_at ?? ''),
});

const audit = (req, action, resourceId, afterData, beforeData) =>
  recordAuditEvent({
    actorId: req.platformUser?.id,
    actorName: req.platformUser?.full_name,
    action,
    resourceType: 'platform_plans',
    resourceId,
    afterData,
    beforeData: beforeData ?? undefined,
    ipAddress: req.ip,
  });

// ─── List / Create ────────────────────────────────────────────────────────────

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.view', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const plans = await db.all(`${PLAN_SELECT} ORDER BY sort_order, price`);
      res.json(plans);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.create', 'platform.plans.manage', 'platform.plans.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const body = req.body || {};
      const code = String(body.code || '').trim().toUpperCase();
      const name = String(body.name || '').trim();
      if (code.length < 2) return res.status(400).json({ error: 'code must be at least 2 characters' });
      if (!name) return res.status(400).json({ error: 'name is required' });
      const existing = await db.get('SELECT id FROM platform_plans WHERE code = ?', [code]);
      if (existing) return res.status(409).json({ error: 'Plan code already exists' });

      const id = `plan_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowIso();
      const isDefault = pickBool(body, ['isDefault', 'is_default'], false);
      const versioned = pickBool(body, ['versioned'], false);

      if (isDefault) {
        await db.run('UPDATE platform_plans SET is_default = 0, updated_at = ? WHERE is_default = 1', [now]);
      }

      await db.run(
        `INSERT INTO platform_plans
          (id, code, name, description, billing_cycle, price, monthly_price, yearly_price, currency,
           seats_limit, branches_limit, devices_limit, storage_limit_mb, max_products, max_warehouses,
           trial_days, included_modules, features, permissions, is_active, is_default, sort_order,
           offline_grace_period_days, versioned, current_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, code, name, body.description ?? null,
          body.billingCycle ?? body.billing_cycle ?? 'MONTHLY',
          num(body.price ?? body.yearlyPrice ?? body.yearly_price),
          num(body.monthlyPrice ?? body.monthly_price),
          num(body.yearlyPrice ?? body.yearly_price ?? body.price),
          body.currency ?? 'EGP',
          num(body.seatsLimit ?? body.seats_limit, 1),
          num(body.branchesLimit ?? body.branches_limit, 1),
          num(body.devicesLimit ?? body.devices_limit, 1),
          num(body.storageLimitMb ?? body.storage_limit_mb, 500),
          num(body.maxProducts ?? body.max_products, 1000),
          num(body.maxWarehouses ?? body.max_warehouses, 2),
          num(body.trialDays ?? body.trial_days, 14),
          jsonStringify(body.includedModules ?? body.included_modules),
          jsonStringify(body.features),
          jsonStringify(body.permissions),
          body.isActive === false || body.is_active === 0 ? 0 : 1,
          isDefault ? 1 : 0,
          num(body.sortOrder ?? body.sort_order),
          num(body.offlineGracePeriodDays ?? body.offline_grace_period_days, 14),
          versioned ? 1 : 0,
          1,
          now, now,
        ]
      );

      if (versioned) {
        const plan = await db.get('SELECT * FROM platform_plans WHERE id = ?', [id]);
        await db.run(
          `INSERT INTO platform_plan_versions
            (id, plan_id, version, name, description, billing_cycle, price, monthly_price, yearly_price, currency,
             seats_limit, branches_limit, devices_limit, storage_limit_mb, max_products, max_warehouses,
             trial_days, included_modules, features, permissions, offline_grace_period_days,
             effective_from, is_current, change_note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `pv_${id}_1`, id, 1, plan.name, plan.description, plan.billing_cycle,
            plan.price, plan.monthly_price, plan.yearly_price, plan.currency,
            plan.seats_limit, plan.branches_limit, plan.devices_limit,
            plan.storage_limit_mb, plan.max_products, plan.max_warehouses,
            plan.trial_days, plan.included_modules, plan.features, plan.permissions,
            plan.offline_grace_period_days,
            body.effectiveFrom ?? now, 1, body.initialChangeNote ?? 'إصدار أولي للخطة',
            req.platformUser?.id ?? 'system', now,
          ]
        );
      }

      const plan = await db.get(`${PLAN_SELECT} WHERE p.id = ?`, [id]);
      await audit(req, 'PLAN_CREATED', id, { code, name });
      res.status(201).json({ data: plan, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Upgrade rules (registered before /:id so 'upgrade-rules' is not captured) ─

router.get(
  '/upgrade-rules',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.view', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const rules = await db.all('SELECT * FROM platform_plan_upgrade_rules ORDER BY from_plan_id, to_plan_id');
      res.json(rules.map(mapUpgradeRule));
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/upgrade-rules',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.update', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const body = req.body || {};
      const fromPlanId = String(body.fromPlanId || '');
      const toPlanId = String(body.toPlanId || '');
      if (!fromPlanId || !toPlanId) return res.status(400).json({ error: 'fromPlanId and toPlanId are required' });
      if (fromPlanId === toPlanId) return res.status(400).json({ error: 'A plan cannot have a rule to itself' });

      const fromPlan = await db.get('SELECT id FROM platform_plans WHERE id = ?', [fromPlanId]);
      const toPlan = await db.get('SELECT id FROM platform_plans WHERE id = ?', [toPlanId]);
      if (!fromPlan || !toPlan) return res.status(404).json({ error: 'Plan not found' });

      const now = nowIso();
      const existing = await db.get(
        'SELECT * FROM platform_plan_upgrade_rules WHERE from_plan_id = ? AND to_plan_id = ?',
        [fromPlanId, toPlanId]
      );
      const allowed = pickBool(body, ['allowed'], true) ? 1 : 0;
      const requiresApproval = pickBool(body, ['requiresApproval', 'requires_approval'], false) ? 1 : 0;
      const feePercent = num(pick(body, ['upgradeFeePercent', 'upgrade_fee_percent'], existing?.upgrade_fee_percent ?? 0));
      const notes = pick(body, ['notes'], existing?.notes ?? null);

      if (existing) {
        await db.run(
          'UPDATE platform_plan_upgrade_rules SET allowed = ?, upgrade_fee_percent = ?, requires_approval = ?, notes = ? WHERE id = ?',
          [allowed, feePercent, requiresApproval, notes, existing.id]
        );
      } else {
        await db.run(
          `INSERT INTO platform_plan_upgrade_rules
            (id, from_plan_id, to_plan_id, allowed, upgrade_fee_percent, requires_approval, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [`pur_${uuidv4().replace(/-/g, '').slice(0, 12)}`, fromPlanId, toPlanId, allowed, feePercent, requiresApproval, notes, now]
        );
      }

      const row = await db.get(
        'SELECT * FROM platform_plan_upgrade_rules WHERE from_plan_id = ? AND to_plan_id = ?',
        [fromPlanId, toPlanId]
      );
      await audit(req, 'PLAN_UPGRADE_RULE_SET', row.id, { fromPlanId, toPlanId, allowed: !!allowed });
      res.json({ data: mapUpgradeRule(row), requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Plan detail & sub-resources ─────────────────────────────────────────────

router.get(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.view', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const plan = await db.get(`${PLAN_SELECT} WHERE p.id = ?`, [req.params.id]);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      res.json(plan);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id/subscribers',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.view', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const plan = await db.get('SELECT id FROM platform_plans WHERE id = ?', [req.params.id]);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      const rows = await db.all(
        `SELECT s.id, s.tenant_id, s.status, s.start_date, s.end_date, s.seats, s.price,
                s.billing_cycle, s.auto_renew, s.branches_limit, s.created_at,
                t.name AS tenant_name, t.code AS tenant_code
         FROM platform_subscriptions s
         LEFT JOIN platform_tenants t ON t.id = s.tenant_id
         WHERE s.plan_id = ?
         ORDER BY s.created_at DESC`,
        [req.params.id]
      );
      res.json(rows.map((row) => ({
        id: String(row.id),
        tenantId: String(row.tenant_id),
        tenantName: row.tenant_name ?? null,
        tenantCode: row.tenant_code ?? null,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date ?? null,
        seats: num(row.seats, 1),
        price: num(row.price, 0),
        billingCycle: row.billing_cycle,
        autoRenew: Boolean(row.auto_renew),
        branchesLimit: num(row.branches_limit, 1),
        createdAt: row.created_at,
      })));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id/versions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.view', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const rows = await db.all(
        'SELECT * FROM platform_plan_versions WHERE plan_id = ? ORDER BY version DESC',
        [req.params.id]
      );
      res.json(rows.map(mapVersion));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id/price-history',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.view', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const rows = await db.all(
        'SELECT * FROM platform_price_history WHERE plan_id = ? ORDER BY created_at DESC',
        [req.params.id]
      );
      res.json(rows.map(mapPriceHistory));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id/deactivation-check',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.view', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const plan = await db.get('SELECT id FROM platform_plans WHERE id = ?', [req.params.id]);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      const activeSubs = await db.get(
        `SELECT COUNT(*) AS count FROM platform_subscriptions
         WHERE plan_id = ? AND status IN ('ACTIVE','TRIAL')`,
        [req.params.id]
      );
      const count = num(activeSubs?.count, 0);
      res.json({
        canDeactivate: count === 0,
        activeSubscriptions: count,
        message: count > 0
          ? `لا يمكن تعطيل الخطة: يوجد ${count} اشتراك نشط.`
          : 'يمكن تعطيل الخطة بأمان.',
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/impact-preview',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.view', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const plan = await db.get('SELECT * FROM platform_plans WHERE id = ?', [req.params.id]);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });

      const body = req.body || {};
      const newSeats = num(pick(body, ['seatsLimit', 'seats_limit'], plan.seats_limit), plan.seats_limit);
      const newBranches = num(pick(body, ['branchesLimit', 'branches_limit'], plan.branches_limit), plan.branches_limit);
      const newDevices = num(pick(body, ['devicesLimit', 'devices_limit'], plan.devices_limit), plan.devices_limit);

      const tenants = await db.all(
        `SELECT id, name, seats_limit, branches_limit, devices_limit
         FROM platform_tenants
         WHERE plan_id = ? AND status IN ('ACTIVE','TRIAL')`,
        [req.params.id]
      );

      const limitViolations = [];
      for (const tenant of tenants) {
        if (num(tenant.seats_limit, 0) > newSeats) {
          limitViolations.push({ tenantId: tenant.id, tenantName: tenant.name, type: 'seats', current: num(tenant.seats_limit, 0), newLimit: newSeats });
        }
        if (num(tenant.branches_limit, 0) > newBranches) {
          limitViolations.push({ tenantId: tenant.id, tenantName: tenant.name, type: 'branches', current: num(tenant.branches_limit, 0), newLimit: newBranches });
        }
        if (num(tenant.devices_limit, 0) > newDevices) {
          limitViolations.push({ tenantId: tenant.id, tenantName: tenant.name, type: 'devices', current: num(tenant.devices_limit, 0), newLimit: newDevices });
        }
      }

      const riskLevel = limitViolations.length > 0 ? 'CRITICAL' : 'LOW';
      res.json({
        planId: req.params.id,
        planName: plan.name,
        affectedTenants: tenants.length,
        limitViolations,
        riskLevel,
        recommendation: riskLevel === 'CRITICAL'
          ? 'يوجد عملاء سيتجاوزون الحدود الجديدة. يجب زيادة الحدود أو نقل العملاء قبل الاعتماد.'
          : 'التغيير آمن. لا يوجد تجاوز للحدود الحالية.',
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/copy',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.create', 'platform.plans.manage', 'platform.plans.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const source = await db.get('SELECT * FROM platform_plans WHERE id = ?', [req.params.id]);
      if (!source) return res.status(404).json({ error: 'Source plan not found' });

      const body = req.body || {};
      const code = String(body.code || '').trim().toUpperCase();
      const name = String(body.name || '').trim();
      if (code.length < 2) return res.status(400).json({ error: 'code must be at least 2 characters' });
      if (!name) return res.status(400).json({ error: 'name is required' });
      const dup = await db.get('SELECT id FROM platform_plans WHERE code = ?', [code]);
      if (dup) return res.status(409).json({ error: 'Plan code already exists' });

      const id = `plan_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_plans
          (id, code, name, description, billing_cycle, price, monthly_price, yearly_price, currency,
           seats_limit, branches_limit, devices_limit, storage_limit_mb, max_products, max_warehouses,
           trial_days, included_modules, features, permissions, is_active, is_default, sort_order,
           offline_grace_period_days, versioned, current_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, code, name, source.description,
          source.billing_cycle, source.price, source.monthly_price, source.yearly_price, source.currency,
          source.seats_limit, source.branches_limit, source.devices_limit,
          source.storage_limit_mb, source.max_products, source.max_warehouses,
          source.trial_days, source.included_modules, source.features, source.permissions,
          0, 0, num(source.sort_order) + 1,
          source.offline_grace_period_days, source.versioned ?? 0,
          1,
          body.effectiveFrom ?? now, now,
        ]
      );

      const rules = await db.all('SELECT * FROM platform_plan_upgrade_rules WHERE from_plan_id = ?', [req.params.id]);
      for (const rule of rules) {
        await db.run(
          `INSERT OR IGNORE INTO platform_plan_upgrade_rules
            (id, from_plan_id, to_plan_id, allowed, upgrade_fee_percent, requires_approval, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [`pur_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, rule.to_plan_id, rule.allowed, rule.upgrade_fee_percent, rule.requires_approval, rule.notes, now]
        );
      }

      const plan = await db.get(`${PLAN_SELECT} WHERE p.id = ?`, [id]);
      await audit(req, 'PLAN_COPIED', id, { sourcePlanId: req.params.id, code, name });
      res.status(201).json({ data: { plan, copiedRules: rules.length } });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Update / Delete ─────────────────────────────────────────────────────────

router.put(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.update', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const existing = await db.get('SELECT * FROM platform_plans WHERE id = ?', [req.params.id]);
      if (!existing) return res.status(404).json({ error: 'Plan not found' });

      const body = req.body || {};
      const fields = {
        code: pick(body, ['code'], existing.code) !== undefined ? String(pick(body, ['code'], existing.code)).trim().toUpperCase() : existing.code,
        name: pick(body, ['name'], existing.name) !== undefined ? String(pick(body, ['name'], existing.name)).trim() : existing.name,
        description: pick(body, ['description'], existing.description),
        billing_cycle: pick(body, ['billingCycle', 'billing_cycle'], existing.billing_cycle),
        price: num(pick(body, ['price'], existing.price)),
        monthly_price: num(pick(body, ['monthlyPrice', 'monthly_price'], existing.monthly_price)),
        yearly_price: num(pick(body, ['yearlyPrice', 'yearly_price'], existing.yearly_price)),
        currency: pick(body, ['currency'], existing.currency),
        seats_limit: num(pick(body, ['seatsLimit', 'seats_limit'], existing.seats_limit), 1),
        branches_limit: num(pick(body, ['branchesLimit', 'branches_limit'], existing.branches_limit), 1),
        devices_limit: num(pick(body, ['devicesLimit', 'devices_limit'], existing.devices_limit), 1),
        storage_limit_mb: num(pick(body, ['storageLimitMb', 'storage_limit_mb'], existing.storage_limit_mb), 500),
        max_products: num(pick(body, ['maxProducts', 'max_products'], existing.max_products), 1000),
        max_warehouses: num(pick(body, ['maxWarehouses', 'max_warehouses'], existing.max_warehouses), 2),
        trial_days: num(pick(body, ['trialDays', 'trial_days'], existing.trial_days), 14),
        included_modules: body.includedModules !== undefined || body.included_modules !== undefined
          ? jsonStringify(body.includedModules ?? body.included_modules)
          : existing.included_modules,
        features: body.features !== undefined ? jsonStringify(body.features) : existing.features,
        permissions: body.permissions !== undefined ? jsonStringify(body.permissions) : existing.permissions,
        is_active: pickBool(body, ['isActive', 'is_active'], !!existing.is_active) ? 1 : 0,
        is_default: pickBool(body, ['isDefault', 'is_default'], !!existing.is_default) ? 1 : 0,
        sort_order: num(pick(body, ['sortOrder', 'sort_order'], existing.sort_order)),
        offline_grace_period_days: num(pick(body, ['offlineGracePeriodDays', 'offline_grace_period_days'], existing.offline_grace_period_days), 14),
        versioned: pickBool(body, ['versioned'], !!existing.versioned) ? 1 : 0,
        updated_at: nowIso(),
      };

      if (fields.code !== existing.code) {
        const dup = await db.get('SELECT id FROM platform_plans WHERE code = ? AND id <> ?', [fields.code, req.params.id]);
        if (dup) return res.status(409).json({ error: 'Plan code already exists' });
      }

      const now = nowIso();
      const versioned = Boolean(fields.versioned);
      const nextVersion = versioned ? num(existing.current_version, 1) + 1 : num(existing.current_version, 1);

      if (fields.is_default && !existing.is_default) {
        await db.run('UPDATE platform_plans SET is_default = 0, updated_at = ? WHERE is_default = 1 AND id <> ?', [now, req.params.id]);
      }

      // Versioned plans snapshot the new state before the update lands.
      if (versioned) {
        await db.run(
          `INSERT INTO platform_plan_versions
            (id, plan_id, version, name, description, billing_cycle, price, monthly_price, yearly_price, currency,
             seats_limit, branches_limit, devices_limit, storage_limit_mb, max_products, max_warehouses,
             trial_days, included_modules, features, permissions, offline_grace_period_days,
             effective_from, is_current, change_note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `pv_${req.params.id}_${nextVersion}`, req.params.id, nextVersion,
            fields.name, fields.description, fields.billing_cycle,
            fields.price, fields.monthly_price, fields.yearly_price, fields.currency,
            fields.seats_limit, fields.branches_limit, fields.devices_limit,
            fields.storage_limit_mb, fields.max_products, fields.max_warehouses,
            fields.trial_days, fields.included_modules, fields.features, fields.permissions,
            fields.offline_grace_period_days,
            pick(body, ['effectiveFrom'], now), 1, body.changeNote ?? body.initialChangeNote ?? null,
            req.platformUser?.id ?? 'system', now,
          ]
        );
        await db.run('UPDATE platform_plan_versions SET is_current = 0 WHERE plan_id = ? AND version <> ?', [req.params.id, nextVersion]);
      }

      // Price history when the base price changes.
      if (fields.price !== num(existing.price)) {
        await db.run(
          `INSERT INTO platform_price_history
            (id, plan_id, version, old_price, new_price, currency, effective_from, reason, actor_id, actor_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `ph_${uuidv4().replace(/-/g, '').slice(0, 12)}`, req.params.id, nextVersion,
            num(existing.price), fields.price, fields.currency, now,
            body.changeNote ?? body.initialChangeNote ?? null,
            req.platformUser?.id ?? 'system', req.platformUser?.full_name ?? null,
          ]
        );
      }

      await db.run(
        `UPDATE platform_plans SET
          code = ?, name = ?, description = ?, billing_cycle = ?, price = ?, monthly_price = ?, yearly_price = ?, currency = ?,
          seats_limit = ?, branches_limit = ?, devices_limit = ?, storage_limit_mb = ?, max_products = ?, max_warehouses = ?,
          trial_days = ?, included_modules = ?, features = ?, permissions = ?, is_active = ?, is_default = ?, sort_order = ?,
          offline_grace_period_days = ?, versioned = ?, current_version = ?, updated_at = ?
         WHERE id = ?`,
        [
          fields.code, fields.name, fields.description, fields.billing_cycle,
          fields.price, fields.monthly_price, fields.yearly_price, fields.currency,
          fields.seats_limit, fields.branches_limit, fields.devices_limit, fields.storage_limit_mb,
          fields.max_products, fields.max_warehouses, fields.trial_days,
          fields.included_modules, fields.features, fields.permissions,
          fields.is_active, fields.is_default, fields.sort_order,
          fields.offline_grace_period_days, fields.versioned, versioned ? nextVersion : num(existing.current_version, 1),
          fields.updated_at, req.params.id,
        ]
      );

      const plan = await db.get(`${PLAN_SELECT} WHERE p.id = ?`, [req.params.id]);
      await audit(req, 'PLAN_UPDATED', req.params.id, { code: fields.code, name: fields.name });
      res.json({ data: plan, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.delete', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const existing = await db.get('SELECT * FROM platform_plans WHERE id = ?', [req.params.id]);
      if (!existing) return res.status(404).json({ error: 'Plan not found' });

      const subs = await db.get('SELECT COUNT(*) AS c FROM platform_subscriptions WHERE plan_id = ?', [req.params.id]);
      if (num(subs?.c, 0) > 0) {
        return res.status(409).json({ error: 'Plan is linked to subscriptions; deactivate it instead' });
      }
      const licenses = await db.get('SELECT COUNT(*) AS c FROM platform_licenses WHERE plan_id = ?', [req.params.id]);
      if (num(licenses?.c, 0) > 0) {
        return res.status(409).json({ error: 'Plan is linked to licenses; deactivate it instead' });
      }

      await db.run('DELETE FROM platform_plan_upgrade_rules WHERE from_plan_id = ? OR to_plan_id = ?', [req.params.id, req.params.id]);
      await db.run('DELETE FROM platform_plan_versions WHERE plan_id = ?', [req.params.id]);
      await db.run('DELETE FROM platform_price_history WHERE plan_id = ?', [req.params.id]);
      await db.run('DELETE FROM platform_plans WHERE id = ?', [req.params.id]);

      await audit(req, 'PLAN_DELETED', req.params.id, null, existing);
      res.json({ data: { id: req.params.id }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
