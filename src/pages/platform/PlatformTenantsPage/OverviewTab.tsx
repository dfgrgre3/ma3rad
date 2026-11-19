import React from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Copy,
  KeyRound,
  Layers3,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { PLATFORM_TENANT_STATUS_LABELS } from '../../../services/domains/platform/PlatformAdminService';
import type {
  PlatformTenant,
  PlatformTenantOverride,
  PlatformTenantOverrideInput,
  PlatformTenantProfile,
} from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import { Field, StatusBadge, formatDate, formatDateTime, formatMoney, formatNumber, inputClass } from '../components/PlatformUI';
import { ACCOUNT_STATUS, CYCLE_LABELS } from './constants';
import { InfoItem, SectionCard } from './shared';

interface OverviewTabProps {
  tenant: PlatformTenant;
  profile: PlatformTenantProfile;
  account: any;
  subscription: any;
  centralActive: boolean;
  branches: any[];
  canManageTenants: boolean;
  working: boolean;
  setBranchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  closeBranch: (branchId: string) => void;
  healthChecks: Array<{ label: string; ok: boolean }>;
  healthScore: number;
  sendActivation: () => void;
  copyToClipboard: (text: string, label: string) => Promise<void>;
  setAccountOpen: React.Dispatch<React.SetStateAction<boolean>>;
  overrides: PlatformTenantOverride[];
  overrideForm: PlatformTenantOverrideInput;
  setOverrideForm: React.Dispatch<React.SetStateAction<PlatformTenantOverrideInput>>;
  addOverride: () => void;
  removeOverride: (id: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  tenant,
  profile,
  account,
  subscription,
  centralActive,
  branches,
  canManageTenants,
  working,
  setBranchOpen,
  closeBranch,
  healthChecks,
  healthScore,
  sendActivation,
  copyToClipboard,
  setAccountOpen,
  overrides,
  overrideForm,
  setOverrideForm,
  addOverride,
  removeOverride,
}) => (
              <div className="space-y-3">
                <SectionCard title="بيانات العميل" subtitle="الملف المركزي للشركة والمسؤول والعنوان" icon={<Building2 className="h-4 w-4" />}>
                  <dl className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    <InfoItem label="اسم الشركة" value={tenant.name} />
                    <InfoItem label="النشاط التجاري" value={tenant.businessType} />
                    <InfoItem label="رقم العميل" value={tenant.code} ltr />
                    <InfoItem label="Tenant ID" value={<span dir="ltr" className="font-mono text-[10.5px]">{tenant.id}</span>} />
                    <InfoItem label="اسم المسؤول" value={tenant.contactName} />
                    <InfoItem label="تاريخ التسجيل" value={formatDate(tenant.createdAt)} />
                    <InfoItem label="الهاتف" value={<span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 text-slate-400" />{tenant.phone || '—'}</span>} ltr />
                    <InfoItem label="البريد الإلكتروني" value={<span className="inline-flex items-center gap-1"><Mail className="h-3 w-3 text-slate-400" />{tenant.email || '—'}</span>} ltr />
                    <InfoItem label="العنوان" value={<span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400" />{[tenant.country, tenant.city, tenant.address].filter(Boolean).join('، ') || '—'}</span>} />
                    {tenant.notes && <div className="sm:col-span-2 xl:col-span-3"><InfoItem label="ملاحظات" value={tenant.notes} /></div>}
                  </dl>
                </SectionCard>

                <div className="grid gap-3 xl:grid-cols-2">
                  <SectionCard title="الاشتراك الحالي" subtitle="الباقة والتواريخ وحالة الاشتراك" icon={<CalendarClock className="h-4 w-4" />}>
                    <dl className="grid gap-2 p-3 sm:grid-cols-2">
                      <InfoItem label="الباقة الحالية" value={tenant.planName || 'بدون باقة'} />
                      <InfoItem label="سعر الباقة" value={profile.plan ? formatMoney(profile.plan.price, profile.plan.currency) : '—'} />
                      <InfoItem label="حالة الاشتراك" value={<StatusBadge value={tenant.status} label={PLATFORM_TENANT_STATUS_LABELS[tenant.status]} />} />
                      <InfoItem label="دورة الفوترة" value={subscription ? CYCLE_LABELS[subscription.billingCycle] : profile.plan ? CYCLE_LABELS[profile.plan.billingCycle] : '—'} />
                      <InfoItem label="بداية الاشتراك" value={formatDate(tenant.subscriptionStartedAt)} />
                      <InfoItem label="نهاية الاشتراك" value={formatDate(tenant.subscriptionExpiresAt)} />
                      <InfoItem label="المستخدمون المسموحون" value={formatNumber(tenant.seatsLimit)} />
                      <InfoItem label="التجديد التلقائي" value={subscription ? (subscription.autoRenew ? 'مفعّل' : 'معطّل') : '—'} />
                    </dl>
                  </SectionCard>

                  <SectionCard title="حدود الاستخدام" subtitle="الأجهزة والفروع والوحدات المفعّلة" icon={<Smartphone className="h-4 w-4" />}>
                    <div className="grid gap-2 p-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500"><Smartphone className="h-3 w-3" /> الأجهزة</p>
                        <p className="mt-1 text-lg font-black text-slate-800">
                          {formatNumber(profile.usage.devicesUsed)} <span className="text-[11px] font-semibold text-slate-400">/ {formatNumber(profile.usage.devicesLimit)}</span>
                        </p>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${profile.usage.devicesUsed >= profile.usage.devicesLimit ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, profile.usage.devicesLimit ? (profile.usage.devicesUsed / profile.usage.devicesLimit) * 100 : 0)}%` }}
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500"><Layers3 className="h-3 w-3" /> الفروع المسموحة</p>
                        <p className="mt-1 text-lg font-black text-slate-800">
                          {formatNumber(profile.usage.branchesUsed)} <span className="text-[11px] font-semibold text-slate-400">/ {formatNumber(profile.usage.branchesLimit)}</span>
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">فروع مستخدمة / المسموح</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
                        <p className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500"><KeyRound className="h-3 w-3" /> التراخيص والوحدات</p>
                        <p className="mt-1 text-[12px] font-bold text-slate-800">
                          {formatNumber(profile.licenses.length)} ترخيص · {formatNumber(profile.usage.modulesCount)} وحدة مفعّلة
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {tenant.activeLicenses ? `${formatNumber(tenant.activeLicenses)} ترخيص ساري` : 'لا يوجد ترخيص ساري'}
                        </p>
                      </div>
                    </div>
                  </SectionCard>
                </div>

                {centralActive && (
                  <SectionCard
                    title="فروع العميل"
                    subtitle={`${formatNumber(branches.filter((b) => b.status !== 'CLOSED').length)} من ${formatNumber(profile.usage.branchesLimit)} فرعاً مسموحاً`}
                    icon={<Layers3 className="h-4 w-4" />}
                    action={canManageTenants && (
                      <Button size="sm" variant="secondary" onClick={() => setBranchOpen(true)}>
                        <Plus className="h-3.5 w-3.5" /> إضافة فرع
                      </Button>
                    )}
                  >
                    {branches.length === 0 ? (
                      <p className="p-3 text-[11.5px] text-slate-500">لا توجد فروع مسجلة لهذا العميل.</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {branches.map((b) => (
                          <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="text-[12px] font-bold text-slate-800">
                                {b.name}
                                {b.isMain && <span className="mr-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-black text-indigo-700">رئيسي</span>}
                                {b.status === 'SUSPENDED' && <span className="mr-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">موقوف</span>}
                                {b.status === 'CLOSED' && <span className="mr-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-black text-slate-600">مغلق</span>}
                              </p>
                              <p className="text-[10.5px] text-slate-500 font-mono">
                                {b.code}{b.city ? ` · ${b.city}` : ''} · {b.seatsLimit} مقعد / {b.devicesLimit} جهاز
                              </p>
                            </div>
                            {canManageTenants && b.status !== 'CLOSED' && !b.isMain && (
                              <Button size="sm" variant="ghost" onClick={() => closeBranch(b.id)}>
                                إغلاق
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                )}

                <SectionCard title="صحة العميل" subtitle={`تقييم ${healthScore}% — ${healthChecks.filter((item) => item.ok).length} من ${healthChecks.length} فحوصات ناجحة`} icon={<ShieldCheck className="h-4 w-4" />}>
                  <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    {healthChecks.map((check) => (
                      <div
                        key={check.label}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-semibold ${
                          check.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'
                        }`}
                      >
                        {check.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                        {check.label}
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="حساب الدخول" subtitle="بيانات الحساب الذي يستخدمه العميل للدخول" icon={<LockKeyhole className="h-4 w-4" />}>
                  {account ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <InfoItem label="اسم المستخدم" value={account.username} ltr />
                        <InfoItem label="الاسم الكامل" value={account.fullName} />
                        <InfoItem label="البريد" value={account.email} ltr />
                        <InfoItem label="حالة الحساب" value={ACCOUNT_STATUS(account.isActive)} />
                        <InfoItem label="كود التفعيل" value={account.activationCode || '—'} ltr />
                        <InfoItem label="آخر تفعيل" value={formatDateTime(account.lastActivatedAt)} />
                        <InfoItem label="آخر دخول" value={formatDateTime(account.lastLoginAt)} />
                        <InfoItem label="تاريخ الإنشاء" value={formatDate(account.createdAt)} />
                      </div>
                      <div className="flex flex-col gap-2">
                        {canManageTenants && (
                          <Button variant="secondary" size="sm" leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={sendActivation} loading={working}>
                            تجهيز بيانات التفعيل
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" leadingIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => copyToClipboard(account.username, 'اسم المستخدم')}>
                          نسخ اسم المستخدم
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <p className="text-[11.5px] text-slate-500">لا يوجد حساب دخول لهذا العميل بعد. أنشئ حساباً لتوليد بيانات التفعيل.</p>
                      {canManageTenants && (
                        <Button variant="primary" size="sm" leadingIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setAccountOpen(true)}>
                          إنشاء حساب
                        </Button>
                      )}
                    </div>
                  )}
                </SectionCard>
                <SectionCard title="مزايا وحدود خاصة (Overrides)" subtitle="إضافة مزايا أو حدود لعميل معين دون تغيير باقته الأساسية" icon={<Layers3 className="h-4 w-4" />}>
                  <div className="space-y-3 p-3">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <Field label="النوع">
                        <select className={inputClass} value={overrideForm.kind} onChange={(event) => setOverrideForm({ ...overrideForm, kind: event.target.value as PlatformTenantOverrideInput['kind'] })}>
                          <option value="MODULE">وحدة</option>
                          <option value="FEATURE">ميزة</option>
                          <option value="LIMIT">حد</option>
                          <option value="PERMISSION">صلاحية</option>
                        </select>
                      </Field>
                      <Field label="الرمز">
                        <input className={inputClass} dir="ltr" value={overrideForm.code} onChange={(event) => setOverrideForm({ ...overrideForm, code: event.target.value })} placeholder="reports / max_products" />
                      </Field>
                      <Field label="القيمة">
                        <input className={inputClass} value={overrideForm.value ?? ''} onChange={(event) => setOverrideForm({ ...overrideForm, value: event.target.value })} placeholder="true / 5000" />
                      </Field>
                      <div className="flex items-end">
                        <Button variant="primary" size="sm" block leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={addOverride} loading={working} disabled={!canManageTenants}>
                          إضافة
                        </Button>
                      </div>
                    </div>
                    {overrides.length === 0 ? (
                      <p className="text-[11px] text-slate-500">لا توجد مزايا أو حدود خاصة لهذا العميل.</p>
                    ) : (
                                            <DataTable
                        ariaLabel="المزايا والحدود الخاصة"
                        rows={overrides}
                        rowKey={(item) => item.id}
                        minWidth={520}
                        dense
                        columns={[
                          { key: 'kind', header: 'النوع', render: (item) => <span className="text-[10.5px] font-semibold text-slate-700">{item.kind}</span> },
                          { key: 'code', header: 'الرمز', render: (item) => <span className="font-mono text-[10.5px]" dir="ltr">{item.code}</span> },
                          { key: 'value', header: 'القيمة', render: (item) => <span className="text-[10.5px]">{item.value || (item.isEnabled ? 'مفعّل' : 'معطّل')}</span> },
                          { key: 'status', header: 'الحالة', render: (item) => <StatusBadge value={item.isEnabled ? 'ACTIVE' : 'CANCELLED'} label={item.isEnabled ? 'مفعّل' : 'معطّل'} /> },
                          {
                            key: 'action', header: 'إجراء',
                            render: (item) => (
                              <button type="button" disabled={!canManageTenants} onClick={() => removeOverride(item.id)} className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="حذف">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ),
                          },
                        ]}
                      />
                    )}
                  </div>
                </SectionCard>
              </div>
);
