import type {
  PlatformBillingCycle,
  PlatformPlanInput,
} from '../../../services/domains/platform/platformTypes';

// ─── Normalization (local rows are camelCase, central API may return snake_case) ───

export const pick = (row: any, ...keys: string[]): any => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

export const toBool = (value: any): boolean => value === true || value === 1 || value === '1' || value === 'true';

export const jsonArray = (value: any): string[] => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};

/** NaN-safe numeric parsing clamped to a minimum. */
export const numericInput = (value: string | number | null | undefined, min = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, n) : min;
};

const num = (value: any, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export interface CatalogPlan {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  billingCycle: PlatformBillingCycle;
  price: number;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  seatsLimit: number;
  branchesLimit: number;
  devicesLimit: number;
  storageLimitMb: number;
  maxProducts: number;
  maxWarehouses: number;
  trialDays: number;
  includedModules: string[];
  features: string[];
  permissions: string[];
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  offlineGracePeriodDays: number;
  subscriberCount: number;
  raw: any;
}

export const normalizePlan = (row: any): CatalogPlan => ({
  id: String(pick(row, 'id') ?? ''),
  code: String(pick(row, 'code') ?? ''),
  name: String(pick(row, 'name') ?? pick(row, 'code') ?? ''),
  description: pick(row, 'description') ?? null,
  billingCycle: (pick(row, 'billingCycle', 'billing_cycle') ?? 'MONTHLY') as PlatformBillingCycle,
  price: num(pick(row, 'price')),
  monthlyPrice: num(pick(row, 'monthlyPrice', 'monthly_price')),
  yearlyPrice: num(pick(row, 'yearlyPrice', 'yearly_price')),
  currency: String(pick(row, 'currency') ?? 'EGP'),
  seatsLimit: Number(pick(row, 'seatsLimit', 'seats_limit') ?? 1) || 1,
  branchesLimit: Number(pick(row, 'branchesLimit', 'branches_limit') ?? 1) || 1,
  devicesLimit: Number(pick(row, 'devicesLimit', 'devices_limit') ?? 1) || 1,
  storageLimitMb: Number(pick(row, 'storageLimitMb', 'storage_limit_mb') ?? 500) || 0,
  maxProducts: Number(pick(row, 'maxProducts', 'max_products') ?? 1000) || 0,
  maxWarehouses: Number(pick(row, 'maxWarehouses', 'max_warehouses') ?? 2) || 0,
  trialDays: Number(pick(row, 'trialDays', 'trial_days') ?? 14) || 14,
  includedModules: jsonArray(pick(row, 'includedModules', 'included_modules')),
  features: jsonArray(pick(row, 'features')),
  permissions: jsonArray(pick(row, 'permissions')),
  isActive: toBool(pick(row, 'isActive', 'is_active')),
  isDefault: toBool(pick(row, 'isDefault', 'is_default')),
  sortOrder: Number(pick(row, 'sortOrder', 'sort_order') ?? 0) || 0,
  offlineGracePeriodDays: Number(pick(row, 'offlineGracePeriodDays', 'offline_grace_period_days') ?? 14) || 14,
  subscriberCount: Number(pick(row, 'subscriberCount', 'subscriber_count') ?? 0) || 0,
  raw: row,
});

export interface CatalogFeature {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isEnabled: boolean;
  rolloutPercent: number;
  isStagingOnly: boolean;
  minPlanTier?: string | null;
  pagePaths: string[];
}

export const normalizeFeature = (row: any): CatalogFeature => ({
  id: String(pick(row, 'id') ?? ''),
  code: String(pick(row, 'code', 'key') ?? ''),
  name: String(pick(row, 'name') ?? pick(row, 'code', 'key') ?? ''),
  description: pick(row, 'description') ?? null,
  category: pick(row, 'category') ?? null,
  isEnabled: toBool(pick(row, 'isEnabled', 'is_enabled', 'enabled')),
  rolloutPercent: Number(pick(row, 'rolloutPercent', 'rollout_percentage', 'rolloutPercentage') ?? 100) || 0,
  isStagingOnly: toBool(pick(row, 'isStagingOnly', 'is_staging_only')),
  minPlanTier: pick(row, 'minPlanTier', 'min_plan_tier') ?? null,
  pagePaths: jsonArray(pick(row, 'pagePaths', 'page_paths')),
});

export interface CatalogModule {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isEnabled: boolean;
}

export const normalizeModule = (row: any): CatalogModule => ({
  id: String(pick(row, 'id') ?? ''),
  code: String(pick(row, 'code') ?? pick(row, 'id') ?? ''),
  name: String(pick(row, 'name') ?? pick(row, 'code') ?? ''),
  description: pick(row, 'description') ?? null,
  category: pick(row, 'category') ?? null,
  isEnabled: toBool(pick(row, 'isEnabled', 'is_enabled', 'enabled')),
});

// ─── Billing cycles ────────────────────────────────────────────────────────────

export const CYCLES: Array<{ value: PlatformBillingCycle; label: string }> = [
  { value: 'MONTHLY', label: 'شهري' },
  { value: 'QUARTERLY', label: 'ربع سنوي' },
  { value: 'YEARLY', label: 'سنوي' },
  { value: 'LIFETIME', label: 'مدى الحياة' },
];

export const CURRENCIES = ['EGP', 'SAR', 'AED', 'USD', 'EUR'];

// ─── Plan form ─────────────────────────────────────────────────────────────────

export const emptyPlanForm: PlatformPlanInput = {
  code: '',
  name: '',
  description: '',
  billingCycle: 'YEARLY',
  price: 0,
  monthlyPrice: 0,
  yearlyPrice: 0,
  currency: 'EGP',
  seatsLimit: 3,
  branchesLimit: 1,
  devicesLimit: 2,
  storageLimitMb: 500,
  maxProducts: 1000,
  maxWarehouses: 2,
  trialDays: 14,
  includedModules: [],
  features: [],
  permissions: [],
  isActive: true,
  isDefault: false,
  sortOrder: 0,
  offlineGracePeriodDays: 14,
};

// ─── Feature form ─────────────────────────────────────────────────────────────

export interface FeatureFormState {
  id?: string;
  code: string;
  name: string;
  description: string;
  category: string;
  isEnabled: boolean;
  rolloutPercent: number;
  isStagingOnly: boolean;
  minPlanTier: string;
  pagePaths: string[];
}

export const emptyFeatureForm: FeatureFormState = {
  code: '',
  name: '',
  description: '',
  category: '',
  isEnabled: true,
  rolloutPercent: 100,
  isStagingOnly: false,
  minPlanTier: '',
  pagePaths: [],
};
