import { DatabaseManager } from '../database/db.ts';

export class CursorManager {
  private dbManager: DatabaseManager;
  constructor(dbManager?: DatabaseManager) { this.dbManager = dbManager || DatabaseManager.getInstance(); }
  getCursor(scope: string): string | null {
    const rows = this.dbManager.query<{ cursor: string | null }>(
      `SELECT cursor FROM sync_cursor WHERE scope=?`, [scope]
    );
    return rows.length ? rows[0].cursor : null;
  }
  setCursor(scope: string, cursor: string): void {
    this.dbManager.run(
      `INSERT INTO sync_cursor (scope, cursor, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(scope) DO UPDATE SET cursor=excluded.cursor, updated_at=CURRENT_TIMESTAMP`,
      [scope, cursor]
    );
  }
  resetCursor(scope: string): void {
    this.dbManager.run(`DELETE FROM sync_cursor WHERE scope=?`, [scope]);
  }
}
