import type { PlatformTenantInput, PlatformTenantStatus } from '../../../services/domains/platform/platformTypes';

export const STATUSES: PlatformTenantStatus[] = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'];

export const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: 'شهري',
  QUARTERLY: 'ربع سنوي',
  YEARLY: 'سنوي',
  LIFETIME: 'مدى الحياة',
};

export const ACCOUNT_STATUS = (active?: boolean) => (active ? 'نشط' : 'موقوف');

export const emptyForm: PlatformTenantInput = {
  name: '',
  code: '',
  contactName: '',
  email: '',
  phone: '',
  country: 'مصر',
  city: '',
  address: '',
  businessType: 'معرض سيراميك',
  status: 'TRIAL',
  planId: '',
  seatsLimit: 2,
  branchesLimit: 1,
  devicesLimit: 2,
  notes: '',
};

export interface NewAccountForm {
  enabled: boolean;
  username: string;
  fullName: string;
  email: string;
  password: string;
}

export const emptyAccountForm: NewAccountForm = {
  enabled: true,
  username: '',
  fullName: '',
  email: '',
  password: '',
};

export interface CreatedAccountInfo {
  username: string;
  temporaryPassword?: string | null;
  activationCode?: string | null;
  loginUrl: string;
}

export type TabKey = 'overview' | 'subscription' | 'licenses' | 'billing' | 'logs' | 'users' | 'remote';
