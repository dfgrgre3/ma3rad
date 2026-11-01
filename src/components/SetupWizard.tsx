import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Store, Percent, CheckCircle2, ArrowLeft, ArrowRight, Loader2,
  ShieldCheck, Boxes, Layers, Shirt, Zap, Sofa, Car, Apple,
  Sparkles, Wrench, Package, ShoppingBag, Gem, Tv, Coffee,
  Building2, Palette, BookOpen, Settings2,
  Users, BarChart3, Shield, Check, X, Phone, MapPin,
  FileText, DollarSign, Lock, Eye, EyeOff, Star, Rocket,
  Warehouse, ClipboardList, Activity,
  Hash, Tag, Ruler,
  RefreshCw,
} from 'lucide-react';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../database/db';
import { SettingsService } from '../services/SettingsService';
import { AuthService } from '../services/AuthService';
import { CompanyService } from '../services/CompanyService';
import { BranchService } from '../services/BranchService';
import { useToast } from './ui/Toast';
import { BusinessProfileSupportNotice } from './business/BusinessProfileSupportNotice';
import {
  BUSINESS_UNITS,
  BUSINESS_MODULES,
  BUSINESS_ACTIVITY_FAMILY_OPTIONS,
  BUSINESS_TYPES,
  getActivityModuleIds,
  getDefaultBusinessConfiguration,
  getProfileModuleIds,
  parseBusinessConfiguration,
  parseEnabledModules,
  serializeBusinessConfiguration,
  type BusinessConfiguration,
} from '../config/businessProfiles';
import { getModuleDefinition, validateModuleSelection, withModuleDependencies } from '../config/moduleRegistry';
import { ModuleRegistryService } from '../services/ModuleRegistryService';
import { BusinessProfileService } from '../services/BusinessProfileService';
import { ConfigurationVersionService } from '../services/ConfigurationVersionService';
import { auditLogger } from '../services/auditLogger';
import type { User } from '../types';

interface SetupWizardProps {
  onComplete: (configuredAdmin?: User) => void;
}

type SetupForm = {
  showroomName: string;
  legalName: string;
  branchName: string;
  branchPhone: string;
  branchAddress: string;
  warehouseName: string;
  warehouseLocation: string;
  businessType: string;
  businessTypeLabel: string;
  enabledModules: string[];
  phone: string;
  address: string;
  taxNumber: string;
  commercialRecord: string;
  currency: string;
  currencySymbol: string;
  taxPercentage: string;
  fiscalYearStartMonth: string;
  lowStockThreshold: string;
  discountThreshold: string;
  adminUsername: string;
  adminFullName: string;
  adminPhone: string;
  isTaxInclusive: boolean;
  enableNegativeStock: boolean;
  costingMethod: string;
};

interface SetupDraft {
  version: 1;
  step: number;
  form: Record<string, unknown>;
  businessConfig?: unknown;
  options: SetupOptions;
}

interface SetupOptions {
  company: boolean;
  branch: boolean;
  users: boolean;
  modules: boolean;
  accounting: boolean;
  inventory: boolean;
}

type SystemCheckResult = {
  state: 'checking' | 'ready' | 'warning' | 'error';
  detail: string;
};

interface SetupSystemChecks {
  database: SystemCheckResult;
  storage: SystemCheckResult;
  backup: SystemCheckResult;
  version: string;
}

const SETUP_DRAFT_KEY = 'setup_draft';
const CHECKING_RESULT: SystemCheckResult = { state: 'checking', detail: 'جارٍ الفحص...' };
const DEFAULT_SETUP_OPTIONS: SetupOptions = {
  company: true,
  branch: true,
  users: true,
  modules: true,
  accounting: true,
  inventory: true,
};
type DefaultAdminState = {
  required: boolean;
  userId: string;
  username: string;
  fullName: string;
  phone: string;
  error?: string;
};

function parseSetupOptions(value: unknown): SetupOptions {
  const saved = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<SetupOptions>
    : {};
  return {
    company: typeof saved.company === 'boolean' ? saved.company : true,
    branch: typeof saved.branch === 'boolean' ? saved.branch : true,
    users: typeof saved.users === 'boolean' ? saved.users : true,
    modules: typeof saved.modules === 'boolean' ? saved.modules : true,
    accounting: typeof saved.accounting === 'boolean' ? saved.accounting : true,
    inventory: typeof saved.inventory === 'boolean' ? saved.inventory : true,
  };
}

function readSetupDraft(): SetupDraft | null {
  try {
    const raw = SettingsService.getValue(SETUP_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const draft = parsed as Record<string, unknown>;
    if (draft.version !== 1 || !draft.form || typeof draft.form !== 'object' || Array.isArray(draft.form)) {
      return null;
    }
    return {
      version: 1,
      step: Number.isInteger(draft.step) ? Math.min(Math.max(Number(draft.step), 0), STEPS.length - 1) : 0,
      form: draft.form as Record<string, unknown>,
      businessConfig: draft.businessConfig,
      options: parseSetupOptions(draft.options),
    };
  } catch (error) {
    console.warn('Could not restore the saved setup draft:', error);
    return null;
  }
}

function mergeSetupDraft(defaults: SetupForm, draft: SetupDraft | null): SetupForm {
  if (!draft) return defaults;
  const form = draft.form;
  const result = { ...defaults };
  const stringKeys = [
    'showroomName', 'legalName', 'branchName', 'branchPhone', 'branchAddress',
    'warehouseName', 'warehouseLocation', 'businessTypeLabel', 'phone', 'address',
    'taxNumber', 'commercialRecord', 'currency', 'taxPercentage',
    'fiscalYearStartMonth', 'lowStockThreshold', 'discountThreshold',
    'adminUsername', 'adminFullName', 'adminPhone',
  ] as const;
  for (const key of stringKeys) {
    const value = form[key];
    const maxLength = key === 'adminUsername' ? 50
      : key === 'adminFullName' ? 100
        : key === 'adminPhone' ? 30
          : 2000;
    if (typeof value === 'string' && value.length <= maxLength) result[key] = value;
  }
  if (typeof form.businessType === 'string'
    && BUSINESS_TYPES.some((type) => type.id === form.businessType)) {
    result.businessType = form.businessType;
  }
  if (!CURRENCIES.some((currency) => currency.code === result.currency)) {
    result.currency = defaults.currency;
  }
  if (typeof form.isTaxInclusive === 'boolean') result.isTaxInclusive = form.isTaxInclusive;
  if (typeof form.enableNegativeStock === 'boolean') result.enableNegativeStock = form.enableNegativeStock;
  if (form.costingMethod === 'FIFO' || form.costingMethod === 'AVERAGE_COST') {
    result.costingMethod = form.costingMethod;
  }
  if (Array.isArray(form.enabledModules)) {
    result.enabledModules = parseEnabledModules(
      JSON.stringify(form.enabledModules.filter((module): module is string => typeof module === 'string')),
      result.businessType,
    );
  }
  return result;
}

/** Detect whether the built-in admin account still uses the default password. */
function readDefaultAdminState(): DefaultAdminState {
  const defaults = {
    required: false,
    userId: '',
    username: 'admin',
    fullName: 'مدير النظام',
    phone: '',
  };
  try {
    if (AuthService.getCurrentUser()?.role !== 'ADMIN') {
      return { ...defaults, error: 'سجّل الدخول بحساب مدير النظام لإكمال إعداد المنشأة.' };
    }
    const admin = DatabaseManager.getInstance().query<{
      id: string;
      passwordHash: string;
      username: string;
      fullName: string;
      phone: string | null;
    }>(
      `SELECT id, password_hash AS passwordHash, username, full_name AS fullName, phone
       FROM users WHERE username = 'admin' LIMIT 1`
    )[0];
    if (!admin) throw new Error('تعذر العثور على حساب المدير الأساسي.');
    return {
      required: bcrypt.compareSync('admin123', admin.passwordHash),
      userId: admin.id,
      username: admin.username,
      fullName: admin.fullName,
      phone: admin.phone || '',
    };
  } catch (error) {
    console.error('Could not inspect the initial administrator account:', error);
    return {
      ...defaults,
      error: error instanceof Error ? error.message : 'تعذر التحقق من حساب المدير الأساسي.',
    };
  }
}

const CURRENCIES = [
  { code: 'EGP', symbol: 'ج.م', label: 'جنيه مصري' },
  { code: 'SAR', symbol: 'ر.س', label: 'ريال سعودي' },
  { code: 'AED', symbol: 'د.إ', label: 'درهم إماراتي' },
  { code: 'USD', symbol: '$', label: 'دولار أمريكي' },
];

const STEPS = [
  { label: 'الشركة', icon: Store },
  { label: 'الفرع والمخزون', icon: Warehouse },
  { label: 'النشاط والوحدات', icon: Boxes },
  { label: 'المالية والأمان', icon: Settings2 },
  { label: 'مراجعة الإعداد', icon: Rocket },
] as const;

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const toast = useToast();
  const bodyRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(0);
  const [draft] = useState(readSetupDraft);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const draftSaveVersion = useRef(0);
  const [step, setStep] = useState(() => draft?.step ?? 0);
  const [options, setOptions] = useState<SetupOptions>(() => draft?.options ?? DEFAULT_SETUP_OPTIONS);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [security, setSecurity] = useState(readDefaultAdminState);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityFamily, setActivityFamily] = useState('all');
  const [systemChecks, setSystemChecks] = useState<SetupSystemChecks>({
    database: CHECKING_RESULT,
    storage: CHECKING_RESULT,
    backup: CHECKING_RESULT,
    version: 'غير متاح',
  });
  const [systemCheckAttempt, setSystemCheckAttempt] = useState(0);
  const [form, setForm] = useState<SetupForm>(() => {
    let current: ReturnType<typeof SettingsService.getSettings> | null = null;
    let company: { legalName: string | null; fiscalYearStartMonth: number | null } | undefined;
    let branch: { id: string; name: string; phone: string | null; address: string | null; companyId: string | null } | undefined;
    let warehouse: { name: string; location: string | null } | undefined;
    try { current = SettingsService.getSettings(); } catch { current = null; }
    try {
      const db = DatabaseManager.getInstance();
      const configuredBranchId = SettingsService.getValue('defaultBranchId') || 'br_main';
      branch = db.query<NonNullable<typeof branch>>(
        'SELECT id, name, phone, address, company_id AS companyId FROM branches WHERE id = ? AND is_active = 1 LIMIT 1',
        [configuredBranchId]
      )[0] || db.query<NonNullable<typeof branch>>(
        'SELECT id, name, phone, address, company_id AS companyId FROM branches WHERE is_main = 1 AND is_active = 1 LIMIT 1'
      )[0];
      if (branch?.companyId) {
        company = db.query<NonNullable<typeof company>>(
          'SELECT legal_name AS legalName, fiscal_year_start_month AS fiscalYearStartMonth FROM companies WHERE id = ?',
          [branch.companyId]
        )[0];
      }
      if (branch) {
        warehouse = db.query<NonNullable<typeof warehouse>>(
          'SELECT name, location FROM warehouses WHERE branch_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1',
          [branch.id]
        )[0];
      }
    } catch { /* use the seeded defaults below when setup records are unavailable */ }
    const businessType = SettingsService.getValue('businessType') || 'ceramics';
    return mergeSetupDraft({
      showroomName: current?.showroomName || '',
      legalName: company?.legalName || '',
      branchName: branch?.name || 'الفرع الرئيسي',
      branchPhone: branch?.phone || current?.phone || '',
      branchAddress: branch?.address || current?.address || '',
      warehouseName: warehouse?.name || 'المخزن الرئيسي',
      warehouseLocation: warehouse?.location || '',
      businessType,
      businessTypeLabel: SettingsService.getValue('businessTypeLabel') || '',
      enabledModules: parseEnabledModules(SettingsService.getValue('enabledModules'), businessType),
      phone: current?.phone || '',
      address: current?.address || '',
      taxNumber: current?.taxNumber || '',
      commercialRecord: current?.commercialRecord || '',
      currency: current?.currency || 'EGP',
      currencySymbol: current?.currencySymbol || 'ج.م',
      taxPercentage: String(current?.defaultTaxPercentage ?? 0),
      fiscalYearStartMonth: String(company?.fiscalYearStartMonth ?? 1),
      lowStockThreshold: String(current?.lowStockAlertThresholdM2 ?? 20),
      discountThreshold: String(current?.discountApprovalThresholdPercent ?? 10),
      adminUsername: security.username,
      adminFullName: security.fullName,
      adminPhone: security.phone,
      isTaxInclusive: current?.isTaxInclusive ?? false,
      enableNegativeStock: current?.enableNegativeStock ?? false,
      costingMethod: current?.costingMethod ?? 'AVERAGE_COST',
    }, draft);
  });
  const [businessConfig, setBusinessConfig] = useState<BusinessConfiguration>(() => {
    const businessType = form.businessType || SettingsService.getValue('businessType') || 'ceramics';
    const savedConfig = draft?.businessConfig
      ? JSON.stringify(draft.businessConfig)
      : SettingsService.getValue('businessProfileConfig');
    return parseBusinessConfiguration(savedConfig, businessType);
  });

  useEffect(() => {
    let active = true;
    const loadSystemChecks = async () => {
      const db = DatabaseManager.getInstance();
      const next: SetupSystemChecks = {
        database: CHECKING_RESULT,
        storage: CHECKING_RESULT,
        backup: CHECKING_RESULT,
        version: 'غير متاح',
      };
      setSystemChecks(next);

      try {
        const integrity = db.query<{ quick_check: string }>('PRAGMA quick_check');
        if (integrity.length === 1 && integrity[0].quick_check === 'ok') {
          next.database = { state: 'ready', detail: 'فحص SQLite سليم.' };
        } else {
          next.database = { state: 'error', detail: 'أعاد فحص SQLite نتيجة غير سليمة.' };
        }
      } catch (error) {
        next.database = {
          state: 'error',
          detail: error instanceof Error ? error.message : String(error),
        };
      }

      try {
        const [fileInfo, appInfo] = await Promise.all([
          window.ceramisys?.db?.info?.(),
          window.ceramisys?.app?.info?.(),
        ]);
        if (appInfo?.version) next.version = appInfo.version;
        if (!fileInfo) {
          next.storage = { state: 'warning', detail: 'تعذر التحقق من ملف قاعدة البيانات عبر تطبيق سطح المكتب.' };
        } else if (fileInfo.error) {
          next.storage = { state: 'error', detail: fileInfo.error };
        } else if (fileInfo.exists && fileInfo.bytes > 0) {
          next.storage = {
            state: 'ready',
            detail: `ملف محلي موجود (${(fileInfo.bytes / (1024 * 1024)).toFixed(2)} ميجابايت).`,
          };
        } else {
          next.storage = { state: 'warning', detail: 'لم يُعثر على ملف قاعدة بيانات محفوظ بعد.' };
        }
      } catch (error) {
        next.storage = {
          state: 'error',
          detail: error instanceof Error ? error.message : String(error),
        };
      }

      try {
        const backup = db.query<{ fileName: string; createdAt: string }>(
          `SELECT file_name AS fileName, created_at AS createdAt
           FROM backup_history WHERE status = 'SUCCESS'
           ORDER BY created_at DESC LIMIT 1`
        )[0];
        next.backup = backup
          ? {
            state: 'warning',
            detail: `آخر نسخة ناجحة مسجلة: ${backup.createdAt}. لم يتم التحقق من وجود ملف النسخة.`,
          }
          : { state: 'warning', detail: 'لم تُسجل نسخة احتياطية ناجحة بعد.' };
      } catch (error) {
        next.backup = {
          state: 'error',
          detail: error instanceof Error ? error.message : String(error),
        };
      }

      if (active) setSystemChecks(next);
    };

    void loadSystemChecks();
    return () => { active = false; };
  }, [systemCheckAttempt]);

  useEffect(() => {
    if (saving) return;
    const version = ++draftSaveVersion.current;
    const timer = setTimeout(() => {
      try {
        const db = DatabaseManager.getInstance();
        db.run(
          'INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)',
          [SETUP_DRAFT_KEY, JSON.stringify({ version: 1, step, form, businessConfig, options })],
        );
        void db.flush().then(() => {
          if (draftSaveVersion.current === version) setDraftSaveError(null);
        }).catch((error) => {
          console.error('Could not persist the setup draft:', error);
          if (draftSaveVersion.current === version) {
            setDraftSaveError(error instanceof Error ? error.message : String(error));
          }
        });
      } catch (error) {
        console.error('Could not save the setup draft:', error);
        if (draftSaveVersion.current === version) {
          setDraftSaveError(error instanceof Error ? error.message : String(error));
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [step, form, businessConfig, options, saving]);

  const currencySymbol = useMemo(
    () => CURRENCIES.find((c) => c.code === form.currency)?.symbol || form.currencySymbol,
    [form.currency, form.currencySymbol]
  );
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

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const toggleSetupOption = (key: keyof SetupOptions) =>
    setOptions((current) => ({ ...current, [key]: !current[key] }));

  const selectBusinessType = (businessType: string) => {
    if (businessType === form.businessType) return;
    setForm((prev) => ({
      ...prev,
      businessType,
      enabledModules: getProfileModuleIds(businessType),
    }));
    const defaults = getDefaultBusinessConfiguration(businessType);
    setBusinessConfig(options.inventory
      ? defaults
      : { ...defaults, trackInventory: businessConfig.trackInventory });
  };

  const toggleAdditionalActivity = (activityId: string, enabled: boolean) => {
    const additionalActivityIds = enabled
      ? [...new Set([...businessConfig.additionalActivityIds, activityId])]
      : businessConfig.additionalActivityIds.filter((id) => id !== activityId);
    const defaults = getDefaultBusinessConfiguration(form.businessType, additionalActivityIds);
    setBusinessConfig((current) => ({
      ...defaults,
      businessModel: current.businessModel === 'mixed' || defaults.businessModel === 'mixed'
        ? 'mixed'
        : current.businessModel,
      trackInventory: options.inventory
        ? current.trackInventory || defaults.trackInventory
        : current.trackInventory,
      units: [...new Set([...current.units, ...defaults.units])],
      customUnits: [...new Set([...current.customUnits, ...defaults.customUnits])],
      productAttributes: [...new Set([...current.productAttributes, ...defaults.productAttributes])],
    }));
    if (enabled) {
      setForm((current) => ({
        ...current,
        enabledModules: [...new Set([
          ...current.enabledModules,
          ...getActivityModuleIds(form.businessType, [...additionalActivityIds]),
        ])],
      }));
    }
  };

  const updateBusinessConfig = (patch: Partial<BusinessConfiguration>) =>
    setBusinessConfig((current) => ({ ...current, ...patch }));

  const setInventoryEnabled = (enabled: boolean) => {
    updateBusinessConfig({ trackInventory: enabled });
    setForm((current) => ({
      ...current,
      enabledModules: enabled
        ? [...new Set([...current.enabledModules, 'inventory'])]
        : current.enabledModules.filter((module) => module !== 'inventory'),
    }));
  };

  const toggleModule = (id: string) => setForm((prev) => ({
    ...prev,
    enabledModules: prev.enabledModules.includes(id)
      ? prev.enabledModules.filter((module) => module !== id)
      : withModuleDependencies([...prev.enabledModules, id]),
  }));

  const adminProfileError = security.required
    ? !options.users
      ? null
      : form.adminUsername.trim().length < 3 || form.adminUsername.trim().length > 50 || /\s/.test(form.adminUsername.trim())
      ? 'اسم المستخدم يجب أن يتكون من 3 إلى 50 حرفًا دون مسافات.'
      : form.adminFullName.trim().length < 2 || form.adminFullName.trim().length > 100
        ? 'الاسم المعروض يجب أن يتكون من حرفين إلى 100 حرف.'
        : form.adminPhone.trim().length > 30
          ? 'رقم الهاتف لا يمكن أن يتجاوز 30 حرفًا.'
          : null
    : null;
  const passwordPolicyError = (() => {
    if (!security.required || !newPassword) return null;
    try {
      AuthService.validatePasswordPolicy(newPassword, options.users ? form.adminUsername.trim() : security.username);
    } catch (error) {
      return error instanceof Error ? error.message : 'كلمة المرور غير مطابقة لسياسة الأمان.';
    }
    if (confirmPassword && newPassword !== confirmPassword) return 'كلمتا المرور غير متطابقتين.';
    return null;
  })();
  const passwordValid = !security.required
    || (Boolean(newPassword) && Boolean(confirmPassword) && !passwordPolicyError);
  const canContinue = step === 0
    ? !options.company || form.showroomName.trim().length >= 2
    : step === 1
      ? !options.branch || (form.branchName.trim().length >= 2 && form.warehouseName.trim().length >= 2)
      : step === 3
        ? !security.error && (!options.users || !adminProfileError) && passwordValid
        : true;

  // The default password may have been changed from the forced-password modal
  // (or another window) after this wizard mounted, so re-check before deciding
  // whether the admin password fields are still required.
  useEffect(() => {
    if (!security.required || step < 3) return;
    const current = readDefaultAdminState();
    if (!current.required) setSecurity(current);
  }, [step, security.required]);

  // Keep the wizard usable on short screens: whenever the step changes, scroll the
  // content area back to the top and move focus to the new step heading.
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    bodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const finish = async () => {
    if (systemChecks.database.state !== 'ready') {
      setStep(0);
      toast.error('لم يكتمل فحص قاعدة البيانات', systemChecks.database.detail);
      return;
    }
    if (systemChecks.storage.state === 'error') {
      setStep(0);
      toast.error('تعذر التحقق من التخزين المحلي', systemChecks.storage.detail);
      return;
    }
    if (options.company && form.showroomName.trim().length < 2) {
      setStep(0);
      toast.error('اسم المعرض مطلوب (حرفان على الأقل)');
      return;
    }
    if (options.branch && (form.branchName.trim().length < 2 || form.warehouseName.trim().length < 2)) {
      setStep(1);
      toast.error('اسم الفرع والمخزن مطلوب (حرفان على الأقل لكل منهما)');
      return;
    }
    if (options.modules && form.businessType === 'custom' && form.businessTypeLabel.trim().length < 2) {
      setStep(2);
      toast.error('اكتب اسم النشاط التجاري (حرفان على الأقل)');
      return;
    }
    const savedBusinessType = SettingsService.getValue('businessType') || 'ceramics';
    const savedBusinessConfig = parseBusinessConfiguration(
      SettingsService.getValue('businessProfileConfig'),
      savedBusinessType,
    );
    const businessTypeToSave = options.modules ? form.businessType : savedBusinessType;
    const businessConfigToSave = options.modules || options.inventory
      ? {
        ...(options.modules ? businessConfig : savedBusinessConfig),
        trackInventory: options.inventory ? businessConfig.trackInventory : savedBusinessConfig.trackInventory,
        businessType: businessTypeToSave,
      }
      : savedBusinessConfig;
    const taxPercentage = Number(form.taxPercentage);
    const fiscalYearStartMonth = Number(form.fiscalYearStartMonth);
    const lowStockThreshold = Number(form.lowStockThreshold);
    const discountThreshold = Number(form.discountThreshold);
    const invalidAccounting = options.accounting && (
      !Number.isFinite(taxPercentage) || taxPercentage < 0 || taxPercentage > 100
      || !Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12
      || !Number.isFinite(discountThreshold) || discountThreshold < 0 || discountThreshold > 100
    );
    const invalidInventory = options.inventory
      && (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0);
    if (invalidAccounting || invalidInventory) {
      setStep(3);
      toast.error('راجع شهر بداية السنة المالية ونسبة الضريبة وحدود المخزون والخصم');
      return;
    }
    const activeSecurity = readDefaultAdminState();
    if (activeSecurity.required !== security.required) setSecurity(activeSecurity);
    if (activeSecurity.error) {
      setSecurity(activeSecurity);
      setStep(3);
      toast.error('تعذر التحقق من حساب المدير', activeSecurity.error);
      return;
    }
    const requiresPassword = activeSecurity.required;
    if (requiresPassword && adminProfileError) {
      setStep(3);
      toast.error('راجع بيانات حساب المدير', adminProfileError);
      return;
    }
    if (requiresPassword && !passwordValid) {
      setStep(3);
      setSecurity(activeSecurity);
      toast.error('راجع كلمة المرور', passwordPolicyError || 'أدخل كلمة مرور جديدة وتأكيدًا مطابقًا.');
      return;
    }
    if (options.modules && businessConfig.units.length + businessConfig.customUnits.length === 0) {
      setStep(2);
      toast.error('اختر وحدة قياس واحدة على الأقل قبل المتابعة');
      return;
    }
    const moduleValidation = options.modules
      ? validateModuleSelection(form.enabledModules, { trackInventory: businessConfigToSave.trackInventory })
      : null;
    if (moduleValidation && moduleValidation.errors.length > 0) {
      setStep(2);
      toast.error('راجع الوحدات المفعّلة', moduleValidation.errors.join(' '));
      return;
    }
    const expectedShowroomName = options.company
      ? form.showroomName.trim()
      : SettingsService.getValue('showroomName') || '';
    setSaving(true);
    let db: DatabaseManager | null = null;
    let completionMarkerAttempted = false;
    let updatedAdmin: ReturnType<typeof AuthService.getCurrentUser> = null;
    try {
      const setupDatabase = DatabaseManager.getInstance();
      db = setupDatabase;
      const branchId = SettingsService.getValue('defaultBranchId') || 'br_main';
      const branch = setupDatabase.query<{ id: string; companyId: string }>(
        'SELECT id, company_id AS companyId FROM branches WHERE id = ? AND is_active = 1 LIMIT 1',
        [branchId]
      )[0] || setupDatabase.query<{ id: string; companyId: string }>(
        'SELECT id, company_id AS companyId FROM branches WHERE is_main = 1 AND is_active = 1 LIMIT 1'
      )[0];
      if (!branch?.companyId) throw new Error('تعذر العثور على الشركة والفرع الافتراضيين. تحقق من بيانات النظام ثم أعد المحاولة.');
      const companyExists = setupDatabase.query<{ id: string }>(
        'SELECT id FROM companies WHERE id = ? AND is_active = 1',
        [branch.companyId]
      )[0];
      if (!companyExists) throw new Error('الشركة المرتبطة بالفرع الافتراضي غير موجودة أو غير مفعلة.');
      const warehouse = setupDatabase.query<{ id: string }>(
        'SELECT id FROM warehouses WHERE branch_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1',
        [branch.id]
      )[0];
      if (!warehouse) throw new Error('تعذر العثور على المخزن الافتراضي للفرع. أعد تهيئة قاعدة البيانات قبل المتابعة.');

      setupDatabase.executeTransaction(() => {
        if (requiresPassword) {
          updatedAdmin = new AuthService().completeFirstRunAdminSetup(activeSecurity.userId, {
            username: options.users ? form.adminUsername : activeSecurity.username,
            fullName: options.users ? form.adminFullName : activeSecurity.fullName,
            phone: options.users ? form.adminPhone : activeSecurity.phone,
            password: newPassword,
          });
        }

        SettingsService.update({
          ...(options.company ? {
            showroomName: form.showroomName.trim(),
            phone: form.phone.trim(),
            address: form.address.trim(),
            taxNumber: form.taxNumber.trim(),
            commercialRecord: form.commercialRecord.trim(),
            currency: form.currency,
            currencySymbol,
          } : {}),
          ...(options.modules ? {
            businessType: form.businessType,
            businessTypeLabel: form.businessType === 'custom'
            ? form.businessTypeLabel.trim()
            : BUSINESS_TYPES.find((type) => type.id === form.businessType)?.label || '',
          } : {}),
          ...(options.modules || options.inventory ? {
            businessProfileConfig: serializeBusinessConfiguration(businessConfigToSave),
          } : {}),
          ...(options.accounting ? {
            defaultTaxPercentage: taxPercentage,
            isTaxInclusive: form.isTaxInclusive,
            discountApprovalThresholdPercent: discountThreshold,
          } : {}),
          ...(options.inventory ? {
            enableNegativeStock: form.enableNegativeStock,
            costingMethod: form.costingMethod,
            lowStockAlertThresholdM2: lowStockThreshold,
          } : {}),
          defaultBranchId: branch.id,
        });
        if (options.company || options.accounting) {
          new CompanyService().updateCompany(branch.companyId, {
            ...(options.company ? {
              name: form.showroomName.trim(),
              legalName: form.legalName.trim() || form.showroomName.trim(),
              taxNumber: form.taxNumber.trim(),
              commercialRecord: form.commercialRecord.trim(),
              currency: form.currency,
            } : {}),
            ...(options.accounting ? { fiscalYearStartMonth } : {}),
          });
        }
        if (options.branch) {
          new BranchService().updateBranch(branch.id, {
            name: form.branchName.trim(),
            address: form.branchAddress.trim(),
            phone: form.branchPhone.trim(),
            companyId: branch.companyId,
            isDefault: true,
          });
          setupDatabase.run(
            'UPDATE warehouses SET name = ?, location = ? WHERE id = ?',
            [form.warehouseName.trim(), form.warehouseLocation.trim() || null, warehouse.id]
          );
        }
        if (options.modules && moduleValidation) {
          ModuleRegistryService.setEnabledModules(moduleValidation.enabled, AuthService.getCurrentUser(), 'إعداد أولي');
          BusinessProfileService.applyFromSettings();
        }
      });

      if (updatedAdmin) AuthService.setCurrentUser(updatedAdmin);
      await setupDatabase.flush();
      const firstSaveStatus = setupDatabase.getPersistenceStatus();
      if (firstSaveStatus.status !== 'saved' && firstSaveStatus.status !== 'unencrypted') {
        throw new Error(firstSaveStatus.error || 'لم يتم تأكيد حفظ إعدادات المنشأة على وسيط التخزين.');
      }
      if (SettingsService.getValue('businessType') !== businessTypeToSave
        || SettingsService.getValue('showroomName') !== expectedShowroomName) {
        throw new Error('تعذر التحقق من إعدادات النشاط بعد حفظها. لم يتم إنهاء الإعداد.');
      }

      completionMarkerAttempted = true;
      setupDatabase.run(
        `INSERT OR REPLACE INTO system_settings (key, value) VALUES ('setup_completed', '1')`
      );
      setupDatabase.run('DELETE FROM system_settings WHERE key = ?', [SETUP_DRAFT_KEY]);
      await setupDatabase.flush();
      const finalSaveStatus = setupDatabase.getPersistenceStatus();
      if (finalSaveStatus.status !== 'saved' && finalSaveStatus.status !== 'unencrypted') {
        throw new Error(finalSaveStatus.error || 'تعذر حفظ حالة اكتمال الإعداد.');
      }
      if (SettingsService.getValue('setup_completed') !== '1') {
        throw new Error('تعذر التحقق من تسجيل اكتمال الإعداد.');
      }
      ConfigurationVersionService.recordCurrent('الإعداد الأولي', AuthService.getCurrentUser());
      auditLogger.log(
        AuthService.getCurrentUser()?.id || 'system',
        'first-run-setup',
        'client-setup-completed',
        'company',
        branch.companyId,
        'اكتملت تهيئة المنشأة الجديدة',
        {
          configuredSections: Object.entries(options)
            .filter(([, enabled]) => enabled)
            .map(([section]) => section),
          skippedSections: Object.entries(options)
            .filter(([, enabled]) => !enabled)
            .map(([section]) => section),
          dataImport: 'deferred',
        },
        true,
        undefined,
        'medium',
      );
      toast.success('تم إعداد النظام بنجاح، مرحبًا بك في CeramiSys');
      onComplete(updatedAdmin ?? undefined);
    } catch (e: any) {
      let message = e?.message || 'تعذر حفظ إعدادات النظام';
      if (db && completionMarkerAttempted) {
        try {
          db.run('DELETE FROM system_settings WHERE key = ?', ['setup_completed']);
          db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
            SETUP_DRAFT_KEY,
            JSON.stringify({ version: 1, step, form, businessConfig, options }),
          ]);
          await db.flush();
        } catch (rollbackError) {
          console.error('Could not restore the resumable setup state:', rollbackError);
          const detail = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          message = `${message} كما تعذر حفظ حالة الإعداد غير المكتمل: ${detail}`;
        }
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full min-h-10 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';
  const labelClass = 'block text-xs font-semibold text-slate-600 mb-1.5 dark:text-slate-300';
  const visibleSystemChecks: Array<[string, SystemCheckResult]> = [
    ['قاعدة البيانات', systemChecks.database],
    ['التخزين المحلي', systemChecks.storage],
    ['النسخ الاحتياطي', systemChecks.backup],
  ];
  const systemChecksRunning = visibleSystemChecks.some(([, result]) => result.state === 'checking');
  const setupOptionControl = (key: keyof SetupOptions, title: string, description: string) => (
    <label
      htmlFor={`setup-option-${key}`}
      className="flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-slate-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-slate-100"
    >
      <input
        id={`setup-option-${key}`}
        type="checkbox"
        checked={options[key]}
        onChange={() => toggleSetupOption(key)}
        disabled={saving}
        className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600"
      />
      <span>
        <span className="block text-xs font-bold">{title}</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{description}</span>
      </span>
    </label>
  );

  return (
    <div
      className="flex min-h-dvh w-full items-center justify-center bg-gradient-to-br from-slate-100 via-white to-sky-50 p-2 sm:p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
      dir="rtl"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header stays visible while only the step content scrolls. */}
        <header className="shrink-0 bg-gradient-to-l from-sky-600 to-indigo-600 px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 sm:h-11 sm:w-11">
                <Store className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-black sm:text-lg">إعداد نظام ERP</h1>
                <p className="truncate text-[11px] text-sky-100 sm:text-xs">خصص النظام لنشاط معرضك قبل بدء العمل</p>
              </div>
            </div>
            <span
              className="shrink-0 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-bold sm:text-[11px]"
              aria-live="polite"
            >
              الخطوة {step + 1} من {STEPS.length}
            </span>
          </div>

          <div className="mt-4">
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="تقدم الإعداد">
              {STEPS.map((item, index) => (
                <div key={item.label} aria-hidden="true">
                  <div className={`h-1.5 rounded-full transition-colors ${index <= step ? 'bg-white' : 'bg-white/25'}`} />
                </div>
              ))}
            </div>
            <div className="mt-2 hidden grid-cols-1 sm:grid-cols-5 gap-2 sm:grid">
              {STEPS.map((item, index) => {
                const Icon = item.icon;
                const reached = index <= step;
                return (
                  <div
                    key={item.label}
                    className={`flex min-w-0 items-center gap-1 text-[10px] font-semibold ${reached ? 'text-white' : 'text-sky-200/70'}`}
                  >
                    {index < step ? (
                      <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                    ) : (
                      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] font-semibold text-sky-100 sm:hidden" aria-live="polite">
              {STEPS[step].label}
            </p>
          </div>
        </header>

        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5"
        >
          {draftSaveError && (
            <p role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              لم نتمكن من حفظ تقدم الإعداد تلقائيًا. سيظل بإمكانك إعادة المحاولة عند الإنهاء. {draftSaveError}
            </p>
          )}
          <h2 ref={stepHeadingRef} tabIndex={-1} className="sr-only">
            {STEPS[step].label}
          </h2>
          {step === 0 && (
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50" aria-labelledby="setup-system-checks">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 id="setup-system-checks" className="text-xs font-bold text-slate-800 dark:text-slate-100">فحص النظام الفعلي</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">سيراميسيس {systemChecks.version}</span>
                    <button
                      type="button"
                      onClick={() => setSystemCheckAttempt((attempt) => attempt + 1)}
                      disabled={systemChecksRunning}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <RefreshCw className={`h-3 w-3 ${systemChecksRunning ? 'animate-spin' : ''}`} aria-hidden="true" />
                      إعادة الفحص
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {visibleSystemChecks.map(([label, result]) => {
                    const color = result.state === 'ready'
                      ? 'bg-emerald-500'
                      : result.state === 'error'
                        ? 'bg-rose-500'
                        : result.state === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-slate-400 animate-pulse';
                    return (
                      <div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-800 dark:text-slate-100">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />
                          {label}
                        </div>
                        <p className="mt-1 break-words text-[10px] text-slate-500 dark:text-slate-400">{result.detail}</p>
                      </div>
                    );
                  })}
                </div>
                {systemChecks.database.state === 'error' && (
                  <p role="alert" className="mt-2 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                    لا تتابع إعداد النظام حتى تُحل مشكلة سلامة قاعدة البيانات.
                  </p>
                )}
              </section>
              {setupOptionControl('company', 'تهيئة بيانات المنشأة الآن', 'يمكنك تخطيها والاحتفاظ بالبيانات الحالية أو استكمالها لاحقًا من الإعدادات.')}
              <fieldset disabled={!options.company} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
              <div>
                <label htmlFor="setup-showroom-name" className={labelClass}>اسم المعرض / الشركة *</label>
                <input
                  id="setup-showroom-name"
                  value={form.showroomName}
                  onChange={(e) => set('showroomName', e.target.value)}
                  className={inputClass}
                  placeholder="مثال: معرض النور للسيراميك"
                  disabled={!options.company}
                />
              </div>
              <div>
                <label htmlFor="setup-legal-name" className={labelClass}>الاسم القانوني للشركة</label>
                <input
                  id="setup-legal-name"
                  value={form.legalName}
                  onChange={(e) => set('legalName', e.target.value)}
                  className={inputClass}
                  placeholder="يُستخدم في المستندات الرسمية"
                  disabled={!options.company}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="setup-phone" className={labelClass}>رقم الهاتف</label>
                  <input id="setup-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} placeholder="01000000000" disabled={!options.company} />
                </div>
                <div>
                  <label htmlFor="setup-currency" className={labelClass}>العملة</label>
                  <select
                    id="setup-currency"
                    value={form.currency}
                    onChange={(e) => {
                      const next = CURRENCIES.find((c) => c.code === e.target.value);
                      setForm((prev) => ({ ...prev, currency: e.target.value, currencySymbol: next?.symbol || prev.currencySymbol }));
                    }}
                    className={inputClass}
                    disabled={!options.company}
                  >
                    {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="setup-address" className={labelClass}>العنوان</label>
                <input id="setup-address" value={form.address} onChange={(e) => set('address', e.target.value)} className={inputClass} placeholder="المدينة - الشارع" disabled={!options.company} />
              </div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">بيانات التسجيل الاختيارية</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="setup-tax-number" className={labelClass}>الرقم الضريبي</label>
                  <input id="setup-tax-number" value={form.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} className={inputClass} disabled={!options.company} />
                </div>
                <div>
                  <label htmlFor="setup-commercial-record" className={labelClass}>السجل التجاري</label>
                  <input id="setup-commercial-record" value={form.commercialRecord} onChange={(e) => set('commercialRecord', e.target.value)} className={inputClass} disabled={!options.company} />
                </div>
              </div>
              </fieldset>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-3">
                <Warehouse className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">جهّز موقع التشغيل الافتراضي</h2>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">ستُربط المبيعات والمخزون بالفرع والمخزن الافتراضيين، ويمكن إضافة مواقع أخرى لاحقًا.</p>
                </div>
              </div>
              {setupOptionControl('branch', 'تخصيص الفرع والمخزن الآن', 'يمكن تخطي تعديل أسمائهما وبياناتهما؛ يظل الفرع والمخزن الافتراضيان الموجودان مطلوبين لتشغيل النظام.')}
              <fieldset disabled={!options.branch} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
              <div>
                <label htmlFor="setup-branch-name" className={labelClass}>اسم الفرع الرئيسي *</label>
                <input id="setup-branch-name" value={form.branchName} onChange={(e) => set('branchName', e.target.value)} className={inputClass} placeholder="مثال: الفرع الرئيسي" disabled={!options.branch} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="setup-branch-phone" className={labelClass}>هاتف الفرع</label>
                  <input id="setup-branch-phone" value={form.branchPhone} onChange={(e) => set('branchPhone', e.target.value)} className={inputClass} disabled={!options.branch} />
                </div>
                <div>
                  <label htmlFor="setup-warehouse-name" className={labelClass}>اسم المخزن الرئيسي *</label>
                  <input id="setup-warehouse-name" value={form.warehouseName} onChange={(e) => set('warehouseName', e.target.value)} className={inputClass} placeholder="مثال: المخزن الرئيسي" disabled={!options.branch} />
                </div>
              </div>
              <div>
                <label htmlFor="setup-branch-address" className={labelClass}>عنوان الفرع</label>
                <input id="setup-branch-address" value={form.branchAddress} onChange={(e) => set('branchAddress', e.target.value)} className={inputClass} disabled={!options.branch} />
              </div>
              <div>
                <label htmlFor="setup-warehouse-location" className={labelClass}>موقع المخزن داخل المعرض</label>
                <input id="setup-warehouse-location" value={form.warehouseLocation} onChange={(e) => set('warehouseLocation', e.target.value)} className={inputClass} placeholder="مثال: صالة العرض أو المخزن الخلفي" disabled={!options.branch} />
              </div>
              </fieldset>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-3">
                <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
                <div><h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">خصص النظام حسب طبيعة عملك</h2><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">تُحفظ هذه الخيارات محليًا ويمكن تعديلها لاحقًا من إعدادات النشاط.</p></div>
              </div>
              {setupOptionControl('modules', 'تهيئة النشاط والوحدات الآن', 'يمكنك تخطيها والاحتفاظ بالنشاط والوحدات الحالية، ثم تغييرها لاحقًا من إعدادات النشاط.')}
              <fieldset disabled={!options.modules} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <input
                  type="search"
                  aria-label="البحث في الأنشطة"
                  value={activitySearch}
                  onChange={(event) => setActivitySearch(event.target.value)}
                  className={inputClass}
                  placeholder="ابحث باسم النشاط أو عائلته..."
                />
                <select
                  aria-label="تصنيف النشاط"
                  value={activityFamily}
                  onChange={(event) => setActivityFamily(event.target.value)}
                  className={inputClass}
                >
                  <option value="all">جميع عائلات الأنشطة</option>
                  {BUSINESS_ACTIVITY_FAMILY_OPTIONS.map((family) => (
                    <option key={family.id} value={family.id}>{family.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400" aria-live="polite">
                {visibleBusinessTypes.length} نشاط متاح. اختر نشاطًا رئيسيًا، ويمكن إضافة أنشطة فرعية.
              </p>
              {visibleBusinessTypes.length === 0 ? (
                <p className="rounded-lg border border-slate-200 p-4 text-center text-xs text-slate-500">لا توجد أنشطة تطابق البحث.</p>
              ) : (
                <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                  {visibleBusinessTypes.map((type) => {
                    const isPrimary = form.businessType === type.id;
                    const isAdditional = businessConfig.additionalActivityIds.includes(type.id);
                    return (
                      <article
                        key={type.id}
                        className={`rounded-xl border p-3 transition ${isPrimary ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-900/30' : 'border-slate-200 dark:border-slate-700 dark:bg-slate-800/30'}`}
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
                            className="h-3.5 w-3.5 accent-sky-600"
                          />
                          نشاط فرعي
                        </label>
                      </article>
                    );
                  })}
                </div>
              )}
              {businessConfig.additionalActivityIds.length > 0 && (
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  الأنشطة الفرعية: {businessConfig.additionalActivityIds
                    .map((id) => BUSINESS_TYPES.find((type) => type.id === id)?.label || id)
                    .join('، ')}
                </p>
              )}
              <BusinessProfileSupportNotice businessType={form.businessType} />
              {form.businessType === 'custom' && (
                <div>
                  <label htmlFor="setup-business-type-label" className={labelClass}>اسم النشاط التجاري *</label>
                  <input
                    id="setup-business-type-label"
                    value={form.businessTypeLabel}
                    onChange={(e) => set('businessTypeLabel', e.target.value)}
                    className={inputClass}
                    placeholder="مثال: معرض أدوات رياضية"
                  />
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="setup-business-model" className={labelClass}>نموذج العمل</label>
                  <select id="setup-business-model" value={businessConfig.businessModel} onChange={(e) => updateBusinessConfig({ businessModel: e.target.value as BusinessConfiguration['businessModel'] })} className={inputClass}>
                    <option value="products">بيع منتجات</option>
                    <option value="services">تقديم خدمات</option>
                    <option value="mixed">منتجات وخدمات</option>
                  </select>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">وحدات المنتجات والخدمات</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {BUSINESS_UNITS.map((unit) => (
                    <div key={unit.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-200">
                      <input id={`setup-unit-${unit.id}`} type="checkbox" checked={businessConfig.units.includes(unit.id)} onChange={() => updateBusinessConfig({ units: businessConfig.units.includes(unit.id) ? businessConfig.units.filter((id) => id !== unit.id) : [...businessConfig.units, unit.id] })} className="accent-sky-600" />
                      <label htmlFor={`setup-unit-${unit.id}`} className="cursor-pointer">{unit.label}</label>
                    </div>
                  ))}
                </div>
                <label htmlFor="setup-custom-units" className={`${labelClass} mt-2`}>وحدات مخصصة (مفصولة بفواصل)</label>
                <input
                  id="setup-custom-units"
                  value={businessConfig.customUnits.join(', ')}
                  onChange={(e) => updateBusinessConfig({ customUnits: e.target.value.split(',').map((unit) => unit.trim()).filter(Boolean) })}
                  className={inputClass}
                  placeholder="وحدات مخصصة، مفصولة بفواصل"
                />
              </div>
              <div>
                <label htmlFor="setup-product-attributes" className={labelClass}>خصائص المنتجات (مفصولة بفواصل)</label>
                <input
                  id="setup-product-attributes"
                  value={businessConfig.productAttributes.join(', ')}
                  onChange={(e) => updateBusinessConfig({ productAttributes: e.target.value.split(',').map((attribute) => attribute.trim()).filter(Boolean) })}
                  className={inputClass}
                  placeholder="مثال: المقاس، اللون، الموديل"
                />
              </div>
              <div><h3 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">الوحدات التي تحتاجها</h3><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BUSINESS_MODULES.map((module) => {
                  const definition = getModuleDefinition(module.id);
                  const unavailable = Boolean(definition?.activation.requiresInventoryTracking && !businessConfig.trackInventory);
                  return (
                    <div key={module.id} title={definition?.description} className={`flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-200 ${unavailable ? 'opacity-50' : ''}`}>
                      <input id={`setup-module-${module.id}`} type="checkbox" checked={form.enabledModules.includes(module.id)} onChange={() => toggleModule(module.id)} disabled={unavailable} className="accent-sky-600" />
                      <label htmlFor={`setup-module-${module.id}`} className="cursor-pointer">{module.label}</label>
                    </div>
                  );
                })}
              </div></div>
              </fieldset>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {setupOptionControl('accounting', 'تهيئة الإعدادات المالية الآن', 'يمكنك الاحتفاظ بالإعدادات المالية الحالية أو تعديلها لاحقًا.')}
              <fieldset disabled={!options.accounting} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
              <div>
                <label htmlFor="setup-fiscal-year-start-month" className={labelClass}>شهر بداية السنة المالية</label>
                <select
                  id="setup-fiscal-year-start-month"
                  value={form.fiscalYearStartMonth}
                  onChange={(e) => set('fiscalYearStartMonth', e.target.value)}
                  className={inputClass}
                >
                  {['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
                    .map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                </select>
              </div>
              <div>
                <div>
                  <label htmlFor="setup-default-tax" className={labelClass}>نسبة ضريبة القيمة المضافة الافتراضية %</label>
                  <div className="relative">
                    <Percent className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-3.5" />
                    <input
                      id="setup-default-tax"
                      type="number" min="0" max="100" step="0.1"
                      value={form.taxPercentage}
                      onChange={(e) => set('taxPercentage', e.target.value)}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="setup-discount-threshold" className={labelClass}>حد الخصم المسموح بدون اعتماد %</label>
                <input
                  id="setup-discount-threshold"
                  type="number" min="0" max="100" step="0.5"
                  value={form.discountThreshold}
                  onChange={(e) => set('discountThreshold', e.target.value)}
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  أي خصم يتجاوز هذه النسبة سيُرسل كطلب اعتماد للمسؤول من نقطة البيع.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <label htmlFor="setup-is-tax-inclusive" className="cursor-pointer">الأسعار شاملة الضريبة</label>
                  <input id="setup-is-tax-inclusive" type="checkbox" checked={form.isTaxInclusive} onChange={(e) => setForm((prev) => ({ ...prev, isTaxInclusive: e.target.checked }))} className="h-4 w-4 accent-sky-600" />
                </div>
              </div>
              </fieldset>

              {setupOptionControl('inventory', 'تهيئة المخزون الآن', 'يمكنك تخطي إعداد تتبع المخزون وطريقة التكلفة والتنبيهات، وتغييرها لاحقًا.')}
              <fieldset disabled={!options.inventory} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <label htmlFor="setup-track-inventory" className="cursor-pointer">تفعيل إدارة المخزون</label>
                  <input id="setup-track-inventory" type="checkbox" checked={businessConfig.trackInventory} onChange={(e) => setInventoryEnabled(e.target.checked)} className="h-4 w-4 accent-sky-600" />
                </div>
                <div>
                  <label htmlFor="setup-low-stock-threshold" className={labelClass}>حد التنبيه للمخزون المنخفض (بوحدة الصنف)</label>
                  <input
                    id="setup-low-stock-threshold"
                    type="number" min="0" step="0.5"
                    value={form.lowStockThreshold}
                    onChange={(e) => set('lowStockThreshold', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <label htmlFor="setup-enable-negative-stock" className="cursor-pointer">السماح بالبيع من رصيد سالب</label>
                  <input id="setup-enable-negative-stock" type="checkbox" checked={form.enableNegativeStock} onChange={(e) => setForm((prev) => ({ ...prev, enableNegativeStock: e.target.checked }))} className="h-4 w-4 accent-sky-600" />
                </div>
              <div>
                <label htmlFor="setup-costing-method" className={labelClass}>طريقة احتساب تكلفة المخزون</label>
                <select id="setup-costing-method" value={form.costingMethod} onChange={(e) => setForm((prev) => ({ ...prev, costingMethod: e.target.value as 'AVERAGE_COST' | 'FIFO' }))} className={inputClass}>
                  <option value="AVERAGE_COST">متوسط التكلفة</option>
                  <option value="FIFO">الوارد أولاً يصرف أولاً (FIFO)</option>
                </select>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">طريقة التكلفة تؤثر على تقييم المخزون والأرباح.</p>
              </div>
              </fieldset>

              {security.required && setupOptionControl('users', 'تخصيص بيانات المدير الآن', 'يمكنك الاحتفاظ باسم الدخول والاسم الحاليين؛ تغيير كلمة المرور الافتراضية يظل إلزاميًا لحماية النظام.')}
              {security.error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                  لا يمكن إكمال تهيئة حساب المدير: {security.error}
                </p>
              )}
              {security.required && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <h3 className="text-xs font-bold text-amber-800 dark:text-amber-300">تهيئة حساب المدير الأول</h3>
                  </div>
                  <p className="text-[11px] text-amber-700 mb-3 dark:text-amber-200/80">
                    تغيير بيانات الملف الشخصي اختياري؛ تغيير كلمة المرور الافتراضية إلى كلمة قوية إلزامي قبل بدء الاستخدام.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="setup-admin-username" className={labelClass}>اسم المستخدم *</label>
                      <input
                        id="setup-admin-username"
                        value={form.adminUsername}
                        onChange={(e) => set('adminUsername', e.target.value)}
                        className={inputClass}
                        autoComplete="username"
                        maxLength={50}
                        disabled={!options.users}
                      />
                    </div>
                    <div>
                      <label htmlFor="setup-admin-full-name" className={labelClass}>الاسم المعروض *</label>
                      <input
                        id="setup-admin-full-name"
                        value={form.adminFullName}
                        onChange={(e) => set('adminFullName', e.target.value)}
                        className={inputClass}
                        autoComplete="name"
                        maxLength={100}
                        disabled={!options.users}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label htmlFor="setup-admin-phone" className={labelClass}>هاتف المدير (اختياري)</label>
                      <input
                        id="setup-admin-phone"
                        type="tel"
                        value={form.adminPhone}
                        onChange={(e) => set('adminPhone', e.target.value)}
                        className={inputClass}
                        autoComplete="tel"
                        maxLength={30}
                        disabled={!options.users}
                      />
                    </div>
                    <div>
                      <label htmlFor="setup-admin-password" className={labelClass}>كلمة المرور الجديدة</label>
                      <span className="relative block">
                        <input
                          id="setup-admin-password"
                          type={passwordVisible ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className={`${inputClass} pl-10`}
                          placeholder="8 أحرف على الأقل"
                          autoComplete="new-password"
                          maxLength={128}
                        />
                        <button
                          type="button"
                          onClick={() => setPasswordVisible((visible) => !visible)}
                          aria-label={passwordVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                          aria-pressed={passwordVisible}
                          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          {passwordVisible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                        </button>
                      </span>
                    </div>
                    <div>
                      <label htmlFor="setup-admin-password-confirmation" className={labelClass}>تأكيد كلمة المرور</label>
                      <input
                        id="setup-admin-password-confirmation"
                        type={passwordVisible ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={inputClass}
                        autoComplete="new-password"
                        maxLength={128}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-2 dark:text-slate-300">
                    يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل، وأحرف وأرقام، وألا تطابق اسم المستخدم أو تكون كلمة المرور الافتراضية.
                  </p>
                  {adminProfileError && (
                    <p role="alert" className="text-[11px] text-rose-600 mt-2">{adminProfileError}</p>
                  )}
                  {passwordPolicyError && (
                    <p role="alert" className="text-[11px] text-rose-600 mt-2">{passwordPolicyError}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-center text-base font-black text-slate-900 dark:text-slate-100">كل شيء جاهز</h2>
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">راجع الملخص ثم اضغط «بدء الاستخدام».</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                {[
                  ['المعرض', options.company ? form.showroomName || '—' : 'تم تخطيها'],
                  ['الاسم القانوني', options.company ? form.legalName || form.showroomName || '—' : 'تم تخطيها'],
                  ...(security.required ? [
                    ['مدير النظام', options.users ? form.adminFullName || '—' : security.fullName],
                    ['اسم دخول المدير', options.users ? form.adminUsername || '—' : security.username],
                  ] : []),
                  ['الفرع الافتراضي', options.branch ? form.branchName || '—' : 'تم تخطي تعديل الاسم'],
                  ['المخزن الافتراضي', options.branch ? form.warehouseName || '—' : 'تم تخطي تعديل الاسم'],
                  ['نوع النشاط', options.modules ? (form.businessType === 'custom' ? form.businessTypeLabel || 'نشاط مخصص' : BUSINESS_TYPES.find((type) => type.id === form.businessType)?.label || 'معرض متعدد الأنشطة') : 'تم تخطيها'],
                  ['الأنشطة الفرعية', options.modules ? businessConfig.additionalActivityIds
                    .map((id) => BUSINESS_TYPES.find((type) => type.id === id)?.label || id)
                    .join('، ') || 'لا توجد' : 'تم تخطيها'],
                  ['الوحدات المفعلة', options.modules ? `${form.enabledModules.length} وحدات` : 'تم تخطيها'],
                  ['نموذج العمل', options.modules ? (businessConfig.businessModel === 'services' ? 'خدمات' : businessConfig.businessModel === 'mixed' ? 'منتجات وخدمات' : 'منتجات') : 'تم تخطيه'],
                  ['إدارة المخزون', options.inventory ? (businessConfig.trackInventory ? 'مفعلة' : 'معطلة') : 'تم تخطي الإعداد'],
                  ['وحدات القياس', options.modules ? `${businessConfig.units.length + businessConfig.customUnits.length} وحدات` : 'تم تخطيها'],
                  ['الهاتف', options.company ? form.phone || '—' : 'تم تخطيها'],
                  ['العملة', options.company ? `${form.currency} (${currencySymbol})` : 'تم تخطيها'],
                  ['بداية السنة المالية', options.accounting ? (['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'][Number(form.fiscalYearStartMonth) - 1] || 'يناير') : 'تم تخطيها'],
                  ['الضريبة الافتراضية', options.accounting ? `${form.taxPercentage || 0}%` : 'تم تخطيها'],
                  ['تنبيه المخزون', options.inventory ? `${form.lowStockThreshold || 0} بوحدة الصنف` : 'تم تخطيه'],
                  ['حد اعتماد الخصم', options.accounting ? `${form.discountThreshold || 0}%` : 'تم تخطيه'],
                ].map(([label, value]) => (
                  <div key={label} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                    <span className="min-w-0 truncate text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
                    <span className="min-w-0 max-w-[60%] truncate text-xs font-bold text-slate-900 dark:text-slate-100" title={value}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
                <p className="font-bold">البيانات والحسابات</p>
                <p className="mt-1">سيُجهّز دليل الحسابات الافتراضي. استيراد الأصناف والعملاء والموردين اختياري ويمكن تنفيذه بعد الدخول من صفحة استيراد البيانات، ثم إدخال الأرصدة الافتتاحية من شاشاتها المخصصة.</p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
            className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 sm:flex-none sm:px-4 sm:text-sm"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" /> السابق
          </button>
          <div className="flex flex-1 justify-end sm:flex-none">
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => canContinue && setStep((s) => s + 1)}
                disabled={!canContinue || (step === 3 && !passwordValid)}
                className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-sky-700 disabled:opacity-40 sm:w-auto sm:px-5 sm:text-sm"
              >
                التالي <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60 sm:w-auto sm:px-5 sm:text-sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                بدء الاستخدام
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
