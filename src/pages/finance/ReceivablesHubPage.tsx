import React, { Suspense, lazy, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, CalendarDays, ClipboardList, Clock3, ExternalLink } from 'lucide-react';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';

const DebtsDashboardPage = lazy(() => import('./DebtsDashboardPage').then(m => ({ default: m.DebtsDashboardPage })));
const OtherReceivablesPage = lazy(() => import('./OtherReceivablesPage').then(m => ({ default: m.OtherReceivablesPage })));
const InstallmentsPage = lazy(() => import('./InstallmentsPage').then(m => ({ default: m.InstallmentsPage })));

const tabs = [
  { id: 'debts', label: 'Ø¯ÙŠÙˆÙ† Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†', icon: Banknote, permissions: ['finance.view', 'finance.debts.view'] },
  { id: 'other', label: 'Ø§Ù„Ù…Ø·Ø§Ù„Ø¨Ø§Øª Ø§Ù„Ø£Ø®Ø±Ù‰', icon: ClipboardList, permissions: ['finance.view', 'finance.receivables.view'] },
  { id: 'installments', label: 'Ø§Ù„Ø£Ù‚Ø³Ø§Ø·', icon: CalendarDays, permissions: ['finance.view', 'finance.installments.view', 'finance.installments.manage'] },
  { id: 'follow-up', label: 'Ø§Ù„ØªØ­ØµÙŠÙ„ ÙˆØ§Ù„Ù…ØªØ§Ø¨Ø¹Ø©', icon: Clock3, permissions: ['finance.view', 'finance.debts.view', 'finance.installments.view', 'finance.installments.manage'] },
] as const;
type TabId = (typeof tabs)[number]['id'];

export const ReceivablesHubPage: React.FC<{ initialTab?: TabId }> = ({ initialTab }) => {
  const [params, setParams] = useSearchParams();
  const actor = AuthService.getCurrentUser();
  const allowedTabs = useMemo(
    () => tabs.filter((item) => item.permissions.some((permission) => PermissionService.can(actor, permission))),
    [actor],
  );
  const requested = params.get('tab') as TabId | null;
  const requestedTab = requested ?? initialTab ?? null;
  const tab: TabId | null = allowedTabs.some(item => item.id === requestedTab)
    ? requestedTab
    : (allowedTabs[0]?.id ?? null);
  const select = (id: TabId) => setParams({ tab: id }, { replace: true });

  useEffect(() => {
    if (tab && params.get('tab') !== tab) setParams({ tab }, { replace: true });
  }, [params, setParams, tab]);

  if (!tab) return <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-slate-500">Ù„Ø§ ØªÙ…Ù„Ùƒ ØµÙ„Ø§Ø­ÙŠØ© Ù„Ø£ÙŠ Ù‚Ø³Ù… Ù…Ù† Ù…Ø±ÙƒØ² Ø§Ù„Ø°Ù…Ù….</div>;

  return <div className="h-full overflow-y-auto bg-slate-100 p-4 lg:p-6" dir="rtl">
    <div className="w-full space-y-4">
      <header><h1 className="text-xl font-black text-slate-900">Ù…Ø±ÙƒØ² Ø§Ù„Ø°Ù…Ù… ÙˆØ§Ù„ØªØ­ØµÙŠÙ„</h1><p className="mt-1 text-sm text-slate-500">Ù…Ø³Ø§Ø­Ø© Ù…ÙˆØ­Ø¯Ø© Ù„Ù„ÙˆØµÙˆÙ„ Ø¥Ù„Ù‰ Ø§Ù„Ø°Ù…Ù… ÙˆØ§Ù„Ù…Ø·Ø§Ù„Ø¨Ø§Øª ÙˆØ®Ø·Ø· Ø§Ù„Ø³Ø¯Ø§Ø¯ØŒ Ù…Ø¹ Ø¨Ù‚Ø§Ø¡ Ø¨ÙŠØ§Ù†Ø§Øª ÙƒÙ„ Ø¹Ù…Ù„ÙŠØ© Ù…Ø³ØªÙ‚Ù„Ø©.</p></header>
      <nav className="flex flex-wrap gap-2" aria-label="Ø£Ù‚Ø³Ø§Ù… Ù…Ø±ÙƒØ² Ø§Ù„Ø°Ù…Ù…">
        {allowedTabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => select(id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === id ? 'bg-violet-700 text-white' : 'border bg-white text-slate-700 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </nav>
      {tab === 'follow-up' ? <section className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-2">
        <p className="md:col-span-2 text-sm text-slate-600">ØªÙØ¯Ø§Ø± Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ø¯Ø§Ø®Ù„ Ø³Ø¬Ù„Ù‡Ø§ Ø§Ù„Ø£ØµÙ„ÙŠ Ù„ØªØ¬Ù†Ø¨ Ù†Ø³Ø® Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ Ø£Ùˆ Ø§Ù„Ø£Ù‚Ø³Ø§Ø· Ø¥Ù„Ù‰ Ù‚Ø§Ø¦Ù…Ø© Ø«Ø§Ù†ÙŠØ©. Ø§Ø®ØªØ± Ø§Ù„Ù…ØµØ¯Ø± Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù…ØªØ£Ø®Ø±Ø§Øª ÙˆØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ø§Ù„ØªØ§Ù„ÙŠ.</p>
        {allowedTabs.some(item => item.id === 'debts') && <button onClick={() => select('debts')} className="flex items-center justify-between rounded-xl border p-4 text-right hover:border-violet-400"><span><b className="block">Ù…ØªØ§Ø¨Ø¹Ø© ØªØ­ØµÙŠÙ„ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†</b><small className="text-slate-500">Ø§Ù„ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…ØªØ£Ø®Ø±Ø© ÙˆÙˆØ¹ÙˆØ¯ Ø§Ù„Ø³Ø¯Ø§Ø¯ ÙˆØ³Ù†Ø¯Ø§Øª Ø§Ù„ØªØ­ØµÙŠÙ„</small></span><ExternalLink className="h-4 w-4" /></button>}
        {allowedTabs.some(item => item.id === 'installments') && <button onClick={() => select('installments')} className="flex items-center justify-between rounded-xl border p-4 text-right hover:border-violet-400"><span><b className="block">Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„Ø£Ù‚Ø³Ø§Ø·</b><small className="text-slate-500">Ø§Ù„Ø£Ù‚Ø³Ø§Ø· Ø§Ù„Ù…Ø³ØªØ­Ù‚Ø© ÙˆØ§Ù„Ù…ØªØ£Ø®Ø±Ø© ÙˆØ§Ù„Ù…Ø¯ÙÙˆØ¹Ø§Øª</small></span><ExternalLink className="h-4 w-4" /></button>}
      </section> : <div className="min-h-[60vh] rounded-2xl border bg-white p-2">
        <Suspense fallback={<div className="p-10 text-center text-sm text-slate-500">Ø¬Ø§Ø±Ù ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù‚Ø³Ù…â€¦</div>}>
          {tab === 'debts' && <DebtsDashboardPage />}
          {tab === 'other' && <OtherReceivablesPage />}
          {tab === 'installments' && <InstallmentsPage />}
        </Suspense>
      </div>}
    </div>
  </div>;
};

export default ReceivablesHubPage;
