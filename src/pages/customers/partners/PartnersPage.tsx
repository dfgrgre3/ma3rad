import React from 'react';
import {
  ArrowUpRight, Banknote, Building2, ClipboardList, Download,
  History, Plus, RefreshCw, Users, Wallet, BarChart3,
} from 'lucide-react';
import { usePartnersPage } from '../../../hooks/pages/customers/partners/usePartnersPage';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { SummaryCard } from './PartnersPage/PartnerUi';
import { formatMoney, formatNumber, type Tab } from './PartnersPage/partnersModel';
import { PartnersListPanel } from './components/PartnersListPanel';
import { PartnersOverviewTab } from './components/PartnersOverviewTab';
import { PartnersDistributionsTab } from './components/PartnersDistributionsTab';
import { PartnersStatementTab } from './components/PartnersStatementTab';
import { PartnerFormModal } from './components/PartnerFormModal';
import { PartnerTransactionModal } from './components/PartnerTransactionModal';
import { PartnerReversalModal } from './components/PartnerReversalModal';
import { PartnerProfitsModal } from './components/PartnerProfitsModal';

export const PartnersPage: React.FC = () => {
  const vm = usePartnersPage();
  const {
    partners, overview, tab, setTab, loading, error, modal,
    canManage, canDistribute, canExport,
    pendingProfits, outstandingLoans,
    refresh, exportCsv, openProfitDistribution, openNewPartner,
  } = vm;

  return (
    <div className="erp-page">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .partner-print-area, .partner-print-area * { visibility: visible !important; }
          .partner-print-area {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            color: #111 !important;
            background: #fff !important;
          }
          .partner-print-hidden { display: none !important; }
        }
      `}</style>

      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title="حسابات الشركاء"
        description="نسب الملكية ورأس المال والقروض والمسحوبات والأرباح والتسويات وكشوف الحساب."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={refresh} disabled={loading} leadingIcon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}>
              تحديث
            </Button>
            {canExport && (
              <Button variant="secondary" size="sm" onClick={exportCsv} disabled={loading} leadingIcon={<Download className="h-4 w-4" />}>
                تصدير CSV
              </Button>
            )}
            {canDistribute && (
              <Button variant="secondary" size="sm" onClick={openProfitDistribution} disabled={!partners.some((partner) => partner.isActive)} leadingIcon={<Banknote className="h-4 w-4" />}>
                توزيع أرباح
              </Button>
            )}
            {canManage && (
              <Button variant="primary" size="sm" onClick={openNewPartner} leadingIcon={<Plus className="h-4 w-4" />}>
                إضافة شريك
              </Button>
            )}
          </>
        }
      />

      <section className="erp-stat-grid" aria-label="ملخص حسابات الشركاء">
        <SummaryCard label="الشركاء النشطون" value={`${formatNumber.format(overview.activePartnersCount)} من ${formatNumber.format(overview.partnersCount)}`} icon={Users} />
        <SummaryCard label="إجمالي رأس المال المساهم" value={formatMoney(overview.totalContributions)} icon={Building2} />
        <SummaryCard label="أرباح مستحقة غير موزعة" value={formatMoney(pendingProfits)} icon={Banknote} tone="emerald" />
        <SummaryCard label="قروض شركاء مستحقة" value={formatMoney(outstandingLoans)} icon={Wallet} tone="amber" />
        <SummaryCard label="مسحوبات شخصية" value={formatMoney(overview.totalDrawings)} icon={ArrowUpRight} tone="rose" />
        <SummaryCard label="إجمالي صافي أرصدة الشركاء" value={formatMoney(overview.totalNetBalance)} icon={ClipboardList} tone={overview.totalNetBalance < 0 ? 'rose' : 'sky'} />
      </section>

      {error && <div role="alert" className="rounded-[var(--win-radius)] border border-[var(--win-danger-border)] bg-[var(--win-danger-soft)] px-3 py-2 text-[var(--ui-font-sm)] text-[var(--win-danger-text)]">{error}</div>}

      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
        <PartnersListPanel vm={vm} />

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            {([
              { key: 'statement', label: 'كشف الحساب', icon: ClipboardList },
              { key: 'overview', label: 'أرصدة الشركاء', icon: BarChart3 },
              { key: 'distributions', label: 'سجل توزيع الأرباح', icon: History },
            ] as Array<{ key: Tab; label: string; icon: typeof Users }>).map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${tab === key ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {tab === 'overview' && <PartnersOverviewTab vm={vm} />}
          {tab === 'distributions' && <PartnersDistributionsTab vm={vm} />}
          {tab === 'statement' && <PartnersStatementTab vm={vm} />}
        </section>
      </div>

      {modal === 'partner' && <PartnerFormModal vm={vm} />}
      {modal === 'transaction' && <PartnerTransactionModal vm={vm} />}
      {modal === 'reversal' && <PartnerReversalModal vm={vm} />}
      {modal === 'profits' && <PartnerProfitsModal vm={vm} />}
    </div>
  );
};
