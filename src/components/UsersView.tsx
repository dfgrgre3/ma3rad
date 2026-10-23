import React from 'react';
import { Users } from 'lucide-react';
import { AdminUsersTab } from '../pages/admin/AdminUsersTab';

/**
 * Backwards-compatible route wrapper. The full user/permission management UI
 * lives in AdminUsersTab so `/users` and the admin center stay in sync.
 */
export const UsersView: React.FC = () => {
  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-600/25">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">إدارة المستخدمين والصلاحيات</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            إضافة وتعديل وتعطيل المستخدمين، إعادة تعيين كلمات المرور، وتخصيص الصلاحيات لكل مستخدم.
          </p>
        </div>
      </div>
      <AdminUsersTab />
    </div>
  );
};
