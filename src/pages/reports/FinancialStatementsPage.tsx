import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FinancialStatementsService } from '../../services/FinancialStatementsService';
import type { BalanceSheet, CashFlowMonth, AgingRow, AgingBucket, LedgerLine } from '../../services/FinancialStatementsService';
import { exportToExcel } from '../../utils/export';
import { useToast } from '../../components/ui/Toast';
import { localDateString } from '../../utils/date';
import { BalanceSheetPanel } from '../../components/reports/financial-statements/BalanceSheetPanel';
import { CashFlowPanel } from '../../components/reports/financial-statements/CashFlowPanel';
import { AgingPanel } from '../../components/reports/financial-statements/AgingPanel';
import { GeneralLedgerPanel } from '../../components/reports/financial-statements/GeneralLedgerPanel';
import { FinancialStatementsHeader } from '../../components/reports/financial-statements/FinancialStatementsHeader';
import type { AgingType, FinancialStatementsTab } from '../../components/reports/financial-statements/FinancialStatementsHeader';

const today = () => localDateString();
const yearStart = () => `${new Date().getFullYear()}-01-01`;

export const FinancialStatementsPage: React.FC = () => {
  const service = useMemo(() => new FinancialStatementsService(), []);
  const toast = useToast();
  const [tab, setTab] = useState<FinancialStatementsTab>('balance');
  const [loading, setLoading] = useState(true);

  const [asOf, setAsOf] = useState(today());
  const [balance, setBalance] = useState<BalanceSheet | null>(null);

  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [cash, setCash] = useState<{ months: CashFlowMonth[]; totals: CashFlowMonth } | null>(null);

  const [agingType, setAgingType] = useState<AgingType>('customer');
  const [aging, setAging] = useState<{ rows: AgingRow[]; bucket: AgingBucket } | null>(null);

  const [accounts, setAccounts] = useState<Array<{ id: string; code: string; name: string; type: string }>>([]);
  const [accountId, setAccountId] = useState('');
  const [ledger, setLedger] = useState<{ opening: number; lines: LedgerLine[]; closing: number } | null>(null);

  const load = () => {
    setLoading(true);
    try {
      if (tab === 'balance') setBalance(service.getBalanceSheet(asOf));
      if (tab === 'cash') setCash(service.getCashFlow(from, to));
      if (tab === 'aging') setAging(agingType === 'customer' ? service.getCustomerAging(asOf) : service.getSupplierAging(asOf));
      if (tab === 'ledger') {
        const list = accounts.length ? accounts : service.getAccountsForLedger();
        if (!accounts.length) setAccounts(list);
        const selected = accountId || list[0]?.id || '';
        if (selected) {
          if (!accountId) setAccountId(selected);
          setLedger(service.getGeneralLedger(selected, from, to));
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل القوائم المالية.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, agingType]);

  const exportBalance = () => {
    if (!balance) return;
    exportToExcel({
      title: 'الميزانية العمومية', subtitle: `كما في ${balance.asOf}`, fileName: 'balance-sheet',
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
      columns: [
        { key: 'name', label: 'الاسم' }, { key: 'current', label: 'حتى 30 يوم' },
        { key: 'days30', label: '31-60' }, { key: 'days60', label: '61-90' },
        { key: 'days90', label: '91-120' }, { key: 'over90', label: 'أكثر من 120' },
        { key: 'total', label: 'الإجمالي' },
      ],
      rows: aging.rows.map(({ id, name, phone, ...rest }) => ({ name, ...rest })),
    });
  };

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
        onExport={tab === 'balance' ? exportBalance : tab === 'aging' ? exportAging : undefined}
      />

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>
        ) : tab === 'balance' && balance ? (
          <BalanceSheetPanel balance={balance} />
        ) : tab === 'cash' && cash ? (
          <CashFlowPanel cash={cash} />
        ) : tab === 'aging' && aging ? (
          <AgingPanel aging={aging} />
        ) : tab === 'ledger' ? (
          <GeneralLedgerPanel
            accounts={accounts}
            accountId={accountId}
            ledger={ledger}
            onAccountChange={(nextAccountId) => {
              setAccountId(nextAccountId);
              setLedger(nextAccountId ? service.getGeneralLedger(nextAccountId, from, to) : null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
};
