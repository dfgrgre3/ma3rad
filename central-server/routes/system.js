'use strict';

const express = require('express');
const {
  PLATFORM_PERMISSION_CATALOG,
  PLATFORM_PERMISSION_SECTIONS,
  PLATFORM_PAGE_CATALOG,
} = require('../platformPermissionCatalog');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { getVerifyingKey, getKeyId } = require('../lib/signing');
const { verifyAuditChain } = require('../lib/audit');
const { authenticatePlatformUser, requirePlatformPermission } = require('../middleware/auth');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: nowIso() });
});

router.get('/configuration/public-key', (req, res) => {
  res.json({
    publicKey: getVerifyingKey().toString('base64'),
    keyId: getKeyId(),
  });
});

router.get(
  '/admin/permissions/catalog',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.staff.view', 'platform.staff.manage_permissions']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const roles = await db.all(
        'SELECT code, name, description, is_system AS isSystem FROM platform_roles ORDER BY is_system DESC, code ASC'
      );
      const grants = await db.all('SELECT role_code AS roleCode, permission_code AS permissionCode FROM platform_role_permissions');
      const matrices = {};
      for (const grant of grants) {
        (matrices[grant.roleCode] ||= []).push(grant.permissionCode);
      }
      res.json({
        data: {
          sections: PLATFORM_PERMISSION_SECTIONS,
          pages: PLATFORM_PAGE_CATALOG || [],
          permissions: PLATFORM_PERMISSION_CATALOG,
          roles: roles.map((role) => ({ ...role, permissions: matrices[role.code] || [] })),
        },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/roles',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.staff.view', 'platform.staff.manage_permissions']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const roles = await db.all(
        'SELECT code, name, description, is_system AS isSystem FROM platform_roles ORDER BY is_system DESC, code ASC'
      );
      res.json({ data: roles, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/roles/:code/permissions',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.staff.view', 'platform.staff.manage_permissions']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const role = await db.get('SELECT code FROM platform_roles WHERE code = ?', [req.params.code]);
      if (!role) return res.status(404).json({ error: 'Role not found' });
      const rows = await db.all(
        'SELECT permission_code AS permissionCode FROM platform_role_permissions WHERE role_code = ? ORDER BY permission_code',
        [req.params.code]
      );
      res.json({ data: rows.map((row) => row.permissionCode), requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

function mapAuditRow(row) {
  return {
    id: row.id,
    sequence: row.sequence,
    actorType: row.actor_type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    tenantId: row.tenant_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    beforeData: row.before_data,
    afterData: row.after_data,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    prevHash: row.prev_hash,
    recordHash: row.record_hash,
    createdAt: row.created_at,
  };
}

router.get(
  '/admin/audit',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.audit.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const {
        action = '',
        actorId = '',
        tenantId = '',
        resourceType = '',
        from = '',
        to = '',
        q = '',
      } = req.query;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

      const clauses = [];
      const params = [];
      if (action) { clauses.push('action = ?'); params.push(action); }
      if (actorId) { clauses.push('actor_id = ?'); params.push(actorId); }
      if (tenantId) { clauses.push('tenant_id = ?'); params.push(tenantId); }
      if (resourceType) { clauses.push('resource_type = ?'); params.push(resourceType); }
      if (from) { clauses.push('created_at >= ?'); params.push(from); }
      if (to) { clauses.push('created_at <= ?'); params.push(to); }
      if (q) {
        clauses.push('(action LIKE ? OR actor_name LIKE ? OR resource_id LIKE ? OR resource_type LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const total = await db.get(`SELECT COUNT(*) AS count FROM platform_audit_events ${where}`, params);
      const rows = await db.all(
        `SELECT * FROM platform_audit_events ${where}
         ORDER BY sequence DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit]
      );
      res.json({
        data: rows.map(mapAuditRow),
        meta: {
          total: Number(total?.count || 0),
          page,
          limit,
        },
        requestId: req.requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/audit/verify',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.audit.view']),
  async (req, res, next) => {
    try {
      const fromSequence = Math.max(1, Number(req.query.fromSequence) || 1);
      const limit = req.query.limit ? Math.min(100000, Math.max(1, Number(req.query.limit))) : null;
      const result = await verifyAuditChain({ fromSequence, limit });
      res.json({ data: result, requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/admin/audit/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.audit.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const row = await db.get('SELECT * FROM platform_audit_events WHERE id = ?', [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Audit event not found' });
      res.json({ data: mapAuditRow(row), requestId: req.requestId });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
