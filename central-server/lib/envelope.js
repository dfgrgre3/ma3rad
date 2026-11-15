'use strict';

/**
 * Unified API response envelope for the Central Server.
 *
 * Every successful JSON response under `/api/v1` is normalized to:
 * {
 *   success: true,
 *   data: <payload>,
 *   error: null,
 *   message: null,
 *   requestId: '<id>',
 *   meta: { ...optional pagination/context... },
 * }
 *
 * Every error response is normalized to:
 * {
 *   success: false,
 *   data: null,
 *   error: '<machine readable or human readable error>',
 *   message: '<human readable message>',
 *   code: '<ERROR_CODE>',
 *   requestId: '<id>',
 *   meta: {},
 * }
 *
 * The envelope is applied through a `res.json` override installed before the
 * routes so handlers can keep writing plain payloads (`res.json(rows)`,
 * `res.json({ data, meta })`) without duplicating envelope logic.
 */

function successBody(req, data, meta) {
  return {
    success: true,
    data: data === undefined ? null : data,
    error: null,
    message: null,
    requestId: req?.requestId || null,
    meta: meta || {},
  };
}

function errorBody(req, { error, message, code, status }) {
  const resolvedError = error || message || 'Request failed';
  const resolvedMessage = message || resolvedError;
  const resolvedCode = code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
  return {
    success: false,
    data: null,
    error: resolvedError,
    message: resolvedMessage,
    code: resolvedCode,
    requestId: req?.requestId || null,
    meta: {},
  };
}

function installEnvelope(req, res, next) {
  if (!String(req.path || '').startsWith('/api/v1')) {
    return next();
  }
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const statusCode = Number(res.statusCode) || 200;
    const payload = body === undefined || body === null ? null : body;

    if (statusCode >= 400) {
      const errorSource = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
      const error = errorSource.error || errorSource.message || 'Request failed';
      const message = errorSource.message || errorSource.error || error;
      const code = errorSource.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
      return originalJson({
        success: false,
        data: null,
        error,
        message,
        code,
        requestId: req.requestId || null,
        meta: {},
      });
    }

    const isLegacyWrapper = Boolean(
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      Object.prototype.hasOwnProperty.call(payload, 'data')
    );
    const data = isLegacyWrapper ? (payload.data === undefined ? null : payload.data) : payload;
    const meta = isLegacyWrapper && payload.meta ? payload.meta : (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.meta) || {};

    return originalJson({
      success: true,
      data,
      error: null,
      message: null,
      requestId: req.requestId || null,
      meta,
    });
  };
  return next();
}

module.exports = { installEnvelope, successBody, errorBody };
