import React from 'react';
import { platformAdminService, PLATFORM_TENANT_STATUS_LABELS } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import type {
  PlatformActivationDetails,
  PlatformPlan,
  PlatformTenant,
  PlatformTenantOverride,
  PlatformTenantOverrideInput,
  PlatformTenantProfile,
  PlatformTenantStatus,
} from '../../../services/domains/platform/platformTypes';
import { useToast } from '../../../components/ui/Toast';
import { formatNumber } from '../components/PlatformUI';
import { buildActivation } from './activation';
import type { TabKey } from './constants';

interface UseTenantDetailOptions {
  plans: PlatformPlan[];
  centralActive: boolean;
  canManageTenants: boolean;
  load: () => void;
}

export function useTenantDetail({ plans, centralActive, canManageTenants, load }: UseTenantDetailOptions) {
  const toast = useToast();

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<PlatformTenantProfile | null>(null);
  const [tab, setTab] = React.useState<TabKey>('overview');
  const [renewMonths, setRenewMonths] = React.useState(12);
  const [planForm, setPlanForm] = React.useState({ planId: '', months: 12, seats: 1 });
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [accountForm, setAccountForm] = React.useState({ username: '', email: '', fullName: '', password: '' });
  const [activationOpen, setActivationOpen] = React.useState(false);
  const [activation, setActivation] = React.useState<PlatformActivationDetails | null>(null);
  const [channels, setChannels] = React.useState<string[]>(['EMAIL']);
  const [working, setWorking] = React.useState(false);
  const [overrides, setOverrides] = React.useState<PlatformTenantOverride[]>([]);
  const [overrideForm, setOverrideForm] = React.useState<PlatformTenantOverrideInput>({ kind: 'MODULE', code: '', value: '', isEnabled: true });
  const [users, setUsers] = React.useState<any[]>([]);
  const [userOpen, setUserOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<any>(null);
  const [userForm, setUserForm] = React.useState({ fullName: '', username: '', email: '', phone: '', role: 'USER', status: 'ACTIVE', notes: '' });
  const [branches, setBranches] = React.useState<any[]>([]);
  const [branchForm, setBranchForm] = React.useState({ code: '', name: '', city: '', phone: '', seatsLimit: 1, devicesLimit: 1, isMain: false });
  const [branchOpen, setBranchOpen] = React.useState(false);

  const loadProfile = React.useCallback((id: string) => {
    const applyProfile = (next: PlatformTenantProfile) => {
      setProfile(next);
      setPlanForm((current) => ({
        planId: current.planId || next.tenant.planId || plans.find((plan) => plan.isDefault)?.id || '',
        months: current.months || 12,
        seats: current.seats || next.tenant.seatsLimit,
      }));
    };
    if (centralActive) {
      Promise.all([
        centralPlatformClient.getTenantProfile(id),
        centralPlatformClient.listTenantOverrides(id),
        centralPlatformClient.listTenantUsers(id),
        centralPlatformClient.listTenantBranches(id),
      ])
        .then(([next, nextOverrides, nextUsers, nextBranches]) => {
          applyProfile(next as PlatformTenantProfile);
          setOverrides(nextOverrides as PlatformTenantOverride[]);
          setUsers(nextUsers);
          setBranches(nextBranches);
        })
        .catch((err) => {
          toast.error('تعذر تحميل ملف العميل', err instanceof Error ? err.message : undefined);
          setDetailId(null);
          setProfile(null);
        });
      return;
    }
    try {
      const next = platformAdminService.getTenantProfile(id);
      applyProfile(next);
      setOverrides(platformAdminService.listTenantOverrides(id));
      setUsers(platformAdminService.listTenantUsers(id));
      setBranches([]);
    } catch (err) {
      toast.error('تعذر تحميل ملف العميل', err instanceof Error ? err.message : undefined);
      setDetailId(null);
      setProfile(null);
    }
  }, [plans, toast, centralActive]);

  const refreshDetail = React.useCallback(() => {
    if (detailId) loadProfile(detailId);
    load();
  }, [detailId, load, loadProfile]);

  const openProfile = (tenant: PlatformTenant) => {
    setDetailId(tenant.id);
    setTab('overview');
    setProfile(null);
    setPlanForm({ planId: tenant.planId || '', months: 12, seats: tenant.seatsLimit });
    setAccountForm({
      username: tenant.code.toLowerCase(),
      email: tenant.email ?? '',
      fullName: tenant.contactName ?? tenant.name,
      password: '',
    });
    loadProfile(tenant.id);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('تم النسخ', label);
    } catch {
      toast.error('تعذر النسخ إلى الحافظة');
    }
  };

  const run = (action: () => unknown, message: string) => {
    setWorking(true);
    Promise.resolve()
      .then(action)
      .then(() => {
        toast.success(message);
        refreshDetail();
      })
      .catch((err) => toast.error('تعذر تنفيذ العملية', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const changeStatus = (tenant: PlatformTenant, next: PlatformTenantStatus) => {
    run(
      () => (centralActive ? centralPlatformClient.setTenantStatus(tenant.id, next) : platformAdminService.setTenantStatus(tenant.id, next)),
      `تم تحديث الحالة إلى ${PLATFORM_TENANT_STATUS_LABELS[next]}`
    );
  };

  const archive = (tenant: PlatformTenant) => {
    if (!window.confirm(`أرشفة العميل "${tenant.name}" وإلغاء كل تراخيصه؟`)) return;
    run(
      () => (centralActive ? centralPlatformClient.archiveTenant(tenant.id) : platformAdminService.archiveTenant(tenant.id)),
      'تمت أرشفة العميل'
    );
  };

  const createAccount = () => {
    if (!detailId) return;
    setWorking(true);
    const request = centralActive
      ? centralPlatformClient.createTenantAccount(detailId, {
          username: accountForm.username,
          email: accountForm.email,
          fullName: accountForm.fullName,
          password: accountForm.password || undefined,
        })
      : Promise.resolve(platformAdminService.createTenantAccount(detailId, {
          username: accountForm.username,
          email: accountForm.email,
          fullName: accountForm.fullName,
          password: accountForm.password || undefined,
        }));
    request
      .then((created: any) => {
        const next = centralActive
          ? centralPlatformClient.getTenantProfile(detailId)
          : Promise.resolve(platformAdminService.getTenantProfile(detailId));
        return next.then((profileNext: PlatformTenantProfile) => {
          setProfile(profileNext);
          setAccountOpen(false);
          setActivation(buildActivation(profileNext, created.temporaryPassword ?? null));
          setActivationOpen(true);
          toast.success('تم إنشاء حساب العميل وتوليد بيانات التفعيل');
          load();
        });
      })
      .catch((err) => toast.error('تعذر إنشاء الحساب', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const resetPassword = () => {
    if (!canManageTenants) { toast.error('لا تملك صلاحية إدارة العملاء'); return; }
    if (!detailId || !profile) return;
    if (!window.confirm('إعادة تعيين كلمة مرور حساب العميل؟ سيتم إنشاء كلمة مرور مؤقتة جديدة.')) return;
    setWorking(true);
    const request = centralActive
      ? centralPlatformClient.resetTenantAccountPassword(detailId)
      : Promise.resolve(platformAdminService.resetTenantAccountPassword(detailId));
    request
      .then((reset: any) => {
        const next = centralActive
          ? centralPlatformClient.getTenantProfile(detailId)
          : Promise.resolve(platformAdminService.getTenantProfile(detailId));
        return next.then((profileNext: PlatformTenantProfile) => {
          setProfile(profileNext);
          setActivation(buildActivation(profileNext, reset.temporaryPassword ?? null));
          setActivationOpen(true);
          toast.success('تم إعادة تعيين كلمة المرور');
        });
      })
      .catch((err) => toast.error('تعذر إعادة تعيين كلمة المرور', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const toggleAccount = (active: boolean) => {
    if (!detailId) return;
    run(
      () => (centralActive ? centralPlatformClient.setTenantAccountActive(detailId, active) : platformAdminService.setTenantAccountActive(detailId, active)),
      active ? 'تم تفعيل حساب العميل' : 'تم تعليق حساب العميل'
    );
  };

  const renewSubscription = () => {
    if (!detailId) return;
    run(
      () => (centralActive ? centralPlatformClient.renewSubscription(detailId, renewMonths) : platformAdminService.renewTenantSubscription(detailId, renewMonths)),
      `تم تجديد الاشتراك لمدة ${renewMonths} شهر`
    );
  };

  const changePlan = () => {
    if (!detailId || !planForm.planId) return;
    run(
      () => (centralActive
        ? centralPlatformClient.changeSubscriptionPlan(detailId, planForm.planId, { months: planForm.months, seats: planForm.seats })
        : platformAdminService.changeTenantPlan(detailId, planForm.planId, {
            months: planForm.months,
            seats: planForm.seats,
          })),
      'تم نقل العميل إلى الباقة الجديدة وإصدار ترخيص جديد'
    );
  };

  const cancelSubscription = () => {
    if (!detailId || !profile) return;
    if (!window.confirm(`إلغاء اشتراك العميل "${profile.tenant.name}"؟ سيتم إلغاء الاشتراك وإبطال التراخيص وحساب الدخول.`)) return;
    run(
      () => (centralActive
        ? centralPlatformClient.cancelSubscription(detailId, 'إلغاء يدوي من لوحة المنصة')
        : platformAdminService.cancelTenantSubscription(detailId, 'إلغاء يدوي من لوحة المنصة')),
      'تم إلغاء اشتراك العميل'
    );
  };

  const addOverride = () => {
    if (!detailId || !overrideForm.code.trim()) {
      toast.error('أدخل رمز الميزة أو الحد');
      return;
    }
    run(
      () => (centralActive
        ? centralPlatformClient.addTenantOverride(detailId, overrideForm)
        : platformAdminService.addTenantOverride(detailId, overrideForm)),
      'تم إضافة ميزة/حد خاص للعميل'
    );
    setOverrideForm({ kind: 'MODULE', code: '', value: '', isEnabled: true });
  };

  const removeOverride = (id: string) => {
    if (!window.confirm('حذف هذا التجاوز الخاص؟')) return;
    run(
      () => (centralActive && detailId
        ? centralPlatformClient.removeTenantOverride(detailId, id)
        : platformAdminService.removeTenantOverride(id)),
      'تم حذف التجاوز الخاص'
    );
  };

  const saveBranch = () => {
    if (!detailId || !branchForm.code.trim() || !branchForm.name.trim()) {
      toast.error('كود الفرع واسمه مطلوبان');
      return;
    }
    setWorking(true);
    centralPlatformClient.createTenantBranch(detailId, {
      code: branchForm.code.trim(),
      name: branchForm.name.trim(),
      city: branchForm.city.trim() || undefined,
      phone: branchForm.phone.trim() || undefined,
      seatsLimit: branchForm.seatsLimit,
      devicesLimit: branchForm.devicesLimit,
      isMain: branchForm.isMain,
    })
      .then(() => {
        toast.success('تمت إضافة الفرع');
        setBranchOpen(false);
        setBranchForm({ code: '', name: '', city: '', phone: '', seatsLimit: 1, devicesLimit: 1, isMain: false });
        if (detailId) centralPlatformClient.listTenantBranches(detailId).then(setBranches);
        loadProfile(detailId);
      })
      .catch((err) => toast.error('تعذر إضافة الفرع', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const closeBranch = (branchId: string) => {
    if (!detailId) return;
    if (!window.confirm('هل تريد إغلاق هذا الفرع؟')) return;
    setWorking(true);
    centralPlatformClient.closeTenantBranch(detailId, branchId)
      .then(() => {
        toast.success('تم إغلاق الفرع');
        centralPlatformClient.listTenantBranches(detailId).then(setBranches);
        loadProfile(detailId);
      })
      .catch((err) => toast.error('تعذر إغلاق الفرع', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const openUserCreate = () => {
    setEditingUser(null);
    setUserForm({ fullName: '', username: '', email: '', phone: '', role: 'USER', status: 'ACTIVE', notes: '' });
    setUserOpen(true);
  };

  const openUserEdit = (user: any) => {
    setEditingUser(user);
    setUserForm({
      fullName: user.fullName,
      username: user.username ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
      role: user.role,
      status: user.status,
      notes: user.notes ?? '',
    });
    setUserOpen(true);
  };

  const saveUser = () => {
    if (!canManageTenants) { toast.error('لا تملك صلاحية إدارة العملاء'); return; }
    if (!detailId) return;
    setWorking(true);
    const request = editingUser
      ? (centralActive
          ? centralPlatformClient.updateTenantUser(detailId, editingUser.id, { ...userForm, status: userForm.status })
          : Promise.resolve(platformAdminService.updateTenantUser(editingUser.id, { ...userForm, status: userForm.status as any })))
      : (centralActive
          ? centralPlatformClient.createTenantUser(detailId, {
              ...userForm,
              status: userForm.status,
              provisionIdentity: true,
              provisioningMode: 'INVITE',
            })
          : Promise.resolve(platformAdminService.createTenantUser(detailId, {
              ...userForm,
              status: userForm.status as any,
              provisionIdentity: true,
              provisioningMode: 'INVITE',
            })));
    request
      .then((result: any) => {
        if (!editingUser) {
          const details = [result.message || 'تم إنشاء المستخدم.'];
          const inviteCode = result.inviteCode ?? result.user?.inviteCode;
          const tempPassword = result.temporaryPassword;
          if (inviteCode) details.push(`كود الدعوة: ${inviteCode}`);
          if (tempPassword) details.push(`كلمة المرور المؤقتة: ${tempPassword}`);
          const identityId = result.user?.identityUserId;
          if (identityId) details.push(`معرّف الهوية: ${identityId}`);
          details.push(`الدور/النطاق: ${result.user?.role ?? userForm.role}${result.user?.scope ? ` / ${result.user.scope}` : ''}`);
          toast.success('تم إنشاء/دعوة حساب هوية فعلي للعميل وربطه بالدور والنطاق', details.join('\n'));
        } else {
          toast.success('تم تحديث بيانات المستخدم.');
        }
        setUserOpen(false);
        refreshDetail();
      })
      .catch((err) => toast.error('تعذر حفظ المستخدم', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const toggleUser = (user: any, active: boolean) => {
    run(
      () => (centralActive && detailId
        ? centralPlatformClient.setTenantUserActive(detailId, user.id, active)
        : platformAdminService.setTenantUserActive(user.id, active)),
      active ? 'تم تفعيل المستخدم' : 'تم تعليق المستخدم'
    );
  };

  const deleteUser = (user: any) => {
    if (!canManageTenants) { toast.error('لا تملك صلاحية إدارة العملاء'); return; }
    if (!window.confirm(`حذف المستخدم "${user.fullName}"؟`)) return;
    run(
      () => (centralActive && detailId
        ? centralPlatformClient.deleteTenantUser(detailId, user.id)
        : platformAdminService.deleteTenantUser(user.id)),
      'تم حذف المستخدم'
    );
  };

  const resetDevices = () => {
    if (!canManageTenants) { toast.error('لا تملك صلاحية إدارة العملاء'); return; }
    if (!detailId) return;
    if (!window.confirm('إعادة تعيين الأجهزة المرتبطة بهذا العميل؟ سيتم تحرير كل الأجهزة المربوطة بالتراخيص.')) return;
    setWorking(true);
    const request = centralActive
      ? centralPlatformClient.getTenantRemoteControl(detailId).then((data: any) => {
          const devices = Array.isArray(data?.devices) ? data.devices : [];
          return devices.reduce((chain: Promise<number>, device: any) =>
            chain.then((count) => centralPlatformClient.releaseDevice(device.id).then(() => count + 1)),
          Promise.resolve(0));
        })
      : Promise.resolve(platformAdminService.resetTenantDevices(detailId));
    request
      .then((count: number) => {
        toast.success('تم إعادة تعيين الأجهزة', `تم تحرير ${formatNumber(count)} جهاز`);
        refreshDetail();
      })
      .catch((err) => toast.error('تعذر إعادة تعيين الأجهزة', err instanceof Error ? err.message : undefined))
      .finally(() => setWorking(false));
  };

  const sendActivation = () => {
    if (centralActive) {
      if (!detailId || !profile) return;
      if (channels.length === 0) {
        toast.error('اختر وسيلة إرسال واحدة على الأقل');
        return;
      }
      setWorking(true);
      centralPlatformClient.getTenantProfile(detailId)
        .then((next: any) => {
          setProfile(next as PlatformTenantProfile);
          setActivation(buildActivation(next as PlatformTenantProfile, null));
          setActivationOpen(true);
          toast.success('تم تجهيز بيانات التفعيل', channels.join(' · '));
        })
        .catch((err) => toast.error('تعذر إرسال بيانات التفعيل', err instanceof Error ? err.message : undefined))
        .finally(() => setWorking(false));
      return;
    }
    if (!canManageTenants) { toast.error('لا تملك صلاحية إدارة العملاء'); return; }
    if (!detailId) return;
    if (channels.length === 0) {
      toast.error('اختر وسيلة إرسال واحدة على الأقل');
      return;
    }
    setWorking(true);
    try {
      const details = platformAdminService.sendTenantActivation(detailId);
      setActivation(details);
      setActivationOpen(true);
      setProfile(platformAdminService.getTenantProfile(detailId));
      toast.success('تم تجهيز بيانات التفعيل', channels.join(' · '));
    } catch (err) {
      toast.error('تعذر إرسال بيانات التفعيل', err instanceof Error ? err.message : undefined);
    } finally {
      setWorking(false);
    }
  };

  const closeDetail = React.useCallback(() => {
    setDetailId(null);
    setProfile(null);
  }, []);

  const tenant = profile?.tenant ?? null;
  const account = profile?.account ?? null;

  const healthChecks = profile
    ? [
        { label: 'العميل نشط', ok: profile.tenant.status === 'ACTIVE' || profile.tenant.status === 'TRIAL' },
        { label: 'يوجد ترخيص ساري', ok: profile.licenses.some((item) => item.status === 'ACTIVE' || item.status === 'ISSUED') },
        { label: 'لا توجد فواتير متأخرة', ok: (profile.tenant.outstanding ?? 0) <= 0 },
        { label: 'الاشتراك لم ينته', ok: !profile.tenant.subscriptionExpiresAt || new Date(profile.tenant.subscriptionExpiresAt) > new Date() },
        { label: 'الحساب مفعّل', ok: Boolean(profile.account?.isActive) },
        { label: 'الأجهزة ضمن الحد', ok: (profile.usage.devicesUsed <= profile.usage.devicesLimit) },
      ]
    : [];
  const healthScore = healthChecks.length
    ? Math.round((healthChecks.filter((item) => item.ok).length / healthChecks.length) * 100)
    : 0;
  const subscription = profile?.subscriptions.find((item) => item.status === 'ACTIVE' || item.status === 'TRIAL') ?? profile?.subscriptions[0] ?? null;

  return {
    detailId,
    setDetailId,
    profile,
    setProfile,
    closeDetail,
    tab,
    setTab,
    renewMonths,
    setRenewMonths,
    planForm,
    setPlanForm,
    accountOpen,
    setAccountOpen,
    accountForm,
    setAccountForm,
    activationOpen,
    setActivationOpen,
    activation,
    setActivation,
    channels,
    setChannels,
    working,
    overrides,
    setOverrides,
    overrideForm,
    setOverrideForm,
    users,
    setUsers,
    userOpen,
    setUserOpen,
    editingUser,
    setEditingUser,
    userForm,
    setUserForm,
    branches,
    setBranches,
    branchForm,
    setBranchForm,
    branchOpen,
    setBranchOpen,
    tenant,
    account,
    subscription,
    healthChecks,
    healthScore,
    loadProfile,
    openProfile,
    copyToClipboard,
    run,
    changeStatus,
    archive,
    createAccount,
    resetPassword,
    toggleAccount,
    renewSubscription,
    changePlan,
    cancelSubscription,
    addOverride,
    removeOverride,
    saveBranch,
    closeBranch,
    openUserCreate,
    openUserEdit,
    saveUser,
    toggleUser,
    deleteUser,
    resetDevices,
    sendActivation,
  };
}

export type TenantDetailState = ReturnType<typeof useTenantDetail>;
