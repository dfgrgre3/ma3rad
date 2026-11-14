import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Cpu,
  Key,
  ShieldCheck,
  Send,
  Layers,
  FileCode,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  History,
  Activity,
  Play,
  Save,
  Check,
  X,
  FileDiff,
  Download,
  Upload,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type {
  PlatformTenant,
  PlatformConfigTemplate,
  PlatformTenantConfig,
  PlatformTenantConfigVersion,
  PlatformConfigRollout,
  PlatformConfigAck,
  RolloutTargetType,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, formatDateTime, inputClass } from './components/PlatformUI';

type ConfigTab = 'editor' | 'templates' | 'rollout' | 'diff' | 'history' | 'telemetry';

export const PlatformAppConfigurationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ConfigTab>('editor');
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [templates, setTemplates] = useState<PlatformConfigTemplate[]>([]);
  const [rollouts, setRollouts] = useState<PlatformConfigRollout[]>([]);
  const [acks, setAcks] = useState<PlatformConfigAck[]>([]);
  const [versions, setVersions] = useState<PlatformTenantConfigVersion[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Active Tenant Config State
  const [currentConfig, setCurrentConfig] = useState<PlatformTenantConfig | null>(null);
  const [jsonText, setJsonText] = useState<string>('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Rollout modal / creation state
  const [rolloutTitle, setRolloutTitle] = useState<string>('');
  const [rolloutTargetType, setRolloutTargetType] = useState<RolloutTargetType>('ALL');
  const [rolloutCanaryPercent, setRolloutCanaryPercent] = useState<number>(20);
  const [rolloutSuccess, setRolloutSuccess] = useState<boolean>(false);

  // Diff comparison state
  const [diffVersionA, setDiffVersionA] = useState<number>(1);
  const [diffVersionB, setDiffVersionB] = useState<number>(1);

  // Bootstrap data
  const loadBootstrap = useCallback(() => {
    try {
      const tList = platformAdminService.listTenants();
      setTenants(tList);
      if (tList.length > 0 && !selectedTenantId) {
        setSelectedTenantId(tList[0].id);
      }
      const tmplList = platformAdminService.listConfigTemplates();
      setTemplates(tmplList);
      const rList = platformAdminService.listConfigRollouts();
      setRollouts(rList);
    } catch (e) {
      console.error('Failed to load bootstrap config:', e);
    }
  }, [selectedTenantId]);

  // Load tenant configuration
  const loadTenantConfig = useCallback((tenantId: string) => {
    if (!tenantId) return;
    setLoading(true);
    setJsonError(null);
    try {
      const cfg = platformAdminService.getTenantConfig(tenantId);
      setCurrentConfig(cfg);
      setJsonText(JSON.stringify(cfg.configPayload, null, 2));

      const vList = platformAdminService.listTenantConfigVersions(tenantId);
      setVersions(vList);
      if (vList.length >= 2) {
        setDiffVersionA(vList[0].version);
        setDiffVersionB(vList[1].version);
      } else if (vList.length === 1) {
        setDiffVersionA(vList[0].version);
        setDiffVersionB(vList[0].version);
      }

      const ackList = platformAdminService.listConfigAcks(tenantId);
      setAcks(ackList);
    } catch (e) {
      console.error('Failed to load tenant config:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (selectedTenantId) {
      loadTenantConfig(selectedTenantId);
    }
  }, [selectedTenantId, loadTenantConfig]);

  // Handle Save & Sign
  const handleSaveConfig = () => {
    if (!selectedTenantId) return;
    setSaving(true);
    setSavedSuccess(false);
    setJsonError(null);
    try {
      let parsedPayload: Record<string, unknown>;
      try {
        parsedPayload = JSON.parse(jsonText);
      } catch (pe) {
        setJsonError(`خطأ في صياغة JSON: ${(pe as Error).message}`);
        setSaving(false);
        return;
      }

      const updated = platformAdminService.saveTenantConfig({
        tenantId: selectedTenantId,
        configPayload: parsedPayload,
        changeSummary: 'تعديل وتوقيع يدوي عبر محرر التكوين المركزي',
      });

      setCurrentConfig(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      loadTenantConfig(selectedTenantId);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Handle Apply Template
  const handleApplyTemplate = (tmpl: PlatformConfigTemplate) => {
    if (!confirm(`هل تريد تطبيق قالب "${tmpl.name}" على هذا العميل؟ سيتم استبدال التكوين الحالي وإعادة توقيعه.`)) return;
    setJsonText(JSON.stringify(tmpl.configPayload, null, 2));
    setJsonError(null);
  };

  // Handle Rollback
  const handleRollback = (ver: number) => {
    if (!confirm(`هل أنت متأكد من استرجاع التكوين للإصدار #${ver} وتطبيقه فورياً؟`)) return;
    try {
      platformAdminService.rollbackTenantConfig(selectedTenantId, ver);
      loadTenantConfig(selectedTenantId);
      alert(`تم استرجاع الإصدار #${ver} وتوقيعه بنجاح.`);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Handle Create Rollout
  const handleCreateRollout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rolloutTitle) return;
    try {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(jsonText);
      } catch {
        alert('يرجى تصحيح أخطاء JSON أولاً قبل إطلاق النشر.');
        return;
      }

      platformAdminService.createConfigRollout({
        title: rolloutTitle,
        targetType: rolloutTargetType,
        targetFilter:
          rolloutTargetType === 'CANARY_PERCENT'
            ? { percentage: rolloutCanaryPercent }
            : {},
        configSnapshot: payload,
      });

      setRolloutSuccess(true);
      setTimeout(() => setRolloutSuccess(false), 4000);
      setRolloutTitle('');
      loadBootstrap();
      if (selectedTenantId) loadTenantConfig(selectedTenantId);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Diff Calculations
  const diffDisplay = useMemo(() => {
    const vA = versions.find((v) => v.version === diffVersionA);
    const vB = versions.find((v) => v.version === diffVersionB);
    if (!vA || !vB) return null;

    const keysA = Object.keys(vA.configPayload);
    const keysB = Object.keys(vB.configPayload);
    const allKeys = Array.from(new Set([...keysA, ...keysB]));

    return allKeys.map((key) => {
      const valA = vA.configPayload[key];
      const valB = vB.configPayload[key];
      const changed = JSON.stringify(valA) !== JSON.stringify(valB);
      return {
        key,
        valA: valA !== undefined ? JSON.stringify(valA) : '(غير موجود)',
        valB: valB !== undefined ? JSON.stringify(valB) : '(غير موجود)',
        changed,
      };
    });
  }, [versions, diffVersionA, diffVersionB]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <PageHeader
        title="محرك التكوين الديناميكي والنشر المركزي (App Configuration)"
        description="إدارة قوالب التكوين، التوقيع الرقمي المشفر (Ed25519)، النشر التدريجي على العملاء، ومراقبة استلام الأجهزة"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleSaveConfig}
              disabled={saving || loading || !selectedTenantId}
            >
              <Save className="w-4 h-4 ml-2" />
              {saving ? 'جاري التوقيع والحفظ...' : 'توقيع التكوين وحفظه'}
            </Button>
          </div>
        }
      />

      {/* Tenant Selector & Cryptographic Signature Status */}
      <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5 text-emerald-400" />
          <div>
            <label className="text-xs font-semibold text-zinc-300 block mb-1">العميل المستهدف:</label>
            <select
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className={`${inputClass} min-w-[280px]`}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code}) - {t.businessType || 'عام'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {savedSuccess && (
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-800/40">
              <CheckCircle2 className="w-4 h-4" />
              تم توقيع وحفظ التكوين
            </span>
          )}

          <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-zinc-300">
              التوقيع الرقمي: <code className="text-emerald-400 font-mono text-[11px]">{currentConfig?.signature?.substring(0, 16)}...</code>
            </span>
          </div>

          <span className="text-zinc-400">
            الإصدار: <strong className="text-zinc-200">#{currentConfig?.version || 1}</strong>
          </span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-zinc-800 space-x-1 space-x-reverse overflow-x-auto">
        <button
          onClick={() => setActiveTab('editor')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'editor' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileCode className="w-4 h-4" />
          محرر التكوين المركزي (JSON)
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'templates' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          قوالب الأنشطة والخطط
        </button>
        <button
          onClick={() => setActiveTab('rollout')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'rollout' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Send className="w-4 h-4" />
          النشر التدريجي والحملات
        </button>
        <button
          onClick={() => setActiveTab('diff')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'diff' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileDiff className="w-4 h-4" />
          مقارنة النسخ (Diff)
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'history' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <History className="w-4 h-4" />
          سجل الإصدارات والاسترجاع
        </button>
        <button
          onClick={() => setActiveTab('telemetry')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'telemetry' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          تأكيد استلام الأجهزة (ACK)
        </button>
      </div>

      {/* ─── TAB 1: Visual & JSON Editor ──────────────────────────────────────────── */}
      {activeTab === 'editor' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>محرر كود التكوين الديناميكي بصيغة JSON الموقعة مشفراً:</span>
            <span className="text-zinc-500">يتوافق تلقائياً مع محرك التحقق المركزي في CentralLicenseService</span>
          </div>

          {jsonError && (
            <div className="p-3 bg-rose-950/30 border border-rose-800/40 rounded-lg text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{jsonError}</span>
            </div>
          )}

          <div className="relative">
            <textarea
              rows={18}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setJsonError(null);
              }}
              dir="ltr"
              className="w-full bg-zinc-950 text-zinc-100 font-mono text-xs p-4 rounded-xl border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none leading-relaxed"
              placeholder="{ ... }"
            />
          </div>
        </div>
      )}

      {/* ─── TAB 2: Activity & Plan Templates ─────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="text-xs text-zinc-400">
            اختر قالباً لتطبيق حزمة إعدادات كاملة وموحدة لنوع نشاط العميل:
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-zinc-100 text-sm">{tmpl.name}</h4>
                    {tmpl.isDefault && (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                        افتراضي
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 font-mono mt-1">الرمز: {tmpl.code}</div>
                  <pre
                    dir="ltr"
                    className="mt-3 p-2 bg-zinc-950 rounded text-[11px] font-mono text-zinc-400 max-h-32 overflow-y-auto"
                  >
                    {JSON.stringify(tmpl.configPayload, null, 2)}
                  </pre>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => handleApplyTemplate(tmpl)}
                >
                  استيراد هذا القالب إلى المحرر
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 3: Phased Rollouts ───────────────────────────────────────────────── */}
      {activeTab === 'rollout' && (
        <div className="space-y-6">
          {/* Create Rollout Card */}
          <div className="bg-zinc-900/50 p-5 rounded-xl border border-zinc-800 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-400" />
              إطلاق حملة نشر تكوين تدريجي جديدة (Canary / Phased Rollout)
            </h3>

            {rolloutSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/40 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>تم إطلاق حملة النشر وتحديث أجهزة العملاء المستهدفين بنجاح.</span>
              </div>
            )}

            <form onSubmit={handleCreateRollout} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">عنوان الحملة / ملاحظات الإصدار</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: ترقية إعدادات الفاتورة الإلكترونية - دفعة 1"
                  value={rolloutTitle}
                  onChange={(e) => setRolloutTitle(e.target.value)}
                  className={`w-full ${inputClass}`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">شريحة النشر المستهدفة</label>
                  <select
                    value={rolloutTargetType}
                    onChange={(e) => setRolloutTargetType(e.target.value as RolloutTargetType)}
                    className={`w-full ${inputClass}`}
                  >
                    <option value="ALL">كافة عملاء المنصة (100% Rollout)</option>
                    <option value="CANARY_PERCENT">نسبة تدريجية (Canary Testing %)</option>
                    <option value="ACTIVITY">بحسب نوع النشاط التجاري</option>
                    <option value="PLAN">بحسب باقة الاشتراك</option>
                  </select>
                </div>

                {rolloutTargetType === 'CANARY_PERCENT' && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">النسبة المئوية التجريبية (%)</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={rolloutCanaryPercent}
                      onChange={(e) => setRolloutCanaryPercent(Number(e.target.value))}
                      className={`w-full ${inputClass}`}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="primary" type="submit">
                  <Play className="w-3.5 h-3.5 ml-1.5" />
                  بدء النشر الآن
                </Button>
              </div>
            </form>
          </div>

          {/* Past Rollouts Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-zinc-300">سجل حملات النشر التدريجي:</h4>
            <div className="overflow-x-auto bg-zinc-900/40 rounded-lg border border-zinc-800">
              <table className="w-full text-right text-sm">
                <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">عنوان الحملة</th>
                    <th className="py-3 px-4">النوع</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4">العملاء المستهدفين</th>
                    <th className="py-3 px-4">تاريخ الإطلاق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {rollouts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center">
                        <EmptyState title="لا توجد حملات نشر سابقة" />
                      </td>
                    </tr>
                  ) : (
                    rollouts.map((ro) => (
                      <tr key={ro.id} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="py-3 px-4 font-medium text-zinc-200">{ro.title}</td>
                        <td className="py-3 px-4 text-xs font-mono text-zinc-400">{ro.targetType}</td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {ro.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-200 font-semibold">{ro.totalTenants} عميل</td>
                        <td className="py-3 px-4 text-xs text-zinc-400">{formatDateTime(ro.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 4: Version Diff Viewer ───────────────────────────────────────────── */}
      {activeTab === 'diff' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">مقارنة الإصدار:</span>
              <select
                value={diffVersionA}
                onChange={(e) => setDiffVersionA(Number(e.target.value))}
                className={inputClass}
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    إصدار #{v.version}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-zinc-500 font-bold">مقابل</span>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">الإصدار:</span>
              <select
                value={diffVersionB}
                onChange={(e) => setDiffVersionB(Number(e.target.value))}
                className={inputClass}
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    إصدار #{v.version}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto bg-zinc-900/40 rounded-lg border border-zinc-800">
            <table className="w-full text-right text-xs">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800 font-mono">
                <tr>
                  <th className="py-3 px-4">مفتاح التكوين (Key)</th>
                  <th className="py-3 px-4">إصدار #{diffVersionA}</th>
                  <th className="py-3 px-4">إصدار #{diffVersionB}</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {diffDisplay?.map((row) => (
                  <tr
                    key={row.key}
                    className={row.changed ? 'bg-amber-950/20 text-amber-200' : 'text-zinc-300'}
                  >
                    <td className="py-2.5 px-4 font-semibold">{row.key}</td>
                    <td className="py-2.5 px-4 max-w-xs truncate">{row.valA}</td>
                    <td className="py-2.5 px-4 max-w-xs truncate">{row.valB}</td>
                    <td className="py-2.5 px-4 text-center">
                      {row.changed ? (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          مُعدل
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-[10px]">متطابق</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 5: Version History & Rollback ─────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          <div className="text-xs text-zinc-400">
            سجل الإصدارات السابقة مع إمكانية الاسترجاع السريع وإعادة التوقيع بضغطة زر:
          </div>

          {versions.length === 0 ? (
            <EmptyState title="لا توجد إصدارات سابقة مسجلة لتكوين هذا العميل" />
          ) : (
            <div className="space-y-2">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className="bg-zinc-950 p-3.5 rounded-lg border border-zinc-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-zinc-200 flex items-center gap-2">
                      <span>إصدار #{ver.version}</span>
                      {ver.version === currentConfig?.version && (
                        <span className="text-emerald-400 font-normal">(النشط حالياً)</span>
                      )}
                      <span className="text-[10px] text-zinc-500 font-mono">توقيع: {ver.signature?.substring(0, 12)}...</span>
                    </div>
                    <div className="text-zinc-400 text-[11px] mt-0.5">{ver.changeSummary}</div>
                    <div className="text-zinc-500 text-[10px]">{formatDateTime(ver.createdAt)}</div>
                  </div>

                  {ver.version !== currentConfig?.version && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRollback(ver.version)}
                    >
                      <RotateCcw className="w-3.5 h-3.5 ml-1" />
                      استرجاع وتطبيق
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 6: Client & Device Telemetry (ACK) ───────────────────────────────── */}
      {activeTab === 'telemetry' && (
        <div className="space-y-4">
          <div className="text-xs text-zinc-400">
            تأكيدات الاستلام والتطبيق الحية الواردة من أجهزة هذا العميل:
          </div>

          <div className="overflow-x-auto bg-zinc-900/40 rounded-lg border border-zinc-800">
            <table className="w-full text-right text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">معرف الجهاز</th>
                  <th className="py-3 px-4">رقم الإصدار</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">توقيت الاستلام</th>
                  <th className="py-3 px-4">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {acks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center">
                      <EmptyState title="لا توجد تأكيدات استلام مسجلة حتى الآن" />
                    </td>
                  </tr>
                ) : (
                  acks.map((ack) => (
                    <tr key={ack.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-zinc-300">
                        {ack.deviceId ? ack.deviceId.substring(0, 16) + '...' : 'الجهاز الرئيسي'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-zinc-200">#{ack.version}</td>
                      <td className="py-3 px-4">
                        {ack.status === 'APPLIED' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            تم التطبيق
                          </span>
                        )}
                        {ack.status === 'RECEIVED' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            تم الاستلام
                          </span>
                        )}
                        {ack.status === 'FAILED' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            فشل
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-zinc-400">{formatDateTime(ack.acknowledgedAt)}</td>
                      <td className="py-3 px-4 text-xs text-zinc-400">{ack.errorMessage || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformAppConfigurationPage;
