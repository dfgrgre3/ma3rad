'use strict';

/**
 * Device-authenticated tenant-identity provisioning channel.
 *
 * The platform console enqueues one job per tenant-user mutation
 * (PROVISION / UPDATE / STATUS / DELETE) into
 * `platform_tenant_provisioning_jobs`. Each tenant ERP device polls
 * GET /api/v1/device/provisioning/pending, applies the jobs to its local
 * `users` table, then reports the outcome through
 * POST /api/v1/device/provisioning/:jobId/result.
 *
 * Security notes:
 *  - Both endpoints require X-Device-Id + X-Device-Credential
 *    (authenticateDevice); the tenant is derived from the registered device,
 *    never from the request body.
 *  - Jobs are claimed atomically per device so two devices of the same tenant
 *    cannot process the same job twice.
 *  - The job payload may carry the one-time temporary password. It is wiped
 *    (`payload = '{}'`) as soon as the job reaches a terminal state.
 */

const express = require('express');
const { getDb } = require('../lib/db');
const { nowIso } = require('../lib/time');
const { recordAuditEvent } = require('../lib/audit');
const { authenticateDevice } = require('../lib/deviceAuth');

const router = express.Router();

const CLAIM_BATCH = 10;
const STALE_CLAIM_MINUTES = 15;

function mapJob(row) {
  if (!row) return null;
  let payload = {};
  try { payload = JSON.parse(row.payload || '{}'); } catch { payload = {}; }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantUserId: row.tenant_user_id,
    event: row.event,
    payload,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.created_at,
  };
}

async function recoverStaleClaims(db) {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000).toISOString();
  const now = nowIso();
  // Claims that exhausted their attempts go terminal instead of looping forever.
  const exhausted = await db.all(
    `SELECT id, tenant_id, tenant_user_id FROM platform_tenant_provisioning_jobs
      WHERE status = 'CLAIMED' AND claimed_at IS NOT NULL AND claimed_at < ? AND attempts >= max_attempts`,
    [cutoff]
  );
  for (const job of exhausted) {
    await db.run(
      `UPDATE platform_tenant_provisioning_jobs
          SET status = 'FAILED', payload = '{}', last_error = 'Device stopped reporting the provisioning result',
              completed_at = ?, updated_at = ?
        WHERE id = ?`,
      [now, now, job.id]
    );
    await db.run(
      `UPDATE platform_tenant_users SET provisioning_status = 'FAILED', last_error = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ?`,
      ['Device stopped reporting the provisioning result', now, job.tenant_user_id, job.tenant_id]
    );
  }
  await db.run(
    `UPDATE platform_tenant_provisioning_jobs
        SET status = 'PENDING', claimed_by_device_id = NULL, claimed_at = NULL, updated_at = ?
      WHERE status = 'CLAIMED' AND claimed_at IS NOT NULL AND claimed_at < ? AND attempts < max_attempts`,
    [now, cutoff]
  );
}

router.get(
  '/pending',
  authenticateDevice,
  async (req, res, next) => {
    try {
      const db = getDb();
      const tenantId = req.device.tenant_id;
      await recoverStaleClaims(db);

      const candidates = await db.all(
        `SELECT id FROM platform_tenant_provisioning_jobs
          WHERE tenant_id = ? AND status = 'PENDING' AND attempts < max_attempts
          ORDER BY created_at ASC LIMIT ?`,
        [tenantId, CLAIM_BATCH]
      );
      if (!candidates.length) return res.json({ data: [] });

      const now = nowIso();
      const claimed = [];
      for (const { id } of candidates) {
        // Atomic claim: only the first device to flip PENDING -> CLAIMED wins.
        const result = await db.run(
          `UPDATE platform_tenant_provisioning_jobs
              SET status = 'CLAIMED', claimed_by_device_id = ?, claimed_at = ?, attempts = attempts + 1, updated_at = ?
            WHERE id = ? AND status = 'PENDING'`,
          [req.device.id, now, now, id]
        );
        if (result && result.changes > 0) claimed.push(id);
      }
      if (!claimed.length) return res.json({ data: [] });

      const placeholders = claimed.map(() => '?').join(',');
      const rows = await db.all(
        `SELECT * FROM platform_tenant_provisioning_jobs WHERE id IN (${placeholders}) ORDER BY created_at ASC`,
        claimed
      );
      res.json({ data: rows.map(mapJob) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:jobId/result',
  authenticateDevice,
  async (req, res, next) => {
    try {
      const db = getDb();
      const { jobId } = req.params;
      const { ok, identityUserId, error } = req.body || {};
      const job = await db.get('SELECT * FROM platform_tenant_provisioning_jobs WHERE id = ?', [jobId]);
      if (!job || job.tenant_id !== req.device.tenant_id) {
        return res.status(404).json({ error: 'Provisioning job not found' });
      }
      if (job.status !== 'CLAIMED' || job.claimed_by_device_id !== req.device.id) {
        return res.status(409).json({ error: 'Job is not claimed by this device' });
      }

      const now = nowIso();
      const wipePayload = "payload = '{}'";

      if (ok === true) {
        await db.run(
          `UPDATE platform_tenant_provisioning_jobs
              SET status = 'DONE', ${wipePayload}, result_identity_user_id = ?, last_error = NULL,
                  completed_at = ?, updated_at = ?
            WHERE id = ?`,
          [identityUserId ? String(identityUserId) : null, now, now, jobId]
        );

        // Reflect the confirmed identity back on the directory record so the
        // super-admin console shows PROVISIONED with the linked user id.
        if (job.event !== 'DELETE') {
          await db.run(
            `UPDATE platform_tenant_users
                SET provisioning_status = 'PROVISIONED',
                    identity_user_id = COALESCE(?, identity_user_id),
                    provisioned_at = COALESCE(provisioned_at, ?),
                    last_error = NULL,
                    updated_at = ?
              WHERE id = ? AND tenant_id = ?`,
            [identityUserId ? String(identityUserId) : null, now, now, job.tenant_user_id, job.tenant_id]
          );
        }
        await recordAuditEvent({
          actorType: 'SYSTEM',
          actorId: null,
          actorName: `Device ${req.device.id}`,
          tenantId: job.tenant_id,
          action: 'TENANT_USER_PROVISIONED',
          resourceType: 'platform_tenant_provisioning_jobs',
          resourceId: jobId,
          afterData: { event: job.event, tenantUserId: job.tenant_user_id, identityUserId: identityUserId ?? null },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
        return res.json({ data: { id: jobId, status: 'DONE' } });
      }

      const message = String(error || 'Provisioning failed on device').slice(0, 500);
      const terminal = job.attempts >= job.max_attempts;
      // The payload carries the one-time temporary password: keep it while the
      // job may still retry, wipe it once the job reaches a terminal state.
      await db.run(
        `UPDATE platform_tenant_provisioning_jobs
            SET status = ?, ${terminal ? wipePayload : 'payload = payload'}, last_error = ?,
                claimed_by_device_id = NULL, claimed_at = NULL,
                completed_at = ?, updated_at = ?
          WHERE id = ?`,
        [terminal ? 'FAILED' : 'PENDING', message, terminal ? now : null, now, jobId]
      );
      if (terminal) {
        await db.run(
          `UPDATE platform_tenant_users
              SET provisioning_status = 'FAILED', last_error = ?, updated_at = ?
            WHERE id = ? AND tenant_id = ?`,
          [message, now, job.tenant_user_id, job.tenant_id]
        );
      } else {
        await db.run(
          `UPDATE platform_tenant_users SET last_error = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
          [message, now, job.tenant_user_id, job.tenant_id]
        );
      }
      await recordAuditEvent({
        actorType: 'SYSTEM',
        actorId: null,
        actorName: `Device ${req.device.id}`,
        tenantId: job.tenant_id,
        action: 'TENANT_USER_PROVISION_FAILED',
        resourceType: 'platform_tenant_provisioning_jobs',
        resourceId: jobId,
        afterData: { event: job.event, tenantUserId: job.tenant_user_id, error: message, terminal },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.json({ data: { id: jobId, status: terminal ? 'FAILED' : 'PENDING' } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
