import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Shield,
  Mail,
  Phone,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
  Copy,
  Check,
  MonitorSmartphone,
  MailCheck,
  ArrowLeftRight,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  QrCode,
  Smartphone,
} from 'lucide-react';
import QRCode from 'qrcode';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
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
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import {
  EmptyState,
  StatusBadge,
  formatDateTime,
  inputClass,
  Toggle,
} from './components/PlatformUI';

type TabKey = 'accounts' | 'sessions' | 'invites' | 'logins' | 'security';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'accounts', label: 'الحسابات' },
  { key: 'sessions', label: 'الجلسات والأجهزة' },
  { key: 'invites', label: 'الدعوات' },
  { key: 'logins', label: 'سجل الدخول' },
  { key: 'security', label: 'المصادقة والأمان' },
];

const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  PLATFORM_ADMIN: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  SUPPORT_AGENT: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  BILLING_SPECIALIST: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  OPERATIONS_ENGINEER: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  LICENSE_MANAGER: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

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
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; qrCodeImage: string; recoveryCodes: string[] } | null>(null);
  const [mfaQrDataUrl, setMfaQrDataUrl] = useState<string>('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaAck, setMfaAck] = useState(false);
  const [mfaDisableOpen, setMfaDisableOpen] = useState(false);
  const [mfaDisableCode, setMfaDisableCode] = useState('');

  const mfaMissingIds = useMemo(() => new Set(mfaCompliance.missing.map((item) => item.id)), [mfaCompliance]);

  const loadStaff = useCallback(() => {
    setLoading(true);
    try {
      setStaffList(platformAdminService.listPlatformStaff(search, roleFilter));
      setRoles(platformAdminService.listPlatformStaffRoles());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل موظفي المنصة.');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  const loadSessions = useCallback(() => {
    try {
      setSessions(platformAdminService.listStaffSessions());
      setDevices(platformAdminService.listTrustedDevices());
      setCurrentDeviceTrusted(PlatformStaffAuthService.isCurrentDeviceTrusted());
    } catch {
      setSessions([]);
      setDevices([]);
    }
  }, []);

  const loadInvites = useCallback(() => {
    try {
      setInvites(platformAdminService.listStaffInvites('all'));
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

  const filteredTenants = useMemo(() => {
    const term = tenantSearch.trim();
    if (!term) return tenantOptions;
    return tenantOptions.filter((t) => t.name.includes(term) || t.code.toLowerCase().includes(term.toLowerCase()));
  }, [tenantOptions, tenantSearch]);

  const getRoleBadge = (role: PlatformStaffRole) => (
    <span className={`border px-2 py-0.5 rounded text-[10px] font-black ${ROLE_BADGE[role] ?? 'bg-slate-800 text-slate-300 border-slate-700'}`}>
      {role === 'SUPER_ADMIN' ? 'مالك المنصة'
        : role === 'PLATFORM_ADMIN' ? 'مدير المنصة'
        : role === 'SUPPORT_AGENT' ? 'دعم فني'
        : role === 'BILLING_SPECIALIST' ? 'فوترة واشتراكات'
        : role === 'OPERATIONS_ENGINEER' ? 'عمليات وتشغيل'
        : 'إدارة التراخيص'}
    </span>
  );

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
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1.5">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              tab === item.key ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: Accounts ─────────────────────────────────────────────── */}
      {tab === 'accounts' && (
        <>
          {/* Roles overview */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {roles.map((role) => {
              const count = staffList.filter((s) => s.role === role.role).length;
              return (
                <button
                  key={role.role}
                  onClick={() => setRoleFilter(roleFilter === role.role ? '' : role.role)}
                  className={`p-3 rounded-xl border text-right transition-all ${
                    roleFilter === role.role
                      ? 'border-sky-500 bg-sky-950/30'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-slate-100">{count}</span>
                    <Shield className="h-4 w-4 text-slate-500" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-200 mt-1 truncate">{role.title.split('(')[0]}</p>
                  <p className="text-[9.5px] text-slate-500 mt-0.5 line-clamp-1">{role.description}</p>
                </button>
              );
            })}
          </div>

          {/* Search + filter */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="البحث بالاسم، البريد أو الهاتف..."
                className={`${inputClass} pr-9`}
              />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={`${inputClass} max-w-[200px]`}>
              <option value="">جميع الأدوار</option>
              {roles.map((role) => (
                <option key={role.role} value={role.role}>{role.title}</option>
              ))}
            </select>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">{staffList.length} موظف</span>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-bold text-rose-300">{error}</div>
          )}

          {/* Staff table */}
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
            {loading ? (
              <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل طاقم المنصة...</div>
            ) : staffList.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6 text-slate-500" />}
                title="لا يوجد موظفون مطابقون"
                description="أضف موظفي الدعم أو الفوترة أو العمليات، أو عدّل البحث الحالي."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-right text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                    <tr>
                      <th className="px-4 py-3">الموظف</th>
                      <th className="px-4 py-3">الدور</th>
                      <th className="px-4 py-3">MFA</th>
                      <th className="px-4 py-3">نطاق البيانات</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">آخر دخول</th>
                      <th className="px-4 py-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {staffList.map((staff) => {
                      const isMfaMissing = mfaMissingIds.has(staff.id);
                      const isSuperAdmin = staff.role === 'SUPER_ADMIN';
                      return (
                        <tr key={staff.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-100">{staff.fullName}</div>
                            <div className="text-[10px] font-mono text-slate-500">{staff.email}</div>
                            {staff.phone && <div className="text-[10px] text-slate-500" dir="ltr">{staff.phone}</div>}
                          </td>
                          <td className="px-4 py-3">{getRoleBadge(staff.role)}</td>
                          <td className="px-4 py-3">
                            {isMfaMissing ? (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-amber-400"><ShieldOff className="h-3 w-3" /> غير مفعّلة</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-400"><ShieldCheck className="h-3 w-3" /> مفعّلة</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[10.5px] font-bold ${staff.dataScope === 'LIMITED' ? 'text-amber-400' : 'text-slate-400'}`}>
                              {staff.dataScope === 'LIMITED' ? 'عملاء محددون' : 'كل العملاء'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-bold inline-flex items-center gap-1 ${staff.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {staff.isActive ? <><CheckCircle2 className="h-3 w-3" /> نشط{staff.mustChangePassword ? ' · رهن التفعيل' : ''}</> : <><XCircle className="h-3 w-3" /> موقوف</>}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400">{staff.lastLoginAt ? formatDateTime(staff.lastLoginAt) : 'لم يسجل دخول بعد'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              {canUpdate && (
                                <button onClick={() => openEdit(staff)} className="text-sky-400 hover:text-sky-300 p-1" title="تعديل البيانات">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canResetPassword && (
                                <button onClick={() => { setResetTarget(staff); setResetPassword(''); setResetConfirm(''); }} className="text-violet-400 hover:text-violet-300 p-1" title="إعادة تعيين كلمة المرور">
                                  <KeyRound className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canResetPassword && (
                                <button onClick={() => handleForcePasswordChange(staff)} className={`p-1 ${staff.mustChangePassword ? 'text-amber-400 hover:text-amber-300' : 'text-slate-500 hover:text-slate-300'}`} title={staff.mustChangePassword ? 'إلغاء فرض تغيير كلمة المرور' : 'فرض تغيير كلمة المرور'}>
                                  <Lock className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canManagePermissions && !isSuperAdmin && (
                                <>
                                  <button onClick={() => { setTransferFrom(staff); setTransferToId(''); setTransferNote(''); }} className="text-teal-400 hover:text-teal-300 p-1" title="نقل الصلاحيات إلى موظف آخر">
                                    <ArrowLeftRight className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => openScopeEditor(staff)} className="text-orange-400 hover:text-orange-300 p-1" title="نطاق البيانات (العملاء المرئيون)">
                                    <Shield className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                              {!isSuperAdmin && canDeactivate && (
                                <button onClick={() => handleToggleActive(staff)} className={`p-1 ${staff.isActive ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`} title={staff.isActive ? 'تجميد الحساب + إنهاء جلساته' : 'تفعيل الحساب'}>
                                  {staff.isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                                </button>
                              )}
                              {!isSuperAdmin && canDelete && (
                                <button onClick={() => handleDelete(staff)} className="text-rose-400 hover:text-rose-300 p-1" title="حذف منطقي (يبقى سجل التدقيق)">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── TAB: Sessions & Devices ───────────────────────────────────── */}
      {tab === 'sessions' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div>
              <p className="text-xs font-bold text-slate-200">الأجهزة الموثوقة ({devices.length}) · الجلسات النشطة ({sessions.length})</p>
              <p className="text-[10px] text-slate-500 mt-0.5">توثيق جهازك الحالي يجعل جلساته المستقبلية مميزة في مركز الأمان وسجل الدخول.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!currentDeviceTrusted ? (
                <Button size="sm" variant="secondary" onClick={handleTrustCurrentDevice} leadingIcon={<MonitorSmartphone className="h-4 w-4" />}>
                  وثّق هذا الجهاز
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> هذا الجهاز موثوق
                </span>
              )}
              {canRevokeSessions && (
                <Button size="sm" variant="ghost" onClick={handleRevokeAllOtherSessions}>
                  إنهاء كل الجلسات الأخرى
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
            <div className="border-b border-slate-800 bg-slate-950/40 px-4 py-2.5 text-xs font-black text-slate-300">الجلسات النشطة</div>
            {sessions.length === 0 ? (
              <EmptyState icon={<MonitorSmartphone className="h-6 w-6 text-slate-500" />} title="لا توجد جلسات مسجلة" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-right text-xs">
                  <thead className="text-[10.5px] text-slate-500 border-b border-slate-800">
                    <tr><th className="px-4 py-2">الموظف</th><th className="px-4 py-2">الجهاز</th><th className="px-4 py-2">عنوان IP</th><th className="px-4 py-2">موثوقة</th><th className="px-4 py-2">بدأت</th><th className="px-4 py-2">آخر نشاط</th><th className="px-4 py-2"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {sessions.map((session) => (
                      <tr key={session.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2.5"><div className="font-bold text-slate-200">{session.staffName}</div><div className="text-[9.5px] text-slate-500">{session.staffRole}</div></td>
                        <td className="px-4 py-2.5 text-slate-300">{session.deviceName || 'غير معروف'}{session.isCurrent ? <span className="mr-1 text-[9px] font-black text-sky-400">(الحالية)</span> : ''}</td>
                        <td className="px-4 py-2.5 font-mono text-[10.5px] text-slate-400" dir="ltr">{session.ipAddress || '—'}</td>
                        <td className="px-4 py-2.5">{session.isTrustedDevice ? <span className="text-emerald-400 font-bold">نعم</span> : <span className="text-slate-500">لا</span>}</td>
                        <td className="px-4 py-2.5 text-slate-400">{formatDateTime(session.createdAt)}</td>
                        <td className="px-4 py-2.5 text-slate-400">{formatDateTime(session.lastActivityAt)}</td>
                        <td className="px-4 py-2.5">
                          {!session.isCurrent && canRevokeSessions && (
                            <button onClick={() => handleRevokeSession(session)} className="text-rose-400 hover:text-rose-300 text-[10.5px] font-bold">
                              إنهاء الجلسة
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
            <div className="border-b border-slate-800 bg-slate-950/40 px-4 py-2.5 text-xs font-black text-slate-300">الأجهزة الموثوقة</div>
            {devices.length === 0 ? (
              <EmptyState icon={<MonitorSmartphone className="h-6 w-6 text-slate-500" />} title="لا توجد أجهزة موثوقة بعد" description="كل موظف يمكنه توثيق جهازه الحالي لحماية الجلسات المميزة." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-right text-xs">
                  <thead className="text-[10.5px] text-slate-500 border-b border-slate-800">
                    <tr><th className="px-4 py-2">الموظف</th><th className="px-4 py-2">الجهاز</th><th className="px-4 py-2">البصمة</th><th className="px-4 py-2">آخر ظهور</th><th className="px-4 py-2"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {devices.map((device) => (
                      <tr key={device.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2.5 font-bold text-slate-200">{device.staffName || device.staffId}</td>
                        <td className="px-4 py-2.5 text-slate-300">{device.deviceName || 'جهاز'}</td>
                        <td className="px-4 py-2.5 font-mono text-[10.5px] text-slate-500" dir="ltr">{device.fingerprint.slice(0, 18)}…</td>
                        <td className="px-4 py-2.5 text-slate-400">{device.lastSeenAt ? formatDateTime(device.lastSeenAt) : '—'}</td>
                        <td className="px-4 py-2.5">
                          {!device.revokedAt && canUpdate && (
                            <button onClick={() => handleRevokeTrustedDevice(device)} className="text-rose-400 hover:text-rose-300 text-[10.5px] font-bold">
                              إلغاء التوثيق
                            </button>
                          )}
                          {device.revokedAt && <span className="text-[10px] text-slate-600">ملغى</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── TAB: Invites ──────────────────────────────────────────────── */}
      {tab === 'invites' && (
        <>
          {canCreate && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-xs font-black text-slate-200 mb-3 flex items-center gap-2"><MailCheck className="h-4 w-4 text-sky-400" /> دعوة موظف جديد للمنصة</p>
              <div className="grid gap-3 md:grid-cols-4">
                <input value={inviteForm.fullName} onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })} placeholder="الاسم الكامل *" className={inputClass} />
                <input value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="البريد الإلكتروني *" type="email" dir="ltr" className={inputClass} />
                <input value={inviteForm.phone} onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })} placeholder="الهاتف (اختياري)" dir="ltr" className={inputClass} />
                <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as PlatformStaffRole })} className={inputClass}>
                  {roles.filter((r) => r.role !== 'SUPER_ADMIN').map((r) => (
                    <option key={r.role} value={r.role}>{r.title}</option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[11px] text-slate-400">
                  صلاحية الرابط
                  <select value={inviteForm.expiresInHours} onChange={(e) => setInviteForm({ ...inviteForm, expiresInHours: Number(e.target.value) })} className={`${inputClass} w-32`}>
                    <option value={24}>24 ساعة</option>
                    <option value={72}>72 ساعة</option>
                    <option value={168}>أسبوع</option>
                    <option value={720}>30 يوماً</option>
                  </select>
                </label>
                <Button size="sm" onClick={handleCreateInvite} leadingIcon={<UserPlus className="h-4 w-4" />}>إنشاء دعوة</Button>
              </div>

              {createdInvite && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-[11px] font-bold text-amber-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> يُعرض هذا الرابط مرة واحدة فقط — احفظه قبل المغادرة.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input readOnly value={createdInvite.link} dir="ltr" className={`${inputClass} flex-1 font-mono text-[10.5px]`} onFocus={(e) => e.target.select()} />
                    <button onClick={handleCopyInvite} className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-[11px] font-bold text-slate-300 hover:text-white hover:border-slate-600">
                      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'تم النسخ' : 'نسخ الرابط'}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">الدعوة مخصصة لحساب <span dir="ltr" className="font-mono text-slate-300">{createdInvite.invite.email}</span> وتنتهي في {formatDateTime(createdInvite.invite.expiresAt)}.</p>
                </div>
              )}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
            {invites.length === 0 ? (
              <EmptyState icon={<MailCheck className="h-6 w-6 text-slate-500" />} title="لا توجد دعوات" description="أنشئ دعوة لموظف جديد — سيُنشئ هو كلمة مروره عبر الرابط المحدود المدة." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-right text-xs">
                  <thead className="text-[10.5px] text-slate-500 border-b border-slate-800">
                    <tr><th className="px-4 py-2">الموظف</th><th className="px-4 py-2">الدور</th><th className="px-4 py-2">الحالة</th><th className="px-4 py-2">تنتهي في</th><th className="px-4 py-2">أنشأها</th><th className="px-4 py-2"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {invites.map((invite) => (
                      <tr key={invite.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2.5"><div className="font-bold text-slate-200">{invite.fullName}</div><div className="text-[10px] text-slate-500" dir="ltr">{invite.email}</div></td>
                        <td className="px-4 py-2.5">{getRoleBadge(invite.role)}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge value={invite.status} label={invite.status === 'PENDING' ? 'معلقة' : invite.status === 'ACCEPTED' ? 'مقبولة' : invite.status === 'REVOKED' ? 'ملغية' : 'منتهية'} />
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">{formatDateTime(invite.expiresAt)}</td>
                        <td className="px-4 py-2.5 text-slate-500">{invite.invitedByName || '—'}</td>
                        <td className="px-4 py-2.5">
                          {invite.status === 'PENDING' && canUpdate && (
                            <button onClick={() => handleRevokeInvite(invite)} className="text-rose-400 hover:text-rose-300 text-[10.5px] font-bold">
                              إلغاء الدعوة
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── TAB: Logins ───────────────────────────────────────────────── */}
      {tab === 'logins' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer">
                <Toggle checked={failedOnly} onChange={(v) => setFailedOnly(v)} label="" />
                الفاشلة/المحظورة فقط
              </label>
            </div>
            <span className="text-[11px] text-slate-500">آخر {logins.length} محاولة · كل المحاولات مسجلة في سجل التدقيق</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
            {logins.length === 0 ? (
              <EmptyState icon={<ShieldCheck className="h-6 w-6 text-slate-500" />} title="لا توجد محاولات مسجلة" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-right text-xs">
                  <thead className="text-[10.5px] text-slate-500 border-b border-slate-800">
                    <tr><th className="px-4 py-2">التوقيت</th><th className="px-4 py-2">البريد</th><th className="px-4 py-2">النتيجة</th><th className="px-4 py-2">السبب</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {logins.map((login) => (
                      <tr key={login.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2.5 text-slate-400">{formatDateTime(login.attemptedAt)}</td>
                        <td className="px-4 py-2.5 font-mono text-[10.5px] text-slate-300" dir="ltr">{login.email}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge value={login.status} label={login.status === 'SUCCESS' ? 'نجاح' : login.status === 'FAILED' ? 'فاشلة' : 'محظورة'} />
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{login.failureReason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── TAB: Security / MFA ───────────────────────────────────────── */}
      {tab === 'security' && (
        <>
          {/* My MFA card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-slate-100 flex items-center gap-2"><Smartphone className="h-4 w-4 text-sky-400" /> المصادقة الثنائية (TOTP) لحسابك</p>
                <p className="mt-1 text-[11px] text-slate-500">تعمل مع Google Authenticator وAuthy و1Password وغيرها. رموز الاسترداد تُنشأ مرة واحدة فقط.</p>
                <p className="mt-2 text-xs font-bold">
                  الحالة الحالية:{' '}
                  {mfaStatus.enabled
                    ? <span className="text-emerald-400">مفعّلة</span>
                    : <span className="text-amber-400">غير مفعّلة</span>}
                  {' · '}سياسة المنصة:{' '}
                  <span className="text-slate-300">{mfaStatus.enforcement === 'required' ? 'إلزامية للجميع' : mfaStatus.enforcement === 'optional' ? 'اختيارية' : 'متوقفة'}</span>
                </p>
              </div>
              {mfaStatus.enabled ? (
                <Button variant="ghost" size="sm" onClick={() => setMfaDisableOpen(true)} leadingIcon={<ShieldOff className="h-4 w-4" />}>
                  تعطيل المصادقة الثنائية
                </Button>
              ) : (
                <Button size="sm" onClick={handleStartMfaEnrollment} leadingIcon={<QrCode className="h-4 w-4" />}>
                  تفعيل المصادقة الثنائية
                </Button>
              )}
            </div>
          </div>

          {/* Enforcement policy + compliance */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-xs font-black text-slate-100">سياسة المصادقة الثنائية للمؤسسة</p>
              <p className="mt-1 text-[10.5px] text-slate-500">تحديد من يُطلب منه تفعيل المصادقة الثنائية قبل استخدام أي شاشة في المنصة.</p>
              <div className="mt-3 space-y-2">
                {([
                  { value: 'off', label: 'متوقفة', desc: 'لا يُطلب من أحد — للموازنة فقط.' },
                  { value: 'optional', label: 'اختيارية', desc: 'كل موظف يختار تفعيلها بنفسه.' },
                  { value: 'required', label: 'إلزامية', desc: 'كل موظف يجب أن يفعّلها قبل الوصول إلى المنصة.' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    disabled={!canManageSecurity}
                    onClick={() => handleSetMfaEnforcement(option.value)}
                    className={`w-full rounded-xl border px-4 py-3 text-right transition-all ${
                      mfaStatus.enforcement === option.value
                        ? 'border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/40'
                        : 'border-slate-800 hover:border-slate-700'
                    } ${!canManageSecurity ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-100">{option.label}</span>
                      <span className={`h-3.5 w-3.5 rounded-full border ${mfaStatus.enforcement === option.value ? 'border-sky-400 bg-sky-400' : 'border-slate-600'}`} />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">{option.desc}</p>
                  </button>
                ))}
              </div>
              {!canManageSecurity && <p className="mt-2 text-[10px] text-slate-600">تعديل السياسة يتطلب صلاحية platform.security.update.</p>}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-xs font-black text-slate-100">اكتمال الامتثال</p>
              <div className="mt-3 flex items-end gap-3">
                <span className="text-4xl font-black text-slate-100">{mfaCompliance.compliant}</span>
                <span className="text-xs text-slate-500 pb-1.5">من {mfaCompliance.total} موظفاً يفعّلون المصادقة الثنائية</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-teal-600 transition-all"
                  style={{ width: `${mfaCompliance.total ? Math.round((mfaCompliance.compliant / mfaCompliance.total) * 100) : 0}%` }}
                />
              </div>
              {mfaCompliance.missing.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[10.5px] font-bold text-amber-400 mb-1.5">لم يفعّلوا بعد ({mfaCompliance.missing.length}):</p>
                  <ul className="max-h-44 space-y-1 overflow-y-auto">
                    {mfaCompliance.missing.map((staff) => (
                      <li key={staff.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-1.5">
                        <span className="text-[10.5px] text-slate-300">{staff.fullName} <span dir="ltr" className="text-slate-600">{staff.email}</span></span>
                        {canResetPassword && (
                          <button onClick={() => handleResetStaffMfa(staff)} className="text-[10px] font-bold text-rose-400 hover:text-rose-300 whitespace-nowrap">
                            إعادة تعيين MFA
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 flex items-center gap-2 text-[11px] font-bold text-emerald-400"><CheckCircle2 className="h-4 w-4" /> كل الموظفين يفعّلون المصادقة الثنائية.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Modal: Create / Edit staff ─────────────────────────────────── */}
      <Modal
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingStaff ? `تعديل بيانات الموظف: ${editingStaff.fullName}` : 'إضافة موظف جديد للمنصة'}
        size="md"
      >
        <div className="space-y-3.5 text-right">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">الاسم الكامل *</label>
            <input value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} placeholder="مثلاً: أحمد محمود" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">البريد الإلكتروني *</label>
              <input type="email" dir="ltr" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="staff@company.com" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">رقم الهاتف (اختياري)</label>
              <input dir="ltr" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="010XXXXXXXX" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">الدور الإداري *</label>
            <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as PlatformStaffRole })} className={inputClass} disabled={editingStaff?.role === 'SUPER_ADMIN'}>
              {roles.map((role) => (
                <option key={role.role} value={role.role}>{role.title}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">{roles.find((r) => r.role === formData.role)?.description}</p>
          </div>
          {!editingStaff && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">كلمة المرور الأولية *</label>
              <input type="password" value={formData.password || ''} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="8 أحرف على الأقل — سيُطلب تغييرها عند أول دخول" className={inputClass} autoComplete="new-password" />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
            <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} disabled={editingStaff?.role === 'SUPER_ADMIN'} className="rounded border-slate-700 text-sky-500 focus:ring-sky-500" />
            <span>الحساب نشط ويمكنه تسجيل الدخول فوراً</span>
          </label>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsFormOpen(false)}>إلغاء</Button>
            <Button size="sm" onClick={handleSave}>{editingStaff ? 'حفظ التعديلات' : 'إضافة الموظف'}</Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Reset password ──────────────────────────────────────── */}
      <Modal open={Boolean(resetTarget)} onClose={() => setResetTarget(null)} title={`إعادة تعيين كلمة المرور: ${resetTarget?.fullName ?? ''}`} size="sm">
        <div className="space-y-3.5 text-right">
          <p className="text-[11px] text-amber-400 flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> ستُنهى كل جلسات الموظف فوراً، وسيُفرض عليه تغيير كلمة المرور عند أول دخول.</p>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">كلمة المرور الجديدة *</label>
            <input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="8 أحرف على الأقل" className={inputClass} autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">تأكيد كلمة المرور *</label>
            <input type="password" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="أعد إدخال كلمة المرور" className={inputClass} autoComplete="new-password" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setResetTarget(null)}>إلغاء</Button>
            <Button size="sm" onClick={handleResetPassword}>إعادة التعيين</Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Transfer permissions ─────────────────────────────────── */}
      <Modal open={Boolean(transferFrom)} onClose={() => setTransferFrom(null)} title={`نقل صلاحيات "${transferFrom?.fullName ?? ''}"`} size="md">
        <div className="space-y-3.5 text-right">
          <p className="text-[11px] text-slate-400">سيُنسخ الدور وتجاوزات الصلاحيات ونطاق البيانات إلى الموظف الهدف، وستُنهى جلساته الحالية. يبقى حساب المصدر كما هو ويمكن تجميده بعد النقل.</p>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">الموظف الهدف *</label>
            <select value={transferToId} onChange={(e) => setTransferToId(e.target.value)} className={inputClass}>
              <option value="">اختر موظفاً...</option>
              {staffList.filter((s) => s.id !== transferFrom?.id).map((s) => (
                <option key={s.id} value={s.id}>{s.fullName} — {s.role}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">ملاحظة (تُسجل في سجل التدقيق)</label>
            <input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="مثال: نقل مسؤولية الفوترة بعد استقالة الموظف" className={inputClass} />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setTransferFrom(null)}>إلغاء</Button>
            <Button size="sm" onClick={handleTransfer} disabled={!transferToId}>نقل الصلاحيات</Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Data scope ───────────────────────────────────────────── */}
      <Modal open={Boolean(scopeTarget)} onClose={() => setScopeTarget(null)} title={`نطاق البيانات: ${scopeTarget?.fullName ?? ''}`} size="lg">
        <div className="space-y-3.5 text-right">
          <div className="flex gap-2">
            {(['ALL', 'LIMITED'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setScope(option)}
                className={`flex-1 rounded-xl border px-4 py-3 text-xs font-bold transition-all ${
                  scope === option ? 'border-orange-500 bg-orange-500/10 text-orange-300' : 'border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                {option === 'ALL' ? 'كل العملاء (الافتراضي)' : 'عملاء محددون'}
              </button>
            ))}
          </div>
          {scope === 'LIMITED' && (
            <>
              <input value={tenantSearch} onChange={(e) => setTenantSearch(e.target.value)} placeholder="ابحث باسم العميل أو الكود..." className={inputClass} />
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/80">
                {filteredTenants.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[11px] text-slate-500">لا توجد نتائج مطابقة.</p>
                ) : filteredTenants.map((tenant) => {
                  const checked = scopeTenantIds.includes(tenant.id);
                  return (
                    <label key={tenant.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-slate-800/30">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setScopeTenantIds((prev) => prev.includes(tenant.id) ? prev.filter((id) => id !== tenant.id) : [...prev, tenant.id])}
                        className="rounded border-slate-700 text-orange-500 focus:ring-orange-500"
                      />
                      <span className="text-xs font-bold text-slate-200">{tenant.name}</span>
                      <span className="text-[10px] font-mono text-slate-500" dir="ltr">{tenant.code}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500">{scopeTenantIds.length} عميل محدد — لن يرى الموظف أي عميل خارج هذه القائمة (لا في القوائم ولا بالبحث المباشر).</p>
            </>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setScopeTarget(null)}>إلغاء</Button>
            <Button size="sm" onClick={handleSaveScope}>حفظ النطاق</Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: MFA enrollment ──────────────────────────────────────── */}
      <Modal open={mfaEnrollOpen} onClose={() => setMfaEnrollOpen(false)} title="تفعيل المصادقة الثنائية" size="md">
        {mfaSetup && (
          <div className="space-y-4 text-right">
            <ol className="space-y-1.5 text-[11px] text-slate-300 list-decimal list-inside">
              <li>امسح رمز QR من تطبيق المصادقة (Google Authenticator / Authy / 1Password).</li>
              <li>أو أدخل المفتاح يدوياً في التطبيق.</li>
              <li>احفظ رموز الاسترداد في مكان آمن — كل رمز يُستخدم مرة واحدة.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              {mfaQrDataUrl ? (
                <img src={mfaQrDataUrl} alt="QR للمصادقة الثنائية" className="rounded-lg bg-white p-1.5" width={176} height={176} />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-slate-800 text-slate-600"><QrCode className="h-16 w-16" /></div>
              )}
              <div className="min-w-[180px] flex-1">
                <p className="text-[10px] font-bold text-slate-500 mb-1">المفتاح السري</p>
                <p dir="ltr" className="break-all rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-[10px] text-slate-300 select-all">{mfaSetup.secret}</p>
              </div>
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
              <p className="text-[10.5px] font-bold text-amber-400">رموز الاسترداد (تظهر مرة واحدة فقط)</p>
              <div dir="ltr" className="mt-2 grid grid-cols-2 gap-1 font-mono text-[10.5px] text-amber-200/90">
                {mfaSetup.recoveryCodes.map((code) => <span key={code}>{code}</span>)}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
              <input type="checkbox" checked={mfaAck} onChange={(e) => setMfaAck(e.target.checked)} className="rounded border-slate-700 text-sky-500" />
              <span>أقرّ بأنني حفظت رموز الاسترداد في مكان آمن</span>
            </label>
            <div className="flex items-end gap-2">
              <input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                dir="ltr"
                className={`${inputClass} max-w-[160px] text-center font-mono tracking-[0.3em]`}
              />
              <Button size="sm" onClick={handleConfirmMfaEnrollment} disabled={mfaCode.length !== 6 || !mfaAck}>
                تأكيد وتفعيل
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Modal: Disable MFA ─────────────────────────────────────────── */}
      <Modal open={mfaDisableOpen} onClose={() => setMfaDisableOpen(false)} title="تعطيل المصادقة الثنائية" size="sm">
        <div className="space-y-3.5 text-right">
          <p className="text-[11px] text-amber-400">تعطيل المصادقة الثنائية يُضعف حماية حسابك. أدخل الرمز الحالي من تطبيق المصادقة للتأكيد.</p>
          <input
            value={mfaDisableCode}
            onChange={(e) => setMfaDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            dir="ltr"
            className={`${inputClass} text-center font-mono tracking-[0.3em]`}
          />
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setMfaDisableOpen(false)}>إلغاء</Button>
            <Button variant="danger" size="sm" onClick={handleDisableMfa} disabled={mfaDisableCode.length !== 6}>تعطيل</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformStaffPage;
