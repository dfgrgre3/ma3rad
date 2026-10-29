'use strict';

const { timingSafeEqual } = require('node:crypto');
const { isIP } = require('node:net');

const MAX_EVENT_BYTES = 1024 * 1024;
const MAX_BATCH_SIZE = 250;
const VALID_OPERATIONS = new Set(['CREATE', 'UPDATE', 'DELETE', 'UPSERT']);
const POLICY_CONTROLLED_ENTITIES = new Set([
  'category', 'brand', 'product', 'customer', 'supplier',
  'sales_invoice', 'sales_return', 'purchase_invoice', 'purchase_return',
  'customer_payment', 'supplier_payment', 'stock_transfer',
]);
const SENSITIVE_FIELD = /(?:password|passwd|credential|access.?token|refresh.?token|session|secret|private.?key|encryption.?key|pin.?hash|two.?factor)/i;

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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function validatePayload(payload) {
  let encoded;
  try {
    encoded = JSON.stringify(payload);
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
      if (SENSITIVE_FIELD.test(key)) throw new Error(`Sensitive payload field is not allowed: ${key}`);
      inspect(child, depth + 1);
    }
  };
  inspect(payload);
  return JSON.parse(encoded);
}

function validateEvent(input, identity) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Event must be an object');
  for (const key of ['eventId', 'branchId', 'entityType', 'entityId', 'createdAt']) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 256) {
      throw new Error(`${key} must be a non-empty string of at most 256 characters`);
    }
  }
  if (input.branchId !== identity.branchId) throw new Error('Event branch does not match the authenticated device');
  if (input.tenantId && input.tenantId !== identity.tenantId) throw new Error('Event tenant does not match the authenticated device');
  if (input.deviceId && input.deviceId !== identity.deviceId) throw new Error('Event device does not match the authenticated device');
  if (!VALID_OPERATIONS.has(input.operationType)) throw new Error('Invalid event operation');
  if (!Number.isSafeInteger(input.entityVersion) || input.entityVersion < 1) throw new Error('Invalid entity version');
  if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion < 1) throw new Error('Invalid schema version');
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error('Invalid event creation time');
  const dataScope = input.dataScope ?? 'BRANCH';
  if (dataScope !== 'TENANT' && dataScope !== 'BRANCH') throw new Error('Invalid event data scope');
  if (typeof input.payload === 'undefined') throw new Error('Event payload is required');

  const payload = validatePayload(input.payload);
  if (input.entityType === 'sync_policy') {
    const policy = payload?.policy;
    if (!identity.canManageSyncPolicies || input.operationType !== 'UPSERT' ||
        dataScope !== 'TENANT' || !policy || typeof policy !== 'object' ||
        Array.isArray(policy) || !POLICY_CONTROLLED_ENTITIES.has(policy.entityType) ||
        input.entityId !== policy.entityType || typeof policy.enabled !== 'boolean' ||
        typeof policy.outboundEnabled !== 'boolean' || typeof policy.inboundEnabled !== 'boolean' ||
        !['TENANT', 'BRANCH'].includes(policy.dataScope)) {
      throw new Error('Invalid head-office synchronization policy event');
    }
  }
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
    payload,
    createdAt: input.createdAt,
  };
}

function normalizeClients(clients) {
  if (!Array.isArray(clients)) throw new TypeError('CERAMISYS_SYNC_CLIENTS must be a JSON array');
  const seenTokens = new Set();
  const seenDevices = new Set();
  return clients.map((client) => {
    if (!client || typeof client !== 'object' || Array.isArray(client)) {
      throw new TypeError('Each sync client must be an object');
    }
    for (const field of ['token', 'tenantId', 'branchId', 'deviceId']) {
      if (typeof client[field] !== 'string' || !client[field].trim()) {
        throw new TypeError(`Each sync client must include ${field}`);
      }
    }
    if (Buffer.byteLength(client.token) < 32) throw new TypeError('Sync bearer tokens must contain at least 32 bytes');
    const deviceKey = `${client.tenantId}\0${client.deviceId}`;
    if (seenTokens.has(client.token) || seenDevices.has(deviceKey)) {
      throw new TypeError('Sync tokens and tenant/device identities must be unique');
    }
    seenTokens.add(client.token);
    seenDevices.add(deviceKey);
    return {
      token: client.token,
      tenantId: client.tenantId,
      branchId: client.branchId,
      deviceId: client.deviceId,
      canReadAllBranches: client.canReadAllBranches === true,
      canManageSyncPolicies: client.canManageSyncPolicies === true,
    };
  });
}

module.exports = {
  MAX_BATCH_SIZE,
  constantTimeEqual,
  isLoopbackHost,
  normalizeClients,
  stableJson,
  validateEvent,
};
