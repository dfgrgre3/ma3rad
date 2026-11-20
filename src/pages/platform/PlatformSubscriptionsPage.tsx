import React, { useState, useEffect, useCallback } from 'react';
import { DataTable } from '../../components/ui/DataTable';
import {
  CalendarClock,
  Layers3,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCw,
  Ban,
  Download,
  Building2,
  ArrowUpRight,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformSubscription,
  PlatformPlan,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  EmptyState,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatMoney,
  inputClass,
  downloadCsv,
} from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: 'شهري',
  QUARTERLY: 'ربع سنوي',
  YEARLY: 'سنوي',
  LIFETIME: 'مدى الحياة',
};

export const PlatformSubscriptionsPage: React.FC = () => {
  const toast = useToast();
  const [subscriptions, setSubscriptions] = useState<PlatformSubscription[]>([]);
  const canManageSubscriptions = canPlatform('subscriptions');
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Renew / Change Plan Modal
  const [activeSub, setActiveSub] = useState<PlatformSubscription | null>(null);
  const [actionType, setActionType] = useState<'RENEW' | 'CHANGE_PLAN'>('RENEW');
  const [renewMonths, setRenewMonths] = useState(12);
  const [newPlanId, setNewPlanId] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const central = getCentralDataSourceState();
      if (central.misconfigured) {
        throw new Error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      }
      if (central.active) {
        const [subs, plns] = await Promise.all([
          centralPlatformClient.listSubscriptions({
            status: statusFilter || undefined,
            planId: planFilter || undefined,
            search: search || undefined,
          }),
          centralPlatformClient.listPlans(),
        ]);
        setSubscriptions(subs);
        setPlans(plns);
      } else {
        const subs = platformAdminService.listSubscriptions({
          status: statusFilter,
          planId: planFilter,
          search,
        });
        const plns = platformAdminService.listPlans();
        setSubscriptions(subs);
        setPlans(plns);
      }
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
  };

  const handleExecuteModal = async () => {
    if (!activeSub) return;
    if (!canManageSubscriptions) { toast.warning('لا تملك صلاحية إدارة الاشتراكات.'); return; }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.warning('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      return;
    }
    try {
      if (actionType === 'RENEW') {
        if (central.active) {
          await centralPlatformClient.renewSubscription(activeSub.tenantId, renewMonths);
        } else {
          platformAdminService.renewTenantSubscription(activeSub.tenantId, renewMonths);
        }
        toast.success(`تم تجديد الاشتراك بنجاح لمدة ${renewMonths} شهر.`);
      } else {
        if (!newPlanId) {
          toast.warning('يرجى اختيار الباقة الجديدة.');
          return;
        }
        if (central.active) {
          await centralPlatformClient.changeSubscriptionPlan(activeSub.tenantId, newPlanId, {
            months: renewMonths,
            seats: activeSub.seats,
            reason: 'تغيير باقة من لوحة الاشتراكات',
          });
        } else {
          platformAdminService.changeTenantPlan(activeSub.tenantId, newPlanId, {
            months: renewMonths,
            seats: activeSub.seats,
          });
        }
        toast.success('تم نقل العميل إلى الخطة الجديدة بنجاح.');
      }
      setActiveSub(null);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشلت العملية.');
    }
  };

  const handleCancelSub = async (sub: PlatformSubscription) => {
    if (!canManageSubscriptions) { toast.warning('لا تملك صلاحية إدارة الاشتراكات.'); return; }
    if (!confirm(`هل أنت متأكد من إلغاء اشتراك "${sub.tenantName || sub.tenantId}"؟ سيتم إبطال التراخيص والحساب المرتبط.`)) return;
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.warning('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      return;
    }
    try {
      if (central.active) {
        await centralPlatformClient.cancelSubscription(sub.tenantId, 'إلغاء يدوي من لوحة إدارة الاشتراكات المركزية');
      } else {
        platformAdminService.cancelTenantSubscription(sub.tenantId, 'إلغاء يدوي من لوحة إدارة الاشتراكات المركزية');
      }
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر إلغاء الاشتراك.');
    }
  };

  const exportSubscriptions = () => {
    if (!canManageSubscriptions) { toast.warning('لا تملك صلاحية إدارة الاشتراكات.'); return; }
    downloadCsv('platform-subscriptions.csv', [
      ['رقم الاشتراك', 'العميل', 'الباقة', 'الحالة', 'تاريخ البدء', 'تاريخ الانتهاء', 'القيمة', 'دورة الفوترة', 'التجديد التلقائي'],
      ...subscriptions.map((s) => [
        s.id,
        s.tenantName || s.tenantId,
        s.planName || s.planId,
        s.status,
        s.startDate,
        s.endDate || '—',
        s.price,
        CYCLE_LABELS[s.billingCycle] || s.billingCycle,
        s.autoRenew ? 'نعم' : 'لا',
      ]),
    ]);
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="إدارة الاشتراكات المركزية (Subscriptions Management)"
        description="واجهة مركزية مستقلة لعقود الاشتراك، التجديدات، الانتقال بين الباقات، والإلغاء الجماعي."
        icon={<CalendarClock className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            {canManageSubscriptions && (
              <Button
                size="sm"
                variant="secondary"
                onClick={exportSubscriptions}
                leadingIcon={<Download className="h-4 w-4" />}
              >
                تصدير CSV
              </Button>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        <div className="p-3 bg-danger/20 border border-danger/20 rounded-xl">
          <p className="text-[11px] font-semibold text-danger">ملغاة أو منتهية</p>
          <p className="text-xl font-black text-danger mt-1">
            {subscriptions.filter((s) => s.status === 'CANCELLED' || s.status === 'EXPIRED').length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-primary/60 p-3 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
      </div>

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
            <DataTable
              ariaLabel="الاشتراكات"
              rows={subscriptions}
              rowKey={(sub: any) => String(sub.id)}
              minWidth={950}
              dense
              tableClassName="text-xs"
              rowClassName={() => 'transition-colors hover:bg-primary/30'}
              columns={[
                {
                  key: 'tenant', header: 'العميل / المستأجر',
                  render: (sub: any) => (
                    <span className="block">
                      <span className="block font-bold text-muted">{sub.tenantName || 'عميل غير مسمى'}</span>
                      <span className="block font-mono text-[10px] text-muted">{sub.tenantId}</span>
                    </span>
                  ),
                },
                { key: 'plan', header: 'الباقة', render: (sub: any) => <span className="font-semibold text-muted">{sub.planName || 'باقة محذوفة'}</span> },
                {
                  key: 'status', header: 'الحالة',
                  render: (sub: any) => (
                    <span className={`inline-flex items-center gap-1 font-bold ${sub.status === 'ACTIVE' ? 'text-success' : sub.status === 'TRIAL' ? 'text-primary' : 'text-danger'}`}>
                      {sub.status === 'ACTIVE' ? 'نشط' : sub.status === 'TRIAL' ? 'تجريبي' : sub.status}
                    </span>
                  ),
                },
                {
                  key: 'price', header: 'القيمة والفوترة',
                  render: (sub: any) => (
                    <span className="block">
                      <span className="block font-bold text-muted">{formatMoney(sub.price)}</span>
                      <span className="block text-[10px] text-muted">{CYCLE_LABELS[sub.billingCycle as keyof typeof CYCLE_LABELS] || sub.billingCycle}</span>
                    </span>
                  ),
                },
                { key: 'start', header: 'البداية', render: (sub: any) => <span className="text-muted">{formatDate(sub.startDate)}</span> },
                {
                  key: 'end', header: 'نهاية الصلاحية',
                  render: (sub: any) => (
                    <span className={`font-semibold ${sub.endDate && new Date(sub.endDate) < new Date() ? 'font-bold text-danger' : 'text-muted'}`}>
                      {sub.endDate ? formatDate(sub.endDate) : 'مفتوح (مدى الحياة)'}
                    </span>
                  ),
                },
                { key: 'renew', header: 'التجديد التلقائي', render: (sub: any) => <span className={sub.autoRenew ? 'text-success' : 'text-muted'}>{sub.autoRenew ? 'مفعل' : 'معطل'}</span> },
                {
                  key: 'actions', header: 'إجراءات', align: 'center',
                  render: (sub: any) => (
                    <span className="flex items-center justify-center gap-2">
                      {canManageSubscriptions && (
                        <>
                          <button onClick={() => handleRenew(sub)} className="flex items-center gap-1 text-xs text-success hover:text-success" title="تجديد مدة الاشتراك">
                            <RotateCw className="h-3 w-3" />
                            تجديد
                          </button>
                          <button onClick={() => handleChangePlan(sub)} className="flex items-center gap-1 text-xs text-primary hover:text-primary" title="ترقية أو تخفيض الباقة">
                            <ArrowUpRight className="h-3 w-3" />
                            تغيير الباقة
                          </button>
                          {sub.status !== 'CANCELLED' && (
                            <button onClick={() => void handleCancelSub(sub)} className="text-xs text-danger hover:text-danger" title="إلغاء الاشتراك فوراً">
                              إلغاء
                            </button>
                          )}
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
                    {p.name} — {formatMoney(p.price)}
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

          <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
            <Button variant="secondary" size="sm" onClick={() => setActiveSub(null)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={() => void handleExecuteModal()} disabled={!canManageSubscriptions}>
              تأكيد العملية
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformSubscriptionsPage;
