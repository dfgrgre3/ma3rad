import { DatabaseManager } from './db';
import { AuthService } from '../services/AuthService';

/**
 * Renderer-side bridge for LAN clients. When the Electron main process runs
 * the LAN server (electron/server.js), every HTTP request from a browser or
 * phone is forwarded here through `window.ceramisys.remoteDb`. This module
 * executes those payloads against the local sql.js database — the single
 * source of truth — so remote clients see exactly the same data.
 */

export function registerRemoteDbBridge(): void {
  const api = (window as any).ceramisys?.remoteDb;
  if (!api?.onRequest) return; // not running inside Electron

  api.onRequest(async (payload: any) => {
    switch (payload?.mode) {
      case 'authLogin': {
        // Runs the full login flow locally (lockout, audit history, sessions)
        // and hands the resulting user back to the LAN client.
        const user = AuthService.login(String(payload.username), String(payload.password));
        return { user };
      }
      case 'exec': {
        const raw = DatabaseManager.getInstance().getDatabase().exec(String(payload.sql));
        return { result: raw };
      }
      case 'export': {
        const bytes = DatabaseManager.getInstance().exportDatabaseBinary();
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return { base64: btoa(binary) };
      }
      case 'import': {
        const binary = atob(String(payload.base64));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        DatabaseManager.getInstance().importDatabaseBinary(bytes);
        return {};
      }
      case 'run': {
        DatabaseManager.getInstance().run(String(payload.sql), payload.params || []);
        return { rows: [] };
      }
      case 'query':
      default: {
        const rows = DatabaseManager.getInstance().query(String(payload.sql), payload.params || []);
        return { rows };
      }
    }
  });
}
