import type { User } from '../types';

/**
 * LAN client database manager. Mirrors the synchronous surface of
 * `DatabaseManager` (src/database/db.ts) but executes every statement on the
 * showroom's desktop machine over HTTP (electron/server.js), so all ~40
 * services work unchanged in a browser or on a phone.
 *
 * Requests use synchronous XMLHttpRequest on purpose: the whole service layer
 * is synchronous by design, and on a LAN the round-trip is a few milliseconds.
 */

const TOKEN_KEY = 'ceramisys_remote_token';
const SESSION_KEY = 'ceramisys_session_user_id';
let activeTransactionId: string | null = null;

function readToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function writeToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}

function request(path: string, body: unknown, expectUnauthorized = true): any {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', path, false); // synchronous — required by the sync service API
  xhr.setRequestHeader('Content-Type', 'application/json');
  const token = readToken();
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  try {
    xhr.send(JSON.stringify(body));
  } catch {
    throw new Error('تعذر الاتصال بخادم المعرض. تأكد أن جهاز الكاشير يعمل وأنك على نفس الشبكة.');
  }
  if (xhr.status === 401 && expectUnauthorized) {
    writeToken('');
    throw new Error('انتهت صلاحية الجلسة — أعد تحميل الصفحة لتسجيل الدخول');
  }
  let data: any = null;
  try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
  if (xhr.status < 200 || xhr.status >= 300 || !data?.ok) {
    throw new Error(data?.error || `فشل الطلب (${xhr.status})`);
  }
  return data;
}

export function isRemoteClient(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as any).ceramisys) return false; // Electron desktop app
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return false;
  // Probe the companion server synchronously once. On a dev server or any
  // other host this 404s quickly and the local sql.js path is used.
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/ping', false);
    xhr.send(null);
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText || '{}');
      return data?.server === true;
    }
  } catch { /* not reachable */ }
  return false;
}

export function remoteHasToken(): boolean {
  return !!readToken();
}

/** Login against the LAN server; returns the authenticated user. */
export function remoteLogin(username: string, password: string): User {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/auth/login', false);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(JSON.stringify({ username, password }));
  let data: any = null;
  try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
  if (xhr.status !== 200 || !data?.ok) {
    throw new Error(data?.error || 'فشل تسجيل الدخول');
  }
  writeToken(data.token);
  // Mirror the desktop session key so restoreSession() finds the user.
  try { localStorage.setItem(SESSION_KEY, data.user.id); } catch { /* ignore */ }
  return data.user as User;
}

export function remoteLogout(): void {
  writeToken('');
}

/** Minimal sql.js-shaped shim over HTTP for the ~20 raw `db.exec(...)` call sites. */
class RemoteDatabaseShim {
  public exec(sql: string): Array<{ columns: string[]; values: unknown[][] }> {
    const res = request('/api/db/query', { mode: 'exec', sql, params: [], transactionId: activeTransactionId });
    return res.result || [];
  }
  public run(sql: string, params: any[] = []): void {
    request('/api/db/query', { mode: 'run', sql, params, transactionId: activeTransactionId });
  }
}

export class RemoteDatabaseManager {
  private static instance: RemoteDatabaseManager;
  private shim = new RemoteDatabaseShim();
  private ready = false;

  private constructor() {}

  public static getInstance(): RemoteDatabaseManager {
    if (!RemoteDatabaseManager.instance) {
      RemoteDatabaseManager.instance = new RemoteDatabaseManager();
    }
    return RemoteDatabaseManager.instance;
  }

  public async initialize(): Promise<unknown> {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/ping', false);
    xhr.send(null);
    if (xhr.status !== 200) {
      throw new Error('لا يمكن الوصول إلى خادم المعرض');
    }
    if (!readToken()) {
      // No session yet — allow startup; the login screen will authenticate.
      this.ready = true;
      return null;
    }
    this.ready = true;
    return null;
  }

  public query<T = any>(sql: string, params: any[] = []): T[] {
    const res = request('/api/db/query', { mode: 'query', sql, params, transactionId: activeTransactionId });
    return (res.rows || []) as T[];
  }

  public run(sql: string, params: any[] = []): void {
    request('/api/db/query', { mode: 'run', sql, params, transactionId: activeTransactionId });
  }

  public queryPage<T = any>(
    dataSql: string,
    countSql: string,
    params: any[] = [],
    page = 1,
    pageSize = 25,
  ): { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number } {
    const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 25, 1), 100);
    const totalItems = Number(this.query<any>(countSql, params)[0]?.totalItems ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), totalPages);
    const items = this.query<T>(`${dataSql} LIMIT ? OFFSET ?`, [...params, safePageSize, (safePage - 1) * safePageSize]);
    return { items, page: safePage, pageSize: safePageSize, totalItems, totalPages };
  }

  public nextNumber(prefix: string): string {
    this.run('INSERT OR IGNORE INTO sequence_counters (name, value) VALUES (?, 0)', [prefix]);
    const row = this.query<{ value: number }>('SELECT value FROM sequence_counters WHERE name = ?', [prefix])[0];
    const next = (row?.value ?? 0) + 1;
    this.run('UPDATE sequence_counters SET value = ? WHERE name = ?', [next, prefix]);
    const year = new Date().getFullYear();
    return `${prefix}-${year}-${String(next).padStart(6, '0')}`;
  }

  public executeTransaction<T>(callback: (db: RemoteDatabaseManager) => T): T {
    if (activeTransactionId) throw new Error('A remote database transaction is already active in this tab.');
    activeTransactionId = `rtx_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      this.run('BEGIN TRANSACTION;');
      const result = callback(this);
      this.run('COMMIT;');
      return result;
    } catch (error) {
      try { this.run('ROLLBACK;'); } catch { /* ignore */ }
      throw error;
    } finally {
      activeTransactionId = null;
    }
  }

  public flush(): Promise<void> {
    return Promise.resolve(); // the desktop host persists after every write
  }

  public getStorageBackend(): 'remote' {
    return 'remote';
  }

  public getLastPersistError(): null {
    return null;
  }

  public saveToStorage(): void {
    // The desktop host owns persistence; nothing to do here.
  }

  public getDatabase(): RemoteDatabaseShim {
    return this.shim;
  }

  public getDb(): RemoteDatabaseShim {
    return this.shim;
  }

  public exportDatabaseBinary(): Uint8Array {
    const res = request('/api/db/query', { mode: 'export', transactionId: activeTransactionId });
    return base64ToBytes(res.base64);
  }

  public importDatabaseBinary(bytes: Uint8Array): void {
    request('/api/db/query', { mode: 'import', base64: bytesToBase64(bytes), transactionId: activeTransactionId });
    this.ready = true;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
