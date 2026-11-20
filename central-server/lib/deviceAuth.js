'use strict';

/**
 * Shared device authentication for client-facing channels
 * (configuration, module packages, device backups, telemetry).
 *
 * A device proves itself with two headers:
 *   X-Device-Id          — the platform_devices.id or hardware_id
 *   X-Device-Credential  — the secret issued at activation by the licensing
 *                          service; only its SHA-256 is stored server-side.
 *
 * Previously the credential was only checked for presence, so anyone who knew
 * a registered device id could call every device channel. Now the presented
 * credential must match `platform_devices.credential_hash`. Devices without an
 * enrolled hash are rejected: enrollment happens through
 * PUT /api/v1/admin/devices/:id/credential (or by the licensing service
 * writing the hash at activation time).
 */

const crypto = require('node:crypto');
const { getDb } = require('./db');

const SHA256_HEX = /^[a-f0-9]{64}$/;

function hashDeviceCredential(credential) {
  return crypto.createHash('sha256').update(String(credential), 'utf8').digest('hex');
}

function credentialMatches(device, credential) {
  const expected = device && typeof device.credential_hash === 'string' ? device.credential_hash : '';
  if (!SHA256_HEX.test(expected)) return false;
  const actual = hashDeviceCredential(credential);
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');
  return expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function findDevice(deviceId) {
  return getDb().get(
    'SELECT * FROM platform_devices WHERE id = ? OR hardware_id = ? LIMIT 1',
    [deviceId, deviceId]
  );
}

/**
 * Express middleware: resolves req.device from X-Device-Id and verifies
 * X-Device-Credential against the enrolled hash.
 */
async function authenticateDevice(req, res, next) {
  try {
    const deviceId = String(req.get('X-Device-Id') || '').trim();
    const credential = String(req.get('X-Device-Credential') || '').trim();
    if (!deviceId || !credential) {
      return res.status(401).json({ error: 'Device authentication required' });
    }
    const device = await findDevice(deviceId);
    if (!device) return res.status(401).json({ error: 'Unknown device' });
    if (device.status !== 'ACTIVE') return res.status(403).json({ error: `Device is ${device.status}` });
    if (!credentialMatches(device, credential)) {
      return res.status(401).json({ error: 'Invalid device credential' });
    }
    req.device = device;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { authenticateDevice, credentialMatches, findDevice, hashDeviceCredential };
