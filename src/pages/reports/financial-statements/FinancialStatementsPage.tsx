import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FinancialStatementsService } from '../../../services/domains/reports/FinancialStatementsService';
import type { BalanceSheet, CashFlowMonth, AgingRow, AgingBucket, LedgerLine, ReconciliationCheck } from '../../../services/domains/reports/FinancialStatementsService';
import { exportToExcel } from '../../../utils/export/export';
import { useToast } from '../../../components/ui/Toast';
import { localDateString } from '../../../utils/shared/date';
import { BalanceSheetPanel } from '../../../components/reports/financial-statements/BalanceSheetPanel';
import { CashFlowPanel } from '../../../components/reports/financial-statements/CashFlowPanel';
import { AgingPanel } from '../../../components/reports/financial-statements/AgingPanel';
import { GeneralLedgerPanel } from '../../../components/reports/financial-statements/GeneralLedgerPanel';
import { ReconciliationPanel } from '../../../components/reports/financial-statements/ReconciliationPanel';
import { FinancialStatementsHeader } from '../../../components/reports/financial-statements/FinancialStatementsHeader';
import type { AgingType, FinancialStatementsTab } from '../../../components/reports/financial-statements/FinancialStatementsHeader';

const today = () => localDateString();
const yearStart = () => `${new Date().getFullYear()}-01-01`;

type FinancialStatementsContentProps = {
  loading: boolean;
  tab: FinancialStatementsTab;
  balance: BalanceSheet | null;
  cash: { months: CashFlowMonth[]; totals: CashFlowMonth; balances: { opening: number; closing: number } } | null;
  aging: { rows: AgingRow[]; bucket: AgingBucket } | null;
  accounts: Array<{ id: string; code: string; name: string; type: string }>;
  accountId: string;
  ledger: { opening: number; lines: LedgerLine[]; closing: number } | null;
  reconciliation: ReconciliationCheck[] | null;
  service: FinancialStatementsService;
  from: string;
  to: string;
  setAccountId: React.Dispatch<React.SetStateAction<string>>;
  setLedger: React.Dispatch<React.SetStateAction<{ opening: number; lines: LedgerLine[]; closing: number } | null>>;
};

const FinancialStatementsContent: React.FC<FinancialStatementsContentProps> = ({
  loading, tab, balance, cash, aging, accounts, accountId, ledger, reconciliation,
  service, from, to, setAccountId, setLedger,
}) => {
  if (loading) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>;
  }

  switch (tab) {
    case 'balance':
      return balance ? <BalanceSheetPanel balance={balance} /> : null;
    case 'cash':
      return cash ? <CashFlowPanel cash={cash} /> : null;
    case 'aging':
      return aging ? <AgingPanel aging={aging} /> : null;
    case 'ledger':
      return (
        <GeneralLedgerPanel
          accounts={accounts}
          accountId={accountId}
          ledger={ledger}
          onAccountChange={(nextAccountId) => {
            setAccountId(nextAccountId);
            setLedger(nextAccountId ? service.getGeneralLedger(nextAccountId, from, to) : null);
          }}
        />
      );
    case 'reconciliation':
      return reconciliation ? <ReconciliationPanel checks={reconciliation} /> : null;
    default:
      return null;
  }
};

export const FinancialStatementsPage: React.FC = () => {
  const service = useMemo(() => new FinancialStatementsService(), []);
  const toast = useToast();
  const [tab, setTab] = useState<FinancialStatementsTab>('balance');
  const [loading, setLoading] = useState(true);
  const [scopeWarning, setScopeWarning] = useState<string | null>(null);

  const [asOf, setAsOf] = useState(today());
  const [balance, setBalance] = useState<BalanceSheet | null>(null);

  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [cash, setCash] = useState<{
    months: CashFlowMonth[];
    totals: CashFlowMonth;
    balances: { opening: number; closing: number };
  } | null>(null);

  const [agingType, setAgingType] = useState<AgingType>('customer');
  const [aging, setAging] = useState<{ rows: AgingRow[]; bucket: AgingBucket } | null>(null);

  const [accounts, setAccounts] = useState<Array<{ id: string; code: string; name: string; type: string }>>([]);
  const [accountId, setAccountId] = useState('');
  const [ledger, setLedger] = useState<{ opening: number; lines: LedgerLine[]; closing: number } | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationCheck[] | null>(null);

  const loadLedger = useCallback(() => {
    const list = accounts.length ? accounts : service.getAccountsForLedger();
    if (!accounts.length) setAccounts(list);
    const selected = accountId || list[0]?.id || '';
    if (!selected) return;
    if (!accountId) setAccountId(selected);
    setLedger(service.getGeneralLedger(selected, from, to));
  }, [accountId, accounts, from, service, to]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setScopeWarning(service.getBranchScopeWarning());
      switch (tab) {
        case 'balance':
          setBalance(service.getBalanceSheet(asOf));
          break;
        case 'cash':
          setCash(service.getCashFlow(from, to));
          break;
        case 'aging':
          setAging(agingType === 'customer' ? service.getCustomerAging(asOf) : service.getSupplierAging(asOf));
          break;
        case 'reconciliation':
          setReconciliation(service.getReconciliation());
          break;
        case 'ledger':
          loadLedger();
          break;
      }
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل القوائم المالية.');
    } finally {
      setLoading(false);
    }
  }, [agingType, asOf, from, loadLedger, service, tab, toast, to]);

  useEffect(() => { load(); }, [load]);

  const exportBalance = () => {
    if (!balance) return;
    exportToExcel({
      title: 'الميزانية العمومية', subtitle: `كما في ${balance.asOf}`, fileName: 'balance-sheet',
      permission: 'reports.export',
      columns: [{ key: 'section', label: 'القسم' }, { key: 'label', label: 'البند' }, { key: 'amount', label: 'المبلغ' }],
      rows: [
        ...balance.assets.map((l) => ({ section: 'الأصول', label: l.label, amount: l.amount })),
        ...balance.liabilities.map((l) => ({ section: 'الالتزامات', label: l.label, amount: l.amount })),
        ...balance.equity.map((l) => ({ section: 'حقوق الملكية', label: l.label, amount: l.amount })),
      ],
    });
  };

  const exportAging = () => {
    if (!aging) return;
    exportToExcel({
      title: agingType === 'customer' ? 'أعمار مديونيات العملاء' : 'أعمار مديونيات الموردين',
      subtitle: `كما في ${asOf}`, fileName: `aging-${agingType}`,
      permission: 'reports.export',
      columns: [
        { key: 'name', label: 'الاسم' }, { key: 'current', label: 'حتى 30 يوم' },
        { key: 'days30', label: '31-60' }, { key: 'days60', label: '61-90' },
        { key: 'days90', label: '91-120' }, { key: 'over90', label: 'أكثر من 120' },
        { key: 'total', label: 'الإجمالي' },
      ],
      rows: aging.rows.map((row) => ({
        name: row.name,
        current: row.current,
        days30: row.days30,
        days60: row.days60,
        days90: row.days90,
        over90: row.over90,
        total: row.total,
      })),
    });
  };

  const exportCash = () => {
    if (!cash) return;
    exportToExcel({
      title: 'قائمة التدفقات النقدية',
      subtitle: `من ${from} إلى ${to}`,
      fileName: 'cash-flow',
      permission: 'reports.export',
      columns: [
        { key: 'period', label: 'الفترة' },
        { key: 'inflows', label: 'التدفقات الداخلة' },
        { key: 'outflows', label: 'التدفقات الخارجة' },
        { key: 'net', label: 'صافي التدفق' },
        { key: 'balance', label: 'رصيد النقدية' },
      ],
      rows: [
        { period: 'الرصيد الافتتاحي', inflows: '', outflows: '', net: '', balance: cash.balances.opening },
        ...cash.months.map((month) => ({
          period: month.month,
          inflows: month.inflows,
          outflows: month.outflows,
          net: month.net,
          balance: '',
        })),
        { period: 'الإجمالي', inflows: cash.totals.inflows, outflows: cash.totals.outflows, net: cash.totals.net, balance: '' },
        { period: 'الرصيد الختامي', inflows: '', outflows: '', net: '', balance: cash.balances.closing },
      ],
    });
  };

  const exportLedger = () => {
    if (!ledger || !accountId) return;
    const account = accounts.find((item) => item.id === accountId);
    exportToExcel({
      title: `دفتر الأستاذ — ${account ? `${account.code} ${account.name}` : accountId}`,
      subtitle: `من ${from} إلى ${to}`,
      fileName: 'general-ledger',
      permission: 'reports.export',
      columns: [
        { key: 'date', label: 'التاريخ' },
        { key: 'entryNumber', label: 'رقم القيد' },
        { key: 'description', label: 'البيان' },
        { key: 'debit', label: 'مدين' },
        { key: 'credit', label: 'دائن' },
        { key: 'balance', label: 'الرصيد' },
      ],
      rows: [
        { date: '', entryNumber: '', description: 'الرصيد الافتتاحي', debit: '', credit: '', balance: ledger.opening },
        ...ledger.lines.map((line) => ({
          date: line.date,
          entryNumber: line.entryNumber,
          description: line.description,
          debit: line.debit,
          credit: line.credit,
          balance: line.balance,
        })),
        { date: '', entryNumber: '', description: 'الرصيد الختامي', debit: '', credit: '', balance: ledger.closing },
      ],
    });
  };

  const exportReconciliation = () => {
    if (!reconciliation) return;
    exportToExcel({
      title: 'مصالحة القوائم المالية',
      fileName: 'financial-reconciliation',
      permission: 'reports.export',
      columns: [
        { key: 'label', label: 'الفحص' },
        { key: 'detail', label: 'التفاصيل' },
        { key: 'ledger', label: 'الأستاذ العام' },
        { key: 'source', label: 'المصدر المقارن' },
        { key: 'difference', label: 'الفرق' },
        { key: 'status', label: 'النتيجة' },
      ],
      rows: reconciliation.map((check) => ({
        ...check,
        status: check.status === 'MATCH' ? 'متطابق'
          : check.status === 'NOT_COMPARABLE' ? 'غير قابل للمقارنة' : 'فرق',
      })),
    });
  };

  const exportCurrentTab = () => {
    if (tab === 'balance') exportBalance();
    else if (tab === 'cash') exportCash();
    else if (tab === 'aging') exportAging();
    else if (tab === 'ledger') exportLedger();
    else exportReconciliation();
  };
  const canExportCurrentTab = tab === 'balance' ? Boolean(balance)
    : tab === 'cash' ? Boolean(cash)
      : tab === 'aging' ? Boolean(aging)
        : tab === 'ledger' ? Boolean(ledger && accountId)
          : Boolean(reconciliation);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <FinancialStatementsHeader
        tab={tab}
        agingType={agingType}
        asOf={asOf}
        from={from}
        to={to}
        loading={loading}
        onTabChange={setTab}
        onAgingTypeChange={setAgingType}
        onAsOfChange={setAsOf}
        onFromChange={setFrom}
        onToChange={setTo}
        onRefresh={load}
        onExport={canExportCurrentTab ? exportCurrentTab : undefined}
      />

      <div className="flex-1 overflow-auto p-6">
        {scopeWarning && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{scopeWarning}</div>}
        <FinancialStatementsContent
          loading={loading}
          tab={tab}
          balance={balance}
          cash={cash}
          aging={aging}
          accounts={accounts}
          accountId={accountId}
          ledger={ledger}
          reconciliation={reconciliation}
          service={service}
          from={from}
          to={to}
          setAccountId={setAccountId}
          setLedger={setLedger}
        />
      </div>
    </div>
  );
};
