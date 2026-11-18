'use strict';

const { v4: uuidv4 } = require('uuid');

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,120}$/;

/**
 * Correlate client and server logs. A client-supplied id is accepted only if it
 * is a short, safe token; otherwise a server id is generated.
 */
function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
    ? incoming
    : `req_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

function normalizeIp(address) {
  return typeof address === 'string' ? address.replace(/^::ffff:/, '') : '';
}

function ipv4CidrMatch(ip, cidr) {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipNum = ipv4ToInt(ip);
  const baseNum = ipv4ToInt(normalizeIp(base));
  if (ipNum === null || baseNum === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value * 256 + octet) >>> 0;
  }
  return value >>> 0;
}

/**
 * X-Forwarded-* headers are client-controlled. They may only be trusted when
 * the direct peer is a configured reverse proxy:
 *   TRUSTED_PROXIES="10.0.0.1,192.168.1.0/24"  (IPs or IPv4 CIDRs)
 *   TRUST_PROXY=1                              (trust any peer — explicit opt-in)
 * With neither set, forwarded headers are ignored and the socket protocol is
 * authoritative, so a client cannot spoof HTTPS by sending the header itself.
 */
function isTrustedProxy(remoteAddress) {
  if (process.env.TRUST_PROXY === '1') return true;
  const configured = (process.env.TRUSTED_PROXIES || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (configured.length === 0) return false;
  const ip = normalizeIp(remoteAddress);
  if (!ip) return false;
  return configured.some((entry) => {
    const normalized = normalizeIp(entry);
    if (normalized === ip) return true;
    return normalized.includes('/') && ipv4CidrMatch(ip, normalized);
  });
}

function firstForwardedValue(header) {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== 'string') return null;
  const first = raw.split(',')[0].trim().toLowerCase();
  return first || null;
}

/**
 * Enforce HTTPS in production. This middleware should be placed after the reverse proxy
 * which terminates TLS. It checks the X-Forwarded-Proto header set by the proxy,
 * but only when the peer is a trusted proxy (see isTrustedProxy).
 */
function requireHttps(req, res, next) {
  // Fail closed: HTTPS is mandatory in production unless explicitly disabled
  // with REQUIRE_HTTPS=0 (e.g. a trusted internal network without TLS).
  const enforce = process.env.REQUIRE_HTTPS === '1' ||
    (process.env.NODE_ENV === 'production' && process.env.REQUIRE_HTTPS !== '0');
  if (!enforce) {
    return next();
  }

  const remoteAddress = req.socket && req.socket.remoteAddress;
  const forwardedProto = isTrustedProxy(remoteAddress)
    ? firstForwardedValue(req.headers['x-forwarded-proto'])
    : null;
  const proto = forwardedProto || req.protocol;
  if (proto !== 'https') {
    return res.status(403).json({ error: 'HTTPS required. Access this endpoint via HTTPS.' });
  }

  next();
}

module.exports = { requestContext, requireHttps };
