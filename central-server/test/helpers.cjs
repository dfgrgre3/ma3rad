'use strict';

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { existsSync, rmSync } = require('node:fs');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();

function tempDbPath(name) {
  return path.join(os.tmpdir(), `ceramisys-central-${name}-${process.pid}-${randomUUID().slice(0, 8)}.db`);
}

function removeDbFiles(filename) {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${filename}${suffix}`;
    if (existsSync(target)) {
      try {
        rmSync(target, { force: true });
      } catch {
        // best effort in temp dir
      }
    }
  }
}

async function startTestServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    server,
    base: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function api(base, routePath, { method = 'GET', token, body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${routePath}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, body: json, text, headers: response.headers };
}

async function openRawDatabase(filename) {
  return open({ filename, driver: sqlite3.Database });
}

module.exports = {
  tempDbPath,
  removeDbFiles,
  startTestServer,
  api,
  openRawDatabase,
};
