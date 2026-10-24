const { ipcMain } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * LAN companion server for CeramiSys ERP.
 *
 * Serves the built UI (dist/) over the local network and proxies database
 * queries to the Electron renderer process, which owns the sql.js database
 * (schema migrations, seeding and all business services live there).
 *
 * Endpoints:
 *   GET  /api/ping        — discovery/health (no auth)
 *   POST /api/auth/login  — { username, password } → { token, user } (no auth)
 *   POST /api/db/query    — { mode: 'query'|'run', sql, params } (token auth)
 *   GET  /*               — static files from dist/
 */

const DEFAULT_PORT = 8585;

// Requests forwarded to the renderer are resolved through pending callbacks
// keyed by an id; the renderer answers on 'remote-db:response'.
let replyCallback = null;
let server = null;
let currentPort = 0;
const sessions = new Map(); // token -> { userId, createdAt }
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function pruneSessions() {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(token);
  }
}

function sendToRenderer(payload) {
  return new Promise((resolve, reject) => {
    if (!replyCallback) {
      reject(new Error('الخادم غير مرتبط بنافذة التطبيق'));
      return;
    }
    const id = crypto.randomUUID();
    let cancel = null;
    const timeout = setTimeout(() => {
      if (cancel) cancel();
      reject(new Error('انتهت مهلة الاستجابة من قاعدة البيانات'));
    }, 30000);
    cancel = replyCallback(id, payload, (result) => {
      clearTimeout(timeout);
      if (result && result.error) reject(new Error(result.error));
      else resolve(result);
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(new Error('طلب كبير جداً'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function authed(req) {
  pruneSessions();
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return sessions.has(token) ? token : null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function createHandler(distDir) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    try {
      if (url.pathname === '/api/ping') {
        return json(res, 200, { ok: true, app: 'CeramiSys ERP', server: true });
      }

      if (url.pathname === '/api/auth/login' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        if (!body.username || typeof body.password !== 'string') {
          return json(res, 400, { ok: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }
        try {
          const result = await sendToRenderer({ mode: 'authLogin', username: body.username, password: body.password });
          const token = crypto.randomBytes(32).toString('hex');
          sessions.set(token, { userId: result.user?.id, createdAt: Date.now() });
          return json(res, 200, { ok: true, token, user: result.user });
        } catch (e) {
          return json(res, 401, { ok: false, error: e.message });
        }
      }

      if (url.pathname === '/api/db/query' && req.method === 'POST') {
        const token = authed(req);
        if (!token) return json(res, 401, { ok: false, error: 'الجلسة منتهية، أعد تسجيل الدخول' });
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        if (typeof body.sql !== 'string' || !Array.isArray(body.params || [])) {
          return json(res, 400, { ok: false, error: 'استعلام غير صالح' });
        }
        try {
          const result = await sendToRenderer({
            mode: body.mode === 'run' ? 'run' : 'query',
            sql: body.sql,
            params: body.params || [],
          });
          return json(res, 200, { ok: true, rows: result.rows || [] });
        } catch (e) {
          return json(res, 500, { ok: false, error: e.message });
        }
      }

      // Static UI
      const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const filePath = path.join(distDir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!filePath.startsWith(distDir)) {
        return json(res, 403, { ok: false, error: 'forbidden' });
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA fallback: unknown non-asset paths serve index.html.
          if (!path.extname(rel)) {
            fs.readFile(path.join(distDir, 'index.html'), (err2, index) => {
              if (err2) return json(res, 404, { ok: false, error: 'dist/index.html غير موجود — شغّل npm run build أولاً' });
              res.writeHead(200, { 'Content-Type': MIME['.html'] });
              res.end(index);
            });
            return;
          }
          return json(res, 404, { ok: false, error: 'not found' });
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
    }
  };
}

function start({ port, distDir, win }) {
  return new Promise((resolve, reject) => {
    if (server) return resolve({ ok: true, port: currentPort, alreadyRunning: true });
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      reject(new Error('لم يتم العثور على واجهة مبنية (dist/index.html). شغّل npm run build أولاً.'));
      return;
    }
    const handler = createHandler(distDir);
    const tryPort = Number(port) || DEFAULT_PORT;
    const attempt = (p, triesLeft) => {
      const s = http.createServer(handler);
      s.once('error', (err) => {
        if (triesLeft > 0) attempt(p + 1, triesLeft - 1);
        else reject(new Error('تعذر تشغيل الخادم: ' + err.message));
      });
      s.listen(p, '0.0.0.0', () => {
        server = s;
        currentPort = p;
        resolve({ ok: true, port: p });
      });
    };
    attempt(tryPort, 10);
  });
}

function stop() {
  return new Promise((resolve) => {
    if (!server) return resolve({ ok: true });
    server.close(() => resolve({ ok: true }));
    server.closeAllConnections?.();
    server = null;
    currentPort = 0;
    sessions.clear();
  });
}

function registerIpc(getWindow) {
  ipcMain.handle('server:start', async (_e, { port }) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return { ok: false, error: 'لا توجد نافذة نشطة' };
    const distDir = app_dist();
    const result = await start({
      port,
      distDir,
      win,
    }).catch((e) => ({ ok: false, error: e.message }));
    if (result.ok) {
      // Wire the query bridge to this window's renderer.
      const webContents = win.webContents;
      replyCallback = (id, payload, reply) => {
        const listener = (_ev, msg) => {
          if (msg?.id === id) {
            ipcMain.removeListener('remote-db:response', listener);
            reply(msg.result);
          }
        };
        ipcMain.on('remote-db:response', listener);
        webContents.send('remote-db:request', { id, payload });
        return () => ipcMain.removeListener('remote-db:response', listener);
      };
    }
    return result;
  });
  ipcMain.handle('server:stop', async () => stop());
  ipcMain.handle('server:status', async () => ({
    ok: true,
    running: !!server,
    port: currentPort,
    addresses: lanAddresses(currentPort),
  }));
}

const os = require('os');
function lanAddresses(port) {
  if (!port) return [];
  const out = [];
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const iface of ifs || []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(`http://${iface.address}:${port}`);
    }
  }
  return out;
}

let cachedDist = null;
function app_dist() {
  if (cachedDist) return cachedDist;
  cachedDist = path.join(__dirname, '..', 'dist');
  return cachedDist;
}

module.exports = { registerIpc, start, stop };
