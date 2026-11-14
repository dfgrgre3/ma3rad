import React from 'react';
import { ScrollText, Search, Download, RefreshCw } from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type { PlatformAuditEntry } from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import {
  EmptyState,
  downloadCsv,
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

const ENTITY_LABELS: Record<string, string> = {
  TENANT: 'عميل',
  PLAN: 'خطة',
  LICENSE: 'ترخيص',
  INVOICE: 'فاتورة',
  PAYMENT: 'دفعة',
  MODULE: 'وحدة',
  FEATURE: 'ميزة',
  RELEASE: 'إصدار',
  SETTINGS: 'إعدادات',
  USER: 'مستخدم',
};

const ENTITY_TONE: Record<string, string> = {
  TENANT: 'bg-sky-50 text-sky-700',
  PLAN: 'bg-violet-50 text-violet-700',
  LICENSE: 'bg-amber-50 text-amber-700',
  INVOICE: 'bg-indigo-50 text-indigo-700',
  PAYMENT: 'bg-emerald-50 text-emerald-700',
  MODULE: 'bg-slate-100 text-slate-600',
  FEATURE: 'bg-pink-50 text-pink-700',
  RELEASE: 'bg-cyan-50 text-cyan-700',
  SETTINGS: 'bg-slate-100 text-slate-600',
};

function formatDetails(details?: string | null): string {
  if (!details) return '—';
  try {
    const parsed = JSON.parse(details);
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed)
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
        .join(' · ');
    }
    return String(parsed);
  } catch {
    return details;
  }
}

const SECURITY_KEYWORDS = ['تعليق', 'إلغاء', 'أرشفة', 'حذف', 'إعادة تعيين', 'كلمة مرور', 'تفعيل', 'ربط', 'تجاوز'];

export const PlatformAuditPage: React.FC = () => {
  const [entries, setEntries] = React.useState<PlatformAuditEntry[]>([]);
  const [search, setSearch] = React.useState('');
  const [scope, setScope] = React.useState<'all' | 'security'>('all');
  const [tenantId, setTenantId] = React.useState('');
  const [tenants, setTenants] = React.useState<any[]>([]);
  const [limit, setLimit] = React.useState(200);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    try {
      setEntries(platformAdminService.listAudit(limit, search));
      if (tenants.length === 0) setTenants(platformAdminService.listTenants());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل سجل العمليات.');
    } finally {
      setLoading(false);
    }
  }, [limit, search, tenants.length]);

  React.useEffect(() => { load(); }, [load]);

  const visibleEntries = React.useMemo(() => {
    let result = entries;
    if (scope === 'security') {
      result = result.filter((entry) => SECURITY_KEYWORDS.some((keyword) => entry.action.includes(keyword)));
    }
    if (tenantId) {
      result = result.filter((entry) => entry.entityId === tenantId || (entry.details || '').includes(tenantId));
    }
    return result;
  }, [entries, scope, tenantId]);

  const exportRows = () => {
    downloadCsv('platform-audit.csv', [
      ['التاريخ', 'المنفذ', 'الإجراء', 'النوع', 'المعرف', 'التفاصيل'],
      ...visibleEntries.map((entry) => [
        entry.createdAt,
        entry.actorName ?? '',
        entry.action,
        ENTITY_LABELS[entry.entityType] ?? entry.entityType,
        entry.entityId ?? '',
        formatDetails(entry.details),
      ]),
    ]);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="سجل عمليات المنصة"
        description="تتبّع كل إجراء قام به مالك المنصة على العملاء والتراخيص والمبيعات."
        icon={<ScrollText className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={load}>
              تحديث
            </Button>
            <Button variant="ghost" size="sm" leadingIcon={<Download className="h-3.5 w-3.5" />} onClick={exportRows}>
              تصدير CSV
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث بالإجراء أو النوع أو المنفذ..."
            className={`${inputClass} pr-8`}
          />
        </div>
        <select value={tenantId} onChange={(event) => setTenantId(event.target.value)} className={`${inputClass} max-w-[200px]`}>
          <option value="">كل العملاء</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>{tenant.name} — {tenant.code}</option>
          ))}
        </select>
        <select value={scope} onChange={(event) => setScope(event.target.value as 'all' | 'security')} className={`${inputClass} max-w-[170px]`}>
          <option value="all">كل السجلات</option>
          <option value="security">سجل الأمان</option>
        </select>
        <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} className={`${inputClass} max-w-[150px]`}>
          <option value={100}>100 سجل</option>
          <option value={200}>200 سجل</option>
          <option value={500}>500 سجل</option>
        </select>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{visibleEntries.length} سجل</span>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل السجل...</div>
        ) : visibleEntries.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-5 w-5" />} title="لا توجد عمليات مسجلة" description="ستظهر هنا كل إجراءات مالك المنصة." />
        ) : (
          <ol className="divide-y divide-slate-100">
            {visibleEntries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-start gap-3 px-4 py-3 hover:bg-slate-50/60">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${ENTITY_TONE[entry.entityType] ?? 'bg-slate-100 text-slate-600'}`}>
                  {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold text-slate-800">{entry.action}</p>
                  <p className="truncate text-[10.5px] text-slate-500" dir="auto">{formatDetails(entry.details)}</p>
                  {entry.entityId && (
                    <p className="truncate font-mono text-[9.5px] text-slate-400" dir="ltr">{entry.entityId}</p>
                  )}
                </div>
                <div className="shrink-0 text-left">
                  <p className="text-[10.5px] font-semibold text-slate-600">{entry.actorName || 'النظام'}</p>
                  <p className="text-[10px] text-slate-400">{formatDateTime(entry.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-[10.5px] text-slate-400">
        السجل للقراءة فقط ويُحتفظ به تلقائياً لكل إجراء إداري.
      </p>
    </div>
  );
};

export default PlatformAuditPage;
