'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { recordAuditEvent } = require('../lib/audit');
const { authenticatePlatformUser, requirePlatformPermission } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.view', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { search = '', status = '' } = req.query;
      let sql = 'SELECT * FROM platform_tenants WHERE 1=1';
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR code LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC';
      const tenants = await db.all(sql, params);
      res.json(tenants);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.tenants.view', 'platform.tenants.manage']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const tenant = await db.get('SELECT * FROM platform_tenants WHERE id = ?', [req.params.id]);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      res.json(tenant);
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

module.exports = router;
