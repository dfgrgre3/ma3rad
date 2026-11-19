import { useEffect, useMemo, useState, useCallback } from 'react';
import { SettingsService } from '../../../../services/domains/config/SettingsService';
import { AuthService } from '../../../../services/domains/auth/AuthService';
import { usePermission } from '../../../../hooks/domains/auth/usePermission';
import { useToast } from '../../../../components/ui/Toast';
import type { InvoiceSectionId, InvoiceTableColumnId, SystemSettings, User } from '../../../../types';
import { PrintService, type InvoiceTemplateId, type InvoiceSizeId } from '../../../../services/shared/PrintService';
import {
  BUSINESS_TYPES,
  getActivityModuleIds,
  getDefaultBusinessConfiguration,
  parseEnabledModules,
  serializeBusinessConfiguration,
  type BusinessConfiguration,
} from '../../../../config/businessProfiles';
import { ModuleRegistryService } from '../../../../services/domains/config/ModuleRegistryService';
import { BusinessProfileService } from '../../../../services/domains/config/BusinessProfileService';
import { getModuleDefinition, validateModuleSelection, withModuleDependencies } from '../../../../config/moduleRegistry';
import {
  type BusinessTermKey,
  type BusinessTermOverrides,
} from '../../../../config/businessTerminology';
import { TerminologyService } from '../../../../services/domains/config/TerminologyService';
import {
  ConfigurationVersionService,
  type ActivityConfigurationVersion,
} from '../../../../services/domains/config/ConfigurationVersionService';
import {
  POS_PAYMENT_VISIBILITY_OPTIONS,
  TABS,
  DEFAULT_INVOICE_SECTION_ORDER,
  DEFAULT_INVOICE_TABLE_COLUMNS,
} from './constants';
import { moveListItem, readBusinessProfile, readBusinessConfiguration } from './utils';
import type { Tab } from './types';

export function useAdminSettings(initialTab?: Tab, onTabChange?: (tab: Tab) => void) {
  const toast = useToast();
  const can = usePermission();
  const readOnly = !can('settings.update');
  const canViewBackup = can('settings.backup');
  const visibleTabs = TABS.filter((item) => item.id !== 'backup' || canViewBackup);
  const [tab, setTab] = useState<Tab>(initialTab && ['general','business','branding','customization','invoice','inventory','operations','security','backup'].includes(initialTab) && (initialTab !== 'backup' || canViewBackup) ? initialTab : 'general');
  const changeTab = (next: Tab) => {
    setTab(next);
    onTabChange?.(next);
  };
  const [settings, setSettings] = useState<SystemSettings>(() => SettingsService.getSettings());
  const visiblePosPaymentMethods = POS_PAYMENT_VISIBILITY_OPTIONS
    .filter(({ key }) => settings[key] !== false)
    .length;
  const [switchableUsers, setSwitchableUsers] = useState<User[]>([]);
  const [businessProfile, setBusinessProfile] = useState(readBusinessProfile);
  const [businessConfig, setBusinessConfig] = useState(readBusinessConfiguration);
  const [terminologyOverrides, setTerminologyOverrides] = useState<BusinessTermOverrides>(
    () => TerminologyService.getOverrides(),
  );
  const [dirty, setDirty] = useState(false);
    const [activitySearch, setActivitySearch] = useState('');
  const [activityFamily, setActivityFamily] = useState('all');
  const canViewConfigHistory = can('audit.view');
  const canManageLoginSettings = can('settings.update')
    && ['ADMIN', 'MANAGER'].includes(AuthService.getCurrentUser()?.role || '');
  const [configurationVersions, setConfigurationVersions] = useState<ActivityConfigurationVersion[]>([]);
  const [configurationHistoryError, setConfigurationHistoryError] = useState<string | null>(null);
  const [compareVersionIds, setCompareVersionIds] = useState<[string, string]>(['', '']);

  useEffect(() => {
    if (tab !== 'security' || !can('users.view')) return;
    try {
      setSwitchableUsers(new AuthService().getAllUsers().filter((user) => user.isActive));
    } catch (error) {
      toast.error('تعذر تحميل حسابات التبديل', error instanceof Error ? error.message : String(error));
    }
  }, [tab, can, toast]);

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

  const scanPrinters = useCallback(async (notify = true) => {
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
  }, [toast]);

  useEffect(() => {
    if (tab === 'invoice') {
      scanPrinters(false);
    }
  }, [tab, scanPrinters]);

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
      backgroundColor: settings.brandPrimaryColor || '#34445a',
    }),
    [settings.brandPrimaryColor]
  );

  return {
    toast,
    readOnly,
    canViewBackup,
    visibleTabs,
    tab,
    changeTab,
    settings,
    set,
    dirty,
    switchableUsers,
    businessProfile,
    setBusinessProfile,
    businessConfig,
    setBusinessConfig,
    terminologyOverrides,
    setTerminologyOverrides,
    setDirty,
    activitySearch,
    setActivitySearch,
    activityFamily,
    setActivityFamily,
    canViewConfigHistory,
    canManageLoginSettings,
    configurationVersions,
    configurationHistoryError,
    compareVersionIds,
    setCompareVersionIds,
    visiblePosPaymentMethods,
    printService,
    systemPrinters,
    isScanningPrinters,
    scannedPrintersCount,
    scanPrinters,
    previewModalOpen,
    setPreviewModalOpen,
    previewTemplate,
    setPreviewTemplate,
    previewSize,
    setPreviewSize,
    newReasonInput,
    setNewReasonInput,
    showAddReason,
    setShowAddReason,
    invoiceTableColumns,
    invoiceSectionOrder,
    setInvoiceTableColumn,
    setInvoiceTableColumnGroup,
    moveInvoiceTableColumn,
    moveInvoiceSection,
    save,
    resetDefaults,
    selectBusinessType,
    toggleAdditionalActivity,
    updateBusinessConfig,
    updateTermOverride,
    setInventoryEnabled,
    visibleBusinessTypes,
    restoreConfigurationForReview,
    comparedVersions,
    toggleBusinessModule,
    onLogo,
    previewStyle,
  };
}
