import { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { TwoFactorRow } from './twoFactorTypes';

interface PendingTwoFactorSetup {
  userId: string;
  secret: string;
  algorithm: 'TOTP' | 'HOTP';
  period: number;
  recoveryCodes: string[];
  setupDate: string;
}

/**
 * Repository for 2FA secrets/recovery codes. The table is injectable so the
 * same battle-tested crypto path serves both ERP users (`user_2fa`) and
 * platform staff (`platform_staff_2fa`, see migration part116).
 */
export class TwoFactorAuthRepository {
  private readonly tableName: string;

  constructor(tableName = 'user_2fa') {
    this.tableName = tableName;
  }

  private db(): DatabaseManager {
    return DatabaseManager.getInstance();
  }

  findByUserId(userId: string): TwoFactorRow | null {
    try {
      const rows = this.db().query<TwoFactorRow>(
        `SELECT user_id AS userId, secret, algorithm, period, counter, enabled,
                recovery_codes AS recoveryCodes, setup_date AS setupDate,
                last_used_counter AS lastUsedCounter
         FROM ${this.tableName} WHERE user_id = ?`,
        [userId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch {
      return null;
    }
  }

  savePendingSetup(setup: PendingTwoFactorSetup): void {
    this.db().run(
      `INSERT INTO ${this.tableName}
         (user_id, secret, algorithm, period, counter, enabled, recovery_codes, setup_date, last_used_counter, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, NULL, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         secret = excluded.secret,
         algorithm = excluded.algorithm,
         period = excluded.period,
         counter = 0,
         enabled = 0,
         recovery_codes = excluded.recovery_codes,
         setup_date = excluded.setup_date,
         last_used_counter = NULL,
         updated_at = excluded.updated_at`,
      [
        setup.userId,
        setup.secret,
        setup.algorithm,
        setup.period,
        JSON.stringify(setup.recoveryCodes),
        setup.setupDate,
        setup.setupDate,
        setup.setupDate,
      ]
    );
  }

  advanceHotpCounter(userId: string, updatedAt: string): void {
    this.db().run(
      `UPDATE ${this.tableName} SET counter = counter + 1, last_used_counter = counter, updated_at = ? WHERE user_id = ?`,
      [updatedAt, userId]
    );
  }

  setLastUsedCounter(userId: string, counter: number, updatedAt: string): void {
    this.db().run(
      `UPDATE ${this.tableName} SET last_used_counter = ?, updated_at = ? WHERE user_id = ?`,
      [counter, updatedAt, userId]
    );
  }

  setRecoveryCodes(userId: string, recoveryCodes: string[], updatedAt: string): void {
    this.db().run(
      `UPDATE ${this.tableName} SET recovery_codes = ?, updated_at = ? WHERE user_id = ?`,
      [JSON.stringify(recoveryCodes), updatedAt, userId]
    );
  }

  disable(userId: string, updatedAt: string): void {
    this.db().run(`UPDATE ${this.tableName} SET enabled = 0, updated_at = ? WHERE user_id = ?`, [updatedAt, userId]);
  }

  enable(userId: string, algorithm: 'TOTP' | 'HOTP', period: number, updatedAt: string): void {
    this.db().run(
      `UPDATE ${this.tableName} SET enabled = 1, algorithm = ?, period = ?, setup_date = COALESCE(setup_date, ?), updated_at = ? WHERE user_id = ?`,
      [algorithm, period, updatedAt, updatedAt, userId]
    );
  }

  setHardwareToken(userId: string, deviceId: string | null, updatedAt: string): void {
    this.db().run(
      `UPDATE ${this.tableName} SET hardware_token_id = ?, updated_at = ? WHERE user_id = ?`,
      [deviceId, updatedAt, userId]
    );
  }

  /** Hard delete of the row (used by an owner emergency reset of a staff member's 2FA). */
  deleteRow(userId: string): void {
    this.db().run(`DELETE FROM ${this.tableName} WHERE user_id = ?`, [userId]);
  }
}
