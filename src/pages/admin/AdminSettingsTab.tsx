import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Save, Palette, Table as TableIcon, Columns, Info, Store, ReceiptText, Boxes, ShieldCheck, Truck, Upload, RotateCcw, Image as ImageIcon, Check, History, Download,
  Printer, Eye, Star, CheckCircle, RefreshCw, Layers, LayoutTemplate, FileText, CheckCircle2, X, ExternalLink, SlidersHorizontal, Sparkles, Plus, ArrowUp, ArrowDown,
} from 'lucide-react';
import { SettingsService } from '../../services/SettingsService';
import { AuthService } from '../../services/AuthService';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../components/ui/Toast';
import { BusinessProfileSupportNotice } from '../../components/business/BusinessProfileSupportNotice';
import type { InvoiceSectionId, InvoiceTableColumnId, SystemSettings } from '../../types';
import { PrintService, type InvoiceTemplateId, type InvoiceSizeId } from '../../services/PrintService';
import {
  BUSINESS_MODULES,
  BUSINESS_ACTIVITY_FAMILY_OPTIONS,
  BUSINESS_TYPES,
  BUSINESS_UNITS,
  getActivityModuleIds,
  getDefaultBusinessConfiguration,
  getProfileFeatures,
  getProfileNavigation,
  parseBusinessConfiguration,
  parseEnabledModules,
  serializeBusinessConfiguration,
  type BusinessConfiguration,
} from '../../config/businessProfiles';
import { ModuleRegistryService } from '../../services/ModuleRegistryService';
import { BusinessProfileService } from '../../services/BusinessProfileService';
import { getEffectiveBusinessType } from '../../services/BusinessTypeService';
import { CompaniesPanel } from '../../components/CompaniesPanel';
import { BackupPage } from '../settings/BackupPage';
import { getModuleDefinition, validateModuleSelection, withModuleDependencies } from '../../config/moduleRegistry';
import {
  BUSINESS_TERMINOLOGY,
  BUSINESS_TERM_KEYS,
  resolveBusinessTerm,
  type BusinessTermKey,
  type BusinessTermOverrides,
} from '../../config/businessTerminology';
import { TerminologyService } from '../../services/TerminologyService';
import {
  ConfigurationVersionService,
  type ActivityConfigurationVersion,
} from '../../services/ConfigurationVersionService';

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30';
const labelCls = 'mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300';

type Tab = 'general' | 'business' | 'branding' | 'invoice' | 'inventory' | 'operations' | 'security' | 'backup';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'الإعدادات العامة', icon: Store },
  { id: 'business', label: 'إعدادات النشاط', icon: Boxes },
  { id: 'branding', label: 'الهوية والمظهر', icon: Palette },
  { id: 'invoice', label: 'الفواتير والطباعة', icon: ReceiptText },
  { id: 'inventory', label: 'المخزون والتكلفة', icon: Boxes },
  { id: 'operations', label: 'التشغيل والموافقات', icon: Truck },
  { id: 'security', label: 'الأمان', icon: ShieldCheck },
  { id: 'backup', label: 'النسخ والاستعادة', icon: Download },
];

const DEFAULT_INVOICE_SECTION_ORDER: InvoiceSectionId[] = ['promotions', 'delivery', 'paymentSplits', 'notes'];
const DEFAULT_INVOICE_TABLE_COLUMNS: InvoiceTableColumnId[] = ['number', 'product', 'unit', 'quantity', 'unitPrice', 'total'];
const INVOICE_SECTION_OPTIONS: { id: InvoiceSectionId; label: string }[] = [
  { id: 'promotions', label: 'العروض والخصومات الإضافية' },
  { id: 'delivery', label: 'الشحن والتوصيل' },
  { id: 'paymentSplits', label: 'تفاصيل الدفعات المجزأة' },
  { id: 'notes', label: 'الملاحظات الإضافية' },
];
const INVOICE_COLUMN_OPTIONS: { id: InvoiceTableColumnId; label: string }[] = [
  { id: 'number', label: 'رقم البند' },
  { id: 'product', label: 'الصنف والبيان' },
  { id: 'unit', label: 'الوحدة' },
  { id: 'quantity', label: 'الكمية' },
  { id: 'boxes', label: 'عدد الكراتين' },
  { id: 'pieces', label: 'عدد القطع' },
  { id: 'unitPrice', label: 'سعر الوحدة' },
  { id: 'lineDiscount', label: 'خصم البند' },
  { id: 'total', label: 'الإجمالي' },
];

function moveListItem<T>(items: T[], item: T, direction: -1 | 1): T[] {
  const index = items.indexOf(item);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const reordered = [...items];
  [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
  return reordered;
}

interface AdminSettingsTabProps {
  initialTab?: Tab;
  onTabChange?: (tab: Tab) => void;
}

export const AdminSettingsTab: React.FC<AdminSettingsTabProps> = ({ initialTab, onTabChange }) => {
  const toast = useToast();
  const can = usePermission();
  const readOnly = !can('settings.update');
  const canViewBackup = can('settings.backup');
  const visibleTabs = TABS.filter((item) => item.id !== 'backup' || canViewBackup);
  const [tab, setTab] = useState<Tab>(initialTab && ['general','business','branding','invoice','inventory','operations','security','backup'].includes(initialTab) && (initialTab !== 'backup' || canViewBackup) ? initialTab : 'general');
  const changeTab = (next: Tab) => {
    setTab(next);
    onTabChange?.(next);
  };
  const [settings, setSettings] = useState<SystemSettings>(() => SettingsService.getSettings());
  const [businessProfile, setBusinessProfile] = useState(readBusinessProfile);
  const [businessConfig, setBusinessConfig] = useState(readBusinessConfiguration);
  const [terminologyOverrides, setTerminologyOverrides] = useState<BusinessTermOverrides>(
    () => TerminologyService.getOverrides(),
  );
  const [dirty, setDirty] = useState(false);
    const [activitySearch, setActivitySearch] = useState('');
  const [activityFamily, setActivityFamily] = useState('all');
  const canViewConfigHistory = can('audit.view');
  const [configurationVersions, setConfigurationVersions] = useState<ActivityConfigurationVersion[]>([]);
  const [configurationHistoryError, setConfigurationHistoryError] = useState<string | null>(null);
  const [compareVersionIds, setCompareVersionIds] = useState<[string, string]>(['', '']);

  const printService = useMemo(() => new PrintService(), []);
  const [systemPrinters, setSystemPrinters] = useState<string[]>([]);
  const [isScanningPrinters, setIsScanningPrinters] = useState(false);
  const [scannedPrintersCount, setScannedPrintersCount] = useState<number | null>(null);

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<InvoiceTemplateId>('table');
  const [previewSize, setPreviewSize] = useState<InvoiceSizeId>('a4');
  const [newReasonInput, setNewReasonInput] = useState('');
  const [showAddReason, setShowAddReason] = useState(false);

  useEffect(() => {
    if (!previewModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [previewModalOpen]);

  const scanPrinters = async (notify = true) => {
    setIsScanningPrinters(true);
    try {
      const res = await window.ceramisys?.printing?.listPrinters?.();
      if (res?.ok && Array.isArray(res.printers)) {
        setSystemPrinters(res.printers);
        setScannedPrintersCount(res.printers.length);
        if (notify) toast.success(`تم استكشاف ${res.printers.length} طابعة في النظام بنجاح.`);
      } else if (notify) {
        toast.info('لم يتم العثور على طابعات مثبتة عبر خدمة الطباعة.');
      }
    } catch {
      if (notify) {
        toast.info('استكشاف الطابعات التلقائي متاح داخل تطبيق سطح المكتب، ويمكنك إدخال اسم الطابعة يدوياً.');
      }
    } finally {
      setIsScanningPrinters(false);
    }
  };

  useEffect(() => {
    if (tab === 'invoice') {
      scanPrinters(false);
    }
  }, [tab]);

  useEffect(() => {
    if (initialTab && (initialTab !== 'backup' || canViewBackup)) setTab(initialTab);
  }, [canViewBackup, initialTab]);

  useEffect(() => {
    setSettings(SettingsService.getSettings());
    setBusinessProfile(readBusinessProfile());
    setBusinessConfig(readBusinessConfiguration());
    setTerminologyOverrides(TerminologyService.getOverrides());
  }, []);

  useEffect(() => {
    if (tab !== 'business' || !canViewConfigHistory) return;
    try {
      const versions = ConfigurationVersionService.getVersions();
      setConfigurationVersions(versions);
      setCompareVersionIds((current) => [
        versions.some((version) => version.id === current[0]) ? current[0] : versions[0]?.id || '',
        versions.some((version) => version.id === current[1]) ? current[1] : versions[1]?.id || versions[0]?.id || '',
      ]);
      setConfigurationHistoryError(null);
    } catch (error) {
      setConfigurationHistoryError(error instanceof Error ? error.message : String(error));
    }
  }, [tab, canViewConfigHistory]);

  const set = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const setInvoiceTableColumn = (column: InvoiceTableColumnId, checked: boolean) => {
    const current = settings.invoiceTableColumns?.length
      ? settings.invoiceTableColumns
      : DEFAULT_INVOICE_TABLE_COLUMNS;
    set('invoiceTableColumns', checked
      ? [...current, column].filter((value, index, values) => values.indexOf(value) === index)
      : current.filter((value) => value !== column));
    if (column === 'lineDiscount') set('invoiceShowLineDiscount', checked);
    if (column === 'boxes') set('invoiceShowBoxesCount', checked || current.includes('pieces'));
    if (column === 'pieces') set('invoiceShowBoxesCount', checked || current.includes('boxes'));
  };
  const setInvoiceTableColumnGroup = (columns: InvoiceTableColumnId[], checked: boolean) => {
    const current = settings.invoiceTableColumns?.length
      ? settings.invoiceTableColumns
      : DEFAULT_INVOICE_TABLE_COLUMNS;
    set('invoiceTableColumns', checked
      ? [...current, ...columns].filter((value, index, values) => values.indexOf(value) === index)
      : current.filter((value) => !columns.includes(value)));
    set('invoiceShowBoxesCount', checked);
  };
  const moveInvoiceTableColumn = (column: InvoiceTableColumnId, direction: -1 | 1) => {
    const current = settings.invoiceTableColumns?.length
      ? settings.invoiceTableColumns
      : DEFAULT_INVOICE_TABLE_COLUMNS;
    set('invoiceTableColumns', moveListItem(current, column, direction));
  };
  const moveInvoiceSection = (section: InvoiceSectionId, direction: -1 | 1) => {
    const current = settings.invoiceSectionOrder?.length
      ? settings.invoiceSectionOrder
      : DEFAULT_INVOICE_SECTION_ORDER;
    set('invoiceSectionOrder', moveListItem(current, section, direction));
  };
  const invoiceTableColumns = settings.invoiceTableColumns?.length
    ? settings.invoiceTableColumns
    : DEFAULT_INVOICE_TABLE_COLUMNS;
  const invoiceSectionOrder = [
    ...(settings.invoiceSectionOrder?.length ? settings.invoiceSectionOrder : DEFAULT_INVOICE_SECTION_ORDER),
    ...DEFAULT_INVOICE_SECTION_ORDER.filter((section) => !(settings.invoiceSectionOrder || DEFAULT_INVOICE_SECTION_ORDER).includes(section)),
  ];

  const save = () => {
    try {
      const customName = businessProfile.customName.trim();
      if (businessProfile.type === 'custom' && customName.length < 2) {
        toast.error('اكتب اسم النشاط التجاري (حرفان على الأقل).');
        changeTab('business');
        return;
      }
      const businessTypeLabel = businessProfile.type === 'custom'
        ? customName
        : BUSINESS_TYPES.find((type) => type.id === businessProfile.type)?.label || '';
      const moduleValidation = validateModuleSelection(businessProfile.enabledModules, {
        trackInventory: businessConfig.trackInventory,
      });
      if (moduleValidation.errors.length > 0) {
        toast.error('تعذر تفعيل الوحدات', moduleValidation.errors.join(' '));
        changeTab('business');
        return;
      }
      const enabledModules = moduleValidation.enabled;
      const validatedTerminology = TerminologyService.validateOverrides(terminologyOverrides);
      const currentModules = ModuleRegistryService.getEnabledModuleIds();
      for (const removed of currentModules.filter((id) => !enabledModules.includes(id))) {
        const blocker = ModuleRegistryService.getDeactivationBlocker(removed, enabledModules);
        if (blocker) {
          toast.error('لا يمكن تعطيل وحدة مستخدمة', blocker);
          changeTab('business');
          return;
        }
      }
      if (businessProfile.type !== readBusinessProfile().type
        && !window.confirm('تغيير نوع النشاط سيغيّر الوحدات والقوائم الافتراضية فقط. لن تُحذف أو تُحوّل أي بيانات سابقة. هل تريد المتابعة؟')) return;
      const actor = AuthService.getCurrentUser();
      // Module lifecycle changes go through the registry so activation history,
      // dependency guards and navigation visibility stay in one transaction.
      ModuleRegistryService.setEnabledModules(enabledModules, actor, 'تحديث من إعدادات النشاط', {
        trackInventory: businessConfig.trackInventory,
      });
      const next = SettingsService.update({
        ...settings,
        businessType: businessProfile.type,
        businessTypeLabel,
        businessProfileConfig: serializeBusinessConfiguration({
          ...businessConfig,
          businessType: businessProfile.type,
        }),
        businessTerminologyOverrides: JSON.stringify(validatedTerminology),
      }, actor);
      // Applying a profile also creates its declared product attributes; this is
      // additive and never removes manually created attributes.
      BusinessProfileService.applyFromSettings();
      BusinessProfileService.applyPermissionsFromSettings();
      ConfigurationVersionService.recordCurrent('تحديث من إعدادات النشاط', actor);
      if (canViewConfigHistory) {
        setConfigurationVersions(ConfigurationVersionService.getVersions());
      }
      setSettings(next);
      setBusinessProfile((current) => ({ ...current, enabledModules }));
      setDirty(false);
      toast.success('تم حفظ إعدادات النشاط وبقية الإعدادات بنجاح.', moduleValidation.warnings.join(' '));
    } catch (error: any) {
      toast.error('تعذر حفظ الإعدادات', error?.message || String(error));
    }
  };

  const resetDefaults = () => {
    if (!window.confirm('إرجاع الحقول المعروضة إلى القيم الافتراضية؟')) return;
    setSettings(SettingsService.getSettings());
    setBusinessProfile(readBusinessProfile());
    setBusinessConfig(readBusinessConfiguration());
    setTerminologyOverrides(TerminologyService.getOverrides());
    setDirty(false);
  };

  const selectBusinessType = (type: string) => {
    if (type === businessProfile.type) return;
    setBusinessProfile((current) => ({
      ...current,
      type,
      enabledModules: parseEnabledModules(undefined, type),
      additionalActivityIds: [],
    }));
    setBusinessConfig(getDefaultBusinessConfiguration(type));
    setDirty(true);
  };

  const toggleAdditionalActivity = (activityId: string, enabled: boolean) => {
    const additionalActivityIds = enabled
      ? [...new Set([...businessProfile.additionalActivityIds, activityId])]
      : businessProfile.additionalActivityIds.filter((id) => id !== activityId);
    const defaults = getDefaultBusinessConfiguration(businessProfile.type, additionalActivityIds);
    setBusinessConfig((current) => ({
      ...defaults,
      businessModel: current.businessModel === 'mixed' || defaults.businessModel === 'mixed'
        ? 'mixed'
        : current.businessModel,
      trackInventory: current.trackInventory || defaults.trackInventory,
      units: [...new Set([...current.units, ...defaults.units])],
      customUnits: [...new Set([...current.customUnits, ...defaults.customUnits])],
      productAttributes: [...new Set([...current.productAttributes, ...defaults.productAttributes])],
    }));
    setBusinessProfile((current) => ({
      ...current,
      additionalActivityIds,
      enabledModules: enabled
        ? [...new Set([...current.enabledModules, ...getActivityModuleIds(current.type, additionalActivityIds)])]
        : current.enabledModules,
    }));
    setDirty(true);
  };

  const updateBusinessConfig = (patch: Partial<BusinessConfiguration>) => {
    setBusinessConfig((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const updateTermOverride = (key: BusinessTermKey, value: string) => {
    setTerminologyOverrides((current) => {
      const arabic = { ...current.ar };
      if (value.trim()) arabic[key] = value;
      else delete arabic[key];
      return { ...current, ar: arabic };
    });
    setDirty(true);
  };

  const setInventoryEnabled = (enabled: boolean) => {
    updateBusinessConfig({ trackInventory: enabled });
    setBusinessProfile((current) => ({
      ...current,
      enabledModules: enabled
        ? [...new Set([...current.enabledModules, 'inventory'])]
        : current.enabledModules.filter((module) => module !== 'inventory'),
    }));
  };

  const visibleBusinessTypes = useMemo(() => {
    const query = activitySearch.trim().toLocaleLowerCase('ar');
    return BUSINESS_TYPES.filter((type) =>
      (activityFamily === 'all' || type.category === activityFamily)
      && (!query
        || type.label.toLocaleLowerCase('ar').includes(query)
        || type.description.toLocaleLowerCase('ar').includes(query)
        || type.familyLabel.toLocaleLowerCase('ar').includes(query))
    );
  }, [activityFamily, activitySearch]);

  const restoreConfigurationForReview = (version: ActivityConfigurationVersion) => {
    const snapshot = version.snapshot;
    setBusinessProfile({
      type: snapshot.businessType,
      customName: snapshot.businessTypeLabel,
      enabledModules: [...snapshot.enabledModules],
      additionalActivityIds: [...snapshot.configuration.additionalActivityIds],
    });
    setBusinessConfig(snapshot.configuration);
    setTerminologyOverrides(snapshot.terminologyOverrides);
    setDirty(true);
    changeTab('business');
    toast.info(`تم تحميل الإصدار ${version.version} للمراجعة. لن تُطبّق التغييرات حتى تضغط «حفظ التغييرات».`);
  };

  const comparedVersions = compareVersionIds.map((id) =>
    configurationVersions.find((version) => version.id === id)
  );

  const toggleBusinessModule = (moduleId: string) => {
    const definition = getModuleDefinition(moduleId);
    if (definition?.activation.requiresInventoryTracking && !businessConfig.trackInventory) {
      toast.error('الوحدة غير متاحة', definition.activation.requiresInventoryTracking
        ? 'فعّل تتبع المخزون أولًا من إعدادات النشاط.'
        : 'هذه الوحدة غير متاحة.');
      return;
    }
    const current = businessProfile.enabledModules;
    if (current.includes(moduleId)) {
      const next = withModuleDependencies(current.filter((id) => id !== moduleId));
      const blocker = ModuleRegistryService.getDeactivationBlocker(moduleId, next);
      if (blocker) {
        toast.error('لا يمكن تعطيل الوحدة', blocker);
        return;
      }
      setBusinessProfile((state) => ({ ...state, enabledModules: next }));
    } else {
      setBusinessProfile((state) => ({
        ...state,
        enabledModules: withModuleDependencies([...state.enabledModules, moduleId]),
      }));
    }
    setDirty(true);
  };

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 400 * 1024) {
      toast.error('الشعار كبير جداً', 'اختر صورة أقل من 400KB لتُحفظ داخل قاعدة البيانات.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      set('brandLogoDataUrl', String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const previewStyle = useMemo(
    () => ({
      background: `linear-gradient(to top right, ${settings.brandPrimaryColor || '#0284c7'}, ${settings.brandAccentColor || '#4f46e5'})`,
    }),
    [settings.brandPrimaryColor, settings.brandAccentColor]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {visibleTabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => changeTab(item.id)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                active
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </button>
          );
        })}
        <div className="mr-auto flex items-center gap-2">
          <button onClick={resetDefaults} className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <RotateCcw className="h-3.5 w-3.5" /> استرجاع
          </button>
          <button
            onClick={save}
            disabled={readOnly || !dirty}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> حفظ التغييرات
          </button>
        </div>
      </div>

      <fieldset disabled={readOnly && tab !== 'backup'} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        {tab === 'general' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="اسم المعرض *"><input value={settings.showroomName} onChange={(e) => set('showroomName', e.target.value)} className={inputCls} /></Field>
            <Field label="الوصف / الشعار النصي"><input value={settings.tagline || ''} onChange={(e) => set('tagline', e.target.value)} className={inputCls} /></Field>
            <Field label="الهاتف الأساسي"><input value={settings.phone} onChange={(e) => set('phone', e.target.value)} className={`${inputCls} font-mono`} /></Field>
            <Field label="هاتف إضافي"><input value={settings.phone2 || ''} onChange={(e) => set('phone2', e.target.value)} className={`${inputCls} font-mono`} /></Field>
            <Field label="العنوان" full><input value={settings.address} onChange={(e) => set('address', e.target.value)} className={inputCls} /></Field>
            <Field label="الرقم الضريبي"><input value={settings.taxNumber || ''} onChange={(e) => set('taxNumber', e.target.value)} className={`${inputCls} font-mono`} /></Field>
            <Field label="السجل التجاري"><input value={settings.commercialRecord || ''} onChange={(e) => set('commercialRecord', e.target.value)} className={`${inputCls} font-mono`} /></Field>
            <Field label="العملة (كود)"><input value={settings.currency} onChange={(e) => set('currency', e.target.value)} className={`${inputCls} font-mono`} /></Field>
            <Field label="رمز العملة"><input value={settings.currencySymbol} onChange={(e) => set('currencySymbol', e.target.value)} className={inputCls} /></Field>
            <Field label="نسبة الضريبة الافتراضية %"><input type="number" min={0} step="0.01" value={settings.defaultTaxPercentage} onChange={(e) => set('defaultTaxPercentage', Number(e.target.value))} className={inputCls} /></Field>
            <Field label="الأسعار شاملة الضريبة">
              <Toggle checked={settings.isTaxInclusive} onChange={(v) => set('isTaxInclusive', v)} label={settings.isTaxInclusive ? 'نعم، شاملة' : 'لا، الضريبة تُضاف'} />
            </Field>
          </div>
        )}

        {tab === 'business' && (
          <div className="space-y-5">
            {getProfileFeatures(businessProfile.type).length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800">
                <span className="font-bold text-slate-500">ميزات النشاط: </span>
                {getProfileFeatures(businessProfile.type).map((f) => (
                  <span key={f} className="ml-2 inline-block rounded-full bg-white px-2 py-0.5 dark:bg-slate-700">{f}</span>
                ))}
              </div>
            )}
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">خصص النظام لنشاطك</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                غيّر نوع النشاط والوحدات الظاهرة في القائمة في أي وقت. إخفاء الوحدة لا يحذف بياناتها.
              </p>
            </div>
            {getProfileNavigation(businessProfile.type)?.groups?.length ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800">
                <span className="font-bold text-slate-500">navigation النشاط: </span>
                {getProfileNavigation(businessProfile.type)!.groups.map((g) => (
                  <span key={g.id} className="ml-2 inline-block rounded-full bg-white px-2 py-0.5 dark:bg-slate-700">{g.label.ar}</span>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
              <input
                type="search"
                aria-label="البحث في الأنشطة"
                value={activitySearch}
                onChange={(event) => setActivitySearch(event.target.value)}
                placeholder="ابحث باسم النشاط أو عائلته..."
                className={inputCls}
              />
              <select
                aria-label="تصنيف النشاط"
                value={activityFamily}
                onChange={(event) => setActivityFamily(event.target.value)}
                className={inputCls}
              >
                <option value="all">جميع عائلات الأنشطة</option>
                {BUSINESS_ACTIVITY_FAMILY_OPTIONS.map((family) => (
                  <option key={family.id} value={family.id}>{family.label}</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400" aria-live="polite">
              {visibleBusinessTypes.length} نشاط متاح. اختيار النشاط هنا لا يحذف أو يحوّل السجلات السابقة.
            </p>
            {visibleBusinessTypes.length === 0 ? (
              <p className="rounded-lg border border-slate-200 p-4 text-center text-xs text-slate-500">لا توجد أنشطة تطابق البحث.</p>
            ) : (
              <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {visibleBusinessTypes.map((type) => {
                  const isPrimary = businessProfile.type === type.id;
                  const isAdditional = businessProfile.additionalActivityIds.includes(type.id);
                  return (
                    <article
                      key={type.id}
                      className={`rounded-xl border p-3 transition ${
                        isPrimary
                          ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-500/10'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectBusinessType(type.id)}
                        aria-pressed={isPrimary}
                        className="w-full text-right"
                      >
                        <span className="mb-1 block text-[9px] font-semibold text-sky-700 dark:text-sky-300">{type.familyLabel}</span>
                        <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">{type.label}</span>
                        <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{type.description}</span>
                      </button>
                      <label className="mt-2 flex items-center gap-2 border-t border-slate-200 pt-2 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={isAdditional}
                          disabled={isPrimary}
                          onChange={(event) => toggleAdditionalActivity(type.id, event.target.checked)}
                          className="accent-sky-600"
                        />
                        نشاط فرعي
                      </label>
                    </article>
                  );
                })}
              </div>
            )}
            <BusinessProfileSupportNotice businessType={businessProfile.type} />
            {businessProfile.type === 'custom' && (
              <Field label="اسم النشاط التجاري *">
                <input
                  value={businessProfile.customName}
                  onChange={(event) => {
                    setBusinessProfile((current) => ({ ...current, customName: event.target.value }));
                    setDirty(true);
                  }}
                  placeholder="مثال: معرض أدوات رياضية"
                  className={inputCls}
                />
              </Field>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="نموذج العمل">
                <select value={businessConfig.businessModel} onChange={(event) => updateBusinessConfig({ businessModel: event.target.value as BusinessConfiguration['businessModel'] })} className={inputCls}>
                  <option value="products">بيع منتجات</option>
                  <option value="services">تقديم خدمات</option>
                  <option value="mixed">منتجات وخدمات</option>
                </select>
              </Field>
              <Field label="إدارة المخزون">
                <Toggle checked={businessConfig.trackInventory} onChange={setInventoryEnabled} label={businessConfig.trackInventory ? 'مفعلة' : 'معطلة'} />
              </Field>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">وحدات القياس</h4>
              <div className="grid grid-cols-1  gap-2 sm:grid-cols-3">
                {BUSINESS_UNITS.map((unit) => (
                  <label key={unit.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={businessConfig.units.includes(unit.id)}
                      onChange={() => updateBusinessConfig({ units: businessConfig.units.includes(unit.id) ? businessConfig.units.filter((id) => id !== unit.id) : [...businessConfig.units, unit.id] })}
                      className="accent-sky-600"
                    />
                    {unit.label}
                  </label>
                ))}
              </div>
              <input
                value={businessConfig.customUnits.join(', ')}
                onChange={(event) => updateBusinessConfig({ customUnits: event.target.value.split(',').map((unit) => unit.trim()).filter(Boolean) })}
                className={`${inputCls} mt-2`}
                placeholder="وحدات مخصصة، مفصولة بفواصل"
              />
            </div>
            <Field label="خصائص المنتجات (مفصولة بفواصل)" full>
              <input
                value={businessConfig.productAttributes.join(', ')}
                onChange={(event) => updateBusinessConfig({ productAttributes: event.target.value.split(',').map((attribute) => attribute.trim()).filter(Boolean) })}
                className={inputCls}
                placeholder="مثال: المقاس، اللون، الموديل"
              />
            </Field>
            <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div>
                <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200">مصطلحات النشاط</h4>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  هذه الأسماء للعرض فقط؛ لا تغيّر مفاتيح البيانات أو قواعد العمليات. يسبق تخصيص المنشأة ملف النشاط ثم القيمة الافتراضية.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {BUSINESS_TERM_KEYS.map((key) => {
                  const definition = BUSINESS_TERMINOLOGY[key];
                  const value = terminologyOverrides.ar?.[key] || '';
                  const preview = resolveBusinessTerm(key, {
                    businessType: businessProfile.type,
                    language: 'ar',
                    overrides: terminologyOverrides,
                  });
                  const source = TerminologyService.getSource(
                    key,
                    businessProfile.type,
                    terminologyOverrides,
                  );
                  const sourceLabel = source === 'organization'
                    ? 'تخصيص المنشأة'
                    : source === 'profile'
                      ? 'ملف النشاط'
                      : 'الافتراضي العام';
                  return (
                    <Field key={key} label={definition.label}>
                      <div className="space-y-1.5">
                        <div className="flex gap-2">
                          <input
                            value={value}
                            onChange={(event) => updateTermOverride(key, event.target.value)}
                            className={inputCls}
                            maxLength={80}
                            placeholder={preview}
                            aria-label={`تخصيص ${definition.label}`}
                          />
                          {value && (
                            <button
                              type="button"
                              onClick={() => updateTermOverride(key, '')}
                              className="shrink-0 rounded-xl border border-slate-200 px-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              title="العودة إلى قيمة ملف النشاط"
                            >
                              افتراضي
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                          {definition.description} المعاينة: <strong>{preview}</strong> · المصدر: {sourceLabel}
                        </p>
                        <code className="block text-[9px] text-slate-400" dir="ltr">{key}</code>
                      </div>
                    </Field>
                  );
                })}
              </div>
            </section>
            <div>
              <CompaniesPanel />
            </div>
            <div>
              <h4 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">وحدات النظام</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BUSINESS_MODULES.map((module) => {
                  const definition = getModuleDefinition(module.id);
                  const unavailable = Boolean(definition?.activation.requiresInventoryTracking && !businessConfig.trackInventory);
                  return (
                    <label
                      key={module.id}
                      title={definition?.description}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300 ${unavailable ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={businessProfile.enabledModules.includes(module.id)}
                        onChange={() => toggleBusinessModule(module.id)}
                        disabled={unavailable}
                        className="accent-sky-600"
                      />
                      {module.label}
                    </label>
                  );
                })}
              </div>
            </div>
            {canViewConfigHistory && (
              <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-labelledby="activity-configuration-history">
                <div className="flex items-start gap-2">
                  <History className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
                  <div>
                    <h4 id="activity-configuration-history" className="text-xs font-extrabold text-slate-800 dark:text-slate-200">سجل إصدارات التكوين</h4>
                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      الإصدارات محفوظة كسجل إضافي غير قابل للتعديل. تحميل إصدار يجهزه للمراجعة؛ الحفظ يمر بفحوص الوحدات والاعتمادات المعتادة.
                    </p>
                  </div>
                </div>
                {configurationHistoryError && (
                  <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                    تعذر تحميل سجل التكوين: {configurationHistoryError}
                  </p>
                )}
                {!configurationHistoryError && configurationVersions.length === 0 && (
                  <p className="rounded-lg border border-slate-200 px-3 py-3 text-center text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    لا توجد إصدارات محفوظة بعد. سيُحفظ إصدار عند إنهاء الإعداد أو حفظ تغيير في النشاط.
                  </p>
                )}
                {configurationVersions.length > 0 && (
                  <>
                    <div className="max-h-56 space-y-2 overflow-y-auto">
                      {configurationVersions.map((version) => {
                        const activity = BUSINESS_TYPES.find((type) => type.id === version.snapshot.businessType);
                        return (
                          <article key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">
                                الإصدار {version.version} · {version.snapshot.businessTypeLabel || activity?.label || version.snapshot.businessType}
                              </p>
                              <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
                                {version.reason} · {version.createdByName} · {version.createdAt}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => restoreConfigurationForReview(version)}
                              disabled={readOnly}
                              className="rounded-lg border border-sky-200 px-2.5 py-1.5 text-[10px] font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40"
                            >
                              تحميل للمراجعة
                            </button>
                          </article>
                        );
                      })}
                    </div>
                    {configurationVersions.length > 1 && (
                      <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                        <h5 className="text-[11px] font-bold text-slate-700 dark:text-slate-200">مقارنة إصدارين</h5>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {[0, 1].map((index) => (
                            <select
                              key={index}
                              aria-label={`إصدار المقارنة ${index + 1}`}
                              value={compareVersionIds[index]}
                              onChange={(event) => setCompareVersionIds((current) => {
                                const next: [string, string] = [...current];
                                next[index] = event.target.value;
                                return next;
                              })}
                              className={inputCls}
                            >
                              {configurationVersions.map((version) => (
                                <option key={version.id} value={version.id}>الإصدار {version.version} · {version.createdAt}</option>
                              ))}
                            </select>
                          ))}
                        </div>
                        {comparedVersions[0] && comparedVersions[1] && (() => {
                          const first = comparedVersions[0].snapshot;
                          const second = comparedVersions[1].snapshot;
                          const activityLabel = (snapshot: typeof first) =>
                            snapshot.businessTypeLabel
                            || BUSINESS_TYPES.find((type) => type.id === snapshot.businessType)?.label
                            || snapshot.businessType;
                          const moduleLabels = (snapshot: typeof first) => snapshot.enabledModules
                            .map((id) => BUSINESS_MODULES.find((module) => module.id === id)?.label || id)
                            .sort()
                            .join('، ') || 'لا توجد وحدات';
                          const unitLabels = (snapshot: typeof first) => snapshot.configuration.units
                            .map((id) => BUSINESS_UNITS.find((unit) => unit.id === id)?.label || id)
                            .join('، ') || 'لا توجد';
                          const customTerms = (snapshot: typeof first) => Object.entries(snapshot.terminologyOverrides)
                            .flatMap(([language, terms]) => Object.entries(terms || {}).map(([key, value]) => `${language}.${key}: ${value}`))
                            .sort()
                            .join('، ') || 'لا توجد مصطلحات مخصصة';
                          const modelLabel = (model: typeof first.configuration.businessModel) => ({
                            products: 'بيع منتجات',
                            services: 'تقديم خدمات',
                            mixed: 'منتجات وخدمات',
                          })[model];
                          const comparisonRows = [
                            ['النشاط الرئيسي', activityLabel(first), activityLabel(second)],
                            ['الأنشطة الفرعية', first.configuration.additionalActivityIds.join('، ') || 'لا توجد', second.configuration.additionalActivityIds.join('، ') || 'لا توجد'],
                            ['نموذج العمل', modelLabel(first.configuration.businessModel), modelLabel(second.configuration.businessModel)],
                            ['إدارة المخزون', first.configuration.trackInventory ? 'مفعلة' : 'معطلة', second.configuration.trackInventory ? 'مفعلة' : 'معطلة'],
                            ['وحدات النظام', moduleLabels(first), moduleLabels(second)],
                            ['خصائص المنتجات', first.configuration.productAttributes.join('، ') || 'لا توجد', second.configuration.productAttributes.join('، ') || 'لا توجد'],
                            ['وحدات القياس', unitLabels(first), unitLabels(second)],
                            ['وحدات مخصصة', first.configuration.customUnits.join('، ') || 'لا توجد', second.configuration.customUnits.join('، ') || 'لا توجد'],
                            ['مصطلحات مخصصة', customTerms(first), customTerms(second)],
                          ];
                          return (
                            <div className="space-y-1.5">
                              {comparisonRows.map(([label, firstValue, secondValue]) => (
                                <div key={label} className={`grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-md px-2 py-1.5 text-[9px] ${firstValue === secondValue ? 'bg-slate-50 dark:bg-slate-800/40' : 'bg-amber-50 dark:bg-amber-950/20'}`}>
                                  <span className="font-bold text-slate-600 dark:text-slate-300">{label}</span>
                                  <span className="break-words text-slate-700 dark:text-slate-200">{firstValue}</span>
                                  <span className="break-words text-slate-700 dark:text-slate-200">{secondValue}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
          </div>
        )}

        {tab === 'branding' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="اسم النظام / العلامة"><input value={settings.brandName || ''} onChange={(e) => set('brandName', e.target.value)} className={inputCls} /></Field>
              <Field label="الحروف المختصرة"><input maxLength={2} value={settings.brandShortName || ''} onChange={(e) => set('brandShortName', e.target.value)} className={`${inputCls} font-mono`} /></Field>
              <Field label="اللون الأساسي">
                <ColorInput value={settings.brandPrimaryColor || '#0284c7'} onChange={(v) => set('brandPrimaryColor', v)} />
              </Field>
              <Field label="اللون الثانوي">
                <ColorInput value={settings.brandAccentColor || '#4f46e5'} onChange={(v) => set('brandAccentColor', v)} />
              </Field>
              <Field label="وضع العرض">
                <select value={settings.themeMode || 'light'} onChange={(e) => set('themeMode', e.target.value as SystemSettings['themeMode'])} className={inputCls}>
                  <option value="light">فاتح</option>
                  <option value="dark">داكن</option>
                  <option value="system">حسب النظام</option>
                </select>
              </Field>
              <Field label="الخط">
                <select value={settings.fontFamily || 'Cairo'} onChange={(e) => set('fontFamily', e.target.value)} className={inputCls}>
                  <option value="Cairo">القاهرة</option>
                  <option value="Tajawal">تجوال</option>
                  <option value="system-ui">خط واجهة النظام</option>
                  <option value="Arial">أريال</option>
                  <option value="Tahoma">تاهوما</option>
                </select>
              </Field>
              <Field label="إظهار اسم العلامة في الهيدر">
                <Toggle checked={settings.showBrandText !== false} onChange={(v) => set('showBrandText', v)} label={settings.showBrandText !== false ? 'ظاهر' : 'مخفي'} />
              </Field>
              <Field label="تخطيط التنقل في الشاشات الكبيرة" full>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {NAVIGATION_LAYOUT_OPTIONS.map((option) => {
                    const active = (settings.navigationLayout || 'sidebar') === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => set('navigationLayout', option.value)}
                        aria-pressed={active}
                        className={`rounded-xl border p-3 text-right transition ${
                          active
                            ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-500/10'
                            : 'border-slate-200 hover:border-sky-300 dark:border-slate-700'
                        }`}
                      >
                        <NavigationLayoutPreview variant={option.value} />
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{option.label}</span>
                          {active && <Check className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />}
                        </span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{option.hint}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  يطبَّق على الشاشات الكبيرة (1024px فأكثر). الشاشات الصغيرة تبقى على القائمة المنسدلة دائمًا.
                </p>
              </Field>
              <Field label="شعار الصورة">
                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Upload className="h-4 w-4" /> اختيار صورة
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
                  </label>
                  {settings.brandLogoDataUrl && (
                    <button onClick={() => set('brandLogoDataUrl', '')} className="rounded-lg border border-rose-200 px-2 py-2 text-[11px] font-bold text-rose-500 hover:bg-rose-50 dark:border-rose-500/30">
                      إزالة
                    </button>
                  )}
                </div>
              </Field>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="mb-2 text-xs font-bold text-slate-500">معاينة فورية</div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-lg font-black text-white shadow-lg" style={previewStyle}>
                  {settings.brandLogoDataUrl ? (
                    <img src={settings.brandLogoDataUrl} alt="الشعار" className="h-full w-full object-cover" />
                  ) : (
                    (settings.brandShortName === 'C' ? 'س' : settings.brandShortName || 'س').slice(0, 2)
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold text-slate-900 dark:text-slate-100">{settings.brandName || 'سيراميسيس'}</div>
                  <div className="truncate text-[11px] text-slate-500">{settings.showroomName}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="h-8 flex-1 rounded-lg" style={{ background: settings.brandPrimaryColor }} />
                <span className="h-8 flex-1 rounded-lg" style={{ background: settings.brandAccentColor }} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                يُحفظ الشعار داخل قاعدة البيانات (Base64). للشعارات الكبيرة يُفضّل استخدام صورة مضغوطة أقل من 400KB.
              </p>
            </div>
          </div>
        )}

        {tab === 'invoice' && (
          <div className="space-y-6">
            {/* Action Bar Header */}
            <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 to-indigo-50/40 p-4 dark:border-sky-900/30 dark:from-sky-950/20 dark:to-indigo-950/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-600/20">
                    <Printer className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                      إدارة الفواتير والطباعة الشاملة
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      اعتماد الفورما الرسمية، اختيار المقاس المفضل، وتهيئة طابعة كل مقاس من مكان واحد موحد مع معاينة حية.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewTemplate((settings.defaultInvoiceTemplate as InvoiceTemplateId) || 'table');
                      setPreviewSize((settings.defaultInvoiceSize as InvoiceSizeId) || 'a4');
                      setPreviewModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition"
                  >
                    <Eye className="w-4 h-4" />
                    معاينة حيّة للفورم
                  </button>

                  <button
                    type="button"
                    disabled={isScanningPrinters}
                    onClick={() => scanPrinters(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-bold transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningPrinters ? 'animate-spin' : ''}`} />
                    {isScanningPrinters ? 'جاري الفحص...' : 'استكشاف الطابعات'}
                  </button>
                </div>
              </div>

              {scannedPrintersCount !== null && (
                <div className="mt-2.5 text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>تم العثور على {scannedPrintersCount} طابعة مثبتة في النظام. يمكنك الآن اختيارها مباشرة من القوائم أدناه.</span>
                </div>
              )}
            </div>

            {/* Section 1: Template Approval & Favorite Size */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-sky-600" />
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
                    اعتماد الفورما والمفضلة (Invoice Form Approval)
                  </h4>
                </div>
                <span className="text-[11px] text-slate-500">
                  الفورما والمقاس المعتمدان سيتم تطبيقهما تلقائياً على كافة مبيعات ونقاط بيع النظام
                </span>
              </div>

              {/* Template Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {[
                  {
                    key: 'table',
                    id: 'table' as const,
                    size: undefined as InvoiceSizeId | undefined,
                    title: 'جدول واضح',
                    tag: 'Table-first',
                    desc: 'تخطيط هادئ يضع جدول البنود والإجماليات في المقدمة ويخفي التفاصيل الاختيارية.',
                    icon: TableIcon,
                  },
                  {
                    key: 'classic',
                    id: 'classic' as const,
                    size: undefined as InvoiceSizeId | undefined,
                    title: 'كلاسيكي رسمي (Classic)',
                    tag: 'النمط التقليدي',
                    desc: 'ترويسة مؤسسية متوازنة، جداول واضحة بتفقيط ومربعات مجاميع معتمدة ومناسبة للأعمال الرسمية.',
                    icon: FileText,
                  },
                  {
                    key: 'modern',
                    id: 'modern' as const,
                    size: undefined as InvoiceSizeId | undefined,
                    title: 'عصري حديث (Modern)',
                    tag: 'تصميم معاصر',
                    desc: 'مظهر أنيق جذاب بلمسات تدرج ملونة، بطاقات بيانات للعميل والمخزن، وبادجات دفع بارزة.',
                    icon: Sparkles,
                  },
                  {
                    key: 'compact',
                    id: 'compact' as const,
                    size: undefined as InvoiceSizeId | undefined,
                    title: 'مدمج واقتصادي (Compact)',
                    tag: 'توفير الورق',
                    desc: 'تصميم كثيف عالي الكفاءة يقلل استهلاك الورق ويسرّع الطباعة المباشرة، ممتاز للعمليات الكثيفة.',
                    icon: LayoutTemplate,
                  },
                  {
                    key: 'detailed',
                    id: 'detailed' as const,
                    size: undefined as InvoiceSizeId | undefined,
                    title: 'تفصيلي للمعارض',
                    tag: 'مواصفات السيراميك',
                    desc: 'مصمم خصيصاً لمعارض السيراميك والمواد: تفاصيل الفرز، المقاس، الكراتين، المستودع، وضمان الاستلام.',
                    icon: Layers,
                  },
                  {
                    key: 'thermal',
                    id: 'compact' as const,
                    size: 'thermal' as InvoiceSizeId,
                    title: 'إيصال حراري',
                    tag: 'Compact thermal',
                    desc: 'نسخة حرارية سريعة؛ اعتمادها يختار المقاس الحراري مع الحفاظ على قالب Compact.',
                    icon: Printer,
                  },
                ].map((tpl) => {
                  const isApproved = (settings.defaultInvoiceTemplate || 'table') === tpl.id
                    && (!tpl.size || (settings.defaultInvoiceSize || 'a4') === tpl.size);
                  const Icon = tpl.icon;
                  return (
                    <div
                      key={tpl.key}
                      className={`relative flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                        isApproved
                          ? 'border-sky-500 bg-sky-50/40 dark:border-sky-500/60 dark:bg-sky-950/20 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <span className="flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-200">
                            <Icon className={`w-3.5 h-3.5 ${isApproved ? 'text-sky-600' : 'text-slate-500'}`} />
                            {tpl.title}
                          </span>
                          {isApproved && (
                            <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-600 text-white text-[10px] font-black">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              معتمدة
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                          {tpl.desc}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                        <button
                          type="button"
                          onClick={() => {
                            set('defaultInvoiceTemplate', tpl.id);
                            if (tpl.size) set('defaultInvoiceSize', tpl.size);
                            toast.success(`تم اعتماد فورما "${tpl.title}" كالفورما المفضلة للنظام.`);
                          }}
                          disabled={readOnly || isApproved}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold text-center transition ${
                            isApproved
                              ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 cursor-default'
                              : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-sky-50 hover:text-sky-700 border border-slate-200 dark:border-slate-600'
                          }`}
                        >
                          {isApproved ? '✓ معتمدة حالياً' : 'اعتماد كمعتمدة'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewTemplate(tpl.id);
                            if (tpl.size) setPreviewSize(tpl.size);
                            setPreviewModalOpen(true);
                          }}
                          className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-300 text-[11px] font-bold"
                          title="معاينة هذه الفورما"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Favorite Size Selector */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      المقاس المفضل (الافتراضي للطباعة)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      المقاس المحدد سيتم اختياره تلقائياً عند طلب طباعة أو تصدير الفواتير
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800 shrink-0">
                    المقاس المعتمد حالياً: {(settings.defaultInvoiceSize || 'a4').toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'a4' as const, label: 'مقاس A4 كامل', dim: '210 × 297 مم', desc: 'الأكثر شيوعاً للمستندات والملفات الرسمية' },
                    { id: 'a5' as const, label: 'مقاس A5 نصف صفحة', dim: '148 × 210 مم', desc: 'اقتصادي وسريع للفواتير الميدانية والمختصرة' },
                    { id: 'thermal' as const, label: 'إيصال حراري (كاشير)', dim: '80 مم / 58 مم', desc: 'لنقاط البيع السريعة ورول ماكينات الكاشير' },
                  ].map((sz) => {
                    const isSelected = (settings.defaultInvoiceSize || 'a4') === sz.id;
                    return (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() => {
                          set('defaultInvoiceSize', sz.id);
                          toast.success(`تم اعتماد مقاس ${sz.label} كمقاس افتراضي للطباعة.`);
                        }}
                        className={`flex flex-col text-right p-3 rounded-xl border transition ${
                          isSelected
                            ? 'border-sky-500 bg-white dark:bg-slate-900 shadow-sm ring-2 ring-sky-500/20'
                            : 'border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            {isSelected ? <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block" />}
                            {sz.label}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {sz.dim}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{sz.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
              <div className="flex items-start gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <SlidersHorizontal className="mt-0.5 h-4 w-4 text-sky-600" />
                <div>
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">تفاصيل الفاتورة ومظهرها</h4>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    تُحفظ البيانات كما هي؛ هذه الخيارات تحدد ما يظهر في النسخة المطبوعة فقط. اللونان يستخدمان إعدادات الهوية المشتركة.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { key: 'invoiceShowPromotions' as const, label: 'إظهار تفاصيل العروض والقسائم' },
                  { key: 'invoiceShowShipping' as const, label: 'إظهار تفاصيل الشحن والتوصيل' },
                  { key: 'invoiceShowPaymentSplits' as const, label: 'إظهار تفاصيل الدفعات المجزأة' },
                  { key: 'invoiceShowNotes' as const, label: 'إظهار الملاحظات الإضافية' },
                ].map((option) => (
                  <label key={option.key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={settings[option.key] === true}
                      disabled={readOnly}
                      onChange={(event) => set(option.key, event.target.checked)}
                      className="accent-sky-600"
                    />
                    {option.label}
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <span className={labelCls}>ترتيب التفاصيل الاختيارية في الفاتورة</span>
                  {invoiceSectionOrder.map((section, index) => {
                    const option = INVOICE_SECTION_OPTIONS.find((item) => item.id === section)!;
                    return (
                      <div key={section} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-700">
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{index + 1}. {option.label}</span>
                        <div className="flex gap-1">
                          <button type="button" aria-label={`تحريك ${option.label} لأعلى`} disabled={readOnly || index === 0} onClick={() => moveInvoiceSection(section, -1)} className="rounded border border-slate-200 p-1 text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button type="button" aria-label={`تحريك ${option.label} لأسفل`} disabled={readOnly || index === invoiceSectionOrder.length - 1} onClick={() => moveInvoiceSection(section, 1)} className="rounded border border-slate-200 p-1 text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="اللون الأساسي">
                      <ColorInput disabled={readOnly} value={settings.brandPrimaryColor || '#0284c7'} onChange={(value) => set('brandPrimaryColor', value)} />
                    </Field>
                    <Field label="اللون المساند">
                      <ColorInput disabled={readOnly} value={settings.brandAccentColor || '#4f46e5'} onChange={(value) => set('brandAccentColor', value)} />
                    </Field>
                  </div>
                  <Field label="خط الفاتورة">
                    <select disabled={readOnly} value={settings.invoiceFontFamily || 'Cairo'} onChange={(event) => set('invoiceFontFamily', event.target.value as SystemSettings['invoiceFontFamily'])} className={inputCls}>
                      <option value="Cairo">القاهرة</option>
                      <option value="Tajawal">تجوال</option>
                      <option value="Tahoma">تاهوما</option>
                      <option value="Arial">أريال</option>
                    </select>
                  </Field>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={settings.invoiceShowBrandLogo !== false} disabled={readOnly} onChange={(event) => set('invoiceShowBrandLogo', event.target.checked)} className="accent-sky-600" />
                      إظهار شعار المعرض
                    </label>
                    <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                      <Upload className="mr-1 inline h-3 w-3" />{settings.brandLogoDataUrl ? 'تغيير الشعار' : 'رفع الشعار'}
                      <input type="file" accept="image/*" disabled={readOnly} className="hidden" onChange={(event) => onLogo(event.target.files?.[0])} />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* Section: Invoice Items Table Customization Design */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-sky-600" />
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
                      تصميم شكل جدول الأصناف في الفواتير (Invoice Items Table Styling)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      تخصيص نمط الحدود والتسطير، والأعمدة المعروضة في جداول الفاتورة A4 و A5 والمطبوعات
                    </p>
                  </div>
                </div>
              </div>

              {/* Table Style Options */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                  نمط تسطير الجدول
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'bordered' as const,
                      title: 'كلاسيكي بشبكة حدود (Grid Bordered)',
                      desc: 'حدود كاملة لكل خلية وعمود، النمط المعتمد الأكثر دقة ووضوحاً للمعاملات الرسمية.',
                    },
                    {
                      id: 'striped' as const,
                      title: 'عصري بسطور متناوبة (Zebra Striped)',
                      desc: 'خلفيات رمادية خفيفة متبادلة للسطور مع حدود أفقية ناعمة، مريح وسهل القراءة.',
                    },
                    {
                      id: 'minimal' as const,
                      title: 'مدمج وموفر للورق (Clean Minimal)',
                      desc: 'خطوط أفقية ناعمة فقط ومسافات مضغوطة لتقليل استهلاك حبر وطباعة الورق.',
                    },
                  ].map((styleOption) => {
                    const isSelected = (settings.invoiceTableStyle || 'minimal') === styleOption.id;
                    return (
                      <button
                        key={styleOption.id}
                        type="button"
                        disabled={readOnly}
                        onClick={() => set('invoiceTableStyle', styleOption.id)}
                        className={`p-3 rounded-xl border text-right transition flex flex-col justify-between ${
                          isSelected
                            ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 ring-1 ring-sky-500 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {styleOption.title}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-sky-600" />}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            {styleOption.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Column Visibility Toggles */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                  تخصيص أعمدة وبيانات بنود الفاتورة
                </label>
                <p className="mb-2 text-[10px] text-slate-500">
                  اختر الأعمدة ورتّبها من الأعلى إلى الأسفل؛ اسم الصنف مطلوب دائماً، والخصومات والكراتين مخفية افتراضياً.
                </p>
                <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {INVOICE_COLUMN_OPTIONS.map((column) => {
                    const selected = invoiceTableColumns.includes(column.id);
                    const position = invoiceTableColumns.indexOf(column.id);
                    return (
                      <div key={column.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-700">
                        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={readOnly || column.id === 'product'}
                            onChange={(event) => setInvoiceTableColumn(column.id, event.target.checked)}
                            className="accent-sky-600"
                          />
                          {column.label}
                        </label>
                        {selected && (
                          <div className="flex gap-1">
                            <button type="button" aria-label={`تحريك ${column.label} لأعلى`} disabled={readOnly || position === 0} onClick={() => moveInvoiceTableColumn(column.id, -1)} className="rounded border border-slate-200 p-1 text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button type="button" aria-label={`تحريك ${column.label} لأسفل`} disabled={readOnly || position === invoiceTableColumns.length - 1} onClick={() => moveInvoiceTableColumn(column.id, 1)} className="rounded border border-slate-200 p-1 text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={settings.invoiceShowItemCode !== false}
                      disabled={readOnly}
                      onChange={(e) => set('invoiceShowItemCode', e.target.checked)}
                      className="accent-sky-600 rounded"
                    />
                    إظهار كود الصنف (SKU / الباركود)
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={settings.invoiceShowItemSpecs !== false}
                      disabled={readOnly}
                      onChange={(e) => set('invoiceShowItemSpecs', e.target.checked)}
                      className="accent-sky-600 rounded"
                    />
                    إظهار المقاس وفرز الصنف
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={invoiceTableColumns.includes('boxes') || invoiceTableColumns.includes('pieces')}
                      disabled={readOnly}
                      onChange={(e) => setInvoiceTableColumnGroup(['boxes', 'pieces'], e.target.checked)}
                      className="accent-sky-600 rounded"
                    />
                    إظهار عدد الكراتين والقطع
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={invoiceTableColumns.includes('lineDiscount')}
                      disabled={readOnly}
                      onChange={(e) => setInvoiceTableColumn('lineDiscount', e.target.checked)}
                      className="accent-sky-600 rounded"
                    />
                    إظهار عمود الخصم للبند
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={settings.invoiceShowTableSummary !== false}
                      disabled={readOnly}
                      onChange={(e) => set('invoiceShowTableSummary', e.target.checked)}
                      className="accent-sky-600 rounded"
                    />
                    إظهار شريط ملخص الجدول (إجمالي البنود والكميات)
                  </label>
                </div>
              </div>

              {/* Table Live Mini-Preview */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <span className="text-[11px] font-bold text-slate-500 mb-2 block">
                  معاينة مباشرة لشكل جدول الأصناف:
                </span>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b-2 border-slate-300 dark:border-slate-700">
                        <th className="p-2 w-8 border border-slate-200 dark:border-slate-700">#</th>
                        <th className="p-2 text-right border border-slate-200 dark:border-slate-700">الصنف والبيان</th>
                        <th className="p-2 border border-slate-200 dark:border-slate-700">الوحدة</th>
                        <th className="p-2 border border-slate-200 dark:border-slate-700">الكمية</th>
                        <th className="p-2 border border-slate-200 dark:border-slate-700">السعر</th>
                        {settings.invoiceShowLineDiscount !== false && (
                          <th className="p-2 border border-slate-200 dark:border-slate-700">الخصم</th>
                        )}
                        <th className="p-2 border border-slate-200 dark:border-slate-700">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={`${
                        settings.invoiceTableStyle === 'striped' ? 'bg-slate-50/60 dark:bg-slate-800/30' : ''
                      } ${settings.invoiceTableStyle === 'minimal' ? 'border-b border-slate-100 dark:border-slate-800' : 'border-b border-slate-200 dark:border-slate-700'}`}>
                        <td className="p-2 border border-slate-200 dark:border-slate-700 text-slate-400">1</td>
                        <td className="p-2 text-right border border-slate-200 dark:border-slate-700">
                          <div className="font-bold text-slate-900 dark:text-slate-100">سيراميك كليوباترا رويال بيج 60×120</div>
                          <div className="text-[10px] text-slate-500 flex gap-2 mt-0.5">
                            {settings.invoiceShowItemCode !== false && <span>كود: CL-6012-ROY</span>}
                            {settings.invoiceShowItemSpecs !== false && <span>مقاس: 60×120 · فرز أول</span>}
                          </div>
                        </td>
                        <td className="p-2 border border-slate-200 dark:border-slate-700">م²</td>
                        <td className="p-2 border border-slate-200 dark:border-slate-700 font-bold">
                          45 م²
                          {settings.invoiceShowBoxesCount !== false && (
                            <div className="text-[10px] text-slate-400 font-normal">31 كرتونة</div>
                          )}
                        </td>
                        <td className="p-2 border border-slate-200 dark:border-slate-700">220.00</td>
                        {settings.invoiceShowLineDiscount !== false && (
                          <td className="p-2 border border-slate-200 dark:border-slate-700 text-slate-400">—</td>
                        )}
                        <td className="p-2 border border-slate-200 dark:border-slate-700 font-black text-sky-600">9,900.00</td>
                      </tr>
                      <tr className={`${
                        settings.invoiceTableStyle === 'striped' ? 'bg-white dark:bg-slate-900' : ''
                      } ${settings.invoiceTableStyle === 'minimal' ? 'border-b border-slate-100 dark:border-slate-800' : 'border-b border-slate-200 dark:border-slate-700'}`}>
                        <td className="p-2 border border-slate-200 dark:border-slate-700 text-slate-400">2</td>
                        <td className="p-2 text-right border border-slate-200 dark:border-slate-700">
                          <div className="font-bold text-slate-900 dark:text-slate-100">غراء سيراميك سافيتو سوبر 25 كجم</div>
                          <div className="text-[10px] text-slate-500 flex gap-2 mt-0.5">
                            {settings.invoiceShowItemCode !== false && <span>كود: SAV-25KG-SUP</span>}
                          </div>
                        </td>
                        <td className="p-2 border border-slate-200 dark:border-slate-700">شيكارة</td>
                        <td className="p-2 border border-slate-200 dark:border-slate-700 font-bold">5</td>
                        <td className="p-2 border border-slate-200 dark:border-slate-700">110.00</td>
                        {settings.invoiceShowLineDiscount !== false && (
                          <td className="p-2 border border-slate-200 dark:border-slate-700 text-rose-600 font-bold">25.00</td>
                        )}
                        <td className="p-2 border border-slate-200 dark:border-slate-700 font-black text-sky-600">525.00</td>
                      </tr>
                    </tbody>
                  </table>
                  {settings.invoiceShowTableSummary !== false && (
                    <div className="p-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 flex justify-around text-[11px] text-slate-600 dark:text-slate-300">
                      <span>عدد البنود: <strong>2</strong></span>
                      <span>إجمالي الكراتين: <strong>31</strong></span>
                      <span>إجمالي الكمية: <strong>50</strong></span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Unified Printer Setup For Each Size (All in one place) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-sky-600" />
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
                      طابعة كل مقاس من مكان واحد (Unified Printers Hub)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      اضبط الطابعة المخصصة لكل حجم (A4، A5، إيصالات كاشير، باركود) بسهولة مع إمكانية تجربة الطباعة فوراً
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scanPrinters(true)}
                    className="text-[11px] font-bold text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isScanningPrinters ? 'animate-spin' : ''}`} />
                    تحديث طابعات ويندوز
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* A4 Printer */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Printer className="w-3.5 h-3.5 text-sky-600" />
                      طابعة مقاس A4 (فواتير كاملة)
                    </label>
                    <button
                      type="button"
                      onClick={() => printService.printTestPage('a4', (settings.defaultInvoiceTemplate as InvoiceTemplateId) || 'table')}
                      className="text-[11px] font-bold text-sky-600 hover:underline"
                    >
                      تجربة طباعة A4
                    </button>
                  </div>

                  {systemPrinters.length > 0 ? (
                    <div className="flex gap-2">
                      <select
                        value={settings.a4PrinterName || ''}
                        onChange={(e) => set('a4PrinterName', e.target.value)}
                        className={inputCls}
                      >
                        <option value="">-- اختر طابعة من النظام --</option>
                        {systemPrinters.map((p) => (
                          <option key={p} value={p}>{p} {p === settings.a4PrinterName ? '✓' : ''}</option>
                        ))}
                      </select>
                      <input
                        value={settings.a4PrinterName || ''}
                        onChange={(e) => set('a4PrinterName', e.target.value)}
                        placeholder="أو اكتب الاسم يدوياً"
                        className={`${inputCls} max-w-[140px]`}
                        title="كتابة الاسم يدوياً"
                      />
                    </div>
                  ) : (
                    <input
                      value={settings.a4PrinterName || ''}
                      onChange={(e) => set('a4PrinterName', e.target.value)}
                      placeholder="مثال: HP LaserJet Pro M404"
                      className={inputCls}
                    />
                  )}
                  <p className="text-[10px] text-slate-400">تُستخدم لطباعة الفواتير، عروض الأسعار، وسندات المرتجع بمقاس A4.</p>
                </div>

                {/* A5 Printer */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Printer className="w-3.5 h-3.5 text-sky-600" />
                      طابعة مقاس A5 (نصف صفحة)
                    </label>
                    <button
                      type="button"
                      onClick={() => printService.printTestPage('a5', (settings.defaultInvoiceTemplate as InvoiceTemplateId) || 'table')}
                      className="text-[11px] font-bold text-sky-600 hover:underline"
                    >
                      تجربة طباعة A5
                    </button>
                  </div>

                  {systemPrinters.length > 0 ? (
                    <div className="flex gap-2">
                      <select
                        value={settings.a5PrinterName || ''}
                        onChange={(e) => set('a5PrinterName', e.target.value)}
                        className={inputCls}
                      >
                        <option value="">-- اختر طابعة من النظام --</option>
                        {systemPrinters.map((p) => (
                          <option key={p} value={p}>{p} {p === settings.a5PrinterName ? '✓' : ''}</option>
                        ))}
                      </select>
                      <input
                        value={settings.a5PrinterName || ''}
                        onChange={(e) => set('a5PrinterName', e.target.value)}
                        placeholder="أو اكتب الاسم يدوياً"
                        className={`${inputCls} max-w-[140px]`}
                        title="كتابة الاسم يدوياً"
                      />
                    </div>
                  ) : (
                    <input
                      value={settings.a5PrinterName || ''}
                      onChange={(e) => set('a5PrinterName', e.target.value)}
                      placeholder="مثال: Epson L3150 (A5)"
                      className={inputCls}
                    />
                  )}
                  <p className="text-[10px] text-slate-400">تُستخدم للطباعة على دفاتر أو ورق A5 الاقتصادي نصف الحجم.</p>
                </div>

                {/* Thermal Printer */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 space-y-2.5 md:col-span-2">
                  <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Printer className="w-3.5 h-3.5 text-amber-600" />
                      طابعة الإيصالات الحرارية (كاشير ونقاط البيع POS Thermal)
                    </label>
                    <button
                      type="button"
                      onClick={() => printService.printTestPage('thermal')}
                      className="text-[11px] font-bold text-amber-600 hover:underline"
                    >
                      تجربة طباعة إيصال حراري
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>اسم طابعة الإيصالات</label>
                      {systemPrinters.length > 0 ? (
                        <div className="flex gap-2">
                          <select
                            value={settings.thermalPrinterName || ''}
                            onChange={(e) => set('thermalPrinterName', e.target.value)}
                            className={inputCls}
                          >
                            <option value="">-- اختر طابعة من النظام --</option>
                            {systemPrinters.map((p) => (
                              <option key={p} value={p}>{p} {p === settings.thermalPrinterName ? '✓' : ''}</option>
                            ))}
                          </select>
                          <input
                            value={settings.thermalPrinterName || ''}
                            onChange={(e) => set('thermalPrinterName', e.target.value)}
                            placeholder="يدوي"
                            className={`${inputCls} max-w-[120px]`}
                          />
                        </div>
                      ) : (
                        <input
                          value={settings.thermalPrinterName || ''}
                          onChange={(e) => set('thermalPrinterName', e.target.value)}
                          placeholder="مثال: Xprinter XP-N160I أو POS-80"
                          className={inputCls}
                        />
                      )}
                    </div>

                    <div>
                      <label className={labelCls}>عرض ورق الإيصال</label>
                      <select
                        value={settings.thermalPaperWidth || '80'}
                        onChange={(e) => set('thermalPaperWidth', e.target.value as '58' | '80')}
                        className={inputCls}
                      >
                        <option value="80">80 مم (الأكثر شيوعاً - 48 حرفاً)</option>
                        <option value="58">58 مم (شريط ضيق - 32 حرفاً)</option>
                      </select>
                    </div>

                    <div>
                      <label className={labelCls}>كود ترميز الأحرف (Codepage)</label>
                      <select
                        value={settings.thermalCodepage ?? 54}
                        onChange={(e) => set('thermalCodepage', Number(e.target.value))}
                        className={inputCls}
                      >
                        <option value={54}>54 — عربي ويندوز-1256 (الأغلب)</option>
                        <option value={32}>32 — عربي (بعض الأجهزة)</option>
                        <option value={16}>16 — WPC1256 (أجهزة أخرى)</option>
                      </select>
                    </div>

                    <div>
                      <label className={labelCls}>طريقة التوصيل</label>
                      <select
                        value={settings.thermalTransport || 'system'}
                        onChange={(e) => set('thermalTransport', e.target.value as 'system' | 'network')}
                        className={inputCls}
                      >
                        <option value="system">طابعة مثبتة في النظام (USB)</option>
                        <option value="network">طابعة شبكية مباشرة (TCP 9100)</option>
                      </select>
                    </div>

                    {settings.thermalTransport === 'network' && (
                      <>
                        <div className="sm:col-span-2">
                          <label className={labelCls}>عنوان IPv4 الخاص بالطابعة الشبكية</label>
                          <input
                            value={settings.thermalHost || ''}
                            onChange={(e) => set('thermalHost', e.target.value)}
                            placeholder="مثال: 192.168.1.150"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>منفذ الطباعة (Port)</label>
                          <input value="9100" readOnly className={`${inputCls} bg-slate-100 dark:bg-slate-700/50`} />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Barcode / Labels Printer */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Printer className="w-3.5 h-3.5 text-indigo-600" />
                      طابعة ملصقات الباركود والأصناف (Barcode Labels Printer)
                    </label>
                  </div>

                  {systemPrinters.length > 0 ? (
                    <div className="flex gap-2">
                      <select
                        value={settings.barcodePrinterName || ''}
                        onChange={(e) => set('barcodePrinterName', e.target.value)}
                        className={inputCls}
                      >
                        <option value="">-- اختر طابعة ملصقات من النظام --</option>
                        {systemPrinters.map((p) => (
                          <option key={p} value={p}>{p} {p === settings.barcodePrinterName ? '✓' : ''}</option>
                        ))}
                      </select>
                      <input
                        value={settings.barcodePrinterName || ''}
                        onChange={(e) => set('barcodePrinterName', e.target.value)}
                        placeholder="أو اكتب الاسم يدوياً"
                        className={`${inputCls} max-w-[160px]`}
                      />
                    </div>
                  ) : (
                    <input
                      value={settings.barcodePrinterName || ''}
                      onChange={(e) => set('barcodePrinterName', e.target.value)}
                      placeholder="مثال: Xprinter XP-365B أو Zebra ZD220"
                      className={inputCls}
                    />
                  )}
                  <p className="text-[10px] text-slate-400">تُستخدم لطباعة ملصقات الباركود، كود التخزين، وأسعار البضائع على الرفوف.</p>
                </div>
              </div>
            </div>

            {/* Section 3: Header & Footer Text */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
                نصوص الترويسة والتذييل وشروط الاسترجاع
              </h4>

              <div className="grid grid-cols-1 gap-3">
                <Field label="ترويسة الفاتورة (نص إضافي أو رسالة ترحيبية)">
                  <textarea
                    rows={2}
                    value={settings.receiptHeader || ''}
                    onChange={(e) => set('receiptHeader', e.target.value)}
                    placeholder="مثال: أهلاً بكم في معرضنا - نسعد بخدمتكم دائماً"
                    className={inputCls}
                  />
                </Field>
                <Field label="تذييل الفاتورة وشروط الاسترجاع والاستبدال">
                  <textarea
                    rows={3}
                    value={settings.receiptFooter || ''}
                    onChange={(e) => set('receiptFooter', e.target.value)}
                    placeholder="مثال: البضاعة المباعة ترد وتستبدل خلال 14 يوماً مع إحضار أصل الفاتورة وبحالتها الأصلية بالكرتونة السليمة."
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>

            {/* Live Form Preview Modal */}
            {previewModalOpen && (
              createPortal(
                <div
                  className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5"
                  dir="rtl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="معاينة حيّة للفورم والمقاسات"
                >
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-6xl h-[94dvh] max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  {/* Modal Header */}
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
                        <Eye className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          معاينة حيّة للفورم والمقاسات
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">
                            بيانات تجريبية لمعرض سيراميك
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          يمكنك تجربة الفورمات والمقاسات المختلفة واعتماد المناسب منها بضغطة زر واحدة
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => {
                          set('defaultInvoiceTemplate', previewTemplate);
                          set('defaultInvoiceSize', previewSize);
                          toast.success('تم اعتماد هذه الفورما وهذا المقاس كمفضلين للنظام بنجاح.');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        اعتماد هذه الفورما الآن
                      </button>

                      <button
                        type="button"
                        onClick={() => printService.printTestPage(previewSize, previewTemplate)}
                        className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        طباعة تجريبية
                      </button>

                      <button
                        type="button"
                        onClick={() => setPreviewModalOpen(false)}
                        className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Template & Size Switcher Bar */}
                  <div className="px-4 py-2.5 bg-slate-100/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-600 dark:text-slate-300">الفورما:</span>
                      {[
                        { id: 'table' as const, label: 'جدول واضح' },
                        { id: 'classic' as const, label: 'كلاسيكي' },
                        { id: 'modern' as const, label: 'عصري' },
                        { id: 'compact' as const, label: 'مدمج' },
                        { id: 'detailed' as const, label: 'تفصيلي للمعارض' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setPreviewTemplate(t.id)}
                          className={`px-2.5 py-1 rounded-lg font-bold transition ${
                            previewTemplate === t.id
                              ? 'bg-sky-600 text-white shadow-sm'
                              : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-600 dark:text-slate-300">المقاس:</span>
                      {[
                        { id: 'a4' as const, label: 'A4' },
                        { id: 'a5' as const, label: 'A5' },
                        { id: 'thermal' as const, label: 'حراري (Thermal)' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setPreviewSize(s.id)}
                          className={`px-2.5 py-1 rounded-lg font-bold transition ${
                            previewSize === s.id
                              ? 'bg-sky-600 text-white shadow-sm'
                              : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Iframe Preview Container */}
                  <div className="flex-1 bg-slate-200/70 dark:bg-slate-950 p-2 sm:p-4 overflow-auto flex items-center justify-center">
                    <div className={`bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-200 h-full ${
                      previewSize === 'thermal'
                        ? 'w-[360px]'
                        : previewSize === 'a5'
                        ? 'w-[680px]'
                        : 'w-[840px] max-w-full'
                    }`}>
                      <iframe
                        title="معاينة الفورما"
                        srcDoc={printService.getTemplatePreviewHtml(previewTemplate, previewSize, settings)}
                        className="w-full h-full border-none bg-white"
                      />
                    </div>
                  </div>
                </div>
                </div>,
                document.body,
              )
            )}
          </div>
        )}

        {tab === 'inventory' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="طريقة التكلفة">
              <select value={settings.costingMethod} onChange={(e) => set('costingMethod', e.target.value as SystemSettings['costingMethod'])} className={inputCls}>
                <option value="AVERAGE_COST">متوسط التكلفة المرجح</option>
                <option value="FIFO">FIFO (الوارد أولاً يصرف أولاً)</option>
              </select>
            </Field>
            <p className="text-xs text-amber-700 md:col-span-2">الرصيد الموجود عند تفعيل FIFO يبدأ بطبقة افتتاحية تقديرية حسب تكلفة الصنف الحالية؛ الدقة الفعلية للدفعات الجديدة تبدأ من تاريخ التفعيل.</p>
            <Field label="السماح بالمخزون السالب">
              <Toggle checked={settings.enableNegativeStock} onChange={(v) => set('enableNegativeStock', v)} label={settings.enableNegativeStock ? 'مسموح' : 'ممنوع'} />
            </Field>
            <Field label="حد تنبيه المخزون المنخفض (بوحدة الصنف)">
              <input type="number" min={0} value={settings.lowStockAlertThresholdM2 ?? 20} onChange={(e) => set('lowStockAlertThresholdM2', Number(e.target.value))} className={inputCls} />
            </Field>
          </div>
        )}

        {tab === 'operations' && (
          <div className="space-y-6">
            {/* إعدادات نقطة البيع والفواتير المطابقة للتصميم */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 space-y-4">
              {/* عدد أسعار البيع للصنف مع محرر أسماء المستويات */}
              <div className="pb-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <select
                      value={settings.sellingPriceTiersCount ?? 1}
                      onChange={(e) => set('sellingPriceTiersCount', Number(e.target.value))}
                      className="min-w-[130px] px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                    >
                      <option value={1}>سعر واحد</option>
                      <option value={2}>سعران (2)</option>
                      <option value={3}>3 أسعار</option>
                      <option value={4}>4 أسعار</option>
                      <option value={5}>5 أسعار</option>
                    </select>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      كل سعر ليه اسمه — والاختيار بينهم من زر تثبيت السعر في الفاتورة
                    </p>
                  </div>
                  <label className="text-xs font-black text-slate-900 dark:text-slate-100 shrink-0">
                    عدد أسعار البيع للصنف
                  </label>
                </div>

                {/* محرر تخصيص أسماء أسعار البيع */}
                {(settings.sellingPriceTiersCount ?? 1) > 1 && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2 mt-2">
                    <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      تسمية مستويات الأسعار (تظهر في زر تثبيت السعر بنقطة البيع):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {Array.from({ length: settings.sellingPriceTiersCount ?? 1 }).map((_, tierIdx) => {
                        const defaultNames = ['سعر القطاعي (الأساسي)', 'سعر الجملة', 'سعر خاص / موزع', 'سعر مشاريع', 'سعر كبار العملاء'];
                        const currentNames = Array.isArray(settings.sellingPriceTierNames) ? [...settings.sellingPriceTierNames] : defaultNames;
                        const currentVal = currentNames[tierIdx] || defaultNames[tierIdx] || `سعر ${tierIdx + 1}`;

                        return (
                          <div key={tierIdx} className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                            <span className="font-bold text-sky-600 shrink-0 text-[11px]">{tierIdx + 1}:</span>
                            <input
                              type="text"
                              value={currentVal}
                              onChange={(e) => {
                                const updated = [...currentNames];
                                updated[tierIdx] = e.target.value;
                                set('sellingPriceTierNames', updated as any);
                              }}
                              className="w-full bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none"
                              placeholder={defaultNames[tierIdx] || `سعر ${tierIdx + 1}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* إظهار زر «نقدي» في نقطة البيع */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.posShowCashButton !== false}
                  onClick={() => set('posShowCashButton', settings.posShowCashButton === false ? true : false)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.posShowCashButton !== false ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.posShowCashButton !== false ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    إظهار زر «نقدي» في نقطة البيع
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    عند الإيقاف تكون كل الفواتير آجلة افتراضيًا
                  </div>
                </div>
              </div>

              {/* السماح بتكرار الصنف في الفاتورة */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.posAllowDuplicateItems}
                  onClick={() => set('posAllowDuplicateItems', !settings.posAllowDuplicateItems)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.posAllowDuplicateItems ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.posAllowDuplicateItems ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    السماح بتكرار الصنف في الفاتورة
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    إضافة صنف موجود بالفعل تنزّله سطرًا جديدًا مستقلاً بدل زيادة الكمية — مفيد لبيع نفس الصنف بسعرين مختلفين
                  </div>
                </div>
              </div>

              {/* الحفظ التلقائي للفاتورة */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.posAutoSaveInvoice}
                  onClick={() => set('posAutoSaveInvoice', !settings.posAutoSaveInvoice)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.posAutoSaveInvoice ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.posAutoSaveInvoice ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    الحفظ التلقائي للفاتورة
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    أول صنف يتضاف بيحفظ الفاتورة فورًا وكل إضافة بتحدّثها — بيأثر في المخزن مباشرة وبيطلب صلاحية تعديل الفواتير
                  </div>
                </div>
              </div>

              {/* اختيار أكثر من صنف من البحث */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.posMultiSelectSearch}
                  onClick={() => set('posMultiSelectSearch', !settings.posMultiSelectSearch)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.posMultiSelectSearch ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.posMultiSelectSearch ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    اختيار أكثر من صنف من البحث
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    مربع جنب كل صنف في نتايج البحث وقت عمل الفاتورة: علّم الأصناف اللي عايزها واضغط «أضف المحدد» فيتضافوا كلهم مرة واحدة بكمية 1، وتقدر بعدها تعدل الكميات والأسعار لكل صنف مباشرة من الفاتورة.
                  </div>
                </div>
              </div>

              {/* 1. السماح بالبيع على المكشوف */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.allowOverdraftSale}
                  onClick={() => set('allowOverdraftSale', !settings.allowOverdraftSale)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.allowOverdraftSale ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.allowOverdraftSale ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    السماح بالبيع على المكشوف
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    بيع كمية أكبر من المتاح بالمخزن للجميع. عند الإيقاف: المدير العام وأصحاب الصلاحية بالإعدادين اللي تحت هما بس اللي يقدروا يبيعوا على المكشوف.
                  </div>
                </div>
              </div>

              {/* 2. الصنف اللي رصيده مش كفاية يتباع كمحجوز */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.insufficientStockAsReserved}
                  onClick={() => set('insufficientStockAsReserved', !settings.insufficientStockAsReserved)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.insufficientStockAsReserved ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.insufficientStockAsReserved ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    الصنف اللي رصيده مش كفاية يتباع كمحجوز
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    بدل ما الفاتورة تترفض بتتحوّل لـ«تسليم بأذونات» لوحدها وتظهر في فواتير الأذونات — لصاحب صلاحية «بيع الصنف اللي رصيده مش كفاية كمحجوز».
                  </div>
                </div>
              </div>

              {/* 3. قفل البيع على الكمية المحجوزة */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.lockSaleOnReservedQty}
                  onClick={() => set('lockSaleOnReservedQty', !settings.lockSaleOnReservedQty)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.lockSaleOnReservedQty ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.lockSaleOnReservedQty ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    قفل البيع على الكمية المحجوزة
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    المتاح للبيع = الرصيد ناقص المحجوز لفواتير تحت التسليم في نفس المخزن. الفاتورة اللي محتاجة أكتر بتترفض ومش بتتحوّل لأذونات — إلا لصاحب الصلاحية.
                  </div>
                </div>
              </div>

              {/* 4. منع البيع بأذونات للصنف اللي مفيش منه كمية */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.preventPermitSaleWithoutStock}
                  onClick={() => set('preventPermitSaleWithoutStock', !settings.preventPermitSaleWithoutStock)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.preventPermitSaleWithoutStock ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.preventPermitSaleWithoutStock ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    منع البيع بأذونات للصنف اللي مفيش منه كمية
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    فاتورة «تسليم بأذونات» فيها صنف أكتر من المتاح في المخزن (الرصيد ناقص المحجوز) بتترفض، ومفيش تحويل تلقائي لأذونات. الزرار يفضل شغّال لكن الفاتورة تتطلب توفير الرصيد أولاً.
                  </div>
                </div>
              </div>

              {/* 5. منع إذن التسليم على المكشوف */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.preventOverdraftDeliveryPermit}
                  onClick={() => set('preventOverdraftDeliveryPermit', !settings.preventOverdraftDeliveryPermit)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.preventOverdraftDeliveryPermit ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.preventOverdraftDeliveryPermit ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    منع إذن التسليم على المكشوف
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    إذن التسليم (عمله وتعديله واعتماده و«صرف كل الباقي» وتسليم البند) بيترفض لو رصيد المخزن اللي هيتسلّم منه مش كفاية — اختار مخزن فيه البضاعة. إلا لصاحب صلاحية «عمل إذن تسليم بأكتر من رصيد المخزن»
                  </div>
                </div>
              </div>

              {/* 6. السماح للمدير العام بالبيع على المكشوف */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 p-2.5 rounded-xl">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.allowAdminOverdraftSale}
                  onClick={() => set('allowAdminOverdraftSale', !settings.allowAdminOverdraftSale)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.allowAdminOverdraftSale ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.allowAdminOverdraftSale ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    السماح للمدير العام بالبيع على المكشوف
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    لما «السماح بالبيع على المكشوف» مقفول: المدير العام ما يبيعش بأكتر من المتاح إلا لو ده مفعّل
                  </div>
                </div>
              </div>

              {/* 7. السماح لأصحاب صلاحية «البيع على المكشوف» */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 p-2.5 rounded-xl">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.allowPermissionHoldersOverdraftSale}
                  onClick={() => set('allowPermissionHoldersOverdraftSale', !settings.allowPermissionHoldersOverdraftSale)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.allowPermissionHoldersOverdraftSale ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.allowPermissionHoldersOverdraftSale ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    السماح لأصحاب صلاحية «البيع على المكشوف»
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    لما «السماح بالبيع على المكشوف» مقفول: المستخدم اللي معاه الصلاحية (زي دور «مدير فرع») ما يبيعش بأكتر من المتاح إلا لو ده مفعّل
                  </div>
                </div>
              </div>

              {/* 8. الخصم على الصنف الواحد في الفاتورة */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.allowLineItemDiscount !== false}
                  onClick={() => set('allowLineItemDiscount', settings.allowLineItemDiscount === false ? true : false)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.allowLineItemDiscount !== false ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.allowLineItemDiscount !== false ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    الخصم على الصنف الواحد في الفاتورة
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    علامة صغيرة على كل صنف في الفاتورة تحط عليه خصم (مبلغ أو نسبة) يطّلع من سعره بس. لأصحاب صلاحية «منح خصم على الفاتورة»، وبيتحسب في «أقصى خصم يدوي للكاشير»
                  </div>
                </div>
              </div>

              {/* 9. المرتجع لازم يتربط بفاتورة أو بعميل */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.returnRequiresInvoiceOrCustomer}
                  onClick={() => set('returnRequiresInvoiceOrCustomer', !settings.returnRequiresInvoiceOrCustomer)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.returnRequiresInvoiceOrCustomer ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.returnRequiresInvoiceOrCustomer ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    المرتجع لازم يتربط بفاتورة أو بعميل
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    عند التشغيل: المرتجع لازم يتربط بالفاتورة الأصلية أو بالعميل، وسعره بيتجاب من البيع الفعلي (صافي بعد الخصم). عند الإيقاف: المرتجع الحر بسعر البيع الحالي أو اليدوي متاح.
                  </div>
                </div>
              </div>

              {/* 10. الفواتير الجديدة تحت التسليم (بإذن تسليم) */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.newInvoicesUnderDelivery}
                  onClick={() => set('newInvoicesUnderDelivery', !settings.newInvoicesUnderDelivery)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.newInvoicesUnderDelivery ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.newInvoicesUnderDelivery ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    الفواتير الجديدة تحت التسليم (بإذن تسليم)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    عند التشغيل: الفاتورة الجديدة بتبدأ «تسليم على دفعات» والبضاعة ما بتخرجش من المخزن غير بإذن تسليم. عند الإيقاف: الفاتورة «تم التسليم فوراً» ويتم الخصم المباشر من المخزن.
                  </div>
                </div>
              </div>

              {/* 11. ضريبة القيمة المضافة على التوصيل */}
              <div className="flex flex-row-reverse items-center justify-between gap-4">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.vatOnDeliveryFee}
                  onClick={() => set('vatOnDeliveryFee', !settings.vatOnDeliveryFee)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.vatOnDeliveryFee ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.vatOnDeliveryFee ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    ضريبة القيمة المضافة على التوصيل
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    عند التشغيل: رسوم التوصيل في الفاتورة بتتحسب عليها ضريبة وبتدخل ضريبة الفاتورة وإجمالها، وبتنزل في الفاتورة الإلكترونية بند خاضع. عند الإيقاف: رسوم التوصيل غير خاضعة للضريبة.
                  </div>
                </div>
              </div>
            </div>

            {/* حدود الكاشير والموافقات مطابق تماماً للتصميم المرفق */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 space-y-5">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                  حدود الكاشير والموافقات
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  اللي معاه الصلاحية المباشرة بيعمل على طول، واللي صلاحيته «بموافقة المدير» بيطلب موافقة — من «الأدوار والصلاحيات». الإعدادات دي بتكمّلها.
                </p>
              </div>

              {/* أقصى خصم للكاشير من غير موافقة */}
              <div className="space-y-1.5">
                <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 px-3.5 pt-2 pb-2 focus-within:border-[#1e5871] focus-within:ring-1 focus-within:ring-[#1e5871] transition">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    أقصى خصم للكاشير من غير موافقة
                  </label>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={settings.cashierMaxDiscountPercentWithoutApproval ?? settings.discountApprovalThresholdPercent ?? 0}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        set('cashierMaxDiscountPercentWithoutApproval', val);
                        set('discountApprovalThresholdPercent', val);
                      }}
                      className="w-full bg-transparent text-sm font-black text-slate-900 dark:text-slate-100 focus:outline-none"
                    />
                    <span className="text-sm font-bold text-slate-400 select-none">%</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  الخصم اليدوي على الفاتورة فوق النسبة دي بيحتاج موافقة مدير، إلا لو المستخدم معاه صلاحية «خصم فوق الحد المسموح للكاشير». خصم العميل الدائم مسموح لحد نسبته.
                </p>
              </div>

              {/* طلب موافقة المدير عن بُعد */}
              <div className="flex flex-row-reverse items-center justify-between gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.requireRemoteManagerApproval !== false}
                  onClick={() => set('requireRemoteManagerApproval', settings.requireRemoteManagerApproval === false ? true : false)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.requireRemoteManagerApproval !== false ? 'bg-[#1e5871]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.requireRemoteManagerApproval !== false ? 'translate-x-0' : '-translate-x-5'
                    }`}
                  />
                </button>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    طلب موافقة المدير عن بُعد
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    الكاشير يبعت الطلب والمدير يوافق من موبايله أو من أي جهاز، من غير ما يكون جنبه. عند الإيقاف المدير لازم يدخّل اسمه وكلمة مروره على نفس الجهاز.
                  </div>
                </div>
              </div>

              {/* أسباب حذف سطر من الفاتورة */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                    أسباب حذف سطر من الفاتورة
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    بتظهر اختيارات سريعة في ديالوج حذف السطر في الكاشير — والكاشير يقدر يكتب سبب تاني.
                  </div>
                </div>

                {/* Chips container */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {/* أزرار الأسباب الحالية */}
                  {((Array.isArray(settings.posItemRemovalReasons) && settings.posItemRemovalReasons.length > 0)
                    ? settings.posItemRemovalReasons
                    : ['غلط في الإدخال', 'العميل غيّر رأيه', 'صنف تالف', 'سعر غلط']
                  ).map((reason, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const current = Array.isArray(settings.posItemRemovalReasons) && settings.posItemRemovalReasons.length > 0
                            ? [...settings.posItemRemovalReasons]
                            : ['غلط في الإدخال', 'العميل غيّر رأيه', 'صنف تالف', 'سعر غلط'];
                          current.splice(idx, 1);
                          set('posItemRemovalReasons', current as any);
                        }}
                        className="text-slate-400 hover:text-rose-500 transition p-0.5"
                        title="حذف هذا السبب"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <span>{reason}</span>
                    </div>
                  ))}

                  {/* زر وحقل إضافة سبب */}
                  {showAddReason ? (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[#1e5871] bg-white dark:bg-slate-800">
                      <input
                        type="text"
                        autoFocus
                        value={newReasonInput}
                        onChange={(e) => setNewReasonInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newReasonInput.trim()) {
                            e.preventDefault();
                            const current = Array.isArray(settings.posItemRemovalReasons) && settings.posItemRemovalReasons.length > 0
                              ? [...settings.posItemRemovalReasons]
                              : ['غلط في الإدخال', 'العميل غيّر رأيه', 'صنف تالف', 'سعر غلط'];
                            if (!current.includes(newReasonInput.trim())) {
                              current.push(newReasonInput.trim());
                              set('posItemRemovalReasons', current as any);
                            }
                            setNewReasonInput('');
                            setShowAddReason(false);
                          } else if (e.key === 'Escape') {
                            setShowAddReason(false);
                            setNewReasonInput('');
                          }
                        }}
                        placeholder="اكتب السبب واضغط Enter"
                        className="text-xs bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none w-36"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newReasonInput.trim()) {
                            const current = Array.isArray(settings.posItemRemovalReasons) && settings.posItemRemovalReasons.length > 0
                              ? [...settings.posItemRemovalReasons]
                              : ['غلط في الإدخال', 'العميل غيّر رأيه', 'صنف تالف', 'سعر غلط'];
                            if (!current.includes(newReasonInput.trim())) {
                              current.push(newReasonInput.trim());
                              set('posItemRemovalReasons', current as any);
                            }
                            setNewReasonInput('');
                          }
                          setShowAddReason(false);
                        }}
                        className="text-xs text-sky-600 hover:text-sky-800 font-bold px-1"
                      >
                        إضافة
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddReason(false);
                          setNewReasonInput('');
                        }}
                        className="text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddReason(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 hover:border-[#1e5871] bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-[#1e5871] transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة سبب</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="حد اعتماد الخصم %">
                <input type="number" min={0} max={100} value={settings.discountApprovalThresholdPercent ?? 10} onChange={(e) => set('discountApprovalThresholdPercent', Number(e.target.value))} className={inputCls} />
              </Field>
              <Field label="رسوم التوصيل الافتراضية">
                <input type="number" min={0} value={settings.defaultDeliveryFee ?? 0} onChange={(e) => set('defaultDeliveryFee', Number(e.target.value))} className={inputCls} />
              </Field>
              <Field label="أيام سماح الأقساط">
                <input type="number" min={0} value={settings.installmentGraceDays ?? 3} onChange={(e) => set('installmentGraceDays', Number(e.target.value))} className={inputCls} />
              </Field>
              <Field label="اعتماد إجباري لتسويات المخزون">
                <Toggle checked={!!settings.requireApprovalForStockAdjustments} onChange={(v) => set('requireApprovalForStockAdjustments', v)} label={settings.requireApprovalForStockAdjustments ? 'مطلوب' : 'غير مطلوب'} />
              </Field>
              <Field label="اعتماد إجباري لتغيير الأسعار">
                <Toggle checked={!!settings.requireApprovalForPriceChanges} onChange={(v) => set('requireApprovalForPriceChanges', v)} label={settings.requireApprovalForPriceChanges ? 'مطلوب' : 'غير مطلوب'} />
              </Field>
            </div>
          </div>
        )}

        {tab === 'security' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="مدة انتهاء الجلسة (دقائق)">
              <input type="number" min={5} value={settings.sessionTimeoutMinutes ?? 480} onChange={(e) => set('sessionTimeoutMinutes', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="أقصى محاولات دخول فاشلة">
              <input type="number" min={1} value={settings.maxFailedLoginAttempts ?? 5} onChange={(e) => set('maxFailedLoginAttempts', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="فاصل النسخ الاحتياطي التلقائي (ساعات)">
              <input type="number" min={1} value={settings.autoBackupIntervalHours} onChange={(e) => set('autoBackupIntervalHours', Number(e.target.value))} className={inputCls} />
            </Field>
          </div>
        )}

        {tab === 'backup' && (
          <div className="md:col-span-2">
            <BackupPage />
          </div>
        )}

      </fieldset>

      {readOnly && tab !== 'backup' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          لا تملك صلاحية تعديل الإعدادات (settings.update). الحقول للعرض فقط.
        </div>
      )}
    </div>
  );
};

interface BusinessProfileForm {
  type: string;
  customName: string;
  enabledModules: string[];
  additionalActivityIds: string[];
}

function readBusinessProfile(): BusinessProfileForm {
  const storedType = getEffectiveBusinessType();
  const type = BUSINESS_TYPES.some((item) => item.id === storedType) ? storedType : 'custom';
  const config = parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), type);
  return {
    type,
    customName: SettingsService.getValue('businessTypeLabel') || (type === 'custom' ? storedType : ''),
    enabledModules: parseEnabledModules(SettingsService.getValue('enabledModules'), type),
    additionalActivityIds: config.additionalActivityIds,
  };
}

function readBusinessConfiguration(): BusinessConfiguration {
  const type = getEffectiveBusinessType();
  return parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), type);
}

const Field: React.FC<{ label: string; full?: boolean; children: React.ReactNode }> = ({ label, full, children }) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
);

const NAVIGATION_LAYOUT_OPTIONS: { value: 'sidebar' | 'header'; label: string; hint: string }[] = [
  {
    value: 'sidebar',
    label: 'قائمة جانبية',
    hint: 'شريط علوي للعنوان + قائمة تنقل رأسية على الجانب (الافتراضي).',
  },
  {
    value: 'header',
    label: 'شريط علوي',
    hint: 'القائمة الرئيسية داخل الهيدر أفقيًا بدون قائمة جانبية على الشاشات الكبيرة.',
  },
];

const NavigationLayoutPreview: React.FC<{ variant: 'sidebar' | 'header' }> = ({ variant }) => (
  <div
    className="flex h-16 w-full gap-1 overflow-hidden rounded-[2px] border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800"
    aria-hidden="true"
  >
    {variant === 'sidebar' ? (
      <>
        <div className="h-full w-5 shrink-0 rounded-[1px] bg-sky-500/80" />
        <div className="flex h-full flex-1 flex-col gap-1">
          <div className="h-2.5 w-full rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="flex-1 rounded-[1px] bg-white dark:bg-slate-900" />
        </div>
      </>
    ) : (
      <div className="flex h-full flex-1 flex-col gap-1">
        <div className="flex h-2.5 items-center gap-1">
          <div className="h-2.5 w-2.5 shrink-0 rounded-[1px] bg-sky-500" />
          <div className="h-2 w-4 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="h-2 w-4 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="h-2 w-4 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
          <div className="mr-auto h-2 w-3 rounded-[1px] bg-slate-300 dark:bg-slate-600" />
        </div>
        <div className="flex-1 rounded-[1px] bg-white dark:bg-slate-900" />
      </div>
    )}
  </div>
);

type SystemSettingsSetter = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => void;

const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-bold transition ${
      checked
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
        : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
    }`}
  >
    <span>{label}</span>
    <span className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'right-0.5' : 'right-4'}`} />
    </span>
  </button>
);

const ColorInput: React.FC<{ value: string; onChange: (value: string) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <div className="flex items-center gap-2">
    <input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700" />
    <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`${inputCls} font-mono`} />
  </div>
);
