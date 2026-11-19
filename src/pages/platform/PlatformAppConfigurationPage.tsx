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
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource'; 
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
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

import { DataTable } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/Toast';
type ConfigTab = 'editor' | 'templates' | 'rollout' | 'diff' | 'history' | 'telemetry';

export const PlatformAppConfigurationPage: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<ConfigTab>('editor');
  const canManageAppConfig = canPlatform('app-configuration');
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
  const [rolloutTemplateId, setRolloutTemplateId] = useState<string>('');
  const [rolloutSuccess, setRolloutSuccess] = useState<boolean>(false);

  // Diff comparison state
  const [diffVersionA, setDiffVersionA] = useState<number>(1);
  const [diffVersionB, setDiffVersionB] = useState<number>(1);

  // Bootstrap data
  const loadBootstrap = useCallback(async () => {
    const centralState = getCentralDataSourceState();
    try {
      const [tList, tmplList, rList] = await Promise.all([
        centralState.active ? centralPlatformClient.listTenants() : platformAdminService.listTenants(),
        centralState.active ? centralPlatformClient.listConfigTemplates() : platformAdminService.listConfigTemplates(),
        centralState.active ? centralPlatformClient.listConfigRollouts() : platformAdminService.listConfigRollouts(),
      ]);
      setTenants(tList);
      if (tList.length > 0 && !selectedTenantId) {
        setSelectedTenantId(tList[0].id);
      }
      setTemplates(tmplList);
      setRolloutTemplateId((prev) => (tmplList.some((t) => t.id === prev) ? prev : tmplList[0]?.id ?? ''));
      setRollouts(rList);
    } catch (e) {
      console.error('Failed to load bootstrap config:', e);
    }
  }, [selectedTenantId]);

  // Load tenant configuration
  const loadTenantConfig = useCallback(async (tenantId: string) => {
    if (!tenantId) return;
    setLoading(true);
    setJsonError(null);
    const centralState = getCentralDataSourceState();
    try {
      let cfg: any;
      let vList: any[] = [];
      let ackList: any[] = [];

      if (centralState.active) {
        cfg = await centralPlatformClient.getTenantConfig(tenantId);
        vList = await centralPlatformClient.listTenantConfigVersions(tenantId);
        // Acks are per-rollout, not per-tenant in central model
        ackList = [];
      } else {
        cfg = platformAdminService.getTenantConfig(tenantId);
        vList = platformAdminService.listTenantConfigVersions(tenantId);
        ackList = platformAdminService.listConfigAcks(tenantId);
      }

      setCurrentConfig(cfg);
      setJsonText(JSON.stringify(cfg.configPayload || cfg.values || {}, null, 2));
      setVersions(vList);
      if (vList.length >= 2) {
        setDiffVersionA(vList[0].version);
        setDiffVersionB(vList[1].version);
      } else if (vList.length === 1) {
        setDiffVersionA(vList[0].version);
        setDiffVersionB(vList[0].version);
      }
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
  const handleSaveConfig = async () => {
    if (!canManageAppConfig) { toast.warning('لا تملك صلاحية إدارة إعدادات التطبيق'); return; }
    if (!selectedTenantId) return;
    setSaving(true);
    setSavedSuccess(false);
    setJsonError(null);
    const centralState = getCentralDataSourceState();
    try {
      let parsedPayload: Record<string, unknown>;
      try {
        parsedPayload = JSON.parse(jsonText);
      } catch (pe) {
        setJsonError(`خطأ في صياغة JSON: ${(pe as Error).message}`);
        setSaving(false);
        return;
      }

      let updated: any;
      if (centralState.active) {
        updated = await centralPlatformClient.saveTenantConfig(selectedTenantId, {
          configPayload: parsedPayload,
        });
      } else {
        updated = platformAdminService.saveTenantConfig({
          tenantId: selectedTenantId,
          values: parsedPayload,
          changeSummary: 'تعديل وتوقيع يدوي عبر محرر التكوين المركزي',
        });
      }

      setCurrentConfig(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      loadTenantConfig(selectedTenantId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Handle Apply Template
  const handleApplyTemplate = (tmpl: PlatformConfigTemplate) => {
    if (!canManageAppConfig) { toast.warning('لا تملك صلاحية إدارة إعدادات التطبيق'); return; }
    if (!confirm(`هل تريد تطبيق قالب "${tmpl.name}" على هذا العميل؟ سيتم استبدال التكوين الحالي وإعادة توقيعه.`)) return;
    setJsonText(JSON.stringify(tmpl.configPayload, null, 2));
    setJsonError(null);
  };

  // Handle Rollback
  const handleRollback = async (ver: number) => {
    if (!canManageAppConfig) { toast.warning('لا تملك صلاحية إدارة إعدادات التطبيق'); return; }
    if (!confirm(`هل أنت متأكد من استرجاع التكوين للإصدار #${ver} وتطبيقه فورياً؟`)) return;
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active) {
        await centralPlatformClient.rollbackTenantConfig(selectedTenantId, ver);
      } else {
        platformAdminService.rollbackTenantConfig(selectedTenantId, ver);
      }
      loadTenantConfig(selectedTenantId);
      toast.success(`تم استرجاع الإصدار #${ver} وتوقيعه بنجاح.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Handle Create Rollout
  const handleCreateRollout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageAppConfig) { toast.warning('لا تملك صلاحية إدارة إعدادات التطبيق'); return; }
    if (!rolloutTitle || !rolloutTemplateId) return;
    const centralState = getCentralDataSourceState();
    try {
      let created: any;
      if (centralState.active) {
        created = await centralPlatformClient.createConfigRollout({
          templateId: rolloutTemplateId,
          targetTenants: rolloutTargetType === 'SPECIFIC_TENANTS' ? [selectedTenantId] : [],
        });
        await centralPlatformClient.startConfigRollout(created.id);
      } else {
        created = platformAdminService.createConfigRollout({
          templateId: rolloutTemplateId,
          name: rolloutTitle,
          targetType: rolloutTargetType,
          rolloutPercentage: rolloutTargetType === 'CANARY_PERCENT' ? rolloutCanaryPercent : undefined,
        });
        platformAdminService.startConfigRollout(created.id);
      }

      setRolloutSuccess(true);
      setTimeout(() => setRolloutSuccess(false), 4000);
      setRolloutTitle('');
      loadBootstrap();
      if (selectedTenantId) loadTenantConfig(selectedTenantId);
    } catch (err) {
      toast.error((err as Error).message);
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
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="محرك التكوين الديناميكي والنشر المركزي (App Configuration)"
        description="إدارة قوالب التكوين، التوقيع الرقمي المشفر (Ed25519)، النشر التدريجي على العملاء، ومراقبة استلام الأجهزة"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleSaveConfig}
              disabled={saving || loading || !selectedTenantId || !canManageAppConfig}
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
                  disabled={!canManageAppConfig}
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

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">قالب التكوين المراد نشره</label>
                <select
                  value={rolloutTemplateId}
                  onChange={(e) => setRolloutTemplateId(e.target.value)}
                  className={`w-full ${inputClass}`}
                  required
                >
                  {templates.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.name} ({tmpl.code})
                    </option>
                  ))}
                </select>
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
                <Button variant="primary" type="submit" disabled={!canManageAppConfig || !rolloutTemplateId}>
                  <Play className="w-3.5 h-3.5 ml-1.5" />
                  بدء النشر الآن
                </Button>
              </div>
            </form>
          </div>

          {/* Past Rollouts Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-zinc-300">سجل حملات النشر التدريجي:</h4>
            <DataTable
                          ariaLabel="سجل حملات النشر"
                          rows={rollouts}
                          rowKey={(ro) => ro.id}
                          emptyTitle="لا توجد حملات نشر سابقة"
                          columns={[
                            { key: 'title', header: 'عنوان الحملة', render: (ro) => <span className="font-medium text-zinc-200">{ro.title}</span> },
                            { key: 'type', header: 'النوع', render: (ro) => <span className="text-xs font-mono text-zinc-400">{ro.targetType}</span> },
                            { key: 'status', header: 'الحالة', render: (ro) => <span className="px-2.5 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{ro.status}</span> },
                            { key: 'tenants', header: 'العملاء المستهدفين', render: (ro) => <span className="text-zinc-200 font-semibold">{ro.totalTenants} عميل</span> },
                            { key: 'created', header: 'تاريخ الإطلاق', render: (ro) => <span className="text-xs text-zinc-400">{formatDateTime(ro.createdAt)}</span> },
                          ]}
                        />

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

          <DataTable
                      ariaLabel="مقارنة إصدارات التكوين"
                      rows={diffDisplay ?? []}
                      rowKey={(row) => row.key}
                      dense
                      tableClassName="font-mono"
                      rowClassName={(row) => row.changed ? 'bg-amber-950/20 text-amber-200' : 'text-zinc-300'}
                      columns={[
                        { key: 'key', header: 'مفتاح التكوين (Key)', render: (row) => <span className="font-semibold">{row.key}</span> },
                        { key: 'a', header: `إصدار #${diffVersionA}`, render: (row) => <span className="block max-w-xs truncate">{row.valA}</span> },
                        { key: 'b', header: `إصدار #${diffVersionB}`, render: (row) => <span className="block max-w-xs truncate">{row.valB}</span> },
                        {
                          key: 'status', header: 'الحالة', align: 'center',
                          render: (row) => row.changed ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">مُعدل</span>
                          ) : <span className="text-zinc-600 text-[10px]">متطابق</span>,
                        },
                      ]}
                    />

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
                      disabled={!canManageAppConfig}
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

          <DataTable
                      ariaLabel="تأكيدات الأجهزة"
                      rows={acks}
                      rowKey={(ack) => ack.id}
                      emptyTitle="لا توجد تأكيدات استلام مسجلة حتى الآن"
                      columns={[
                        { key: 'device', header: 'معرف الجهاز', render: (ack) => <span className="font-mono text-xs text-zinc-300">{ack.deviceId ? ack.deviceId.substring(0, 16) + '...' : 'الجهاز الرئيسي'}</span> },
                        { key: 'version', header: 'رقم الإصدار', render: (ack) => <span className="font-semibold text-zinc-200">#{ack.version}</span> },
                        {
                          key: 'status', header: 'الحالة',
                          render: (ack) => (
                            <>
                              {ack.status === 'APPLIED' && (
                                <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">تم التطبيق</span>
                              )}
                              {ack.status === 'RECEIVED' && (
                                <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">تم الاستلام</span>
                              )}
                              {ack.status === 'FAILED' && (
                                <span className="px-2 py-0.5 rounded text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20">فشل</span>
                              )}
                            </>
                          ),
                        },
                        { key: 'time', header: 'توقيت الاستلام', render: (ack) => <span className="text-xs text-zinc-400">{formatDateTime(ack.acknowledgedAt)}</span> },
                        { key: 'notes', header: 'ملاحظات', render: (ack) => <span className="text-xs text-zinc-400">{ack.errorMessage || '—'}</span> },
                      ]}
                    />

        </div>
      )}
    </div>
  );
};

export default PlatformAppConfigurationPage;
