'use strict';
const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { credentialMatches } = require('../lib/deviceAuth');

const router = express.Router();

const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

function normalizeSeverity(value) {
  const v = String(value || 'medium').toLowerCase();
  return SEVERITY_RANK[v] !== undefined ? v : 'medium';
}

function fingerprintFor({ title, issueType, deviceId }) {
  return crypto.createHash('sha1')
    .update(`${issueType || 'error'}|${String(title || '').slice(0, 200)}|${deviceId || ''}`)
    .digest('hex');
}

// Client-facing error ingest. Devices authenticate implicitly via their
// registered hardware id (platform_devices.hardware_id); tenant is resolved
// server-side so clients cannot spoof another tenant's error stream.
router.post('/errors', async (req, res, next) => {
  try {
    const db = getDb();
    const {
      deviceId = '', title = '', description = '', stackTrace = '',
      issueType = 'error', severity = 'medium', appVersion = '', os = '',
      deviceCredential = '',
      tenantId: claimedTenantId = null,
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    // Resolve tenant from the registered device; fall back to explicit tenantId
    // only when it matches an existing tenant (used by non-device callers).
    let tenantId = null;
    if (deviceId) {
      const device = await db.get(
        'SELECT * FROM platform_devices WHERE hardware_id = ? OR id = ? LIMIT 1',
        [deviceId, deviceId]
      );
      if (device) {
        // A registered device must prove its credential (sent in the body as
        // deviceCredential by the desktop bridge); it is checked against the
        // enrolled hash, same as the header-based device channels.
        if (device.status !== 'ACTIVE' || !credentialMatches(device, deviceCredential)) {
          return res.status(401).json({ error: 'Invalid device credential' });
        }
        tenantId = device.tenant_id;
      }
    }
    if (!tenantId && claimedTenantId) {
      const tenant = await db.get('SELECT id FROM platform_tenants WHERE id = ?', [claimedTenantId]);
      if (tenant) tenantId = tenant.id;
    }

    const fingerprint = fingerprintFor({ title, issueType, deviceId });
    const sev = normalizeSeverity(severity);
    const now = nowIso();
    const existing = await db.get('SELECT * FROM platform_error_reports WHERE fingerprint = ?', [fingerprint]);

    if (existing) {
      const mergedSeverity = SEVERITY_RANK[sev] > SEVERITY_RANK[existing.severity] ? sev : existing.severity;
      await db.run(
        `UPDATE platform_error_reports SET occurrences = occurrences + 1, last_seen_at = ?,
           severity = ?, description = COALESCE(?, description), stack = COALESCE(?, stack),
           app_version = COALESCE(?, app_version), os = COALESCE(?, os),
           tenant_id = COALESCE(tenant_id, ?), device_id = COALESCE(device_id, ?), updated_at = ?
         WHERE id = ?`,
        [now, mergedSeverity,
         description ? String(description).slice(0, 4000) : null,
         stackTrace ? String(stackTrace).slice(0, 8000) : null,
         appVersion || null, os || null,
         tenantId, deviceId || null, now, existing.id]
      );
      return res.status(200).json({ success: true, data: { id: existing.id, occurrences: existing.occurrences + 1 } });
    }

    const id = `err_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await db.run(
      `INSERT INTO platform_error_reports
        (id, tenant_id, device_id, fingerprint, title, description, stack, issue_type, severity,
         app_version, os, occurrences, first_seen_at, last_seen_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'OPEN', ?, ?)`,
      [id, tenantId, deviceId || null, fingerprint, String(title).trim().slice(0, 300),
       description ? String(description).slice(0, 4000) : null,
       stackTrace ? String(stackTrace).slice(0, 8000) : null,
       issueType || 'error', sev, appVersion || null, os || null,
       now, now, now, now]
    );
    res.status(201).json({ success: true, data: { id } });
  } catch (err) { next(err); }
});

const METRIC_STATUSES = ['OK', 'WARNING', 'CRITICAL'];
const MAX_METRICS_PER_REPORT = 50;

function normalizeMetricStatus(value) {
  const v = String(value || 'OK').toUpperCase();
  return METRIC_STATUSES.includes(v) ? v : 'OK';
}

// Device-facing technical metrics ingest. Same device authentication as
// POST /errors: the tenant is resolved server-side from the registered
// device so clients cannot spoof another tenant's metric stream.
router.post('/metrics', async (req, res, next) => {
  try {
    const db = getDb();
    const {
      deviceId = '', deviceCredential = '', deviceName = '',
      appVersion = '', os = '',
      metrics = [],
      tenantId: claimedTenantId = null,
    } = req.body || {};

    if (!Array.isArray(metrics) || !metrics.length) {
      return res.status(400).json({ error: 'metrics must be a non-empty array' });
    }
    if (metrics.length > MAX_METRICS_PER_REPORT) {
      return res.status(400).json({ error: `metrics accepts at most ${MAX_METRICS_PER_REPORT} entries` });
    }
    for (const m of metrics) {
      if (!m || typeof m !== 'object' || !String(m.name || '').trim()) {
        return res.status(400).json({ error: 'each metric requires a name' });
      }
      if (typeof m.value !== 'number' || !Number.isFinite(m.value)) {
        return res.status(400).json({ error: `metric "${m.name}" value must be a finite number` });
      }
    }

    // Resolve tenant from the registered device; fall back to explicit tenantId
    // only when it matches an existing tenant.
    let tenantId = null;
    let device = null;
    if (deviceId) {
      device = await db.get(
        'SELECT * FROM platform_devices WHERE hardware_id = ? OR id = ? LIMIT 1',
        [deviceId, deviceId]
      );
      if (device) {
        if (device.status !== 'ACTIVE' || !credentialMatches(device, deviceCredential)) {
          return res.status(401).json({ error: 'Invalid device credential' });
        }
        tenantId = device.tenant_id;
      }
    }
    if (!tenantId && claimedTenantId) {
      const tenant = await db.get('SELECT id FROM platform_tenants WHERE id = ?', [claimedTenantId]);
      if (tenant) tenantId = tenant.id;
    }

    const now = nowIso();
    if (device) {
      await db.run(
        'UPDATE platform_devices SET last_seen_at = ?, app_version = COALESCE(?, app_version), os = COALESCE(?, os), updated_at = ? WHERE id = ?',
        [now, appVersion || null, os || null, now, device.id]
      );
    }

    let inserted = 0;
    for (const m of metrics) {
      const id = `hm_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      await db.run(
        `INSERT INTO platform_health_metrics
          (id, tenant_id, device_id, device_name, metric_name, metric_value, metric_unit, status, details, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, tenantId, device ? device.id : (deviceId || null),
          (deviceName || device?.name || null)?.toString().slice(0, 200) ?? null,
          String(m.name).trim().slice(0, 100), m.value,
          m.unit ? String(m.unit).slice(0, 30) : null,
          normalizeMetricStatus(m.status),
          m.details != null ? JSON.stringify(m.details).slice(0, 4000) : null,
          now,
        ]
      );
      inserted += 1;
    }
    res.status(201).json({ success: true, data: { inserted } });
  } catch (err) { next(err); }
});

module.exports = router;
