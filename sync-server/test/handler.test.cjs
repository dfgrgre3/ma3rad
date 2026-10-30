'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSyncServer } = require('../server');

const identity = {
  token: 'handler-test-token-with-at-least-thirty-two-bytes',
  tenantId: 'tenant-test',
  branchId: 'branch-test',
  deviceId: 'device-test',
};

test('request handler initializes the schema and serves liveness without opening a listener', async () => {
  let queries = 0;
  const pool = {
    async query() {
      queries++;
      return { rows: [] };
    },
    async connect() {
      throw new Error('Liveness must not open a database transaction');
    },
  };
  const service = createSyncServer({ pool, clients: [identity] });
  const responsePromise = new Promise((resolve, reject) => {
    const response = {
      headersSent: false,
      writeHead(statusCode, headers) {
        this.statusCode = statusCode;
        this.headers = headers;
        this.headersSent = true;
      },
      end(body) {
        resolve({ statusCode: this.statusCode, headers: this.headers, body });
      },
      destroy: reject,
    };
    service.handler({
      method: 'GET',
      url: '/health',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    }, response);
  });

  const response = await responsePromise;
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true });
  assert.equal(queries, 1);
});
