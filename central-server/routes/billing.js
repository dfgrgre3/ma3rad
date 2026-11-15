'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { recordAuditEvent } = require('../lib/audit');
const { authenticatePlatformUser, requirePlatformPermission, requireTenantScope, getScopedTenantIds, tenantScopePredicate } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/invoices',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.billing.view', 'platform.billing.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const scoped = await getScopedTenantIds(req);
      if (Array.isArray(scoped) && scoped.length === 0) {
        return res.json({ data: [], meta: { total: 0 } });
      }
      const scopePredicate = tenantScopePredicate('tenant_id', scoped);
      const invoices = await db.all(
        `SELECT * FROM platform_invoices WHERE 1=1${scopePredicate.clause} ORDER BY created_at DESC`,
        scopePredicate.params
      );
      res.json({ data: invoices, meta: { total: invoices.length } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/invoices',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.billing.create', 'platform.billing.manage']),
  requireTenantScope(),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { tenantId, number, total, currency } = req.body || {};
      if (!tenantId || !number) {
        return res.status(400).json({ error: 'tenantId and number are required' });
      }
      const id = `inv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_invoices (id, number, tenant_id, total, currency) VALUES (?, ?, ?, ?, ?)`,
        [id, String(number).trim(), tenantId, Number(total) || 0, currency || 'EGP']
      );
      const invoice = await db.get('SELECT * FROM platform_invoices WHERE id = ?', [id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        tenantId,
        action: 'INVOICE_CREATED',
        resourceType: 'platform_invoices',
        resourceId: id,
        afterData: { number, total },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(201).json({ data: invoice });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;