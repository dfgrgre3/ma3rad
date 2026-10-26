import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  Search, UserPlus, Pencil, KeyRound, Trash2, ShieldCheck, RefreshCw,
  ChevronDown, ChevronLeft, UserCog, Power, Building2,
} from 'lucide-react';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { BranchService } from '../../services/BranchService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import type { Role, User, UserRole } from '../../types';

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30';

interface UserForm {
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  phone: string;
  pinCode: string;
}

const emptyForm: UserForm = {
  username: '',
  password: '',
  fullName: '',
  role: 'CASHIER',
  phone: '',
  pinCode: '',
};

export const AdminUsersTab: React.FC = () => {
  const auth = useMemo(() => new AuthService(), []);
  const branchService = useMemo(() => new BranchService(), []);
  const toast = useToast();
  const can = usePermission();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | 'password' | 'permissions' | 'branch-scope' | null>(null);
  const [active, setActive] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [newPassword, setNewPassword] = useState('');
  const [branchOptions, setBranchOptions] = useState<ReturnType<BranchService['getAllBranches']>>([]);
  const [branchScope, setBranchScope] = useState<'ASSIGNED' | 'ALL'>('ASSIGNED');
  const [assignedBranchIds, setAssignedBranchIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    try {
      setUsers(auth.getAllUsers());
      setRoles(PermissionService.getRoles());
    } catch (error: any) {
      toast.error('تعذر تحميل المستخدمين', error?.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = users.filter((user) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      user.username.toLowerCase().includes(term) ||
      user.fullName.toLowerCase().includes(term) ||
      (user.phone || '').includes(term) ||
      user.role.toLowerCase().includes(term)
    );
  });

  const openCreate = () => {
    setForm(emptyForm);
    setActive(null);
    setModal('create');
  };

  const openEdit = (user: User) => {
    setActive(user);
    setForm({
      username: user.username,
      password: '',
      fullName: user.fullName,
      role: user.role,
      phone: user.phone || '',
      pinCode: '',
    });
    setModal('edit');
  };

  const openPassword = (user: User) => {
    setActive(user);
    setNewPassword('');
    setModal('password');
  };

  const openBranchScope = (user: User) => {
    try {
      setActive(user);
      setBranchScope(branchService.getUserBranchScope(user.id));
      setAssignedBranchIds(branchService.getUserAssignedBranchIds(user.id));
      setBranchOptions(branchService.getAllBranches());
      setModal('branch-scope');
    } catch (error: any) {
      toast.error('تعذر تحميل نطاق الفروع', error?.message || String(error));
    }
  };

  const submitBranchScope = (event: React.FormEvent) => {
    event.preventDefault();
    if (!active) return;
    void run(
      () => {
        branchService.updateUserBranchAccess(active.id, branchScope, assignedBranchIds);
      },
      'تم تحديث نطاق الفروع.'
    );
  };

  const run = async (fn: () => unknown | Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      load();
      setModal(null);
    } catch (error: any) {
      toast.error('لم يتم تنفيذ العملية', error?.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = (event: React.FormEvent) => {
    event.preventDefault();
    void run(
      () => {
        if (form.password.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
        auth.createUser({
          username: form.username.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: form.role,
          phone: form.phone,
          pinCode: form.pinCode,
        });
      },
      'تم إنشاء المستخدم بنجاح.'
    );
  };

  const submitEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!active) return;
    void run(
      () =>
        auth.updateUser(active.id, {
          fullName: form.fullName.trim(),
          role: form.role,
          phone: form.phone,
          pinCode: form.pinCode || undefined,
          isActive: active.isActive,
        }),
      'تم تحديث بيانات المستخدم.'
    );
  };

  const submitPassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (!active) return;
    void run(() => auth.resetPassword(active.id, newPassword), 'تم تغيير كلمة المرور.');
  };

  const toggleActive = (user: User) => {
    void run(
      () => auth.updateUser(user.id, { isActive: !user.isActive }),
      user.isActive ? 'تم تعطيل الحساب.' : 'تم تنشيط الحساب.'
    );
  };

  const removeUser = (user: User) => {
    if (!window.confirm(`حذف المستخدم "${user.fullName}" نهائياً؟`)) return;
    void run(() => auth.deleteUser(user.id), 'تم حذف المستخدم.');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو اسم المستخدم أو الدور..."
            className={`${inputCls} pr-10`}
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="تحديث">
            <RefreshCw className="h-4 w-4" />
          </button>
          {can('users.create') && (
            <button onClick={openCreate} className="flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-600/25">
              <UserPlus className="h-4 w-4" /> مستخدم جديد
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3.5">المستخدم</th>
                <th className="p-3.5">الاسم الكامل</th>
                <th className="p-3.5">الدور</th>
                <th className="p-3.5">نطاق الفروع</th>
                <th className="p-3.5">الهاتف</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-slate-100">{user.username}</td>
                  <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">{user.fullName}</td>
                  <td className="p-3.5">
                    <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-black text-sky-600 dark:text-sky-400">
                      {roles.find((r) => r.code === user.role)?.name || user.role}
                    </span>
                  </td>
                  <td className="p-3.5">
                    {user.role === 'ADMIN'
                      ? <span className="text-[10px] font-bold text-slate-500">وصول مركزي (مدير)</span>
                      : can('branches.manage_users') && can('branches.view')
                      ? <button onClick={() => openBranchScope(user)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-slate-800">
                          <Building2 className="h-3.5 w-3.5" /> إدارة النطاق
                        </button>
                      : '—'}
                  </td>
                  <td className="p-3.5 font-mono text-slate-500 dark:text-slate-400">{user.phone || '-'}</td>
                  <td className="p-3.5">
                    {user.isActive ? (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> نشط
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-bold text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> معطّل
                      </span>
                    )}
                  </td>
                  <td className="p-3.5">
                    <div className="flex items-center gap-1">
                      {can('users.update') && (
                        <button onClick={() => openEdit(user)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-700" title="تعديل">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {can('users.permissions') && (
                        <button onClick={() => { setActive(user); setModal('permissions'); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-violet-600 dark:hover:bg-slate-700" title="صلاحيات مخصصة">
                          <UserCog className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {can('users.reset_password') && (
                        <button onClick={() => openPassword(user)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-amber-600 dark:hover:bg-slate-700" title="تغيير كلمة المرور">
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {can('users.update') && (
                        <button onClick={() => toggleActive(user)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-700" title={user.isActive ? 'تعطيل' : 'تنشيط'}>
                          <Power className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {can('users.delete') && (
                        <button onClick={() => removeUser(user)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" title="حذف">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">لا توجد نتائج مطابقة.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === 'create' && (
        <Modal title="إنشاء حساب مستخدم" onClose={() => setModal(null)}>
          <form onSubmit={submitCreate} className="space-y-3">
            <Field label="الاسم الكامل *">
              <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="اسم المستخدم *">
                <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={`${inputCls} font-mono`} />
              </Field>
              <Field label="كلمة المرور *">
                <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الدور">
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
                  {roles.map((role) => <option key={role.id} value={role.code}>{role.name}</option>)}
                </select>
              </Field>
              <Field label="رمز PIN">
                <input inputMode="numeric" autoComplete="off" maxLength={8} value={form.pinCode} onChange={(e) => setForm({ ...form, pinCode: e.target.value })} className={`${inputCls} font-mono`} />
              </Field>
            </div>
            <Field label="الهاتف">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${inputCls} font-mono`} />
            </Field>
            <ModalActions busy={busy} onCancel={() => setModal(null)} submitLabel="إنشاء المستخدم" />
          </form>
        </Modal>
      )}

      {modal === 'edit' && active && (
        <Modal title={`تعديل: ${active.fullName}`} onClose={() => setModal(null)}>
          <form onSubmit={submitEdit} className="space-y-3">
            <Field label="الاسم الكامل *">
              <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الدور">
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
                  {roles.map((role) => <option key={role.id} value={role.code}>{role.name}</option>)}
                </select>
              </Field>
              <Field label="رمز PIN">
                <input inputMode="numeric" autoComplete="off" maxLength={8} value={form.pinCode} onChange={(e) => setForm({ ...form, pinCode: e.target.value })} className={`${inputCls} font-mono`} placeholder="اتركه فارغاً للإبقاء على الحالي" />
              </Field>
            </div>
            <Field label="الهاتف">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${inputCls} font-mono`} />
            </Field>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-500 dark:text-slate-400">
              اسم المستخدم: <span className="font-mono font-bold">{active.username}</span> — لا يمكن تغييره من هنا.
            </div>
            <ModalActions busy={busy} onCancel={() => setModal(null)} submitLabel="حفظ التعديلات" />
          </form>
        </Modal>
      )}

      {modal === 'password' && active && (
        <Modal title={`كلمة مرور: ${active.username}`} onClose={() => setModal(null)}>
          <form onSubmit={submitPassword} className="space-y-3">
            <Field label="كلمة المرور الجديدة *">
              <input required type="password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
            </Field>
            <ModalActions busy={busy} onCancel={() => setModal(null)} submitLabel="تعيين كلمة المرور" />
          </form>
        </Modal>
      )}

      {modal === 'branch-scope' && active && (
        <Modal title={`نطاق الفروع: ${active.fullName}`} onClose={() => setModal(null)}>
          <form onSubmit={submitBranchScope} className="space-y-4">
            <Field label="نطاق البيانات">
              <select value={branchScope} onChange={(event) => setBranchScope(event.target.value as 'ASSIGNED' | 'ALL')} className={inputCls}>
                <option value="ASSIGNED">الفروع المسندة فقط</option>
                {can('branches.access_all') && <option value="ALL">وصول مركزي إلى كل الفروع</option>}
              </select>
            </Field>
            <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">الفروع المسندة</p>
              {branchOptions.map((branch) => (
                <label key={branch.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={assignedBranchIds.includes(branch.id)}
                    onChange={(event) => setAssignedBranchIds((current) =>
                      event.target.checked ? [...new Set([...current, branch.id])] : current.filter((id) => id !== branch.id)
                    )}
                  />
                  {branch.name}
                </label>
              ))}
            </div>
            <p className="text-[11px] leading-5 text-slate-500">النطاق يفرضه النظام داخل الخدمات والاستعلامات. الحساب المركزي يحتاج صلاحية «الوصول المركزي إلى جميع الفروع» بالإضافة إلى تعيين هذا النطاق.</p>
            <ModalActions busy={busy} onCancel={() => setModal(null)} submitLabel="حفظ نطاق الفروع" />
          </form>
        </Modal>
      )}

      {modal === 'permissions' && active && (
        <PermissionOverrides
          user={active}
          roles={roles}
          onClose={() => setModal(null)}
          onSaved={() => { PermissionService.invalidate(active); load(); }}
        />
      )}
    </div>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
    <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">{title}</h3>
        <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
      </div>
      {children}
    </div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const fieldId = useId();
  const childId = React.isValidElement(children) && typeof (children as any).props?.id === 'string'
    ? (children as any).props.id
    : fieldId;

  const enhancedChild = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, { id: childId })
    : children;

  return (
    <div>
      <label htmlFor={childId} className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</label>
      {enhancedChild}
    </div>
  );
};

const ModalActions: React.FC<{ busy: boolean; onCancel: () => void; submitLabel: string }> = ({ busy, onCancel, submitLabel }) => (
  <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
    <button type="button" onClick={onCancel} className="rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300">إلغاء</button>
    <button type="submit" disabled={busy} className="rounded-xl bg-sky-600 hover:bg-sky-700 px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
      {busy ? 'جارٍ...' : submitLabel}
    </button>
  </div>
);

// ─── Per-user permission override matrix ─────────────────────────────────────
const PermissionOverrides: React.FC<{
  user: User;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ user, roles, onClose, onSaved }) => {
  const toast = useToast();
  const [overrides, setOverrides] = useState<Record<string, 'GRANT' | 'DENY'>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const rolePerms = useMemo(() => new Set(PermissionService.getRolePermissions(user.role)), [user.role]);
  const modules = useMemo(() => PermissionService.getModules(), []);
  const catalog = useMemo(() => PermissionService.getCatalog(), []);
  const currentRole = roles.find((r) => r.code === user.role);

  useEffect(() => {
    const rows = PermissionService.getUserOverrides(user.id);
    const map: Record<string, 'GRANT' | 'DENY'> = {};
    for (const row of rows) map[row.code] = row.effect;
    setOverrides(map);
  }, [user.id]);

  const setEffect = (code: string, effect: 'INHERIT' | 'GRANT' | 'DENY') => {
    setBusy(true);
    try {
      PermissionService.setUserOverride(user.id, code, effect === 'INHERIT' ? null : effect, AuthService.getCurrentUser());
      setOverrides((prev) => {
        const next = { ...prev };
        if (effect === 'INHERIT') delete next[code];
        else next[code] = effect;
        return next;
      });
      onSaved();
    } catch (error: any) {
      toast.error('تعذر تعديل الصلاحية', error?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 p-5">
          <div>
            <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
              <ShieldCheck className="h-5 w-5 text-violet-500" /> صلاحيات: {user.fullName}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              الدور الحالي: <b>{currentRole?.name || user.role}</b> — التخصيص هنا يتجاوز صلاحيات الدور.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {modules.map((module) => {
            const perms = catalog.filter((p) => p.module === module);
            const counts = perms.reduce(
              (acc, p) => {
                const effect = overrides[p.code];
                if (effect === 'GRANT') acc.grant += 1;
                if (effect === 'DENY') acc.deny += 1;
                return acc;
              },
              { grant: 0, deny: 0 }
            );
            const open = expanded[module] ?? false;
            return (
              <div key={module} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [module]: !open }))}
                  className="flex w-full items-center gap-2 bg-slate-50 dark:bg-slate-800/70 px-4 py-2.5 text-right text-xs font-extrabold text-slate-700 dark:text-slate-200"
                >
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                  <span className="flex-1">{module}</span>
                  {counts.grant > 0 && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">+{counts.grant}</span>}
                  {counts.deny > 0 && <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">-{counts.deny}</span>}
                </button>
                {open && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {perms.map((perm) => {
                      const override = overrides[perm.code];
                      const roleHas = rolePerms.has(perm.code);
                      return (
                        <div key={perm.code} className="flex flex-wrap items-center gap-2 px-4 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{perm.name}</div>
                            <div className="font-mono text-[10px] text-slate-400">
                              {perm.code} {roleHas ? '• ممنوحة للدور' : '• غير ممنوحة للدور'}
                            </div>
                          </div>
                          <select
                            disabled={busy}
                            value={override || 'INHERIT'}
                            onChange={(e) => setEffect(perm.code, e.target.value as 'INHERIT' | 'GRANT' | 'DENY')}
                            className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${
                              override === 'GRANT'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : override === 'DENY'
                                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            <option value="INHERIT">حسب الدور</option>
                            <option value="GRANT">منح صريح</option>
                            <option value="DENY">منع صريح</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 p-4">
          <button
            onClick={() => {
              if (!window.confirm('مسح كل التخصيصات وإرجاع المستخدم لصلاحيات دوره؟')) return;
              try {
                PermissionService.clearUserOverrides(user.id, AuthService.getCurrentUser());
                setOverrides({});
                onSaved();
                toast.success('تم مسح التخصيصات.');
              } catch (error: any) {
                toast.error('تعذر المسح', error?.message);
              }
            }}
            className="rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
          >
            مسح التخصيصات
          </button>
          <button onClick={onClose} className="rounded-xl bg-slate-100 dark:bg-slate-800 px-5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300">إغلاق</button>
        </div>
      </div>
    </div>
  );
};
