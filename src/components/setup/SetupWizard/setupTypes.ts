import type { ReactNode } from 'react';
import type { User } from '../../../types';
import type { BusinessConfiguration } from '../../../config/businessProfiles';

export interface SetupWizardProps {
  onComplete: (configuredAdmin?: User) => void;
}

export type SetupForm = {
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

export interface SetupDraft {
  version: 1;
  step: number;
  form: Record<string, unknown>;
  businessConfig?: unknown;
  options: SetupOptions;
}

export interface SetupOptions {
  company: boolean;
  branch: boolean;
  users: boolean;
  modules: boolean;
  accounting: boolean;
  inventory: boolean;
}

export type SystemCheckResult = {
  state: 'checking' | 'ready' | 'warning' | 'error';
  detail: string;
};

export interface SetupSystemChecks {
  database: SystemCheckResult;
  storage: SystemCheckResult;
  backup: SystemCheckResult;
  version: string;
}

export type DefaultAdminState = {
  required: boolean;
  userId: string;
  username: string;
  fullName: string;
  phone: string;
  error?: string;
};

export type SetupOptionControlRenderer = (
  key: keyof SetupOptions,
  title: string,
  description: string,
) => ReactNode;

export type { BusinessConfiguration };
