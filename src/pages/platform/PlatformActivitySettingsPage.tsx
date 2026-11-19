import React from 'react';
import { DataTable } from '../../components/ui/DataTable';
import {
  Layers,
  Save,
  RotateCcw,
  Search,
  Building,
  CheckCircle2,
  Sliders,
  History,
  Eye,
  FileText,
  Tag,
  Shield,
  ArrowRight,
  Info,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource'; 
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformTenant,
  PlatformTenantActivityConfig,
  PlatformTenantActivityVersion,
} from '../../services/domains/platform/platformTypes';
import {
  BUSINESS_ACTIVITY_FAMILIES,
  getActivityRows,
  type ActivityDefinition,
} from '../../config/activityCatalog';
import {
  getBusinessProfile,
} from '../../config/businessProfiles';
import {
  MODULE_REGISTRY,
  type ModuleDefinition,
} from '../../config/moduleRegistry';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, inputClass, formatDateTime } from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
export const PlatformActivitySettingsPage: React.FC = () => {
  const toast = useToast();
  const canManageActivity = canPlatform('activity', 'platform.activity.update');
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Tenant Activity State
  const [activityConfig, setActivityConfig] = React.useState<PlatformTenantActivityConfig | null>(null);
  const [versions, setVersions] = React.useState<PlatformTenantActivityVersion[]>([]);
  const [activeTab, setActiveTab] = React.useState<'catalog' | 'modules' | 'terminology' | 'history'>('catalog');

  // Activity Catalog State
  const [catalogSearch, setCatalogSearch] = React.useState('');
  const [selectedFamilyId, setSelectedFamilyId] = React.useState<string>('all');
  const allActivities = React.useMemo(() => getActivityRows(), []);

  // Form State for editing
  const [selectedActivityId, setSelectedActivityId] = React.useState<string>('');
  const [enabledModules, setEnabledModules] = React.useState<string[]>([]);
  const [customTerminology, setCustomTerminology] = React.useState<Record<string, string>>({});
  const [changeSummary, setChangeSummary] = React.useState('');

  const loadTenants = React.useCallback(async () => {
    const centralState = getCentralDataSourceState();
    try {
      const list = centralState.active
        ? await centralPlatformClient.listTenants()
        : platformAdminService.listTenants();
      setTenants(list);
      if (list.length > 0 && !selectedTenantId) {
        setSelectedTenantId(list[0].id);
      }
    } catch (err) {
      toast.error('تعذر استرجاع قائمة العملاء');
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId, toast]);

  React.useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // Load activity config when selected tenant changes
  const loadTenantActivity = React.useCallback(async (tenantId: string) => {
    if (!tenantId) return;
    const centralState = getCentralDataSourceState();
    try {
      let config: any;
      let vList: any[] = [];

      if (centralState.active) {
        config = await centralPlatformClient.getTenantActivity(tenantId);
        vList = await centralPlatformClient.listTenantActivityVersions(tenantId);
      } else {
        config = platformAdminService.getTenantActivity(tenantId);
        vList = platformAdminService.listTenantActivityVersions(tenantId);
      }

      setActivityConfig(config);
      if (config) {
        setSelectedActivityId(config.activityId);
        setEnabledModules([...config.enabledModules || []]);
        setCustomTerminology({ ...(config.customTerminology || {}) });
      }
      setVersions(vList);
    } catch (err) {
      toast.error('تعذر استرجاع نشاط العميل');
    }
  }, [toast]);

  React.useEffect(() => {
    if (selectedTenantId) {
      loadTenantActivity(selectedTenantId);
    }
  }, [selectedTenantId, loadTenantActivity]);

  const handleApplyTemplate = (act: ActivityDefinition) => {
    const profile = getBusinessProfile(act.profileId || act.id);
    setSelectedActivityId(act.id);
    setEnabledModules([...profile.modules.enabledByDefault]);
    setChangeSummary(`تطبيق قالب النشاط: ${act.label}`);
    toast.info(`تم تحميل قالب [${act.label}]. اضغط "حفظ النشاط" لتطبيقه على هذا العميل.`);
  };

  const handleSaveActivity = async () => {
    if (!canManageActivity) { toast.error('لا تملك صلاحية إدارة الأنشطة'); return; }
    if (!selectedTenantId || !selectedActivityId) return;
    setSaving(true);
    const centralState = getCentralDataSourceState();
    try {
      const act = allActivities.find((a) => a.id === selectedActivityId);
      let updated: any;

      if (centralState.active) {
        updated = await centralPlatformClient.saveTenantActivity(selectedTenantId, {
          activityId: selectedActivityId,
          enabledModules,
          customTerminology,
        });
      } else {
        updated = platformAdminService.saveTenantActivity({
          tenantId: selectedTenantId,
          activityId: selectedActivityId,
          profileId: act?.profileId || selectedActivityId,
          enabledModules,
          customTerminology,
          changeSummary: changeSummary.trim() || undefined,
        });
      }

      setActivityConfig(updated);
      setChangeSummary('');
      toast.success(`تم حفظ وتحديث إعدادات النشاط بنجاح (إصدار #${updated.version})`);
      loadTenantActivity(selectedTenantId);
    } catch (err) {
      toast.error('تعذر حفظ النشاط', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (ver: number) => {
    if (!canManageActivity) { toast.error('لا تملك صلاحية إدارة الأنشطة'); return; }
    if (!window.confirm(`هل أنت متأكد من استرجاع إعدادات النشاط إلى الإصدار #${ver}؟`)) {
      return;
    }
    setSaving(true);
    const centralState = getCentralDataSourceState();
    try {
      let restored: any;
      if (centralState.active) {
        restored = await centralPlatformClient.rollbackTenantActivity(selectedTenantId, ver);
      } else {
        restored = platformAdminService.rollbackTenantActivity(selectedTenantId, ver);
      }
      setActivityConfig(restored);
      toast.success(`تم استرجاع إعدادات النشاط بنجاح إلى النسخة #${ver}`);
      loadTenantActivity(selectedTenantId);
    } catch (err) {
      toast.error('فشل الاسترجاع', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = (modId: string) => {
    if (enabledModules.includes(modId)) {
      setEnabledModules(enabledModules.filter((m) => m !== modId));
    } else {
      setEnabledModules([...enabledModules, modId]);
    }
  };

  const filteredActivities = React.useMemo(() => {
    return allActivities.filter((act) => {
      const matchSearch =
        !catalogSearch.trim() ||
        act.label.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        act.id.toLowerCase().includes(catalogSearch.toLowerCase());
      const matchFamily = selectedFamilyId === 'all' || act.familyId === selectedFamilyId;
      return matchSearch && matchFamily;
    });
  }, [allActivities, catalogSearch, selectedFamilyId]);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);
  const currentProfile = selectedActivityId ? getBusinessProfile(selectedActivityId) : null;

  return (
    <div className="space-y-5">
      <CentralUnsupportedNotice feature="إعدادات الأنشطة (Activity Settings)" />
      <PageHeader
        title="إدارة الأنشطة والقوالب التجارية للعملاء"
        description="تخصيص نشاط كل عميل بمعزل تام: قوالب الأنشطة، الوحدات، المصطلحات، وسجل استرجاع الإصدارات السابقة."
        icon={<Layers className="h-5 w-5 text-indigo-600" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Save className="h-3.5 w-3.5" />}
              onClick={handleSaveActivity}
              disabled={saving || !selectedTenantId || !canManageActivity}
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ نشاط العميل'}
            </Button>
          </div>
        }
      />

      {/* Tenant Selection Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Building className="h-5 w-5 text-slate-400" />
          <div>
            <label className="text-xs font-bold text-slate-700 block">حدد العميل المستهدف:</label>
            <select
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className={`${inputClass} !py-1 text-xs min-w-[260px] font-semibold text-slate-800`}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code}) — {t.businessType || 'عام'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activityConfig && selectedTenant && (
          <div className="flex items-center gap-4 text-xs bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
            <div>
              النشاط الحالي:{' '}
              <strong className="text-indigo-700">
                {allActivities.find((a) => a.id === activityConfig.activityId)?.label || activityConfig.activityId}
              </strong>
            </div>
            <div>
              الإصدار المطبق: <strong className="text-slate-800">#{activityConfig.version}</strong>
            </div>
            <div>
              الوحدات النشطة: <strong className="text-emerald-700">{activityConfig.enabledModules.length}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-200 bg-white px-2 pt-2 rounded-t-xl gap-1">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'catalog'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="h-4 w-4" /> كتالوج وقوالب الأنشطة الجاهزة
        </button>
        <button
          onClick={() => setActiveTab('modules')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'modules'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sliders className="h-4 w-4" /> الوحدات المطلوبة ({enabledModules.length})
        </button>
        <button
          onClick={() => setActiveTab('terminology')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'terminology'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Tag className="h-4 w-4" /> المصطلحات والشاشات
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'history'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="h-4 w-4" /> سجل الإصدارات والاسترجاع ({versions.length})
        </button>
      </div>

      {/* Main Tab Content Card */}
      <div className="rounded-b-xl rounded-tr-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* 1. Catalog Tab */}
        {activeTab === 'catalog' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[260px] flex-1">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="ابحث في أكثر من 80 نشاطاً تجارياً..."
                  className={`${inputClass} pr-9`}
                />
              </div>

              <select
                value={selectedFamilyId}
                onChange={(e) => setSelectedFamilyId(e.target.value)}
                className={`${inputClass} max-w-[220px]`}
              >
                <option value="all">كل القطاعات التجارية</option>
                {BUSINESS_ACTIVITY_FAMILIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              {filteredActivities.map((act) => {
                const isCurrent = selectedActivityId === act.id;
                const profile = getBusinessProfile(act.profileId || act.id);
                return (
                  <div
                    key={act.id}
                    className={`rounded-xl border p-4 transition-all flex flex-col justify-between ${
                      isCurrent
                        ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-900">{act.label}</h4>
                        {isCurrent && (
                          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-indigo-600 text-white text-[9.5px] px-2 py-0.5 font-bold">
                            <CheckCircle2 className="h-3 w-3" /> النشاط المحدد
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                        {profile.description.ar}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {profile.modules.enabledByDefault.slice(0, 4).map((mod) => (
                          <span key={mod} className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[9.5px]">
                            {mod}
                          </span>
                        ))}
                        {profile.modules.enabledByDefault.length > 4 && (
                          <span className="text-[9.5px] text-slate-400">
                            +{profile.modules.enabledByDefault.length - 4} وحدات
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400">{act.id}</span>
                      <Button
                        variant={isCurrent ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => handleApplyTemplate(act)}
                        className="text-xs"
                      >
                        {isCurrent ? 'إعادة تعيين القالب' : 'تطبيق القالب'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. Modules Tab */}
        {activeTab === 'modules' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">الوحدات المفعلة لنشاط هذا العميل</h3>
                <p className="text-xs text-slate-500">
                  تحديد الوحدات المتاحة لهذا العميل دون التأثير على أي عميل آخر على المنصة.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                {enabledModules.length} وحدة مفعلة
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              {MODULE_REGISTRY.map((mod: ModuleDefinition) => {
                const isEnabled = enabledModules.includes(mod.id);
                return (
                  <label
                    key={mod.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      isEnabled ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => toggleModule(mod.id)}
                      disabled={!canManageActivity}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{mod.label}</span>
                        <span className="text-[9.5px] font-mono text-slate-400">{mod.id}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{mod.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Terminology Tab */}
        {activeTab === 'terminology' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">تخصيص المصطلحات والشاشات القطاعية</h3>
              <p className="text-xs text-slate-500">
                مواءمة مسميات النظام لتناسب طبيعة نشاط العميل (مثال: "صنف" مقابل "طبق" أو "خدمة" أو "عقار").
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl pt-2">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">مسمى المنتج / الصنف الأساسي</label>
                <input
                  type="text"
                  value={customTerminology['product_name'] || ''}
                  onChange={(e) => setCustomTerminology({ ...customTerminology, product_name: e.target.value })}
                  className={inputClass}
                  placeholder="مثال: بلاطة، صنف، وجبة، قطعة، خدمة"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">مسمى الطرف المقابل (العميل)</label>
                <input
                  type="text"
                  value={customTerminology['customer_name'] || ''}
                  onChange={(e) => setCustomTerminology({ ...customTerminology, customer_name: e.target.value })}
                  className={inputClass}
                  placeholder="مثال: عميل، زبون، ضيف، مريض، موكل"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">مسمى المخزن / المستودع</label>
                <input
                  type="text"
                  value={customTerminology['warehouse_name'] || ''}
                  onChange={(e) => setCustomTerminology({ ...customTerminology, warehouse_name: e.target.value })}
                  className={inputClass}
                  placeholder="مثال: معرض، مستودع، فرع، صالة، مخزن"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">مسمى الفاتورة / أمر البيع</label>
                <input
                  type="text"
                  value={customTerminology['invoice_name'] || ''}
                  onChange={(e) => setCustomTerminology({ ...customTerminology, invoice_name: e.target.value })}
                  className={inputClass}
                  placeholder="مثال: فاتورة ضريبية، شيك طاولة، إيصال، تذكرة"
                />
              </div>
            </div>
          </div>
        )}

        {/* 4. History & Rollback Tab */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">سجل إصدارات النشاط والاسترجاع (Snapshots)</h3>
              <p className="text-xs text-slate-500">
                يتم حفظ نسخة تلقائية مع كل تعديل على نشاط العميل مع إمكانية استرجاع أي إصدار سابق فوراً.
              </p>
            </div>

            {versions.length === 0 ? (
              <EmptyState
                icon={<History className="h-5 w-5 text-slate-400" />}
                title="لا توجد إصدارات سابقة"
                description="سيتم إنشاء لقطات تاريخية عند إجراء أول عملية حفظ لنشاط العميل."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <DataTable
                  ariaLabel="سجل إصدارات الأنشطة"
                  rows={versions}
                  rowKey={(ver: any) => String(ver.id)}
                  dense
                  tableClassName="text-xs"
                  rowClassName={() => 'transition hover:bg-slate-50/70'}
                  columns={[
                    { key: 'ver', header: 'رقم الإصدار', render: (ver: any) => <span className="font-bold text-indigo-700">#{ver.version}</span> },
                    { key: 'activity', header: 'النشاط التجاري', render: (ver: any) => <span className="font-semibold text-slate-800">{allActivities.find((a: any) => a.id === ver.activityId)?.label || ver.activityId}</span> },
                    { key: 'reason', header: 'سبب التحديث', render: (ver: any) => <span className="text-slate-600">{ver.changeSummary || '—'}</span> },
                    { key: 'by', header: 'المنفذ', render: (ver: any) => <span className="text-slate-600">{ver.createdBy || 'النظام'}</span> },
                    { key: 'date', header: 'تاريخ الإصدار', render: (ver: any) => <span className="font-mono text-slate-400" dir="ltr">{formatDateTime(ver.createdAt)}</span> },
                    {
                      key: 'action', header: 'الإجراء', align: 'center',
                      render: (ver: any) => canManageActivity ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          leadingIcon={<RotateCcw className="h-3 w-3 text-amber-600" />}
                          onClick={() => handleRollback(ver.version)}
                          className="text-xs"
                        >
                          استرجاع
                        </Button>
                      ) : null,
                    },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformActivitySettingsPage;
