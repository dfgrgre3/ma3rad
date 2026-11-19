import { SettingsService } from '../../../services/domains/config/SettingsService';
import { BUSINESS_TYPES, parseEnabledModules } from '../../../config/businessProfiles';
import { SETUP_DRAFT_KEY, CURRENCIES, STEPS } from './setupConstants';
import type { SetupDraft, SetupForm, SetupOptions } from './setupTypes';

export function parseSetupOptions(value: unknown): SetupOptions {
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

export function readSetupDraft(): SetupDraft | null {
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

export function mergeSetupDraft(defaults: SetupForm, draft: SetupDraft | null): SetupForm {
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

