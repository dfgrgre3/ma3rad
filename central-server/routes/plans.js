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

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.plans.view', 'platform.plans.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const plans = await db.all('SELECT * FROM platform_plans ORDER BY sort_order, price');
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
      await db.run(
        `INSERT INTO platform_plans
          (id, code, name, description, billing_cycle, price, monthly_price, yearly_price, currency,
           seats_limit, branches_limit, devices_limit, storage_limit_mb, max_products, max_warehouses,
           trial_days, included_modules, features, permissions, is_active, is_default, sort_order,
           offline_grace_period_days, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          JSON.stringify(parseJson(body.includedModules ?? body.included_modules)),
          JSON.stringify(parseJson(body.features)),
          JSON.stringify(parseJson(body.permissions)),
          body.isActive === false || body.is_active === 0 ? 0 : 1,
          body.isDefault || body.is_default ? 1 : 0,
          num(body.sortOrder ?? body.sort_order),
          num(body.offlineGracePeriodDays ?? body.offline_grace_period_days, 14),
          now, now,
        ]
      );
      const plan = await db.get('SELECT * FROM platform_plans WHERE id = ?', [id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        action: 'PLAN_CREATED',
        resourceType: 'platform_plans',
        resourceId: id,
        afterData: { code, name },
        ipAddress: req.ip,
      });
      res.status(201).json({ data: plan, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

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
          ? JSON.stringify(parseJson(body.includedModules ?? body.included_modules))
          : existing.included_modules,
        features: body.features !== undefined ? JSON.stringify(parseJson(body.features)) : existing.features,
        permissions: body.permissions !== undefined ? JSON.stringify(parseJson(body.permissions)) : existing.permissions,
        is_active: pickBool(body, ['isActive', 'is_active'], !!existing.is_active) ? 1 : 0,
        is_default: pickBool(body, ['isDefault', 'is_default'], !!existing.is_default) ? 1 : 0,
        sort_order: num(pick(body, ['sortOrder', 'sort_order'], existing.sort_order)),
        offline_grace_period_days: num(pick(body, ['offlineGracePeriodDays', 'offline_grace_period_days'], existing.offline_grace_period_days), 14),
        updated_at: nowIso(),
      };

      if (fields.code !== existing.code) {
        const dup = await db.get('SELECT id FROM platform_plans WHERE code = ? AND id <> ?', [fields.code, req.params.id]);
        if (dup) return res.status(409).json({ error: 'Plan code already exists' });
      }

      await db.run(
        `UPDATE platform_plans SET
          code = ?, name = ?, description = ?, billing_cycle = ?, price = ?, monthly_price = ?, yearly_price = ?, currency = ?,
          seats_limit = ?, branches_limit = ?, devices_limit = ?, storage_limit_mb = ?, max_products = ?, max_warehouses = ?,
          trial_days = ?, included_modules = ?, features = ?, permissions = ?, is_active = ?, is_default = ?, sort_order = ?,
          offline_grace_period_days = ?, updated_at = ?
         WHERE id = ?`,
        [
          fields.code, fields.name, fields.description, fields.billing_cycle,
          fields.price, fields.monthly_price, fields.yearly_price, fields.currency,
          fields.seats_limit, fields.branches_limit, fields.devices_limit, fields.storage_limit_mb,
          fields.max_products, fields.max_warehouses, fields.trial_days,
          fields.included_modules, fields.features, fields.permissions,
          fields.is_active, fields.is_default, fields.sort_order,
          fields.offline_grace_period_days, fields.updated_at, req.params.id,
        ]
      );

      const plan = await db.get('SELECT * FROM platform_plans WHERE id = ?', [req.params.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        action: 'PLAN_UPDATED',
        resourceType: 'platform_plans',
        resourceId: req.params.id,
        afterData: { code: fields.code, name: fields.name },
        ipAddress: req.ip,
      });
      res.json({ data: plan, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
