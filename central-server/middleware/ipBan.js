'use strict';

const { getDb } = require('../lib/db');
const { resolveClientIp, normalizeIp, ipv4ToInt, ipv4CidrMatch } = require('./request');

const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;

function isValidIpv4(ip) {
  if (!IPV4_PATTERN.test(ip)) return false;
  return ip.split('.').every((octet) => Number(octet) <= 255);
}

/**
 * Validate an IP-ban target: a single IPv4/IPv6 address or an IPv4 CIDR
 * (e.g. 203.0.113.0/24). Returns the normalized target or null when invalid.
 */
function normalizeBanTarget(raw) {
  if (typeof raw !== 'string') return null;
  const target = normalizeIp(raw.trim());
  if (!target) return null;

  if (target.includes('/')) {
    const [base, bitsRaw] = target.split('/');
    const bits = Number(bitsRaw);
    if (target.split('/').length !== 2 || !isValidIpv4(base) || !Number.isInteger(bits) || bits < 0 || bits > 32) {
      return null;
    }
    return `${base}/${bits}`;
  }

  if (isValidIpv4(target)) return target;
  if (target.includes(':') && IPV6_PATTERN.test(target)) return target.toLowerCase();
  return null;
}

/** Addresses that must never be banned: loopback would lock the server itself out. */
function isLoopbackTarget(target) {
  const base = normalizeBanTarget(target.split('/')[0]) || '';
  return base === '127.0.0.1' || base === '::1' || base === 'localhost' || base.startsWith('127.');
}

function banMatchesClientIp(banAddress, clientIp) {
  const ban = String(banAddress || '');
  if (!ban || !clientIp) return false;
  if (ban.includes('/')) return ipv4CidrMatch(clientIp, ban);
  return normalizeIp(ban).toLowerCase() === clientIp.toLowerCase();
}

/**
 * Global guard mounted on /api/v1: rejects every request whose client IP has
 * an active, unexpired entry in platform_ip_bans. /health stays reachable so
 * uptime probes and the desktop updater keep working for everyone.
 */
async function ipBanGuard(req, res, next) {
  try {
    if (req.path === '/health') return next();
    const clientIp = resolveClientIp(req);
    if (!clientIp) return next();

    const db = getDb();
    const bans = await db.all(
      `SELECT id, ip_address FROM platform_ip_bans
       WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?)`,
      [new Date().toISOString()]
    );
    const hit = bans.find((ban) => banMatchesClientIp(ban.ip_address, clientIp));
    if (!hit) return next();

    await res.status(403).json({
      error: 'This IP address has been banned from the platform.',
      code: 'IP_BANNED',
    });
  } catch (err) {
    // Fail open on guard errors: a broken ban table must not take the whole
    // API down. The failure is still visible in server logs.
    console.error('[ip-ban] guard check failed:', err);
    next();
  }
}

module.exports = { ipBanGuard, normalizeBanTarget, isLoopbackTarget, banMatchesClientIp, isValidIpv4 };
