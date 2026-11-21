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
  PlatformCentralSecurityIncident,
  PlatformApiKey,
  PlatformTenant,
  PlatformStaffSession,
  PlatformStaffLogin,
  PlatformSigningKey,
  PlatformSecurityEvent,
  PlatformSecurityEventSeverity,
} from '../../services/domains/platform/platformTypes';
import type { CentralSecurityEventRow } from '../../services/domains/platform/PlatformAdminApiClient/centralTypes';
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';
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
import { EventsTab } from './PlatformSecurityCenterPage/EventsTab';
import { KeysTab } from './PlatformSecurityCenterPage/KeysTab';
import { IncidentsTab } from './PlatformSecurityCenterPage/IncidentsTab';
import { IncidentModal } from './PlatformSecurityCenterPage/IncidentModal';
import { ApiKeyModal } from './PlatformSecurityCenterPage/ApiKeyModal';
import { ApiKeyResultModal } from './PlatformSecurityCenterPage/ApiKeyResultModal';
import { IpBansTab, type PlatformIpBan } from './PlatformSecurityCenterPage/IpBansTab';

import { useToast } from '../../components/ui/Toast';

// ── Central-mode row mappers ────────────────────────────────────────────────
const parseScopes = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const parseMetadata = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const EVENT_SEVERITIES: PlatformSecurityEventSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

const normalizeEventSeverity = (value?: string | null): PlatformSecurityEventSeverity => {
  const upper = String(value ?? '').toUpperCase();
  return (EVENT_SEVERITIES as string[]).includes(upper) ? (upper as PlatformSecurityEventSeverity) : 'INFO';
};

const mapCentralSecurityEvent = (row: CentralSecurityEventRow): PlatformSecurityEvent => ({
  id: String(row.id),
  eventType: String(row.event_type ?? row.eventType ?? 'UNKNOWN'),
  severity: normalizeEventSeverity(row.severity),
  title: String(row.title ?? row.event_type ?? 'حدث أمني'),
  description: row.description ?? null,
  sourceIp: row.source_ip ?? row.sourceIp ?? null,
  tenantId: row.tenant_id ?? row.tenantId ?? null,
  staffId: row.staff_id ?? row.staffId ?? null,
  staffName: row.staff_name ?? row.staffName ?? null,
  metadata: parseMetadata(row.metadata),
  createdAt: String(row.created_at ?? row.createdAt ?? ''),
});

/** Central mode has no incidents endpoint — surface CRITICAL security events as read-only incident candidates. */
const eventToIncidentCandidate = (event: PlatformSecurityEvent): PlatformCentralSecurityIncident => ({
  id: `evt-${event.id}`,
  type: event.eventType,
  severity: event.severity === 'INFO' || event.severity === 'LOW' ? 'MEDIUM' : (event.severity as PlatformCentralSecurityIncident['severity']),
  title: event.title,
  description: event.description ?? null,
  details: event.description ?? null,
  sourceIp: event.sourceIp ?? null,
  ipAddress: event.sourceIp ?? null,
  tenantId: event.tenantId ?? null,
  staffId: event.staffId ?? null,
  status: 'OPEN',
  createdAt: event.createdAt,
  updatedAt: event.createdAt,
});

const loginToSecurityEvent = (login: PlatformStaffLogin): PlatformSecurityEvent => ({
  id: `login-${login.id}`,
  eventType: login.status === 'SUCCESS' ? 'LOGIN_SUCCESS' : login.status === 'BLOCKED' ? 'LOGIN_BLOCKED' : 'LOGIN_FAILED',
  severity: login.status === 'SUCCESS' ? 'INFO' : login.status === 'BLOCKED' ? 'HIGH' : 'MEDIUM',
  title: login.status === 'SUCCESS'
    ? 'تسجيل دخول ناجح'
    : login.status === 'BLOCKED'
    ? 'محاولة دخول من IP محظور'
    : 'محاولة دخول فاشلة',
  description: login.failureReason ?? null,
  sourceIp: login.ipAddress ?? null,
  staffId: login.staffId ?? null,
  staffName: login.username ?? login.email ?? null,
  metadata: { email: login.email, userAgent: login.userAgent ?? null, mfaUsed: login.mfaUsed ?? null },
  createdAt: login.attemptedAt,
});

const incidentToSecurityEvent = (incident: PlatformCentralSecurityIncident): PlatformSecurityEvent => ({
  id: `incident-${incident.id}`,
  eventType: 'SECURITY_INCIDENT',
  severity: normalizeEventSeverity(incident.severity?.toLowerCase()),
  title: incident.title,
  description: incident.details ?? incident.description ?? null,
  sourceIp: incident.sourceIp ?? incident.ipAddress ?? null,
  tenantId: incident.tenantId ?? null,
  staffId: incident.staffId ?? null,
  metadata: { incidentStatus: incident.status, containmentAction: incident.containmentAction ?? null },
  createdAt: incident.createdAt,
});

const mapCentralSession = (row: any): PlatformStaffSession => ({
  id: String(row.id),
  staffId: String(row.staffId ?? row.staff_id ?? ''),
  staffName: String(row.staffName ?? row.staff_name ?? row.staff_email ?? ''),
  staffRole: String(row.staffRole ?? row.role ?? ''),
  ipAddress: row.ipAddress ?? row.ip_address ?? null,
  deviceName: row.deviceName ?? row.device_name ?? null,
  userAgent: row.userAgent ?? row.user_agent ?? null,
  isTrustedDevice: Boolean(row.isTrustedDevice ?? row.is_trusted_device),
  isCurrent: Boolean(row.isCurrent ?? row.is_current),
  expiresAt: row.expiresAt ?? row.expires_at ?? null,
  createdAt: String(row.createdAt ?? row.created_at ?? ''),
  lastActivityAt: String(row.lastActivityAt ?? row.last_activity_at ?? row.created_at ?? ''),
});

const mapCentralApiKey = (row: any): PlatformApiKey => ({
  id: String(row.id),
  tenantId: String(row.tenantId ?? row.tenant_id ?? ''),
  name: String(row.name ?? ''),
  keyPrefix: String(row.keyPrefix ?? row.prefix ?? row.key_prefix ?? ''),
  scopes: parseScopes(row.scopes),
  isActive: Boolean(row.isActive ?? row.is_active),
  expiresAt: row.expiresAt ?? row.expires_at ?? null,
  lastUsedAt: row.lastUsedAt ?? row.last_used_at ?? null,
  createdAt: String(row.createdAt ?? row.created_at ?? ''),
  updatedAt: String(row.updatedAt ?? row.updated_at ?? row.created_at ?? ''),
});

const mapCentralSigningKey = (row: any, currentKeyId: string | null): PlatformSigningKey => {
  const keyId = String(row.keyId ?? row.key_id ?? row.id ?? '');
  const active = Boolean(row.isActive ?? row.is_active);
  const createdAt = String(row.createdAt ?? row.created_at ?? '');
  return {
    id: keyId || String(row.id ?? ''),
    alias: keyId,
    keyAlias: keyId,
    algorithm: 'Ed25519',
    version: 1,
    status: active ? 'ACTIVE' : 'REVOKED',
    isCurrent: currentKeyId ? keyId === currentKeyId : active,
    createdAt,
    updatedAt: createdAt,
  };
};

const AUTO_REFRESH_MS = 30_000;

export const PlatformSecurityCenterPage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = useState<SecurityTab>('OVERVIEW');
  const [data, setData] = useState<PlatformCentralSecurityOverview | null>(null);
  const [apiKeys, setApiKeys] = useState<PlatformApiKey[]>([]);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerAccounts, setOwnerAccounts] = useState<PlatformOwnerAuditEntry[]>([]);
  const [isCentral, setIsCentral] = useState(false);
  const [ipBans, setIpBans] = useState<PlatformIpBan[]>([]);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

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

  const loadSecurity = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const centralState = getCentralDataSourceState();
      setIsCentral(centralState.active);
      if (centralState.active) {
        const [overviewRaw, sessionsRaw, devicesRaw, keysRaw, tenantList, bans, signingRaw, settings, eventsRaw, staffRaw] = await Promise.all([
          centralPlatformClient.getSecurityOverview(),
          centralPlatformClient.listStaffSessions(),
          centralPlatformClient.listStaffDevices(),
          centralPlatformClient.listApiKeys(),
          centralPlatformClient.listTenants(),
          centralPlatformClient.listIpBans(),
          centralPlatformClient.listCentralSigningKeys(),
          centralPlatformClient.getSettings().catch(() => ({} as Record<string, string>)),
          centralPlatformClient.listSecurityEvents({ limit: 200 }).catch(() => []),
          centralPlatformClient.listAdminControlStaff().catch(() => []),
        ]);
        const overview = (overviewRaw ?? {}) as Record<string, any>;
        const signing = (signingRaw ?? {}) as { keys?: any[]; currentKeyId?: string | null };
        const sessions = (sessionsRaw as any[]).map(mapCentralSession);
        const devicesCount = Array.isArray(devicesRaw) ? devicesRaw.length : 0;
        const failedLogins24h = Number(overview.failedLogins24h ?? 0);
        const activeSessions = Number(overview.activeSessions ?? sessions.length);
        const mfaEnforcement = (settings['platform.staffMfaEnforcement'] as 'off' | 'optional' | 'required' | undefined) ?? 'optional';

        const securityEvents = (Array.isArray(eventsRaw) ? eventsRaw : []).map(mapCentralSecurityEvent);
        const events24hBySeverity: Record<string, number> = {};
        for (const item of Array.isArray(overview.events24h) ? overview.events24h : []) {
          const sev = normalizeEventSeverity(item?.severity);
          events24hBySeverity[sev] = (events24hBySeverity[sev] ?? 0) + Number(item?.count ?? 0);
        }

        // Real MFA compliance from admin-control staff rows (mfa_enabled may be absent).
        const staffRows = (Array.isArray(staffRaw) ? staffRaw : []).filter((row: any) => {
          const active = row.is_active ?? row.isActive;
          const deleted = row.deleted_at ?? row.deletedAt;
          return active !== 0 && active !== false && !deleted;
        });
        const mfaFieldPresent = staffRows.some((row: any) => row.mfaEnabled !== undefined || row.mfa_enabled !== undefined);
        const compliantStaffCount = staffRows.filter((row: any) => Boolean(row.mfaEnabled ?? row.mfa_enabled)).length;

        // CRITICAL security events double as read-only incident candidates centrally.
        const incidentCandidates = securityEvents
          .filter((event) => event.severity === 'CRITICAL')
          .map(eventToIncidentCandidate);
        const openIncidents = incidentCandidates.length;

        let securityScore = 100;
        securityScore -= Math.min(30, failedLogins24h * 2);
        securityScore -= Math.min(25, (events24hBySeverity.CRITICAL ?? 0) * 10 + (events24hBySeverity.HIGH ?? 0) * 5);
        securityScore -= openIncidents * 10 > 20 ? 20 : openIncidents * 10;
        securityScore -= activeSessions > 50 ? 10 : 0;
        if (mfaEnforcement === 'required' && mfaFieldPresent && staffRows.length > 0 && compliantStaffCount < staffRows.length) {
          securityScore -= 10;
        }
        securityScore = Math.max(0, Math.min(100, securityScore));

        setData({
          securityScore,
          twoFactorEnforcement: {
            enabled: mfaEnforcement === 'required',
            compliantStaffCount: mfaFieldPresent ? compliantStaffCount : 0,
            totalStaffCount: mfaFieldPresent ? staffRows.length : 0,
          },
          activeStaffSessionsCount: activeSessions,
          failedLogins24hCount: failedLogins24h,
          activeIncidentsCount: openIncidents,
          signingKeysCount: Array.isArray(signing.keys) ? signing.keys.length : 0,
          trustedDevicesCount: devicesCount,
          sessions,
          recentLogins: [],
          incidents: incidentCandidates,
          signingKeys: (signing.keys ?? []).map((k) => mapCentralSigningKey(k, signing.currentKeyId ?? null)),
          securityEvents,
          events24hBySeverity,
        });
        setApiKeys((keysRaw as any[]).map(mapCentralApiKey));
        setTenants(tenantList as any);
        setIpBans(bans as PlatformIpBan[]);
      } else {
        setIpBans([]);
        const overview = platformAdminService.getPlatformSecurityOverview();
        // Local mode has no security-events table — synthesize the feed from
        // staff logins and incidents so the EVENTS tab works identically.
        const synthesizedEvents: PlatformSecurityEvent[] = [
          ...overview.recentLogins.map(loginToSecurityEvent),
          ...overview.incidents.map(incidentToSecurityEvent),
        ]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 200);
        const localEvents24h: Record<string, number> = {};
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        for (const event of synthesizedEvents) {
          if (new Date(event.createdAt).getTime() >= dayAgo) {
            localEvents24h[event.severity] = (localEvents24h[event.severity] ?? 0) + 1;
          }
        }
        setData({ ...overview, securityEvents: synthesizedEvents, events24hBySeverity: localEvents24h });
        setApiKeys(platformAdminService.listApiKeys());
        setTenants(platformAdminService.listTenants());
      }
      setError(null);
      setLastLoadedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل مركز الأمان.');
    } finally {
      // The owner-account audit is owner-only; a non-owner simply does not see it.
      try {
        setOwnerAccounts(platformAdminService.auditPlatformOwnerAccounts());
      } catch {
        setOwnerAccounts([]);
      }
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSecurity();
  }, [loadSecurity]);

  // Silent auto-refresh — paused while the tab is hidden to avoid needless calls.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadSecurity(true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadSecurity]);

  // Revoke Single Session
  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في إنهاء هذه الجلسة عن بعد؟')) return;
    try {
      if (isCentral) {
        await centralPlatformClient.revokeStaffSession(sessionId);
      } else {
        platformAdminService.revokeStaffSession(sessionId);
      }
      loadSecurity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إنهاء الجلسة.');
    }
  };

  // Revoke All Other Sessions
  const handleRevokeAllOtherSessions = async () => {
    if (!confirm('تأكيد: سيتم تسجيل خروج كافة الموظفين من جلساتهم المفتوحة فوراً!')) return;
    try {
      if (isCentral) {
        // No bulk endpoint — revoke every non-current session individually.
        const targets = (data?.sessions ?? []).filter((s) => !s.isCurrent).map((s) => s.id);
        await Promise.all(targets.map((id) => centralPlatformClient.revokeStaffSession(id)));
      } else {
        platformAdminService.revokeAllOtherStaffSessions();
      }
      loadSecurity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشلت العملية.');
    }
  };

  // Rotate Signing Key — centrally this rotates the server-held Ed25519 key.
  const handleRotateKey = async (keyAlias: string) => {
    if (!confirm(`هل أنت متأكد من تدوير مفتاح التوقيع (${keyAlias})؟`)) return;
    try {
      if (isCentral) {
        await centralPlatformClient.rotateCentralSigningKey();
      } else {
        await platformAdminService.rotatePlatformSigningKey(keyAlias);
      }
      loadSecurity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تدوير المفتاح.');
    }
  };

  // Revoke API Key
  const handleRevokeApiKey = async (id: string) => {
    if (!confirm('هل أنت متأكد من إلغاء مفتاح الـ API هذا؟')) return;
    try {
      if (isCentral) {
        await centralPlatformClient.revokeApiKey(id);
      } else {
        platformAdminService.revokeApiKey(id);
      }
      loadSecurity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إلغاء المفتاح.');
    }
  };

  // Rotate API Key — local-only: the central API has no rotate endpoint.
  const handleRotateApiKey = (id: string) => {
    if (isCentral) {
      toast.error('تدوير مفاتيح API غير مدعوم في الوضع المركزي — أنشئ مفتاحًا جديدًا وألغِ القديم.');
      return;
    }
    if (!confirm('هل أنت متأكد من تدوير هذا المفتاح؟ سيتم إلغاء المفتاح الحالي فوراً وتوليد مفتاح جديد بنفس الصلاحيات.')) return;
    try {
      const res = platformAdminService.rotateApiKey(id);
      setNewKeyResult({
        plainTextKey: res.plainTextKey,
        key: {
          id: res.id,
          tenantId: res.tenantId,
          name: res.name,
          keyPrefix: res.keyPrefix,
          scopes: res.scopes,
          isActive: true,
          expiresAt: res.expiresAt,
          lastUsedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      loadSecurity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تدوير مفتاح الـ API.');
    }
  };

  // Create API Key
  const handleCreateApiKey = async () => {
    if (!apiKeyForm.name.trim()) {
      toast.warning('اسم المفتاح مطلوب.');
      return;
    }
    // Local keys are tenant-scoped and require an explicit tenant — never
    // silently bind to the first tenant in the list.
    if (!isCentral && !apiKeyForm.tenantId) {
      toast.warning('يجب اختيار العميل الذي سيُربط به المفتاح.');
      return;
    }
    try {
      if (isCentral) {
        // Central keys are not tenant-bound; expiry is expressed in days.
        let expiresInDays: number | undefined;
        if (apiKeyForm.expiresAt) {
          const ms = new Date(apiKeyForm.expiresAt).getTime() - Date.now();
          expiresInDays = Math.max(1, Math.ceil(ms / 86_400_000));
        }
        const res = (await centralPlatformClient.createApiKey({
          name: apiKeyForm.name.trim(),
          scopes: apiKeyForm.scopes,
          expiresInDays,
        })) as any;
        setIsApiKeyModalOpen(false);
        setNewKeyResult({
          plainTextKey: String(res?.key ?? ''),
          key: mapCentralApiKey({ ...res, is_active: res?.is_active ?? 1 }),
        });
      } else {
        const expiresAt = apiKeyForm.expiresAt ? new Date(apiKeyForm.expiresAt).toISOString() : undefined;
        const res = platformAdminService.createApiKey({
          tenantId: apiKeyForm.tenantId,
          name: apiKeyForm.name.trim(),
          scopes: apiKeyForm.scopes,
          expiresAt,
        });
        setIsApiKeyModalOpen(false);
        setNewKeyResult({
          plainTextKey: res.plainTextKey,
          key: {
            id: res.id,
            tenantId: res.tenantId,
            name: res.name,
            keyPrefix: res.keyPrefix,
            scopes: res.scopes,
            isActive: true,
            expiresAt: res.expiresAt,
            lastUsedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      }
      setApiKeyForm({ tenantId: '', name: '', scopes: ['read', 'write'], expiresAt: '' });
      loadSecurity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إنشاء مفتاح الـ API.');
    }
  };

  // Create Incident — local store only; no central incidents endpoint exists.
  const handleCreateIncident = () => {
    if (isCentral) {
      toast.error('تسجيل الحوادث الأمنية غير مدعوم في الوضع المركزي بعد.');
      return;
    }
    if (!incidentForm.title.trim()) {
      toast.warning('عنوان الحادث مطلوب.');
      return;
    }
    try {
      platformAdminService.recordSecurityIncident({
        type: incidentForm.type,
        severity: incidentForm.severity,
        title: incidentForm.title,
        description: incidentForm.details || undefined,
        ipAddress: incidentForm.sourceIp || undefined,
      });
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

  // Contain/Resolve Incident — local store only (no central endpoint).
  const handleRespondIncident = (id: string, resolve: boolean) => {
    if (isCentral) {
      toast.error('الاستجابة للحوادث الأمنية غير مدعومة في الوضع المركزي بعد.');
      return;
    }
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

  // Ban / lift IP
  const handleBanIp = async (input: { ipAddress: string; reason?: string; expiresAt?: string }) => {
    if (!confirm(`حظر عنوان IP "${input.ipAddress}"؟ سيتم قطع الجهاز بالكامل عن المنصة فوراً.`)) return;
    try {
      await centralPlatformClient.banIp(input);
      toast.success('تم حظر عنوان IP.');
      loadSecurity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر حظر عنوان IP.');
      throw err;
    }
  };

  // Quick-ban from a session/event/login row — same confirm flow, tagged reason.
  const handleQuickBanIp = async (ip: string) => {
    if (!ip || !isCentral) return;
    try {
      await handleBanIp({ ipAddress: ip, reason: 'حظر سريع من مركز الأمان' });
    } catch {
      // handleBanIp already surfaced the error toast.
    }
  };

  const handleLiftIpBan = (id: string) => {
    if (!confirm('هل أنت متأكد من فك حظر عنوان IP هذا؟')) return;
    void (async () => {
      try {
        await centralPlatformClient.liftIpBan(id);
        toast.success('تم فك الحظر.');
        loadSecurity();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'تعذر فك الحظر.');
      }
    })();
  };

  // 2FA policy card toggle (overview tab). Locally this flips the
  // platform.staffMfaEnforcement setting; centrally the same key is stored in
  // the central platform_settings store via the settings API.
  const handleToggleMfaPolicy = async () => {
    if (!canManageSecurity || !data) return;
    try {
      if (isCentral) {
        const settings = await centralPlatformClient.getSettings();
        const current = settings['platform.staffMfaEnforcement'];
        const next = current === 'required' ? 'optional' : 'required';
        await centralPlatformClient.updateSettings({ 'platform.staffMfaEnforcement': next });
        toast.success(next === 'required' ? 'أُلزمت المصادقة الثنائية على كل الموظفين.' : 'المصادقة الثنائية اختيارية.');
        loadSecurity();
      } else {
        platformAdminService.setStaffMfaEnforcement(data.twoFactorEnforcement.enabled ? 'optional' : 'required');
        loadSecurity();
      }
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

  // Central mode has no staff-login endpoint — derive login rows from
  // login-type security events (best effort) so the tab is not dead.
  const centralLogins = useMemo<PlatformStaffLogin[]>(() => {
    if (!isCentral || !data?.securityEvents) return [];
    return data.securityEvents
      .filter((event) => event.eventType.includes('LOGIN') || event.eventType.includes('AUTH'))
      .map((event) => {
        const meta = event.metadata ?? {};
        const success = meta.success === true || meta.succeeded === true;
        const blocked = String(event.eventType).includes('BLOCK') || String(event.severity) === 'CRITICAL';
        return {
          id: event.id,
          staffId: event.staffId ?? null,
          username: event.staffName ?? null,
          email: String(meta.email ?? meta.username ?? event.staffName ?? event.title ?? '—'),
          ipAddress: event.sourceIp ?? null,
          userAgent: typeof meta.userAgent === 'string' ? meta.userAgent : null,
          status: success ? 'SUCCESS' : blocked ? 'BLOCKED' : 'FAILED',
          failureReason: event.description ?? null,
          mfaUsed: typeof meta.mfaUsed === 'boolean' ? meta.mfaUsed : undefined,
          attemptedAt: event.createdAt,
        } satisfies PlatformStaffLogin;
      })
      .sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime())
      .slice(0, 150);
  }, [isCentral, data]);

  const filteredCentralLogins = useMemo(() => {
    return centralLogins.filter((l) => {
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
  }, [centralLogins, loginFilterFailed, loginSearch]);

  const securityEvents = data?.securityEvents ?? [];

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-danger bg-danger/40 p-5 text-danger">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-danger" />
          <span className="font-bold">{error}</span>
        </div>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => loadSecurity()} leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-muted">
          <RefreshCw className="h-5 w-5 animate-spin text-success" />
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
        icon={<ShieldCheck className="h-6 w-6 text-success" />}
        actions={
          <div className="flex items-center gap-2">
            {lastLoadedAt && (
              <span className="hidden sm:inline text-[10px] text-muted">
                آخر تحديث: {lastLoadedAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadSecurity()}
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
      <SecurityHero data={data} lastUpdated={lastLoadedAt} />

      {/* Owner account audit — owner-only review of every account claiming the owner role */}
      <OwnerAccountsSection ownerAccounts={ownerAccounts} />

      {/* Navigation Tabs */}
      <TabsBar
        tab={tab}
        onTabChange={setTab}
        sessionsCount={data.sessions.length}
        incidentsCount={data.incidents.length}
        eventsCount={securityEvents.length}
      />

      {/* TAB 1: OVERVIEW & ACTIVE THREATS */}
      {tab === 'OVERVIEW' && (
        <OverviewTab
          data={data}
          canManageSecurity={canManageSecurity}
          isCentral={isCentral}
          onToggleMfaPolicy={handleToggleMfaPolicy}
          onRespondIncident={handleRespondIncident}
          onNavigateTab={setTab}
        />
      )}

      {/* TAB 2: STAFF SESSIONS */}
      {tab === 'SESSIONS' && (
        <SessionsTab
          sessions={data.sessions}
          canManageSecurity={canManageSecurity}
          isCentral={isCentral}
          onRevokeSession={handleRevokeSession}
          onRevokeAllOtherSessions={handleRevokeAllOtherSessions}
          onBanIp={handleQuickBanIp}
        />
      )}

      {/* TAB 3: STAFF LOGINS AUDIT — centrally derived from security events */}
      {tab === 'LOGINS' && (
        isCentral && centralLogins.length === 0 ? (
          <CentralUnsupportedNotice feature="سجل محاولات دخول الموظفين" />
        ) : (
          <LoginsTab
            logins={isCentral ? filteredCentralLogins : filteredLogins}
            loginSearch={loginSearch}
            onLoginSearchChange={setLoginSearch}
            loginFilterFailed={loginFilterFailed}
            onLoginFilterFailedChange={setLoginFilterFailed}
            isCentral={isCentral}
            canManageSecurity={canManageSecurity}
            onBanIp={handleQuickBanIp}
          />
        )
      )}

      {/* TAB 4: SECURITY EVENTS FEED */}
      {tab === 'EVENTS' && (
        <EventsTab
          events={securityEvents}
          isCentral={isCentral}
          canManageSecurity={canManageSecurity}
          onBanIp={handleQuickBanIp}
        />
      )}

      {/* TAB 5: API & SIGNING KEYS */}
      {tab === 'KEYS' && (
        <KeysTab
          signingKeys={data.signingKeys}
          apiKeys={apiKeys}
          isCentral={isCentral}
          canManageSecurity={canManageSecurity}
          onRotateKey={handleRotateKey}
          onRotateApiKey={handleRotateApiKey}
          onRevokeApiKey={handleRevokeApiKey}
          onOpenCreateApiKey={() => {
            setApiKeyForm({
              tenantId: '',
              name: '',
              scopes: ['read', 'write'],
              expiresAt: '',
            });
            setIsApiKeyModalOpen(true);
          }}
        />
      )}

      {/* TAB 6: INCIDENTS & EMERGENCY PLAYBOOK — central shows CRITICAL events read-only */}
      {tab === 'INCIDENTS' && (
        <>
          {isCentral && <CentralUnsupportedNotice feature="سجل الحوادث الأمنية والاستجابة لها" />}
          <IncidentsTab
            incidents={data.incidents}
            canManageSecurity={canManageSecurity}
            isCentral={isCentral}
            onOpenIncidentModal={() => setIsIncidentModalOpen(true)}
            onRespondIncident={handleRespondIncident}
            onBanIp={handleQuickBanIp}
          />
        </>
      )}

      {/* TAB 7: IP BANS */}
      {tab === 'IP_BANS' && (
        <IpBansTab
          bans={ipBans}
          canManageSecurity={canManageSecurity}
          isCentral={isCentral}
          onBan={handleBanIp}
          onLift={handleLiftIpBan}
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
        isCentral={isCentral}
        canManageSecurity={canManageSecurity}
        onSubmit={handleCreateApiKey}
      />

      {/* Modal: New API Key Result (Show Secret Key Once) */}
      <ApiKeyResultModal result={newKeyResult} onClose={() => setNewKeyResult(null)} />
    </div>
  );
};

export default PlatformSecurityCenterPage;
