import React, { useState } from 'react';
import { Ban, ShieldOff, Plus, AlertTriangle, Copy } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import { formatDateTime } from '../components/PlatformUI';

export interface PlatformIpBan {
  id: string;
  ip_address: string;
  reason: string | null;
  is_active: number;
  expires_at: string | null;
  banned_by_name: string | null;
  lifted_at: string | null;
  created_at: string;
}

interface IpBansTabProps {
  bans: PlatformIpBan[];
  canManageSecurity: boolean;
  isCentral: boolean;
  onBan: (input: { ipAddress: string; reason?: string; expiresAt?: string }) => Promise<void>;
  onLift: (id: string) => void;
}

const isBanActive = (ban: PlatformIpBan) =>
  ban.is_active === 1 && (!ban.expires_at || new Date(ban.expires_at).getTime() > Date.now());

const formatRemaining = (expiresAt: string): string => {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'منتهي';
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `متبقٍ ${days} يوم و${hours % 24} ساعة`;
  if (hours > 0) return `متبقٍ ${hours} ساعة`;
  return `متبقٍ ${Math.max(1, Math.floor(ms / 60_000))} دقيقة`;
};

const copyText = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Clipboard may be unavailable (non-secure context) — silently ignore.
  }
};

export const IpBansTab: React.FC<IpBansTabProps> = ({ bans, canManageSecurity, isCentral, onBan, onLift }) => {
  const [ipAddress, setIpAddress] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isCentral) {
    return (
      <div className="rounded-xl border border-warning/60 bg-warning/30 p-5 text-warning">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <span className="text-sm font-bold">حظر IP متاح فقط في الوضع المركزي</span>
        </div>
        <p className="mt-2 text-xs text-warning/80">
          حظر عناوين IP يتم على مستوى السيرفر المركزي ويقطع الجهاز بالكامل عن المنصة. فعّله من إعدادات الاتصال بالسيرفر المركزي.
        </p>
      </div>
    );
  }

  const handleBan = async () => {
    const target = ipAddress.trim();
    if (!target) return;
    setSubmitting(true);
    try {
      await onBan({
        ipAddress: target,
        reason: reason.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      setIpAddress('');
      setReason('');
      setExpiresAt('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
        <header className="mb-3 border-b border-line-strong pb-2.5">
          <h3 className="text-xs font-bold text-muted flex items-center gap-2">
            <Ban className="h-4 w-4 text-danger" />
            حظر عنوان IP — يقطع الجهاز بالكامل عن المنصة
          </h3>
          <p className="text-[11px] text-muted">
            يتم رفض كل طلبات API القادمة من العنوان المحظور. يمكن إدخال عنوان واحد أو نطاق IPv4 CIDR، ورفع الحظر في أي وقت.
          </p>
        </header>

        {canManageSecurity && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] items-end">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-muted">عنوان IP أو CIDR</span>
              <input
                dir="ltr"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="203.0.113.10 أو 203.0.113.0/24"
                className="w-full rounded-lg border border-line-strong bg-primary px-3 py-2 text-xs text-muted focus:border-success focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-muted">السبب (اختياري)</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: محاولات اختراق متكررة"
                className="w-full rounded-lg border border-line-strong bg-primary px-3 py-2 text-xs text-muted focus:border-success focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-muted">تاريخ انتهاء الحظر (اختياري)</span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-lg border border-line-strong bg-primary px-3 py-2 text-xs text-muted focus:border-success focus:outline-none"
              />
            </label>
            <Button
              size="sm"
              variant="danger"
              onClick={handleBan}
              disabled={submitting || !ipAddress.trim()}
              leadingIcon={<Plus className="h-4 w-4" />}
            >
              حظر
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-line-strong bg-primary/70 p-4 shadow-sm">
        <header className="mb-3 border-b border-line-strong pb-2.5">
          <h3 className="text-xs font-bold text-muted flex items-center gap-2">
            <ShieldOff className="h-4 w-4 text-primary" />
            قائمة العناوين المحظورة ({bans.filter(isBanActive).length} نشط)
          </h3>
        </header>

        {bans.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted">لا توجد عناوين IP محظورة.</p>
        ) : (
          <DataTable
            ariaLabel="العناوين المحظورة"
            rows={bans}
            rowKey={(ban) => ban.id}
            dense
            columns={[
              {
                key: 'ip', header: 'عنوان IP',
                render: (ban) => (
                  <span className="inline-flex items-center gap-1.5">
                    <span dir="ltr" className="font-mono font-bold text-muted">{ban.ip_address}</span>
                    <button
                      type="button"
                      onClick={() => void copyText(ban.ip_address)}
                      className="text-muted hover:text-primary"
                      title="نسخ عنوان IP"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </span>
                ),
              },
              { key: 'reason', header: 'السبب', render: (ban) => <span className="text-muted">{ban.reason || '—'}</span> },
              {
                key: 'status', header: 'الحالة',
                render: (ban) => {
                  const active = isBanActive(ban);
                  const expired = ban.is_active === 1 && !active;
                  return (
                    <span className={`font-bold ${active ? 'text-danger' : 'text-muted'}`}>
                      {active ? 'محظور' : expired ? 'منتهي' : 'مرفوع'}
                    </span>
                  );
                },
              },
              {
                key: 'expires', header: 'ينتهي في',
                render: (ban) => (
                  <span className="text-muted">
                    {ban.expires_at ? (
                      <span className="flex flex-col">
                        <span>{formatDateTime(ban.expires_at)}</span>
                        {isBanActive(ban) && <span className="text-[10px] text-warning font-bold">{formatRemaining(ban.expires_at)}</span>}
                      </span>
                    ) : 'دائم'}
                  </span>
                ),
              },
              { key: 'by', header: 'بواسطة', render: (ban) => <span className="text-muted">{ban.banned_by_name || '—'}</span> },
              { key: 'created', header: 'تاريخ الحظر', render: (ban) => <span className="text-muted">{formatDateTime(ban.created_at)}</span> },
              {
                key: 'actions', header: 'إجراءات', align: 'center',
                render: (ban) => isBanActive(ban) ? (
                  <button
                    disabled={!canManageSecurity}
                    onClick={() => onLift(ban.id)}
                    className="text-success hover:underline text-xs font-bold"
                  >
                    فك الحظر
                  </button>
                ) : null,
              },
            ]}
          />
        )}
      </section>
    </div>
  );
};
