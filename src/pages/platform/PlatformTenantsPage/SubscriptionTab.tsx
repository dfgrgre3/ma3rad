import React from 'react';
import { CalendarClock, CheckCircle2, Layers3, RefreshCw } from 'lucide-react';
import type { PlatformPlan, PlatformTenant, PlatformTenantProfile } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState, Field, StatusBadge, formatDate, formatMoney, formatNumber, inputClass } from '../components/PlatformUI';
import { CYCLE_LABELS } from './constants';
import { ArrowRightIcon, SectionCard } from './shared';

interface SubscriptionTabProps {
  tenant: PlatformTenant;
  profile: PlatformTenantProfile;
  plans: PlatformPlan[];
  renewMonths: number;
  setRenewMonths: React.Dispatch<React.SetStateAction<number>>;
  renewSubscription: () => void;
  working: boolean;
  canManageTenants: boolean;
  planForm: { planId: string; months: number; seats: number };
  setPlanForm: React.Dispatch<React.SetStateAction<{ planId: string; months: number; seats: number }>>;
  changePlan: () => void;
}

export const SubscriptionTab: React.FC<SubscriptionTabProps> = ({
  tenant,
  profile,
  plans,
  renewMonths,
  setRenewMonths,
  renewSubscription,
  working,
  canManageTenants,
  planForm,
  setPlanForm,
  changePlan,
}) => (
              <div className="space-y-3">
                <div className="grid gap-3 xl:grid-cols-2">
                  <SectionCard title="تجديد الاشتراك" subtitle="يمدد الباقة والتراخيص من تاريخ الانتهاء الحالي" icon={<RefreshCw className="h-4 w-4" />}>
                    <div className="grid gap-2 p-3 sm:grid-cols-2">
                      <Field label="مدة التجديد (أشهر)">
                        <input type="number" min={1} className={inputClass} value={renewMonths} onChange={(event) => setRenewMonths(Math.max(1, Number(event.target.value)))} />
                      </Field>
                      <div className="flex items-end">
                        <Button variant="success" block leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={renewSubscription} loading={working} disabled={!canManageTenants}>
                          تجديد الاشتراك
                        </Button>
                      </div>
                      <p className="text-[10.5px] text-muted sm:col-span-2">
                        تاريخ الانتهاء الحالي: <b>{formatDate(tenant.subscriptionExpiresAt)}</b>
                      </p>
                    </div>
                  </SectionCard>

                  <SectionCard title="تغيير / نقل الباقة" subtitle="إلغاء الباقة الحالية وإصدار ترخيص بالباقة الجديدة" icon={<Layers3 className="h-4 w-4" />}>
                    <div className="grid gap-2 p-3 sm:grid-cols-2">
                      <Field label="الباقة الجديدة" className="sm:col-span-2">
                        <select className={inputClass} value={planForm.planId} onChange={(event) => setPlanForm({ ...planForm, planId: event.target.value })}>
                          <option value="">اختر الباقة</option>
                          {plans.filter((plan) => plan.isActive).map((plan) => (
                            <option key={plan.id} value={plan.id}>{plan.name} — {formatMoney(plan.price, plan.currency)} / {CYCLE_LABELS[plan.billingCycle]}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="المدة (أشهر)">
                        <input type="number" min={1} className={inputClass} value={planForm.months} onChange={(event) => setPlanForm({ ...planForm, months: Math.max(1, Number(event.target.value)) })} />
                      </Field>
                      <Field label="عدد المستخدمين">
                        <input type="number" min={1} className={inputClass} value={planForm.seats} onChange={(event) => setPlanForm({ ...planForm, seats: Math.max(1, Number(event.target.value)) })} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Button variant="primary" block leadingIcon={<ArrowRightIcon />} onClick={changePlan} loading={working} disabled={!planForm.planId || !canManageTenants}>
                          نقل العميل إلى الباقة الجديدة
                        </Button>
                      </div>
                      <p className="text-[10.5px] text-warning sm:col-span-2">
                        سيتم إلغاء التراخيص والاشتراكات الحالية واستبدالها بترخيص جديد بالباقة المختارة.
                      </p>
                    </div>
                  </SectionCard>
                </div>

                <SectionCard title="سجل الاشتراكات" subtitle={`${profile.subscriptions.length} اشتراك مسجل`} icon={<CalendarClock className="h-4 w-4" />}>
                  {profile.subscriptions.length === 0 ? (
                    <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="لا توجد اشتراكات مسجلة" />
                  ) : (
                                        <DataTable
                      ariaLabel="سجل الاشتراكات"
                      rows={profile.subscriptions}
                      rowKey={(item) => item.id}
                      minWidth={720}
                      dense
                      columns={[
                        { key: 'plan', header: 'الباقة', render: (item) => <span className="text-[11px] font-semibold text-ink">{item.planName || '—'}</span> },
                        { key: 'status', header: 'الحالة', render: (item) => <StatusBadge value={item.status} label={item.status} /> },
                        { key: 'start', header: 'البداية', render: (item) => <span className="text-[10.5px]">{formatDate(item.startDate)}</span> },
                        { key: 'end', header: 'النهاية', render: (item) => <span className="text-[10.5px]">{formatDate(item.endDate)}</span> },
                        { key: 'seats', header: 'المستخدمون', render: (item) => <span className="text-[10.5px]">{formatNumber(item.seats)}</span> },
                        { key: 'price', header: 'السعر', render: (item) => <span className="text-[10.5px] font-bold">{formatMoney(item.price)}</span> },
                        { key: 'cycle', header: 'الدورة', render: (item) => <span className="text-[10.5px]">{CYCLE_LABELS[item.billingCycle] || item.billingCycle}</span> },
                      ]}
                    />
                  )}
                </SectionCard>
              </div>
);
