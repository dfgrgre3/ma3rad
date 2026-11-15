'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../lib/db');
const { signJwt } = require('../lib/jwt');
const { recordAuditEvent, recordLoginAttempt } = require('../lib/audit');
const { authenticatePlatformUser } = require('../middleware/auth');
const { resolveEffectivePermissions, getTenantScopes } = require('../identity');
const { verifyTotp, provisioningUri, generateSecret, generateBackupCodes } = require('../totp');

const router = express.Router();

async function consumeBackupCode(mfaRow, code, actor) {
  const db = getDb();
  let hashes = [];
  try {
    hashes = JSON.parse(mfaRow.backup_codes || '[]');
  } catch {
    return false;
  }
  for (let i = 0; i < hashes.length; i += 1) {
    const match = await bcrypt.compare(String(code).toUpperCase(), hashes[i]);
    if (match) {
      hashes.splice(i, 1);
      await db.run('UPDATE platform_mfa SET backup_codes = ? WHERE user_id = ?', [JSON.stringify(hashes), mfaRow.user_id]);
      await recordAuditEvent({
        actorId: actor?.id || mfaRow.user_id,
        actorName: actor?.full_name || null,
        action: 'MFA_BACKUP_CODE_USED',
        resourceType: 'platform_mfa',
        resourceId: mfaRow.user_id,
      });
      return true;
    }
  }
  return false;
}

router.post('/login', async (req, res, next) => {
  try {
    const db = getDb();
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'] || '';
    const { username, password, mfaCode } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const normalizedUsername = String(username).trim();

    const platformUser = await db.get(
      'SELECT * FROM platform_users WHERE username = ? AND is_active = 1 AND deleted_at IS NULL',
      [normalizedUsername]
    );

    if (!platformUser) {
      await recordLoginAttempt({ username: normalizedUsername, success: false, failureReason: 'UNKNOWN_USER', ipAddress, userAgent });
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const lockedUntilMs = platformUser.locked_until ? Date.parse(platformUser.locked_until) : 0;
    if (lockedUntilMs && lockedUntilMs > Date.now()) {
      await recordLoginAttempt({ username: normalizedUsername, userId: platformUser.id, success: false, failureReason: 'LOCKED_OUT', ipAddress, userAgent });
      return res.status(429).json({ error: 'Account is temporarily locked. Try again later.', code: 'LOCKED_OUT' });
    }

    const match = await bcrypt.compare(password, platformUser.password_hash);
    if (!match) {
      const failed = Number(platformUser.failed_login_attempts || 0) + 1;
      const lock = failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      await db.run(
        'UPDATE platform_users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
        [lock ? 0 : failed, lock, platformUser.id]
      );
      await recordLoginAttempt({ username: normalizedUsername, userId: platformUser.id, success: false, failureReason: 'WRONG_PASSWORD', ipAddress, userAgent });
      if (lock) {
        await recordAuditEvent({ actorId: platformUser.id, actorName: platformUser.full_name, action: 'ACCOUNT_LOCKED', resourceType: 'platform_users', resourceId: platformUser.id, ipAddress, userAgent });
        return res.status(429).json({ error: 'Account locked for 15 minutes after too many failed attempts.', code: 'LOCKED_OUT' });
      }
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const mfa = await db.get('SELECT * FROM platform_mfa WHERE user_id = ?', [platformUser.id]);
    if (mfa && mfa.enabled) {
      const code = String(mfaCode || '').trim();
      if (!code) {
        return res.json({ mfaRequired: true });
      }
      let mfaOk = verifyTotp(mfa.secret, code);
      if (!mfaOk) {
        mfaOk = await consumeBackupCode(mfa, code, { id: platformUser.id, full_name: platformUser.full_name });
      }
      if (!mfaOk) {
        await recordLoginAttempt({ username: normalizedUsername, userId: platformUser.id, success: false, failureReason: 'MFA_INVALID', ipAddress, userAgent });
        return res.status(401).json({ error: 'Invalid MFA code' });
      }
    }

    await db.run(
      'UPDATE platform_users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
      [platformUser.id]
    );

    const sessionId = `sess_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO platform_sessions (id, user_id, token, expires_at, ip_address, user_agent, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, platformUser.id, '', expiresAt, ipAddress, userAgent, now]
    );

    const token = signJwt({
      sub: platformUser.id,
      username: platformUser.username,
      role: platformUser.role,
      sid: sessionId,
    }, 3600);
    await db.run('UPDATE platform_sessions SET token = ? WHERE id = ?', [token, sessionId]);

    await recordLoginAttempt({ username: normalizedUsername, userId: platformUser.id, success: true, ipAddress, userAgent });
    await recordAuditEvent({ actorId: platformUser.id, actorName: platformUser.full_name, action: 'LOGIN', resourceType: 'platform_users', resourceId: platformUser.id, ipAddress, userAgent });

    const permissions = [...(await resolveEffectivePermissions(db, platformUser.id))];

    return res.json({
      token,
      admin: {
        id: platformUser.id,
        username: platformUser.username,
        fullName: platformUser.full_name,
        email: platformUser.email,
        role: platformUser.role,
        permissions,
        mustChangePassword: Boolean(platformUser.must_change_password),
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', authenticatePlatformUser, (req, res) => {
  res.json({ admin: req.platformUser });
});

router.post('/logout', authenticatePlatformUser, async (req, res, next) => {
  try {
    const db = getDb();
    if (req.platformUser?.sessionId) {
      await db.run('DELETE FROM platform_sessions WHERE id = ?', [req.platformUser.sessionId]);
    }
    await recordAuditEvent({
      actorId: req.platformUser?.id,
      actorName: req.platformUser?.full_name,
      action: 'LOGOUT',
      resourceType: 'platform_sessions',
      resourceId: req.platformUser?.sessionId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', authenticatePlatformUser, async (req, res, next) => {
  try {
    const db = getDb();
    const oldSessionId = req.platformUser?.sessionId;
    if (!oldSessionId) {
      return res.status(401).json({ error: 'Session not bound to this token' });
    }
    await db.run('DELETE FROM platform_sessions WHERE id = ?', [oldSessionId]);

    const sessionId = `sess_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO platform_sessions (id, user_id, token, expires_at, ip_address, user_agent, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, req.platformUser.id, '', expiresAt, req.ip, req.headers['user-agent'] || '', now]
    );
    const token = signJwt({
      sub: req.platformUser.id,
      username: req.platformUser.username,
      role: req.platformUser.role,
      sid: sessionId,
    }, 3600);
    await db.run('UPDATE platform_sessions SET token = ? WHERE id = ?', [token, sessionId]);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

router.get('/effective', authenticatePlatformUser, async (req, res, next) => {
  try {
    const db = getDb();
    const effective = await resolveEffectivePermissions(db, req.platformUser.id);
    const scopes = await getTenantScopes(db, req.platformUser.id);
    res.json({
      userId: req.platformUser.id,
      role: req.platformUser.role,
      permissions: [...effective],
      dataScope: scopes.dataScope,
      tenantScopes: scopes.tenantIds,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/mfa/setup', authenticatePlatformUser, async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.platformUser.id;
    const secret = generateSecret(20);
    const backupCodes = generateBackupCodes(10);
    const backupHashes = await Promise.all(backupCodes.map((code) => bcrypt.hash(code, 10)));

    const existing = await db.get('SELECT user_id FROM platform_mfa WHERE user_id = ?', [userId]);
    if (existing) {
      await db.run('UPDATE platform_mfa SET secret = ?, backup_codes = ?, enabled = 0, verified_at = NULL WHERE user_id = ?',
        [secret, JSON.stringify(backupHashes), userId]);
    } else {
      await db.run(
        'INSERT INTO platform_mfa (user_id, method, secret, backup_codes, enabled) VALUES (?, ?, ?, ?, 0)',
        [userId, 'TOTP', secret, JSON.stringify(backupHashes)]
      );
    }
    await recordAuditEvent({ actorId: userId, actorName: req.platformUser.full_name, action: 'MFA_SETUP_INITIATED', resourceType: 'platform_mfa', resourceId: userId, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({
      secret,
      provisioningUri: provisioningUri(req.platformUser.username, secret, 'CeramiSys'),
      backupCodes,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/mfa/verify', authenticatePlatformUser, async (req, res, next) => {
  try {
    const db = getDb();
    const { code } = req.body || {};
    const mfa = await db.get('SELECT * FROM platform_mfa WHERE user_id = ?', [req.platformUser.id]);
    if (!mfa) {
      return res.status(400).json({ error: 'MFA setup has not been initiated' });
    }
    if (!verifyTotp(mfa.secret, String(code || ''))) {
      return res.status(401).json({ error: 'Invalid MFA code' });
    }
    await db.run('UPDATE platform_mfa SET enabled = 1, verified_at = CURRENT_TIMESTAMP WHERE user_id = ?', [req.platformUser.id]);
    await recordAuditEvent({ actorId: req.platformUser.id, actorName: req.platformUser.full_name, action: 'MFA_ENABLED', resourceType: 'platform_mfa', resourceId: req.platformUser.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/mfa/disable', authenticatePlatformUser, async (req, res, next) => {
  try {
    const db = getDb();
    const { code } = req.body || {};
    const mfa = await db.get('SELECT * FROM platform_mfa WHERE user_id = ?', [req.platformUser.id]);
    if (!mfa) {
      return res.status(400).json({ error: 'MFA is not enabled' });
    }
    const codeStr = String(code || '');
    let ok = verifyTotp(mfa.secret, codeStr);
    if (!ok) {
      ok = await consumeBackupCode(mfa, codeStr.toUpperCase(), { id: req.platformUser.id, full_name: req.platformUser.full_name });
    }
    if (!ok) {
      return res.status(401).json({ error: 'Invalid MFA code' });
    }
    await db.run('DELETE FROM platform_mfa WHERE user_id = ?', [req.platformUser.id]);
    await recordAuditEvent({ actorId: req.platformUser.id, actorName: req.platformUser.full_name, action: 'MFA_DISABLED', resourceType: 'platform_mfa', resourceId: req.platformUser.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.consumeBackupCode = consumeBackupCode;
