import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Eye, EyeOff, Save, RotateCcw, GripVertical } from 'lucide-react';
import { NavigationService, type NavOverrides } from '../../services/NavigationService';
import { AuthService } from '../../services/AuthService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';

export const AdminNavigationTab: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const readOnly = !can('admin.navigation');
  const [overrides, setOverrides] = useState<NavOverrides>(() => NavigationService.getOverrides());
  const [dirty, setDirty] = useState(false);

  const groups = useMemo(() => NavigationService.merge(overrides), [overrides]);

  useEffect(() => {
    setOverrides(NavigationService.getOverrides());
  }, []);

  const update = (patch: Partial<NavOverrides>) => {
    setOverrides((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const isHidden = (path: string) => overrides.hidden.includes(path);

  const toggleHidden = (path: string) => {
    const hidden = isHidden(path)
      ? overrides.hidden.filter((p) => p !== path)
      : [...overrides.hidden, path];
    update({ hidden });
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

  const moveGroup = (groupId: string, direction: -1 | 1) => {
    const order = groups.map((g) => g.id);
    const index = order.indexOf(groupId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    order.splice(index, 1);
    order.splice(target, 0, groupId);
    update({ groupsOrder: order });
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
    if (!window.confirm('إرجاع القوائم إلى الترتيب والتسميات الافتراضية؟')) return;
    setOverrides({ hidden: [], labels: {}, groupsOrder: [], itemsOrder: {} });
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">محرر قوائم التنقّل</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            إخفاء أو إعادة تسمية أو ترتيب أي عنصر. الإخفاء هنا يخفي العنصر عن كل المستخدمين بغض النظر عن الصلاحية.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <RotateCcw className="h-3.5 w-3.5" /> افتراضي
          </button>
          <button onClick={save} disabled={readOnly || !dirty} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
            <Save className="h-4 w-4" /> حفظ القوائم
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {groups.map((group, groupIndex) => (
          <div key={group.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <GripVertical className="h-4 w-4 text-slate-400" />
              <input
                value={overrides.labels[`group:${group.id}`] ?? group.label}
                onChange={(e) => update({ labels: { ...overrides.labels, [`group:${group.id}`]: e.target.value } })}
                disabled={readOnly}
                className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-0.5 text-sm font-extrabold text-slate-900 dark:text-slate-100 focus:bg-slate-50 dark:focus:bg-slate-800 focus:outline-none"
              />
              <button disabled={readOnly || groupIndex === 0} onClick={() => moveGroup(group.id, -1)} className="rounded p-1 text-slate-400 hover:text-sky-600 disabled:opacity-30" title="أعلى">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button disabled={readOnly || groupIndex === groups.length - 1} onClick={() => moveGroup(group.id, 1)} className="rounded p-1 text-slate-400 hover:text-sky-600 disabled:opacity-30" title="أسفل">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {group.items.map((item, itemIndex) => {
                const hidden = isHidden(item.to);
                return (
                  <div key={item.to + item.label} className={`flex items-center gap-2 px-3 py-2 ${hidden ? 'opacity-50' : ''}`}>
                    <button
                      disabled={readOnly}
                      onClick={() => toggleHidden(item.to)}
                      className={`rounded-lg p-1.5 ${hidden ? 'text-slate-400' : 'text-emerald-600'} hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40`}
                      title={hidden ? 'إظهار' : 'إخفاء'}
                    >
                      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <input
                        value={overrides.labels[item.to] ?? item.label}
                        onChange={(e) => rename(item.to, e.target.value)}
                        disabled={readOnly}
                        className="w-full rounded-lg bg-transparent px-1 py-0.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:bg-slate-50 dark:focus:bg-slate-800 focus:outline-none"
                      />
                      <div className="px-1 font-mono text-[10px] text-slate-400">{item.to} · {item.perm || 'بدون صلاحية'}</div>
                    </div>
                    <button disabled={readOnly || itemIndex === 0} onClick={() => moveItem(group.id, item.to, -1)} className="rounded p-1 text-slate-400 hover:text-sky-600 disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button disabled={readOnly || itemIndex === group.items.length - 1} onClick={() => moveItem(group.id, item.to, 1)} className="rounded p-1 text-slate-400 hover:text-sky-600 disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
