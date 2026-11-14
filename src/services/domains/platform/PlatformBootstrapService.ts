import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';

/**
 * One-time secure bootstrap for the platform owner account.
 * No default password is ever shipped; the operator must invoke this
 * explicitly with a strong password before the platform can be used.
 */
export class PlatformBootstrapService {
  constructor(private readonly db: DatabaseManager) {}

  public isBootstrapped(): boolean {
    const row = this.db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM users WHERE role = 'SUPER_ADMIN'`
    )[0];
    return Boolean(row && row.c > 0);
  }

  public bootstrap(username: string, password: string, fullName = 'مالك المنصة'): string {
    if (this.isBootstrapped()) {
      throw new Error('Platform owner already bootstrapped.');
    }
    if (!username || username.trim().length < 3) {
      throw new Error('اسم المستخدم يجب أن يكون 3 أحرف على الأقل.');
    }
    if (!password || password.length < 12) {
      throw new Error('كلمة المرور يجب أن تكون 12 حرفًا على الأقل.');
    }
    const id = `usr_platform_${uuidv4().replace(/-/g, '').slice(0, 8)}`;
    const hash = bcrypt.hashSync(password, 12);
    this.db.run(
      `INSERT INTO users
         (id, username, password_hash, full_name, role, phone, pin_code, is_active, branch_id, branch_scope)
       VALUES (?, ?, ?, ?, 'SUPER_ADMIN', NULL, NULL, 1, ?, 'ALL')`,
      [id, username.trim(), hash, fullName, 'DEFAULT_BRANCH']
    );
    return id;
  }
}
