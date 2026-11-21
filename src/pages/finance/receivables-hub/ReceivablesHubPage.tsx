import React, { Suspense, lazy, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, CalendarDays, ClipboardList, Clock3, ExternalLink } from 'lucide-react';
import { useRouteAccess } from '../../../hooks/domains/auth/useRouteAccess';
import { getHubTabOrder, resolveHubTabLabel } from '../../../config/activityHubTabs';
import { isActivityPathHidden } from '../../../config/activityPageVisibility';
import { getEffectiveBusinessType } from '../../../services/domains/config/BusinessTypeService';
import { useActivityPageCopy } from '../../../hooks/domains/config/useBusinessTerm';
import { usePageAccess } from '../../../hooks/domains/licensing/usePageAccess';
import { PageHeader } from '../../../components/ui/PageHeader';

const DebtsDashboardPage = lazy(() => import('../debts-dashboard/DebtsDashboardPage').then(m => ({ default: m.DebtsDashboardPage })));
const OtherReceivablesPage = lazy(() => import('../other-receivables/OtherReceivablesPage').then(m => ({ default: m.OtherReceivablesPage })));
const InstallmentsPage = lazy(() => import('../installments/InstallmentsPage').then(m => ({ default: m.InstallmentsPage })));

// Each tab is gated by the route rule of its canonical path — the same source
// the MainLayout guard uses — instead of a private permission list that can
// drift from ROUTE_PERMISSIONS.
const tabs = [
  { id: 'debts', label: 'ديون العملاء والموردين', icon: Banknote, path: '/finance/receivables' },
  { id: 'other', label: 'المطالبات الأخرى', icon: ClipboardList, path: '/finance/other-receivables' },
  { id: 'installments', label: 'الأقساط', icon: CalendarDays, path: '/finance/installments' },
  // Composite follow-up section: shown only when at least one of its source
  // sections (debts / installments) is reachable.
  { id: 'follow-up', label: 'التحصيل والمتابعة', icon: Clock3, path: null },
] as const;
type TabId = (typeof tabs)[number]['id'];

// تبويبات المركز ↔ أقسام مصفوفة الصلاحيات الدقيقة لصفحة /finance/receivables —
// قيود المنصة المركزية (disabledPermissions / featurePermissions) تخفي القسم
// حتى لو كان مسار وجهته مستقلاً متاحاً.
const TAB_SECTION_CODE: Record<TabId, string> = {
  debts: 'ui.finance.receivables.section.debts.view',
  other: 'ui.finance.receivables.section.other.view',
  installments: 'ui.finance.receivables.section.installments.view',
  'follow-up': 'ui.finance.receivables.section.follow_up.view',
};

export const ReceivablesHubPage: React.FC<{ initialTab?: TabId }> = ({ initialTab }) => {
  const [params, setParams] = useSearchParams();
  const canAccess = useRouteAccess();
  const pageCopy = useActivityPageCopy('finance');
  const pageAccess = usePageAccess('/finance/receivables');
  const allowedTabs = useMemo(() => {
    const businessType = getEffectiveBusinessType();
    const permitted = tabs.filter((item) =>
      item.path !== null
      && canAccess(item.path)
      && !isActivityPathHidden(item.path, businessType)
      && pageAccess.allows(TAB_SECTION_CODE[item.id])
    );
    const followUpAllowed = permitted.some((item) => item.id === 'debts' || item.id === 'installments');
    const allowed = tabs
      .filter((item) =>
        item.id === 'follow-up' ? followUpAllowed : permitted.includes(item),
      )
      .map((item) => ({ ...item, label: resolveHubTabLabel('receivables', item.id, item.label) }));
    const order = getHubTabOrder('receivables');
    if (!order?.length) return allowed;
    const rank = new Map(order.map((id, index) => [id, index]));
    return [...allowed].sort((a, b) => {
      const ra = rank.get(a.id) ?? order.length;
      const rb = rank.get(b.id) ?? order.length;
      return ra === rb ? 0 : ra - rb;
    });
  }, [canAccess, pageAccess]);
  const requested = params.get('tab') as TabId | null;
  const requestedTab = requested ?? initialTab ?? null;
  const tab: TabId | null = allowedTabs.some(item => item.id === requestedTab)
    ? requestedTab
    : (allowedTabs[0]?.id ?? null);
  const select = (id: TabId) => setParams({ tab: id }, { replace: true });

  useEffect(() => {
    if (tab && params.get('tab') !== tab) setParams({ tab }, { replace: true });
  }, [params, setParams, tab]);

  if (!tab) return <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-muted">لا تملك صلاحية لأي قسم من مركز الذمم.</div>;

  return <div className="h-full overflow-y-auto bg-surface-sunken p-3 lg:p-4">
    <div className="w-full space-y-4">
      <PageHeader
        icon={<Banknote className="h-5 w-5" />}
        title={pageCopy?.title || 'مركز الذمم والتحصيل'}
        description={pageCopy?.description || 'مساحة موحدة للوصول إلى الذمم والمطالبات وخطط السداد، مع بقاء بيانات كل عملية مستقلة.'}
      />
      <nav className="flex flex-wrap gap-2" aria-label="أقسام مركز الذمم">
        {allowedTabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => select(id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === id ? 'bg-primary text-white' : 'border bg-surface text-ink hover:bg-surface-muted'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </nav>
      {tab === 'follow-up' ? <section className="grid gap-3 rounded-2xl border bg-surface p-5 md:grid-cols-2">
        <p className="md:col-span-2 text-sm text-ink-secondary">تُدار إجراءات المتابعة داخل سجلها الأصلي لتجنب نسخ بيانات العملاء أو الأقساط إلى قائمة ثانية. اختر المصدر لمراجعة المتأخرات وتسجيل الإجراء التالي.</p>
        {allowedTabs.some(item => item.id === 'debts') && <button onClick={() => select('debts')} className="flex items-center justify-between rounded-xl border p-4 text-right hover:border-primary"><span><b className="block">متابعة تحصيل العملاء والموردين</b><small className="text-muted">الفواتير المتأخرة ووعود السداد وسندات التحصيل</small></span><ExternalLink className="h-4 w-4" /></button>}
        {allowedTabs.some(item => item.id === 'installments') && <button onClick={() => select('installments')} className="flex items-center justify-between rounded-xl border p-4 text-right hover:border-primary"><span><b className="block">متابعة الأقساط</b><small className="text-muted">الأقساط المستحقة والمتأخرة والمدفوعات</small></span><ExternalLink className="h-4 w-4" /></button>}
      </section> : <div className="min-h-[60vh] rounded-2xl border bg-surface p-2">
        <Suspense fallback={<div className="p-10 text-center text-sm text-muted">جارٍ تحميل القسم…</div>}>
          {tab === 'debts' && <DebtsDashboardPage />}
          {tab === 'other' && <OtherReceivablesPage />}
          {tab === 'installments' && <InstallmentsPage />}
        </Suspense>
      </div>}
    </div>
  </div>;
};

export default ReceivablesHubPage;
