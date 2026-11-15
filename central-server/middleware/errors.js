'use strict';

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    data: null,
    error: 'Endpoint not found',
    message: 'Endpoint not found',
    code: 'NOT_FOUND',
    requestId: req.requestId,
    meta: {},
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(`[${req.requestId || 'no-request-id'}] Unhandled API error:`, err);
  if (res.headersSent) return;
  const status = Number(err?.status) || 500;
  const message = status >= 500 ? 'Internal server error' : String(err?.message || 'Request failed');
  res.status(status).json({
    success: false,
    data: null,
    error: status >= 500 ? 'Internal server error' : String(err?.message || 'Request failed'),
    message,
    code: err?.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'),
    requestId: req.requestId,
    meta: {},
  });
}

module.exports = { notFoundHandler, errorHandler };
