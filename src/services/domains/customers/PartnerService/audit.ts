import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { PartnerActor } from './types';

export function auditPartner(
  db: DatabaseManager,
  actor: PartnerActor,
  action: string,
  recordId: string,
  oldValues: unknown,
  newValues: unknown
): void {
  db.run(`
    INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
    VALUES (?, ?, ?, ?, 'PARTNERS', ?, ?, ?)
  `, [
    `aud_${uuidv4().slice(0, 10)}`, actor.id, actor.fullName, action, recordId,
    oldValues === null ? null : JSON.stringify(oldValues), JSON.stringify(newValues),
  ]);
}
