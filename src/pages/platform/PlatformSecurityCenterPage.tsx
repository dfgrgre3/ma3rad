import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Lock,
  Unlock,
  Key,
  KeyRound,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  LogOut,
  Smartphone,
  Laptop,
  Globe,
  Radio,
  FileWarning,
  Flame,
  Zap,
  Server,
  Layers,
  Search,
  Plus,
  Copy,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformCentralSecurityOverview,
  PlatformStaffSession,
  PlatformStaffLogin,
  PlatformCentralSecurityIncident,
  PlatformSigningKey,
  PlatformApiKey,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import type { PlatformOwnerAuditEntry } from '../../services/domains/platform/PlatformBootstrapService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  EmptyState,
  StatusBadge,
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

type SecurityTab = 'OVERVIEW' | 'SESSIONS' | 'LOGINS' | 'KEYS' | 'INCIDENTS';

export const PlatformSecurityCenterPage: React.FC = () => {
  const [tab, setTab] = useState<SecurityTab>('OVERVIEW');
  const [data, setData] = useState<PlatformCentralSecurityOverview | null>(null);
  const [apiKeys, setApiKeys] = useState<PlatformApiKey[]>([]);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerAccounts, setOwnerAccounts] = useState<PlatformOwnerAuditEntry[]>([]);

  // Filters
  const [loginFilterFailed, setLoginFilterFailed] = useState(false);
  const [loginSearch, setLoginSearch] = useState('');

  // API Key Modals & States
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<{ plainTextKey: string; key: PlatformApiKey } | null>(null);
  const [apiKeyForm, setApiKeyForm] = useState<{
    tenantId: string;
    name: string;
    scopes: string[];
    expiresAt: string;
  }>({
    tenantId: '',
    name: '',
    scopes: ['read', 'write'],
    expiresAt: '',
  });

  // Modals
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [incidentForm, setIncidentForm] = useState<{
    type: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    details: string;
    sourceIp: string;
  }>({
    type: 'SUSPICIOUS_TRAFFIC',
    severity: 'HIGH',
    title: '',
    details: '',
    sourceIp: '',
  });

  // Load Security Overview
  const canManageSecurity = canPlatform('security-center');

  const loadSecurity = useCallback(async () => {
    setLoading(true);
    try {
      const centralState = getCentralDataSourceState();
      if (centralState.active) {
        const [overview, keys, tenantList] = await Promise.all([
          centralPlatformClient.getSecurityOverview(),
          centralPlatformClient.listApiKeys(),
          centralPlatformClient.listTenants(),
        ]);
        setData(overview as any);
        setApiKeys(keys as any);
        setTenants(tenantList as any);
      } else {
        setData(platformAdminService.getPlatformSecurityOverview());
        setApiKeys(platformAdminService.listApiKeys());
        setTenants(platformAdminService.listTenants());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل مركز الأمان.');
    } finally {
      // The owner-account audit is owner-only; a non-owner simply does not see it.
      try {
        setOwnerAccounts(platformAdminService.auditPlatformOwnerAccounts());
      } catch {
        setOwnerAccounts([]);
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSecurity();
  }, [loadSecurity]);

  // Revoke Single Session
  const handleRevokeSession = (sessionId: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في إنهاء هذه الجلسة عن بعد؟')) return;
    try {
      platformAdminService.revokeStaffSession(sessionId);
      loadSecurity();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر إنهاء الجلسة.');
    }
  };

  // Revoke All Other Sessions
  const handleRevokeAllOtherSessions = () => {
    if (!confirm('تأكيد: سيتم تسجيل خروج كافة الموظفين من جلساتهم المفتوحة فوراً!')) return;
    try {
      platformAdminService.revokeAllOtherStaffSessions();
      loadSecurity();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشلت العملية.');
    }
  };

  // Rotate Signing Key
  const handleRotateKey = (keyAlias: string) => {
    if (!confirm(`هل أنت متأكد من تدوير مفتاح التوقيع (${keyAlias})؟`)) return;
    try {
      platformAdminService.rotatePlatformSigningKey(keyAlias);
      loadSecurity();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تدوير المفتاح.');
    }
  };

  // Revoke API Key
  const handleRevokeApiKey = (id: string) => {
    if (!confirm('هل أنت متأكد من إلغاء مفتاح الـ API هذا؟')) return;
    try {
      platformAdminService.revokeApiKey(id);
      loadSecurity();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر إلغاء المفتاح.');
    }
  };

  // Rotate API Key
  const handleRotateApiKey = (id: string) => {
    if (!confirm('هل أنت متأكد من تدوير هذا المفتاح؟ سيتم إلغاء المفتاح الحالي فوراً وتوليد مفتاح جديد بنفس الصلاحيات.')) return;
    try {
      const res = platformAdminService.rotateApiKey(id);
      setNewKeyResult(res);
      loadSecurity();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تدوير مفتاح الـ API.');
    }
  };

  // Create API Key
  const handleCreateApiKey = () => {
    if (!apiKeyForm.name.trim()) {
      alert('اسم المفتاح مطلوب.');
      return;
    }
    const tenantTarget = apiKeyForm.tenantId || (tenants[0]?.id ?? '');
    if (!tenantTarget) {
      alert('يجب اختيار العميل أو توفير عميل مسجل أولاً.');
      return;
    }
    try {
      const res = platformAdminService.createApiKey({
        tenantId: tenantTarget,
        name: apiKeyForm.name.trim(),
        scopes: apiKeyForm.scopes,
        expiresAt: apiKeyForm.expiresAt || undefined,
      });
      setIsApiKeyModalOpen(false);
      setNewKeyResult(res);
      setApiKeyForm({
        tenantId: tenants[0]?.id ?? '',
        name: '',
        scopes: ['read', 'write'],
        expiresAt: '',
      });
      loadSecurity();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشل إنشاء مفتاح الـ API.');
    }
  };

  // Create Incident
  const handleCreateIncident = () => {
    if (!incidentForm.title.trim()) {
      alert('عنوان الحادث مطلوب.');
      return;
    }
    try {
      platformAdminService.recordSecurityIncident(incidentForm);
      setIsIncidentModalOpen(false);
      setIncidentForm({
        type: 'SUSPICIOUS_TRAFFIC',
        severity: 'HIGH',
        title: '',
        details: '',
        sourceIp: '',
      });
      loadSecurity();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشل تسجيل الحادث.');
    }
  };

  // Contain/Resolve Incident
  const handleRespondIncident = (id: string, resolve: boolean) => {
    const action = prompt(
      resolve
        ? 'أدخل ملخص الإجراء النهائي لحل الحادث الأمني وإغلاقه:'
        : 'أدخل إجراء الاحتواء الأمني المتخذ فوراً:'
    );
    if (!action) return;
    try {
      platformAdminService.respondToSecurityIncident(id, action, resolve);
      loadSecurity();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشلت الاستجابة.');
    }
  };

  // Filtered Logins
  const filteredLogins = useMemo(() => {
    if (!data) return [];
    return data.recentLogins.filter((l) => {
      if (loginFilterFailed && l.status === 'SUCCESS') return false;
      if (
        loginSearch &&
        !l.email.toLowerCase().includes(loginSearch.toLowerCase()) &&
        !(l.ipAddress || '').includes(loginSearch)
      ) {
        return false;
      }
      return true;
    });
  }, [data, loginFilterFailed, loginSearch]);

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-5 text-rose-200">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-rose-400" />
          <span className="font-bold">{error}</span>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-400" />
          <span>جارٍ فحص وتحليل الحالة الأمنية المركزية للمنصة...</span>
        </div>
      </div>
    );
  }

  const isScoreHigh = data.securityScore >= 85;
  const isScoreMedium = data.securityScore >= 65 && data.securityScore < 85;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <PageHeader
        title="مركز الأمان المركزي (Central Security Center)"
        description="المراقبة الأمنية لمسؤولي المنصة، رصد محاولات الاختراق، إدارة الجلسات ومفاتيح التوقيع الرقمي، والاستجابة للطوارئ."
        icon={<ShieldCheck className="h-6 w-6 text-emerald-400" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadSecurity}
              leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              تحديث
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleRevokeAllOtherSessions}
              disabled={!canManageSecurity}
              leadingIcon={<Flame className="h-3.5 w-3.5" />}
            >
              إنهاء كافة الجلسات النشطة
            </Button>
          </div>
        }
      />

      {/* Hero: Central Security Posture Score Card */}
      <section
        className={`relative overflow-hidden rounded-2xl border p-6 shadow-xl ${
          isScoreHigh
            ? 'border-emerald-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white'
            : isScoreMedium
            ? 'border-amber-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950 text-white'
            : 'border-rose-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950 text-white'
        }`}
      >
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                  isScoreHigh
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : isScoreMedium
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                }`}
              >
                {isScoreHigh ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                {isScoreHigh ? 'الوضع الأمني محصن ومستقر' : 'تنبيهات أمنية قيد المتابعة'}
              </span>
              <span className="text-xs text-slate-400">تقييم مبني على الـ 2FA، الجلسات، وسجلات المحاولات الفاشلة</span>
            </div>

            <div className="flex items-baseline gap-3">
              <h1 className="text-5xl font-black tracking-tight">{data.securityScore}%</h1>
              <span className="text-sm font-semibold text-slate-300">مؤشر أمان المنصة العام</span>
            </div>

            <p className="text-sm text-slate-300 max-w-xl">
              المصادقة الثنائية (2FA) لموظفي المنصة، الجلسات المفتوحة والأجهزة الموثوقة، مفاتيح التوقيع الرقمي، مع تسجيل دقيق لكافة محاولات الدخول والحوادث الأمنية.
            </p>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-slate-400">المصادقة 2FA</p>
              <p className="mt-1 text-xl font-black text-emerald-400">
                {data.twoFactorEnforcement.compliantStaffCount} / {data.twoFactorEnforcement.totalStaffCount}
              </p>
              <p className="text-[10px] text-slate-400">موظفون ممتثلون</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-slate-400">الجلسات المفتوحة</p>
              <p className="mt-1 text-xl font-black text-sky-400">{data.activeStaffSessionsCount}</p>
              <p className="text-[10px] text-slate-400">{data.trustedDevicesCount} أجهزة موثوقة</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-slate-400">فشل الدخول (24h)</p>
              <p
                className={`mt-1 text-xl font-black ${
                  data.failedLogins24hCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {data.failedLogins24hCount}
              </p>
              <p className="text-[10px] text-slate-400">محاولات مسجلة</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-slate-400">الحوادث النشطة</p>
              <p
                className={`mt-1 text-xl font-black ${
                  data.activeIncidentsCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {data.activeIncidentsCount}
              </p>
              <p className="text-[10px] text-slate-400">تتطلب استجابة</p>
            </div>
          </div>
        </div>
      </section>

      {/* Owner account audit — owner-only review of every account claiming the owner role */}
      {ownerAccounts.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-purple-400" />
            <h2 className="text-sm font-black text-slate-100">حسابات مالك المنصة</h2>
            <span className="text-[11px] text-slate-400">
              مراجعة الحسابات التي تحمل دور مالك المنصة (SUPER_ADMIN) ومصدر اعتمادها.
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                  <th className="px-3 py-2 font-semibold">الحساب</th>
                  <th className="px-3 py-2 font-semibold">المصدر</th>
                  <th className="px-3 py-2 font-semibold">الحالة</th>
                  <th className="px-3 py-2 font-semibold">الاعتماد</th>
                  <th className="px-3 py-2 font-semibold">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {ownerAccounts.map((account) => (
                  <tr key={`${account.source}:${account.id}`} className="border-b border-slate-800/60">
                    <td className="px-3 py-2 font-semibold text-slate-200" dir="ltr">{account.label}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {account.source === 'platform_staff' ? 'موظفو المنصة' : 'مستخدمو ERP'}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge value={account.isActive ? 'success' : 'neutral'} label={account.isActive ? 'مفعّل' : 'غير مفعّل'} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge value={account.approved ? 'success' : 'danger'} label={account.approved ? 'معتمد' : 'غير معتمد'} />
                    </td>
                    <td className="px-3 py-2 text-[11px] text-amber-300">
                      {account.concerns.length > 0 ? account.concerns.join(' • ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 pb-0">
        <button
          onClick={() => setTab('OVERVIEW')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
            tab === 'OVERVIEW'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>نظرة عامة والإنذارات</span>
        </button>

        <button
          onClick={() => setTab('SESSIONS')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
            tab === 'SESSIONS'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Laptop className="h-4 w-4" />
          <span>الجلسات المركزية والأجهزة الموثوقة ({data.sessions.length})</span>
        </button>

        <button
          onClick={() => setTab('LOGINS')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
            tab === 'LOGINS'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>سجل محاولات الدخول والأنشطة</span>
        </button>

        <button
          onClick={() => setTab('KEYS')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
            tab === 'KEYS'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Key className="h-4 w-4" />
          <span>مفاتيح API والتوقيع الرقمي</span>
        </button>

        <button
          onClick={() => setTab('INCIDENTS')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
            tab === 'INCIDENTS'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileWarning className="h-4 w-4" />
          <span>سجل الحوادث والاستجابة ({data.incidents.length})</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & ACTIVE THREATS */}
      {tab === 'OVERVIEW' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* 1. 2FA Policy Card (live: reads real enforcement + compliance) */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-emerald-400" />
                  سياسة المصادقة الثنائية (2FA)
                </span>
                <span className={`rounded text-[10px] font-bold px-2 py-0.5 ${
                  data.twoFactorEnforcement.enabled
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {data.twoFactorEnforcement.enabled ? 'إلزامية' : 'غير إلزامية'}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {data.twoFactorEnforcement.enabled
                  ? 'إلزامية على كافة موظفي المنصة. الحساب غير المفعّل لا يستطيع استخدام لوحة التحكم.'
                  : 'المصادقة الثنائية غير ملزمة حالياً. يمكن للمالك تفعيل الإلزام من هنا أو من صفحة الفريق.'}
              </p>
              <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>نسبة الامتثال</span>
                  <span className={`font-bold ${data.twoFactorEnforcement.totalStaffCount > 0 && data.twoFactorEnforcement.compliantStaffCount === data.twoFactorEnforcement.totalStaffCount ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {data.twoFactorEnforcement.compliantStaffCount} / {data.twoFactorEnforcement.totalStaffCount}
                  </span>
                </div>
                <button
                  disabled={!canManageSecurity}
                  onClick={() => {
                    if (!canManageSecurity) return;
                    try {
                      platformAdminService.setStaffMfaEnforcement(data.twoFactorEnforcement.enabled ? 'optional' : 'required');
                      loadSecurity();
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'تعذر تغيير السياسة.');
                    }
                  }}
                  className="w-full rounded-lg border border-slate-700 px-3 py-1.5 text-[10.5px] font-bold text-sky-300 transition hover:border-sky-600 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {data.twoFactorEnforcement.enabled ? 'اجعلها اختيارية' : 'اجعلها إلزامية'}
                </button>
              </div>
            </div>

            {/* 2. Cryptographic Signing */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <KeyRound className="h-4 w-4 text-sky-400" />
                  محرك التوقيع الرقمي (Ed25519)
                </span>
                <span className="rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold px-2 py-0.5">
                  مشفر
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                كافة التراخيص وتكوينات العملاء موقعة تشفيرياً بمفاتيح مركزية مع تدوير دوري لمنع التلاعب.
              </p>
              <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between">
                <span>المفاتيح النشطة</span>
                <span className="text-sky-300 font-bold">{data.signingKeys.length} مفاتيح</span>
              </div>
            </div>

            {/* 3. Incident Readiness */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-amber-400" />
                  جاهزية الاستجابة للطوارئ
                </span>
                <span className="rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5">
                  Playbook
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                إجراءات احتواء الحوادث الأمنية السريعة متاحة بنقرة واحدة لإنهاء الجلسات أو حظر الـ IP.
              </p>
              <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between">
                <span>الحوادث المفتوحة</span>
                <span
                  className={`font-bold ${
                    data.activeIncidentsCount === 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {data.activeIncidentsCount}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Active Incidents Banner if any */}
          {data.incidents.filter((i) => i.status !== 'RESOLVED').length > 0 && (
            <div className="rounded-xl border border-rose-800/80 bg-rose-950/30 p-4">
              <h3 className="text-xs font-bold text-rose-300 flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4" />
                حوادث أمنية قيد الاحتواء والتحقيق تتطلب انتباهك:
              </h3>
              <ul className="space-y-2">
                {data.incidents
                  .filter((i) => i.status !== 'RESOLVED')
                  .map((inc) => (
                    <li
                      key={inc.id}
                      className="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-lg border border-rose-800/50 text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-100">{inc.title}</span>
                        <span className="text-slate-400 text-[11px] mr-2">
                          (المصدر: {inc.sourceIp || 'خارجي'})
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!canManageSecurity}
                        onClick={() => handleRespondIncident(inc.id, true)}
                      >
                        إغلاق وحل الحادث
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STAFF SESSIONS */}
      {tab === 'SESSIONS' && (
        <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
          <header className="border-b border-slate-800 px-4 py-3 bg-slate-950/40 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-200">
                الجلسات النشطة لمديري وموظفي المنصة ({data.sessions.length})
              </h3>
              <p className="text-[10.5px] text-slate-400">
                يمكن إنهاء أي جلسة مشبوهة أو غير معتادة عن بعد فوراً لحماية النظام.
              </p>
            </div>
            <Button
              size="sm"
              variant="danger"
              onClick={handleRevokeAllOtherSessions}
              disabled={!canManageSecurity}
              leadingIcon={<LogOut className="h-3.5 w-3.5" />}
            >
              إنهاء كافة الجلسات الأخرى
            </Button>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-right">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                <tr>
                  <th className="px-4 py-3">الموظف والدور</th>
                  <th className="px-4 py-3">الجهاز والمتصفح</th>
                  <th className="px-4 py-3">عنوان IP</th>
                  <th className="px-4 py-3">موثوقية الجهاز</th>
                  <th className="px-4 py-3">آخر نشاط</th>
                  <th className="px-4 py-3 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {data.sessions.map((sess) => (
                  <tr key={sess.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-xs">
                      <p className="font-bold text-slate-100 flex items-center gap-1.5">
                        {sess.staffName}
                        {sess.isCurrent && (
                          <span className="rounded bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.5 font-bold">
                            جلستك الحالية
                          </span>
                        )}
                      </p>
                      <p className="text-[10.5px] text-slate-400">{sess.staffRole}</p>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Laptop className="h-3.5 w-3.5 text-slate-400" />
                        {sess.deviceName || 'غير محدد'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs font-mono text-slate-300">{sess.ipAddress || '—'}</td>

                    <td className="px-4 py-3 text-xs">
                      {sess.isTrustedDevice ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                          <CheckCircle2 className="h-3 w-3" /> موثوق
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                          <AlertTriangle className="h-3 w-3" /> غير مصادق
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-400">
                      {formatDateTime(sess.lastActivityAt)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {!sess.isCurrent && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleRevokeSession(sess.id)}
                          disabled={!canManageSecurity}
                          leadingIcon={<LogOut className="h-3 w-3" />}
                        >
                          إنهاء الجلسة
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: STAFF LOGINS AUDIT */}
      {tab === 'LOGINS' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3 shadow-sm">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={loginSearch}
                onChange={(e) => setLoginSearch(e.target.value)}
                placeholder="ابحث بالبريد أو عنوان IP..."
                className={`${inputClass} pr-9 text-xs`}
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={loginFilterFailed}
                onChange={(e) => setLoginFilterFailed(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-rose-500 focus:ring-rose-500"
              />
              <span className={loginFilterFailed ? 'text-rose-400 font-bold' : ''}>
                عرض المحاولات الفاشلة والمحظورة فقط
              </span>
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-right">
                <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                  <tr>
                    <th className="px-4 py-3">البريد الإلكتروني</th>
                    <th className="px-4 py-3">عنوان IP</th>
                    <th className="px-4 py-3">حالة المحاولة</th>
                    <th className="px-4 py-3">السبب / الملاحظات</th>
                    <th className="px-4 py-3">التوقيت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredLogins.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-xs text-slate-500">
                        لا توجد سجلات دخول تطابق البحث.
                      </td>
                    </tr>
                  ) : (
                    filteredLogins.map((login) => (
                      <tr key={login.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 text-xs font-bold text-slate-100">{login.email}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-300">{login.ipAddress || '—'}</td>
                        <td className="px-4 py-3 text-xs">
                          <span
                            className={`inline-flex items-center gap-1 font-bold ${
                              login.status === 'SUCCESS'
                                ? 'text-emerald-400'
                                : login.status === 'BLOCKED'
                                ? 'text-rose-500'
                                : 'text-amber-400'
                            }`}
                          >
                            {login.status === 'SUCCESS' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {login.status === 'SUCCESS'
                              ? 'ناجح'
                              : login.status === 'BLOCKED'
                              ? 'محظور IP'
                              : 'فشل كلمة المرور'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{login.failureReason || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(login.attemptedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 4: API & SIGNING KEYS */}
      {tab === 'KEYS' && (
        <div className="space-y-5">
          {/* Cryptographic Signing Keys */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
            <header className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-emerald-400" />
                  مفاتيح التوقيع الرقمي للمنصة (Cryptographic Signing Keys)
                </h3>
                <p className="text-[11px] text-slate-400">
                  تستخدم لتوليد وتوقيع التراخيص وحزم التكوين لضمان عدم تزييفها.
                </p>
              </div>
            </header>

            <div className="grid gap-3 sm:grid-cols-2">
              {data.signingKeys.map((k) => (
                <div
                  key={k.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-100">{k.keyAlias}</span>
                      <span className="rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold px-1.5 py-0.5">
                        v{k.version}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      الخوارزمية: <span className="font-mono text-slate-300">{k.algorithm}</span>
                    </p>
                    <p className="text-[10px] text-slate-500">تم الإنشاء: {formatDateTime(k.createdAt)}</p>
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => k.keyAlias && handleRotateKey(k.keyAlias)}
                    disabled={!canManageSecurity}
                    leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                  >
                    تدوير المفتاح
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {/* Platform API Keys */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
            <header className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <Key className="h-4 w-4 text-sky-400" />
                  مفاتيح الـ API المركزية
                </h3>
                <p className="text-[11px] text-slate-400">
                  مفاتيح التكامل الخاصة بالمنصة وخدمات الربط الخارجي ونطاقات الصلاحيات.
                </p>
              </div>
              {canManageSecurity && (
                <Button
                  size="sm"
                  onClick={() => {
                    setApiKeyForm({
                      tenantId: tenants[0]?.id ?? '',
                      name: '',
                      scopes: ['read', 'write'],
                      expiresAt: '',
                    });
                    setIsApiKeyModalOpen(true);
                  }}
                  leadingIcon={<Plus className="h-4 w-4" />}
                >
                  إنشاء مفتاح API جديد
                </Button>
              )}
            </header>

            {apiKeys.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">لا توجد مفاتيح API مسجلة حالياً.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-slate-800 text-[11px] text-slate-400">
                    <tr>
                      <th className="py-2 px-3">اسم المفتاح</th>
                      <th className="py-2 px-3">البادئة</th>
                      <th className="py-2 px-3">الصلاحيات</th>
                      <th className="py-2 px-3">الحالة</th>
                      <th className="py-2 px-3">تاريخ الانتهاء</th>
                      <th className="py-2 px-3">آخر استخدام</th>
                      <th className="py-2 px-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {apiKeys.map((key) => (
                      <tr key={key.id}>
                        <td className="py-2.5 px-3 font-bold text-slate-200">{key.name}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{key.keyPrefix}...</td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {key.scopes.join(', ') || 'الكل'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-bold ${
                              key.isActive ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {key.isActive ? 'نشط' : 'ملغي'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {key.expiresAt ? formatDateTime(key.expiresAt) : 'دائم'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {key.lastUsedAt ? formatDateTime(key.lastUsedAt) : 'لم يستخدم'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {key.isActive && (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                disabled={!canManageSecurity}
                                onClick={() => handleRotateApiKey(key.id)}
                                className="text-sky-400 hover:underline text-xs flex items-center gap-1"
                                title="تدوير المفتاح"
                              >
                                <RotateCcw className="h-3 w-3" />
                                تدوير
                              </button>
                              <span className="text-slate-600">|</span>
                              <button
                                disabled={!canManageSecurity}
                                onClick={() => handleRevokeApiKey(key.id)}
                                className="text-rose-400 hover:underline text-xs"
                              >
                                إلغاء
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 5: INCIDENTS & EMERGENCY PLAYBOOK */}
      {tab === 'INCIDENTS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-200">
              سجل الحوادث الأمنية المركزية ({data.incidents.length})
            </h3>
            <Button
              size="sm"
              disabled={!canManageSecurity}
              onClick={() => { if (!canManageSecurity) return; setIsIncidentModalOpen(true); }}
              leadingIcon={<ShieldAlert className="h-4 w-4" />}
            >
              تسجيل بلاغ أمني يدوي
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
            {data.incidents.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-6 w-6 text-emerald-400" />}
                title="السجل نظيف تماماً"
                description="لم يتم رصد أي اختراقات أو حوادث أمنية على المنصة."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-right">
                  <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                    <tr>
                      <th className="px-4 py-3">عنوان الحادث</th>
                      <th className="px-4 py-3">مستوى الخطورة</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">إجراء الاحتواء المتخذ</th>
                      <th className="px-4 py-3">التوقيت</th>
                      <th className="px-4 py-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {data.incidents.map((inc) => (
                      <tr key={inc.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 text-xs">
                          <p className="font-bold text-slate-100">{inc.title}</p>
                          {inc.details && <p className="text-[11px] text-slate-400 mt-0.5">{inc.details}</p>}
                        </td>

                        <td className="px-4 py-3 text-xs">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-black ${
                              inc.severity === 'CRITICAL'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : inc.severity === 'HIGH'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {inc.severity}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-xs">
                          <span
                            className={`font-bold ${
                              inc.status === 'RESOLVED'
                                ? 'text-emerald-400'
                                : inc.status === 'CONTAINED'
                                ? 'text-sky-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {inc.status === 'RESOLVED'
                              ? 'تم الحل'
                              : inc.status === 'CONTAINED'
                              ? 'قيد الاحتواء'
                              : 'مفتوح'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-300">
                          {inc.containmentAction || 'بانتظار إجراء'}
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-400">
                          {formatDateTime(inc.createdAt)}
                        </td>

                        <td className="px-4 py-3 text-center">
                          {inc.status !== 'RESOLVED' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!canManageSecurity}
                        onClick={() => handleRespondIncident(inc.id, true)}
                            >
                              إغلاق كـ محلول
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Record Manual Incident */}
      <Modal
        open={isIncidentModalOpen}
        onClose={() => setIsIncidentModalOpen(false)}
        title="تسجيل بلاغ أمني جديد"
      >
        <div className="space-y-3.5 text-right">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">عنوان البلاغ الأمني *</label>
            <input
              type="text"
              value={incidentForm.title}
              onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })}
              placeholder="مثلاً: محاولات هجوم Brute Force مكثفة..."
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">مستوى الخطورة</label>
              <select
                value={incidentForm.severity}
                onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value as any })}
                className={inputClass}
              >
                <option value="CRITICAL">حرجة (Critical)</option>
                <option value="HIGH">عالية (High)</option>
                <option value="MEDIUM">متوسطة (Medium)</option>
                <option value="LOW">منخفضة (Low)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">مصدر IP المشتبه به</label>
              <input
                type="text"
                value={incidentForm.sourceIp}
                onChange={(e) => setIncidentForm({ ...incidentForm, sourceIp: e.target.value })}
                placeholder="192.168.1.1"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">تفاصيل وملاحظات الحادث</label>
            <textarea
              rows={3}
              value={incidentForm.details}
              onChange={(e) => setIncidentForm({ ...incidentForm, details: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsIncidentModalOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleCreateIncident} disabled={!canManageSecurity}>
              تسجيل البلاغ
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Create API Key */}
      <Modal
        open={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        title="إنشاء مفتاح API تجاري مركزي"
      >
        <div className="space-y-3.5 text-right">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">اسم المفتاح / الوصف *</label>
            <input
              type="text"
              value={apiKeyForm.name}
              onChange={(e) => setApiKeyForm({ ...apiKeyForm, name: e.target.value })}
              placeholder="مثلاً: مفتاح الربط مع متجر Shopify أو نظام المحاسبة الخارجي"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">العميل المرتبط (المستأجر) *</label>
            <select
              value={apiKeyForm.tenantId}
              onChange={(e) => setApiKeyForm({ ...apiKeyForm, tenantId: e.target.value })}
              className={inputClass}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">نطاقات الصلاحية (Scopes)</label>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 mt-1">
              {[
                { id: 'read', label: 'قراءة البيانات (read)' },
                { id: 'write', label: 'كتابة وتعديل (write)' },
                { id: 'invoices', label: 'الفواتير والمدفوعات (invoices)' },
                { id: 'products', label: 'الكتالوج والمنتجات (products)' },
                { id: 'webhooks', label: 'إدارة Webhooks' },
                { id: 'admin', label: 'تحكم إداري كامل (admin)' },
              ].map((s) => {
                const checked = apiKeyForm.scopes.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 cursor-pointer bg-slate-950/40 p-2 rounded border border-slate-800">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setApiKeyForm({ ...apiKeyForm, scopes: [...apiKeyForm.scopes, s.id] });
                        } else {
                          setApiKeyForm({ ...apiKeyForm, scopes: apiKeyForm.scopes.filter((sc) => sc !== s.id) });
                        }
                      }}
                      className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                    />
                    <span>{s.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">تاريخ انتهاء الصلاحية (اختياري)</label>
            <input
              type="datetime-local"
              value={apiKeyForm.expiresAt}
              onChange={(e) => setApiKeyForm({ ...apiKeyForm, expiresAt: e.target.value })}
              className={inputClass}
            />
            <span className="text-[10px] text-slate-500 mt-0.5 block">اتركه فارغاً ليكون المفتاح دائماً وغير مقيد بوقت انتهاء.</span>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsApiKeyModalOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleCreateApiKey} disabled={!canManageSecurity}>
              إنشاء المفتاح الآن
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: New API Key Result (Show Secret Key Once) */}
      <Modal
        open={Boolean(newKeyResult)}
        onClose={() => setNewKeyResult(null)}
        title="تم إنشاء مفتاح الـ API بنجاح"
      >
        <div className="space-y-4 text-right">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200">
              <strong className="font-bold block mb-1">تنبيه أمان فائق الأهمية:</strong>
              هذه هي المرة الوحيدة التي سيظهر فيها مفتاح الـ API السري كاملاً. قم بنسخه وحفظه في بيئة آمنة فوراً؛ لن تتمكن من رؤيته مرة أخرى!
            </div>
          </div>

          {newKeyResult && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">مفتاح الـ API السري الكامل (Secret Key):</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newKeyResult.plainTextKey}
                  className={`${inputClass} font-mono text-emerald-400 select-all`}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(newKeyResult.plainTextKey);
                    alert('تم نسخ المفتاح إلى الحافظة بنجاح.');
                  }}
                  leadingIcon={<Copy className="h-4 w-4" />}
                >
                  نسخ
                </Button>
              </div>

              <div className="mt-3 p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-xs space-y-1 text-slate-300">
                <p><strong>اسم المفتاح:</strong> {newKeyResult.key.name}</p>
                <p><strong>البادئة:</strong> <span className="font-mono">{newKeyResult.key.keyPrefix}</span></p>
                <p><strong>الصلاحيات:</strong> {newKeyResult.key.scopes.join(', ') || 'الكل'}</p>
                <p><strong>معرف المفتاح:</strong> <span className="font-mono">{newKeyResult.key.id}</span></p>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-slate-800">
            <Button size="sm" onClick={() => setNewKeyResult(null)}>
              لقد قمت بحفظ المفتاح بأمان، إغلاق
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformSecurityCenterPage;
