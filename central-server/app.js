'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { requestContext } = require('./middleware/request');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { installEnvelope } = require('./lib/envelope');
const { createApiRouter } = require('./routes');

/**
 * Build the Express application without touching the database so it can be
 * mounted in tests and started by server.js after initialization.
 */
function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));
  app.use(requestContext);
  // Installed globally on purpose: `app.use('/api/v1', fn)` strips the mount
  // prefix before the handler runs, so `req.path` no longer starts with it.
  app.use(installEnvelope);

  app.use('/api/v1', createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();

module.exports = { createApp, app };
