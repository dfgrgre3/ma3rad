const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveCentralRequest, sanitizeCentralHeaders } = require('../electron/centralApi');

const trusted = 'https://central.example.com';

test('central IPC uses only the configured HTTPS origin and exact endpoint methods', () => {
  const target = resolveCentralRequest(trusted, {
    path: '/api/v1/licensing/validate',
    method: 'POST',
  });
  assert.equal(target.href, `${trusted}/api/v1/licensing/validate`);

  assert.equal(resolveCentralRequest(trusted, {
    serverUrl: 'https://attacker.example.com',
    path: '/api/v1/licensing/validate',
    method: 'POST',
  }).origin, trusted, 'renderer-provided server URLs are ignored');
  assert.throws(() => resolveCentralRequest(trusted, {
    path: '/api/v1/licensing/validate?deviceCredential=secret',
    method: 'POST',
  }), /path/i);
  assert.throws(() => resolveCentralRequest(trusted, {
    path: '/api/v1/licensing/activate',
    method: 'GET',
  }), /endpoint or method/i);
  assert.throws(() => resolveCentralRequest('', {
    path: '/api/v1/licensing/validate',
    method: 'POST',
  }), /not configured/i);
});

test('central IPC rejects credential-bearing origins and unapproved headers', () => {
  assert.throws(() => sanitizeCentralHeaders({ Authorization: 'not-allowed' }), /header is not allowed/i);
  assert.throws(() => sanitizeCentralHeaders({ 'X-Device-Credential': 'credential' }), /header is not allowed/i);
  assert.deepEqual(sanitizeCentralHeaders({ 'X-Device-Id': 'device' }), { 'X-Device-Id': 'device' });
});

test('plain HTTP central API is accepted only on loopback in development', () => {
  assert.equal(resolveCentralRequest('http://localhost:4000', {
    path: '/api/v1/releases',
    method: 'GET',
  }, true).origin, 'http://localhost:4000');
  assert.throws(() => resolveCentralRequest('http://central.example.com', {
    path: '/api/v1/releases',
    method: 'GET',
  }, true), /origin/i);
});
