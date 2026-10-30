'use strict';

const MAX_BATCH_SIZE = 100;
const MAX_CURSOR = 9_223_372_036_854_775_807n;

function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 256) {
    throw new TypeError(`${field} must be a non-empty string of at most 256 characters`);
  }
  return value;
}

function normalizePeers(peers, identities) {
  if (!Array.isArray(peers)) throw new TypeError('CERAMISYS_SYNC_PEERS must be a JSON array');
  const peerIds = new Set();
  const branchIds = new Set();

  return peers.map((peer) => {
    if (!peer || typeof peer !== 'object' || Array.isArray(peer)) {
      throw new TypeError('Each sync peer must be an object');
    }

    const peerId = requiredString(peer.peerId, 'peerId');
    const tenantId = requiredString(peer.tenantId, 'tenantId');
    const branchId = requiredString(peer.branchId, 'branchId');
    const localDeviceId = requiredString(peer.localDeviceId, 'localDeviceId');
    if (typeof peer.token !== 'string' || Buffer.byteLength(peer.token) < 32) {
      throw new TypeError('Each sync peer requires a remote bearer token of at least 32 bytes');
    }
    if (peerIds.has(peerId) || branchIds.has(branchId)) {
      throw new TypeError('Sync peer IDs and branch IDs must be unique');
    }
    peerIds.add(peerId);
    branchIds.add(branchId);

    let endpoint;
    try {
      endpoint = new URL(peer.url);
    } catch {
      throw new TypeError(`Sync peer ${peerId} URL is invalid`);
    }
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
      throw new TypeError(`Sync peer ${peerId} URL must be an origin without credentials, path, query, or fragment`);
    }
    const loopback = endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1' ||
      endpoint.hostname === '[::1]';
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) {
      throw new TypeError(`Sync peer ${peerId} must use HTTPS except for loopback testing`);
    }

    const localIdentity = identities.find((identity) =>
      identity.tenantId === tenantId && identity.deviceId === localDeviceId);
    if (!localIdentity || !localIdentity.canServePeerSync ||
        !localIdentity.canReplicateBranches.includes(branchId)) {
      throw new TypeError(`Sync peer ${peerId} must map to a local peer credential authorized for branch ${branchId}`);
    }
    if (localIdentity.branchId === branchId) {
      throw new TypeError(`Sync peer ${peerId} cannot point to the local branch`);
    }

    return {
      peerId,
      tenantId,
      branchId,
      localDeviceId,
      token: peer.token,
      url: endpoint.origin,
      identity: localIdentity,
    };
  });
}

function parseCursor(value, peerId) {
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) {
    throw new Error(`Sync peer ${peerId} returned an invalid cursor`);
  }
  const cursor = BigInt(value);
  if (cursor > MAX_CURSOR) throw new Error(`Sync peer ${peerId} returned an invalid cursor`);
  return cursor;
}

function createPeerReplication({
  pool,
  peers,
  applyEvent,
  intervalMs = 5000,
  fetchImpl = globalThis.fetch,
  logger = console,
}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A database pool is required');
  if (!Array.isArray(peers)) throw new TypeError('Peers must be an array');
  if (typeof applyEvent !== 'function') throw new TypeError('An event replication handler is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 120000) {
    throw new RangeError('Peer replication interval must be between 1000ms and 120000ms');
  }

  const peerStatuses = new Map(peers.map((peer) => [peer.peerId, {
    lastSuccessAt: null,
    lastError: null,
    lastErrorLoggedAt: 0,
  }]));
  let timer = null;
  let activeTick = null;
  let stopped = true;

  async function getCursor(peer) {
    const result = await pool.query(
      'SELECT cursor::text AS cursor FROM sync_peer_cursors WHERE tenant_id = $1 AND peer_id = $2',
      [peer.tenantId, peer.peerId]
    );
    return result.rows[0]?.cursor || '0';
  }

  async function saveCursor(peer, cursor) {
    await pool.query(
      `INSERT INTO sync_peer_cursors (tenant_id, peer_id, cursor, updated_at)
       VALUES ($1, $2, $3::bigint, CURRENT_TIMESTAMP)
       ON CONFLICT (tenant_id, peer_id) DO UPDATE SET
         cursor = GREATEST(sync_peer_cursors.cursor, EXCLUDED.cursor),
         updated_at = CURRENT_TIMESTAMP`,
      [peer.tenantId, peer.peerId, cursor]
    );
  }

  async function pullBatch(peer, cursor) {
    const endpoint = new URL('/sync/replicate/pull', peer.url);
    endpoint.searchParams.set('scope', peer.tenantId);
    endpoint.searchParams.set('cursor', cursor);
    endpoint.searchParams.set('limit', String(MAX_BATCH_SIZE));

    const response = await fetchImpl(endpoint, {
      headers: {
        authorization: `Bearer ${peer.token}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error || `Remote sync peer returned HTTP ${response.status}`);
    }
    if (!body || !Array.isArray(body.events) || body.events.length > MAX_BATCH_SIZE) {
      throw new Error(`Sync peer ${peer.peerId} returned an invalid event batch`);
    }
    const nextCursor = parseCursor(body.nextCursor, peer.peerId);
    if (nextCursor < BigInt(cursor)) throw new Error(`Sync peer ${peer.peerId} moved its cursor backwards`);
    for (const event of body.events) {
      if (!event || event.tenantId !== peer.tenantId || event.branchId !== peer.branchId) {
        throw new Error(`Sync peer ${peer.peerId} returned an event outside its assigned tenant or branch`);
      }
    }
    if (body.events.length > 0 && nextCursor <= BigInt(cursor)) {
      throw new Error(`Sync peer ${peer.peerId} did not advance its cursor`);
    }
    return { events: body.events, nextCursor: nextCursor.toString() };
  }

  async function replicatePeer(peer) {
    const cursor = await getCursor(peer);
    const batch = await pullBatch(peer, cursor);
    for (const event of batch.events) {
      await applyEvent(peer, event);
    }
    if (batch.nextCursor !== cursor) await saveCursor(peer, batch.nextCursor);
    peerStatuses.get(peer.peerId).lastSuccessAt = new Date().toISOString();
    peerStatuses.get(peer.peerId).lastError = null;
  }

  async function runTick(force = false) {
    for (const peer of peers) {
      if (stopped && !force) return;
      try {
        await replicatePeer(peer);
      } catch (error) {
        const status = peerStatuses.get(peer.peerId);
        status.lastError = error instanceof Error ? error.message : String(error);
        if (Date.now() - status.lastErrorLoggedAt >= 60000) {
          status.lastErrorLoggedAt = Date.now();
          logger.error(`Peer synchronization failed for ${peer.peerId}:`, error);
        }
      }
    }
  }

  function tick(force = false) {
    if (activeTick) return activeTick;
    activeTick = runTick(force).finally(() => {
      activeTick = null;
    });
    return activeTick;
  }

  return {
    start() {
      if (timer || peers.length === 0) return;
      stopped = false;
      void tick();
      timer = setInterval(() => { void tick(); }, intervalMs);
      timer.unref?.();
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      await activeTick;
    },
    runOnce() {
      return tick(true);
    },
    status() {
      return [...peerStatuses.entries()].map(([peerId, status]) => ({
        peerId,
        lastSuccessAt: status.lastSuccessAt,
        lastError: status.lastError,
      }));
    },
  };
}

module.exports = { createPeerReplication, normalizePeers };
