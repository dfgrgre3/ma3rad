import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Wallet, TrendingUp, BookOpen, RefreshCw, Loader2, Calendar, ArrowUpRight, ArrowDownRight, Scale } from 'lucide-react';
import {
  FinancialStatementsService, BalanceSheet, CashFlowMonth, AgingRow, AgingBucket, LedgerLine,
} from '../../services/FinancialStatementsService';
import { exportToExcel } from '../../utils/export';
import { useToast } from '../../components/ui/Toast';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

type Tab = 'balance' | 'cash' | 'aging' | 'ledger';

export const FinancialStatementsPage: React.FC = () => {
  const service = useMemo(() => new FinancialStatementsService(), []);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('balance');
  const [loading, setLoading] = useState(true);

  const [asOf, setAsOf] = useState(today());
  const [balance, setBalance] = useState<BalanceSheet | null>(null);

  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [cash, setCash] = useState<{ months: CashFlowMonth[]; totals: CashFlowMonth } | null>(null);

  const [agingType, setAgingType] = useState<'customer' | 'supplier'>('customer');
  const [aging, setAging] = useState<{ rows: AgingRow[]; bucket: AgingBucket } | null>(null);

  const [accounts, setAccounts] = useState<Array<{ id: string; code: string; name: string; type: string }>>([]);
  const [accountId, setAccountId] = useState('');
  const [ledger, setLedger] = useState<{ opening: number; lines: LedgerLine[]; closing: number; account?: any } | null>(null);

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

  const renderLines = (lines: BalanceSheet['assets']) => (
    <div className="divide-y divide-slate-100">
      {lines.map((line, index) => (
        <div key={`${line.label}-${index}`} className={`flex items-center justify-between px-4 py-2.5 text-sm ${line.emphasis ? 'bg-slate-50 font-black text-slate-900' : 'text-slate-700'}`}>
          <span className={line.indent ? 'pr-4 text-slate-500' : ''}>{line.label}</span>
          <span className={`font-mono ${line.amount < 0 ? 'text-rose-600' : ''}`}>{fmt(line.amount)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center">
            <Scale className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-base font-black">القوائم المالية</h1>
            <p className="text-xs text-slate-500 font-medium">الميزانية العمومية، التدفقات النقدية، أعمار الديون، ودفتر الأستاذ</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'balance' && <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />}
          {(tab === 'cash' || tab === 'ledger') && (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
            </>
          )}
          {tab === 'aging' && (
            <>
              <select value={agingType} onChange={(e) => setAgingType(e.target.value as any)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                <option value="customer">العملاء</option>
                <option value="supplier">الموردون</option>
              </select>
              <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
            </>
          )}
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100" title="تحديث">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={tab === 'balance' ? exportBalance : tab === 'aging' ? exportAging : undefined} disabled={tab === 'cash' || tab === 'ledger'} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold disabled:opacity-40">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-1 overflow-x-auto">
        {([
          ['balance', 'الميزانية العمومية', Wallet],
          ['cash', 'التدفقات النقدية', TrendingUp],
          ['aging', 'أعمار الديون', Calendar],
          ['ledger', 'دفتر الأستاذ', BookOpen],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition ${tab === key ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>
        ) : tab === 'balance' && balance ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-teal-50/60 flex items-center justify-between">
                <h3 className="text-sm font-black text-teal-800">الأصول</h3>
                <span className="text-xs font-bold text-teal-700">{fmt(balance.totals.assets)}</span>
              </div>
              {renderLines(balance.assets)}
            </div>
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-rose-50/60 flex items-center justify-between">
                  <h3 className="text-sm font-black text-rose-800">الالتزامات</h3>
                  <span className="text-xs font-bold text-rose-700">{fmt(balance.totals.liabilities)}</span>
                </div>
                {renderLines(balance.liabilities)}
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-emerald-50/60 flex items-center justify-between">
                  <h3 className="text-sm font-black text-emerald-800">حقوق الملكية</h3>
                  <span className="text-xs font-bold text-emerald-700">{fmt(balance.totals.equity)}</span>
                </div>
                {renderLines(balance.equity)}
              </div>
            </div>
            <div className="lg:col-span-2 bg-slate-900 text-white rounded-xl px-5 py-3 flex items-center justify-between">
              <span className="text-xs font-bold">الأصول = الالتزامات + حقوق الملكية</span>
              <span className={`text-sm font-black font-mono ${Math.abs(balance.totals.difference) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`}>
                فرق التسوية: {fmt(balance.totals.difference)}
              </span>
            </div>
          </div>
        ) : tab === 'cash' && cash ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold"><ArrowDownRight className="w-4 h-4" /> إجمالي التدفقات الداخلة</div>
                <p className="mt-1 text-lg font-black">{fmt(cash.totals.inflows)}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-rose-600 text-xs font-bold"><ArrowUpRight className="w-4 h-4" /> إجمالي التدفقات الخارجة</div>
                <p className="mt-1 text-lg font-black">{fmt(cash.totals.outflows)}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-teal-600 text-xs font-bold"><TrendingUp className="w-4 h-4" /> صافي التدفق النقدي</div>
                <p className={`mt-1 text-lg font-black ${cash.totals.net < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmt(cash.totals.net)}</p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200"><tr><th className="px-4 py-3">الشهر</th><th className="px-4 py-3">تدفقات داخلة</th><th className="px-4 py-3">تدفقات خارجة</th><th className="px-4 py-3">الصافي</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {cash.months.map((month) => (
                    <tr key={month.month}><td className="px-4 py-2.5 font-mono">{month.month}</td><td className="px-4 py-2.5 font-mono text-emerald-600">{fmt(month.inflows)}</td><td className="px-4 py-2.5 font-mono text-rose-600">{fmt(month.outflows)}</td><td className={`px-4 py-2.5 font-mono font-bold ${month.net < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{fmt(month.net)}</td></tr>
                  ))}
                  {cash.months.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-slate-400">لا توجد حركات في الفترة المحددة</td></tr>}
                </tbody>
                <tfoot className="bg-slate-50 font-black"><tr><td className="px-4 py-3">الإجمالي</td><td className="px-4 py-3 font-mono text-emerald-700">{fmt(cash.totals.inflows)}</td><td className="px-4 py-3 font-mono text-rose-700">{fmt(cash.totals.outflows)}</td><td className={`px-4 py-3 font-mono ${cash.totals.net < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(cash.totals.net)}</td></tr></tfoot>
              </table>
            </div>
          </div>
        ) : tab === 'aging' && aging ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr><th className="px-4 py-3">الاسم</th><th className="px-4 py-3">حتى 30</th><th className="px-4 py-3">31-60</th><th className="px-4 py-3">61-90</th><th className="px-4 py-3">91-120</th><th className="px-4 py-3">+120</th><th className="px-4 py-3">الإجمالي</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aging.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-semibold">{row.name}{row.phone ? <span className="block text-[10px] text-slate-400 font-mono">{row.phone}</span> : null}</td>
                    <td className="px-4 py-2.5 font-mono">{fmt(row.current)}</td>
                    <td className="px-4 py-2.5 font-mono">{fmt(row.days30)}</td>
                    <td className="px-4 py-2.5 font-mono">{fmt(row.days60)}</td>
                    <td className="px-4 py-2.5 font-mono text-amber-700">{fmt(row.days90)}</td>
                    <td className="px-4 py-2.5 font-mono text-rose-600">{fmt(row.over90)}</td>
                    <td className="px-4 py-2.5 font-mono font-black">{fmt(row.total)}</td>
                  </tr>
                ))}
                {aging.rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">لا توجد مديونيات مستحقة</td></tr>}
              </tbody>
              <tfoot className="bg-slate-50 font-black">
                <tr><td className="px-4 py-3">الإجمالي</td><td className="px-4 py-3 font-mono">{fmt(aging.bucket.current)}</td><td className="px-4 py-3 font-mono">{fmt(aging.bucket.days30)}</td><td className="px-4 py-3 font-mono">{fmt(aging.bucket.days60)}</td><td className="px-4 py-3 font-mono">{fmt(aging.bucket.days90)}</td><td className="px-4 py-3 font-mono">{fmt(aging.bucket.over90)}</td><td className="px-4 py-3 font-mono">{fmt(aging.bucket.total)}</td></tr>
              </tfoot>
            </table>
          </div>
        ) : tab === 'ledger' ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setLedger(service.getGeneralLedger(e.target.value, from, to)); }} className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold">
                <option value="">— اختر الحساب —</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
              </select>
            </div>
            {ledger && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 font-bold">الرصيد الافتتاحي</p><p className="text-lg font-black font-mono">{fmt(ledger.opening)}</p></div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 font-bold">عدد الحركات</p><p className="text-lg font-black font-mono">{ledger.lines.length}</p></div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 font-bold">الرصيد الختامي</p><p className="text-lg font-black font-mono">{fmt(ledger.closing)}</p></div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200"><tr><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3">رقم القيد</th><th className="px-4 py-3">البيان</th><th className="px-4 py-3">مدين</th><th className="px-4 py-3">دائن</th><th className="px-4 py-3">الرصيد</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledger.lines.map((line, index) => (
                        <tr key={`${line.entryNumber}-${index}`}>
                          <td className="px-4 py-2.5 text-slate-500">{line.date}</td>
                          <td className="px-4 py-2.5 font-mono font-bold text-teal-700">{line.entryNumber}</td>
                          <td className="px-4 py-2.5">{line.description}</td>
                          <td className="px-4 py-2.5 font-mono">{fmt(line.debit)}</td>
                          <td className="px-4 py-2.5 font-mono">{fmt(line.credit)}</td>
                          <td className="px-4 py-2.5 font-mono font-bold">{fmt(line.balance)}</td>
                        </tr>
                      ))}
                      {ledger.lines.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400">لا توجد حركات على هذا الحساب في الفترة</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
