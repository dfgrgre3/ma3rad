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
  { id: 'overview', label: 'Ù†Ø¸Ø±Ø© Ø¹Ø§Ù…Ø©', icon: Sparkles },
  { id: 'pages', label: 'Ø§Ù„ØµÙØ­Ø§Øª', icon: LayoutList },
  { id: 'sections', label: 'Ø§Ù„Ø£Ù‚Ø³Ø§Ù…', icon: Boxes },
  { id: 'fields', label: 'Ø§Ù„Ø­Ù‚ÙˆÙ„', icon: SlidersHorizontal },
  { id: 'texts', label: 'Ø§Ù„Ù†ØµÙˆØµ', icon: Type },
  { id: 'policies', label: 'Ø§Ù„Ø³ÙŠØ§Ø³Ø§Øª ÙˆØ§Ù„ØªØ±Ù‚ÙŠÙ…', icon: Settings2 },
  { id: 'history', label: 'Ø§Ù„Ø³Ø¬Ù„ ÙˆØ§Ù„Ø¥ØµØ¯Ø§Ø±Ø§Øª', icon: History },
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
    {label ?? (checked ? 'Ø¸Ø§Ù‡Ø±' : 'Ù…Ø®ÙÙŠ')}
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
      const label = nav || (path === '/' ? 'Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©' : path.replace(/^\//, '').replace(/[/-]/g, ' '));
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
      if (ruleKind === 'selector' && !rule.selector) throw new Error('Ø§ÙƒØªØ¨ Ù…Ø­Ø¯Ø¯ Ø§Ù„Ø¹Ù†ØµØ± (CSS selector).');
      if (ruleKind === 'text' && !rule.matchText?.trim()) throw new Error('Ø§ÙƒØªØ¨ Ø§Ù„Ù†Øµ Ø§Ù„Ø£ØµÙ„ÙŠ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨ Ø§Ø³ØªØ¨Ø¯Ø§Ù„Ù‡.');
      setRules((current) => [...current, rule]);
      setDirty(true);
      setRuleSelector('');
      setRuleMatch('');
      setRuleReplacement('');
      setRuleNote('');
      toast.success('ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø³ÙˆØ¯Ø©. Ø§Ø¶ØºØ· Â«Ø­ÙØ¸Â» Ù„ØªØ·Ø¨ÙŠÙ‚Ù‡Ø§.');
    } catch (error) {
      toast.error('ØªØ¹Ø°Ø± Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©', error instanceof Error ? error.message : String(error));
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
      AppConfigService.saveConfig({ entries, rules }, 'ØªØ­Ø¯ÙŠØ« Ù…Ù† Ù…Ø­Ø±Ùƒ Ø§Ù„ØªÙƒÙˆÙŠÙ† Ø§Ù„Ø¯ÙŠÙ†Ø§Ù…ÙŠÙƒÙŠ', AuthService.getCurrentUser());
      setDirty(false);
      toast.success('ØªÙ… Ø­ÙØ¸ Ø§Ù„ØªÙƒÙˆÙŠÙ† ÙˆØªØ·Ø¨ÙŠÙ‚Ù‡ Ø¹Ù„Ù‰ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø©.');
    } catch (error) {
      toast.error('ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„ØªÙƒÙˆÙŠÙ†', error instanceof Error ? error.message : String(error));
    }
  };

  const resetDraft = () => {
    syncFromState(AppConfigService.getState());
    setDirty(false);
  };

  const resetAll = () => {
    if (!window.confirm('Ø¥Ø¹Ø§Ø¯Ø© Ø¶Ø¨Ø· ÙƒÙ„ ØªÙƒÙˆÙŠÙ† Ø§Ù„ÙˆØ§Ø¬Ù‡Ø©ØŸ Ø³ØªØ¹ÙˆØ¯ Ø§Ù„ØµÙØ­Ø§Øª ÙˆØ§Ù„Ø£Ù‚Ø³Ø§Ù… ÙˆØ§Ù„Ù†ØµÙˆØµ Ø¥Ù„Ù‰ Ø­Ø§Ù„ØªÙ‡Ø§ Ø§Ù„Ø£ØµÙ„ÙŠØ©ØŒ ÙˆÙ„Ù† ØªÙØ­Ø°Ù Ø£ÙŠ Ø¨ÙŠØ§Ù†Ø§Øª Ø£Ø¹Ù…Ø§Ù„.')) return;
    try {
      AppConfigService.reset(AuthService.getCurrentUser());
      setDirty(false);
      toast.success('ØªÙ…Øª Ø¥Ø¹Ø§Ø¯Ø© Ø¶Ø¨Ø· Ù…Ø­Ø±Ùƒ Ø§Ù„ØªÙƒÙˆÙŠÙ†.');
    } catch (error) {
      toast.error('ØªØ¹Ø°Ø±Øª Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¶Ø¨Ø·', error instanceof Error ? error.message : String(error));
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
        toast.success('ØªÙ… ØªØµØ¯ÙŠØ± Ø§Ù„ØªÙƒÙˆÙŠÙ† ÙˆÙ†Ø³Ø®Ù‡ Ø¥Ù„Ù‰ Ø§Ù„Ø­Ø§ÙØ¸Ø©.');
      } catch {
        toast.success('ØªÙ… ØªØµØ¯ÙŠØ± Ù…Ù„Ù Ø§Ù„ØªÙƒÙˆÙŠÙ†.');
      }
    } catch (error) {
      toast.error('ØªØ¹Ø°Ø± ØªØµØ¯ÙŠØ± Ø§Ù„ØªÙƒÙˆÙŠÙ†', error instanceof Error ? error.message : String(error));
    }
  };

  const importConfig = (raw: string) => {
    if (!raw.trim()) {
      toast.error('Ø£Ù„ØµÙ‚ Ù…Ø­ØªÙˆÙ‰ Ù…Ù„Ù Ø§Ù„ØªÙƒÙˆÙŠÙ† Ø£ÙˆÙ„Ù‹Ø§.');
      return;
    }
    if (!window.confirm('Ø§Ø³ØªÙŠØ±Ø§Ø¯ Ø§Ù„ØªÙƒÙˆÙŠÙ† Ø³ÙŠØ³ØªØ¨Ø¯Ù„ ÙƒÙ„ Ø§Ù„Ø£Ù‡Ø¯Ø§Ù ÙˆØ§Ù„Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„Ø­Ø§Ù„ÙŠØ©. Ù‡Ù„ ØªØ±ÙŠØ¯ Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø©ØŸ')) return;
    try {
      AppConfigService.importJson(raw, AuthService.getCurrentUser());
      setImportText('');
      setDirty(false);
      toast.success('ØªÙ… Ø§Ø³ØªÙŠØ±Ø§Ø¯ Ø§Ù„ØªÙƒÙˆÙŠÙ† Ø¨Ù†Ø¬Ø§Ø­.');
    } catch (error) {
      toast.error('ØªØ¹Ø°Ø± Ø§Ø³ØªÙŠØ±Ø§Ø¯ Ø§Ù„ØªÙƒÙˆÙŠÙ†', error instanceof Error ? error.message : String(error));
    }
  };

  const restoreVersion = (version: AppConfigVersion) => {
    if (!window.confirm(`Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ø¥ØµØ¯Ø§Ø± ${version.version}ØŸ Ø³ÙŠÙÙ†Ø´Ø£ Ø¥ØµØ¯Ø§Ø± Ø¬Ø¯ÙŠØ¯ Ù…Ø·Ø§Ø¨Ù‚ Ù„Ù‡.`)) return;
    try {
      AppConfigService.restoreVersion(version.id, AuthService.getCurrentUser());
      setDirty(false);
      toast.success(`ØªÙ…Øª Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ø¥ØµØ¯Ø§Ø± ${version.version}.`);
    } catch (error) {
      toast.error('ØªØ¹Ø°Ø±Øª Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ø¥ØµØ¯Ø§Ø±', error instanceof Error ? error.message : String(error));
    }
  };

  const toggleModule = (moduleId: string) => {
    try {
      const actor = AuthService.getCurrentUser();
      const enabled = ModuleRegistryService.isModuleEnabled(moduleId);
      if (enabled) ModuleRegistryService.deactivate(moduleId, actor, 'Ù…Ù† Ù…Ø­Ø±Ùƒ Ø§Ù„ØªÙƒÙˆÙŠÙ†');
      else ModuleRegistryService.activate(moduleId, actor, 'Ù…Ù† Ù…Ø­Ø±Ùƒ Ø§Ù„ØªÙƒÙˆÙŠÙ†');
      setModuleState(ModuleRegistryService.getModuleState());
      toast.success(enabled ? 'ØªÙ… ØªØ¹Ø·ÙŠÙ„ Ø§Ù„ÙˆØ­Ø¯Ø© ÙˆØ¥Ø®ÙØ§Ø¡ ØµÙØ­Ø§ØªÙ‡Ø§.' : 'ØªÙ… ØªÙØ¹ÙŠÙ„ Ø§Ù„ÙˆØ­Ø¯Ø©.');
    } catch (error) {
      toast.error('ØªØ¹Ø°Ø± ØªØºÙŠÙŠØ± Ø­Ø§Ù„Ø© Ø§Ù„ÙˆØ­Ø¯Ø©', error instanceof Error ? error.message : String(error));
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
      <div className="w-full space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-500 to-sky-600 text-white shadow-lg shadow-violet-500/25">
              <Wand2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">Ù…Ø­Ø±Ùƒ Ø§Ù„ØªÙƒÙˆÙŠÙ† Ø§Ù„Ø¯ÙŠÙ†Ø§Ù…ÙŠÙƒÙŠ</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ØªØ­ÙƒÙ… ÙÙŠ Ø§Ù„ØµÙØ­Ø§Øª ÙˆØ§Ù„Ø£Ù‚Ø³Ø§Ù… ÙˆØ§Ù„Ø­Ù‚ÙˆÙ„ ÙˆØ§Ù„Ù†ØµÙˆØµ ÙˆØ§Ù„Ø³ÙŠØ§Ø³Ø§Øª ÙˆØ§Ù„ØªØ±Ù‚ÙŠÙ… ÙˆÙ‚ÙˆØ§Ù„Ø¨ Ø§Ù„Ø·Ø¨Ø§Ø¹Ø© Ø¯ÙˆÙ† ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„ÙƒÙˆØ¯.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={resetDraft} disabled={!dirty} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">
              <RotateCcw className="h-3.5 w-3.5" /> ØªØ±Ø§Ø¬Ø¹
            </button>
            <button onClick={save} disabled={readOnly || !dirty} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
              <Save className="h-4 w-4" /> Ø­ÙØ¸ ÙˆØªØ·Ø¨ÙŠÙ‚
            </button>
          </div>
        </header>

        {readOnly && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <ShieldCheck className="ml-1 inline h-3.5 w-3.5" /> ÙˆØ¶Ø¹ Ø§Ù„Ù‚Ø±Ø§Ø¡Ø© ÙÙ‚Ø·: ØªØ­ØªØ§Ø¬ ØµÙ„Ø§Ø­ÙŠØ© settings.update Ù„Ù„Ø­ÙØ¸.
          </p>
        )}

        <nav className="flex flex-wrap gap-2" aria-label="Ø£Ù‚Ø³Ø§Ù… Ù…Ø­Ø±Ùƒ Ø§Ù„ØªÙƒÙˆÙŠÙ†">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                ['Ø£Ù‡Ø¯Ø§Ù Ù…ÙƒÙˆÙ‘Ù†Ø©', stats.entries],
                ['Ù‚ÙˆØ§Ø¹Ø¯ DOM', stats.rules],
                ['ØµÙØ­Ø§Øª Ù…Ø®ÙÙŠØ©', stats.pagesHidden],
                ['Ø£Ù‚Ø³Ø§Ù… Ù…Ø®ÙÙŠØ©', stats.sectionsHidden],
                ['Ø­Ù‚ÙˆÙ„ Ù…Ø®ÙÙŠØ©', stats.fieldsHidden],
                ['Ù†ØµÙˆØµ Ù…Ø®ØµØµØ©', stats.textOverrides],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</div>
                  <div className="mt-1 font-mono text-xl font-black text-slate-900 dark:text-slate-100">{value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="ÙƒÙŠÙ ÙŠØ¹Ù…Ù„ Ø§Ù„Ù…Ø­Ø±ÙƒØŸ" description="ÙƒÙ„ ØªØ¹Ø¯ÙŠÙ„ ÙŠÙØ­ÙØ¸ ÙƒØ¥ØµØ¯Ø§Ø± Ù‚Ø§Ø¨Ù„ Ù„Ù„Ø§Ø³ØªØ¹Ø§Ø¯Ø©ØŒ ÙˆÙŠÙØ·Ø¨Ù‘Ù‚ ÙÙˆØ±Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø©.">
                <ul className="space-y-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                  <li><strong>Ø§Ù„ØµÙØ­Ø§Øª:</strong> Ø¥Ø®ÙØ§Ø¡ Ø§Ù„ØµÙØ­Ø© ÙŠØ®ÙÙŠ Ø±Ø§Ø¨Ø·Ù‡Ø§ ÙˆÙŠÙ…Ù†Ø¹ ÙØªØ­ Ù…Ø³Ø§Ø±Ù‡Ø§.</li>
                  <li><strong>Ø§Ù„Ø£Ù‚Ø³Ø§Ù…:</strong> Ø£Ø®ÙÙ Ø£ÙŠ Ù‚Ø³Ù… Ø¹Ø¨Ø± Ù…Ø­Ø¯Ø¯ CSS Ø£Ùˆ Ø¹Ø¨Ø± ØªØºÙ„ÙŠÙÙ‡ Ø¨Ù€ ConfigSection.</li>
                  <li><strong>Ø§Ù„Ø­Ù‚ÙˆÙ„:</strong> Ø¥Ø®ÙØ§Ø¡ Ø£Ùˆ Ø¥Ù„Ø²Ø§Ù… Ø£Ùˆ Ø¥Ø¹Ø§Ø¯Ø© ØªØ³Ù…ÙŠØ© Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù†Ù…Ø§Ø°Ø¬.</li>
                  <li><strong>Ø§Ù„Ù†ØµÙˆØµ:</strong> Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø£ÙŠ Ù†Øµ Ø¸Ø§Ù‡Ø± Ø­Ø±ÙÙŠÙ‹Ø§ ÙÙŠ Ø£ÙŠ ØµÙØ­Ø©.</li>
                  <li><strong>Ø§Ù„Ø³ÙŠØ§Ø³Ø§Øª ÙˆØ§Ù„ØªØ±Ù‚ÙŠÙ…:</strong> ØªØ¬Ø§ÙˆØ²Ø§Øª Ù…Ø±ÙƒØ²ÙŠØ© ØªÙÙ‚Ø±Ø£ Ù…Ù† Ø§Ù„Ø®Ø¯Ù…Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ©.</li>
                </ul>
              </Card>
              <Card title="Ù†Ø³Ø® Ø§Ø­ØªÙŠØ§Ø·ÙŠ Ù„Ù„ØªÙƒÙˆÙŠÙ†">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void exportConfig()} className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700">
                    <ArrowDownToLine className="h-4 w-4" /> ØªØµØ¯ÙŠØ± JSON
                  </button>
                  <button onClick={resetAll} disabled={readOnly} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-500/30 dark:hover:bg-rose-950/30">
                    <RotateCcw className="h-4 w-4" /> Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¶Ø¨Ø· Ø§Ù„ÙƒØ§Ù…Ù„
                  </button>
                </div>
                <label className="mt-3 block text-[11px] font-bold text-slate-600 dark:text-slate-300">Ø§Ø³ØªÙŠØ±Ø§Ø¯ ØªÙƒÙˆÙŠÙ† (JSON)</label>
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
                    <ArrowUpFromLine className="h-4 w-4" /> Ø§Ø³ØªÙŠØ±Ø§Ø¯
                  </button>
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <FileText className="h-4 w-4" /> Ù…Ù† Ù…Ù„Ù
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
            title="Ø§Ù„ØµÙØ­Ø§Øª ÙˆØ§Ù„ØªÙ†Ù‚Ù„"
            description="Ø£Ø®ÙÙ ØµÙØ­Ø© ÙƒØ§Ù…Ù„Ø© Ø£Ùˆ ØºÙŠÙ‘Ø± Ø§Ø³Ù…Ù‡Ø§ Ø£Ùˆ ØªØ±ØªÙŠØ¨Ù‡Ø§. Ø§Ù„Ø¥Ø®ÙØ§Ø¡ Ù„Ø§ ÙŠØ­Ø°Ù Ø§Ù„Ø¨ÙŠØ§Ù†Ø§ØªØŒ ÙˆÙŠÙ…Ù†Ø¹ ÙØªØ­ Ø§Ù„Ù…Ø³Ø§Ø± Ø£ÙŠØ¶Ù‹Ø§."
            actions={
              <div className="relative w-64">
                <Search className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  value={pageSearch}
                  onChange={(event) => setPageSearch(event.target.value)}
                  placeholder="Ø§Ø¨Ø­Ø« ÙÙŠ Ø§Ù„ØµÙØ­Ø§Øª..."
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
                      placeholder="Ø§Ù„ØªØ³Ù…ÙŠØ© Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ©"
                      aria-label={`ØªØ³Ù…ÙŠØ© ${page.label}`}
                      className={inputCls}
                      disabled={readOnly}
                    />
                    <input
                      type="number"
                      value={entry?.order ?? ''}
                      onChange={(event) => upsertEntry('page', page.path, { order: event.target.value === '' ? undefined : Number(event.target.value) })}
                      placeholder="Ø§Ù„ØªØ±ØªÙŠØ¨"
                      aria-label={`ØªØ±ØªÙŠØ¨ ${page.label}`}
                      className={inputCls}
                      disabled={readOnly}
                    />
                    <div className="flex items-center justify-end gap-1">
                      <Toggle
                        checked={enabled}
                        disabled={readOnly}
                        onChange={(value) => upsertEntry('page', page.path, { enabled: value })}
                        label={enabled ? 'Ø¸Ø§Ù‡Ø±Ø©' : 'Ù…Ø®ÙÙŠØ©'}
                      />
                    </div>
                  </div>
                );
              })}
              {filteredPages.length === 0 && (
                <p className="rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-700">Ù„Ø§ ØªÙˆØ¬Ø¯ ØµÙØ­Ø§Øª ØªØ·Ø§Ø¨Ù‚ Ø§Ù„Ø¨Ø­Ø«.</p>
              )}
            </div>
          </Card>
        )}

        {tab === 'sections' && (
          <div className="space-y-4">
            <Card title="Ø£Ù‚Ø³Ø§Ù… Ù…ÙØ¹Ø±Ù‘ÙØ© ÙÙŠ Ø§Ù„ÙƒÙˆØ¯" description="ØªØ¸Ù‡Ø± Ø§Ù„Ø£Ù‚Ø³Ø§Ù… Ù‡Ù†Ø§ Ø¨Ø¹Ø¯ Ø²ÙŠØ§Ø±Ø© ØµÙØ­ØªÙ‡Ø§ Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø©. ÙŠÙ…ÙƒÙ† Ø¥Ø®ÙØ§Ø¤Ù‡Ø§ Ø£Ùˆ Ø¥Ø¹Ø§Ø¯Ø© ØªØ³Ù…ÙŠØªÙ‡Ø§.">
              <div className="space-y-1.5">
                {registeredSections.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-[11px] text-slate-500 dark:border-slate-700">
                    Ù„Ù… ØªÙØ³Ø¬Ù‘Ù„ Ø£Ù‚Ø³Ø§Ù… Ø¨Ø¹Ø¯. Ø§ÙØªØ­ ØµÙØ­Ø© ØªØ­ØªÙˆÙŠ Ø¹Ù„Ù‰ ConfigSection Ø«Ù… Ø¹Ø¯ Ø¥Ù„Ù‰ Ù‡Ù†Ø§ØŒ Ø£Ùˆ Ø§Ø³ØªØ®Ø¯Ù… Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø¯Ø¯ Ø¨Ø§Ù„Ø£Ø³ÙÙ„.
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
                        placeholder="ØªØ³Ù…ÙŠØ© Ø§Ù„Ù‚Ø³Ù…"
                        aria-label={`ØªØ³Ù…ÙŠØ© ${target.label}`}
                        className={inputCls}
                        disabled={readOnly}
                      />
                      <Toggle checked={enabled} disabled={readOnly} onChange={(value) => upsertEntry('section', target.key, { enabled: value })} label={enabled ? 'Ø¸Ø§Ù‡Ø±' : 'Ù…Ø®ÙÙŠ'} />
                      <button onClick={() => removeEntry('section', target.key)} disabled={readOnly} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40" title="Ù…Ø³Ø­ Ø§Ù„ØªØ®ØµÙŠØµ" aria-label="Ù…Ø³Ø­ Ø§Ù„ØªØ®ØµÙŠØµ">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø¯Ø¯ ÙˆØ§Ù„Ù†ØµÙˆØµ" description="ØªØ­ÙƒÙ… ÙÙŠ Ø£ÙŠ Ø¹Ù†ØµØ± ÙÙŠ Ø£ÙŠ ØµÙØ­Ø© Ø¯ÙˆÙ† ØªØ¹Ø¯ÙŠÙ„ Ù…Ù„ÙØ§ØªÙ‡Ø§: Ø£Ø®ÙÙ Ù‚Ø³Ù…Ù‹Ø§ØŒ Ø£Ø¸Ù‡Ø±Ù‡ØŒ Ø£Ùˆ Ø§Ø³ØªØ¨Ø¯Ù„ Ù†ØµÙ‡.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Ù†ÙˆØ¹ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©">
                  <select value={ruleKind} onChange={(event) => setRuleKind(event.target.value as 'selector' | 'text')} className={inputCls}>
                    <option value="selector">Ø¹Ù†ØµØ± Ø¹Ø¨Ø± Ù…Ø­Ø¯Ø¯ CSS</option>
                    <option value="text">Ù†Øµ Ø¸Ø§Ù‡Ø± Ø­Ø±ÙÙŠ</option>
                  </select>
                </Field>
                <Field label="Ø§Ù„ØµÙØ­Ø©">
                  <select value={rulePage} onChange={(event) => setRulePage(event.target.value)} className={inputCls}>
                    <option value="*">ÙƒÙ„ Ø§Ù„ØµÙØ­Ø§Øª</option>
                    {pageCatalog.map((page) => <option key={page.path} value={page.path}>{page.label} ({page.path})</option>)}
                  </select>
                </Field>
                {ruleKind === 'selector' ? (
                  <>
                    <Field label="Ù…Ø­Ø¯Ø¯ Ø§Ù„Ø¹Ù†ØµØ± (CSS)">
                      <input value={ruleSelector} onChange={(event) => setRuleSelector(event.target.value)} placeholder="#sec-pulse Ø£Ùˆ .some-class" dir="ltr" className={`${inputCls} font-mono`} />
                    </Field>
                    <Field label="Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡">
                      <select value={ruleAction} onChange={(event) => setRuleAction(event.target.value as 'hide' | 'show' | 'text')} className={inputCls}>
                        <option value="hide">Ø¥Ø®ÙØ§Ø¡</option>
                        <option value="show">Ø¥Ø¸Ù‡Ø§Ø±</option>
                        <option value="text">Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ù†Øµ</option>
                      </select>
                    </Field>
                  </>
                ) : (
                  <Field label="Ø§Ù„Ù†Øµ Ø§Ù„Ø£ØµÙ„ÙŠ">
                    <input value={ruleMatch} onChange={(event) => setRuleMatch(event.target.value)} placeholder="Ù…Ø«Ø§Ù„: Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª" className={inputCls} />
                  </Field>
                )}
                {(ruleKind === 'text' || ruleAction === 'text') && (
                  <Field label="Ø§Ù„Ù†Øµ Ø§Ù„Ø¨Ø¯ÙŠÙ„" full>
                    <input value={ruleReplacement} onChange={(event) => setRuleReplacement(event.target.value)} placeholder="Ø§Ù„Ù†Øµ Ø§Ù„Ø¬Ø¯ÙŠØ¯ Ø§Ù„Ø°ÙŠ Ø³ÙŠØ¸Ù‡Ø±" className={inputCls} />
                  </Field>
                )}
                <Field label="Ù…Ù„Ø§Ø­Ø¸Ø© (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)" full>
                  <input value={ruleNote} onChange={(event) => setRuleNote(event.target.value)} placeholder="Ø³Ø¨Ø¨ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©" className={inputCls} />
                </Field>
              </div>
              <button onClick={addRule} disabled={readOnly} className="mt-2 flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-40">
                <Wand2 className="h-4 w-4" /> Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© Ù„Ù„Ù…Ø³ÙˆØ¯Ø©
              </button>

              <div className="mt-4 space-y-1.5">
                {rules.length === 0 && <p className="text-center text-[11px] text-slate-400">Ù„Ø§ ØªÙˆØ¬Ø¯ Ù‚ÙˆØ§Ø¹Ø¯ Ø¨Ø¹Ø¯.</p>}
                {rules.map((rule) => (
                  <div key={rule.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${rule.kind === 'selector' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' : 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'}`}>
                      {rule.kind === 'selector' ? 'Ø¹Ù†ØµØ±' : 'Ù†Øµ'}
                    </span>
                    <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-slate-500" dir="ltr">
                      {rule.pagePath} Â· {rule.kind === 'selector' ? rule.selector : `${rule.matchText} â†’ ${rule.replacementText}`} Â· {rule.action}
                    </code>
                    <Toggle checked={rule.enabled} disabled={readOnly} onChange={(value) => updateRule(rule.id, { enabled: value })} label={rule.enabled ? 'Ù…ÙØ¹Ù‘Ù„Ø©' : 'Ù…Ø¹Ø·Ù„Ø©'} />
                    <button onClick={() => removeRule(rule.id)} disabled={readOnly} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40" aria-label="Ø­Ø°Ù Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©">
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
            <Card title="Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù†Ù…Ø§Ø°Ø¬ Ø§Ù„Ù…Ø³Ø¬Ù‘Ù„Ø©" description="ØªØ¸Ù‡Ø± Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø¨Ø¹Ø¯ Ø²ÙŠØ§Ø±Ø© Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø©. ÙŠÙ…ÙƒÙ† Ø¥Ø®ÙØ§Ø¤Ù‡Ø§ Ø£Ùˆ Ø¬Ø¹Ù„Ù‡Ø§ Ù…Ø·Ù„ÙˆØ¨Ø© Ø£Ùˆ Ø¥Ø¹Ø§Ø¯Ø© ØªØ³Ù…ÙŠØªÙ‡Ø§.">
              {registeredFields.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-[11px] text-slate-500 dark:border-slate-700">
                  Ù„Ù… ØªÙØ³Ø¬Ù‘Ù„ Ø­Ù‚ÙˆÙ„ Ø¨Ø¹Ø¯. ØºÙ„Ù‘Ù Ø§Ù„Ø­Ù‚Ù„ Ø¨Ù€ ConfigField Ø£Ùˆ Ø£Ø¶Ù Ù‡Ø¯ÙÙ‹Ø§ ÙŠØ¯ÙˆÙŠÙ‹Ø§ Ø¨Ø§Ù„Ø£Ø³ÙÙ„.
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
                        <input value={entry?.label ?? ''} onChange={(event) => upsertEntry('field', target.key, { label: event.target.value })} placeholder="ØªØ³Ù…ÙŠØ© Ø§Ù„Ø­Ù‚Ù„" className={inputCls} disabled={readOnly} aria-label={`ØªØ³Ù…ÙŠØ© ${target.label}`} />
                        <Toggle checked={visible} disabled={readOnly} onChange={(value) => upsertEntry('field', target.key, { enabled: value })} label={visible ? 'Ø¸Ø§Ù‡Ø±' : 'Ù…Ø®ÙÙŠ'} />
                        <Toggle checked={required} disabled={readOnly} onChange={(value) => upsertEntry('field', target.key, { required: value })} label={required ? 'Ù…Ø·Ù„ÙˆØ¨' : 'Ø§Ø®ØªÙŠØ§Ø±ÙŠ'} />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card title="Ø¥Ø¶Ø§ÙØ© Ù‡Ø¯Ù Ø­Ù‚Ù„ ÙŠØ¯ÙˆÙŠÙ‹Ø§" description="Ø§Ø³ØªØ®Ø¯Ù… Ù…Ø¹Ø±Ù‘Ù Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ ÙˆÙ…ÙØªØ§Ø­ Ø§Ù„Ø­Ù‚Ù„ ÙƒÙ…Ø§ ÙÙŠ Ø§Ù„ÙƒÙˆØ¯.">
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
            <Card title="Ù†ØµÙˆØµ Ø§Ù„Ù†Ø¸Ø§Ù… Ø§Ù„Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„ØªØ¹Ø¯ÙŠÙ„" description="Ù‚ÙŠÙ… Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ù…ÙƒÙˆÙ‘Ù† ConfigText ÙˆØªÙØ­Ø¯ÙŽÙ‘Ø« ÙÙˆØ±Ù‹Ø§ ÙÙŠ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø©.">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {APP_CONFIG_TEXT_CATALOG.map((item) => {
                  const entry = formEntries.get(entryKey('text', item.key));
                  return (
                    <Field key={item.key} label={`${item.label} â€” ${item.key}`}>
                      <div className="flex gap-2">
                        <input
                          value={entry?.value ?? item.value}
                          onChange={(event) => upsertEntry('text', item.key, { value: event.target.value, label: item.label })}
                          className={inputCls}
                          disabled={readOnly}
                        />
                        {entry && (
                          <button onClick={() => removeEntry('text', item.key)} disabled={readOnly} className="shrink-0 rounded-xl border border-slate-200 px-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300" title="Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ">
                            Ø§ÙØªØ±Ø§Ø¶ÙŠ
                          </button>
                        )}
                      </div>
                    </Field>
                  );
                })}
              </div>
            </Card>

            <Card title="Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø£ÙŠ Ù†Øµ Ø¸Ø§Ù‡Ø±" description="ÙŠØ·Ø§Ø¨Ù‚ Ø§Ù„Ù†Øµ Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯ ÙÙŠ Ø§Ù„ØµÙØ­Ø© Ø­Ø±ÙÙŠÙ‹Ø§ ÙˆÙŠØ³ØªØ¨Ø¯Ù„Ù‡. ÙŠØ¹Ù…Ù„ Ø¹Ù„Ù‰ ÙƒÙ„ Ø§Ù„ØµÙØ­Ø§Øª Ø¯ÙˆÙ† ØªØ¹Ø¯ÙŠÙ„ Ù…Ù„ÙØ§ØªÙ‡Ø§.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Ø§Ù„ØµÙØ­Ø©">
                  <select value={rulePage} onChange={(event) => setRulePage(event.target.value)} className={inputCls}>
                    <option value="*">ÙƒÙ„ Ø§Ù„ØµÙØ­Ø§Øª</option>
                    {pageCatalog.map((page) => <option key={page.path} value={page.path}>{page.label} ({page.path})</option>)}
                  </select>
                </Field>
                <Field label="Ø§Ù„Ù†Øµ Ø§Ù„Ø¸Ø§Ù‡Ø± Ø­Ø§Ù„ÙŠÙ‹Ø§">
                  <input value={ruleMatch} onChange={(event) => setRuleMatch(event.target.value)} placeholder="Ù…Ø«Ø§Ù„: Ø§Ù„Ù…Ø®Ø²ÙˆÙ†" className={inputCls} />
                </Field>
                <Field label="Ø§Ù„Ù†Øµ Ø§Ù„Ø¬Ø¯ÙŠØ¯">
                  <input value={ruleReplacement} onChange={(event) => setRuleReplacement(event.target.value)} placeholder="Ù…Ø«Ø§Ù„: Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹" className={inputCls} />
                </Field>
              </div>
              <button
                onClick={() => {
                  setRuleKind('text');
                  setRuleAction('text');
                  if (!ruleMatch.trim()) {
                    toast.error('Ø§ÙƒØªØ¨ Ø§Ù„Ù†Øµ Ø§Ù„Ø£ØµÙ„ÙŠ Ø§Ù„Ù…Ø±Ø§Ø¯ Ø§Ø³ØªØ¨Ø¯Ø§Ù„Ù‡.');
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
                  toast.success('Ø£ÙØ¶ÙŠÙØª Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ù†Øµ Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø³ÙˆØ¯Ø©.');
                }}
                disabled={readOnly}
                className="mt-2 flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-40"
              >
                <Type className="h-4 w-4" /> Ø¥Ø¶Ø§ÙØ© Ù‚Ø§Ø¹Ø¯Ø© Ù†Øµ
              </button>
            </Card>
          </div>
        )}

        {tab === 'policies' && (
          <div className="space-y-4">
            <Card title="Ø§Ù„Ø³ÙŠØ§Ø³Ø§Øª Ø§Ù„Ù…Ø±ÙƒØ²ÙŠØ©" description="ØªØªØ¬Ø§ÙˆØ² Ù‚ÙŠÙ… Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø¹Ø§Ù…Ø© Ø¹Ù†Ø¯ Ù‚Ø±Ø§Ø¡ØªÙ‡Ø§ Ù…Ù† Ø§Ù„Ø®Ø¯Ù…Ø§Øª. Ø§ØªØ±ÙƒÙ‡Ø§ ÙØ§Ø±ØºØ© Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù….">
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
                        <option value="">Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù…</option>
                        <option value="1">Ù†Ø¹Ù…</option>
                        <option value="0">Ù„Ø§</option>
                      </select>
                    ) : (
                      <input
                        type={policy.type === 'number' ? 'number' : 'text'}
                        value={policyValue(policy.key)}
                        onChange={(event) => upsertEntry('policy', policy.key, { value: event.target.value, label: policy.label, props: { type: policy.type } })}
                        placeholder={policy.fallback || 'Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù…'}
                        className={inputCls}
                        disabled={readOnly}
                      />
                    )}
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{policy.description}</p>
                  </Field>
                ))}
              </div>
            </Card>

            <Card title="ØªØ±Ù‚ÙŠÙ… Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª" description="Ù‚ÙˆØ§Ù„Ø¨ Ø§Ù„ØªØ±Ù‚ÙŠÙ… ØªÙØ·Ø¨ÙŽÙ‘Ù‚ Ø¹Ù„Ù‰ ÙƒÙ„ Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„Ù†Ø¸Ø§Ù… Ø¹Ø¨Ø± nextNumber.">
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
                          aria-label={`Ù‚Ø§Ù„Ø¨ ØªØ±Ù‚ÙŠÙ… ${item.label}`}
                        />
                        <button onClick={() => removeEntry('numbering', item.key)} disabled={readOnly} className="shrink-0 rounded-xl border border-slate-200 px-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300" title="Ø§Ù„Ù‚Ø§Ù„Ø¨ Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ">
                          Ø§ÙØªØ±Ø§Ø¶ÙŠ
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400" dir="ltr">Ø§Ù„Ù…ØªØ§Ø­: {'{prefix}'} {'{year}'} {'{month}'} {'{day}'} {'{seq:6}'}</p>
                    </Field>
                  );
                })}
              </div>
            </Card>

            <Card title="Ù‚ÙˆØ§Ù„Ø¨ Ø§Ù„Ø·Ø¨Ø§Ø¹Ø©" description="Ù†ØµÙˆØµ/Ù‚ÙˆØ§Ù„Ø¨ Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„Ù‚Ø±Ø§Ø¡Ø© Ù…Ù† PrintService ÙˆÙ…ÙƒÙˆÙ‘Ù†Ø§Øª Ø§Ù„Ø·Ø¨Ø§Ø¹Ø© Ø¹Ø¨Ø± AppConfigService.getPrintTemplate.">
              <div className="space-y-3">
                {APP_CONFIG_PRINT_CATALOG.map((item) => (
                  <Field key={item.key} label={`${item.label} (${item.key})`}>
                    <textarea
                      value={printValue(item.key)}
                      onChange={(event) => upsertEntry('print', item.key, { value: event.target.value, label: item.label })}
                      rows={3}
                      placeholder="Ø§ØªØ±ÙƒÙ‡ ÙØ§Ø±ØºÙ‹Ø§ Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ù‚Ø§Ù„Ø¨ Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ"
                      className={`${inputCls} font-mono`}
                      disabled={readOnly}
                    />
                  </Field>
                ))}
              </div>
            </Card>

            <Card title="Ø§Ù„ÙˆØ­Ø¯Ø§Øª ÙˆØ§Ù„Ù…ÙŠØ²Ø§Øª" description="ØªØ¹Ø·ÙŠÙ„ Ø§Ù„ÙˆØ­Ø¯Ø© ÙŠØ®ÙÙŠ ØµÙØ­Ø§ØªÙ‡Ø§ ÙˆÙŠÙ…Ù†Ø¹ Ø¹Ù…Ù„ÙŠØ§ØªÙ‡Ø§ Ù…Ø¹ Ø§Ù„Ø§Ø­ØªÙØ§Ø¸ Ø¨Ø¨ÙŠØ§Ù†Ø§ØªÙ‡Ø§.">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {moduleState.map((module) => (
                  <div key={module.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{module.label}</div>
                      <div className="text-[10px] text-slate-400">{module.enabled ? 'Ù…ÙØ¹Ù‘Ù„Ø©' : 'Ù…Ø¹Ø·Ù‘Ù„Ø©'}{module.available ? '' : ' Â· ØºÙŠØ± Ù…ØªØ§Ø­Ø©'}</div>
                    </div>
                    <Toggle checked={module.enabled} disabled={readOnly || !module.available} onChange={() => toggleModule(module.id)} label={module.enabled ? 'Ù…ÙØ¹Ù‘Ù„Ø©' : 'Ù…Ø¹Ø·Ù‘Ù„Ø©'} />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === 'history' && canViewHistory && (
          <Card title="Ø³Ø¬Ù„ Ø¥ØµØ¯Ø§Ø±Ø§Øª Ø§Ù„ØªÙƒÙˆÙŠÙ†" description="ÙƒÙ„ Ø­ÙØ¸ ÙŠÙÙ†Ø´Ø¦ Ø¥ØµØ¯Ø§Ø±Ù‹Ø§ Ù‚Ø§Ø¨Ù„Ù‹Ø§ Ù„Ù„Ø§Ø³ØªØ¹Ø§Ø¯Ø©. Ø§Ù„Ø§Ø³ØªØ¹Ø§Ø¯Ø© ØªÙÙ†Ø´Ø¦ Ø¥ØµØ¯Ø§Ø±Ù‹Ø§ Ø¬Ø¯ÙŠØ¯Ù‹Ø§ ÙˆÙ„Ø§ ØªÙ…Ø­Ùˆ Ø§Ù„Ø³Ø¬Ù„.">
            {versionsError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{versionsError}</p>}
            <div className="space-y-1.5">
              {versions.map((version) => (
                <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Ø§Ù„Ø¥ØµØ¯Ø§Ø± {version.version} Â· {version.reason}</div>
                    <div className="text-[10px] text-slate-400">{version.createdByName} Â· {version.createdAt} Â· {version.snapshot.entries.length} Ù‡Ø¯Ù Â· {version.snapshot.rules.length} Ù‚Ø§Ø¹Ø¯Ø©</div>
                  </div>
                  <button onClick={() => restoreVersion(version)} disabled={readOnly} className="flex items-center gap-1.5 rounded-lg border border-sky-200 px-2.5 py-1.5 text-[10px] font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-40 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40">
                    <Redo2 className="h-3.5 w-3.5" /> Ø§Ø³ØªØ¹Ø§Ø¯Ø©
                  </button>
                </div>
              ))}
              {versions.length === 0 && !versionsError && <p className="py-6 text-center text-xs text-slate-400">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¥ØµØ¯Ø§Ø±Ø§Øª Ù…Ø­ÙÙˆØ¸Ø© Ø¨Ø¹Ø¯.</p>}
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
        aria-label="Ù…ÙØªØ§Ø­ Ø§Ù„Ù‡Ø¯Ù"
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
        <Check className="h-4 w-4" /> Ø¥Ø¶Ø§ÙØ©
      </button>
    </div>
  );
};

export default AppConfigurationPage;
