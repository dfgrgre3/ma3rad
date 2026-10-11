import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, UserPlus, Key, Lock, 
  CheckCircle, AlertCircle, Shield
} from 'lucide-react';
import { AuthService } from '../services/AuthService';
import { User, UserRole } from '../types';

export const UsersView: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    role: 'CASHIER' as UserRole,
    phone: '',
    pinCode: '1234'
  });

  const authService = new AuthService();

  const loadUsers = () => {
    try {
      const data = authService.getAllUsers();
      setUsers(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      authService.createUser({
        username: formData.username,
        password: formData.password,
        fullName: formData.fullName,
        role: formData.role,
        phone: formData.phone,
        pinCode: formData.pinCode
      });
      setIsModalOpen(false);
      loadUsers();
      alert('تم إنشاء المستخدم وتشفير كلمة المرور بنجاح.');
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">إدارة المستخدمين والصلاحيات</h2>
          <p className="text-xs text-slate-500">التحكم في أدوار الموظفين (مدير، كاشير، مبيعات، مخازن، محاسب) والأمان</p>
        </div>

        <button
          onClick={() => {
            setFormData({
              username: '',
              password: '',
              fullName: '',
              role: 'CASHIER',
              phone: '',
              pinCode: '1234'
            });
            setIsModalOpen(true);
          }}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/30 transition text-sm"
        >
          <UserPlus className="w-4 h-4" />
          <span>إضافة مستخدم جديد</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">اسم المستخدم (Login)</th>
                <th className="p-3.5">الاسم الكامل للموظف</th>
                <th className="p-3.5">الدور والصلاحية</th>
                <th className="p-3.5">رقم الهاتف</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">{u.username}</td>
                  <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">{u.fullName}</td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-sky-500/10 text-sky-600">
                      {u.role === 'ADMIN' ? 'مدير نظام كامل' : (u.role === 'CASHIER' ? 'كاشير نقطة بيع' : (u.role === 'WAREHOUSE' ? 'أمين مخزن' : u.role))}
                    </span>
                  </td>
                  <td className="p-3.5 font-mono text-slate-500">{u.phone || '-'}</td>
                  <td className="p-3.5">
                    <span className="flex items-center gap-1 text-emerald-600 font-bold">
                      <CheckCircle className="w-3.5 h-3.5" /> نشط
                    </span>
                  </td>
                  <td className="p-3.5 font-mono text-slate-400">{u.createdAt?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">إنشاء حساب مستخدم / موظف جديد</h3>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">الاسم الكامل للموظف *</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">اسم المستخدم (Login) *</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">كلمة المرور *</label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">الدور والصلاحية</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                  >
                    <option value="CASHIER">كاشير نقطة بيع</option>
                    <option value="SALES">مسؤول مبيعات</option>
                    <option value="WAREHOUSE">أمين مخزن</option>
                    <option value="ACCOUNTANT">محاسب</option>
                    <option value="MANAGER">مدير فرع</option>
                    <option value="ADMIN">مدير نظام كامل</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">رمز PIN السريع</label>
                  <input
                    type="text"
                    value={formData.pinCode}
                    onChange={(e) => setFormData({ ...formData, pinCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">رقم الهاتف</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-600/30"
                >
                  إنشاء المستخدم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
