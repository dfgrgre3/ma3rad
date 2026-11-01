import React, { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, CalendarDays, ClipboardList, Clock3, ExternalLink } from 'lucide-react';

const DebtsDashboardPage = lazy(() => import('./DebtsDashboardPage').then(m => ({ default: m.DebtsDashboardPage })));
const OtherReceivablesPage = lazy(() => import('./OtherReceivablesPage').then(m => ({ default: m.OtherReceivablesPage })));
const InstallmentsPage = lazy(() => import('./InstallmentsPage').then(m => ({ default: m.InstallmentsPage })));

const tabs = [
  { id: 'debts', label: 'ديون العملاء والموردين', icon: Banknote },
  { id: 'other', label: 'المطالبات الأخرى', icon: ClipboardList },
  { id: 'installments', label: 'الأقساط', icon: CalendarDays },
  { id: 'follow-up', label: 'التحصيل والمتابعة', icon: Clock3 },
] as const;
type TabId = (typeof tabs)[number]['id'];

export const ReceivablesHubPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabId = tabs.some(item => item.id === requested) ? requested as TabId : 'debts';
  const select = (id: TabId) => setParams({ tab: id }, { replace: true });

  return <div className="h-full overflow-y-auto bg-slate-100 p-4 lg:p-6" dir="rtl">
    <div className="mx-auto max-w-7xl space-y-4">
      <header><h1 className="text-xl font-black text-slate-900">مركز الذمم والتحصيل</h1><p className="mt-1 text-sm text-slate-500">مساحة موحدة للوصول إلى الذمم والمطالبات وخطط السداد، مع بقاء بيانات كل عملية مستقلة.</p></header>
      <nav className="flex flex-wrap gap-2" aria-label="أقسام مركز الذمم">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => select(id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === id ? 'bg-violet-700 text-white' : 'border bg-white text-slate-700 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </nav>
      {tab === 'follow-up' ? <section className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-2">
        <p className="md:col-span-2 text-sm text-slate-600">تُدار إجراءات المتابعة داخل سجلها الأصلي لتجنب نسخ بيانات العملاء أو الأقساط إلى قائمة ثانية. اختر المصدر لمراجعة المتأخرات وتسجيل الإجراء التالي.</p>
        <button onClick={() => select('debts')} className="flex items-center justify-between rounded-xl border p-4 text-right hover:border-violet-400"><span><b className="block">متابعة تحصيل العملاء والموردين</b><small className="text-slate-500">الفواتير المتأخرة ووعود السداد وسندات التحصيل</small></span><ExternalLink className="h-4 w-4" /></button>
        <button onClick={() => select('installments')} className="flex items-center justify-between rounded-xl border p-4 text-right hover:border-violet-400"><span><b className="block">متابعة الأقساط</b><small className="text-slate-500">الأقساط المستحقة والمتأخرة والمدفوعات</small></span><ExternalLink className="h-4 w-4" /></button>
      </section> : <div className="min-h-[60vh] rounded-2xl border bg-white p-2">
        <Suspense fallback={<div className="p-10 text-center text-sm text-slate-500">جارٍ تحميل القسم…</div>}>
          {tab === 'debts' && <DebtsDashboardPage />}
          {tab === 'other' && <OtherReceivablesPage />}
          {tab === 'installments' && <InstallmentsPage />}
        </Suspense>
      </div>}
    </div>
  </div>;
};

export default ReceivablesHubPage;
