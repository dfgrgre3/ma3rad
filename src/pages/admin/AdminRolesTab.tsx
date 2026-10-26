import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Plus, Trash2, Pencil, Save, Search, Lock } from 'lucide-react';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import type { Role } from '../../types';

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30';

export const AdminRolesTab: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const actor = AuthService.getCurrentUser();
  const canManage = can('roles.manage');

  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<Role | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '' });

  const catalog = useMemo(() => PermissionService.getCatalog(), []);
  const modules = useMemo(() => PermissionService.getModules(), []);

  const load = (keepSelection = true) => {
    try {
      const list = PermissionService.getRoles();
      setRoles(list);
      const next = keepSelection && selected ? list.find((r) => r.id === selected.id) || list[0] : list[0];
      if (next) selectRole(next);
    } catch (error: any) {
      toast.error('تعذر تحميل الأدوار', error?.message);
    }
  };

  const selectRole = (role: Role) => {
    setSelected(role);
    setSelectedCodes(new Set(PermissionService.getRolePermissions(role.code)));
    setDirty(false);
    setExpanded({});
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredPerms = (module: string) => {
    const term = search.trim().toLowerCase();
    return catalog.filter(
      (p) => p.module === module && (!term || p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term))
    );
  };

  const toggle = (code: string) => {
    if (!canManage || selected?.code === 'ADMIN') return;
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setDirty(true);
  };

  const toggleModule = (module: string) => {
    if (!canManage || selected?.code === 'ADMIN') return;
    const perms = filteredPerms(module);
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      const allChecked = perms.every((p) => next.has(p.code));
      for (const p of perms) {
        if (allChecked) next.delete(p.code);
        else next.add(p.code);
      }
      return next;
    });
    setDirty(true);
  };

  const save = () => {
    if (!selected) return;
    try {
      PermissionService.setRolePermissions(selected.code, Array.from(selectedCodes), actor);
      setDirty(false);
      toast.success('تم حفظ صلاحيات الدور.');
    } catch (error: any) {
      toast.error('تعذر الحفظ', error?.message);
    }
  };

  const openCreate = () => {
    setForm({ code: '', name: '', description: '' });
    setModal('create');
  };

  const openEdit = (role: Role) => {
    setForm({ code: role.code, name: role.name, description: role.description || '' });
    setSelected(role);
    setModal('edit');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (modal === 'create') {
        const role = PermissionService.createRole(form, actor);
        toast.success('تم إنشاء الدور. امنحه الصلاحيات من المصفوفة.');
        setModal(null);
        load(false);
        const list = PermissionService.getRoles();
        const created = list.find((r) => r.code === role.code);
        if (created) selectRole(created);
      } else if (modal === 'edit' && selected) {
        PermissionService.updateRole(selected.id, { name: form.name, description: form.description }, actor);
        toast.success('تم تحديث الدور.');
        setModal(null);
        load();
      }
    } catch (error: any) {
      toast.error('لم يتم تنفيذ العملية', error?.message);
    }
  };

  const remove = (role: Role) => {
    if (!window.confirm(`حذف الدور "${role.name}"؟`)) return;
    try {
      PermissionService.deleteRole(role.id, actor);
      toast.success('تم حذف الدور.');
      load(false);
    } catch (error: any) {
      toast.error('تعذر الحذف', error?.message);
    }
  };

  const isAdminRole = selected?.code === 'ADMIN';
  const readOnly = !canManage || isAdminRole;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      {/* Roles list */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">الأدوار</h3>
          {canManage && (
            <button onClick={openCreate} className="flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-sky-700">
              <Plus className="h-3.5 w-3.5" /> جديد
            </button>
          )}
        </div>
        <div className="space-y-1">
          {roles.map((role) => {
            const count = PermissionService.getRolePermissions(role.code).length;
            const active = selected?.id === role.id;
            return (
              <button
                key={role.id}
                onClick={() => selectRole(role)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right transition ${
                  active ? 'bg-sky-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold">{role.name}</div>
                  <div className={`truncate font-mono text-[10px] ${active ? 'text-sky-100' : 'text-slate-400'}`}>
                    {role.code} · {role.code === 'ADMIN' ? 'الكل' : `${count} صلاحية`}
                  </div>
                </div>
                {role.isSystem && <Lock className={`h-3 w-3 ${active ? 'text-sky-100' : 'text-slate-400'}`} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Permission matrix */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-700 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
              {selected ? `صلاحيات: ${selected.name}` : 'اختر دوراً'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAdminRole
                ? 'مدير النظام يملك كل الصلاحيات دائماً ولا يمكن تقييده.'
                : 'حدد ما يستطيع هذا الدور فعله. التغييرات تُطبق على كل مستخدمي الدور.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="بحث في الصلاحيات"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في الصلاحيات..."
                className={`${inputCls} pr-9`}
              />
            </div>
            {canManage && !isAdminRole && (
              <button
                onClick={save}
                disabled={!dirty}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                <Save className="h-4 w-4" /> حفظ
              </button>
            )}
            {canManage && selected && !isAdminRole && selected.isSystem === false && (
              <button onClick={() => openEdit(selected)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" title="تعديل الدور">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canManage && selected && !selected.isSystem && (
              <button onClick={() => remove(selected)} className="rounded-xl border border-rose-200 p-2 text-rose-500 hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10" title="حذف الدور">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-4 space-y-2">
          {modules.map((module) => {
            const perms = filteredPerms(module);
            if (perms.length === 0) return null;
            const checked = perms.filter((p) => selectedCodes.has(p.code) || isAdminRole).length;
            const open = expanded[module] ?? false;
            return (
              <div key={module} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [module]: !open }))}
                  className="flex w-full items-center gap-2 bg-slate-50 dark:bg-slate-800/70 px-4 py-2.5 text-right text-xs font-extrabold text-slate-700 dark:text-slate-200"
                >
                  <span className="flex-1">{module}</span>
                  <span className="rounded bg-slate-200/70 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-300">
                    {checked}/{perms.length}
                  </span>
                  {!readOnly && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); toggleModule(module); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleModule(module); } }}
                      className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      الكل
                    </span>
                  )}
                </button>
                {open && (
                  <div className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-2">
                    {perms.map((perm) => {
                      const isChecked = isAdminRole || selectedCodes.has(perm.code);
                      return (
                        <label
                          key={perm.code}
                          htmlFor={`permission-${perm.code}`}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                            isChecked
                              ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                              : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                          } ${readOnly ? 'cursor-not-allowed opacity-80' : ''}`}
                        >
                          <input
                            id={`permission-${perm.code}`}
                            type="checkbox"
                            checked={isChecked}
                            disabled={readOnly}
                            onChange={() => toggle(perm.code)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
                          />
                          <span className="min-w-0">
                            <span className="block font-bold text-slate-800 dark:text-slate-200">{perm.name}</span>
                            <span className="block font-mono text-[10px] text-slate-400">{perm.code}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
              {modal === 'create' ? 'إنشاء دور جديد' : 'تعديل الدور'}
            </h3>
            {modal === 'create' && (
              <div>
                <label htmlFor="role-code" className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">كود الدور (إنجليزي) *</label>
                <input id="role-code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SALES_MANAGER" className={`${inputCls} font-mono`} />
              </div>
            )}
            <div>
              <label htmlFor="role-name" className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">اسم الدور *</label>
              <input id="role-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label htmlFor="role-description" className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">الوصف</label>
              <textarea id="role-description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <button type="button" onClick={() => setModal(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">إلغاء</button>
              <button type="submit" className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700">
                {modal === 'create' ? 'إنشاء' : 'حفظ'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
