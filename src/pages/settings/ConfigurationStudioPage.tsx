import React, { useMemo, useState } from 'react';
import {
  Activity, Layers, ShieldCheck, SlidersHorizontal, Target, Wrench, Zap,
} from 'lucide-react';
import { useAppConfig } from '../../hooks/useAppConfig';
import { usePermission } from '../../hooks/usePermission';
import { AuthService } from '../../services/AuthService';
import { ActionRegistryService } from '../../services/ActionRegistryService';
import { FeatureService } from '../../services/FeatureService';
import { ModuleRegistryService } from '../../services/ModuleRegistryService';
import { AppConfigService } from '../../services/AppConfigService';
import { DatabaseManager } from '../../database/db';
import { CONFIGURATION_SCOPE_LABELS, CONFIGURATION_SCOPE_PRECEDENCE } from '../../config/configurationScopes';
import { ACTION_REGISTRY } from '../../config/actionRegistry';
import { FEATURE_REGISTRY } from '../../services/FeatureService';

type TabId = 'actions' | 'features' | 'scopes' | 'diagnostics';

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'actions', label: 'الأزرار والإجراءات', icon: Zap },
  { id: 'features', label: 'الميزات والاشتراكات', icon: Target },
  { id: 'scopes', label: 'النطاقات والوراثة', icon: Layers },
  { id: 'diagnostics', label: 'التشخيصات', icon: Activity },
];

const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

export const ConfigurationStudioPage: React.FC = () => {
  const can = usePermission();
  const state = useAppConfig();
  const [activeTab, setActiveTab] = useState<TabId>('actions');
  const [selectedActionId, setSelectedActionId] = useState(ACTION_REGISTRY[0]?.id ?? '');
  const [actionLabel, setActionLabel] = useState('');
  const [actionVisible, setActionVisible] = useState(true);
  const [actionConfirm, setActionConfirm] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState(FEATURE_REGISTRY[0]?.id ?? '');
  const [scopeType, setScopeType] = useState<(typeof CONFIGURATION_SCOPE_PRECEDENCE)[number]>('branch');
  const [scopeId, setScopeId] = useState('');
  const [scopePagePath, setScopePagePath] = useState('/dashboard');
  const [scopeEnabled, setScopeEnabled] = useState(true);
  const [scopeLabel, setScopeLabel] = useState('');

  const admin = AuthService.getCurrentUser();
  const canUpdate = can('settings.update');

  const branches = useMemo(() => {
    try {
      return DatabaseManager.getInstance().query<{ id: string; name: string }>('SELECT id, name FROM branches');
    } catch {
      return [];
    }
  }, []);

  const selectedAction = useMemo(
    () => ActionRegistryService.resolve(selectedActionId, admin),
    [selectedActionId, admin?.id],
  );

  const selectedFeature = useMemo(
    () => FeatureService.resolve(selectedFeatureId, admin),
    [selectedFeatureId, admin?.id],
  );

  const saveAction = () => {
    if (!canUpdate) return;
    const entry = {
      domain: 'action' as const,
      key: selectedActionId,
      enabled: actionVisible,
      label: actionLabel,
      value: '',
      props: { confirm: actionConfirm },
    };
    AppConfigService.upsertEntry(entry as any, 'تحديث إجراء', admin);
  };

  const saveFeatureEntitlement = (entitled: boolean) => {
    if (!canUpdate) return;
    FeatureService.setEntitled(selectedFeatureId, entitled, admin);
  };

  const saveScope = () => {
    if (!canUpdate || !scopeId.trim()) return;
    AppConfigService.saveScopeEntry(
      scopeType,
      scopeId.trim(),
      {
        domain: 'page',
        key: scopePagePath,
        enabled: scopeEnabled,
        label: scopeLabel,
        value: '',
        props: {},
      } as any,
      'تحديث إعداد النطاق',
      admin,
    );
  };

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">استوديو التكوين الديناميكي</h1>
          <p className="text-sm text-slate-500">
            إدارة الأزرار والميزات والنطاقات (مستأجر / شركة / فرع / جهاز / مستخدم) مع الوراثة والتشخيص.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>الحالة: {state.entries.length} إعداد أساسي · {state.scopedEntries.length} تجاوز نطاق</span>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                active ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === 'actions' && (
        <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-black text-slate-900">الإجراءات المسجلة</h2>
            <div className="max-h-[480px] space-y-2 overflow-y-auto">
              {ACTION_REGISTRY.map((action) => {
                const resolved = ActionRegistryService.resolve(action.id, admin);
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => {
                      setSelectedActionId(action.id);
                      setActionLabel(resolved.label === action.label ? '' : resolved.label);
                      setActionVisible(resolved.visible);
                      setActionConfirm(resolved.confirm);
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-right text-xs transition ${
                      selectedActionId === action.id
                        ? 'border-sky-500 bg-sky-50 text-sky-700'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{action.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${resolved.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {resolved.enabled ? 'مفعّل' : 'مقيّد'}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">{action.id}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-black text-slate-900">تكوين الإجراء: {selectedActionId}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600">العنوان (تجاوز)</label>
                <input
                  className={inputCls}
                  value={actionLabel}
                  onChange={(e) => setActionLabel(e.target.value)}
                  placeholder={selectedAction.label}
                />
              </div>
              <div className="flex items-center gap-6 pt-6">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input type="checkbox" checked={actionVisible} onChange={(e) => setActionVisible(e.target.checked)} />
                  مرئي
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input type="checkbox" checked={actionConfirm} onChange={(e) => setActionConfirm(e.target.checked)} />
                  يتطلب تأكيد
                </label>
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <div>الحالة الفعّالة: <strong>{selectedAction.enabled ? 'مسموح' : 'مقيّد'}</strong></div>
              {selectedAction.reason && <div className="mt-1 text-rose-600">{selectedAction.reason}</div>}
              <div className="mt-1">الصلاحيات (غير قابلة للتخفيف): {(selectedAction.definition?.permissions ?? []).join('، ') || '—'}</div>
            </div>
            <button
              type="button"
              disabled={!canUpdate}
              onClick={saveAction}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-sky-600/30 disabled:opacity-50"
            >
              حفظ تكوين الإجراء
            </button>
          </div>
        </section>
      )}

      {activeTab === 'features' && (
        <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-black text-slate-900">الميزات المسجلة</h2>
            <div className="max-h-[480px] space-y-2 overflow-y-auto">
              {FEATURE_REGISTRY.map((feature) => {
                const resolved = FeatureService.resolve(feature.id, admin);
                return (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => setSelectedFeatureId(feature.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-right text-xs transition ${
                      selectedFeatureId === feature.id
                        ? 'border-sky-500 bg-sky-50 text-sky-700'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{feature.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${resolved.allowed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {resolved.allowed ? 'متاحة' : 'مقيّدة'}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">{feature.id}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-black text-slate-900">تكوين الميزة: {selectedFeatureId}</h2>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <div>التوفر (وحدة): <strong>{selectedFeature.available ? 'مفعّل' : 'غير مفعّل'}</strong></div>
              <div className="mt-1">الاستحقاق (اشتراك): <strong>{selectedFeature.entitled ? 'مستحق' : 'غير مستحق'}</strong></div>
              <div className="mt-1">الصلاحية: <strong>{selectedFeature.permitted ? 'ممنوحة' : 'غير ممنوحة'}</strong></div>
              {selectedFeature.reason && <div className="mt-1 text-rose-600">{selectedFeature.reason}</div>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!canUpdate}
                onClick={() => saveFeatureEntitlement(true)}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                تفعيل الاستحقاق
              </button>
              <button
                type="button"
                disabled={!canUpdate}
                onClick={() => saveFeatureEntitlement(false)}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                إلغاء الاستحقاق
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              إلغاء الاستحقاق (اشتراك) لا يحذف البيانات. الوحدة والصلاحيات تُدار من مكانها الأصلي.
            </p>
          </div>
        </section>
      )}

      {activeTab === 'scopes' && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-black text-slate-900">تجاوزات النطاق (وراثة)</h2>
          <p className="text-xs text-slate-500">
            حدد النطاق (فرع/جهاز/مستخدم/...) ثم أدخل تجاوزًا. الأعلى سلطة (منصة ← مستأجر ← نشاط ← شركة ← فرع ← جهاز ← مستخدم) يفوز عند التعارض.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-600">نوع النطاق</label>
              <select className={inputCls} value={scopeType} onChange={(e) => setScopeType(e.target.value as any)}>
                {CONFIGURATION_SCOPE_PRECEDENCE.map((type) => (
                  <option key={type} value={type}>{CONFIGURATION_SCOPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-600">معرّف النطاق</label>
              <input
                className={inputCls}
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                placeholder="br_main"
              />
              {scopeType === 'branch' && Array.isArray(branches) && branches.length > 0 && (
                <select className={inputCls + ' mt-2'} value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                  <option value="">— اختر فرعًا —</option>
                  {branches.map((branch: any) => (
                    <option key={branch.id} value={branch.id}>{branch.name || branch.id}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-600">صفحة (path)</label>
              <input className={inputCls} value={scopePagePath} onChange={(e) => setScopePagePath(e.target.value)} placeholder="/dashboard" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <input type="checkbox" checked={scopeEnabled} onChange={(e) => setScopeEnabled(e.target.checked)} />
              مفعّلة
            </label>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-600">عنوان (تجاوز)</label>
              <input className={inputCls} value={scopeLabel} onChange={(e) => setScopeLabel(e.target.value)} placeholder="عنوان مخصص" />
            </div>
          </div>
          <button
            type="button"
            disabled={!canUpdate}
            onClick={saveScope}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-sky-600/30 disabled:opacity-50"
          >
            حفظ تجاوز النطاق
          </button>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <div>السياق الفعّال: {AppConfigService.getActiveContext().userId ?? '—'} · {AppConfigService.getActiveContext().branchId ?? '—'}</div>
            <div className="mt-1">تجاوزات مسجلة: {state.scopedEntries.length}</div>
          </div>
        </section>
      )}

      {activeTab === 'diagnostics' && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-black text-slate-900">تشخيصات التكوين</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            <li>• إعدادات أساسية: {state.entries.length}</li>
            <li>• قواعد DOM/نص: {state.rules.length}</li>
            <li>• تجاوزات نطاق: {state.scopedEntries.length}</li>
            <li>• سلسلة النطاقات: {state.scopeChain.map((ref) => `${ref.type}:${ref.id}`).join(' → ') || '—'}</li>
            <li>• الوحدات المفعّلة: {ModuleRegistryService.getEnabledModuleIds().join('، ')}</li>
            <li>• عدد الإجراءات المسجلة: {ACTION_REGISTRY.length}</li>
            <li>• عدد الميزات المسجلة: {FEATURE_REGISTRY.length}</li>
          </ul>
          <p className="text-[11px] text-slate-500">
            استخدم «محرك التكوين الديناميكي» (/settings/app-configuration) لإدارة الصفحات/Aقسام/الحقول/النصوص/السياسات/الترقيم/الطباعة.
          </p>
        </section>
      )}
    </div>
  );
};
