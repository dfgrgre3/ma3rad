import React, { useState, useEffect, useCallback } from 'react';
import {
  Palette,
  Image,
  FileText,
  LogIn,
  Mail,
  Globe,
  RotateCcw,
  Save,
  CheckCircle2,
  Eye,
  Sliders,
  History,
  Shield,
  Sparkles,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource'; 
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformBrandingConfig,
  PlatformBrandingVersion,
  PlatformInvoiceTemplate,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, formatDateTime, inputClass } from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
type BrandingTab = 'theme' | 'logos' | 'login' | 'templates' | 'permissions' | 'history';
type PreviewMode = 'login' | 'invoice' | 'app';

export const PlatformBrandingSettingsPage: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<BrandingTab>('theme');
  const canManageBranding = canPlatform('branding');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('login');
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(''); // empty = master platform
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Form State
  const [companyName, setCompanyName] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [logoDarkUrl, setLogoDarkUrl] = useState<string>('');
  const [faviconUrl, setFaviconUrl] = useState<string>('');
  const [primaryColor, setPrimaryColor] = useState<string>('#10b981');
  const [secondaryColor, setSecondaryColor] = useState<string>('#064e3b');
  const [accentColor, setAccentColor] = useState<string>('#3b82f6');
  const [fontFamily, setFontFamily] = useState<string>('Tajawal');
  const [invoiceTemplate, setInvoiceTemplate] = useState<PlatformInvoiceTemplate>('classic');
  const [loginBackgroundUrl, setLoginBackgroundUrl] = useState<string>('');
  const [loginWelcomeTitle, setLoginWelcomeTitle] = useState<string>('');
  const [loginWelcomeSubtitle, setLoginWelcomeSubtitle] = useState<string>('');
  const [emailHeaderLogo, setEmailHeaderLogo] = useState<string>('');
  const [emailFooterText, setEmailFooterText] = useState<string>('');
  const [customSubdomain, setCustomSubdomain] = useState<string>('');
  const [canChangeLogo, setCanChangeLogo] = useState<boolean>(true);
  const [canChangeColors, setCanChangeColors] = useState<boolean>(true);
  const [canChangeInvoiceTemplate, setCanChangeInvoiceTemplate] = useState<boolean>(true);
  const [canChangeLogin, setCanChangeLogin] = useState<boolean>(false);

  const [currentVersion, setCurrentVersion] = useState<number>(1);
  const [versions, setVersions] = useState<PlatformBrandingVersion[]>([]);

  // Load Tenants
  const loadTenants = useCallback(async () => {
    const centralState = getCentralDataSourceState();
    try {
      const list = centralState.active
        ? await centralPlatformClient.listTenants()
        : platformAdminService.listTenants();
      setTenants(list);
    } catch {
      setTenants([]);
    }
  }, []);

  // Load Branding Data
  const loadBranding = useCallback(async (tenantId: string) => {
    setLoading(true);
    const centralState = getCentralDataSourceState();
    try {
      let data: any;
      let vList: any[] = [];

      if (centralState.active) {
        data = tenantId
          ? await centralPlatformClient.getTenantBranding(tenantId)
          : await centralPlatformClient.getPlatformBranding();
        vList = tenantId ? await centralPlatformClient.listTenantBrandingVersions(tenantId) : [];
      } else {
        data = tenantId
          ? platformAdminService.getTenantBranding(tenantId)
          : platformAdminService.getPlatformBranding();
        vList = platformAdminService.listTenantBrandingVersions(tenantId || null);
      }

      setCompanyName(data.companyName || '');
      setLogoUrl(data.logoUrl || '');
      setLogoDarkUrl(data.logoDarkUrl || '');
      setFaviconUrl(data.faviconUrl || '');
      setPrimaryColor(data.primaryColor || '#10b981');
      setSecondaryColor(data.secondaryColor || '#064e3b');
      setAccentColor(data.accentColor || '#3b82f6');
      setFontFamily(data.fontFamily || 'Tajawal');
      setInvoiceTemplate(data.invoiceTemplate || 'classic');
      setLoginBackgroundUrl(data.loginBackgroundUrl || '');
      setLoginWelcomeTitle(data.loginWelcomeTitle || '');
      setLoginWelcomeSubtitle(data.loginWelcomeSubtitle || '');
      setEmailHeaderLogo(data.emailHeaderLogo || '');
      setEmailFooterText(data.emailFooterText || '');
      setCustomSubdomain(data.customSubdomain || '');

      const allowed = data.allowedCustomizations || {};
      setCanChangeLogo(allowed.canChangeLogo ?? true);
      setCanChangeColors(allowed.canChangeColors ?? true);
      setCanChangeInvoiceTemplate(allowed.canChangeInvoiceTemplate ?? true);
      setCanChangeLogin(allowed.canChangeLogin ?? false);

      setCurrentVersion(data.version);
      setVersions(vList);
    } catch (e) {
      console.error('Failed to load branding:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    loadBranding(selectedTenantId);
  }, [selectedTenantId, loadBranding]);

  // Handle Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageBranding) { toast.warning('لا تملك صلاحية إدارة الهوية'); return; }
    setSaving(true);
    setSavedSuccess(false);
    const centralState = getCentralDataSourceState();
    try {
      const brandingInput = {
        companyName,
        logoUrl,
        logoDarkUrl,
        faviconUrl,
        primaryColor,
        secondaryColor,
        accentColor,
        fontFamily,
        invoiceTemplate,
        loginBackgroundUrl,
        loginWelcomeTitle,
        loginWelcomeSubtitle,
        emailHeaderLogo,
        emailFooterText,
        customSubdomain,
        allowedCustomizations: {
          canChangeLogo,
          canChangeColors,
          canChangeInvoiceTemplate,
          canChangeLogin,
        },
      };

      let updated: any;
      if (centralState.active) {
        if (selectedTenantId) {
          updated = await centralPlatformClient.saveTenantBranding(selectedTenantId, brandingInput);
        } else {
          // For platform-level branding, use updateBranding (settings endpoint)
          await centralPlatformClient.updateSettings({ branding: JSON.stringify(brandingInput) });
          updated = { version: currentVersion + 1 };
        }
      } else {
        updated = platformAdminService.saveTenantBranding({
          tenantId: selectedTenantId || null,
          ...brandingInput,
          changeSummary: selectedTenantId
            ? `تحديث هوية العميل (${tenants.find((t) => t.id === selectedTenantId)?.name || selectedTenantId})`
            : 'تحديث الهوية المركزية للمنصة',
        });
      }

      setCurrentVersion(updated.version || currentVersion + 1);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      loadBranding(selectedTenantId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Handle Rollback
  const handleRollback = async (ver: number) => {
    if (!canManageBranding) { toast.warning('لا تملك صلاحية إدارة الهوية'); return; }
    if (!confirm(`هل أنت متأكد من استرجاع إعدادات الهوية للإصدار #${ver}؟`)) return;
    const centralState = getCentralDataSourceState();
    try {
      if (centralState.active && selectedTenantId) {
        await centralPlatformClient.rollbackTenantBranding(selectedTenantId, ver);
      } else if (!centralState.active) {
        platformAdminService.rollbackTenantBranding(selectedTenantId || null, ver);
      }
      loadBranding(selectedTenantId);
      toast.success(`تم استرجاع الإصدار #${ver} بنجاح.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="الهوية والمظهر وواجهات العملاء (Branding)"
        description="إدارة الهوية البصرية المركزية، هوية المستأجرين المستقلة (White-Labeling)، الألوان، الخطوط، قوالب الفواتير وشاشات الدخول"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || loading || !canManageBranding}
            >
              <Save className="w-4 h-4 ml-2" />
              {saving ? 'جاري الحفظ...' : 'حفظ الهوية والتطبيق'}
            </Button>
          </div>
        }
      />

      {/* Tenant Selector Bar */}
      <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-emerald-400" />
          <div>
            <label className="text-xs font-semibold text-zinc-300 block mb-1">نطاق تطبيق الهوية:</label>
            <select
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className={`${inputClass} min-w-[260px]`}
            >
              <option value="">الهوية المركزية للمنصة (Master Platform)</option>
              <optgroup label="العملاء والمستأجرين (Tenants)">
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {savedSuccess && (
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-800/40">
              <CheckCircle2 className="w-4 h-4" />
              تم حفظ الهوية بنجاح
            </span>
          )}
          <span className="text-zinc-400">
            الإصدار النشط: <strong className="text-zinc-200">#{currentVersion}</strong>
          </span>
        </div>
      </div>

      {/* Main Layout: Settings Tabs + Live Preview Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Middle Column: Settings Form & Tabs (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Tabs */}
          <div className="flex border-b border-zinc-800 space-x-1 space-x-reverse overflow-x-auto">
            <button
              onClick={() => setActiveTab('theme')}
              className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'theme' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400'
              }`}
            >
              <Palette className="w-4 h-4" />
              الألوان والخطوط
            </button>
            <button
              onClick={() => setActiveTab('logos')}
              className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'logos' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400'
              }`}
            >
              <Image className="w-4 h-4" />
              الشعارات والأيقونات
            </button>
            <button
              onClick={() => setActiveTab('login')}
              className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'login' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400'
              }`}
            >
              <LogIn className="w-4 h-4" />
              شاشة تسجيل الدخول
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'templates' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400'
              }`}
            >
              <FileText className="w-4 h-4" />
              الفواتير والبريد
            </button>
            {selectedTenantId && (
              <button
                onClick={() => setActiveTab('permissions')}
                className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'permissions' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400'
                }`}
              >
                <Sliders className="w-4 h-4" />
                صلاحيات التخصيص
              </button>
            )}
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'history' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400'
              }`}
            >
              <History className="w-4 h-4" />
              سجل الإصدارات
            </button>
          </div>

          {/* Tab Content Box */}
          <div className="bg-zinc-900/50 p-5 rounded-xl border border-zinc-800 space-y-4">
            {/* 1. Theme Tab */}
            {activeTab === 'theme' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">اسم المؤسسة / العلامة التجارية</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={`w-full ${inputClass}`}
                    placeholder="اسم الشركة أو المؤسسة"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">اللون الأساسي (Primary)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-10 h-9 rounded bg-transparent cursor-pointer border border-zinc-700"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className={`flex-1 font-mono text-xs ${inputClass}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">اللون الثانوي (Secondary)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-10 h-9 rounded bg-transparent cursor-pointer border border-zinc-700"
                      />
                      <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className={`flex-1 font-mono text-xs ${inputClass}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">لون التمييز (Accent)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-10 h-9 rounded bg-transparent cursor-pointer border border-zinc-700"
                      />
                      <input
                        type="text"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className={`flex-1 font-mono text-xs ${inputClass}`}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">الخط المعتمد للواجهات (Font Family)</label>
                  <select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className={`w-full ${inputClass}`}
                  >
                    <option value="Tajawal">Tajawal (تجوال - عصري وواضح)</option>
                    <option value="Cairo">Cairo (القاهرة - عريض ورسمي)</option>
                    <option value="Almarai">Almarai (المراعي - مريح للقراءة)</option>
                    <option value="IBM Plex Sans Arabic">IBM Plex Sans Arabic (تقني ومؤسسي)</option>
                    <option value="Alexandria">Alexandria (الإسكندرية - أنيق)</option>
                  </select>
                </div>
              </div>
            )}

            {/* 2. Logos Tab */}
            {activeTab === 'logos' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">رابط الشعار الرئيسي (Logo Light / Standard)</label>
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className={`w-full ${inputClass}`}
                  />
                  <span className="text-[11px] text-zinc-500">يظهر في الشريط العلوي وقوالب الفواتير والمستندات.</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">رابط الشعار المخصص للوضع الداكن (Logo Dark)</label>
                  <input
                    type="url"
                    value={logoDarkUrl}
                    onChange={(e) => setLogoDarkUrl(e.target.value)}
                    placeholder="https://example.com/logo-dark.png"
                    className={`w-full ${inputClass}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">أيقونة المتصفح (Favicon URL)</label>
                  <input
                    type="url"
                    value={faviconUrl}
                    onChange={(e) => setFaviconUrl(e.target.value)}
                    placeholder="https://example.com/favicon.ico"
                    className={`w-full ${inputClass}`}
                  />
                </div>
              </div>
            )}

            {/* 3. Login Tab */}
            {activeTab === 'login' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">رابط صورة خلفية تسجيل الدخول</label>
                  <input
                    type="url"
                    value={loginBackgroundUrl}
                    onChange={(e) => setLoginBackgroundUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className={`w-full ${inputClass}`}
                  />
                  <span className="text-[11px] text-zinc-500">اتركه فارغاً لاعتماد الخلفية الافتراضية الداكنة.</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">عنوان الترحيب في شاشة الدخول</label>
                  <input
                    type="text"
                    value={loginWelcomeTitle}
                    onChange={(e) => setLoginWelcomeTitle(e.target.value)}
                    placeholder="مرحباً بك في..."
                    className={`w-full ${inputClass}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">النص الفرعي / الإرشادي</label>
                  <textarea
                    rows={2}
                    value={loginWelcomeSubtitle}
                    onChange={(e) => setLoginWelcomeSubtitle(e.target.value)}
                    placeholder="أدخل بريدك الإلكتروني وكلمة المرور للمتابعة..."
                    className={`w-full ${inputClass}`}
                  />
                </div>
              </div>
            )}

            {/* 4. Templates Tab */}
            {activeTab === 'templates' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">قالب الفواتير المعتمد للطباعة</label>
                  <select
                    value={invoiceTemplate}
                    onChange={(e) => setInvoiceTemplate(e.target.value as PlatformInvoiceTemplate)}
                    className={`w-full ${inputClass}`}
                  >
                    <option value="classic">القالب الكلاسيكي الرسمي (Classic Ledger)</option>
                    <option value="modern">القالب العصري الحديث (Modern Clean)</option>
                    <option value="minimal">القالب البسيط والموفر للحبر (Minimal Eco)</option>
                    <option value="thermal_pos">إيصال نقاط البيع الحراري (POS Thermal Receipt)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">رابط الشعار المخصص للبريد الإلكتروني</label>
                  <input
                    type="url"
                    value={emailHeaderLogo}
                    onChange={(e) => setEmailHeaderLogo(e.target.value)}
                    placeholder="https://example.com/email-logo.png"
                    className={`w-full ${inputClass}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">نص تذييل رسائل البريد والإشعارات</label>
                  <input
                    type="text"
                    value={emailFooterText}
                    onChange={(e) => setEmailFooterText(e.target.value)}
                    placeholder="جميع الحقوق محفوظة..."
                    className={`w-full ${inputClass}`}
                  />
                </div>
              </div>
            )}

            {/* 5. Permissions Tab (Only for tenant view) */}
            {activeTab === 'permissions' && selectedTenantId && (
              <div className="space-y-4">
                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-3">
                  <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    عناصر الهوية المسموح للعميل بتعديلها من لوحته:
                  </h4>
                  <div className="space-y-2 text-xs">
                    <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={canChangeLogo}
                        onChange={(e) => setCanChangeLogo(e.target.checked)}
                        className="rounded border-zinc-700 text-emerald-500 focus:ring-0"
                      />
                      السماح للعميل بتغيير الشعار والأيقونة (Logo & Favicon)
                    </label>

                    <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={canChangeColors}
                        onChange={(e) => setCanChangeColors(e.target.checked)}
                        className="rounded border-zinc-700 text-emerald-500 focus:ring-0"
                      />
                      السماح للعميل بتخصيص الألوان والسمة (Brand Colors)
                    </label>

                    <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={canChangeInvoiceTemplate}
                        onChange={(e) => setCanChangeInvoiceTemplate(e.target.checked)}
                        className="rounded border-zinc-700 text-emerald-500 focus:ring-0"
                      />
                      السماح للعميل باختيار قالب الفاتورة (Invoice Template)
                    </label>

                    <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={canChangeLogin}
                        onChange={(e) => setCanChangeLogin(e.target.checked)}
                        className="rounded border-zinc-700 text-emerald-500 focus:ring-0"
                      />
                      السماح للعميل بتخصيص صفحة تسجيل الدخول وخلفيتها
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">النطاق الفرعي المخصص (Subdomain)</label>
                  <div className="flex items-center gap-2" dir="ltr">
                    <span className="text-zinc-500 text-xs">https://</span>
                    <input
                      type="text"
                      value={customSubdomain}
                      onChange={(e) => setCustomSubdomain(e.target.value)}
                      placeholder="clientname"
                      className={`flex-1 font-mono text-xs ${inputClass}`}
                    />
                    <span className="text-zinc-500 text-xs">.ceramisys.com</span>
                  </div>
                </div>
              </div>
            )}

            {/* 6. History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-3">
                <div className="text-xs text-zinc-400">
                  سجل الإصدارات واللقطات السابقة للهوية:
                </div>
                {versions.length === 0 ? (
                  <EmptyState title="لا توجد إصدارات سابقة مسجلة للهوية" />
                ) : (
                  <div className="space-y-2">
                    {versions.map((ver) => (
                      <div
                        key={ver.id}
                        className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-zinc-200">
                            إصدار #{ver.version} {ver.version === currentVersion && <span className="text-emerald-400 mr-2">(الحالي)</span>}
                          </div>
                          <div className="text-zinc-400 text-[11px] mt-0.5">{ver.changeSummary}</div>
                          <div className="text-zinc-500 text-[10px]">{formatDateTime(ver.createdAt)}</div>
                        </div>
                        {ver.version !== currentVersion && canManageBranding && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleRollback(ver.version)}
                            >
                              <RotateCcw className="w-3.5 h-3.5 ml-1" />
                              استرجاع
                            </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Interactive Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-3 sticky top-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-emerald-400" />
              المعاينة الفورية الحية (Live Preview)
            </h3>
            <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-[11px]">
              <button
                onClick={() => setPreviewMode('login')}
                className={`px-2 py-1 rounded transition-colors ${
                  previewMode === 'login' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400'
                }`}
              >
                شاشة الدخول
              </button>
              <button
                onClick={() => setPreviewMode('invoice')}
                className={`px-2 py-1 rounded transition-colors ${
                  previewMode === 'invoice' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400'
                }`}
              >
                الفاتورة
              </button>
              <button
                onClick={() => setPreviewMode('app')}
                className={`px-2 py-1 rounded transition-colors ${
                  previewMode === 'app' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400'
                }`}
              >
                الواجهة
              </button>
            </div>
          </div>

          {/* Interactive Preview Container */}
          <div className="bg-zinc-950 rounded-xl border border-zinc-800 p-4 shadow-2xl min-h-[460px] flex flex-col justify-center overflow-hidden relative">
            {/* 1. Preview: Login Screen */}
            {previewMode === 'login' && (
              <div
                className="rounded-lg p-5 border border-zinc-800/80 text-center space-y-4 relative overflow-hidden"
                style={{
                  background: loginBackgroundUrl
                    ? `linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.85)), url('${loginBackgroundUrl}') center/cover`
                    : '#09090b',
                  fontFamily: fontFamily || 'inherit',
                }}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-10 mx-auto object-contain" />
                ) : (
                  <div
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-bold text-white text-sm"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {companyName || 'Ceramisys ERP'}
                  </div>
                )}

                <div>
                  <h4 className="font-bold text-zinc-100 text-base">
                    {loginWelcomeTitle || 'تسجيل الدخول للنظام'}
                  </h4>
                  <p className="text-zinc-400 text-xs mt-1">
                    {loginWelcomeSubtitle || 'أدخل بيانات اعتمادك لمتابعة الأعمال'}
                  </p>
                </div>

                <div className="space-y-2 max-w-xs mx-auto text-right text-xs">
                  <div className="bg-zinc-900/90 border border-zinc-700/60 rounded px-3 py-2 text-zinc-400">
                    user@organization.com
                  </div>
                  <div className="bg-zinc-900/90 border border-zinc-700/60 rounded px-3 py-2 text-zinc-400">
                    ••••••••••••
                  </div>
                  <button
                    type="button"
                    className="w-full py-2.5 rounded font-semibold text-white shadow transition-transform active:scale-95 text-xs"
                    style={{ backgroundColor: primaryColor }}
                  >
                    دخول إلى الحساب
                  </button>
                </div>

                <div className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/60">
                  {customSubdomain ? `https://${customSubdomain}.ceramisys.com` : 'https://app.ceramisys.com'}
                </div>
              </div>
            )}

            {/* 2. Preview: Invoice */}
            {previewMode === 'invoice' && (
              <div
                className="bg-white text-zinc-900 rounded-lg p-4 text-right text-xs shadow space-y-3"
                style={{ fontFamily: fontFamily || 'inherit' }}
              >
                <div
                  className="flex items-center justify-between pb-3 border-b-2"
                  style={{ borderColor: primaryColor }}
                >
                  <div>
                    <h4 className="font-bold text-base" style={{ color: primaryColor }}>
                      {companyName || 'اسم الشركة والمؤسسة'}
                    </h4>
                    <span className="text-[10px] text-zinc-500">فاتورة مبيعات ضريبية #{invoiceTemplate.toUpperCase()}</span>
                  </div>
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="h-8 object-contain" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center font-bold text-white text-xs"
                      style={{ backgroundColor: secondaryColor }}
                    >
                      INV
                    </div>
                  )}
                </div>

                <div className="bg-zinc-50 p-2 rounded text-[11px] grid grid-cols-2 gap-2 text-zinc-600">
                  <div>العميل: مؤسسة الأمل للتجارة</div>
                  <div>التاريخ: 2026/11/14</div>
                </div>

                <table className="w-full text-right text-[11px]">
                  <thead>
                    <tr style={{ backgroundColor: `${primaryColor}15`, color: secondaryColor }}>
                      <th className="p-1">البند</th>
                      <th className="p-1">الكمية</th>
                      <th className="p-1">السعر</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    <tr>
                      <td className="p-1">سيراميك أرضيات فرز أول</td>
                      <td className="p-1">50 م²</td>
                      <td className="p-1">12,500 ج.م</td>
                    </tr>
                  </tbody>
                </table>

                <div className="pt-2 border-t flex justify-between font-bold text-xs" style={{ color: secondaryColor }}>
                  <span>الإجمالي شامل الضريبة:</span>
                  <span>14,250 ج.م</span>
                </div>
              </div>
            )}

            {/* 3. Preview: App Bar & UI */}
            {previewMode === 'app' && (
              <div
                className="bg-zinc-900 rounded-lg border border-zinc-800 p-3 space-y-3 text-xs"
                style={{ fontFamily: fontFamily || 'inherit' }}
              >
                {/* Navbar */}
                <div
                  className="p-2.5 rounded flex items-center justify-between text-white"
                  style={{ backgroundColor: secondaryColor }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <span className="font-bold">{companyName || 'لوحة التحكم'}</span>
                  </div>
                  <span className="text-[10px] opacity-80">مدير النظام</span>
                </div>

                {/* Cards */}
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className="p-2.5 rounded border border-zinc-800 bg-zinc-950/70"
                    style={{ borderRight: `3px solid ${primaryColor}` }}
                  >
                    <div className="text-[10px] text-zinc-400">إجمالي المبيعات</div>
                    <div className="text-sm font-bold text-zinc-100 mt-1">128,400 ج.م</div>
                  </div>
                  <div
                    className="p-2.5 rounded border border-zinc-800 bg-zinc-950/70"
                    style={{ borderRight: `3px solid ${accentColor}` }}
                  >
                    <div className="text-[10px] text-zinc-400">الفواتير النشطة</div>
                    <div className="text-sm font-bold text-zinc-100 mt-1">42 فاتورة</div>
                  </div>
                </div>

                {/* Primary Button */}
                <button
                  type="button"
                  className="w-full py-2 rounded text-white font-semibold text-xs shadow"
                  style={{ backgroundColor: primaryColor }}
                >
                  زر الإجراء الرئيسي
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformBrandingSettingsPage;
