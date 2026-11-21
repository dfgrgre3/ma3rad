import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DataTable } from '../../components/ui/DataTable';
import {
  CalendarClock,
  Search,
  RotateCw,
  Ban,
  Download,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  SlidersHorizontal,
  Eye,
  FilePlus2,
  FlaskConical,
  CheckSquare,
  Square,
} from 'lucide-react';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformSubscription,
  PlatformPlan,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  EmptyState,
  StatusBadge,
  formatDate,
  formatMoney,
  inputClass,
  downloadCsv,
} from './components/PlatformUI';
import {
  listSubscriptions,
  listPlans,
  renewSubscription,
  cancelSubscription,
  changeSubscriptionPlan,
  suspendSubscription,
  resumeSubscription,
} from './PlatformSubscriptionsPage/subscriptionData';
import { CreateSubscriptionModal, type CreateSubscriptionMode } from './PlatformSubscriptionsPage/CreateSubscriptionModal';
import { SubscriptionSettingsModal } from './PlatformSubscriptionsPage/SubscriptionSettingsModal';
import { SubscriptionDetailModal } from './PlatformSubscriptionsPage/SubscriptionDetailModal';

import { useToast } from '../../components/ui/Toast';
const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: 'شهري',
  QUARTERLY: 'ربع سنوي',
  YEARLY: 'سنوي',
  LIFETIME: 'مدى الحياة',
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  TRIAL: 'تجريبي',
  ACTIVE: 'نشط',
  PAST_DUE: 'متأخر الدفع',
  SUSPENDED: 'موقوف',
  CANCELLED: 'ملغي',
  EXPIRED: 'منتهي',
};

const OPEN_STATUSES = new Set(['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED']);
const EXPIRING_WINDOW_DAYS = 30;

const daysUntil = (iso?: string | null): number | null => {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24));
};

export const PlatformSubscriptionsPage: React.FC = () => {
  const toast = useToast();
  const [subscriptions, setSubscriptions] = useState<PlatformSubscription[]>([]);
  const canManageSubscriptions = canPlatform('subscriptions');
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [search, setSearch] = useState('');
  // Raw input is debounced ~300ms before it hits `search` (and therefore the API).
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Row selection for bulk operations (keyed by tenantId).
  const [selectedTenantIds, setSelectedTenantIds] = useState<Set<string>>(new Set());

  // Renew / Change Plan Modal
  const [activeSub, setActiveSub] = useState<PlatformSubscription | null>(null);
  const [actionType, setActionType] = useState<'RENEW' | 'CHANGE_PLAN'>('RENEW');
  const [renewMonths, setRenewMonths] = useState(12);
  const [newPlanId, setNewPlanId] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [executing, setExecuting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PlatformSubscription | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // New modals
  const [createMode, setCreateMode] = useState<CreateSubscriptionMode | null>(null);
  const [settingsTarget, setSettingsTarget] = useState<PlatformSubscription | null>(null);
  const [detailTarget, setDetailTarget] = useState<PlatformSubscription | null>(null);

  // Bulk operations
  const [bulkAction, setBulkAction] = useState<'RENEW' | 'SUSPEND' | 'CANCEL' | null>(null);
  const [bulkMonths, setBulkMonths] = useState(12);
  const [bulkRunning, setBulkRunning] = useState(false);

  // Plans are reference data for the filters/modals — load once, not per filter change.
  const loadPlans = useCallback(async () => {
    try {
      setPlans(await listPlans());
    } catch {
      /* plan list is best-effort; subscriptions still render without it */
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const subs = await listSubscriptions({
        status: statusFilter || undefined,
        planId: planFilter || undefined,
        search: search || undefined,
      });
      setSubscriptions(subs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الاشتراكات.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, planFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const expiringSoon = useMemo(
    () =>
      subscriptions.filter((s) => {
        if (!OPEN_STATUSES.has(s.status)) return false;
        const days = daysUntil(s.endDate);
        return days !== null && days <= EXPIRING_WINDOW_DAYS;
      }),
    [subscriptions]
  );

  const selectedSubs = useMemo(
    () => subscriptions.filter((s) => selectedTenantIds.has(s.tenantId)),
    [subscriptions, selectedTenantIds]
  );

  const allVisibleSelected = subscriptions.length > 0 && subscriptions.every((s) => selectedTenantIds.has(s.tenantId));

  const toggleSelectAll = () => {
    setSelectedTenantIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        subscriptions.forEach((s) => next.delete(s.tenantId));
      } else {
        subscriptions.forEach((s) => next.add(s.tenantId));
      }
      return next;
    });
  };

  const toggleSelect = (tenantId: string) => {
    setSelectedTenantIds((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  };

  const requireManage = (): boolean => {
    if (!canManageSubscriptions) {
      toast.warning('لا تملك صلاحية إدارة الاشتراكات.');
      return false;
    }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.warning('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      return false;
    }
    return true;
  };

  const handleRenew = (sub: PlatformSubscription) => {
    setActiveSub(sub);
    setActionType('RENEW');
    setRenewMonths(12);
  };

  const handleChangePlan = (sub: PlatformSubscription) => {
    setActiveSub(sub);
    setActionType('CHANGE_PLAN');
    setNewPlanId(sub.planId);
    setRenewMonths(12);
    setChangeReason('');
  };

  const handleExecuteModal = async () => {
    if (!activeSub || executing) return;
    if (!requireManage()) return;
    setExecuting(true);
    try {
      if (actionType === 'RENEW') {
        await renewSubscription(activeSub.tenantId, renewMonths);
        toast.success(`تم تجديد الاشتراك بنجاح لمدة ${renewMonths} شهر.`);
      } else {
        if (!newPlanId) {
          toast.warning('يرجى اختيار الباقة الجديدة.');
          return;
        }
        await changeSubscriptionPlan(activeSub.tenantId, newPlanId, {
          months: renewMonths,
          seats: activeSub.seats,
          reason: changeReason || 'تغيير باقة من لوحة الاشتراكات',
        });
        toast.success('تم نقل العميل إلى الخطة الجديدة بنجاح.');
      }
      setActiveSub(null);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشلت العملية.');
    } finally {
      setExecuting(false);
    }
  };

  const handleCancelSub = (sub: PlatformSubscription) => {
    if (!requireManage()) return;
    setCancelReason('');
    setCancelTarget(sub);
  };

  const confirmCancelSub = async () => {
    const sub = cancelTarget;
    if (!sub || executing) return;
    setExecuting(true);
    try {
      await cancelSubscription(sub.tenantId, cancelReason || 'إلغاء يدوي من لوحة إدارة الاشتراكات المركزية');
      setCancelTarget(null);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إلغاء الاشتراك.');
    } finally {
      setExecuting(false);
    }
  };

  const handleSuspendResume = async (sub: PlatformSubscription) => {
    if (!requireManage() || executing) return;
    setExecuting(true);
    try {
      if (sub.status === 'SUSPENDED') {
        await resumeSubscription(sub.tenantId);
        toast.success('تمت إعادة تفعيل الاشتراك.');
      } else {
        await suspendSubscription(sub.tenantId, 'إيقاف يدوي من لوحة الاشتراكات');
        toast.success('تم إيقاف الاشتراك.');
      }
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشلت العملية.');
    } finally {
      setExecuting(false);
    }
  };

  const handleBulk = async () => {
    if (!bulkAction || bulkRunning || selectedSubs.length === 0) return;
    if (!requireManage()) return;
    setBulkRunning(true);
    let success = 0;
    const failed: string[] = [];
    try {
      for (const sub of selectedSubs) {
        try {
          if (bulkAction === 'RENEW') {
            await renewSubscription(sub.tenantId, bulkMonths);
          } else if (bulkAction === 'SUSPEND') {
            await suspendSubscription(sub.tenantId, 'إيقاف جماعي من لوحة الاشتراكات');
          } else {
            await cancelSubscription(sub.tenantId, 'إلغاء جماعي من لوحة الاشتراكات');
          }
          success += 1;
        } catch {
          failed.push(sub.tenantName || sub.tenantId);
        }
      }
      if (failed.length === 0) {
        toast.success(`تم تنفيذ العملية على ${success} اشتراك بنجاح.`);
      } else {
        toast.warning(`تم تنفيذ العملية على ${success} اشتراك، وفشل ${failed.length}: ${failed.slice(0, 3).join('، ')}${failed.length > 3 ? '...' : ''}`);
      }
      setSelectedTenantIds(new Set());
      setBulkAction(null);
      await loadData();
    } finally {
      setBulkRunning(false);
    }
  };

  const exportRows = (rows: PlatformSubscription[], filename: string) => {
    if (!canManageSubscriptions) { toast.warning('لا تملك صلاحية إدارة الاشتراكات.'); return; }
    downloadCsv(filename, [
      ['رقم الاشتراك', 'العميل', 'الباقة', 'الحالة', 'تاريخ البدء', 'تاريخ الانتهاء', 'القيمة', 'دورة الفوترة', 'التجديد التلقائي'],
      ...rows.map((s) => [
        s.id,
        s.tenantName || s.tenantId,
        s.planName || s.planId,
        SUBSCRIPTION_STATUS_LABELS[s.status] ?? s.status,
        s.startDate,
        s.endDate || '—',
        s.price,
        CYCLE_LABELS[s.billingCycle] || s.billingCycle,
        s.autoRenew ? 'نعم' : 'لا',
      ]),
    ]);
  };

  const exportSubscriptions = () => exportRows(subscriptions, 'platform-subscriptions.csv');

  const isOpenSub = (sub: PlatformSubscription) => OPEN_STATUSES.has(sub.status);

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="إدارة الاشتراكات المركزية (Subscriptions Management)"
        description="واجهة مركزية مستقلة لعقود الاشتراك، التجديدات، الانتقال بين الباقات، الإيقاف، والعمليات الجماعية."
        icon={<CalendarClock className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            {canManageSubscriptions && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCreateMode('TRIAL')}
                  leadingIcon={<FlaskConical className="h-4 w-4" />}
                >
                  اشتراك تجريبي
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCreateMode('NEW')}
                  leadingIcon={<FilePlus2 className="h-4 w-4" />}
                >
                  اشتراك جديد
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={exportSubscriptions}
                  leadingIcon={<Download className="h-4 w-4" />}
                >
                  تصدير CSV
                </Button>
              </>
            )}
            <Button
              size="sm"
              onClick={() => void loadData()}
              leadingIcon={<RefreshCw className="h-4 w-4" />}
            >
              تحديث البيانات
            </Button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3 bg-primary/60 border border-line-strong rounded-xl">
          <p className="text-[11px] font-semibold text-muted">إجمالي الاشتراكات</p>
          <p className="text-xl font-black text-muted mt-1">{subscriptions.length}</p>
        </div>
        <div className="p-3 bg-success/20 border border-success/20 rounded-xl">
          <p className="text-[11px] font-semibold text-success">الاشتراكات النشطة</p>
          <p className="text-xl font-black text-success mt-1">
            {subscriptions.filter((s) => s.status === 'ACTIVE').length}
          </p>
        </div>
        <div className="p-3 bg-warning/20 border border-warning/20 rounded-xl">
          <p className="text-[11px] font-semibold text-warning">الفترة التجريبية (Trial)</p>
          <p className="text-xl font-black text-warning mt-1">
            {subscriptions.filter((s) => s.status === 'TRIAL').length}
          </p>
        </div>
        <div className={`p-3 border rounded-xl ${expiringSoon.length > 0 ? 'bg-warning/20 border-warning/30' : 'bg-primary/60 border-line-strong'}`}>
          <p className="text-[11px] font-semibold text-warning">ينتهي خلال 30 يوم</p>
          <p className="text-xl font-black text-warning mt-1">{expiringSoon.length}</p>
        </div>
        <div className="p-3 bg-danger/20 border border-danger/20 rounded-xl">
          <p className="text-[11px] font-semibold text-danger">ملغاة أو منتهية</p>
          <p className="text-xl font-black text-danger mt-1">
            {subscriptions.filter((s) => s.status === 'CANCELLED' || s.status === 'EXPIRED').length}
          </p>
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
          <p className="text-ink-secondary">
            <span className="font-bold text-warning">{expiringSoon.length} اشتراك</span> ينتهي خلال {EXPIRING_WINDOW_DAYS} يوماً:{' '}
            {expiringSoon.slice(0, 4).map((s) => `${s.tenantName || s.tenantId} (${formatDate(s.endDate)})`).join('، ')}
            {expiringSoon.length > 4 ? ` و${expiringSoon.length - 4} أخرى` : ''}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-primary/60 p-3 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="البحث باسم العميل أو كود المستأجر..."
            className={`${inputClass} pr-9`}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${inputClass} max-w-[170px]`}
        >
          <option value="">جميع الحالات</option>
          <option value="ACTIVE">نشط (Active)</option>
          <option value="TRIAL">تجريبي (Trial)</option>
          <option value="EXPIRED">منتهي (Expired)</option>
          <option value="CANCELLED">ملغي (Cancelled)</option>
          <option value="PAST_DUE">متأخر الدفع (Past Due)</option>
          <option value="SUSPENDED">موقوف (Suspended)</option>
        </select>

        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className={`${inputClass} max-w-[190px]`}
        >
          <option value="">جميع الباقات</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {canManageSubscriptions && subscriptions.length > 0 && (
          <Button size="sm" variant="ghost" onClick={toggleSelectAll}>
            {allVisibleSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedTenantIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/40 px-3 py-2.5">
          <span className="text-xs font-bold text-ink">{selectedTenantIds.size} محدد</span>
          {canManageSubscriptions && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setBulkAction('RENEW')} disabled={bulkRunning} leadingIcon={<RotateCw className="h-3.5 w-3.5" />}>
                تجديد جماعي
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setBulkAction('SUSPEND')} disabled={bulkRunning} leadingIcon={<PauseCircle className="h-3.5 w-3.5" />}>
                إيقاف جماعي
              </Button>
              <Button size="sm" variant="danger" onClick={() => setBulkAction('CANCEL')} disabled={bulkRunning} leadingIcon={<Ban className="h-3.5 w-3.5" />}>
                إلغاء جماعي
              </Button>
              <Button size="sm" variant="secondary" onClick={() => exportRows(selectedSubs, 'platform-subscriptions-selected.csv')} leadingIcon={<Download className="h-3.5 w-3.5" />}>
                تصدير المحدد
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelectedTenantIds(new Set())} disabled={bulkRunning}>
            إلغاء التحديد
          </Button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-xs font-bold text-danger">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل الاشتراكات...</div>
        ) : subscriptions.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-6 w-6 text-muted" />}
            title="لا توجد اشتراكات مطابقة"
            description="غيّر عوامل التصفية أو أضف اشتراكات جديدة للعملاء."
          />
        ) : (
          <div className="overflow-x-auto">
            <DataTable<PlatformSubscription>
              ariaLabel="الاشتراكات"
              rows={subscriptions}
              rowKey={(sub) => String(sub.id)}
              minWidth={1150}
              dense
              tableClassName="text-xs"
              rowClassName={(sub) => {
                const days = daysUntil(sub.endDate);
                const expiring = isOpenSub(sub) && days !== null && days <= EXPIRING_WINDOW_DAYS;
                return `transition-colors hover:bg-primary/30 ${expiring ? 'bg-warning/5' : ''}`;
              }}
              columns={[
                {
                  key: 'select', header: '', align: 'center',
                  render: (sub) => (
                    <button
                      type="button"
                      onClick={() => toggleSelect(sub.tenantId)}
                      className="text-muted hover:text-primary"
                      aria-label="تحديد الاشتراك"
                    >
                      {selectedTenantIds.has(sub.tenantId) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                    </button>
                  ),
                },
                {
                  key: 'tenant', header: 'العميل / المستأجر',
                  render: (sub) => (
                    <span className="block">
                      <span className="block font-bold text-muted">{sub.tenantName || 'عميل غير مسمى'}</span>
                      <span className="block font-mono text-[10px] text-muted">{sub.tenantId}</span>
                    </span>
                  ),
                },
                { key: 'plan', header: 'الباقة', render: (sub) => <span className="font-semibold text-muted">{sub.planName || 'باقة محذوفة'}</span> },
                {
                  key: 'status', header: 'الحالة',
                  render: (sub) => <StatusBadge value={sub.status} label={SUBSCRIPTION_STATUS_LABELS[sub.status] ?? sub.status} />,
                },
                {
                  key: 'price', header: 'القيمة والفوترة',
                  render: (sub) => (
                    <span className="block">
                      <span className="block font-bold text-muted">{formatMoney(sub.price, sub.lockedCurrency ?? plans.find((p) => p.id === sub.planId)?.currency)}</span>
                      <span className="block text-[10px] text-muted">{CYCLE_LABELS[sub.billingCycle] || sub.billingCycle}</span>
                    </span>
                  ),
                },
                { key: 'start', header: 'البداية', render: (sub) => <span className="text-muted">{formatDate(sub.startDate)}</span> },
                {
                  key: 'end', header: 'نهاية الصلاحية',
                  render: (sub) => {
                    const days = daysUntil(sub.endDate);
                    const expiring = isOpenSub(sub) && days !== null && days <= EXPIRING_WINDOW_DAYS;
                    return (
                      <span className={`font-semibold ${sub.endDate && new Date(sub.endDate) < new Date() ? 'font-bold text-danger' : expiring ? 'font-bold text-warning' : 'text-muted'}`}>
                        {sub.endDate ? formatDate(sub.endDate) : 'مفتوح (مدى الحياة)'}
                        {expiring && days !== null && <span className="block text-[10px] text-warning">متبقي {days} يوم</span>}
                      </span>
                    );
                  },
                },
                { key: 'renew', header: 'التجديد التلقائي', render: (sub) => <span className={sub.autoRenew ? 'text-success' : 'text-muted'}>{sub.autoRenew ? 'مفعل' : 'معطل'}</span> },
                {
                  key: 'actions', header: 'إجراءات', align: 'center',
                  render: (sub) => (
                    <span className="flex items-center justify-center gap-2 whitespace-nowrap">
                      <button onClick={() => setDetailTarget(sub)} className="flex items-center gap-1 text-xs text-muted hover:text-ink" title="عرض التفاصيل والفواتير والسجل">
                        <Eye className="h-3 w-3" />
                        تفاصيل
                      </button>
                      {canManageSubscriptions && isOpenSub(sub) && (
                        <>
                          <button onClick={() => handleRenew(sub)} className="flex items-center gap-1 text-xs text-success hover:text-success" title="تجديد مدة الاشتراك">
                            <RotateCw className="h-3 w-3" />
                            تجديد
                          </button>
                          <button onClick={() => handleChangePlan(sub)} className="flex items-center gap-1 text-xs text-primary hover:text-primary" title="ترقية أو تخفيض الباقة">
                            <ArrowUpRight className="h-3 w-3" />
                            تغيير الباقة
                          </button>
                          <button onClick={() => setSettingsTarget(sub)} className="flex items-center gap-1 text-xs text-muted hover:text-ink" title="تعديل المقاعد والفروع والتجديد التلقائي">
                            <SlidersHorizontal className="h-3 w-3" />
                            إعدادات
                          </button>
                          {sub.status === 'SUSPENDED' ? (
                            <button onClick={() => void handleSuspendResume(sub)} disabled={executing} className="flex items-center gap-1 text-xs text-success hover:text-success" title="إعادة تفعيل الاشتراك">
                              <PlayCircle className="h-3 w-3" />
                              تفعيل
                            </button>
                          ) : (
                            <button onClick={() => void handleSuspendResume(sub)} disabled={executing} className="flex items-center gap-1 text-xs text-warning hover:text-warning" title="إيقاف الاشتراك مؤقتاً">
                              <PauseCircle className="h-3 w-3" />
                              إيقاف
                            </button>
                          )}
                          <button onClick={() => handleCancelSub(sub)} className="text-xs text-danger hover:text-danger" title="إلغاء الاشتراك فوراً">
                            إلغاء
                          </button>
                        </>
                      )}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>

      {/* Create subscription / trial modal */}
      {createMode && (
        <CreateSubscriptionModal
          open={Boolean(createMode)}
          mode={createMode}
          plans={plans}
          onClose={() => setCreateMode(null)}
          onCreated={() => void loadData()}
        />
      )}

      {/* Settings modal */}
      <SubscriptionSettingsModal
        subscription={settingsTarget}
        onClose={() => setSettingsTarget(null)}
        onSaved={() => void loadData()}
      />

      {/* Detail modal */}
      <SubscriptionDetailModal
        subscription={detailTarget}
        onClose={() => setDetailTarget(null)}
      />

      {/* Renew / Change Plan Modal */}
      <Modal
        open={Boolean(activeSub)}
        onClose={() => setActiveSub(null)}
        title={
          actionType === 'RENEW'
            ? `تجديد اشتراك: ${activeSub?.tenantName || activeSub?.tenantId}`
            : `تغيير باقة: ${activeSub?.tenantName || activeSub?.tenantId}`
        }
      >
        <div className="space-y-3.5 text-right">
          {actionType === 'CHANGE_PLAN' && (
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">اختر الباقة الجديدة *</label>
              <select
                value={newPlanId}
                onChange={(e) => setNewPlanId(e.target.value)}
                className={inputClass}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatMoney(p.price, p.currency)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-muted mb-1">
              {actionType === 'RENEW' ? 'عدد أشهر التجديد الإضافية' : 'فترة الاشتراك بالباقة الجديدة (بالأشهر)'}
            </label>
            <select
              value={renewMonths}
              onChange={(e) => setRenewMonths(Number(e.target.value))}
              className={inputClass}
            >
              <option value={1}>شهر واحد</option>
              <option value={3}>3 أشهر (ربع سنوي)</option>
              <option value={6}>6 أشهر (نصف سنوي)</option>
              <option value={12}>12 شهر (سنة كاملة)</option>
              <option value={24}>24 شهر (سنتين)</option>
            </select>
          </div>

          {actionType === 'CHANGE_PLAN' && (
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">سبب التغيير (اختياري)</label>
              <input
                type="text"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="مثال: ترقية بناءً على طلب العميل"
                className={inputClass}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
            <Button variant="secondary" size="sm" onClick={() => setActiveSub(null)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={() => void handleExecuteModal()} loading={executing} disabled={!canManageSubscriptions || executing}>
              تأكيد العملية
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel subscription confirmation */}
      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => { if (!executing) setCancelTarget(null); }}
        title="إلغاء الاشتراك"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCancelTarget(null)} disabled={executing}>
              تراجع
            </Button>
            <Button variant="danger" size="sm" onClick={() => void confirmCancelSub()} loading={executing} disabled={!canManageSubscriptions || executing}>
              تأكيد الإلغاء
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px] leading-6 text-ink-secondary">
            هل أنت متأكد من إلغاء اشتراك «{cancelTarget?.tenantName || cancelTarget?.tenantId}»؟ سيتم إبطال التراخيص والحساب المرتبط، ولا يمكن التراجع عن هذا الإجراء.
          </p>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">سبب الإلغاء (اختياري)</label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="مثال: طلب العميل / عدم السداد"
              className={inputClass}
            />
          </div>
        </div>
      </Modal>

      {/* Bulk action modal */}
      <Modal
        open={Boolean(bulkAction)}
        onClose={() => { if (!bulkRunning) setBulkAction(null); }}
        busy={bulkRunning}
        title={
          bulkAction === 'RENEW' ? `تجديد جماعي (${selectedSubs.length} اشتراك)`
            : bulkAction === 'SUSPEND' ? `إيقاف جماعي (${selectedSubs.length} اشتراك)`
              : `إلغاء جماعي (${selectedSubs.length} اشتراك)`
        }
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setBulkAction(null)} disabled={bulkRunning}>
              تراجع
            </Button>
            <Button
              variant={bulkAction === 'CANCEL' ? 'danger' : 'primary'}
              size="sm"
              onClick={() => void handleBulk()}
              loading={bulkRunning}
              disabled={bulkRunning}
            >
              تأكيد التنفيذ
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-right">
          {bulkAction === 'RENEW' && (
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">عدد أشهر التجديد لكل اشتراك</label>
              <select value={bulkMonths} onChange={(e) => setBulkMonths(Number(e.target.value))} className={inputClass}>
                <option value={1}>شهر واحد</option>
                <option value={3}>3 أشهر</option>
                <option value={6}>6 أشهر</option>
                <option value={12}>12 شهر</option>
                <option value={24}>24 شهر</option>
              </select>
            </div>
          )}
          {bulkAction === 'SUSPEND' && (
            <p className="text-[12px] leading-6 text-ink-secondary">
              سيتم إيقاف الاشتراكات والتراخيص المرتبطة مؤقتاً لـ {selectedSubs.length} عميل. يمكن إعادة تفعيلها لاحقاً.
            </p>
          )}
          {bulkAction === 'CANCEL' && (
            <p className="text-[12px] leading-6 text-ink-secondary">
              سيتم <span className="font-bold text-danger">إلغاء نهائي</span> اشتراكات {selectedSubs.length} عميل وإبطال تراخيصهم. لا يمكن التراجع عن هذا الإجراء.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default PlatformSubscriptionsPage;
