import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, Boxes, Check, ChevronLeft, Eye, EyeOff,
  FileText, History, LayoutList, Redo2, RotateCcw, Save, Search, Settings2, ShieldCheck,
  SlidersHorizontal, Sparkles, Trash2, Type, Wand2, X,
} from 'lucide-react';
import {
  APP_CONFIG_POLICY_CATALOG,
  APP_CONFIG_PRINT_CATALOG,
  APP_CONFIG_TEXT_CATALOG,
  APP_CONFIG_NUMBERING_CATALOG,
  DEFAULT_NUMBER_TEMPLATE,
  normalizePagePath,
  type AppConfigDomain,
  type AppConfigEntry,
  type AppConfigRule,
  type AppConfigSnapshot,
} from '../../config/appConfiguration';
import { getRegisteredConfigTargets } from '../../config/appConfigTargets';
import { appRoutes } from '../../router/routesList';
import { NAV_GROUPS } from '../../config/navigation';
import { AppConfigService, type AppConfigVersion, type AppConfigState } from '../../services/AppConfigService';
import { ModuleRegistryService } from '../../services/ModuleRegistryService';
import { AuthService } from '../../services/AuthService';
import { usePermission } from '../../hooks/usePermission';
import { useAppConfig } from '../../hooks/useAppConfig';
import { useToast } from '../../components/ui/Toast';

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelCls = 'mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300';

type TabId = 'overview' | 'pages' | 'sections' | 'fields' | 'texts' | 'policies' | 'history';

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'نظرة عامة', icon: Sparkles },
  { id: 'pages', label: 'الصفحات', icon: LayoutList },
  { id: 'sections', label: 'الأقسام', icon: Boxes },
  { id: 'fields', label: 'الحقول', icon: SlidersHorizontal },
  { id: 'texts', label: 'النصوص', icon: Type },
  { id: 'policies', label: 'السياسات والترقيم', icon: Settings2 },
  { id: 'history', label: 'السجل والإصدارات', icon: History },
];

const NAV_LABELS = new Map(NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.to, item.label])));

function defaultEntry(domain: AppConfigDomain, key: string): AppConfigEntry {
  return { domain, key, enabled: true, label: '', value: '', props: {} };
}

function entryKey(domain: AppConfigDomain, key: string): string {
  return `${domain}:${key}`;
}

function newRuleId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `rule_${random}`;
}

const Card: React.FC<{ title?: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }> = ({
  title, description, children, actions,
}) => (
  <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
    {(title || actions) && (
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {title && <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{title}</h3>}
          {description && <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {actions}
      </div>
    )}
    {children}
  </section>
);

const Field: React.FC<{ label: string; children: React.ReactNode; full?: boolean }> = ({ label, children, full }) => (
  <div className={full ? 'sm:col-span-2' : undefined}>
    <span className={labelCls}>{label}</span>
    {children}
  </div>
);

const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label?: string; disabled?: boolean }> = ({
  checked, onChange, label, disabled,
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-40 ${
      checked
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
    }`}
    aria-pressed={checked}
  >
    {checked ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
    {label ?? (checked ? 'ظاهر' : 'مخفي')}
  </button>
);

export const AppConfigurationPage: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const readOnly = !can('settings.update');
  const canViewHistory = can('audit.view');
  const state = useAppConfig();

  const [tab, setTab] = useState<TabId>('overview');
  const [entries, setEntries] = useState<AppConfigEntry[]>(state.entries);
  const [rules, setRules] = useState<AppConfigRule[]>(state.rules);
  const [dirty, setDirty] = useState(false);
  const [pageSearch, setPageSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [versions, setVersions] = useState<AppConfigVersion[]>([]);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [moduleState, setModuleState] = useState(() => ModuleRegistryService.getModuleState());

  // Rule draft
  const [ruleKind, setRuleKind] = useState<'selector' | 'text'>('selector');
  const [rulePage, setRulePage] = useState('/dashboard');
  const [ruleSelector, setRuleSelector] = useState('');
  const [ruleMatch, setRuleMatch] = useState('');
  const [ruleReplacement, setRuleReplacement] = useState('');
  const [ruleAction, setRuleAction] = useState<'hide' | 'show' | 'text'>('hide');
  const [ruleNote, setRuleNote] = useState('');

  const [importText, setImportText] = useState('');

  const syncFromState = (next: AppConfigState) => {
    setEntries(next.entries);
    setRules(next.rules);
  };

  useEffect(() => {
    if (!dirty) syncFromState(state);
  }, [state, dirty]);

  useEffect(() => {
    if (tab !== 'history' || !canViewHistory) return;
    try {
      setVersions(AppConfigService.getVersions(60));
      setVersionsError(null);
    } catch (error) {
      setVersionsError(error instanceof Error ? error.message : String(error));
    }
  }, [tab, canViewHistory, state]);

  const formEntries = useMemo(
    () => new Map(entries.map((entry) => [entryKey(entry.domain, entry.key), entry])),
    [entries],
  );

  const pageCatalog = useMemo(() => {
    const seen = new Set<string>();
    const pages: Array<{ path: string; label: string }> = [];
    for (const route of appRoutes) {
      const path = normalizePagePath(route.path);
      if (path === '*' || seen.has(path)) continue;
      seen.add(path);
      const nav = NAV_LABELS.get(path);
      const label = nav || (path === '/' ? 'الرئيسية' : path.replace(/^\//, '').replace(/[/-]/g, ' '));
      pages.push({ path, label });
    }
    return pages.sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }, []);

  const registeredTargets = useMemo(() => {
    // Registered targets change when instrumented sections mount.
    void state;
    return getRegisteredConfigTargets();
  }, [state]);

  const registeredSections = useMemo(
    () => registeredTargets.filter((target) => target.domain === 'section'),
    [registeredTargets],
  );
  const registeredFields = useMemo(
    () => registeredTargets.filter((target) => target.domain === 'field'),
    [registeredTargets],
  );

  const stats = useMemo(() => {
    const pagesHidden = entries.filter((entry) => entry.domain === 'page' && !entry.enabled).length;
    const sectionsHidden = entries.filter((entry) => entry.domain === 'section' && !entry.enabled).length;
    const fieldsHidden = entries.filter((entry) => entry.domain === 'field' && !entry.enabled).length;
    return {
      entries: entries.length,
      rules: rules.length,
      pagesHidden,
      sectionsHidden,
      fieldsHidden,
      textOverrides: entries.filter((entry) => entry.domain === 'text').length,
    };
  }, [entries, rules]);

  const upsertEntry = (domain: AppConfigDomain, key: string, patch: Partial<AppConfigEntry>) => {
    setEntries((current) => {
      const id = entryKey(domain, key);
      const index = current.findIndex((entry) => entryKey(entry.domain, entry.key) === id);
      if (index < 0) return [...current, { ...defaultEntry(domain, key), ...patch }];
      const next = [...current];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    setDirty(true);
  };

  const removeEntry = (domain: AppConfigDomain, key: string) => {
    setEntries((current) => current.filter((entry) => entryKey(entry.domain, entry.key) !== entryKey(domain, key)));
    setDirty(true);
  };

  const addRule = () => {
    try {
      const rule: AppConfigRule = ruleKind === 'selector'
        ? {
          id: newRuleId(),
          kind: 'selector',
          pagePath: normalizePagePath(rulePage),
          selector: ruleSelector.trim(),
          action: ruleAction,
          enabled: true,
          ...(ruleAction === 'text' ? { replacementText: ruleReplacement } : {}),
          ...(ruleNote.trim() ? { note: ruleNote.trim() } : {}),
        }
        : {
          id: newRuleId(),
          kind: 'text',
          pagePath: normalizePagePath(rulePage),
          matchText: ruleMatch,
          replacementText: ruleReplacement,
          action: 'text',
          enabled: true,
          ...(ruleNote.trim() ? { note: ruleNote.trim() } : {}),
        };
      // Validate early so the list never shows an unsavable rule.
      if (ruleKind === 'selector' && !rule.selector) throw new Error('اكتب محدد العنصر (CSS selector).');
      if (ruleKind === 'text' && !rule.matchText?.trim()) throw new Error('اكتب النص الأصلي المطلوب استبداله.');
      setRules((current) => [...current, rule]);
      setDirty(true);
      setRuleSelector('');
      setRuleMatch('');
      setRuleReplacement('');
      setRuleNote('');
      toast.success('تمت إضافة القاعدة إلى المسودة. اضغط «حفظ» لتطبيقها.');
    } catch (error) {
      toast.error('تعذر إضافة القاعدة', error instanceof Error ? error.message : String(error));
    }
  };

  const updateRule = (id: string, patch: Partial<AppConfigRule>) => {
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
    setDirty(true);
  };

  const removeRule = (id: string) => {
    setRules((current) => current.filter((rule) => rule.id !== id));
    setDirty(true);
  };

  const save = () => {
    try {
      AppConfigService.saveConfig({ entries, rules }, 'تحديث من محرك التكوين الديناميكي', AuthService.getCurrentUser());
      setDirty(false);
      toast.success('تم حفظ التكوين وتطبيقه على الواجهة.');
    } catch (error) {
      toast.error('تعذر حفظ التكوين', error instanceof Error ? error.message : String(error));
    }
  };

  const resetDraft = () => {
    syncFromState(AppConfigService.getState());
    setDirty(false);
  };

  const resetAll = () => {
    if (!window.confirm('إعادة ضبط كل تكوين الواجهة؟ ستعود الصفحات والأقسام والنصوص إلى حالتها الأصلية، ولن تُحذف أي بيانات أعمال.')) return;
    try {
      AppConfigService.reset(AuthService.getCurrentUser());
      setDirty(false);
      toast.success('تمت إعادة ضبط محرك التكوين.');
    } catch (error) {
      toast.error('تعذرت إعادة الضبط', error instanceof Error ? error.message : String(error));
    }
  };

  const exportConfig = async () => {
    try {
      const json = AppConfigService.exportJson(AuthService.getCurrentUser());
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `app-configuration-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      try {
        await navigator.clipboard.writeText(json);
        toast.success('تم تصدير التكوين ونسخه إلى الحافظة.');
      } catch {
        toast.success('تم تصدير ملف التكوين.');
      }
    } catch (error) {
      toast.error('تعذر تصدير التكوين', error instanceof Error ? error.message : String(error));
    }
  };

  const importConfig = (raw: string) => {
    if (!raw.trim()) {
      toast.error('ألصق محتوى ملف التكوين أولًا.');
      return;
    }
    if (!window.confirm('استيراد التكوين سيستبدل كل الأهداف والقواعد الحالية. هل تريد المتابعة؟')) return;
    try {
      AppConfigService.importJson(raw, AuthService.getCurrentUser());
      setImportText('');
      setDirty(false);
      toast.success('تم استيراد التكوين بنجاح.');
    } catch (error) {
      toast.error('تعذر استيراد التكوين', error instanceof Error ? error.message : String(error));
    }
  };

  const restoreVersion = (version: AppConfigVersion) => {
    if (!window.confirm(`استعادة الإصدار ${version.version}؟ سيُنشأ إصدار جديد مطابق له.`)) return;
    try {
      AppConfigService.restoreVersion(version.id, AuthService.getCurrentUser());
      setDirty(false);
      toast.success(`تمت استعادة الإصدار ${version.version}.`);
    } catch (error) {
      toast.error('تعذرت استعادة الإصدار', error instanceof Error ? error.message : String(error));
    }
  };

  const toggleModule = (moduleId: string) => {
    try {
      const actor = AuthService.getCurrentUser();
      const enabled = ModuleRegistryService.isModuleEnabled(moduleId);
      if (enabled) ModuleRegistryService.deactivate(moduleId, actor, 'من محرك التكوين');
      else ModuleRegistryService.activate(moduleId, actor, 'من محرك التكوين');
      setModuleState(ModuleRegistryService.getModuleState());
      toast.success(enabled ? 'تم تعطيل الوحدة وإخفاء صفحاتها.' : 'تم تفعيل الوحدة.');
    } catch (error) {
      toast.error('تعذر تغيير حالة الوحدة', error instanceof Error ? error.message : String(error));
    }
  };

  const policyValue = (key: string) => formEntries.get(entryKey('policy', key))?.value ?? '';
  const numberingProps = (key: string) => formEntries.get(entryKey('numbering', key))?.props ?? {};
  const printValue = (key: string) => formEntries.get(entryKey('print', key))?.value ?? '';

  const filteredPages = useMemo(() => {
    const query = pageSearch.trim().toLocaleLowerCase('ar');
    return pageCatalog.filter((page) =>
      !query || page.label.toLocaleLowerCase('ar').includes(query) || page.path.toLocaleLowerCase('en').includes(query)
    );
  }, [pageCatalog, pageSearch]);

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950 lg:p-6" dir="rtl" data-config-ignore>
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-500 to-sky-600 text-white shadow-lg shadow-violet-500/25">
              <Wand2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">محرك التكوين الديناميكي</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                تحكم في الصفحات والأقسام والحقول والنصوص والسياسات والترقيم وقوالب الطباعة دون تعديل الكود.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={resetDraft} disabled={!dirty} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">
              <RotateCcw className="h-3.5 w-3.5" /> تراجع
            </button>
            <button onClick={save} disabled={readOnly || !dirty} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
              <Save className="h-4 w-4" /> حفظ وتطبيق
            </button>
          </div>
        </header>

        {readOnly && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <ShieldCheck className="ml-1 inline h-3.5 w-3.5" /> وضع القراءة فقط: تحتاج صلاحية settings.update للحفظ.
          </p>
        )}

        <nav className="flex flex-wrap gap-2" aria-label="أقسام محرك التكوين">
          {TABS.filter((item) => item.id !== 'history' || canViewHistory).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  active
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </nav>

        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                ['أهداف مكوّنة', stats.entries],
                ['قواعد DOM', stats.rules],
                ['صفحات مخفية', stats.pagesHidden],
                ['أقسام مخفية', stats.sectionsHidden],
                ['حقول مخفية', stats.fieldsHidden],
                ['نصوص مخصصة', stats.textOverrides],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</div>
                  <div className="mt-1 font-mono text-xl font-black text-slate-900 dark:text-slate-100">{value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="كيف يعمل المحرك؟" description="كل تعديل يُحفظ كإصدار قابل للاستعادة، ويُطبّق فورًا على الواجهة.">
                <ul className="space-y-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                  <li><strong>الصفحات:</strong> إخفاء الصفحة يخفي رابطها ويمنع فتح مسارها.</li>
                  <li><strong>الأقسام:</strong> أخفِ أي قسم عبر محدد CSS أو عبر تغليفه بـ ConfigSection.</li>
                  <li><strong>الحقول:</strong> إخفاء أو إلزام أو إعادة تسمية حقول النماذج.</li>
                  <li><strong>النصوص:</strong> استبدال أي نص ظاهر حرفيًا في أي صفحة.</li>
                  <li><strong>السياسات والترقيم:</strong> تجاوزات مركزية تُقرأ من الخدمات الحالية.</li>
                </ul>
              </Card>
              <Card title="نسخ احتياطي للتكوين">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void exportConfig()} className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700">
                    <ArrowDownToLine className="h-4 w-4" /> تصدير JSON
                  </button>
                  <button onClick={resetAll} disabled={readOnly} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-500/30 dark:hover:bg-rose-950/30">
                    <RotateCcw className="h-4 w-4" /> إعادة الضبط الكامل
                  </button>
                </div>
                <label className="mt-3 block text-[11px] font-bold text-slate-600 dark:text-slate-300">استيراد تكوين (JSON)</label>
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  rows={6}
                  dir="ltr"
                  placeholder='{"schemaVersion":1,"entries":[],"rules":[]}'
                  className={`${inputCls} mt-1 font-mono`}
                />
                <div className="mt-2 flex gap-2">
                  <button onClick={() => importConfig(importText)} disabled={readOnly} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-40">
                    <ArrowUpFromLine className="h-4 w-4" /> استيراد
                  </button>
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <FileText className="h-4 w-4" /> من ملف
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setImportText(String(reader.result || ''));
                        reader.readAsText(file);
                      }}
                    />
                  </label>
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab === 'pages' && (
          <Card
            title="الصفحات والتنقل"
            description="أخفِ صفحة كاملة أو غيّر اسمها أو ترتيبها. الإخفاء لا يحذف البيانات، ويمنع فتح المسار أيضًا."
            actions={
              <div className="relative w-64">
                <Search className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  value={pageSearch}
                  onChange={(event) => setPageSearch(event.target.value)}
                  placeholder="ابحث في الصفحات..."
                  className={`${inputCls} pr-7`}
                />
              </div>
            }
          >
            <div className="max-h-[62vh] space-y-1.5 overflow-y-auto pr-1">
              {filteredPages.map((page) => {
                const entry = formEntries.get(entryKey('page', page.path));
                const enabled = entry?.enabled ?? true;
                return (
                  <div key={page.path} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 sm:grid-cols-[minmax(0,1fr)_10rem_4.5rem_2rem]">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{page.label}</div>
                      <code className="text-[9px] text-slate-400" dir="ltr">{page.path}</code>
                    </div>
                    <input
                      value={entry?.label ?? ''}
                      onChange={(event) => upsertEntry('page', page.path, { label: event.target.value })}
                      placeholder="التسمية الافتراضية"
                      aria-label={`تسمية ${page.label}`}
                      className={inputCls}
                      disabled={readOnly}
                    />
                    <input
                      type="number"
                      value={entry?.order ?? ''}
                      onChange={(event) => upsertEntry('page', page.path, { order: event.target.value === '' ? undefined : Number(event.target.value) })}
                      placeholder="الترتيب"
                      aria-label={`ترتيب ${page.label}`}
                      className={inputCls}
                      disabled={readOnly}
                    />
                    <div className="flex items-center justify-end gap-1">
                      <Toggle
                        checked={enabled}
                        disabled={readOnly}
                        onChange={(value) => upsertEntry('page', page.path, { enabled: value })}
                        label={enabled ? 'ظاهرة' : 'مخفية'}
                      />
                    </div>
                  </div>
                );
              })}
              {filteredPages.length === 0 && (
                <p className="rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-700">لا توجد صفحات تطابق البحث.</p>
              )}
            </div>
          </Card>
        )}

        {tab === 'sections' && (
          <div className="space-y-4">
            <Card title="أقسام مُعرّفة في الكود" description="تظهر الأقسام هنا بعد زيارة صفحتها مرة واحدة. يمكن إخفاؤها أو إعادة تسميتها.">
              <div className="space-y-1.5">
                {registeredSections.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-[11px] text-slate-500 dark:border-slate-700">
                    لم تُسجّل أقسام بعد. افتح صفحة تحتوي على ConfigSection ثم عد إلى هنا، أو استخدم قواعد المحدد بالأسفل.
                  </p>
                )}
                {registeredSections.map((target) => {
                  const entry = formEntries.get(entryKey('section', target.key));
                  const enabled = entry?.enabled ?? true;
                  return (
                    <div key={target.key} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 sm:grid-cols-[minmax(0,1fr)_12rem_7rem_2rem]">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{entry?.label || target.label}</div>
                        <code className="text-[9px] text-slate-400" dir="ltr">{target.key}</code>
                      </div>
                      <input
                        value={entry?.label ?? ''}
                        onChange={(event) => upsertEntry('section', target.key, { label: event.target.value })}
                        placeholder="تسمية القسم"
                        aria-label={`تسمية ${target.label}`}
                        className={inputCls}
                        disabled={readOnly}
                      />
                      <Toggle checked={enabled} disabled={readOnly} onChange={(value) => upsertEntry('section', target.key, { enabled: value })} label={enabled ? 'ظاهر' : 'مخفي'} />
                      <button onClick={() => removeEntry('section', target.key)} disabled={readOnly} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40" title="مسح التخصيص" aria-label="مسح التخصيص">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="قواعد المحدد والنصوص" description="تحكم في أي عنصر في أي صفحة دون تعديل ملفاتها: أخفِ قسمًا، أظهره، أو استبدل نصه.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="نوع القاعدة">
                  <select value={ruleKind} onChange={(event) => setRuleKind(event.target.value as 'selector' | 'text')} className={inputCls}>
                    <option value="selector">عنصر عبر محدد CSS</option>
                    <option value="text">نص ظاهر حرفي</option>
                  </select>
                </Field>
                <Field label="الصفحة">
                  <select value={rulePage} onChange={(event) => setRulePage(event.target.value)} className={inputCls}>
                    <option value="*">كل الصفحات</option>
                    {pageCatalog.map((page) => <option key={page.path} value={page.path}>{page.label} ({page.path})</option>)}
                  </select>
                </Field>
                {ruleKind === 'selector' ? (
                  <>
                    <Field label="محدد العنصر (CSS)">
                      <input value={ruleSelector} onChange={(event) => setRuleSelector(event.target.value)} placeholder="#sec-pulse أو .some-class" dir="ltr" className={`${inputCls} font-mono`} />
                    </Field>
                    <Field label="الإجراء">
                      <select value={ruleAction} onChange={(event) => setRuleAction(event.target.value as 'hide' | 'show' | 'text')} className={inputCls}>
                        <option value="hide">إخفاء</option>
                        <option value="show">إظهار</option>
                        <option value="text">استبدال النص</option>
                      </select>
                    </Field>
                  </>
                ) : (
                  <Field label="النص الأصلي">
                    <input value={ruleMatch} onChange={(event) => setRuleMatch(event.target.value)} placeholder="مثال: إجمالي المبيعات" className={inputCls} />
                  </Field>
                )}
                {(ruleKind === 'text' || ruleAction === 'text') && (
                  <Field label="النص البديل" full>
                    <input value={ruleReplacement} onChange={(event) => setRuleReplacement(event.target.value)} placeholder="النص الجديد الذي سيظهر" className={inputCls} />
                  </Field>
                )}
                <Field label="ملاحظة (اختياري)" full>
                  <input value={ruleNote} onChange={(event) => setRuleNote(event.target.value)} placeholder="سبب القاعدة" className={inputCls} />
                </Field>
              </div>
              <button onClick={addRule} disabled={readOnly} className="mt-2 flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-40">
                <Wand2 className="h-4 w-4" /> إضافة القاعدة للمسودة
              </button>

              <div className="mt-4 space-y-1.5">
                {rules.length === 0 && <p className="text-center text-[11px] text-slate-400">لا توجد قواعد بعد.</p>}
                {rules.map((rule) => (
                  <div key={rule.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${rule.kind === 'selector' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' : 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'}`}>
                      {rule.kind === 'selector' ? 'عنصر' : 'نص'}
                    </span>
                    <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-slate-500" dir="ltr">
                      {rule.pagePath} · {rule.kind === 'selector' ? rule.selector : `${rule.matchText} → ${rule.replacementText}`} · {rule.action}
                    </code>
                    <Toggle checked={rule.enabled} disabled={readOnly} onChange={(value) => updateRule(rule.id, { enabled: value })} label={rule.enabled ? 'مفعّلة' : 'معطلة'} />
                    <button onClick={() => removeRule(rule.id)} disabled={readOnly} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40" aria-label="حذف القاعدة">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === 'fields' && (
          <div className="space-y-4">
            <Card title="حقول النماذج المسجّلة" description="تظهر الحقول بعد زيارة النموذج مرة واحدة. يمكن إخفاؤها أو جعلها مطلوبة أو إعادة تسميتها.">
              {registeredFields.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-[11px] text-slate-500 dark:border-slate-700">
                  لم تُسجّل حقول بعد. غلّف الحقل بـ ConfigField أو أضف هدفًا يدويًا بالأسفل.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {registeredFields.map((target) => {
                    const entry = formEntries.get(entryKey('field', target.key));
                    const visible = entry?.enabled ?? true;
                    const required = entry?.required ?? false;
                    return (
                      <div key={target.key} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 sm:grid-cols-[minmax(0,1fr)_11rem_2.5rem_2.5rem]">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{entry?.label || target.label}</div>
                          <code className="text-[9px] text-slate-400" dir="ltr">{target.key}</code>
                        </div>
                        <input value={entry?.label ?? ''} onChange={(event) => upsertEntry('field', target.key, { label: event.target.value })} placeholder="تسمية الحقل" className={inputCls} disabled={readOnly} aria-label={`تسمية ${target.label}`} />
                        <Toggle checked={visible} disabled={readOnly} onChange={(value) => upsertEntry('field', target.key, { enabled: value })} label={visible ? 'ظاهر' : 'مخفي'} />
                        <Toggle checked={required} disabled={readOnly} onChange={(value) => upsertEntry('field', target.key, { required: value })} label={required ? 'مطلوب' : 'اختياري'} />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card title="إضافة هدف حقل يدويًا" description="استخدم معرّف النموذج ومفتاح الحقل كما في الكود.">
              <ManualEntryForm
                domain="field"
                readOnly={readOnly}
                fields={(formEntries.get('__field_form') as any) ?? undefined}
                onAdd={(key) => upsertEntry('field', key, { enabled: true })}
                placeholderKey="sales.invoice#customer"
              />
            </Card>
          </div>
        )}

        {tab === 'texts' && (
          <div className="space-y-4">
            <Card title="نصوص النظام القابلة للتعديل" description="قيم مرتبطة بمكوّن ConfigText وتُحدَّث فورًا في الواجهة.">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {APP_CONFIG_TEXT_CATALOG.map((item) => {
                  const entry = formEntries.get(entryKey('text', item.key));
                  return (
                    <Field key={item.key} label={`${item.label} — ${item.key}`}>
                      <div className="flex gap-2">
                        <input
                          value={entry?.value ?? item.value}
                          onChange={(event) => upsertEntry('text', item.key, { value: event.target.value, label: item.label })}
                          className={inputCls}
                          disabled={readOnly}
                        />
                        {entry && (
                          <button onClick={() => removeEntry('text', item.key)} disabled={readOnly} className="shrink-0 rounded-xl border border-slate-200 px-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300" title="استعادة الافتراضي">
                            افتراضي
                          </button>
                        )}
                      </div>
                    </Field>
                  );
                })}
              </div>
            </Card>

            <Card title="استبدال أي نص ظاهر" description="يطابق النص الموجود في الصفحة حرفيًا ويستبدله. يعمل على كل الصفحات دون تعديل ملفاتها.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="الصفحة">
                  <select value={rulePage} onChange={(event) => setRulePage(event.target.value)} className={inputCls}>
                    <option value="*">كل الصفحات</option>
                    {pageCatalog.map((page) => <option key={page.path} value={page.path}>{page.label} ({page.path})</option>)}
                  </select>
                </Field>
                <Field label="النص الظاهر حاليًا">
                  <input value={ruleMatch} onChange={(event) => setRuleMatch(event.target.value)} placeholder="مثال: المخزون" className={inputCls} />
                </Field>
                <Field label="النص الجديد">
                  <input value={ruleReplacement} onChange={(event) => setRuleReplacement(event.target.value)} placeholder="مثال: المستودع" className={inputCls} />
                </Field>
              </div>
              <button
                onClick={() => {
                  setRuleKind('text');
                  setRuleAction('text');
                  if (!ruleMatch.trim()) {
                    toast.error('اكتب النص الأصلي المراد استبداله.');
                    return;
                  }
                  const rule: AppConfigRule = {
                    id: newRuleId(), kind: 'text', pagePath: normalizePagePath(rulePage),
                    matchText: ruleMatch, replacementText: ruleReplacement, action: 'text', enabled: true,
                  };
                  setRules((current) => [...current, rule]);
                  setDirty(true);
                  setRuleMatch('');
                  setRuleReplacement('');
                  toast.success('أُضيفت قاعدة النص إلى المسودة.');
                }}
                disabled={readOnly}
                className="mt-2 flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-40"
              >
                <Type className="h-4 w-4" /> إضافة قاعدة نص
              </button>
            </Card>
          </div>
        )}

        {tab === 'policies' && (
          <div className="space-y-4">
            <Card title="السياسات المركزية" description="تتجاوز قيم الإعدادات العامة عند قراءتها من الخدمات. اتركها فارغة لاستخدام إعدادات النظام.">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {APP_CONFIG_POLICY_CATALOG.map((policy) => (
                  <Field key={policy.key} label={`${policy.label} (${policy.key})`}>
                    {policy.type === 'boolean' ? (
                      <select
                        value={policyValue(policy.key)}
                        onChange={(event) => upsertEntry('policy', policy.key, { value: event.target.value, label: policy.label, props: { type: policy.type } })}
                        className={inputCls}
                        disabled={readOnly}
                      >
                        <option value="">استخدام إعدادات النظام</option>
                        <option value="1">نعم</option>
                        <option value="0">لا</option>
                      </select>
                    ) : (
                      <input
                        type={policy.type === 'number' ? 'number' : 'text'}
                        value={policyValue(policy.key)}
                        onChange={(event) => upsertEntry('policy', policy.key, { value: event.target.value, label: policy.label, props: { type: policy.type } })}
                        placeholder={policy.fallback || 'استخدام إعدادات النظام'}
                        className={inputCls}
                        disabled={readOnly}
                      />
                    )}
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{policy.description}</p>
                  </Field>
                ))}
              </div>
            </Card>

            <Card title="ترقيم المستندات" description="قوالب الترقيم تُطبَّق على كل مستندات النظام عبر nextNumber.">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {APP_CONFIG_NUMBERING_CATALOG.map((item) => {
                  const props = numberingProps(item.key);
                  const template = typeof props.template === 'string' ? props.template : DEFAULT_NUMBER_TEMPLATE;
                  return (
                    <Field key={item.key} label={`${item.label} (${item.key})`}>
                      <div className="flex gap-2">
                        <input
                          value={template}
                          onChange={(event) => upsertEntry('numbering', item.key, { label: item.label, props: { ...props, template: event.target.value } })}
                          dir="ltr"
                          className={`${inputCls} font-mono`}
                          disabled={readOnly}
                          aria-label={`قالب ترقيم ${item.label}`}
                        />
                        <button onClick={() => removeEntry('numbering', item.key)} disabled={readOnly} className="shrink-0 rounded-xl border border-slate-200 px-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300" title="القالب الافتراضي">
                          افتراضي
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400" dir="ltr">المتاح: {'{prefix}'} {'{year}'} {'{month}'} {'{day}'} {'{seq:6}'}</p>
                    </Field>
                  );
                })}
              </div>
            </Card>

            <Card title="قوالب الطباعة" description="نصوص/قوالب قابلة للقراءة من PrintService ومكوّنات الطباعة عبر AppConfigService.getPrintTemplate.">
              <div className="space-y-3">
                {APP_CONFIG_PRINT_CATALOG.map((item) => (
                  <Field key={item.key} label={`${item.label} (${item.key})`}>
                    <textarea
                      value={printValue(item.key)}
                      onChange={(event) => upsertEntry('print', item.key, { value: event.target.value, label: item.label })}
                      rows={3}
                      placeholder="اتركه فارغًا لاستخدام القالب الافتراضي"
                      className={`${inputCls} font-mono`}
                      disabled={readOnly}
                    />
                  </Field>
                ))}
              </div>
            </Card>

            <Card title="الوحدات والميزات" description="تعطيل الوحدة يخفي صفحاتها ويمنع عملياتها مع الاحتفاظ ببياناتها.">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {moduleState.map((module) => (
                  <div key={module.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{module.label}</div>
                      <div className="text-[10px] text-slate-400">{module.enabled ? 'مفعّلة' : 'معطّلة'}{module.available ? '' : ' · غير متاحة'}</div>
                    </div>
                    <Toggle checked={module.enabled} disabled={readOnly || !module.available} onChange={() => toggleModule(module.id)} label={module.enabled ? 'مفعّلة' : 'معطّلة'} />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === 'history' && canViewHistory && (
          <Card title="سجل إصدارات التكوين" description="كل حفظ يُنشئ إصدارًا قابلًا للاستعادة. الاستعادة تُنشئ إصدارًا جديدًا ولا تمحو السجل.">
            {versionsError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{versionsError}</p>}
            <div className="space-y-1.5">
              {versions.map((version) => (
                <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100">الإصدار {version.version} · {version.reason}</div>
                    <div className="text-[10px] text-slate-400">{version.createdByName} · {version.createdAt} · {version.snapshot.entries.length} هدف · {version.snapshot.rules.length} قاعدة</div>
                  </div>
                  <button onClick={() => restoreVersion(version)} disabled={readOnly} className="flex items-center gap-1.5 rounded-lg border border-sky-200 px-2.5 py-1.5 text-[10px] font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-40 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40">
                    <Redo2 className="h-3.5 w-3.5" /> استعادة
                  </button>
                </div>
              ))}
              {versions.length === 0 && !versionsError && <p className="py-6 text-center text-xs text-slate-400">لا توجد إصدارات محفوظة بعد.</p>}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

const ManualEntryForm: React.FC<{
  domain: AppConfigDomain;
  readOnly: boolean;
  placeholderKey: string;
  fields?: unknown;
  onAdd: (key: string) => void;
}> = ({ readOnly, placeholderKey, onAdd }) => {
  const [key, setKey] = useState('');
  return (
    <div className="flex flex-wrap gap-2">
      <input
        value={key}
        onChange={(event) => setKey(event.target.value)}
        placeholder={placeholderKey}
        dir="ltr"
        className={`${inputCls} max-w-md font-mono`}
        aria-label="مفتاح الهدف"
      />
      <button
        type="button"
        disabled={readOnly || !key.trim()}
        onClick={() => {
          onAdd(key.trim());
          setKey('');
        }}
        className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-40"
      >
        <Check className="h-4 w-4" /> إضافة
      </button>
    </div>
  );
};

export default AppConfigurationPage;
