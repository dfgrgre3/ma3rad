import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlatformBrandingConfig,
  PlatformBrandingVersion,
  PlatformInvoiceTemplate,
} from './platformTypes';

test('should model master platform branding configuration correctly', () => {
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

  assert.strictEqual(config.tenantId, null);
  assert.strictEqual(config.primaryColor, '#10b981');
  assert.strictEqual(config.allowedCustomizations.canChangeLogo, true);
  assert.strictEqual(config.allowedCustomizations.canChangeLogin, false);
});

test('should model per-tenant white-label branding with custom subdomain', () => {
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

  assert.strictEqual(tenantBrand.tenantId, 'tenant_99');
  assert.strictEqual(tenantBrand.customSubdomain, 'golden-ceramics');
  assert.strictEqual(tenantBrand.invoiceTemplate, 'modern');
  assert.strictEqual(tenantBrand.version, 2);
});

test('should support snapshot history and rollback records', () => {
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

  assert.strictEqual(versionRecord.brandingSnapshot.companyName, 'شركة السيراميك الذهبي القديمة');
  assert.strictEqual(versionRecord.version, 1);
  assert.strictEqual(versionRecord.brandingSnapshot.fontFamily, 'Almarai');
});
