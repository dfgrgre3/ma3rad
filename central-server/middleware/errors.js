'use strict';

function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    requestId: req.requestId,
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(`[${req.requestId || 'no-request-id'}] Unhandled API error:`, err);
  if (res.headersSent) return;
  const status = Number(err?.status) || 500;
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : String(err?.message || 'Request failed'),
    code: err?.code || 'INTERNAL_ERROR',
    requestId: req.requestId,
  });
}

module.exports = { notFoundHandler, errorHandler };
