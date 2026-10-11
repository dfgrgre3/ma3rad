import { DatabaseManager } from '../database/db';
import type { User, UserRole } from '../types';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PermissionService } from './PermissionService';

export class AuthService {
  private db = DatabaseManager.getInstance();
  private static currentUser: User | null = null;

  /** Returns the logged-in user, or null if not authenticated. Never silently impersonates admin. */
  public static getCurrentUser(): User | null {
    return AuthService.currentUser;
  }

  /** Throws if no user is authenticated. Use at the top of every service method (brief §108). */
  public static requireAuth(): User {
    if (!AuthService.currentUser) {
      throw new Error('يجب تسجيل الدخول لتنفيذ هذا الإجراء.');
    }
    return AuthService.currentUser;
  }

  public static setCurrentUser(user: User): void {
    AuthService.currentUser = user;
    PermissionService.invalidate(user);
  }

  public static logout(): void {
    if (AuthService.currentUser) PermissionService.invalidate(AuthService.currentUser);
    AuthService.currentUser = null;
  }

  public static login(username: string, passwordAttempt: string): User {
    const db = DatabaseManager.getInstance();
    const rows = db.query<any>(`SELECT * FROM users WHERE username = ? AND is_active = 1`, [username]);
    if (rows.length === 0) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    const userRecord = rows[0];
    const isValid = bcrypt.compareSync(passwordAttempt, userRecord.passwordHash);
    if (!isValid) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    const user: User = {
      id: userRecord.id,
      username: userRecord.username,
      fullName: userRecord.fullName,
      role: userRecord.role,
      phone: userRecord.phone,
      isActive: Boolean(userRecord.isActive),
      createdAt: userRecord.createdAt,
      updatedAt: userRecord.updatedAt
    };

    AuthService.setCurrentUser(user);
    return user;
  }

  public getAllUsers(): User[] {
    const rows = this.db.query<any>(`SELECT id, username, full_name, role, phone, pin_code, is_active, created_at, updated_at FROM users ORDER BY full_name ASC`);
    return rows.map(r => ({
      id: r.id,
      username: r.username,
      fullName: r.fullName,
      role: r.role,
      phone: r.phone,
      pinCode: r.pinCode,
      isActive: Boolean(r.isActive),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
  }

  public createUser(user: { username: string; password: string; fullName: string; role: UserRole; phone?: string; pinCode?: string }, performedBy = 'usr_admin'): User {
    const existing = this.db.query(`SELECT id FROM users WHERE username = ?`, [user.username]);
    if (existing.length > 0) {
      throw new Error('اسم المستخدم مسجل مسبقاً.');
    }

    const id = `usr_${uuidv4().substring(0, 8)}`;
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(user.password, salt);

    this.db.run(`
      INSERT INTO users (id, username, password_hash, full_name, role, phone, pin_code, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `, [id, user.username, hash, user.fullName, user.role, user.phone || null, user.pinCode || null]);

    this.db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id)
      VALUES (?, ?, 'المدير', 'إنشاء مستخدم جديد', 'USERS', ?)
    `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, id]);

    return {
      id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  public checkPermission(user: User, requiredRole: UserRole[]): boolean {
    if (user.role === 'ADMIN') return true;
    return requiredRole.includes(user.role);
  }
}
