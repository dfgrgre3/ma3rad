import React, { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { ShieldCheck, Plus, Trash2, Pencil, Save, Search, Lock, ListChecks, Eraser, ChevronDown, ChevronLeft, Layers } from 'lucide-react';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { AuthorizationAdminService, type AmountLimit } from '../../../services/domains/auth/permissions/authorizationAdminService';
import type { User } from '../../../types';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { useToast } from '../../../components/ui/Toast';
import type { Role } from '../../../types';

const inputCls =
  'w-full px-3 py-2 bg-surface-muted rounded-xl border border-line text-ink text-xs focus:outline-none focus:ring-2 focus:ring-primary/30';

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

  // حدود المبالغ (permission_amount_limits)
  const [limits, setLimits] = useState<AmountLimit[]>([]);
  const [limitScopeType, setLimitScopeType] = useState<'ROLE' | 'USER'>('ROLE');
  const [limitScopeId, setLimitScopeId] = useState('');
  const [limitForm, setLimitForm] = useState({ permissionCode: '', maxAmount: '', currency: 'EGP', onExceed: 'DENY' as 'DENY' | 'REQUIRE_APPROVAL' });
  const [users, setUsers] = useState<User[]>([]);

  const catalog = useMemo(() => PermissionService.getCatalog(), []);
  const modules = useMemo(() => PermissionService.getModules(), []);
  const moduleLabels = useMemo(() => PermissionService.getModuleLabels(), []);
  const catalogGroups = useMemo(() => PermissionService.getCatalogGroups(), []);
  const groupsByModule = useMemo(() => {
    const map = new Map<string, Array<{ name: string; permissions: typeof catalog }>>();
    for (const entry of catalogGroups) map.set(entry.module, entry.groups);
    return map;
  }, [catalogGroups]);

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
    setLimitScopeType('ROLE');
    setLimitScopeId(role.code);
  };

  const loadLimits = () => {
    try {
      setLimits(AuthorizationAdminService.listAmountLimits(limitScopeType, limitScopeId || undefined));
    } catch {
      setLimits([]);
    }
  };

  useEffect(() => {
    load(false);
    try {
      setUsers(new AuthService().getAllUsers());
    } catch {
      setUsers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) loadLimits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, limitScopeType, limitScopeId]);

  const saveLimit = () => {
    if (!limitScopeId || !limitForm.permissionCode.trim()) {
      toast.error('أكمل كود الصلاحية والنطاق.');
      return;
    }
    try {
      AuthorizationAdminService.upsertAmountLimit({
        permissionCode: limitForm.permissionCode.trim(),
        scopeType: limitScopeType,
        scopeId: limitScopeId,
        maxAmount: Number(limitForm.maxAmount),
        currency: limitForm.currency.trim() || 'EGP',
        onExceed: limitForm.onExceed,
      });
      setLimitForm({ permissionCode: '', maxAmount: '', currency: 'EGP', onExceed: 'DENY' });
      loadLimits();
      toast.success('تم حفظ حد المبلغ.');
    } catch (error: any) {
      toast.error('تعذر حفظ الحد', error?.message);
    }
  };

  const removeLimit = (limit: AmountLimit) => {
    try {
      AuthorizationAdminService.deleteAmountLimit(limit.id);
      loadLimits();
      toast.success('تم حذف الحد.');
    } catch (error: any) {
      toast.error('تعذر الحذف', error?.message);
    }
  };

  const filteredGroups = (module: string) => {
    const term = search.trim().toLowerCase();
    const groups = groupsByModule.get(module) ?? [];
    return groups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter(
          (p) => !term || p.name.toLowerCase().includes(term)
            || p.code.toLowerCase().includes(term)
            || group.name.toLowerCase().includes(term)
            || moduleLabel(module).toLowerCase().includes(term)
        ),
      }))
      .filter((group) => group.permissions.length > 0);
  };

  const filteredPerms = (module: string) => filteredGroups(module).flatMap((group) => group.permissions);

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

  const visibleCodes = () =>
    search.trim()
      ? modules.flatMap((module) => filteredPerms(module).map((p) => p.code))
      : catalog.map((p) => p.code);

  const toggleGroup = (module: string, groupName: string) => {
    if (!canManage || selected?.code === 'ADMIN') return;
    const group = filteredGroups(module).find((item) => item.name === groupName);
    if (!group) return;
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      const allChecked = group.permissions.every((p) => next.has(p.code));
      for (const p of group.permissions) {
        if (allChecked) next.delete(p.code);
        else next.add(p.code);
      }
      return next;
    });
    setDirty(true);
  };

  const selectAllVisible = () => {
    if (!canManage || selected?.code === 'ADMIN') return;
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      for (const code of visibleCodes()) next.add(code);
      return next;
    });
    setDirty(true);
  };

  const clearAllVisible = () => {
    if (!canManage || selected?.code === 'ADMIN') return;
    setSelectedCodes(new Set());
    setDirty(true);
  };

  const moduleLabel = (module: string) => moduleLabels[module] || module;

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
      <div className="rounded-2xl border border-line bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-ink ">الأدوار</h3>
          {canManage && (
            <button onClick={openCreate} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-primary">
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
                  active ? 'bg-primary text-white shadow' : 'text-ink-secondary hover:bg-surface-sunken dark:hover:bg-primary'
                }`}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold">{role.name}</div>
                  <div className={`truncate font-mono text-[10px] ${active ? 'text-primary' : 'text-muted'}`}>
                    {role.code} · {role.code === 'ADMIN' ? 'الكل' : `${count} صلاحية`}
                  </div>
                </div>
                {role.isSystem && <Lock className={`h-3 w-3 ${active ? 'text-primary' : 'text-muted'}`} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Permission matrix */}
      <div className="rounded-2xl border border-line bg-surface ">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-ink ">
              {selected ? `صلاحيات: ${selected.name}` : 'اختر دوراً'}
            </h3>
            <p className="text-[11px] text-muted ">
              {isAdminRole
                ? 'مدير النظام يملك كل الصلاحيات دائماً ولا يمكن تقييده.'
                : 'حدد ما يستطيع هذا الدور فعله. التغييرات تُطبق على كل مستخدمي الدور.'}
              {selected && !isAdminRole && (
                <span className="mr-1 font-bold text-primary ">
                  ({selectedCodes.size} من {catalog.length} صلاحية)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                aria-label="بحث في الصلاحيات"
                name="role-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في الصلاحيات..."
                className={`${inputCls} pr-9`}
              />
            </div>
            {canManage && !isAdminRole && (
              <button
                type="button"
                onClick={selectAllVisible}
                title="تحديد كل الصلاحيات في الكتالوج"
                className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink-secondary hover:bg-surface-muted dark:hover:bg-primary"
              >
                <ListChecks className="h-4 w-4 text-success" /> الكل
              </button>
            )}
            {canManage && !isAdminRole && (
              <button
                type="button"
                onClick={clearAllVisible}
                title="مسح كل الصلاحيات"
                className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink-secondary hover:bg-surface-muted dark:hover:bg-primary"
              >
                <Eraser className="h-4 w-4 text-danger" /> مسح
              </button>
            )}
            {canManage && !isAdminRole && (
              <button
                onClick={save}
                disabled={!dirty}
                className="flex items-center gap-1.5 rounded-xl bg-success px-4 py-2 text-xs font-bold text-white hover:bg-success disabled:opacity-40"
              >
                <Save className="h-4 w-4" /> حفظ
              </button>
            )}
            {canManage && selected && !isAdminRole && selected.isSystem === false && (
              <button onClick={() => openEdit(selected)} className="rounded-xl border border-line p-2 text-muted hover:bg-surface-sunken dark:hover:bg-primary" title="تعديل الدور">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canManage && selected && !selected.isSystem && (
              <button onClick={() => remove(selected)} className="rounded-xl border border-danger-border p-2 text-danger hover:bg-danger-soft dark:border-danger/30 dark:hover:bg-danger/10" title="حذف الدور">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-4 space-y-2">
          {modules.map((module) => {
            const groups = filteredGroups(module);
            if (groups.length === 0) return null;
            const perms = groups.flatMap((group) => group.permissions);
            const checked = perms.filter((p) => selectedCodes.has(p.code) || isAdminRole).length;
            const open = expanded[module] ?? false;
            return (
              <div key={module} className="overflow-hidden rounded-xl border border-line ">
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [module]: !open }))}
                  className="flex w-full items-center gap-2 bg-surface-muted dark:bg-primary/70 px-4 py-2.5 text-right text-xs font-extrabold text-ink "
                >
                  <ChevronLeft className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${open ? '-rotate-90' : ''}`} />
                  <span className="flex-1">
                    {moduleLabel(module)}
                    <span className="mr-1.5 font-mono text-[9px] font-normal text-muted">{module}</span>
                  </span>
                  <span className="rounded bg-surface-sunken/70 px-1.5 py-0.5 text-[10px] font-bold text-muted ">
                    {checked}/{perms.length}
                  </span>
                  {!readOnly && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); toggleModule(module); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleModule(module); } }}
                      className="rounded border border-line-strong px-2 py-0.5 text-[10px] text-muted hover:bg-surface-sunken dark:hover:bg-primary"
                    >
                      الكل
                    </span>
                  )}
                </button>
                {open && (
                  <div className="space-y-1.5 p-2">
                    {groups.map((group) => {
                      const groupKey = `${module}:${group.name}`;
                      const groupOpen = expanded[groupKey] ?? (groups.length === 1 || Boolean(search.trim()));
                      const groupChecked = group.permissions.filter((p) => isAdminRole || selectedCodes.has(p.code)).length;
                      return (
                        <div key={groupKey} className="overflow-hidden rounded-lg border border-line/80 dark:border-line-strong/80">
                          <button
                            onClick={() => setExpanded((prev) => ({ ...prev, [groupKey]: !groupOpen }))}
                            className="flex w-full items-center gap-2 bg-surface px-3 py-2 text-right text-[11px] font-bold text-ink-secondary hover:bg-surface-muted dark:hover:bg-primary/60"
                          >
                            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${groupOpen ? '' : '-rotate-90'}`} />
                            <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="flex-1 truncate">{group.name}</span>
                            <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-bold text-muted ">
                              {groupChecked}/{group.permissions.length}
                            </span>
                            {!readOnly && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); toggleGroup(module, group.name); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleGroup(module, group.name); } }}
                                className="rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface-sunken dark:hover:bg-primary"
                              >
                                الكل
                              </span>
                            )}
                          </button>
                          {groupOpen && (
                            <div className="grid grid-cols-1 gap-1 border-t border-line p-2 sm:grid-cols-2">
                              {group.permissions.map((perm) => {
                                const isChecked = isAdminRole || selectedCodes.has(perm.code);
                                return (
                                  <label
                                    key={perm.code}
                                    htmlFor={`permission-${perm.code}`}
                                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                                      isChecked
                                        ? 'border-success-border bg-success-soft/60 dark:border-success/30 dark:bg-success/10'
                                        : 'border-line bg-surface '
                                    } ${readOnly ? 'cursor-not-allowed opacity-80' : ''}`}
                                  >
                                    <input
                                      id={`permission-${perm.code}`}
                                      type="checkbox"
                                      checked={isChecked}
                                      disabled={readOnly}
                                      onChange={() => toggle(perm.code)}
                                      className="mt-0.5 h-4 w-4 rounded border-line-strong text-primary"
                                    />
                                    <span className="min-w-0">
                                      <span className="block font-bold text-ink ">{perm.name}</span>
                                      <span className="block font-mono text-[10px] text-muted">{perm.code}</span>
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
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Amount limits */}
      {selected && canManage && (
        <div className="rounded-2xl border border-line bg-surface p-4 lg:col-span-2">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-ink ">حدود المبالغ</h3>
              <p className="text-[11px] text-muted ">
                سقف مبلغ لكل عملية مالية — DENY يرفض مباشرة، REQUIRE_APPROVAL ينشئ طلب اعتماد.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={limitScopeType}
                onChange={(e) => {
                  const next = e.target.value as 'ROLE' | 'USER';
                  setLimitScopeType(next);
                  setLimitScopeId(next === 'ROLE' ? selected.code : '');
                }}
                className={inputCls}
              >
                <option value="ROLE">حسب الدور</option>
                <option value="USER">حسب المستخدم</option>
              </select>
              {limitScopeType === 'USER' ? (
                <select value={limitScopeId} onChange={(e) => setLimitScopeId(e.target.value)} className={inputCls}>
                  <option value="">اختر مستخدمًا...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName} ({u.username})</option>
                  ))}
                </select>
              ) : (
                <span className="rounded-lg bg-accent-soft px-2.5 py-1.5 font-mono text-[11px] font-bold text-primary dark:bg-primary/10 ">
                  {selected.code}
                </span>
              )}
            </div>
          </div>

          {limitScopeId && (
            <>
              <div className="mb-3 overflow-x-auto">
                <DataTable
                  ariaLabel="حدود الصلاحيات"
                  rows={limits}
                  rowKey={(limit: any) => String(limit.id)}
                  dense
                  tableClassName="text-xs"
                  columns={[
                    { key: 'perm', header: 'الصلاحية', render: (limit: any) => <span className="font-mono font-bold">{limit.permissionCode}</span> },
                    { key: 'max', header: 'الحد الأقصى', render: (limit: any) => <span className="font-bold">{limit.maxAmount.toLocaleString()}</span> },
                    { key: 'currency', header: 'العملة', render: (limit: any) => limit.currency },
                    {
                      key: 'exceed', header: 'عند التجاوز',
                      render: (limit: any) => (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${limit.onExceed === 'DENY' ? 'bg-danger-soft text-danger dark:bg-danger/10 dark:text-danger' : 'bg-warning-soft text-warning dark:bg-warning/10 dark:text-warning'}`}>
                          {limit.onExceed === 'DENY' ? 'رفض' : 'يتطلب اعتمادًا'}
                        </span>
                      ),
                    },
                    {
                      key: 'actions', header: '',
                      render: (limit: any) => (
                        <button onClick={() => removeLimit(limit)} className="rounded p-1 text-danger hover:bg-danger-soft dark:hover:bg-danger/10" title="حذف">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ),
                    },
                  ]}
                  emptyTitle="لا حدود معرفة — المبالغ غير مقيّدة."
                />
              </div>

              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3 ">
                <input
                  value={limitForm.permissionCode}
                  onChange={(e) => setLimitForm((f) => ({ ...f, permissionCode: e.target.value }))}
                  placeholder="كود العملية (مثل sales.create)"
                  list="permission-codes"
                  className={inputCls}
                />
                <datalist id="permission-codes">
                  {catalog.map((p) => <option key={p.code} value={p.code} />)}
                </datalist>
                <input
                  value={limitForm.maxAmount}
                  onChange={(e) => setLimitForm((f) => ({ ...f, maxAmount: e.target.value }))}
                  placeholder="الحد الأقصى"
                  type="number"
                  min="0"
                  className={`${inputCls} w-32`}
                />
                <input
                  value={limitForm.currency}
                  onChange={(e) => setLimitForm((f) => ({ ...f, currency: e.target.value }))}
                  placeholder="العملة"
                  className={`${inputCls} w-20`}
                />
                <select
                  value={limitForm.onExceed}
                  onChange={(e) => setLimitForm((f) => ({ ...f, onExceed: e.target.value as 'DENY' | 'REQUIRE_APPROVAL' }))}
                  className={inputCls}
                >
                  <option value="DENY">رفض</option>
                  <option value="REQUIRE_APPROVAL">يتطلب اعتمادًا</option>
                </select>
                <button
                  onClick={saveLimit}
                  className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary"
                >
                  <Save className="h-3.5 w-3.5" /> حفظ الحد
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/50 p-4 backdrop-blur-sm">
          <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-3xl border border-line bg-surface p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-ink ">
              {modal === 'create' ? 'إنشاء دور جديد' : 'تعديل الدور'}
            </h3>
            {modal === 'create' && (
              <div>
                <label htmlFor="role-code" className="mb-1 block text-xs font-bold text-ink ">كود الدور (إنجليزي) *</label>
                <input
                  id="role-code"
                  name="roleCode"
                  aria-label="كود الدور"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="SALES_MANAGER"
                  className={`${inputCls} font-mono`}
                />
              </div>
            )}
            <div>
              <label htmlFor="role-name" className="mb-1 block text-xs font-bold text-ink ">اسم الدور *</label>
              <input
                id="role-name"
                name="roleName"
                aria-label="اسم الدور"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="role-description" className="mb-1 block text-xs font-bold text-ink ">الوصف</label>
              <textarea
                id="role-description"
                name="roleDescription"
                aria-label="وصف الدور"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <button type="button" onClick={() => setModal(null)} className="rounded-xl bg-surface-sunken px-4 py-2 text-xs font-bold text-ink ">إلغاء</button>
              <button type="submit" className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white hover:bg-primary">
                {modal === 'create' ? 'إنشاء' : 'حفظ'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
