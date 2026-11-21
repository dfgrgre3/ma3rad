import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge, EmptyState, formatMoney, formatDate, formatDateTime } from '../components/PlatformUI';
import {
  listPlanSubscribers,
  listPlanVersions,
  listPriceHistory,
  listUpgradeRules,
  type PlanSubscriber,
} from './planData';
import type {
  PlatformPlan,
  PlatformPlanVersion,
  PlatformPriceHistoryEntry,
  PlatformPlanUpgradeRule,
} from '../../../services/domains/platform/platformTypes';
import { useToast } from '../../../components/ui/Toast';
import { Link } from 'react-router-dom';
import { Users, History, GitBranch, Info, ArrowUpCircle } from 'lucide-react';

const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: 'شهري',
  QUARTERLY: 'ربع سنوي',
  YEARLY: 'سنوي',
  LIFETIME: 'مدى الحياة',
};

const SUB_STATUS_LABELS: Record<string, string> = {
  TRIAL: 'تجريبي',
  ACTIVE: 'نشط',
  PAST_DUE: 'متأخر',
  SUSPENDED: 'موقوف',
  CANCELLED: 'ملغي',
  EXPIRED: 'منتهي',
};

type TabKey = 'overview' | 'subscribers' | 'versions' | 'priceHistory' | 'rules';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'نظرة عامة', icon: <Info className="h-3.5 w-3.5" /> },
  { key: 'subscribers', label: 'المشتركون', icon: <Users className="h-3.5 w-3.5" /> },
  { key: 'versions', label: 'الإصدارات', icon: <History className="h-3.5 w-3.5" /> },
  { key: 'priceHistory', label: 'سجل الأسعار', icon: <ArrowUpCircle className="h-3.5 w-3.5" /> },
  { key: 'rules', label: 'قواعد الترقية', icon: <GitBranch className="h-3.5 w-3.5" /> },
];

interface Props {
  open: boolean;
  plan: PlatformPlan | null;
  plans: PlatformPlan[];
  onClose: () => void;
}

const InfoRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 border-b border-line py-1.5 last:border-0">
    <span className="text-[11px] font-semibold text-muted">{label}</span>
    <span className="text-left text-[11.5px] font-bold text-ink">{children}</span>
  </div>
);

export const PlanDetailModal: React.FC<Props> = ({ open, plan, plans, onClose }) => {
  const toast = useToast();
  const [tab, setTab] = React.useState<TabKey>('overview');
  const [loading, setLoading] = React.useState(false);
  const [subscribers, setSubscribers] = React.useState<PlanSubscriber[]>([]);
  const [versions, setVersions] = React.useState<PlatformPlanVersion[]>([]);
  const [priceHistory, setPriceHistory] = React.useState<PlatformPriceHistoryEntry[]>([]);
  const [rules, setRules] = React.useState<PlatformPlanUpgradeRule[]>([]);

  const planId = plan?.id ?? null;

  React.useEffect(() => {
    if (!open || !planId) return;
    setTab('overview');
    setSubscribers([]);
    setVersions([]);
    setPriceHistory([]);
    setRules([]);
  }, [open, planId]);

  React.useEffect(() => {
    if (!open || !planId || tab === 'overview') return;
    setLoading(true);
    const load = async () => {
      try {
        if (tab === 'subscribers') setSubscribers(await listPlanSubscribers(planId));
        else if (tab === 'versions') setVersions(await listPlanVersions(planId));
        else if (tab === 'priceHistory') setPriceHistory(await listPriceHistory(planId));
        else if (tab === 'rules') {
          const all = await listUpgradeRules();
          setRules(all.filter((r) => r.fromPlanId === planId || r.toPlanId === planId));
        }
      } catch (err) {
        toast.error('تعذر تحميل البيانات', err instanceof Error ? err.message : undefined);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [open, planId, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={plan ? `الخطة: ${plan.name}` : 'تفاصيل الخطة'}
      description={plan ? `${plan.code} — ${formatMoney(plan.price, plan.currency)} / ${CYCLE_LABELS[plan.billingCycle] ?? plan.billingCycle}` : undefined}
    >
      {plan && (
        <div>
          <div className="mb-4 flex flex-wrap gap-1.5 border-b border-line pb-2">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                  tab === item.key ? 'bg-primary text-white' : 'bg-surface-muted text-muted hover:text-ink'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>

          {loading && <p className="py-8 text-center text-[12px] font-semibold text-muted">جارٍ التحميل...</p>}

          {!loading && tab === 'overview' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-line p-3">
                <p className="mb-1 text-[12px] font-black text-ink">الأسعار والحدود</p>
                <InfoRow label="السعر">{formatMoney(plan.price, plan.currency)}</InfoRow>
                <InfoRow label="شهري / سنوي">{formatMoney(plan.monthlyPrice, plan.currency)} / {formatMoney(plan.yearlyPrice, plan.currency)}</InfoRow>
                <InfoRow label="دورة الفوترة">{CYCLE_LABELS[plan.billingCycle] ?? plan.billingCycle}</InfoRow>
                <InfoRow label="أيام التجربة">{plan.trialDays} يوم</InfoRow>
                <InfoRow label="فترة السماح offline">{plan.offlineGracePeriodDays} يوم</InfoRow>
                <InfoRow label="المشتركون">{plan.subscriberCount ?? 0}</InfoRow>
                <InfoRow label="الترتيب">{plan.sortOrder}</InfoRow>
                <InfoRow label="الإصدار الحالي">{plan.versioned ? `v${plan.currentVersion ?? 1} (مُصدَّرة)` : 'غير مُصدَّرة'}</InfoRow>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-line p-3">
                  <p className="mb-1 text-[12px] font-black text-ink">الحدود</p>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10.5px]">
                    <div className="rounded bg-surface-muted py-1.5"><p className="text-muted">مستخدمون</p><p className="font-bold text-ink">{plan.seatsLimit}</p></div>
                    <div className="rounded bg-surface-muted py-1.5"><p className="text-muted">فروع</p><p className="font-bold text-ink">{plan.branchesLimit}</p></div>
                    <div className="rounded bg-surface-muted py-1.5"><p className="text-muted">أجهزة</p><p className="font-bold text-ink">{plan.devicesLimit}</p></div>
                    <div className="rounded bg-surface-muted py-1.5"><p className="text-muted">تخزين MB</p><p className="font-bold text-ink">{plan.storageLimitMb}</p></div>
                    <div className="rounded bg-surface-muted py-1.5"><p className="text-muted">منتجات</p><p className="font-bold text-ink">{plan.maxProducts}</p></div>
                    <div className="rounded bg-surface-muted py-1.5"><p className="text-muted">مخازن</p><p className="font-bold text-ink">{plan.maxWarehouses}</p></div>
                  </div>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <p className="mb-1.5 text-[12px] font-black text-ink">الوحدات ({plan.includedModules.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {plan.includedModules.map((code) => (
                      <span key={code} className="rounded-full bg-success-soft px-2 py-0.5 text-[9.5px] font-semibold text-success">{code}</span>
                    ))}
                    {plan.includedModules.length === 0 && <span className="text-[10px] text-muted">—</span>}
                  </div>
                </div>
                {plan.features.length > 0 && (
                  <div className="rounded-xl border border-line p-3">
                    <p className="mb-1.5 text-[12px] font-black text-ink">المزايا</p>
                    <div className="flex flex-wrap gap-1">
                      {plan.features.map((f) => (
                        <span key={f} className="rounded-full bg-accent-soft px-2 py-0.5 text-[9.5px] font-semibold text-primary">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                {plan.permissions.length > 0 && (
                  <div className="rounded-xl border border-line p-3">
                    <p className="mb-1.5 text-[12px] font-black text-ink">الصلاحيات ({plan.permissions.length})</p>
                    <p className="font-mono text-[10px] leading-4 text-muted" dir="ltr">{plan.permissions.join(', ')}</p>
                  </div>
                )}
                {plan.description && (
                  <div className="rounded-xl border border-line p-3">
                    <p className="mb-1 text-[12px] font-black text-ink">الوصف</p>
                    <p className="text-[11.5px] leading-5 text-muted">{plan.description}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && tab === 'subscribers' && (
            subscribers.length === 0 ? (
              <EmptyState icon={<Users className="h-5 w-5" />} title="لا يوجد مشتركون" description="لا توجد اشتراكات نشطة أو سابقة على هذه الخطة." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-[11.5px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] font-bold text-muted">
                      <th className="px-2 py-1.5">العميل</th>
                      <th className="px-2 py-1.5">الحالة</th>
                      <th className="px-2 py-1.5">البداية</th>
                      <th className="px-2 py-1.5">الانتهاء</th>
                      <th className="px-2 py-1.5">مقاعد</th>
                      <th className="px-2 py-1.5">السعر</th>
                      <th className="px-2 py-1.5">تجديد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscribers.map((sub) => (
                      <tr key={sub.id} className="border-b border-line last:border-0">
                        <td className="px-2 py-2">
                          <Link to={`/platform/tenants/${sub.tenantId}`} className="font-bold text-primary hover:underline">
                            {sub.tenantName ?? sub.tenantId}
                          </Link>
                        </td>
                        <td className="px-2 py-2"><StatusBadge value={sub.status} label={SUB_STATUS_LABELS[sub.status] ?? sub.status} /></td>
                        <td className="px-2 py-2 text-muted">{formatDate(sub.startDate)}</td>
                        <td className="px-2 py-2 text-muted">{formatDate(sub.endDate)}</td>
                        <td className="px-2 py-2 font-bold">{sub.seats}</td>
                        <td className="px-2 py-2 font-bold">{formatMoney(sub.price, plan.currency)}</td>
                        <td className="px-2 py-2 text-muted">{sub.autoRenew ? 'تلقائي' : 'يدوي'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {!loading && tab === 'versions' && (
            versions.length === 0 ? (
              <EmptyState icon={<History className="h-5 w-5" />} title="لا توجد إصدارات" description="فعّل «إصدارات الأسعار» على الخطة ليتم تسجيل كل تعديل كإصدار." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-[11.5px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] font-bold text-muted">
                      <th className="px-2 py-1.5">الإصدار</th>
                      <th className="px-2 py-1.5">الاسم</th>
                      <th className="px-2 py-1.5">السعر</th>
                      <th className="px-2 py-1.5">مقاعد</th>
                      <th className="px-2 py-1.5">سريان</th>
                      <th className="px-2 py-1.5">الحالة</th>
                      <th className="px-2 py-1.5">ملاحظة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id} className="border-b border-line last:border-0">
                        <td className="px-2 py-2 font-black">v{v.version}</td>
                        <td className="px-2 py-2 font-bold">{v.name}</td>
                        <td className="px-2 py-2 font-bold">{formatMoney(v.price, v.currency)}</td>
                        <td className="px-2 py-2">{v.seatsLimit}</td>
                        <td className="px-2 py-2 text-muted">{formatDateTime(v.effectiveFrom)}</td>
                        <td className="px-2 py-2">
                          {v.isCurrent ? <span className="rounded-full bg-success-soft px-2 py-0.5 text-[9.5px] font-bold text-success">ساري</span> : <span className="text-[10px] text-muted">قديم</span>}
                        </td>
                        <td className="px-2 py-2 text-muted">{v.changeNote ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {!loading && tab === 'priceHistory' && (
            priceHistory.length === 0 ? (
              <EmptyState icon={<ArrowUpCircle className="h-5 w-5" />} title="لا يوجد سجل أسعار" description="يُسجَّل هنا كل تغيير في سعر الخطة." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-[11.5px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] font-bold text-muted">
                      <th className="px-2 py-1.5">التاريخ</th>
                      <th className="px-2 py-1.5">السعر القديم</th>
                      <th className="px-2 py-1.5">السعر الجديد</th>
                      <th className="px-2 py-1.5">بواسطة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.map((entry) => (
                      <tr key={entry.id} className="border-b border-line last:border-0">
                        <td className="px-2 py-2 text-muted">{formatDateTime(entry.changedAt)}</td>
                        <td className="px-2 py-2">{formatMoney(entry.oldPrice, plan.currency)}</td>
                        <td className="px-2 py-2 font-bold text-success">{formatMoney(entry.newPrice, plan.currency)}</td>
                        <td className="px-2 py-2 text-muted">{entry.changedBy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {!loading && tab === 'rules' && (
            rules.length === 0 ? (
              <EmptyState icon={<GitBranch className="h-5 w-5" />} title="لا توجد قواعد ترقية" description="عرّف قواعد الترقية/التخفيض من وإلى هذه الخطة من زر «قواعد الترقية» في أعلى الصفحة." />
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                    <div className="flex items-center gap-2 text-[11.5px] font-bold">
                      <span>{planName(rule.fromPlanId)}</span>
                      <span className="text-muted">←</span>
                      <span>{planName(rule.toPlanId)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10.5px]">
                      {rule.upgradeFeePercent ? <span className="rounded-full bg-warning-soft px-2 py-0.5 font-bold text-warning">رسوم {rule.upgradeFeePercent}%</span> : null}
                      {rule.requiresApproval && <span className="rounded-full bg-danger-soft px-2 py-0.5 font-bold text-danger">تتطلب موافقة</span>}
                      <StatusBadge value={rule.allowed ? 'ACTIVE' : 'CANCELLED'} label={rule.allowed ? 'مسموح' : 'ممنوع'} />
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </Modal>
  );
};

export default PlanDetailModal;
