const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } = require('node:crypto');
const { isIP } = require('node:net');

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_BATCH_SIZE = 250;
const MAX_EVENT_BYTES = 1024 * 1024;
const VALID_OPERATIONS = new Set(['CREATE', 'UPDATE', 'DELETE', 'UPSERT']);
const POLICY_CONTROLLED_ENTITIES = new Set([
  'category', 'brand', 'product', 'customer', 'supplier', 'sales_invoice', 'sales_return',
]);
const FORBIDDEN_PAYLOAD_KEY = /(?:password|passwd|credential|access.?token|refresh.?token|session|secret|private.?key|encryption.?key|pin.?hash|two.?factor)/i;

function isLoopbackHost(host) {
  const normalized = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '::1' ||
    (isIP(normalized) === 4 && normalized.startsWith('127.'));
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function validateEvent(input, identity) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Event must be an object');
  const requiredStrings = ['eventId', 'branchId', 'entityType', 'entityId', 'createdAt'];
  for (const key of requiredStrings) {
    if (typeof input[key] !== 'string' || input[key].trim().length === 0 || input[key].length > 256) {
      throw new Error(`${key} must be a non-empty string of at most 256 characters`);
    }
  }
  if (input.branchId !== identity.branchId) throw new Error('Event branch does not match the authenticated device');
  if (input.tenantId && input.tenantId !== identity.tenantId) throw new Error('Event tenant does not match the authenticated device');
  if (input.deviceId && input.deviceId !== identity.deviceId) throw new Error('Event device does not match the authenticated device');
  if (!VALID_OPERATIONS.has(input.operationType)) throw new Error('Invalid event operation');
  if (!Number.isSafeInteger(input.entityVersion) || input.entityVersion < 1) throw new Error('Invalid entity version');
  if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion < 1) throw new Error('Invalid schema version');
  if (typeof input.payload === 'undefined') throw new Error('Event payload is required');

  const dataScope = input.dataScope ?? 'BRANCH';
  if (dataScope !== 'TENANT' && dataScope !== 'BRANCH') throw new Error('Invalid event data scope');
  if (input.entityType === 'sync_policy') {
    const policy = input.payload && input.payload.policy;
    if (!identity.canManageSyncPolicies) throw new Error('Only the authorized head-office device can publish sync policies');
    if (input.operationType !== 'UPSERT' || dataScope !== 'TENANT' ||
        !policy || typeof policy !== 'object' || Array.isArray(policy) ||
        !POLICY_CONTROLLED_ENTITIES.has(policy.entityType) ||
        input.entityId !== policy.entityType ||
        typeof policy.enabled !== 'boolean' ||
        typeof policy.outboundEnabled !== 'boolean' ||
        typeof policy.inboundEnabled !== 'boolean' ||
        !['TENANT', 'BRANCH'].includes(policy.dataScope)) {
      throw new Error('Invalid head-office synchronization policy event');
    }
  }
  let encoded;
  try {
    encoded = JSON.stringify(input.payload);
  } catch (error) {
    throw new Error(`Event payload is not serializable: ${error.message || error}`);
  }
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > MAX_EVENT_BYTES) {
    throw new Error('Event payload exceeds the maximum size');
  }
  const inspect = (value, depth = 0) => {
    if (depth > 40) throw new Error('Event payload nesting exceeds the maximum depth');
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_PAYLOAD_KEY.test(key)) throw new Error(`Sensitive payload field is not allowed: ${key}`);
      inspect(child, depth + 1);
    }
  };
  inspect(input.payload);

  return {
    eventId: input.eventId,
    tenantId: identity.tenantId,
    branchId: identity.branchId,
    deviceId: identity.deviceId,
    entityType: input.entityType,
    entityId: input.entityId,
    operationType: input.operationType,
    entityVersion: input.entityVersion,
    schemaVersion: input.schemaVersion,
    dataScope,
    payload: JSON.parse(encoded),
    createdAt: input.createdAt,
  };
}

class SyncJournal {
  constructor(filePath, encryptionKey) {
    this.filePath = filePath;
    this.encryptionKey = encryptionKey;
    this.records = [];
    this.byEventId = new Map();
    this.policies = new Map();
    this.writeQueue = Promise.resolve();
    this.writeError = null;
  }

  async load() {
    let content;
    try {
      content = await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (!content) return;
    if (!content.endsWith('\n')) {
      throw new Error('Sync journal has an incomplete final record; preserve it and restore from backup before continuing.');
    }
    let expectedSequence = 1;
    for (const line of content.split('\n').slice(0, -1)) {
      let record;
      try {
        const envelope = JSON.parse(line);
        const iv = Buffer.from(envelope.iv, 'base64');
        const tag = Buffer.from(envelope.tag, 'base64');
        const ciphertext = Buffer.from(envelope.data, 'base64');
        if (envelope.version !== 1 || iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
          throw new Error('Invalid encrypted journal record');
        }
        const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(tag);
        record = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
      } catch {
        throw new Error(`Sync journal record failed integrity verification at sequence ${expectedSequence}`);
      }
      if (
        !record || record.sequence !== expectedSequence ||
        typeof record.tenantId !== 'string' ||
        !record.event || typeof record.event.eventId !== 'string'
      ) {
        throw new Error(`Sync journal is invalid at sequence ${expectedSequence}`);
      }
      const key = `${record.tenantId}\0${record.event.eventId}`;
      if (this.byEventId.has(key)) throw new Error(`Sync journal contains a duplicate event at sequence ${expectedSequence}`);
      this.records.push(record);
      this.byEventId.set(key, record);
      this.applyPolicyRecord(record);
      expectedSequence++;
    }
  }

  async append(tenantId, event, identity) {
    const key = `${tenantId}\0${event.eventId}`;
    const write = this.writeQueue.then(async () => {
      if (this.writeError) throw new Error(`Sync journal is unavailable after a write failure: ${this.writeError.message || this.writeError}`);
      const existing = this.byEventId.get(key);
      if (existing) {
        if (JSON.stringify(existing.event) !== JSON.stringify(event)) {
          throw new Error(`Event ID collision: ${event.eventId}`);
        }
        return { duplicate: true, sequence: existing.sequence };
      }
      if (POLICY_CONTROLLED_ENTITIES.has(event.entityType)) {
        const policy = this.policies.get(`${tenantId}\0${event.entityType}`);
        if (!policy) {
          if (!identity.canManageSyncPolicies) {
            throw new Error('Waiting for the head-office synchronization policy for this entity type');
          }
        } else if (
          !policy.enabled ||
          !policy.outboundEnabled ||
          (policy.dataScope === 'BRANCH' && event.dataScope !== 'BRANCH') ||
          (event.dataScope !== 'TENANT' && event.dataScope !== 'BRANCH')
        ) {
          throw new Error(`Head-office policy does not allow publishing ${event.entityType} events`);
        }
      }

      const sequence = this.records.length + 1;
      const record = { sequence, tenantId, event };
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(record), 'utf8'), cipher.final()]);
      const serialized = `${JSON.stringify({
        version: 1,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: ciphertext.toString('base64'),
      })}\n`;
      await fs.mkdir(require('node:path').dirname(this.filePath), { recursive: true });
      try {
        const handle = await fs.open(this.filePath, 'a', 0o600);
        try {
          await handle.writeFile(serialized, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
      } catch (error) {
        this.writeError = error;
        throw error;
      }
      this.records.push(record);
      this.byEventId.set(key, record);
      this.applyPolicyRecord(record);
      return { duplicate: false, sequence };
    });
    this.writeQueue = write.then(() => undefined, () => undefined);
    return write;
  }

  applyPolicyRecord(record) {
    const event = record.event;
    if (event.entityType !== 'sync_policy' || !POLICY_CONTROLLED_ENTITIES.has(event.entityId)) return;
    const policy = event.payload?.policy;
    if (!policy || policy.entityType !== event.entityId) return;
    this.policies.set(`${record.tenantId}\0${event.entityId}`, policy);
  }

  pull(identity, cursor, limit) {
    const after = cursor === null ? 0 : Number(cursor);
    if (!Number.isSafeInteger(after) || after < 0) throw new Error('Invalid sync cursor');
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH_SIZE) throw new Error('Invalid sync batch size');

    const scanned = this.records.filter((record) => record.sequence > after).slice(0, limit);
    const events = scanned
      .filter((record) => {
        const event = record.event;
        if (record.tenantId !== identity.tenantId || event.deviceId === identity.deviceId) return false;
        if (event.dataScope === 'BRANCH' && event.branchId !== identity.branchId && !identity.canReadAllBranches) {
          return false;
        }
        return true;
      })
      .map((record) => record.event);
    const latestSequence = this.records[this.records.length - 1]?.sequence ?? after;
    const next = scanned.length === limit
      ? scanned[scanned.length - 1].sequence
      : latestSequence;
    return { events, nextCursor: String(Math.max(after, next)) };
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    request.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('Request body exceeds the maximum size'), { statusCode: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
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

function normalizeClients(clients) {
  if (!Array.isArray(clients)) throw new TypeError('Sync clients must be an array');
  const tokens = new Set();
  return clients.map((client) => {
    if (!client || typeof client !== 'object') throw new TypeError('Invalid sync client configuration');
    for (const field of ['token', 'tenantId', 'branchId', 'deviceId']) {
      if (typeof client[field] !== 'string' || client[field].trim().length === 0) {
        throw new TypeError(`Sync client ${field} is required`);
      }
    }
    if (Buffer.byteLength(client.token) < 32) throw new TypeError('Sync bearer tokens must contain at least 32 bytes');
    if (tokens.has(client.token)) throw new TypeError('Sync bearer tokens must be unique');
    tokens.add(client.token);
    return Object.freeze({
      token: client.token,
      tenantId: client.tenantId,
      branchId: client.branchId,
      deviceId: client.deviceId,
      canReadAllBranches: client.canReadAllBranches === true,
      canManageSyncPolicies: client.canManageSyncPolicies === true,
    });
  });
}

function createSyncRelay({
  journalPath,
  encryptionKey,
  host = '127.0.0.1',
  port = 47821,
  clients = [],
  tlsCertPath,
  tlsKeyPath,
}) {
  if (typeof journalPath !== 'string' || !journalPath) throw new TypeError('Sync journal path is required');
  if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) {
    throw new TypeError('A 256-bit sync journal encryption key is required');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('Sync server port must be between 0 and 65535');
  if (Boolean(tlsCertPath) !== Boolean(tlsKeyPath)) {
    throw new Error('Both HTTPS certificate and key paths must be configured together');
  }
  if (!isLoopbackHost(host) && (!tlsCertPath || !tlsKeyPath)) {
    throw new Error('HTTPS certificate and key are required when the sync server binds outside loopback');
  }
  const identities = normalizeClients(clients);
  const journal = new SyncJournal(journalPath, encryptionKey);
  let server = null;
  const failedAuth = new Map();

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
    if (!previous && failedAuth.size >= 5000) return true;
    return false;
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

  async function handleRequest(request, response) {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true });
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
        sendJson(response, 400, { error: `events must be an array of at most ${MAX_BATCH_SIZE} items` });
        return;
      }
      const acknowledged = [];
      const failed = [];
      const batchIds = new Set();
      for (const inputEvent of input.events) {
        try {
          const event = validateEvent(inputEvent, identity);
          if (batchIds.has(event.eventId)) throw new Error('Duplicate event ID in request batch');
          batchIds.add(event.eventId);
          await journal.append(identity.tenantId, event, identity);
          acknowledged.push(event.eventId);
        } catch (error) {
          failed.push({
            eventId: typeof inputEvent?.eventId === 'string' ? inputEvent.eventId : '',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      sendJson(response, 200, { acknowledged, failed });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/sync/pull') {
      if (url.searchParams.get('scope') !== identity.tenantId) {
        sendJson(response, 403, { error: 'Requested scope is not authorized' });
        return;
      }
      const cursorValue = url.searchParams.get('cursor');
      const limitValue = Number(url.searchParams.get('limit') ?? 100);
      try {
        const result = journal.pull(identity, cursorValue, limitValue);
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    sendJson(response, 404, { error: 'Not found' });
  }

  return {
    async start() {
      if (server) return server.address();
      if (identities.length === 0) throw new Error('At least one sync client must be configured');
      await journal.load();
      const handler = (request, response) => {
        void handleRequest(request, response).catch((error) => {
          if (!response.headersSent) {
            sendJson(response, error.statusCode || 500, {
              error: error.statusCode ? error.message : 'Sync service error',
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
    status() {
      const address = server?.address();
      return {
        serverEnabled: identities.length > 0,
        serverListening: Boolean(address),
        host: address?.address ?? null,
        port: address?.port ?? null,
        journalEvents: journal.records.length,
      };
    },
  };
}

function createHttpSyncClient({ url, token, tenantId, branchId, deviceId, timeoutMs = 15000 }) {
  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    throw new TypeError('Sync server URL is invalid');
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new TypeError('Sync server URL must not contain credentials, query parameters, or a fragment');
  }
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && isLoopbackHost(endpoint.hostname))) {
    throw new Error('Sync connections require HTTPS except for loopback testing');
  }
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32) throw new TypeError('A 32-byte sync bearer token is required');
  const identity = { tenantId, branchId, deviceId };
  for (const [field, value] of Object.entries(identity)) {
    if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`Sync client ${field} is required`);
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new RangeError('Invalid sync request timeout');

  async function request(path, options = {}) {
    const response = await fetch(new URL(path, endpoint), {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(body?.error || `Sync service returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  return {
    async pushEvents(events) {
      for (const event of events) {
        if (event.tenantId && event.tenantId !== identity.tenantId) throw new Error('Outbox contains an event for another tenant');
        if (event.branchId !== identity.branchId) throw new Error('Outbox contains an event for another branch');
        if (event.deviceId && event.deviceId !== identity.deviceId) throw new Error('Outbox contains an event for another device');
      }
      return request('/sync/push', { method: 'POST', body: JSON.stringify({ events }) });
    },
    async pullEvents(scope, cursor, limit) {
      if (scope !== identity.tenantId) throw new Error('Requested sync scope does not match the configured tenant');
      const query = new URLSearchParams({
        scope,
        cursor: cursor ?? '',
        limit: String(limit),
      });
      return request(`/sync/pull?${query}`);
    },
  };
}

module.exports = {
  createHttpSyncClient,
  createSyncRelay,
  isLoopbackHost,
  validateEvent,
};
