'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { requestContext, requireHttps } = require('./middleware/request');
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

  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests without origin header for same-origin requests (e.g., tests, server-to-server)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '256kb' }));
  app.use(requestContext);
  app.use(requireHttps);
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
