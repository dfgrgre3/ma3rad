'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { recordAuditEvent } = require('../lib/audit');
const { authenticatePlatformUser, requirePlatformPermission } = require('../middleware/auth');
const { invalidatePermissionsCache } = require('../identity');

const router = express.Router();

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['staff:read', 'platform.staff.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { includeDeleted } = req.query;
      const staff = await db.all(
        `SELECT id, username, full_name, email, role, permissions, is_active, last_login_at, created_at, deleted_at
         FROM platform_users
         ${includeDeleted === 'true' ? '' : 'WHERE deleted_at IS NULL'}
         ORDER BY created_at DESC`
      );
      res.json(staff.map((member) => ({
        ...member,
        permissions: JSON.parse(member.permissions || '[]'),
      })));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['staff:manage', 'platform.staff.create']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { username, password, fullName, email, role = 'STAFF', permissions = [] } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const actorRole = req.platformUser?.role;
      const isOwner = actorRole === 'SUPER_ADMIN' || actorRole === 'OWNER';
      if ((role === 'SUPER_ADMIN' || role === 'OWNER') && !isOwner) {
        return res.status(403).json({ error: 'Only the platform owner can create or upgrade to a super admin account' });
      }
      if (role === 'SUPER_ADMIN' || role === 'OWNER') {
        // There can only ever be one platform owner account; minting a
        // second one — even by the owner — is blocked at the API layer.
        const existingOwner = await db.get(
          `SELECT id FROM platform_users
           WHERE role IN ('SUPER_ADMIN','OWNER') AND deleted_at IS NULL AND is_active = 1
           LIMIT 1`
        );
        if (existingOwner) {
          return res.status(409).json({ error: 'A platform owner account already exists; a second owner cannot be created' });
        }
      }
      // Never allow granting wildcard permission via API except by an existing owner
      const requestedPerms = Array.isArray(permissions) ? permissions : [];
      if (requestedPerms.includes('*') && !isOwner) {
        return res.status(403).json({ error: 'Wildcard permission cannot be granted' });
      }

      const existing = await db.get('SELECT 1 FROM platform_users WHERE username = ?', [String(username).trim()]);
      if (existing) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      const id = `usr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const passwordHash = await bcrypt.hash(password, 10);
      const grantedPermissions = Array.isArray(permissions) ? permissions : [];
      const deniedPermissions = Array.isArray(req.body.deniedPermissions) ? req.body.deniedPermissions : [];
      const permJson = JSON.stringify(grantedPermissions);

      await db.run(
        `INSERT INTO platform_users (id, username, password_hash, full_name, email, role, permissions)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, String(username).trim(), passwordHash, fullName || null, email || null, role, permJson]
      );

      const roleRow = await db.get('SELECT code FROM platform_roles WHERE code = ?', [role]);
      if (roleRow) {
        await db.run('INSERT OR IGNORE INTO platform_user_roles (user_id, role_code) VALUES (?, ?)', [id, role]);
      }
      for (const code of grantedPermissions) {
        if (code === '*') continue;
        await db.run(`INSERT OR IGNORE INTO platform_user_permissions (user_id, permission_code, effect) VALUES (?, ?, 'GRANT')`, [id, String(code)]);
      }
      for (const code of deniedPermissions) {
        await db.run(
          `INSERT INTO platform_user_permissions (user_id, permission_code, effect) VALUES (?, ?, 'DENY')
           ON CONFLICT(user_id, permission_code) DO UPDATE SET effect = 'DENY'`,
          [id, String(code)]
        );
      }
      invalidatePermissionsCache(id);
      await recordAuditEvent({
        actorId: req.platformUser?.id,
        actorName: req.platformUser?.full_name,
        action: 'STAFF_CREATED',
        resourceType: 'platform_users',
        resourceId: id,
        afterData: { username: String(username).trim(), role, grantedPermissions, deniedPermissions },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ id, username: String(username).trim(), fullName, email, role, permissions: grantedPermissions, deniedPermissions });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
