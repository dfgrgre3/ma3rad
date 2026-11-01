const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveCentralRequest, sanitizeCentralHeaders } = require('../electron/centralApi');

const trusted = 'https://central.example.com';

test('central IPC accepts only configured HTTPS origin and exact endpoint methods', () => {
  const target = resolveCentralRequest(trusted, {
    serverUrl: `${trusted}/`,
    path: '/api/v1/licensing/validate',
    method: 'POST',
  });
  assert.equal(target.href, `${trusted}/api/v1/licensing/validate`);
  assert.throws(() => resolveCentralRequest(trusted, {
    serverUrl: 'https://attacker.example.com', path: '/api/v1/licensing/validate', method: 'POST',
  }), /origin/i);
  assert.throws(() => resolveCentralRequest(trusted, {
    serverUrl: trusted, path: '/api/v1/licensing/validate?deviceCredential=secret', method: 'POST',
  }), /path/i);
  assert.throws(() => resolveCentralRequest(trusted, {
    serverUrl: trusted, path: '/api/v1/licensing/activate', method: 'GET',
  }), /endpoint or method/i);
});

test('central IPC rejects credential-bearing origins and unapproved headers', () => {
  assert.throws(() => resolveCentralRequest(trusted, {
    serverUrl: 'https://user:secret@central.example.com', path: '/api/v1/releases', method: 'GET',
  }), /origin/i);
  assert.throws(() => sanitizeCentralHeaders({ Authorization: 'Bearer secret' }), /header is not allowed/i);
  assert.deepEqual(sanitizeCentralHeaders({ 'X-Device-Credential': 'secret' }), { 'X-Device-Credential': 'secret' });
});

test('plain HTTP central API is accepted only on loopback in development', () => {
  assert.equal(resolveCentralRequest('http://localhost:4000', {
    serverUrl: 'http://localhost:4000', path: '/api/v1/releases', method: 'GET',
  }, true).origin, 'http://localhost:4000');
  assert.throws(() => resolveCentralRequest('http://central.example.com', {
    serverUrl: 'http://central.example.com', path: '/api/v1/releases', method: 'GET',
  }, true), /origin/i);
});
