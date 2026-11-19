import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../../../services/domains/auth/AuthService';
import type { DefaultAdminState } from './setupTypes';

/** Detect whether the built-in admin account still uses the default password. */
export function readDefaultAdminState(): DefaultAdminState {
  const defaults = {
    required: false,
    userId: '',
    username: 'admin',
    fullName: 'مدير النظام',
    phone: '',
  };
  try {
    if (AuthService.getCurrentUser()?.role !== 'ADMIN') {
      return { ...defaults, error: 'سجّل الدخول بحساب مدير النظام لإكمال إعداد المنشأة.' };
    }
    const admin = DatabaseManager.getInstance().query<{
      id: string;
      passwordHash: string;
      username: string;
      fullName: string;
      phone: string | null;
    }>(
      `SELECT id, password_hash AS passwordHash, username, full_name AS fullName, phone
       FROM users WHERE username = 'admin' LIMIT 1`
    )[0];
    if (!admin) throw new Error('تعذر العثور على حساب المدير الأساسي.');
    return {
      required: bcrypt.compareSync('admin123', admin.passwordHash),
      userId: admin.id,
      username: admin.username,
      fullName: admin.fullName,
      phone: admin.phone || '',
    };
  } catch (error) {
    console.error('Could not inspect the initial administrator account:', error);
    return {
      ...defaults,
      error: error instanceof Error ? error.message : 'تعذر التحقق من حساب المدير الأساسي.',
    };
  }
}
