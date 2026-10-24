import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, BarChart3,
  RefreshCw, ArrowUpRight, ArrowDownRight, BookOpen, Layers,
  Plus, CheckCircle2, ShieldCheck, FileSpreadsheet, Scale
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { DatabaseManager } from '../../database/db';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { FinanceExtrasService } from '../../services/FinanceExtrasService';

interface AccountRecord {
  id: string;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  balance: number;
}

interface JournalEntryRecord {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  totalDebit: number;
  totalCredit: number;
  lines?: { accountName: string; debit: number; credit: number }[];
}

export const FinanceOverviewPage: React.FC = () => {
  const financeService = new FinanceExtrasService();
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CHART_OF_ACCOUNTS' | 'JOURNAL_ENTRIES'>('OVERVIEW');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    totalReceivables: 0,
    totalPayables: 0,
    cashBalance: 0,
    inventoryValue: 0,
  });
  const [monthlyData, setMonthlyData] = useState<{ month: string; revenue: number; expenses: number }[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntryRecord[]>([]);

  // Add Account Modal
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'>('ASSET');

  // Add Journal Entry Modal
  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [entryDesc, setEntryDesc] = useState('');
  const [debitAccId, setDebitAccId] = useState('');
  const [creditAccId, setCreditAccId] = useState('');
  const [entryAmount, setEntryAmount] = useState<number>(5000);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    const db = DatabaseManager.getInstance().getDb();
    if (!db) { setLoading(false); return; }

    try {
      const thisMonth = {
        from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        to: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      };

      const revRow = db.exec(
        `SELECT COALESCE(SUM(total_amount),0) FROM sales_invoices WHERE date BETWEEN ? AND ? AND invoice_status != 'VOID'`,
        [thisMonth.from, thisMonth.to]
      );
      const expRow = db.exec(
        `SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date BETWEEN ? AND ?`,
        [thisMonth.from, thisMonth.to]
      );
      const receivRow = db.exec(`SELECT COALESCE(SUM(current_balance),0) FROM customers WHERE current_balance > 0`);
      const payRow = db.exec(`SELECT COALESCE(SUM(current_balance),0) FROM suppliers WHERE current_balance > 0`);
      const cashRow = db.exec(`SELECT COALESCE(SUM(current_balance),0) FROM cash_registers WHERE is_active = 1`);
      const invValRow = db.exec(`
        SELECT COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0)
        FROM warehouse_stock ws
        JOIN products p ON ws.product_id = p.id
      `);

      const rev = Number(revRow[0]?.values[0]?.[0] || 0);
      const exp = Number(expRow[0]?.values[0]?.[0] || 0);
      const grossProfitRow = db.exec(
        `SELECT COALESCE(SUM(gross_profit),0) FROM sales_invoices WHERE date BETWEEN ? AND ? AND invoice_status != 'VOID'`,
        [thisMonth.from, thisMonth.to]
      );
      const grossProfit = Number(grossProfitRow[0]?.values[0]?.[0] || 0);

      setMetrics({
        totalRevenue: rev,
        totalExpenses: exp,
        netProfit: grossProfit - exp,
        totalReceivables: Number(receivRow[0]?.values[0]?.[0] || 0),
        totalPayables: Number(payRow[0]?.values[0]?.[0] || 0),
        cashBalance: Number(cashRow[0]?.values[0]?.[0] || 0),
        inventoryValue: Number(invValRow[0]?.values[0]?.[0] || 0),
      });

      // 6-month chart
      const sixMonths: { month: string; revenue: number; expenses: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const from = format(startOfMonth(d), 'yyyy-MM-dd');
        const to = format(endOfMonth(d), 'yyyy-MM-dd');
        const rRow = db.exec(`SELECT COALESCE(SUM(total_amount),0) FROM sales_invoices WHERE date BETWEEN ? AND ? AND invoice_status != 'VOID'`, [from, to]);
        const eRow = db.exec(`SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date BETWEEN ? AND ?`, [from, to]);
        sixMonths.push({
          month: format(d, 'MMM'),
          revenue: Number(rRow[0]?.values[0]?.[0] || 0),
          expenses: Number(eRow[0]?.values[0]?.[0] || 0),
        });
      }
      setMonthlyData(sixMonths);

      // Load Chart of Accounts
      const accs = financeService.getAccounts();
      setAccounts(accs);
      if (accs.length >= 2) {
        setDebitAccId((current) => current || accs[0].id);
        setCreditAccId((current) => current || accs[1].id);
      }

      const entries = financeService.getJournalEntries(30);
      setJournalEntries(entries);
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : 'تعذر تحميل بيانات المركز المالي.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      financeService.createAccount({ code: newAccCode, name: newAccName, type: newAccType });
      setShowAddAccountModal(false);
      setNewAccCode('');
      setNewAccName('');
      loadData();
    } catch (err: any) {
      alert(`خطأ: ${err?.message}`);
    }
  };

  const handleCreateJournalEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (debitAccId === creditAccId) {
      alert('لا يمكن أن يكون حساب المدين والدائن متطابقين.');
      return;
    }

    try {
      const jId = financeService.createJournalEntry({
        date: format(new Date(), 'yyyy-MM-dd'),
        description: entryDesc,
        createdBy: '',
        lines: [
          { accountId: debitAccId, debit: entryAmount, credit: 0 },
          { accountId: creditAccId, debit: 0, credit: entryAmount },
        ],
      });
      const createdEntry = financeService.getJournalEntries(1).find((entry) => entry.id === jId);
      alert(`✅ تم حفظ وترحيل القيد اليومي رقم ${createdEntry?.entryNumber ?? ''} بنجاح!`);
      setShowAddEntryModal(false);
      setEntryDesc('');
      loadData();
    } catch (err: any) {
      alert(`خطأ أثناء إنشاء القيد: ${err?.message}`);
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n) + ' ج';

  const cards = [
    { label: 'إيرادات المبيعات (الشهر)', value: fmt(metrics.totalRevenue), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { label: 'المصروفات والتشغيل (الشهر)', value: fmt(metrics.totalExpenses), icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-500/10 border-rose-500/20' },
    { label: 'صافي أرباح المعرض', value: fmt(metrics.netProfit), icon: DollarSign, color: metrics.netProfit >= 0 ? 'text-sky-600' : 'text-rose-600', bg: 'bg-sky-500/10 border-sky-500/20' },
    { label: 'الذمم المدينة (حقوقنا لدى العملاء)', value: fmt(metrics.totalReceivables), icon: ArrowUpRight, color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/20' },
    { label: 'الذمم الدائنة (مستحقات المصانع)', value: fmt(metrics.totalPayables), icon: ArrowDownRight, color: 'text-violet-600', bg: 'bg-violet-500/10 border-violet-500/20' },
    { label: 'رصيد الخزائن النقدية', value: fmt(metrics.cashBalance), icon: Wallet, color: 'text-teal-600', bg: 'bg-teal-500/10 border-teal-500/20' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-900 p-6 space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">المركز المالي والمحاسبة العامة (General Ledger & Finance)</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            شجرة الحسابات، قيود اليومية، ميزان المراجعة، ومؤشرات الأرباح والخسائر
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tabs */}
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 text-xs">
            <button
              onClick={() => setActiveTab('OVERVIEW')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
 activeTab === 'OVERVIEW'
 ? 'bg-sky-600 text-slate-900 shadow'
 : 'text-slate-500 hover:text-slate-900'
 }`}
            >
              نظرة عامة والرسوم
            </button>
            <button
              onClick={() => setActiveTab('CHART_OF_ACCOUNTS')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
 activeTab === 'CHART_OF_ACCOUNTS'
 ? 'bg-sky-600 text-slate-900 shadow'
 : 'text-slate-500 hover:text-slate-900'
 }`}
            >
              شجرة الحسابات ({accounts.length})
            </button>
            <button
              onClick={() => setActiveTab('JOURNAL_ENTRIES')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
 activeTab === 'JOURNAL_ENTRIES'
 ? 'bg-sky-600 text-slate-900 shadow'
 : 'text-slate-500 hover:text-slate-900'
 }`}
            >
              دفتر قيود اليومية ({journalEntries.length})
            </button>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-300 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {activeTab === 'OVERVIEW' && (
        <>
          {loadError && (
            <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              تعذر تحميل بعض بيانات المركز المالي: {loadError}
            </div>
          )}
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map(c => {
              const Icon = c.icon;
              return (
                <div key={c.label} className={`rounded-2xl border p-4 ${c.bg} shadow-sm`}>
                  <Icon className={`w-5 h-5 ${c.color} mb-2`} />
                  <div className={`text-base font-black ${c.color}`}>{c.value}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{c.label}</div>
                </div>
              );
            })}
          </div>

          {/* 6-Month Chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-sky-600" />
                تحليل الإيرادات والمصروفات الشهرية (آخر 6 أشهر)
              </h3>
              <span className="text-xs text-slate-500">تحديث فوري من فواتير المبيعات والمصروفات</span>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
                  formatter={(val: number) => [fmt(val)]}
                />
                <Bar dataKey="revenue" name="إيرادات المبيعات" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" name="المصروفات" fill="#f43f5e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {activeTab === 'CHART_OF_ACCOUNTS' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                دليل وشجرة الحسابات العامة (Chart of Accounts)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">تصنيف الأصول والخصوم وحقوق الملكية والإيرادات والمصروفات</p>
            </div>

            <button
              onClick={() => setShowAddAccountModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              إضافة حساب محاسبي جديد
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">كود الحساب</th>
                  <th className="p-3">اسم الحساب المحاسبي</th>
                  <th className="p-3">نوع الحساب</th>
                  <th className="p-3">الرصيد التراكمي</th>
                  <th className="p-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/40">
                {accounts.map(acc => (
                  <tr key={acc.id} className="hover:bg-slate-100 transition">
                    <td className="p-3 font-mono font-bold text-sky-600">{acc.code}</td>
                    <td className="p-3 font-bold text-slate-900">{acc.name}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
 acc.type === 'ASSET' ? 'bg-emerald-500/10 text-emerald-600' :
 acc.type === 'LIABILITY' ? 'bg-amber-500/10 text-amber-600' :
 acc.type === 'EQUITY' ? 'bg-indigo-500/10 text-indigo-600' :
 acc.type === 'REVENUE' ? 'bg-teal-500/10 text-teal-600' :
 'bg-rose-500/10 text-rose-600'
 }`}>
                        {acc.type === 'ASSET' ? 'أصول' :
                         acc.type === 'LIABILITY' ? 'خصوم والتزامات' :
                         acc.type === 'EQUITY' ? 'حقوق ملكية' :
                         acc.type === 'REVENUE' ? 'إيرادات' : 'مصروفات'}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-black text-slate-800">{fmt(acc.balance)}</td>
                    <td className="p-3">
                      <span className="text-[10px] text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">نشط</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'JOURNAL_ENTRIES' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-600" />
                دفتر القيود اليومية المحاسبية (Journal Entries)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">توثيق القيود المزدوجة المتوازنة (مدين = دائن) المعتمدة</p>
            </div>

            <button
              onClick={() => setShowAddEntryModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              تسجيل قيد يومية يدوي جديد
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">رقم القيد</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">البيان / الوصف</th>
                  <th className="p-3">إجمالي المدين</th>
                  <th className="p-3">إجمالي الدائن</th>
                  <th className="p-3">الحالة والتوازن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/40">
                {journalEntries.map(je => (
                  <tr key={je.id} className="hover:bg-slate-100 transition">
                    <td className="p-3 font-mono font-bold text-amber-600">{je.entryNumber}</td>
                    <td className="p-3 font-mono text-slate-700">{je.date}</td>
                    <td className="p-3 text-slate-900 font-medium">{je.description}</td>
                    <td className="p-3 font-mono font-black text-emerald-600">{fmt(je.totalDebit)}</td>
                    <td className="p-3 font-mono font-black text-sky-600">{fmt(je.totalCredit)}</td>
                    <td className="p-3">
                      <span className="text-[10px] text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded font-bold flex items-center gap-1 w-max">
                        <CheckCircle2 className="w-3 h-3" />
                        متوازن ومرحّل
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 space-y-4 animate-scaleIn">
            <h3 className="text-sm font-black text-slate-900">إضافة حساب محاسبي جديد</h3>
            <form onSubmit={handleCreateAccount} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">كود الحساب (مثال: 1106)</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 1106"
                  value={newAccCode}
                  onChange={(e) => setNewAccCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الحساب</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: البنك الأهلي المصري - حساب جاري"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">تصنيف الحساب</label>
                <select
                  value={newAccType}
                  onChange={(e: any) => setNewAccType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                >
                  <option value="ASSET">أصول (Assets)</option>
                  <option value="LIABILITY">خصوم والتزامات (Liabilities)</option>
                  <option value="EQUITY">حقوق ملكية (Equity)</option>
                  <option value="REVENUE">إيرادات (Revenues)</option>
                  <option value="EXPENSE">مصروفات (Expenses)</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs"
                >
                  حفظ الحساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Journal Entry Modal */}
      {showAddEntryModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 space-y-4 animate-scaleIn">
            <h3 className="text-sm font-black text-slate-900">تسجيل قيد يومية محاسبي مزدوج</h3>
            <form onSubmit={handleCreateJournalEntry} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">البيان / الوصف</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: سداد دفعة إيجار المعرض من الخزينة الرئيسية"
                  value={entryDesc}
                  onChange={(e) => setEntryDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">حساب المدين (من حـ/)</label>
                  <select
                    value={debitAccId}
                    onChange={(e) => setDebitAccId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">حساب الدائن (إلى حـ/)</label>
                  <select
                    value={creditAccId}
                    onChange={(e) => setCreditAccId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">مبلغ القيد (ج.م)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={entryAmount}
                  onChange={(e) => setEntryAmount(Number(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono"
                />
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>الطرف المدين: {fmt(entryAmount)}</span>
                  <span>الطرف الدائن: {fmt(entryAmount)}</span>
                </div>
                <div className="text-emerald-600 font-bold">القيد متوازن تماماً (Difference = 0)</div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddEntryModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs"
                >
                  ترحيل وتأكيد القيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
