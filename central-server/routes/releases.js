'use strict';
const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { recordAuditEvent } = require('../lib/audit');
const {
  authenticatePlatformUser,
  requirePlatformPermission,
} = require('../middleware/auth');

const adminRouter = express.Router();
const clientRouter = express.Router();

const RELEASE_STATUSES = ['DRAFT', 'PUBLISHED', 'ROLLED_BACK', 'ARCHIVED'];
const RELEASE_CHANNELS = ['STABLE', 'BETA', 'ALPHA'];
const ROLLOUT_STRATEGIES = ['FULL', 'PHASED'];

function mapReleaseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    channel: row.channel,
    status: row.status,
    rolloutStrategy: row.rollout_strategy,
    rolloutPercent: row.rollout_percent,
    targetTenantIds: safeJson(row.target_tenant_ids) || [],
    downloadUrl: row.download_url ?? null,
    checksum: row.checksum ?? null,
    releaseNotes: row.release_notes ?? null,
    minRequiredVersion: row.min_required_version ?? null,
    isMandatory: Boolean(row.is_mandatory),
    publishedAt: row.published_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeJson(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

// Deterministic phased rollout: same tenant always lands on the same side of
// the percentage cut for a given release (no random flapping between polls).
function rolloutBucket(releaseId, tenantId) {
  const hash = crypto.createHash('sha256').update(`${releaseId}:${tenantId || ''}`).digest();
  return hash.readUInt32BE(0) % 100;
}

function releaseEligibleForTenant(release, tenantId) {
  const targets = safeJson(release.target_tenant_ids);
  if (Array.isArray(targets) && targets.length) {
    return tenantId ? targets.includes(tenantId) : false;
  }
  if (release.rollout_strategy === 'PHASED' && tenantId) {
    return rolloutBucket(release.id, tenantId) < Number(release.rollout_percent || 0);
  }
  return Number(release.rollout_percent || 0) >= 100 || release.rollout_strategy === 'FULL';
}

// ─── Admin API ───────────────────────────────────────────────────────────────

adminRouter.get(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.releases.view']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { status = '', channel = '', q = '' } = req.query;
      const clauses = [];
      const params = [];
      if (status) { clauses.push('status = ?'); params.push(status); }
      if (channel) { clauses.push('channel = ?'); params.push(channel); }
      if (q) { clauses.push('(version LIKE ? OR release_notes LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await db.all(`SELECT * FROM platform_releases ${where} ORDER BY created_at DESC LIMIT 500`, params);
      res.json({ data: rows.map(mapReleaseRow), meta: { total: rows.length }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

adminRouter.post(
  '/',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.releases.create']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const {
        version, channel = 'STABLE', releaseNotes = '', downloadUrl = '', checksum = '',
        minRequiredVersion = '', isMandatory = false,
        rolloutStrategy = 'FULL', rolloutPercent = 100, targetTenantIds = [],
      } = req.body || {};
      if (!version || !/^\d+\.\d+\.\d+/.test(String(version).trim())) {
        return res.status(400).json({ error: 'version must look like x.y.z' });
      }
      if (!RELEASE_CHANNELS.includes(channel)) {
        return res.status(400).json({ error: `channel must be one of ${RELEASE_CHANNELS.join(', ')}` });
      }
      if (!ROLLOUT_STRATEGIES.includes(rolloutStrategy)) {
        return res.status(400).json({ error: `rolloutStrategy must be one of ${ROLLOUT_STRATEGIES.join(', ')}` });
      }
      const percent = Math.min(100, Math.max(0, Number(rolloutPercent) || 0));
      if (rolloutStrategy === 'PHASED' && percent >= 100) {
        return res.status(400).json({ error: 'PHASED rollout requires rolloutPercent < 100; use FULL for 100%' });
      }
      const dup = await db.get('SELECT id FROM platform_releases WHERE version = ? AND channel = ?', [String(version).trim(), channel]);
      if (dup) return res.status(409).json({ error: 'A release with this version already exists for the channel' });

      const id = `rel_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = nowIso();
      await db.run(
        `INSERT INTO platform_releases
          (id, version, channel, status, rollout_strategy, rollout_percent, target_tenant_ids,
           download_url, checksum, release_notes, min_required_version, is_mandatory, created_at, updated_at)
         VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, String(version).trim(), channel, rolloutStrategy, percent,
         JSON.stringify(Array.isArray(targetTenantIds) ? targetTenantIds : []),
         downloadUrl || null, checksum || null, releaseNotes || null,
         minRequiredVersion || null, isMandatory ? 1 : 0, now, now]
      );
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name,
        action: 'RELEASE_CREATED', resourceType: 'platform_releases', resourceId: id,
        afterData: { version, channel, rolloutStrategy, rolloutPercent: percent },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT * FROM platform_releases WHERE id = ?', [id]);
      res.status(201).json({ data: mapReleaseRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

adminRouter.put(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.releases.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const release = await db.get('SELECT * FROM platform_releases WHERE id = ?', [req.params.id]);
      if (!release) return res.status(404).json({ error: 'Release not found' });
      if (release.status === 'PUBLISHED') {
        return res.status(409).json({ error: 'Published releases cannot be edited; rollback and re-publish instead' });
      }
      const {
        version, channel, releaseNotes, downloadUrl, checksum,
        minRequiredVersion, isMandatory, rolloutStrategy, rolloutPercent, targetTenantIds,
      } = req.body || {};
      const updates = [];
      const params = [];
      if (version !== undefined) { updates.push('version = ?'); params.push(String(version).trim()); }
      if (channel !== undefined) {
        if (!RELEASE_CHANNELS.includes(channel)) {
          return res.status(400).json({ error: `channel must be one of ${RELEASE_CHANNELS.join(', ')}` });
        }
        updates.push('channel = ?'); params.push(channel);
      }
      if (releaseNotes !== undefined) { updates.push('release_notes = ?'); params.push(releaseNotes || null); }
      if (downloadUrl !== undefined) { updates.push('download_url = ?'); params.push(downloadUrl || null); }
      if (checksum !== undefined) { updates.push('checksum = ?'); params.push(checksum || null); }
      if (minRequiredVersion !== undefined) { updates.push('min_required_version = ?'); params.push(minRequiredVersion || null); }
      if (isMandatory !== undefined) { updates.push('is_mandatory = ?'); params.push(isMandatory ? 1 : 0); }
      if (rolloutStrategy !== undefined) {
        if (!ROLLOUT_STRATEGIES.includes(rolloutStrategy)) {
          return res.status(400).json({ error: `rolloutStrategy must be one of ${ROLLOUT_STRATEGIES.join(', ')}` });
        }
        updates.push('rollout_strategy = ?'); params.push(rolloutStrategy);
      }
      if (rolloutPercent !== undefined) {
        updates.push('rollout_percent = ?'); params.push(Math.min(100, Math.max(0, Number(rolloutPercent) || 0)));
      }
      if (targetTenantIds !== undefined) {
        updates.push('target_tenant_ids = ?');
        params.push(JSON.stringify(Array.isArray(targetTenantIds) ? targetTenantIds : []));
      }
      if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
      updates.push('updated_at = ?');
      params.push(nowIso(), release.id);
      await db.run(`UPDATE platform_releases SET ${updates.join(', ')} WHERE id = ?`, params);
      const row = await db.get('SELECT * FROM platform_releases WHERE id = ?', [release.id]);
      res.json({ data: mapReleaseRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

adminRouter.post(
  '/:id/publish',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.releases.approve', 'platform.releases.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const release = await db.get('SELECT * FROM platform_releases WHERE id = ?', [req.params.id]);
      if (!release) return res.status(404).json({ error: 'Release not found' });
      if (release.status !== 'DRAFT' && release.status !== 'ROLLED_BACK') {
        return res.status(409).json({ error: `Cannot publish release in status ${release.status}` });
      }
      const now = nowIso();
      await db.run(
        `UPDATE platform_releases SET status = 'PUBLISHED', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?`,
        [now, now, release.id]
      );
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name,
        action: 'RELEASE_PUBLISHED', resourceType: 'platform_releases', resourceId: release.id,
        afterData: { version: release.version, channel: release.channel, rolloutPercent: release.rollout_percent },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT * FROM platform_releases WHERE id = ?', [release.id]);
      res.json({ data: mapReleaseRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

adminRouter.post(
  '/:id/rollback',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.releases.approve', 'platform.releases.update']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const release = await db.get('SELECT * FROM platform_releases WHERE id = ?', [req.params.id]);
      if (!release) return res.status(404).json({ error: 'Release not found' });
      if (release.status !== 'PUBLISHED') {
        return res.status(409).json({ error: `Cannot rollback release in status ${release.status}` });
      }
      await db.run("UPDATE platform_releases SET status = 'ROLLED_BACK', updated_at = ? WHERE id = ?", [nowIso(), release.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name,
        action: 'RELEASE_ROLLED_BACK', resourceType: 'platform_releases', resourceId: release.id,
        afterData: { version: release.version, channel: release.channel },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      const row = await db.get('SELECT * FROM platform_releases WHERE id = ?', [release.id]);
      res.json({ data: mapReleaseRow(row), requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

adminRouter.delete(
  '/:id',
  authenticatePlatformUser,
  requirePlatformPermission(['platform.releases.delete']),
  async (req, res, next) => {
    try {
      const db = getDb();
      const release = await db.get('SELECT * FROM platform_releases WHERE id = ?', [req.params.id]);
      if (!release) return res.status(404).json({ error: 'Release not found' });
      if (release.status === 'PUBLISHED') {
        return res.status(409).json({ error: 'Published releases must be rolled back before deletion' });
      }
      await db.run('DELETE FROM platform_releases WHERE id = ?', [release.id]);
      await recordAuditEvent({
        actorId: req.platformUser?.id, actorName: req.platformUser?.full_name,
        action: 'RELEASE_DELETED', resourceType: 'platform_releases', resourceId: release.id,
        afterData: { version: release.version, channel: release.channel },
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      res.json({ data: { id: release.id, deleted: true }, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ─── Client-facing API (device-authenticated via hardware id) ────────────────

clientRouter.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const deviceId = req.headers['x-device-id'] || req.query.deviceId || '';

    // Resolve tenant from the registered device so rollout/targeting is
    // server-side and cannot be spoofed by the client.
    let tenantId = null;
    if (deviceId) {
      const device = await db.get(
        'SELECT tenant_id FROM platform_devices WHERE hardware_id = ? OR id = ? LIMIT 1',
        [deviceId, deviceId]
      );
      if (device) tenantId = device.tenant_id;
    }

    const rows = await db.all(
      `SELECT * FROM platform_releases WHERE status = 'PUBLISHED' ORDER BY published_at DESC, created_at DESC LIMIT 50`
    );
    // min_required_version is informational for clients; version comparison
    // happens client-side. Eligibility here is purely rollout/targeting.
    const eligible = rows.filter((r) => releaseEligibleForTenant(r, tenantId));

    res.json({
      success: true,
      data: eligible.map((r) => ({
        id: r.id,
        version: r.version,
        release_notes: r.release_notes,
        download_url: r.download_url,
        checksum: r.checksum,
        min_required_version: r.min_required_version,
        is_mandatory: Boolean(r.is_mandatory),
        channel: r.channel,
        created_at: r.published_at || r.created_at,
      })),
    });
  } catch (err) { next(err); }
});

module.exports = { adminRouter, clientRouter };
