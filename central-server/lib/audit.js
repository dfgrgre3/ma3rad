'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb, AUDIT_GENESIS_HASH, computeAuditHash } = require('./db');

const MAX_INSERT_ATTEMPTS = 5;

/**
 * Append an event to the tamper-evident platform audit chain.
 *
 * The sequence and hash are derived from the last row, and a unique index on
 * `sequence` turns concurrent writes into a retry instead of a broken chain.
 * Triggers installed by migrateAuditChain() reject UPDATE/DELETE.
 */
async function recordAuditEvent({
  actorType = 'PLATFORM',
  actorId = null,
  actorName = null,
  tenantId = null,
  action,
  resourceType = null,
  resourceId = null,
  beforeData = null,
  afterData = null,
  ipAddress = null,
  userAgent = null,
}) {
  const db = getDb();
  const id = `audit_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const createdAt = new Date().toISOString();
  const beforeJson = beforeData ? JSON.stringify(beforeData) : null;
  const afterJson = afterData ? JSON.stringify(afterData) : null;

  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt += 1) {
    try {
      const last = await db.get(
        'SELECT sequence, record_hash FROM platform_audit_events ORDER BY sequence DESC LIMIT 1'
      );
      const sequence = Number(last?.sequence || 0) + 1;
      const prevHash = last?.record_hash || AUDIT_GENESIS_HASH;
      const recordHash = computeAuditHash({
        id,
        sequence,
        actorType,
        actorId,
        actorName,
        tenantId,
        action,
        resourceType,
        resourceId,
        beforeData: beforeJson,
        afterData: afterJson,
        createdAt,
        prevHash,
      });

      await db.run(
        `INSERT INTO platform_audit_events
          (id, sequence, actor_type, actor_id, actor_name, tenant_id, action,
           resource_type, resource_id, before_data, after_data, ip_address, user_agent,
           prev_hash, record_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, sequence, actorType, actorId, actorName, tenantId, action,
          resourceType, resourceId, beforeJson, afterJson, ipAddress, userAgent,
          prevHash, recordHash, createdAt,
        ]
      );
      return { id, sequence, recordHash };
    } catch (err) {
      const retryable = /UNIQUE constraint failed.*sequence|SQLITE_CONSTRAINT/i.test(String(err?.message));
      if (!retryable || attempt === MAX_INSERT_ATTEMPTS - 1) {
        console.error('Failed to record audit event:', err.message);
        return null;
      }
    }
  }
  return null;
}

async function recordLoginAttempt({
  username,
  userId = null,
  success,
  failureReason = null,
  ipAddress = null,
  userAgent = null,
}) {
  const db = getDb();
  try {
    await db.run(
      `INSERT INTO platform_login_attempts (id, username, user_id, success, failure_reason, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `latt_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        String(username || '').slice(0, 120),
        userId,
        success ? 1 : 0,
        failureReason,
        ipAddress,
        userAgent,
      ]
    );
  } catch (err) {
    console.error('Failed to record login attempt:', err.message);
  }
}

/**
 * Walk the whole chain and recompute every hash. O(n) by design: the endpoint
 * is a privileged integrity check, not part of normal page loads.
 */
async function verifyAuditChain({ fromSequence = 1, limit = null } = {}) {
  const db = getDb();
  const rows = await db.all(
    `SELECT id, sequence, actor_type, actor_id, actor_name, tenant_id, action,
            resource_type, resource_id, before_data, after_data, created_at,
            prev_hash, record_hash
     FROM platform_audit_events
     WHERE sequence >= ?
     ORDER BY sequence ASC
     ${limit ? 'LIMIT ?' : ''}`,
    limit ? [fromSequence, limit] : [fromSequence]
  );

  let expectedPrev = AUDIT_GENESIS_HASH;
  if (fromSequence > 1) {
    const previous = await db.get(
      'SELECT record_hash FROM platform_audit_events WHERE sequence = ?',
      [fromSequence - 1]
    );
    if (previous?.record_hash) expectedPrev = previous.record_hash;
  }

  let expectedSequence = fromSequence;
  for (const row of rows) {
    const recomputed = computeAuditHash({
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
      createdAt: row.created_at,
      prevHash: expectedPrev,
    });

    if (Number(row.sequence) !== expectedSequence) {
      return {
        isValid: false,
        checkedCount: expectedSequence - fromSequence,
        brokenAtId: row.id,
        brokenAtSequence: row.sequence,
        reason: 'SEQUENCE_GAP',
      };
    }
    if (row.prev_hash !== expectedPrev) {
      return {
        isValid: false,
        checkedCount: expectedSequence - fromSequence,
        brokenAtId: row.id,
        brokenAtSequence: row.sequence,
        reason: 'PREV_HASH_MISMATCH',
      };
    }
    if (row.record_hash !== recomputed) {
      return {
        isValid: false,
        checkedCount: expectedSequence - fromSequence,
        brokenAtId: row.id,
        brokenAtSequence: row.sequence,
        reason: 'RECORD_HASH_MISMATCH',
      };
    }

    expectedPrev = row.record_hash;
    expectedSequence += 1;
  }

  return {
    isValid: true,
    checkedCount: rows.length,
    lastSequence: expectedSequence - 1,
    lastHash: expectedPrev,
  };
}

module.exports = {
  recordAuditEvent,
  recordLoginAttempt,
  verifyAuditChain,
};
