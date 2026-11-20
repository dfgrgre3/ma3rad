import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import QRCode from 'qrcode';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatformPermission } from '../../hooks/platform/usePlatformPermission';
import { PlatformStaffAuthService } from '../../services/domains/platform/PlatformStaffAuthService';
import { AuthService } from '../../services/domains/auth/AuthService';
import type {
  PlatformStaff,
  PlatformStaffInput,
  PlatformStaffRole,
  PlatformStaffRoleDefinition,
  PlatformStaffSession,
  PlatformStaffLogin,
  PlatformStaffInvite,
  PlatformStaffInviteCreated,
  PlatformTrustedDevice,
  PlatformStaffDataScope,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { TABS, type TabKey } from './PlatformStaffPage/constants';
import { AccountsTab } from './PlatformStaffPage/AccountsTab';
import { SessionsTab } from './PlatformStaffPage/SessionsTab';
import { InvitesTab } from './PlatformStaffPage/InvitesTab';
import { LoginsTab } from './PlatformStaffPage/LoginsTab';
import { SecurityTab } from './PlatformStaffPage/SecurityTab';
import { StaffFormModal } from './PlatformStaffPage/StaffFormModal';
import { ResetPasswordModal } from './PlatformStaffPage/ResetPasswordModal';
import { TransferPermissionsModal } from './PlatformStaffPage/TransferPermissionsModal';
import { DataScopeModal } from './PlatformStaffPage/DataScopeModal';
import { MfaEnrollModal, type MfaSetupData } from './PlatformStaffPage/MfaEnrollModal';
import { MfaDisableModal } from './PlatformStaffPage/MfaDisableModal';

import { useToast } from '../../components/ui/Toast';

export const PlatformStaffPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const currentUser = AuthService.getCurrentUser();

  const [tab, setTab] = useState<TabKey>('accounts');

  // ── Accounts ──────────────────────────────────────────────
  const [staffList, setStaffList] = useState<PlatformStaff[]>([]);
  const [roles, setRoles] = useState<PlatformStaffRoleDefinition[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canCreate = canPlatformPermission('platform.staff.create');
  const canUpdate = canPlatformPermission('platform.staff.update');
  const canDeactivate = canPlatformPermission('platform.staff.deactivate');
  const canDelete = canPlatformPermission('platform.staff.delete');
  const canResetPassword = canPlatformPermission('platform.staff.reset_password');
  const canManagePermissions = canPlatformPermission('platform.staff.manage_permissions');
  const canRevokeSessions = canPlatformPermission('platform.staff.revoke_sessions');
  const canManageSecurity = canPlatformPermission('platform.security.update');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<PlatformStaff | null>(null);
  const [formData, setFormData] = useState<PlatformStaffInput>({
    fullName: '',
    email: '',
    phone: '',
    role: 'SUPPORT_AGENT',
    password: '',
    isActive: true,
  });

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<PlatformStaff | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');

  // Transfer permissions modal
  const [transferFrom, setTransferFrom] = useState<PlatformStaff | null>(null);
  const [transferToId, setTransferToId] = useState('');
  const [transferNote, setTransferNote] = useState('');

  // Data scope modal
  const [scopeTarget, setScopeTarget] = useState<PlatformStaff | null>(null);
  const [scope, setScope] = useState<PlatformStaffDataScope>('ALL');
  const [scopeTenantIds, setScopeTenantIds] = useState<string[]>([]);
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantOptions, setTenantOptions] = useState<Array<{ id: string; name: string; code: string }>>([]);

  // ── Invites ───────────────────────────────────────────────
  const [invites, setInvites] = useState<PlatformStaffInvite[]>([]);
  const [inviteForm, setInviteForm] = useState({ fullName: '', email: '', phone: '', role: 'SUPPORT_AGENT' as PlatformStaffRole, expiresInHours: 72 });
  const [createdInvite, setCreatedInvite] = useState<PlatformStaffInviteCreated | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Sessions & devices ────────────────────────────────────
  const [sessions, setSessions] = useState<PlatformStaffSession[]>([]);
  const [devices, setDevices] = useState<PlatformTrustedDevice[]>([]);
  const [currentDeviceTrusted, setCurrentDeviceTrusted] = useState(false);

  // ── Logins ────────────────────────────────────────────────
  const [logins, setLogins] = useState<PlatformStaffLogin[]>([]);
  const [failedOnly, setFailedOnly] = useState(false);

  // ── Security (MFA) ────────────────────────────────────────
  const [mfaStatus, setMfaStatus] = useState<{ enabled: boolean; enforcement: 'off' | 'optional' | 'required' }>({ enabled: false, enforcement: 'off' });
  const [mfaCompliance, setMfaCompliance] = useState<{ enforcement: string; total: number; compliant: number; missing: PlatformStaff[] }>({ enforcement: 'off', total: 0, compliant: 0, missing: [] });
  const [mfaEnrollOpen, setMfaEnrollOpen] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<MfaSetupData | null>(null);
  const [mfaQrDataUrl, setMfaQrDataUrl] = useState<string>('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaAck, setMfaAck] = useState(false);
  const [mfaDisableOpen, setMfaDisableOpen] = useState(false);
  const [mfaDisableCode, setMfaDisableCode] = useState('');

  const mfaMissingIds = useMemo(() => new Set(mfaCompliance.missing.map((item) => item.id)), [mfaCompliance]);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const centralState = getCentralDataSourceState();
      if (centralState.active) {
        const staff = await centralPlatformClient.listStaff();
        setStaffList(staff as any);
      } else {
        setStaffList(platformAdminService.listPlatformStaff(search, roleFilter));
      }
      setRoles(platformAdminService.listPlatformStaffRoles());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل موظفي المنصة.');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  const loadSessions = useCallback(async () => {
    try {
      const centralState = getCentralDataSourceState();
      if (centralState.active) {
        const [sessions, devices] = await Promise.all([
          centralPlatformClient.listStaffSessions(),
          centralPlatformClient.listStaffDevices(),
        ]);
        setSessions(sessions as any);
        setDevices(devices as any);
      } else {
        setSessions(platformAdminService.listStaffSessions());
        setDevices(platformAdminService.listTrustedDevices());
      }
      setCurrentDeviceTrusted(PlatformStaffAuthService.isCurrentDeviceTrusted());
    } catch {
      setSessions([]);
      setDevices([]);
    }
  }, []);

  const loadInvites = useCallback(async () => {
    try {
      const centralState = getCentralDataSourceState();
      if (centralState.active) {
        const invites = await centralPlatformClient.listStaffInvites();
        setInvites(invites as any);
      } else {
        setInvites(platformAdminService.listStaffInvites('all'));
      }
    } catch {
      setInvites([]);
    }
  }, []);

  const loadLogins = useCallback(() => {
    try {
      setLogins(platformAdminService.listStaffLogins(100, failedOnly));
    } catch {
      setLogins([]);
    }
  }, [failedOnly]);

  const loadMfa = useCallback(() => {
    try {
      setMfaStatus(platformAdminService.getOwnStaffMfaStatus());
      setMfaCompliance(platformAdminService.getStaffMfaCompliance() as any);
    } catch {
      /* staff page without permission: keep zeros */
    }
  }, []);

  useEffect(() => { if (tab === 'accounts') loadStaff(); }, [tab, loadStaff]);
  useEffect(() => { if (tab === 'sessions') loadSessions(); }, [tab, loadSessions]);
  useEffect(() => { if (tab === 'invites') loadInvites(); }, [tab, loadInvites]);
  useEffect(() => { if (tab === 'logins') loadLogins(); }, [tab, loadLogins]);
  useEffect(() => { if (tab === 'security') loadMfa(); }, [tab, loadMfa]);

  // Preload MFA badges for the accounts table.
  useEffect(() => { loadMfa(); }, [loadMfa]);

  // ── Handlers ──────────────────────────────────────────────
  const openCreate = () => {
    setEditingStaff(null);
    setFormData({ fullName: '', email: '', phone: '', role: 'SUPPORT_AGENT', password: '', isActive: true });
    setIsFormOpen(true);
  };

  const openEdit = (staff: PlatformStaff) => {
    setEditingStaff(staff);
    setFormData({
      fullName: staff.fullName,
      email: staff.email,
      phone: staff.phone || '',
      role: staff.role,
      isActive: staff.isActive,
    });
    setIsFormOpen(true);
  };

  const handleSave = () => {
    if (!canCreate && !editingStaff) {
      toast.error('لا تملك صلاحية إضافة موظفي المنصة.');
      return;
    }
    if (editingStaff && !canUpdate) {
      toast.error('لا تملك صلاحية تعديل موظفي المنصة.');
      return;
    }
    if (!formData.fullName.trim() || !formData.email.trim()) {
      toast.error('الاسم والبريد الإلكتروني مطلوبان.');
      return;
    }
    if (!editingStaff && (!formData.password || formData.password.length < 8)) {
      toast.error('كلمة المرور مطلوبة ويجب أن تكون 8 أحرف على الأقل للموظف الجديد.');
      return;
    }
    try {
      if (editingStaff) {
        platformAdminService.updatePlatformStaff(editingStaff.id, formData);
        toast.success('تم تحديث بيانات الموظف.');
      } else {
        platformAdminService.createPlatformStaff(formData);
        toast.success('تم إنشاء الموظف وحفظ كلمة المرور المؤقتة — سيُطلب منه تغييرها عند أول دخول.');
      }
      setIsFormOpen(false);
      loadStaff();
      loadMfa();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل حفظ بيانات الموظف.');
    }
  };

  const handleToggleActive = (staff: PlatformStaff) => {
    try {
      platformAdminService.setPlatformStaffActive(staff.id, !staff.isActive);
      toast.success(staff.isActive ? 'تم تجميد الحساب وإنهاء جلساته.' : 'تم تفعيل الحساب.');
      loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تغيير حالة الحساب.');
    }
  };

  const handleDelete = (staff: PlatformStaff) => {
    if (!window.confirm(`حذف حساب الموظف "${staff.fullName}" منطقياً؟\nيبقى سجل التدقيق والعمليات محفوظاً ويمكن استعادة الحساب من قاعدة البيانات.`)) return;
    try {
      platformAdminService.deletePlatformStaff(staff.id);
      toast.success('تم الحذف المنطقي للموظف وإنهاء جلساته.');
      loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر حذف الموظف.');
    }
  };

  const handleForcePasswordChange = (staff: PlatformStaff) => {
    const next = !staff.mustChangePassword;
    try {
      platformAdminService.forcePlatformStaffPasswordChange(staff.id, next);
      toast.success(next ? 'سيُطلب من الموظف تغيير كلمة المرور عند الدخول القادم.' : 'أُلغي فرض تغيير كلمة المرور.');
      loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تنفيذ العملية.');
    }
  };

  const handleResetPassword = () => {
    if (!resetTarget) return;
    if (resetPassword.length < 8) {
      toast.error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    if (resetPassword !== resetConfirm) {
      toast.error('تأكيد كلمة المرور غير مطابق.');
      return;
    }
    try {
      platformAdminService.resetPlatformStaffPassword(resetTarget.id, resetPassword);
      toast.success('تمت إعادة تعيين كلمة المرور. سيُطلب من الموظف تغييرها عند أول دخول.');
      setResetTarget(null);
      setResetPassword('');
      setResetConfirm('');
      loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إعادة تعيين كلمة المرور.');
    }
  };

  const handleTransfer = () => {
    if (!transferFrom || !transferToId) return;
    try {
      platformAdminService.transferStaffPermissions(transferFrom.id, transferToId, transferNote.trim() || undefined);
      toast.success('نُقلت الصلاحيات إلى الموظف الهدف وأُنهيت جلساته الحالية.');
      setTransferFrom(null);
      setTransferToId('');
      setTransferNote('');
      loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر نقل الصلاحيات.');
    }
  };

  const openScopeEditor = (staff: PlatformStaff) => {
    try {
      const state = platformAdminService.getStaffDataScope(staff.id);
      setScope(state.scope);
      setScopeTenantIds(state.tenantIds);
    } catch {
      setScope('ALL');
      setScopeTenantIds([]);
    }
    setTenantSearch('');
    try {
      setTenantOptions(platformAdminService.listTenants('', '', '').map((t) => ({ id: t.id, name: t.name, code: t.code })));
    } catch {
      setTenantOptions([]);
    }
    setScopeTarget(staff);
  };

  const handleSaveScope = () => {
    if (!scopeTarget) return;
    try {
      platformAdminService.setStaffDataScope(scopeTarget.id, scope, scope === 'LIMITED' ? scopeTenantIds : []);
      toast.success('تم تحديث نطاق البيانات للموظف.');
      setScopeTarget(null);
      loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحديث نطاق البيانات.');
    }
  };

  const handleCreateInvite = () => {
    if (!canCreate) {
      toast.error('لا تملك صلاحية إنشاء دعوات.');
      return;
    }
    if (!inviteForm.fullName.trim() || !inviteForm.email.trim()) {
      toast.error('اسم الموظف والبريد الإلكتروني مطلوبان للدعوة.');
      return;
    }
    try {
      const created = platformAdminService.createStaffInvite(inviteForm);
      setCreatedInvite(created);
      setCopied(false);
      setInviteForm({ fullName: '', email: '', phone: '', role: 'SUPPORT_AGENT', expiresInHours: 72 });
      loadInvites();
      toast.success('تم إنشاء الدعوة — شارك الرابط مرة واحدة فقط.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إنشاء الدعوة.');
    }
  };

  const handleRevokeInvite = (invite: PlatformStaffInvite) => {
    try {
      platformAdminService.revokeStaffInvite(invite.id);
      toast.success('تم إلغاء الدعوة.');
      loadInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إلغاء الدعوة.');
    }
  };

  const handleCopyInvite = () => {
    if (!createdInvite) return;
    try {
      navigator.clipboard?.writeText(createdInvite.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('تعذر النسخ إلى الحافظة.');
    }
  };

  const handleRevokeSession = (session: PlatformStaffSession) => {
    try {
      platformAdminService.revokeStaffSession(session.id);
      toast.success('تم إنهاء الجلسة.');
      loadSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إنهاء الجلسة.');
    }
  };

  const handleRevokeAllOtherSessions = () => {
    if (!window.confirm('إنهاء كل جلسات موظفي المنصة الأخرى؟ ستبقى جلستك الحالية فقط.')) return;
    try {
      platformAdminService.revokeAllOtherStaffSessions();
      toast.success('تم إنهاء كل الجلسات الأخرى.');
      loadSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إنهاء الجلسات.');
    }
  };

  const handleRevokeTrustedDevice = (device: PlatformTrustedDevice) => {
    try {
      platformAdminService.revokeTrustedDevice(device.id);
      toast.success('تم إلغاء توثيق الجهاز.');
      loadSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إلغاء الجهاز.');
    }
  };

  const handleTrustCurrentDevice = () => {
    try {
      platformAdminService.trustCurrentStaffDevice();
      toast.success('تم توثيق هذا الجهاز كجهاز موثوق.');
      loadSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر توثيق الجهاز.');
    }
  };

  const handleSetMfaEnforcement = (policy: 'off' | 'optional' | 'required') => {
    try {
      platformAdminService.setStaffMfaEnforcement(policy);
      toast.success(policy === 'required' ? 'أُلزمت المصادقة الثنائية على كل موظفي المنصة.' : policy === 'optional' ? 'المصادقة الثنائية اختيارية.' : 'توقفت إلزامية المصادقة الثنائية.');
      loadMfa();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تغيير السياسة.');
    }
  };

  const handleResetStaffMfa = (staff: PlatformStaff) => {
    if (!window.confirm(`إعادة تعيين المصادقة الثنائية للموظف "${staff.fullName}"؟ سيحتاج إلى إعدادها من جديد.`)) return;
    try {
      platformAdminService.resetStaffMfa(staff.id);
      toast.success('تمت إعادة تعيين المصادقة الثنائية.');
      loadMfa();
      loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إعادة التعيين.');
    }
  };

  const handleStartMfaEnrollment = async () => {
    try {
      const setup = await platformAdminService.startMfaEnrollmentForStaffSelf();
      const otpauth = setup.qrCodeImage ?? `otpauth://totp/CeramiSys:${currentUser?.id}?secret=${setup.secret}&issuer=CeramiSys`;
      setMfaSetup({ secret: setup.secret, qrCodeImage: otpauth, recoveryCodes: setup.recoveryCodes });
      setMfaCode('');
      setMfaAck(false);
      try {
        const url = await QRCode.toDataURL(otpauth, { errorCorrectionLevel: 'M', margin: 1, width: 176 });
        setMfaQrDataUrl(url);
      } catch {
        setMfaQrDataUrl('');
      }
      setMfaEnrollOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر بدء إعداد المصادقة الثنائية.');
    }
  };

  const handleConfirmMfaEnrollment = async () => {
    try {
      await platformAdminService.confirmMfaForStaffSelf(mfaCode);
      toast.success('تم تفعيل المصادقة الثنائية لحسابك.');
      setMfaEnrollOpen(false);
      setMfaSetup(null);
      loadMfa();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'رمز التحقق غير صحيح.');
    }
  };

  const handleDisableMfa = async () => {
    try {
      await platformAdminService.disableMfaForStaffSelf(mfaDisableCode);
      toast.success('تم تعطيل المصادقة الثنائية لحسابك.');
      setMfaDisableOpen(false);
      setMfaDisableCode('');
      loadMfa();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'رمز التحقق غير صحيح.');
    }
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="مركز التحكم في حسابات الإدارة"
        description="إدارة موظفي المنصة: إنشاء، دعوات محدودة المدة، جلسات، أجهزة موثوقة، مصادقة ثنائية، نطاقات بيانات، ونقل صلاحيات مع سجل تدقيق كامل."
        icon={<Shield className="h-5 w-5" />}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {canManagePermissions && (
              <Button size="sm" variant="secondary" onClick={() => navigate('/platform/roles')} leadingIcon={<ShieldCheck className="h-4 w-4" />}>
                مصفوفة الأدوار والصلاحيات
              </Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={openCreate} leadingIcon={<UserPlus className="h-4 w-4" />}>
                إضافة موظف
              </Button>
            )}
          </div>
        )}
      />

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line-strong bg-primary/60 p-1.5">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              tab === item.key ? 'bg-primary/15 text-primary ring-1 ring-primary/40' : 'text-muted hover:text-muted'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: Accounts ─────────────────────────────────────────────── */}
      {tab === 'accounts' && (
        <AccountsTab
          roles={roles}
          staffList={staffList}
          search={search}
          onSearchChange={setSearch}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          loading={loading}
          error={error}
          mfaMissingIds={mfaMissingIds}
          isSuperAdminUser={currentUser?.role === 'SUPER_ADMIN'}
          canUpdate={canUpdate}
          canResetPassword={canResetPassword}
          canManagePermissions={canManagePermissions}
          canDeactivate={canDeactivate}
          canDelete={canDelete}
          onEdit={openEdit}
          onRequestResetPassword={(staff) => { setResetTarget(staff); setResetPassword(''); setResetConfirm(''); }}
          onForcePasswordChange={handleForcePasswordChange}
          onRequestTransfer={(staff) => { setTransferFrom(staff); setTransferToId(''); setTransferNote(''); }}
          onOpenScope={openScopeEditor}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
        />
      )}

      {/* ─── TAB: Sessions & Devices ───────────────────────────────────── */}
      {tab === 'sessions' && (
        <SessionsTab
          devices={devices}
          sessions={sessions}
          currentDeviceTrusted={currentDeviceTrusted}
          canRevokeSessions={canRevokeSessions}
          canUpdate={canUpdate}
          onTrustCurrentDevice={handleTrustCurrentDevice}
          onRevokeAllOtherSessions={handleRevokeAllOtherSessions}
          onRevokeSession={handleRevokeSession}
          onRevokeTrustedDevice={handleRevokeTrustedDevice}
        />
      )}

      {/* ─── TAB: Invites ──────────────────────────────────────────────── */}
      {tab === 'invites' && (
        <InvitesTab
          canCreate={canCreate}
          canUpdate={canUpdate}
          roles={roles}
          invites={invites}
          inviteForm={inviteForm}
          setInviteForm={setInviteForm}
          createdInvite={createdInvite}
          copied={copied}
          onCreateInvite={handleCreateInvite}
          onRevokeInvite={handleRevokeInvite}
          onCopyInvite={handleCopyInvite}
        />
      )}

      {/* ─── TAB: Logins ───────────────────────────────────────────────── */}
      {tab === 'logins' && (
        <LoginsTab
          failedOnly={failedOnly}
          onFailedOnlyChange={setFailedOnly}
          logins={logins}
        />
      )}

      {/* ─── TAB: Security / MFA ───────────────────────────────────────── */}
      {tab === 'security' && (
        <SecurityTab
          mfaStatus={mfaStatus}
          mfaCompliance={mfaCompliance}
          canManageSecurity={canManageSecurity}
          canResetPassword={canResetPassword}
          onRequestDisableMfa={() => setMfaDisableOpen(true)}
          onStartEnrollment={handleStartMfaEnrollment}
          onSetEnforcement={handleSetMfaEnforcement}
          onResetStaffMfa={handleResetStaffMfa}
        />
      )}

      {/* ─── Modal: Create / Edit staff ─────────────────────────────────── */}
      <StaffFormModal
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        editingStaff={editingStaff}
        formData={formData}
        setFormData={setFormData}
        roles={roles}
        onSave={handleSave}
      />

      {/* ─── Modal: Reset password ──────────────────────────────────────── */}
      <ResetPasswordModal
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        password={resetPassword}
        setPassword={setResetPassword}
        confirm={resetConfirm}
        setConfirm={setResetConfirm}
        onSubmit={handleResetPassword}
      />

      {/* ─── Modal: Transfer permissions ─────────────────────────────────── */}
      <TransferPermissionsModal
        from={transferFrom}
        onClose={() => setTransferFrom(null)}
        staffList={staffList}
        transferToId={transferToId}
        setTransferToId={setTransferToId}
        transferNote={transferNote}
        setTransferNote={setTransferNote}
        onSubmit={handleTransfer}
      />

      {/* ─── Modal: Data scope ───────────────────────────────────────────── */}
      <DataScopeModal
        target={scopeTarget}
        onClose={() => setScopeTarget(null)}
        scope={scope}
        setScope={setScope}
        scopeTenantIds={scopeTenantIds}
        setScopeTenantIds={setScopeTenantIds}
        tenantSearch={tenantSearch}
        setTenantSearch={setTenantSearch}
        tenantOptions={tenantOptions}
        onSave={handleSaveScope}
      />

      {/* ─── Modal: MFA enrollment ──────────────────────────────────────── */}
      <MfaEnrollModal
        open={mfaEnrollOpen}
        onClose={() => setMfaEnrollOpen(false)}
        mfaSetup={mfaSetup}
        mfaQrDataUrl={mfaQrDataUrl}
        mfaCode={mfaCode}
        setMfaCode={setMfaCode}
        mfaAck={mfaAck}
        setMfaAck={setMfaAck}
        onConfirm={handleConfirmMfaEnrollment}
      />

      {/* ─── Modal: Disable MFA ─────────────────────────────────────────── */}
      <MfaDisableModal
        open={mfaDisableOpen}
        onClose={() => setMfaDisableOpen(false)}
        mfaDisableCode={mfaDisableCode}
        setMfaDisableCode={setMfaDisableCode}
        onDisable={handleDisableMfa}
      />
    </div>
  );
};

export default PlatformStaffPage;
