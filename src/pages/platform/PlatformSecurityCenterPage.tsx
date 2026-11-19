import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Flame,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformCentralSecurityOverview,
  PlatformApiKey,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import type { PlatformOwnerAuditEntry } from '../../services/domains/platform/PlatformBootstrapService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { type SecurityTab, type IncidentFormState, type ApiKeyFormState } from './PlatformSecurityCenterPage/constants';
import { SecurityHero } from './PlatformSecurityCenterPage/SecurityHero';
import { OwnerAccountsSection } from './PlatformSecurityCenterPage/OwnerAccountsSection';
import { TabsBar } from './PlatformSecurityCenterPage/TabsBar';
import { OverviewTab } from './PlatformSecurityCenterPage/OverviewTab';
import { SessionsTab } from './PlatformSecurityCenterPage/SessionsTab';
import { LoginsTab } from './PlatformSecurityCenterPage/LoginsTab';
import { KeysTab } from './PlatformSecurityCenterPage/KeysTab';
import { IncidentsTab } from './PlatformSecurityCenterPage/IncidentsTab';
import { IncidentModal } from './PlatformSecurityCenterPage/IncidentModal';
import { ApiKeyModal } from './PlatformSecurityCenterPage/ApiKeyModal';
import { ApiKeyResultModal } from './PlatformSecurityCenterPage/ApiKeyResultModal';

import { useToast } from '../../components/ui/Toast';

export const PlatformSecurityCenterPage: React.FC = () => {
  const toast = useToast();
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
  const [apiKeyForm, setApiKeyForm] = useState<ApiKeyFormState>({
    tenantId: '',
    name: '',
    scopes: ['read', 'write'],
    expiresAt: '',
  });

  // Modals
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [incidentForm, setIncidentForm] = useState<IncidentFormState>({
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
      toast.error(err instanceof Error ? err.message : 'تعذر إنهاء الجلسة.');
    }
  };

  // Revoke All Other Sessions
  const handleRevokeAllOtherSessions = () => {
    if (!confirm('تأكيد: سيتم تسجيل خروج كافة الموظفين من جلساتهم المفتوحة فوراً!')) return;
    try {
      platformAdminService.revokeAllOtherStaffSessions();
      loadSecurity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشلت العملية.');
    }
  };

  // Rotate Signing Key
  const handleRotateKey = async (keyAlias: string) => {
    if (!confirm(`هل أنت متأكد من تدوير مفتاح التوقيع (${keyAlias})؟`)) return;
    try {
      await platformAdminService.rotatePlatformSigningKey(keyAlias);
      loadSecurity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تدوير المفتاح.');
    }
  };

  // Revoke API Key
  const handleRevokeApiKey = (id: string) => {
    if (!confirm('هل أنت متأكد من إلغاء مفتاح الـ API هذا؟')) return;
    try {
      platformAdminService.revokeApiKey(id);
      loadSecurity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إلغاء المفتاح.');
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
      toast.error(err instanceof Error ? err.message : 'تعذر تدوير مفتاح الـ API.');
    }
  };

  // Create API Key
  const handleCreateApiKey = () => {
    if (!apiKeyForm.name.trim()) {
      toast.warning('اسم المفتاح مطلوب.');
      return;
    }
    const tenantTarget = apiKeyForm.tenantId || (tenants[0]?.id ?? '');
    if (!tenantTarget) {
      toast.warning('يجب اختيار العميل أو توفير عميل مسجل أولاً.');
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
      toast.error(err instanceof Error ? err.message : 'فشل إنشاء مفتاح الـ API.');
    }
  };

  // Create Incident
  const handleCreateIncident = () => {
    if (!incidentForm.title.trim()) {
      toast.warning('عنوان الحادث مطلوب.');
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
      toast.error(err instanceof Error ? err.message : 'فشل تسجيل الحادث.');
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
      toast.error(err instanceof Error ? err.message : 'فشلت الاستجابة.');
    }
  };

  // 2FA policy card toggle (overview tab)
  const handleToggleMfaPolicy = () => {
    if (!canManageSecurity || !data) return;
    try {
      platformAdminService.setStaffMfaEnforcement(data.twoFactorEnforcement.enabled ? 'optional' : 'required');
      loadSecurity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تغيير السياسة.');
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
      <SecurityHero data={data} />

      {/* Owner account audit — owner-only review of every account claiming the owner role */}
      <OwnerAccountsSection ownerAccounts={ownerAccounts} />

      {/* Navigation Tabs */}
      <TabsBar tab={tab} onTabChange={setTab} sessionsCount={data.sessions.length} incidentsCount={data.incidents.length} />

      {/* TAB 1: OVERVIEW & ACTIVE THREATS */}
      {tab === 'OVERVIEW' && (
        <OverviewTab
          data={data}
          canManageSecurity={canManageSecurity}
          onToggleMfaPolicy={handleToggleMfaPolicy}
          onRespondIncident={handleRespondIncident}
        />
      )}

      {/* TAB 2: STAFF SESSIONS */}
      {tab === 'SESSIONS' && (
        <SessionsTab
          sessions={data.sessions}
          canManageSecurity={canManageSecurity}
          onRevokeSession={handleRevokeSession}
          onRevokeAllOtherSessions={handleRevokeAllOtherSessions}
        />
      )}

      {/* TAB 3: STAFF LOGINS AUDIT */}
      {tab === 'LOGINS' && (
        <LoginsTab
          logins={filteredLogins}
          loginSearch={loginSearch}
          onLoginSearchChange={setLoginSearch}
          loginFilterFailed={loginFilterFailed}
          onLoginFilterFailedChange={setLoginFilterFailed}
        />
      )}

      {/* TAB 4: API & SIGNING KEYS */}
      {tab === 'KEYS' && (
        <KeysTab
          signingKeys={data.signingKeys}
          apiKeys={apiKeys}
          canManageSecurity={canManageSecurity}
          onRotateKey={handleRotateKey}
          onRotateApiKey={handleRotateApiKey}
          onRevokeApiKey={handleRevokeApiKey}
          onOpenCreateApiKey={() => {
            setApiKeyForm({
              tenantId: tenants[0]?.id ?? '',
              name: '',
              scopes: ['read', 'write'],
              expiresAt: '',
            });
            setIsApiKeyModalOpen(true);
          }}
        />
      )}

      {/* TAB 5: INCIDENTS & EMERGENCY PLAYBOOK */}
      {tab === 'INCIDENTS' && (
        <IncidentsTab
          incidents={data.incidents}
          canManageSecurity={canManageSecurity}
          onOpenIncidentModal={() => setIsIncidentModalOpen(true)}
          onRespondIncident={handleRespondIncident}
        />
      )}

      {/* Modal: Record Manual Incident */}
      <IncidentModal
        open={isIncidentModalOpen}
        onClose={() => setIsIncidentModalOpen(false)}
        form={incidentForm}
        setForm={setIncidentForm}
        canManageSecurity={canManageSecurity}
        onSubmit={handleCreateIncident}
      />

      {/* Modal: Create API Key */}
      <ApiKeyModal
        open={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        form={apiKeyForm}
        setForm={setApiKeyForm}
        tenants={tenants}
        canManageSecurity={canManageSecurity}
        onSubmit={handleCreateApiKey}
      />

      {/* Modal: New API Key Result (Show Secret Key Once) */}
      <ApiKeyResultModal result={newKeyResult} onClose={() => setNewKeyResult(null)} />
    </div>
  );
};

export default PlatformSecurityCenterPage;
