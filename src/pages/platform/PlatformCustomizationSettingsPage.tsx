import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DataTable } from '../../components/ui/DataTable';
import {
  Layout,
  Eye,
  EyeOff,
  Sliders,
  FolderTree,
  FileText,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  History,
  Layers,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Search,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource'; 
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformTenant,
  PlatformUiProfile,
  PlatformTenantUiCustomization,
  PlatformTenantUiVersion,
  FormFieldRule,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, formatDateTime, inputClass } from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
type CustomizationTab = 'pages' | 'actions' | 'fields' | 'profiles' | 'history';

// Common pages catalogue
const SYSTEM_PAGES = [
  { path: '/sales', label: 'المبيعات والفواتير', category: 'العمليات الأساسية' },
  { path: '/pos-fast-checkout', label: 'نقطة البيع السريعة (POS)', category: 'العمليات الأساسية' },
  { path: '/customers', label: 'العملاء والمديونيات', category: 'العمليات الأساسية' },
  { path: '/inventory', label: 'المخزون والمستودعات', category: 'المخزون' },
  { path: '/purchases', label: 'المشتريات والموردين', category: 'المشتريات' },
  { path: '/finance', label: 'المالية والحسابات العامة', category: 'المالية' },
  { path: '/installments', label: 'إدارة الأقساط والتمويل', category: 'المالية' },
  { path: '/manufacturing', label: 'التصنيع وخطوط الإنتاج', category: 'التصنيع والمشاريع' },
  { path: '/projects', label: 'المشاريع والمقاولات', category: 'التصنيع والمشاريع' },
  { path: '/hr', label: 'الموارد البشرية والرواتب', category: 'الموارد البشرية' },
  { path: '/restaurant-tables', label: 'إدارة الصالة والطاولات', category: 'المطاعم والضيافة' },
  { path: '/kitchen-display', label: 'شاشة المطبخ (KDS)', category: 'المطاعم والضيافة' },
  { path: '/warranty-claims', label: 'الضمانات وطلبات الصيانة', category: 'الخدمات والصيانة' },
  { path: '/reports', label: 'مركز التقارير والتحليلات', category: 'التقارير' },
];

// Common action buttons catalogue
const SYSTEM_ACTIONS = [
  { id: 'export_excel', label: 'تصدير الجداول إلى Excel', description: 'زر التصدير في جداول الفواتير والمنتجات والعملاء' },
  { id: 'print_barcode', label: 'طباعة الباركود والملصقات', description: 'زر طباعة باركود الأصناف الفردي والجماعي' },
  { id: 'pos_direct_discount', label: 'الخصم المباشر في نقطة البيع', description: 'إمكانية إدخال خصم يدوي عند الدفع السريع' },
  { id: 'batch_price_update', label: 'التعديل الجماعي للأسعار', description: 'أزرار تحديث الأسعار بالنسبة المئوية' },
  { id: 'quick_delete_invoice', label: 'زر الحذف السريع للفاتورة', description: 'إخفاء زر الحذف لتفادي الحذف العرضي' },
  { id: 'wholesale_bulk_pricing', label: 'جدول أسعار الجملة والكميات', description: 'عرض تسعير الجملة في شاشة الفاتورة' },
];

// Common form fields
const SYSTEM_FIELDS = [
  { id: 'expiryDate', label: 'تاريخ انتهاء الصلاحية', module: 'الأصناف والمخزون' },
  { id: 'colorTone', label: 'درجة اللون والفرز (Tone)', module: 'الأصناف والمخزون' },
  { id: 'caliberSize', label: 'المقاس والعيار (Caliber)', module: 'الأصناف والمخزون' },
  { id: 'chassisNumber', label: 'رقم الشاسيه / الهيكل', module: 'الورش والسيارات' },
  { id: 'serialNumber', label: 'الرقم التسلسلي للجهاز (IMEI / Serial)', module: 'الإلكترونيات' },
  { id: 'tableNumber', label: 'رقم الطاولة / الصالة', module: 'المطاعم' },
  { id: 'kitchenNotes', label: 'ملاحظات التحضير والمطبخ', module: 'المطاعم' },
  { id: 'nationalId', label: 'الرقم القومي / السجل التجاري للعميل', module: 'العملاء' },
  { id: 'deliveryAddress', label: 'عنوان التوصيل وسعر الشحن', module: 'الفواتير' },
];

export const PlatformCustomizationSettingsPage: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<CustomizationTab>('pages');
  const canManageCustomization = canPlatform('customization');
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [profiles, setProfiles] = useState<PlatformUiProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Customization state for current tenant
  const [hiddenPages, setHiddenPages] = useState<string[]>([]);
  const [hiddenActions, setHiddenActions] = useState<string[]>([]);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});
  const [formFieldRules, setFormFieldRules] = useState<Record<string, FormFieldRule>>({});
  const [currentVersion, setCurrentVersion] = useState<number>(1);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [versions, setVersions] = useState<PlatformTenantUiVersion[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Load Tenants & Profiles
  const loadBootstrap = useCallback(async () => {
    const centralState = getCentralDataSourceState();
    try {
      const [tList, pList] = await Promise.all([
        centralState.active ? centralPlatformClient.listTenants() : platformAdminService.listTenants(),
        centralState.active ? centralPlatformClient.listUiProfiles() : platformAdminService.listUiProfiles(),
      ]);
      setTenants(tList);
      if (tList.length > 0 && !selectedTenantId) {
        setSelectedTenantId(tList[0].id);
      }
      setProfiles(pList);
    } catch (e) {
      console.error('Failed to load bootstrap data:', e);
    }
  }, [selectedTenantId]);

  // Load Tenant UI Config
  const loadTenantUi = useCallback(async (tenantId: string) => {
    if (!tenantId) return;
    setLoading(true);
    const centralState = getCentralDataSourceState();
    try {
      let data: any;
      let vList: any[] = [];

      if (centralState.active) {
        data = await centralPlatformClient.getTenantUiCustomization(tenantId);
        vList = await centralPlatformClient.listTenantUiVersions(tenantId);
      } else {
        data = platformAdminService.getTenantUiCustomization(tenantId);
        vList = platformAdminService.listTenantUiVersions(tenantId);
      }

      setHiddenPages(data.hiddenPages || []);
      setHiddenActions(data.hiddenActions || []);
      setCustomLabels(data.customLabels || {});
      setFormFieldRules(data.formFieldRules || {});
      setSelectedProfileId(data.profileId || '');
      setCurrentVersion(data.version);
      setVersions(vList);
    } catch (e) {
      console.error('Failed to load tenant UI config:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (selectedTenantId) {
      loadTenantUi(selectedTenantId);
    }
  }, [selectedTenantId, loadTenantUi]);

  // Actions
  const handleTogglePage = (path: string) => {
    setHiddenPages((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const handleToggleAction = (actionId: string) => {
    setHiddenActions((prev) =>
      prev.includes(actionId) ? prev.filter((a) => a !== actionId) : [...prev, actionId]
    );
  };

  const handleToggleField = (fieldId: string) => {
    setFormFieldRules((prev) => {
      const current = prev[fieldId] ?? { visible: true };
      return {
        ...prev,
        [fieldId]: {
          ...current,
          visible: !current.visible,
        },
      };
    });
  };

  const handleApplyProfile = (profile: PlatformUiProfile) => {
    if (!canManageCustomization) { toast.warning('لا تملك صلاحية تخصيص الواجهة'); return; }
    if (!confirm(`هل تريد تطبيق قالب "${profile.name}" على هذا العميل؟ سيتم استبدال تخصيصات الصفحات والأزرار الحالية.`)) return;
    setHiddenPages(profile.hiddenPages);
    setHiddenActions(profile.hiddenActions);
    setCustomLabels(profile.customLabels);
    setFormFieldRules(profile.formFieldRules);
    setSelectedProfileId(profile.id);
  };

  const handleSave = async () => {
    if (!canManageCustomization) { toast.warning('لا تملك صلاحية تخصيص الواجهة'); return; }
    if (!selectedTenantId) return;
    setSaving(true);
    setSavedSuccess(false);
    const centralState = getCentralDataSourceState();
    try {
      const uiInput = {
        profileId: selectedProfileId || undefined,
        hiddenPages,
        hiddenActions,
        customLabels,
        formFieldRules,
      };

      let updated: any;
      if (centralState.active) {
        updated = await centralPlatformClient.saveTenantUiCustomization(selectedTenantId, uiInput);
      } else {
        const tenantObj = tenants.find((t) => t.id === selectedTenantId);
        updated = platformAdminService.saveTenantUiCustomization({
          tenantId: selectedTenantId,
          ...uiInput,
          changeSummary: `تحديث تخصيصات الواجهة للعميل ${tenantObj?.name || selectedTenantId}`,
        });
      }

      setCurrentVersion(updated.version);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      loadTenantUi(selectedTenantId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (ver: number) => {
    if (!canManageCustomization) { toast.warning('لا تملك صلاحية تخصيص الواجهة'); return; }
    if (!confirm(`هل أنت متأكد من استرجاع تخصيصات الواجهة للإصدار #${ver}؟`)) return;
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active) {
        await centralPlatformClient.rollbackTenantUi(selectedTenantId, ver);
      } else {
        platformAdminService.rollbackTenantUi(selectedTenantId, ver);
      }
      loadTenantUi(selectedTenantId);
      toast.success(`تم استرجاع الإصدار #${ver} بنجاح.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Filtered pages
  const filteredPages = useMemo(() => {
    if (!searchQuery) return SYSTEM_PAGES;
    const q = searchQuery.toLowerCase();
    return SYSTEM_PAGES.filter(
      (p) => p.label.toLowerCase().includes(q) || p.path.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="تخصيص الواجهة وقوالب النشاط (UI Customization)"
        description="إدارة ظهور الصفحات، الأزرار، نماذج الإدخال، وقوالب الأنشطة لكل عميل بشكل منفصل تماماً عن الصلاحيات الأمنية"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || loading || !selectedTenantId || !canManageCustomization}
            >
              <Save className="w-4 h-4 ml-2" />
              {saving ? 'جاري الحفظ...' : 'حفظ التخصيصات وتطبيقها'}
            </Button>
          </div>
        }
      />

      {/* Security Disclaimer Banner */}
      <div className="bg-amber-950/20 border border-amber-800/40 p-3.5 rounded-xl flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs">
          <span className="font-semibold text-amber-300">ملاحظة معمارية هامة حول التخصيص:</span>
          <p className="text-amber-200/80 mt-0.5 leading-relaxed">
            هذه الصفحة مخصصة لتبسيط الواجهة وإخفاء العناصر غير المرتبطة بنشاط العميل (UI/UX Visibility).
            إخفاء زر أو صفحة هنا **لا يُلغي صلاحية الوصول الأمنية (RBAC Permissions)** للمستخدم، فالتحكم الأمني الصارم يتم دائماً عبر طبقة الصلاحيات وأدوار النظام.
          </p>
        </div>
      </div>

      {/* Tenant Selector & Profile Status Bar */}
      <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Layout className="w-5 h-5 text-emerald-400" />
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
              تم حفظ الواجهة بنجاح
            </span>
          )}
          <span className="text-zinc-400">
            الإصدار النشط: <strong className="text-zinc-200">#{currentVersion}</strong>
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 space-x-1 space-x-reverse overflow-x-auto">
        <button
          onClick={() => setActiveTab('pages')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'pages' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          إظهار وإخفاء الصفحات ({SYSTEM_PAGES.length - hiddenPages.length}/{SYSTEM_PAGES.length})
        </button>
        <button
          onClick={() => setActiveTab('actions')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'actions' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          الأزرار والوظائف السريعة
        </button>
        <button
          onClick={() => setActiveTab('fields')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'fields' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          حقول نماذج الإدخال
        </button>
        <button
          onClick={() => setActiveTab('profiles')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'profiles' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          قوالب الأنشطة الجاهزة
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'history' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <History className="w-4 h-4" />
          سجل الإصدارات
        </button>
      </div>

      {/* Main Tab Panels */}
      {/* ─── TAB 1: Pages Visibility ────────────────────────────────────────────── */}
      {activeTab === 'pages' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 bg-zinc-900/40 p-3 rounded-lg border border-zinc-800">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute right-3 top-3 text-zinc-400" />
              <input
                type="text"
                placeholder="بحث في الصفحات أو الأقسام..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputClass} pr-9`}
              />
            </div>
            <div className="text-xs text-zinc-400">
              المخفية: <span className="text-rose-400 font-semibold">{hiddenPages.length}</span> | 
              الظاهرة: <span className="text-emerald-400 font-semibold">{SYSTEM_PAGES.length - hiddenPages.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPages.map((page) => {
              const isHidden = hiddenPages.includes(page.path);
              return (
                <div
                  key={page.path}
                  onClick={() => handleTogglePage(page.path)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    isHidden
                      ? 'bg-zinc-950/40 border-zinc-800/60 opacity-60'
                      : 'bg-zinc-900/60 border-zinc-800 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isHidden ? 'text-zinc-400 line-through' : 'text-zinc-100'}`}>
                        {page.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 flex items-center gap-2 font-mono">
                      <span>{page.path}</span>
                      <span>•</span>
                      <span className="text-zinc-400">{page.category}</span>
                    </div>
                  </div>

                  <div className="flex-shrink-0 mr-3">
                    {isHidden ? (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <EyeOff className="w-3.5 h-3.5" />
                        مخفية
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Eye className="w-3.5 h-3.5" />
                        ظاهرة
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB 2: Action Buttons Visibility ───────────────────────────────────── */}
      {activeTab === 'actions' && (
        <div className="space-y-3">
          <div className="text-xs text-zinc-400 mb-2">
            حدد الأزرار السريعة المتاحة للمستخدمين لتسهيل وتبسيط واجهة النظام:
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SYSTEM_ACTIONS.map((action) => {
              const isHidden = hiddenActions.includes(action.id);
              return (
                <div
                  key={action.id}
                  onClick={() => handleToggleAction(action.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start justify-between ${
                    isHidden
                      ? 'bg-zinc-950/40 border-zinc-800/60 opacity-60'
                      : 'bg-zinc-900/60 border-zinc-800 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-sm text-zinc-100">{action.label}</div>
                    <div className="text-xs text-zinc-400 leading-relaxed">{action.description}</div>
                  </div>

                  <div className="flex-shrink-0 mr-3">
                    {isHidden ? (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <EyeOff className="w-3.5 h-3.5" />
                        معطل شكلياً
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Eye className="w-3.5 h-3.5" />
                        متاح
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB 3: Form Fields ─────────────────────────────────────────────────── */}
      {activeTab === 'fields' && (
        <div className="space-y-3">
          <div className="text-xs text-zinc-400 mb-2">
            التحكم في الحقول الإضافية غير الإلزامية في بطاقات الأصناف ونماذج الفواتير:
          </div>

          <div className="overflow-x-auto bg-zinc-900/40 rounded-lg border border-zinc-800">
            <DataTable
            ariaLabel="حقول النماذج القابلة للتخصيص"
            rows={SYSTEM_FIELDS}
            rowKey={(field: any) => String(field.id)}
            tableClassName="text-sm"
            rowClassName={() => 'transition-colors hover:bg-zinc-800/20'}
            columns={[
              { key: 'label', header: 'اسم الحقل', render: (field: any) => <span className="font-medium text-zinc-200">{field.label}</span> },
              { key: 'module', header: 'القسم / النموذج', render: (field: any) => <span className="text-xs text-zinc-400">{field.module}</span> },
              {
                key: 'visible', header: 'حالة الظهور',
                render: (field: any) => {
                  const rule = formFieldRules[field.id as keyof typeof formFieldRules] ?? { visible: true };
                  return rule.visible ? (
                    <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-400">مُفعل وظاهر</span>
                  ) : (
                    <span className="rounded bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400">مخفي</span>
                  );
                },
              },
              {
                key: 'action', header: 'إجراء',
                render: (field: any) => {
                  const rule = formFieldRules[field.id as keyof typeof formFieldRules] ?? { visible: true };
                  return canManageCustomization ? (
                    <Button
                      variant={rule.visible ? 'danger' : 'success'}
                      size="sm"
                      onClick={() => handleToggleField(field.id)}
                    >
                      {rule.visible ? 'إخفاء الحقل' : 'إظهار الحقل'}
                    </Button>
                  ) : null;
                },
              },
            ]}
          />
          </div>
        </div>
      )}

      {/* ─── TAB 4: Activity Profiles ───────────────────────────────────────────── */}
      {activeTab === 'profiles' && (
        <div className="space-y-4">
          <div className="text-xs text-zinc-400">
            تطبيق قالب واجهة معد مسبقاً بما يلائم قطاع عمل العميل بضغطة زر واحدة:
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((prof) => (
              <div
                key={prof.id}
                className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-zinc-100 text-sm">{prof.name}</h4>
                    {prof.isDefault && (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                        افتراضي
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 font-mono mt-1">الرمز: {prof.code}</div>
                  <div className="text-xs text-zinc-400 mt-2 space-y-1">
                    <div>الصفحات المخفية: <strong className="text-zinc-200">{prof.hiddenPages.length}</strong></div>
                    <div>الأزرار المعطلة: <strong className="text-zinc-200">{prof.hiddenActions.length}</strong></div>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full mt-3"
                  disabled={!canManageCustomization}
                  onClick={() => handleApplyProfile(prof)}
                >
                  تطبيق هذا القالب على العميل
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 5: Version History ─────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          <div className="text-xs text-zinc-400">
            سجل الإصدارات واللقطات السابقة لتخصيصات واجهة هذا العميل:
          </div>

          {versions.length === 0 ? (
            <EmptyState title="لا توجد إصدارات سابقة مسجلة لتخصيصات واجهة هذا العميل" />
          ) : (
            <div className="space-y-2">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-zinc-200">
                      إصدار #{ver.version} {ver.version === currentVersion && <span className="text-emerald-400 mr-2">(الحالي)</span>}
                    </div>
                    <div className="text-zinc-400 text-[11px] mt-0.5">{ver.changeSummary}</div>
                    <div className="text-zinc-500 text-[10px]">{formatDateTime(ver.createdAt)}</div>
                  </div>
                  {ver.version !== currentVersion && canManageCustomization && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRollback(ver.version)}
                    >
                      <RotateCcw className="w-3.5 h-3.5 ml-1" />
                      استرجاع
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PlatformCustomizationSettingsPage;
