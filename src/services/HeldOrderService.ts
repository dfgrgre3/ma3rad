import { DatabaseManager } from '../database/db';

export interface HeldOrderRecord { id: string; data: string; createdAt: string; }

export class HeldOrderService {
  private db = DatabaseManager.getInstance();

  getAll(): HeldOrderRecord[] {
    try {
      return this.db.query<HeldOrderRecord>(`SELECT id, data, created_at AS createdAt FROM held_orders ORDER BY created_at DESC`);
    } catch {
      return [];
    }
  }

  save(id: string, data: string, createdBy?: string): void {
    try {
      const exists = this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM held_orders WHERE id = ?`, [id])[0]?.c ?? 0;
      if (exists > 0) {
        this.db.run(`UPDATE held_orders SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [data, id]);
      } else {
        this.db.run(`INSERT INTO held_orders (id, data, created_by) VALUES (?, ?, ?)`, [id, data, createdBy || null]);
      }
    } catch { /* ignore */ }
  }

  delete(id: string): void {
    try {
      this.db.run(`DELETE FROM held_orders WHERE id = ?`, [id]);
    } catch { /* ignore */ }
  }

  clearAll(): void {
    try {
      this.db.run(`DELETE FROM held_orders`);
    } catch { /* ignore */ }
  }
}