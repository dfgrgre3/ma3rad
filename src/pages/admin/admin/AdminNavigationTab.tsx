import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Eye, EyeOff, Save, RotateCcw, GripVertical, Plus, X } from 'lucide-react';
import { NavigationService, type NavOverrides } from '../../../services/domains/config/NavigationService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { useToast } from '../../../components/ui/Toast';

export const AdminNavigationTab: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const readOnly = !can('admin.navigation');
  const [overrides, setOverrides] = useState<NavOverrides>(() => NavigationService.getOverrides());
  const [dirty, setDirty] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPages, setNewGroupPages] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const groups = useMemo(
    () => NavigationService.merge(overrides, { includeHidden: true }),
    [overrides]
  );

  useEffect(() => {
    setOverrides(NavigationService.getOverrides());
  }, []);

  const update = (patch: Partial<NavOverrides>) => {
    setOverrides((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const isHidden = (path: string) => overrides.hidden.includes(path);
  const isGroupHidden = (groupId: string) => overrides.hiddenGroups.includes(groupId);
  const toggleHidden = (path: string) => {
    const hidden = isHidden(path)
      ? overrides.hidden.filter((p) => p !== path)
      : [...overrides.hidden, path];
    update({ hidden });
  };
  const toggleGroupHidden = (groupId: string) => {
    const hiddenGroups = isGroupHidden(groupId)
      ? overrides.hiddenGroups.filter((g) => g !== groupId)
      : [...overrides.hiddenGroups, groupId];
    update({ hiddenGroups });
  };

  const rename = (path: string, label: string) => {
    update({ labels: { ...overrides.labels, [path]: label } });
  };

  const moveItem = (groupId: string, path: string, direction: -1 | 1) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const paths = group.items.map((item) => item.to);
    const index = paths.indexOf(path);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= paths.length) return;
    paths.splice(index, 1);
    paths.splice(target, 0, path);
    update({ itemsOrder: { ...overrides.itemsOrder, [groupId]: paths } });
  };

  const moveItemToGroup = (sourceGroupId: string, path: string, targetGroupId: string) => {
    if (sourceGroupId === targetGroupId || !groups.some((group) => group.id === targetGroupId)) return;
    const itemsOrder = Object.fromEntries(
      Object.entries(overrides.itemsOrder).map(([groupId, paths]) => [
        groupId,
        paths.filter((itemPath) => itemPath !== path),
      ])
    );
    const targetPaths = groups.find((group) => group.id === targetGroupId)?.items
      .map((item) => item.to)
      .filter((itemPath) => itemPath !== path) ?? [];
    itemsOrder[targetGroupId] = [...targetPaths, path];
    update({
      groupAssignments: { ...overrides.groupAssignments, [path]: targetGroupId },
      itemsOrder,
    });
  };

  const moveGroup = (groupId: string, direction: -1 | 1) => {
    const order = groups.map((g) => g.id);
    const index = order.indexOf(groupId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    order.splice(index, 1);
    order.splice(target, 0, groupId);
    update({ groupsOrder: order });
  };

  const duplicateName = useMemo(() => {
    const name = newGroupName.trim();
    if (!name) return false;
    return groups.some((g) => (overrides.labels[`group:${g.id}`] ?? g.label).trim() === name);
  }, [newGroupName, groups, overrides.labels]);

  const createGroup = () => {
    if (readOnly) return;
    const name = newGroupName.trim();
    if (!name) {
      toast.error('أدخل اسم القائمة');
      return;
    }
    if (duplicateName) {
      toast.error('اسم القائمة مكرر، اختر اسمًا آخر');
      return;
    }
    const id = `custom-${Date.now()}`;
    const customGroups = [...(overrides.customGroups ?? []), { id, label: name }];
    const groupAssignments = { ...overrides.groupAssignments };
    const itemsOrder = { ...overrides.itemsOrder };
    newGroupPages.forEach((path) => {
      groupAssignments[path] = id;
      const targetPaths = groups.find((g) => g.id === id)?.items.map((i) => i.to) ?? [];
      itemsOrder[id] = [...(itemsOrder[id] ?? []), path];
    });
    update({ customGroups, groupAssignments, itemsOrder, labels: { ...overrides.labels, [`group:${id}`]: name } });
    setNewGroupName('');
    setNewGroupPages([]);
    setShowCreate(false);
    toast.success('تم إنشاء القائمة');
  };

  const save = () => {
    try {
      NavigationService.saveOverrides(overrides, AuthService.getCurrentUser());
      setDirty(false);
      toast.success('تم حفظ تخصيص القوائم.');
    } catch (error: any) {
      toast.error('تعذر الحفظ', error?.message);
    }
  };

  const reset = () => {
    if (!window.confirm('إرجاع القوائم إلى الوضع الافتراضي، بما يشمل ترتيب الصفحات ونقلها وتسمياتها؟')) return;
    setOverrides({
      hidden: [],
      hiddenGroups: [],
      labels: {},
      groupsOrder: [],
      itemsOrder: {},
      groupAssignments: {},
      customGroups: [],
    });
    setDirty(true);
  };

  const hiddenItems = groups.flatMap((g) => g.items.filter((it) => isHidden(it.to)).map((it) => ({ group: g, item: it })));
  const hiddenGroups = groups.filter((g) => isGroupHidden(g.id));

  const allPages = groups.flatMap((g) => g.items.map((it) => ({ group: g, item: it })));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-4">
        <div>
          <h3 className="text-sm font-extrabold text-ink ">محرر قوائم التنقّل</h3>
          <p className="text-[11px] text-muted ">
            انقل الصفحات بين القوائم، أو أعد ترتيبها وتسميتها أو إخفاءها. الإخفاء هنا يطبق على كل المستخدمين.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)} disabled={readOnly} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink-secondary hover:bg-surface-sunken dark:hover:bg-primary disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" /> قائمة جديدة
          </button>
          <button onClick={reset} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-muted hover:bg-surface-sunken dark:hover:bg-primary">
            <RotateCcw className="h-3.5 w-3.5" /> افتراضي
          </button>
          <button onClick={save} disabled={readOnly || !dirty} className="flex items-center gap-1.5 rounded-xl bg-success px-4 py-2 text-xs font-bold text-white hover:bg-success disabled:opacity-40">
            <Save className="h-4 w-4" /> حفظ القوائم
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-line bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold">إنشاء قائمة جديدة</h4>
            <button onClick={() => setShowCreate(false)} className="rounded p-1 text-muted hover:text-ink-secondary"><X className="h-4 w-4" /></button>
          </div>
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="اسم القائمة"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm dark:bg-primary"
          />
          {duplicateName && <p className="text-xs text-danger">اسم القائمة مكرر</p>}
          <div className="max-h-48 overflow-y-auto space-y-1">
            <p className="text-xs font-bold text-muted">نقل صفحات من قوائم أخرى (اختياري):</p>
            {allPages.map(({ group, item }) => (
              <label key={item.to} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={newGroupPages.includes(item.to)}
                  onChange={(e) => {
                    setNewGroupPages((prev) =>
                      e.target.checked ? [...prev, item.to] : prev.filter((p) => p !== item.to)
                    );
                  }}
                />
                {overrides.labels[item.to] ?? item.label} <span className="text-muted">({group.label})</span>
              </label>
            ))}
          </div>
          <button onClick={createGroup} disabled={readOnly || duplicateName || !newGroupName.trim()} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-40">
            إنشاء
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {groups.map((group, groupIndex) => (
          <div key={group.id} className={`rounded-2xl border border-line bg-surface ${isGroupHidden(group.id) ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <GripVertical className="h-4 w-4 text-muted" />
              <input
                value={overrides.labels[`group:${group.id}`] ?? group.label}
                onChange={(e) => update({ labels: { ...overrides.labels, [`group:${group.id}`]: e.target.value } })}
                disabled={readOnly}
                className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-0.5 text-sm font-extrabold text-ink focus:bg-surface-muted dark:focus:bg-primary focus:outline-none"
              />
              <button disabled={readOnly || groupIndex === 0} onClick={() => moveGroup(group.id, -1)} className="rounded p-1 text-muted hover:text-primary disabled:opacity-30" title="أعلى">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button disabled={readOnly || groupIndex === groups.length - 1} onClick={() => moveGroup(group.id, 1)} className="rounded p-1 text-muted hover:text-primary disabled:opacity-30" title="أسفل">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button disabled={readOnly} onClick={() => toggleGroupHidden(group.id)} className={`rounded-lg p-1.5 ${isGroupHidden(group.id) ? 'text-muted' : 'text-success'} hover:bg-surface-sunken dark:hover:bg-primary disabled:opacity-40`} title={isGroupHidden(group.id) ? 'إظهار القائمة' : 'إخفاء القائمة'}>
                {isGroupHidden(group.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="divide-y divide-line-strong dark:divide-primary">
              {group.items.map((item, itemIndex) => {
                const hidden = isHidden(item.to);
                return (
                  <div key={item.to + item.label} className={`flex items-center gap-2 px-3 py-2 ${hidden ? 'opacity-50' : ''}`}>
                    <button
                      disabled={readOnly}
                      onClick={() => toggleHidden(item.to)}
                      className={`rounded-lg p-1.5 ${hidden ? 'text-muted' : 'text-success'} hover:bg-surface-sunken dark:hover:bg-primary disabled:opacity-40`}
                      title={hidden ? 'إظهار' : 'إخفاء'}
                    >
                      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <input
                        value={overrides.labels[item.to] ?? item.label}
                        onChange={(e) => rename(item.to, e.target.value)}
                        disabled={readOnly}
                        className="w-full rounded-lg bg-transparent px-1 py-0.5 text-xs font-bold text-ink focus:bg-surface-muted dark:focus:bg-primary focus:outline-none"
                      />
                      <div className="px-1 font-mono text-[10px] text-muted">{item.to} · {item.perm || 'بدون صلاحية'}</div>
                    </div>
                    <select
                      value={group.id}
                      onChange={(event) => moveItemToGroup(group.id, item.to, event.target.value)}
                      disabled={readOnly}
                      aria-label={`نقل ${item.label} إلى قائمة أخرى`}
                      title="نقل الصفحة إلى قائمة أخرى"
                      className="max-w-28 rounded-lg border border-line bg-surface px-1.5 py-1 text-[10px] font-bold text-ink-secondary disabled:opacity-40 "
                    >
                      {groups.map((targetGroup) => (
                        <option key={targetGroup.id} value={targetGroup.id}>{targetGroup.label}</option>
                      ))}
                    </select>
                    <button disabled={readOnly || itemIndex === 0} onClick={() => moveItem(group.id, item.to, -1)} className="rounded p-1 text-muted hover:text-primary disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button disabled={readOnly || itemIndex === group.items.length - 1} onClick={() => moveItem(group.id, item.to, 1)} className="rounded p-1 text-muted hover:text-primary disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {hiddenGroups.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h4 className="mb-2 text-sm font-extrabold text-ink ">القوائم المخفية</h4>
          <div className="space-y-2">
            {hiddenGroups.map((group) => (
              <div key={group.id} className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2">
                <EyeOff className="h-4 w-4 text-muted" />
                <span className="flex-1 text-xs font-bold text-ink ">{overrides.labels[`group:${group.id}`] ?? group.label}</span>
                <button disabled={readOnly} onClick={() => toggleGroupHidden(group.id)} className="rounded-lg p-1.5 text-success hover:bg-surface-sunken dark:hover:bg-primary disabled:opacity-40" title="إظهار">
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {hiddenItems.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h4 className="mb-2 text-sm font-extrabold text-ink ">الصفحات المخفية</h4>
          <div className="space-y-2">
            {hiddenItems.map(({ group, item }) => (
              <div key={item.to} className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2">
                <EyeOff className="h-4 w-4 text-muted" />
                <span className="flex-1 text-xs font-bold text-ink ">{overrides.labels[item.to] ?? item.label}</span>
                <span className="font-mono text-[10px] text-muted">{item.to}</span>
                <button disabled={readOnly} onClick={() => toggleHidden(item.to)} className="rounded-lg p-1.5 text-success hover:bg-surface-sunken dark:hover:bg-primary disabled:opacity-40" title="إظهار">
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};