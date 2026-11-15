'use strict';

const express = require('express');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { authenticatePlatformUser, requirePlatformPermission } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/admin/config/feature-permissions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.app-configuration.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const tenantId = req.query.tenantId || null;
      const planId = req.query.planId || null;
      const row = await db.get(
        'SELECT hidden_menus AS hiddenMenus, disabled_permissions AS disabledPermissions, feature_permissions AS featurePermissions FROM tenant_feature_config WHERE tenant_id IS ? AND plan_id IS ?',
        [tenantId, planId]
      );
      res.json({
        data: row
          ? {
              hiddenMenus: JSON.parse(row.hiddenMenus || '[]'),
              disabledPermissions: JSON.parse(row.disabledPermissions || '[]'),
              featurePermissions: JSON.parse(row.featurePermissions || '[]'),
            }
          : { hiddenMenus: [], disabledPermissions: [], featurePermissions: [] },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/config/feature-permissions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.app-configuration.view', 'platform.settings.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const tenantId = req.body?.tenantId || null;
      const planId = req.body?.planId || null;
      const hiddenMenus = JSON.stringify(req.body?.hiddenMenus || []);
      const disabledPermissions = JSON.stringify(req.body?.disabledPermissions || []);
      const featurePermissions = JSON.stringify(req.body?.featurePermissions || []);
      await db.run(
        `INSERT INTO tenant_feature_config (tenant_id, plan_id, hidden_menus, disabled_permissions, feature_permissions, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, plan_id) DO UPDATE SET
           hidden_menus = excluded.hidden_menus,
           disabled_permissions = excluded.disabled_permissions,
           feature_permissions = excluded.feature_permissions,
           updated_at = excluded.updated_at`,
        [tenantId, planId, hiddenMenus, disabledPermissions, featurePermissions, nowIso()]
      );
      res.json({ data: { ok: true }, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;