import React from 'react';
import { CreditCard, ScrollText, Wallet } from 'lucide-react';
import type { PlatformTenant, PlatformTenantProfile } from '../../../services/domains/platform/platformTypes';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState, StatusBadge, formatDate, formatDateTime, formatMoney, formatNumber } from '../components/PlatformUI';
import { SectionCard } from './shared';

interface BillingTabProps {
  profile: PlatformTenantProfile;
  tenant: PlatformTenant;
}

export const BillingTab: React.FC<BillingTabProps> = ({ profile, tenant }) => (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-success-border bg-success-soft p-3">
                    <p className="flex items-center gap-1 text-[10.5px] font-semibold text-success"><Wallet className="h-3 w-3" /> إجمالي المدفوعات</p>
                    <p className="mt-1 text-lg font-black text-success">
                      {formatMoney(profile.payments.reduce((sum, payment) => sum + payment.amount, 0))}
                    </p>
                  </div>
                  <div className="rounded-xl border border-danger-border bg-danger-soft p-3">
                    <p className="flex items-center gap-1 text-[10.5px] font-semibold text-danger"><CreditCard className="h-3 w-3" /> مستحقات غير محصلة</p>
                    <p className="mt-1 text-lg font-black text-danger">{formatMoney(tenant.outstanding ?? 0)}</p>
                  </div>
                  <div className="rounded-xl border border-line bg-surface-muted p-3">
                    <p className="flex items-center gap-1 text-[10.5px] font-semibold text-ink-secondary"><ScrollText className="h-3 w-3" /> عدد الفواتير</p>
                    <p className="mt-1 text-lg font-black text-ink">{formatNumber(profile.invoices.length)}</p>
                  </div>
                </div>

                <SectionCard title="سجل المدفوعات" subtitle={`${profile.payments.length} دفعة مسجلة`} icon={<Wallet className="h-4 w-4" />}>
                  {profile.payments.length === 0 ? (
                    <EmptyState icon={<Wallet className="h-5 w-5" />} title="لا توجد مدفوعات مسجلة" />
                  ) : (
                                        <DataTable
                      ariaLabel="سجل المدفوعات"
                      rows={profile.payments}
                      rowKey={(item) => item.id}
                      minWidth={600}
                      dense
                      columns={[
                        { key: 'date', header: 'التاريخ', render: (payment) => <span className="text-[10.5px]">{formatDateTime(payment.paidAt)}</span> },
                        { key: 'invoice', header: 'الفاتورة', render: (payment) => <span className="font-mono text-[10.5px]" dir="ltr">{payment.invoiceNumber || '—'}</span> },
                        { key: 'amount', header: 'المبلغ', render: (payment) => <span className="text-[11px] font-bold text-success">{formatMoney(payment.amount)}</span> },
                        { key: 'method', header: 'الطريقة', render: (payment) => <span className="text-[10.5px]">{payment.method}</span> },
                        { key: 'ref', header: 'المرجع', render: (payment) => <span className="text-[10.5px]" dir="ltr">{payment.reference || '—'}</span> },
                      ]}
                    />
                  )}
                </SectionCard>

                <SectionCard title="فواتير العميل" subtitle={`${profile.invoices.length} فاتورة`} icon={<CreditCard className="h-4 w-4" />}>
                  {profile.invoices.length === 0 ? (
                    <EmptyState icon={<CreditCard className="h-5 w-5" />} title="لا توجد فواتير بعد" />
                  ) : (
                                        <DataTable
                      ariaLabel="فواتير العميل"
                      rows={profile.invoices}
                      rowKey={(item) => item.id}
                      minWidth={640}
                      dense
                      columns={[
                        { key: 'number', header: 'الرقم', render: (invoice) => <span className="font-mono text-[10.5px]" dir="ltr">{invoice.number}</span> },
                        { key: 'issue', header: 'الإصدار', render: (invoice) => <span className="text-[10.5px]">{formatDate(invoice.issueDate)}</span> },
                        { key: 'due', header: 'الاستحقاق', render: (invoice) => <span className="text-[10.5px]">{formatDate(invoice.dueDate)}</span> },
                        { key: 'total', header: 'الإجمالي', render: (invoice) => <span className="text-[10.5px] font-bold">{formatMoney(invoice.total)}</span> },
                        { key: 'paid', header: 'المدفوع', render: (invoice) => <span className="text-[10.5px]">{formatMoney(invoice.paidAmount)}</span> },
                        { key: 'status', header: 'الحالة', render: (invoice) => <StatusBadge value={invoice.status} label={invoice.status} /> },
                      ]}
                    />
                  )}
                </SectionCard>
              </div>
);
