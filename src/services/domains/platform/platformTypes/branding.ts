// ─── Branding & White-Labeling (Item 11) ──────────────────────────────────────

export type PlatformInvoiceTemplate = 'classic' | 'modern' | 'minimal' | 'thermal_pos';

export interface PlatformAllowedCustomizations {
  canChangeLogo: boolean;
  canChangeColors: boolean;
  canChangeInvoiceTemplate: boolean;
  canChangeLogin: boolean;
}

export interface PlatformBrandingConfig {
  id: string;
  tenantId?: string | null;
  companyName: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  invoiceTemplate: PlatformInvoiceTemplate;
  loginBackgroundUrl?: string;
  loginWelcomeTitle?: string;
  loginWelcomeSubtitle?: string;
  emailHeaderLogo?: string;
  emailFooterText?: string;
  customSubdomain?: string;
  allowedCustomizations: PlatformAllowedCustomizations;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformBrandingInput {
  tenantId?: string | null;
  companyName?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  invoiceTemplate?: PlatformInvoiceTemplate;
  loginBackgroundUrl?: string;
  loginWelcomeTitle?: string;
  loginWelcomeSubtitle?: string;
  emailHeaderLogo?: string;
  emailFooterText?: string;
  customSubdomain?: string;
  allowedCustomizations?: Partial<PlatformAllowedCustomizations>;
  changeSummary?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textPrimaryColor?: string;
  textSecondaryColor?: string;
  borderColor?: string;
  fontSizeBase?: string;
  borderRadius?: string;
  customCss?: string;
  customJs?: string;
  rtl?: boolean;
  locale?: string;
  timezone?: string;
  currency?: string;
  dateFormat?: string;
  timeFormat?: string;
  weekStart?: number;
}

export interface PlatformBrandingVersion {
  id: string;
  tenantId?: string | null;
  version: number;
  brandingSnapshot: PlatformBrandingConfig;
  changeSummary?: string;
  createdBy?: string;
  createdAt: string;
}
