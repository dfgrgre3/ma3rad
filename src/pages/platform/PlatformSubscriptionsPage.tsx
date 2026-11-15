import React, { useState, useEffect, useCallback } from 'react';
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

const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: 'شهري',
  QUARTERLY: 'ربع سنوي',
  YEARLY: 'سنوي',
  LIFETIME: 'مدى الحياة',
};

export const PlatformSubscriptionsPage: React.FC = () => {
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

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const subs = platformAdminService.listSubscriptions({
        status: statusFilter,
        planId: planFilter,
        search,
      });
      const plns = platformAdminService.listPlans();
      setSubscriptions(subs);
      setPlans(plns);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الاشتراكات.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, planFilter]);

  useEffect(() => {
    loadData();
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

  const handleExecuteModal = () => {
    if (!activeSub) return;
    if (!canManageSubscriptions) { alert('لا تملك صلاحية إدارة الاشتراكات.'); return; }
    try {
      if (actionType === 'RENEW') {
        platformAdminService.renewTenantSubscription(activeSub.tenantId, renewMonths);
        alert(`تم تجديد الاشتراك بنجاح لمدة ${renewMonths} شهر.`);
      } else {
        if (!newPlanId) {
          alert('يرجى اختيار الباقة الجديدة.');
          return;
        }
        platformAdminService.changeTenantPlan(activeSub.tenantId, newPlanId, {
          months: renewMonths,
          seats: activeSub.seats,
        });
        alert('تم نقل العميل إلى الخطة الجديدة بنجاح.');
      }
      setActiveSub(null);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشلت العملية.');
    }
  };

  const handleCancelSub = (sub: PlatformSubscription) => {
    if (!canManageSubscriptions) { alert('لا تملك صلاحية إدارة الاشتراكات.'); return; }
    if (!confirm(`هل أنت متأكد من إلغاء اشتراك "${sub.tenantName || sub.tenantId}"؟ سيتم إبطال التراخيص والحساب المرتبط.`)) return;
    try {
      platformAdminService.cancelTenantSubscription(sub.tenantId, 'إلغاء يدوي من لوحة إدارة الاشتراكات المركزية');
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر إلغاء الاشتراك.');
    }
  };

  const exportSubscriptions = () => {
    if (!canManageSubscriptions) { alert('لا تملك صلاحية إدارة الاشتراكات.'); return; }
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
              onClick={loadData}
              leadingIcon={<RefreshCw className="h-4 w-4" />}
            >
              تحديث البيانات
            </Button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
          <p className="text-[11px] font-semibold text-slate-400">إجمالي الاشتراكات</p>
          <p className="text-xl font-black text-slate-100 mt-1">{subscriptions.length}</p>
        </div>
        <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl">
          <p className="text-[11px] font-semibold text-emerald-400">الاشتراكات النشطة</p>
          <p className="text-xl font-black text-emerald-300 mt-1">
            {subscriptions.filter((s) => s.status === 'ACTIVE').length}
          </p>
        </div>
        <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl">
          <p className="text-[11px] font-semibold text-amber-400">الفترة التجريبية (Trial)</p>
          <p className="text-xl font-black text-amber-300 mt-1">
            {subscriptions.filter((s) => s.status === 'TRIAL').length}
          </p>
        </div>
        <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-xl">
          <p className="text-[11px] font-semibold text-rose-400">ملغاة أو منتهية</p>
          <p className="text-xl font-black text-rose-300 mt-1">
            {subscriptions.filter((s) => s.status === 'CANCELLED' || s.status === 'EXPIRED').length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
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
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-bold text-rose-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل الاشتراكات...</div>
        ) : subscriptions.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-6 w-6 text-slate-500" />}
            title="لا توجد اشتراكات مطابقة"
            description="غيّر عوامل التصفية أو أضف اشتراكات جديدة للعملاء."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-right text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                <tr>
                  <th className="px-4 py-3">العميل / المستأجر</th>
                  <th className="px-4 py-3">الباقة</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">القيمة والفوترة</th>
                  <th className="px-4 py-3">البداية</th>
                  <th className="px-4 py-3">نهاية الصلاحية</th>
                  <th className="px-4 py-3">التجديد التلقائي</th>
                  <th className="px-4 py-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-100">{sub.tenantName || 'عميل غير مسمى'}</div>
                      <div className="text-[10px] font-mono text-slate-500">{sub.tenantId}</div>
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-200">
                      {sub.planName || 'باقة محذوفة'}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`font-bold inline-flex items-center gap-1 ${
                          sub.status === 'ACTIVE'
                            ? 'text-emerald-400'
                            : sub.status === 'TRIAL'
                            ? 'text-sky-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {sub.status === 'ACTIVE' ? 'نشط' : sub.status === 'TRIAL' ? 'تجريبي' : sub.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-200">{formatMoney(sub.price)}</div>
                      <div className="text-[10px] text-slate-500">{CYCLE_LABELS[sub.billingCycle] || sub.billingCycle}</div>
                    </td>

                    <td className="px-4 py-3 text-slate-400">{formatDate(sub.startDate)}</td>

                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${
                          sub.endDate && new Date(sub.endDate) < new Date() ? 'text-rose-400 font-bold' : 'text-slate-300'
                        }`}
                      >
                        {sub.endDate ? formatDate(sub.endDate) : 'مفتوح (مدى الحياة)'}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span className={sub.autoRenew ? 'text-emerald-400' : 'text-slate-500'}>
                        {sub.autoRenew ? 'مفعل' : 'معطل'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {canManageSubscriptions && (
                          <>
                            <button
                              onClick={() => handleRenew(sub)}
                              className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1"
                              title="تجديد مدة الاشتراك"
                            >
                              <RotateCw className="h-3 w-3" />
                              تجديد
                            </button>

                            <button
                              onClick={() => handleChangePlan(sub)}
                              className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1"
                              title="ترقية أو تخفيض الباقة"
                            >
                              <ArrowUpRight className="h-3 w-3" />
                              تغيير الباقة
                            </button>

                            {sub.status !== 'CANCELLED' && (
                              <button
                                onClick={() => handleCancelSub(sub)}
                                className="text-rose-400 hover:text-rose-300 text-xs"
                                title="إلغاء الاشتراك فوراً"
                              >
                                إلغاء
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">اختر الباقة الجديدة *</label>
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
            <label className="block text-xs font-semibold text-slate-300 mb-1">
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

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setActiveSub(null)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleExecuteModal} disabled={!canManageSubscriptions}>
              تأكيد العملية
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformSubscriptionsPage;
