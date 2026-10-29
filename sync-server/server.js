'use strict';

const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { Pool } = require('pg');
const {
  MAX_BATCH_SIZE,
  constantTimeEqual,
  isLoopbackHost,
  normalizeClients,
  stableJson,
  validateEvent,
} = require('./validation');

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_CURSOR = 9_223_372_036_854_775_807n;

class SyncRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    request.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(new SyncRequestError('Request body exceeds the maximum size', 413));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new SyncRequestError('Request body must contain valid JSON'));
      }
    });
    request.on('error', reject);
  });
}

function readCursor(value) {
  if (value === null || value === '') return 0n;
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) {
    throw new SyncRequestError('Invalid synchronization cursor');
  }
  const cursor = BigInt(value);
  if (cursor > MAX_CURSOR) throw new SyncRequestError('Invalid synchronization cursor');
  return cursor;
}

function makePoolFromEnvironment() {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    throw new Error('Configure DATABASE_URL or PGHOST for the synchronization database.');
  }
  const sslMode = (process.env.PGSSLMODE || 'verify-full').toLowerCase();
  let ssl;
  if (sslMode === 'disable') {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_DATABASE !== 'true') {
      throw new Error('TLS to PostgreSQL is required in production unless ALLOW_INSECURE_DATABASE=true is explicitly set.');
    }
    ssl = false;
  } else {
    const sslOptions = { rejectUnauthorized: true };
    if (process.env.PGSSL_CA) sslOptions.ca = require('node:fs').readFileSync(path.resolve(process.env.PGSSL_CA));
    ssl = sslOptions;
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST || undefined,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE || undefined,
    user: process.env.PGUSER || undefined,
    password: process.env.PGPASSWORD || undefined,
    ssl,
    max: Number(process.env.PGPOOL_MAX || 20),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
}

function createSyncServer({
  pool,
  clients,
  host = '127.0.0.1',
  port = 47821,
  tlsCertPath,
  tlsKeyPath,
  schemaPath = path.join(__dirname, 'schema.sql'),
}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('A PostgreSQL-compatible pool is required');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError('Sync server port must be between 0 and 65535');
  }
  if (Boolean(tlsCertPath) !== Boolean(tlsKeyPath)) {
    throw new Error('Both HTTPS certificate and key paths must be configured together');
  }
  if (!isLoopbackHost(host) && (!tlsCertPath || !tlsKeyPath)) {
    throw new Error('HTTPS certificate and key are required when the sync server binds outside loopback');
  }

  const identities = normalizeClients(clients);
  const failedAuth = new Map();
  let server = null;

  function isRateLimited(request) {
    const now = Date.now();
    const address = request.socket.remoteAddress || 'unknown';
    const previous = failedAuth.get(address);
    if (previous && now - previous.startedAt < 60000 && previous.count >= 30) return true;
    if (failedAuth.size > 5000) {
      for (const [key, value] of failedAuth) {
        if (now - value.startedAt >= 60000) failedAuth.delete(key);
      }
    }
    return !previous && failedAuth.size >= 5000;
  }

  function recordFailedAuth(request) {
    const now = Date.now();
    const address = request.socket.remoteAddress || 'unknown';
    const previous = failedAuth.get(address);
    if (!previous || now - previous.startedAt >= 60000) {
      failedAuth.set(address, { startedAt: now, count: 1 });
    } else {
      previous.count++;
    }
  }

  function authenticate(request) {
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
    const supplied = authorization.slice(7);
    return identities.find((identity) => constantTimeEqual(supplied, identity.token)) ?? null;
  }

  async function persistEvent(identity, event) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (event.entityType !== 'sync_policy') {
        const policyResult = await client.query(
          `SELECT enabled, outbound_enabled AS "outboundEnabled", data_scope AS "dataScope"
           FROM sync_entity_policies
           WHERE tenant_id = $1 AND entity_type = $2
           FOR SHARE`,
          [identity.tenantId, event.entityType]
        );
        const policy = policyResult.rows[0];
        if (!policy) throw new SyncRequestError('Waiting for the head-office synchronization policy for this entity type', 403);
        if (!policy.enabled || !policy.outboundEnabled ||
            (policy.dataScope === 'BRANCH' && event.dataScope !== 'BRANCH')) {
          throw new SyncRequestError(`Head-office policy does not allow publishing ${event.entityType} events`, 403);
        }
      }

      const inserted = await client.query(
        `INSERT INTO sync_events
          (tenant_id, event_id, branch_id, device_id, entity_type, entity_id,
           operation_type, entity_version, schema_version, data_scope, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::timestamptz)
         ON CONFLICT (tenant_id, event_id) DO NOTHING
         RETURNING sequence`,
        [
          event.tenantId, event.eventId, event.branchId, event.deviceId, event.entityType,
          event.entityId, event.operationType, event.entityVersion, event.schemaVersion,
          event.dataScope, JSON.stringify(event.payload), event.createdAt,
        ]
      );
      const isNewEvent = inserted.rowCount > 0;

      if (!isNewEvent) {
        const existingResult = await client.query(
          `SELECT branch_id AS "branchId", device_id AS "deviceId", entity_type AS "entityType",
                  entity_id AS "entityId", operation_type AS "operationType",
                  entity_version AS "entityVersion", schema_version AS "schemaVersion",
                  data_scope AS "dataScope", payload,
                  EXTRACT(EPOCH FROM created_at) AS "createdAtEpoch"
           FROM sync_events WHERE tenant_id = $1 AND event_id = $2`,
          [identity.tenantId, event.eventId]
        );
        const existing = existingResult.rows[0];
        if (!existing || existing.branchId !== event.branchId || existing.deviceId !== event.deviceId ||
            existing.entityType !== event.entityType || existing.entityId !== event.entityId ||
            existing.operationType !== event.operationType || existing.entityVersion !== event.entityVersion ||
            existing.schemaVersion !== event.schemaVersion || existing.dataScope !== event.dataScope ||
            stableJson(existing.payload) !== stableJson(event.payload) ||
            Math.abs(Number(existing.createdAtEpoch) * 1000 - Date.parse(event.createdAt)) >= 1000) {
          throw new SyncRequestError(`Event ID collision: ${event.eventId}`, 409);
        }
      }

      if (event.entityType === 'sync_policy' && isNewEvent) {
        const policy = event.payload.policy;
        await client.query(
          `INSERT INTO sync_entity_policies
            (tenant_id, entity_type, enabled, outbound_enabled, inbound_enabled, data_scope, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
           ON CONFLICT (tenant_id, entity_type) DO UPDATE SET
             enabled = EXCLUDED.enabled,
             outbound_enabled = EXCLUDED.outbound_enabled,
             inbound_enabled = EXCLUDED.inbound_enabled,
             data_scope = EXCLUDED.data_scope,
             updated_at = CURRENT_TIMESTAMP`,
          [
            identity.tenantId, policy.entityType, policy.enabled, policy.outboundEnabled,
            policy.inboundEnabled, policy.dataScope,
          ]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Failed to roll back a PostgreSQL sync transaction:', rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function pullEvents(identity, cursorValue, limitValue) {
    const cursor = readCursor(cursorValue);
    const limit = Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new SyncRequestError('limit must be an integer between 1 and 100');
    }
    const visibility = identity.canReadAllBranches
      ? `(data_scope = 'TENANT' OR data_scope = 'BRANCH')`
      : `(data_scope = 'TENANT' OR branch_id = $3)`;
    const devicePlaceholder = identity.canReadAllBranches ? '$3' : '$4';
    const limitPlaceholder = identity.canReadAllBranches ? '$4' : '$5';
    const result = await pool.query(
      `SELECT sequence::text AS sequence, event_id AS "eventId", tenant_id AS "tenantId",
              branch_id AS "branchId", device_id AS "deviceId", entity_type AS "entityType",
              entity_id AS "entityId", operation_type AS "operationType",
              entity_version AS "entityVersion", schema_version AS "schemaVersion",
              data_scope AS "dataScope", payload,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
       FROM sync_events
       WHERE tenant_id = $1 AND sequence > $2::bigint
         AND device_id <> ${devicePlaceholder} AND ${visibility}
       ORDER BY sequence ASC LIMIT ${limitPlaceholder}`,
      identity.canReadAllBranches
        ? [identity.tenantId, cursor.toString(), identity.deviceId, limit + 1]
        : [identity.tenantId, cursor.toString(), identity.branchId, identity.deviceId, limit + 1]
    );
    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    let nextCursor;
    if (hasMore && rows.length) {
      nextCursor = rows[rows.length - 1].sequence;
    } else {
      const maxResult = await pool.query(
        'SELECT COALESCE(MAX(sequence), $2::bigint)::text AS cursor FROM sync_events WHERE tenant_id = $1',
        [identity.tenantId, cursor.toString()]
      );
      nextCursor = maxResult.rows[0].cursor;
    }
    return {
      events: rows.map(({ sequence: _sequence, ...event }) => event),
      nextCursor,
    };
  }

  async function handleRequest(request, response) {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/ready') {
      try {
        await pool.query('SELECT 1');
        sendJson(response, 200, { ok: true });
      } catch (error) {
        console.error('PostgreSQL readiness check failed:', error);
        sendJson(response, 503, { ok: false });
      }
      return;
    }
    if (isRateLimited(request)) {
      sendJson(response, 429, { error: 'Too many authentication failures' });
      return;
    }
    const identity = authenticate(request);
    if (!identity) {
      recordFailedAuth(request);
      sendJson(response, 401, { error: 'Authentication required' });
      return;
    }
    failedAuth.delete(request.socket.remoteAddress || 'unknown');

    if (request.method === 'POST' && url.pathname === '/sync/push') {
      if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        sendJson(response, 415, { error: 'Content-Type must be application/json' });
        return;
      }
      const input = await readJsonBody(request);
      if (!input || !Array.isArray(input.events) || input.events.length > MAX_BATCH_SIZE) {
        throw new SyncRequestError(`events must be an array of at most ${MAX_BATCH_SIZE} items`);
      }
      const acknowledged = [];
      const failed = [];
      const batchIds = new Set();
      for (const inputEvent of input.events) {
        try {
          const event = validateEvent(inputEvent, identity);
          if (batchIds.has(event.eventId)) throw new SyncRequestError('Duplicate event ID in request batch');
          batchIds.add(event.eventId);
          await persistEvent(identity, event);
          acknowledged.push(event.eventId);
        } catch (error) {
          if (error.code) console.error('PostgreSQL sync event write failed:', error);
          failed.push({
            eventId: typeof inputEvent?.eventId === 'string' ? inputEvent.eventId : '',
            error: error instanceof SyncRequestError
              ? error.message
              : 'The synchronization server could not persist this event; retry later.',
          });
        }
      }
      sendJson(response, 200, { acknowledged, failed });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/sync/pull') {
      if (url.searchParams.get('scope') !== identity.tenantId) {
        throw new SyncRequestError('Requested scope is not authorized', 403);
      }
      const result = await pullEvents(identity, url.searchParams.get('cursor'), url.searchParams.get('limit') ?? '100');
      sendJson(response, 200, result);
      return;
    }
    sendJson(response, 404, { error: 'Not found' });
  }

  return {
    async start() {
      if (server) return server.address();
      if (identities.length === 0) throw new Error('At least one sync client must be configured');
      const schema = await fs.readFile(schemaPath, 'utf8');
      await pool.query(schema);
      const handler = (request, response) => {
        void handleRequest(request, response).catch((error) => {
          if (!response.headersSent) {
            const statusCode = error.statusCode || (error instanceof SyncRequestError ? 400 : 500);
            if (statusCode === 500) console.error('Synchronization request failed:', error);
            sendJson(response, statusCode, {
              error: statusCode === 500 ? 'Synchronization service error' : error.message,
            });
          } else {
            response.destroy(error);
          }
        });
      };
      if (tlsCertPath && tlsKeyPath) {
        server = https.createServer({
          cert: await fs.readFile(tlsCertPath),
          key: await fs.readFile(tlsKeyPath),
          minVersion: 'TLSv1.2',
        }, handler);
      } else {
        server = http.createServer(handler);
      }
      server.headersTimeout = 15000;
      server.requestTimeout = 30000;
      server.keepAliveTimeout = 5000;
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.removeListener('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.removeListener('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
      return server.address();
    },
    async close() {
      if (!server) return;
      const activeServer = server;
      server = null;
      await new Promise((resolve, reject) => {
        activeServer.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}

async function main() {
  let clients;
  try {
    clients = normalizeClients(JSON.parse(process.env.CERAMISYS_SYNC_CLIENTS || ''));
  } catch (error) {
    throw new Error(`CERAMISYS_SYNC_CLIENTS is missing or invalid: ${error.message}`);
  }
  const pool = makePoolFromEnvironment();
  const service = createSyncServer({
    pool,
    clients,
    host: process.env.CERAMISYS_SYNC_HOST || '127.0.0.1',
    port: process.env.CERAMISYS_SYNC_PORT ? Number(process.env.CERAMISYS_SYNC_PORT) : 47821,
    tlsCertPath: process.env.CERAMISYS_SYNC_TLS_CERT
      ? path.resolve(process.env.CERAMISYS_SYNC_TLS_CERT)
      : undefined,
    tlsKeyPath: process.env.CERAMISYS_SYNC_TLS_KEY
      ? path.resolve(process.env.CERAMISYS_SYNC_TLS_KEY)
      : undefined,
  });
  const address = await service.start();
  console.info(`PostgreSQL synchronization server listening on ${address.address}:${address.port}`);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`Received ${signal}; shutting down synchronization server.`);
    try {
      await service.close();
      await pool.end();
      process.exitCode = 0;
    } catch (error) {
      console.error('Synchronization server shutdown failed:', error);
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
}

if (require.main === module) {
  void main().catch((error) => {
    console.error('Could not start the PostgreSQL synchronization server:', error);
    process.exitCode = 1;
  });
}

module.exports = { createSyncServer, readCursor, sendJson };
