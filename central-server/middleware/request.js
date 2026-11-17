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

/**
 * Enforce HTTPS in production. This middleware should be placed after the reverse proxy
 * which terminates TLS. It checks the X-Forwarded-Proto header set by the proxy.
 */
function requireHttps(req, res, next) {
  if (process.env.REQUIRE_HTTPS !== '1') {
    return next();
  }

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  if (proto !== 'https') {
    return res.status(403).json({ error: 'HTTPS required. Access this endpoint via HTTPS.' });
  }

  next();
}

module.exports = { requestContext, requireHttps };
