import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { DataTable } from '../../../components/ui/DataTable';
import {
  FileText,
  History,
  Loader2,
} from 'lucide-react';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  StatusBadge,
} from '../components/PlatformUI';
import { getSubscriptionHistory, listTenantInvoices } from './subscriptionData';
import type { CentralSubscriptionChangeRow } from '../../../services/domains/platform/PlatformAdminApiClient/centralTypes';
import type {
  PlatformInvoice,
  PlatformSubscription,
} from '../../../services/domains/platform/platformTypes';

const CHANGE_TYPE_LABELS: Record<string, string> = {
  CREATE: 'إنشاء',
  RENEW: 'تجديد',
  SUSPEND: 'إيقاف/تفعيل',
  CANCEL: 'إلغاء',
  EXPIRE: 'انتهاء',
  PLAN_CHANGE: 'تغيير باقة',
  LIMIT_CHANGE: 'تغيير حدود',
  SEATS_CHANGE: 'تغيير مقاعد',
  BRANCHES_CHANGE: 'تغيير فروع',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  SENT: 'مرسلة',
  PARTIAL: 'مدفوعة جزئياً',
  PAID: 'مدفوعة',
  OVERDUE: 'متأخرة',
  VOID: 'ملغاة',
};

interface Props {
  subscription: PlatformSubscription | null;
  onClose: () => void;
}

function summarizeValues(raw: unknown): string {
  if (raw == null) return '—';
  if (typeof raw === 'string') return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join('، ');
    }
    return JSON.stringify(parsed);
  } catch {
    return String(raw);
  }
}

export const SubscriptionDetailModal: React.FC<Props> = ({ subscription, onClose }) => {
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [history, setHistory] = useState<CentralSubscriptionChangeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subscription) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInvoices([]);
    setHistory([]);
    Promise.all([
      listTenantInvoices(subscription.tenantId).catch(() => [] as PlatformInvoice[]),
      getSubscriptionHistory(subscription.tenantId, 50).catch(() => [] as CentralSubscriptionChangeRow[]),
    ])
      .then(([inv, hist]) => {
        if (cancelled) return;
        setInvoices(inv);
        setHistory(hist);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر تحميل التفاصيل.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [subscription]);

  const tenantLabel = subscription?.tenantName || subscription?.tenantId || '';

  return (
    <Modal
      open={Boolean(subscription)}
      onClose={onClose}
      size="xl"
      title={`تفاصيل الاشتراك: ${tenantLabel}`}
    >
      {!subscription ? null : (
        <div className="space-y-4 text-right">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg border border-line-strong bg-surface-sunken p-2.5">
              <p className="text-[10.5px] text-muted">الباقة</p>
              <p className="font-bold text-ink">{subscription.planName || subscription.planId}</p>
            </div>
            <div className="rounded-lg border border-line-strong bg-surface-sunken p-2.5">
              <p className="text-[10.5px] text-muted">الحالة</p>
              <StatusBadge value={subscription.status} />
            </div>
            <div className="rounded-lg border border-line-strong bg-surface-sunken p-2.5">
              <p className="text-[10.5px] text-muted">القيمة</p>
              <p className="font-bold text-ink">{formatMoney(subscription.price)}</p>
            </div>
            <div className="rounded-lg border border-line-strong bg-surface-sunken p-2.5">
              <p className="text-[10.5px] text-muted">المقاعد / الفروع</p>
              <p className="font-bold text-ink">{subscription.seats} / {subscription.branchesLimit}</p>
            </div>
            <div className="rounded-lg border border-line-strong bg-surface-sunken p-2.5">
              <p className="text-[10.5px] text-muted">البداية</p>
              <p className="font-bold text-ink">{formatDate(subscription.startDate)}</p>
            </div>
            <div className="rounded-lg border border-line-strong bg-surface-sunken p-2.5">
              <p className="text-[10.5px] text-muted">نهاية الصلاحية</p>
              <p className="font-bold text-ink">{subscription.endDate ? formatDate(subscription.endDate) : 'مفتوح'}</p>
            </div>
            <div className="rounded-lg border border-line-strong bg-surface-sunken p-2.5">
              <p className="text-[10.5px] text-muted">التجديد التلقائي</p>
              <p className="font-bold text-ink">{subscription.autoRenew ? 'مفعل' : 'معطل'}</p>
            </div>
            <div className="rounded-lg border border-line-strong bg-surface-sunken p-2.5">
              <p className="text-[10.5px] text-muted">آخر تحديث</p>
              <p className="font-bold text-ink">{formatDateTime(subscription.updatedAt)}</p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-xs font-bold text-danger">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ تحميل التفاصيل...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Invoices */}
              <div className="rounded-xl border border-line-strong overflow-hidden">
                <div className="flex items-center gap-2 border-b border-line-strong bg-surface-sunken px-3 py-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-bold text-ink">الفواتير ({invoices.length})</h3>
                </div>
                {invoices.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[11px] text-muted">لا توجد فواتير لهذا العميل.</p>
                ) : (
                  <DataTable<PlatformInvoice>
                    ariaLabel="فواتير العميل"
                    rows={invoices.slice(0, 8)}
                    rowKey={(inv) => String(inv.id)}
                    dense
                    tableClassName="text-[11px]"
                    columns={[
                      { key: 'number', header: 'الفاتورة', render: (inv) => <span className="font-mono font-bold">{inv.number}</span> },
                      { key: 'total', header: 'الإجمالي', render: (inv) => formatMoney(inv.total, inv.currency) },
                      {
                        key: 'status', header: 'الحالة',
                        render: (inv) => <StatusBadge value={inv.status} label={INVOICE_STATUS_LABELS[inv.status] ?? inv.status} />,
                      },
                      { key: 'due', header: 'الاستحقاق', render: (inv) => <span className="text-muted">{formatDate(inv.dueDate)}</span> },
                    ]}
                  />
                )}
              </div>

              {/* History */}
              <div className="rounded-xl border border-line-strong overflow-hidden">
                <div className="flex items-center gap-2 border-b border-line-strong bg-surface-sunken px-3 py-2">
                  <History className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-bold text-ink">سجل التغييرات ({history.length})</h3>
                </div>
                {history.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[11px] text-muted">لا يوجد سجل تغييرات بعد.</p>
                ) : (
                  <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                    {history.map((row) => (
                      <li key={String(row.id)} className="px-3 py-2 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-ink">
                            {row.changeTypeLabel ?? CHANGE_TYPE_LABELS[String(row.change_type)] ?? String(row.change_type)}
                          </span>
                          <span className="text-[10px] text-muted">{formatDateTime(String(row.created_at ?? ''))}</span>
                        </div>
                        <p className="mt-0.5 text-[10.5px] text-muted">
                          {row.actorName ? `بواسطة ${row.actorName} — ` : ''}
                          {row.reason ? `${row.reason} — ` : ''}
                          {summarizeValues(row.new_values ?? row.old_values)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default SubscriptionDetailModal;
