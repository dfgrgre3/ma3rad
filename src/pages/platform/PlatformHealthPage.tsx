import React from 'react';
import { ShieldCheck, Activity, AlertTriangle, Building2, KeyRound, Wallet, CheckCircle2 } from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type { PlatformOverview } from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from './components/PlatformUI';
import { formatDate, formatMoney, formatNumber } from './components/PlatformUI';

export const PlatformHealthPage: React.FC = () => {
  const [overview, setOverview] = React.useState<PlatformOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setOverview(platformAdminService.getOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل صحة المنصة.');
    }
  }, []);

  if (error) {
    return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>;
  }
  if (!overview) {
    return <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل صحة المنصة...</div>;
  }

  const score = Math.max(0, Math.min(100,
    100
    - (overview.tenants.suspended * 5)
    - (overview.tenants.expired * 4)
    - (overview.licenses.expired * 3)
    - (overview.billing.overdueInvoices * 4)
    - (overview.tenants.expiringSoon * 2)
  ));

  const tone = score >= 85 ? 'success' : score >= 60 ? 'warning' : 'danger';

  return (
    <div className="space-y-4">
      <PageHeader
        title="صحة المنصة (جميع العملاء)"
        description="مؤشرات مجمعة لصحة جميع العملاء والتراخيص والاشتراكات والفوترة."
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      <section className="rounded-2xl bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-900 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">تقييم صحة المنصة</p>
            <p className="mt-2 text-4xl font-black">{score}%</p>
            <p className="mt-1 text-xs text-slate-300">
              {overview.alerts.length === 0 ? 'لا توجد تنبيهات — المنصة في وضع سليم.' : `${overview.alerts.length} تنبيه يحتاج متابعة.`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white/10 p-3 text-center">
              <p className="text-[10px] text-slate-300">عملاء نشطون</p>
              <p className="text-lg font-black text-emerald-300">{formatNumber(overview.tenants.active)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center">
              <p className="text-[10px] text-slate-300">تراخيص سارية</p>
              <p className="text-lg font-black text-sky-300">{formatNumber(overview.licenses.active)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center">
              <p className="text-[10px] text-slate-300">اشتراكات نشطة</p>
              <p className="text-lg font-black text-amber-300">{formatNumber(overview.subscriptions.active)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 text-center">
              <p className="text-[10px] text-slate-300">تنبيهات</p>
              <p className="text-lg font-black text-rose-300">{formatNumber(overview.alerts.length)}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><Building2 className="h-3.5 w-3.5" /> العملاء</p>
          <p className="mt-1 text-xl font-black text-slate-900">{formatNumber(overview.tenants.total)}</p>
          <p className="text-[10.5px] text-slate-500">
            {formatNumber(overview.tenants.active)} نشط · {formatNumber(overview.tenants.suspended)} موقوف · {formatNumber(overview.tenants.expired)} منتهي
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><KeyRound className="h-3.5 w-3.5" /> التراخيص</p>
          <p className="mt-1 text-xl font-black text-slate-900">{formatNumber(overview.licenses.total)}</p>
          <p className="text-[10.5px] text-slate-500">
            {formatNumber(overview.licenses.active)} ساري · {formatNumber(overview.licenses.expired)} منتهي · {formatNumber(overview.licenses.revoked)} ملغي
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><Activity className="h-3.5 w-3.5" /> الاشتراكات</p>
          <p className="mt-1 text-xl font-black text-slate-900">{formatNumber(overview.subscriptions.total)}</p>
          <p className="text-[10.5px] text-slate-500">
            {formatNumber(overview.subscriptions.active)} نشط · {formatNumber(overview.subscriptions.expired)} منتهي · {formatNumber(overview.subscriptions.expiringSoon)} ينتهي قريباً
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><Wallet className="h-3.5 w-3.5" /> الفوترة</p>
          <p className="mt-1 text-xl font-black text-slate-900">{formatMoney(overview.billing.outstanding)}</p>
          <p className="text-[10.5px] text-slate-500">
            {formatNumber(overview.billing.overdueInvoices)} فاتورة متأخرة · MRR {formatMoney(overview.billing.mrr)}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600"><AlertTriangle className="h-4 w-4" /></span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">تنبيهات صحة المنصة</h3>
              <p className="text-[10.5px] text-slate-500">{overview.alerts.length === 0 ? 'لا توجد تنبيهات' : `${overview.alerts.length} تنبيه`}</p>
            </div>
          </div>
          <StatusBadge value={tone === 'success' ? 'ACTIVE' : tone === 'warning' ? 'TRIAL' : 'EXPIRED'} label={tone === 'success' ? 'سليم' : tone === 'warning' ? 'يحتاج متابعة' : 'حرج'} />
        </header>
        {overview.alerts.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-5 text-[12px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> جميع المؤشرات في وضع سليم.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {overview.alerts.map((alert) => (
              <li key={alert.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-slate-800">{alert.title}</p>
                  <p className="text-[10.5px] text-slate-500">{alert.description}</p>
                </div>
                {alert.link && <a href={alert.link} className="text-[10.5px] font-bold text-emerald-700 hover:underline">عرض</a>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Activity className="h-4 w-4" /></span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">آخر العمليات على المنصة</h3>
            <p className="text-[10.5px] text-slate-500">أحدث الإجراءات الإدارية المسجلة</p>
          </div>
        </header>
        {overview.recentAudit.length === 0 ? (
          <p className="px-4 py-4 text-[11px] text-slate-500">لا توجد عمليات مسجلة.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {overview.recentAudit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-bold text-slate-600">{entry.entityType}</span>
                <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800">{entry.action}</p>
                <span className="shrink-0 text-[10px] text-slate-500">{entry.actorName || 'النظام'}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{formatDate(entry.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};

export default PlatformHealthPage;
