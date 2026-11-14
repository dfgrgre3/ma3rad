import { describe, it, expect } from 'vitest';
import type {
  PlatformBrandingConfig,
  PlatformBrandingVersion,
  PlatformInvoiceTemplate,
} from './platformTypes';

describe('Branding and White-Labeling System Types', () => {
  it('should model master platform branding configuration correctly', () => {
    const config: PlatformBrandingConfig = {
      id: 'brand_master',
      tenantId: null,
      companyName: 'Ceramisys ERP Cloud',
      logoUrl: 'https://example.com/logo.png',
      logoDarkUrl: 'https://example.com/logo-dark.png',
      faviconUrl: 'https://example.com/favicon.ico',
      primaryColor: '#10b981',
      secondaryColor: '#064e3b',
      accentColor: '#3b82f6',
      fontFamily: 'Tajawal',
      invoiceTemplate: 'classic',
      loginWelcomeTitle: 'مرحباً بك في سيراميسيس',
      allowedCustomizations: {
        canChangeLogo: true,
        canChangeColors: true,
        canChangeInvoiceTemplate: true,
        canChangeLogin: false,
      },
      version: 1,
      createdAt: '2026-11-14T20:00:00Z',
      updatedAt: '2026-11-14T20:00:00Z',
    };

    expect(config.tenantId).toBeNull();
    expect(config.primaryColor).toBe('#10b981');
    expect(config.allowedCustomizations.canChangeLogo).toBe(true);
    expect(config.allowedCustomizations.canChangeLogin).toBe(false);
  });

  it('should model per-tenant white-label branding with custom subdomain', () => {
    const tenantBrand: PlatformBrandingConfig = {
      id: 'brand_tenant_99',
      tenantId: 'tenant_99',
      companyName: 'شركة السيراميك الذهبي',
      primaryColor: '#d97706',
      secondaryColor: '#78350f',
      accentColor: '#fbbf24',
      fontFamily: 'Cairo',
      invoiceTemplate: 'modern',
      customSubdomain: 'golden-ceramics',
      allowedCustomizations: {
        canChangeLogo: true,
        canChangeColors: true,
        canChangeInvoiceTemplate: false,
        canChangeLogin: false,
      },
      version: 2,
      createdAt: '2026-11-14T10:00:00Z',
      updatedAt: '2026-11-14T12:00:00Z',
    };

    expect(tenantBrand.tenantId).toBe('tenant_99');
    expect(tenantBrand.customSubdomain).toBe('golden-ceramics');
    expect(tenantBrand.invoiceTemplate).toBe('modern');
    expect(tenantBrand.version).toBe(2);
  });

  it('should support snapshot history and rollback records', () => {
    const snapshot: PlatformBrandingConfig = {
      id: 'brand_tenant_99',
      tenantId: 'tenant_99',
      companyName: 'شركة السيراميك الذهبي القديمة',
      primaryColor: '#0284c7',
      secondaryColor: '#0369a1',
      accentColor: '#38bdf8',
      fontFamily: 'Almarai',
      invoiceTemplate: 'minimal',
      allowedCustomizations: {
        canChangeLogo: true,
        canChangeColors: true,
        canChangeInvoiceTemplate: true,
        canChangeLogin: true,
      },
      version: 1,
      createdAt: '2026-11-14T09:00:00Z',
      updatedAt: '2026-11-14T09:00:00Z',
    };

    const versionRecord: PlatformBrandingVersion = {
      id: 'snap-001',
      tenantId: 'tenant_99',
      version: 1,
      brandingSnapshot: snapshot,
      changeSummary: 'الإصدار الأولي لهوية العميل',
      createdBy: 'admin-root',
      createdAt: '2026-11-14T09:00:00Z',
    };

    expect(versionRecord.brandingSnapshot.companyName).toBe('شركة السيراميك الذهبي القديمة');
    expect(versionRecord.version).toBe(1);
    expect(versionRecord.brandingSnapshot.fontFamily).toBe('Almarai');
  });
});
