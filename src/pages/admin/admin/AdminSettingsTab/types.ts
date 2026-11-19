import type { SystemSettings } from '../../../../types';

export type Tab = 'general' | 'business' | 'branding' | 'customization' | 'invoice' | 'inventory' | 'operations' | 'security' | 'backup';

export type PosPaymentVisibilitySetting =
  | 'posShowCashButton'
  | 'posShowCardButton'
  | 'posShowBankTransferButton'
  | 'posShowChequeButton'
  | 'posShowCreditButton'
  | 'posShowMixedPaymentButton';

export interface AdminSettingsTabProps {
  initialTab?: Tab;
  onTabChange?: (tab: Tab) => void;
}

export interface BusinessProfileForm {
  type: string;
  customName: string;
  enabledModules: string[];
  additionalActivityIds: string[];
}

export type SettingsSetter = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => void;

export type NavigationLayoutValue = 'sidebar' | 'header';
