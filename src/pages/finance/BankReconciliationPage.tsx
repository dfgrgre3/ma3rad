import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  FileSpreadsheet,
  Check,
  Scale,
} from 'lucide-react';
import { FinanceEnterpriseService } from '../../services/FinanceEnterpriseService';
import type { BankAccount, BankReconciliation } from '../../types/finance';
import { localDateString } from '../../utils/date';
import { useToast } from '../../components/ui/Toast';

export const BankReconciliationPage: React.FC = () => {
  const service = useMemo(() => new FinanceEnterpriseService(), []);
  const toast = useToast();

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [statementDate, setStatementDate] = useState<string>(localDateString());
  const [statementBalance, setStatementBalance] = useState<string>('0');

  const [unreconciledItems, setUnreconciledItems] = useState<any[]>([]);
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  const [historyReconciliations, setHistoryReconciliations] = useState<BankReconciliation[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');

  // New Bank Account Modal
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankForm, setBankForm] = useState({
    accountName: '',
    bankName: '',
    accountNumber: '',
    iban: '',
    swiftCode: '',
    currency: 'EGP',
    openingBalance: '0',
    glAccountId: 'acc_1102',
  });

  const loadData = () => {
    setLoading(true);
    try {
      const banks = service.getBankAccounts();
      setBankAccounts(banks);
      const activeBankId = selectedBankId || banks[0]?.id || '';
      setSelectedBankId(activeBankId);

      if (activeBankId) {
        const items = service.getUnreconciledBankTransactions(activeBankId, statementDate);
        setUnreconciledItems(items);
        setHistoryReconciliations(service.getBankReconciliations(activeBankId));
      }
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل بيانات البنوك.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedBankId) {
      try {
        const items = service.getUnreconciledBankTransactions(selectedBankId, statementDate);
        setUnreconciledItems(items);
        setClearedIds(new Set());
        setHistoryReconciliations(service.getBankReconciliations(selectedBankId));
      } catch (err: any) {
        toast.error(err?.message || 'تعذر تحميل حركات الحساب.');
      }
    }
  }, [selectedBankId, statementDate]);

  const activeBank = bankAccounts.find((b) => b.id === selectedBankId);

  // Calculations
  const clearedDeposits = useMemo(() => {
    return unreconciledItems
      .filter((i) => clearedIds.has(i.id) && i.type === 'DEPOSIT')
      .reduce((sum, i) => sum + i.amount, 0);
  }, [unreconciledItems, clearedIds]);

  const clearedWithdrawals = useMemo(() => {
    return unreconciledItems
      .filter((i) => clearedIds.has(i.id) && i.type === 'WITHDRAWAL')
      .reduce((sum, i) => sum + i.amount, 0);
  }, [unreconciledItems, clearedIds]);

  const bookBalance = activeBank?.currentBalance || 0;
  const numStatementBalance = Number(statementBalance) || 0;
  const variance = Math.round((numStatementBalance - bookBalance) * 100) / 100;

  const toggleCleared = (id: string) => {
    setClearedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllCleared = () => {
    if (clearedIds.size === unreconciledItems.length) {
      setClearedIds(new Set());
    } else {
      setClearedIds(new Set(unreconciledItems.map((i) => i.id)));
    }
  };

  const handleCreateBank = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = service.saveBankAccount({
        accountName: bankForm.accountName,
        bankName: bankForm.bankName,
        accountNumber: bankForm.accountNumber,
        iban: bankForm.iban || null,
        swiftCode: bankForm.swiftCode || null,
        currency: bankForm.currency,
        openingBalance: Number(bankForm.openingBalance) || 0,
        glAccountId: bankForm.glAccountId,
      });
      toast.success('تم إضافة الحساب البنكي بنجاح.');
      setShowBankModal(false);
      setSelectedBankId(id);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إضافة الحساب البنكي.');
    }
  };

  const handleReconcile = () => {
    if (!selectedBankId) return;
    setSaving(true);
    try {
      const clearedList = unreconciledItems.filter((i) => clearedIds.has(i.id));
      service.createBankReconciliation({
        bankAccountId: selectedBankId,
        statementDate,
        statementBalance: numStatementBalance,
        clearedTransactions: clearedList,
        notes,
      });
      toast.success('تم حفظ محضر مطابقة كشف الحساب البنكي بنجاح.');
      setNotes('');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حفظ المطابقة البنكية.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-slate-900 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">مطابقة كشف الحساب البنكي والصناديق</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              مقارنة رصيد كشف الحساب البنكي الخارجي برصيد الدفاتر وحركات القيود والشيكات المعلقة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            title="تحديث البيانات"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowBankModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>حساب بنكي جديد</span>
          </button>
        </div>
      </div>

      {/* Control Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <label className="block text-xs font-medium text-slate-500 mb-1">الحساب البنكي</label>
          <select
            value={selectedBankId}
            onChange={(e) => setSelectedBankId(e.target.value)}
            className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-slate-50"
          >
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.accountName} ({b.bankName})
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-400 mt-1 block">رقم الحساب: {activeBank?.accountNumber}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <label className="block text-xs font-medium text-slate-500 mb-1">تاريخ كشف الحساب</label>
          <input
            type="date"
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
            className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-2"
          />
          <span className="text-[11px] text-slate-400 mt-1 block">تاريخ إقفال كشف البنك الوارد</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <label className="block text-xs font-medium text-slate-500 mb-1">رصيد كشف الحساب الخارجي</label>
          <input
            type="number"
            step="0.01"
            value={statementBalance}
            onChange={(e) => setStatementBalance(e.target.value)}
            className="w-full text-sm font-bold font-mono border border-slate-200 rounded-lg p-2 bg-sky-50 text-sky-900"
          />
          <span className="text-[11px] text-slate-400 mt-1 block">المسجل في الورقة أو الملف الوارد من البنك</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">فارق المطابقة</span>
            {Math.abs(variance) < 0.01 ? (
              <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold">متطابق تماماً</span>
            ) : (
              <span className="text-[11px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded font-bold">يوجد فارق</span>
            )}
          </div>
          <div className={`text-lg font-black font-mono ${Math.abs(variance) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {variance.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {activeBank?.currency}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">رصيد الدفاتر الحالي: {bookBalance.toLocaleString()} {activeBank?.currency}</span>
        </div>
      </div>

      {/* Main Reconciliation Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Unreconciled Transactions Grid */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-800">حركات الحساب في الدفاتر المحاسبية</h2>
              <p className="text-xs text-slate-500">حدد الحركات الظاهرة في كشف الحساب لمطابقتها</p>
            </div>
            <button
              onClick={toggleAllCleared}
              className="text-xs font-semibold px-3 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg transition"
            >
              {clearedIds.size === unreconciledItems.length ? 'إلغاء تحديد الكل' : 'تحديد كل الحركات'}
            </button>
          </div>

          <div className="flex-1 overflow-auto max-h-[480px]">
            {loading ? (
              <div className="p-12 flex justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-sky-500 ml-2" />
                <span>جاري قراءة سجلات الدفاتر...</span>
              </div>
            ) : unreconciledItems.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                لا توجد حركات غير مطابقة لهذا الحساب حتى تاريخ {statementDate}.
              </div>
            ) : (
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-10 text-center">مطابقة</th>
                    <th className="p-3 font-semibold">التاريخ</th>
                    <th className="p-3 font-semibold">رقم المرجع / القيد</th>
                    <th className="p-3 font-semibold">البيان</th>
                    <th className="p-3 font-semibold text-left">المبلغ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unreconciledItems.map((item) => {
                    const isChecked = clearedIds.has(item.id);
                    const isDeposit = item.type === 'DEPOSIT';
                    return (
                      <tr
                        key={item.id}
                        onClick={() => toggleCleared(item.id)}
                        className={`cursor-pointer transition ${isChecked ? 'bg-sky-50/60 font-semibold' : 'hover:bg-slate-50'}`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 text-slate-600 font-mono">{item.date}</td>
                        <td className="p-3 font-mono font-bold text-slate-700">{item.reference}</td>
                        <td className="p-3 text-slate-800">{item.description}</td>
                        <td className="p-3 text-left font-mono font-bold">
                          <span className={isDeposit ? 'text-emerald-600' : 'text-slate-800'}>
                            {isDeposit ? '+' : '-'}{item.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>تم تحديد {clearedIds.size} من أصل {unreconciledItems.length} حركة</span>
            <div className="flex gap-4 font-mono font-bold">
              <span className="text-emerald-700">إيداعات: +{clearedDeposits.toLocaleString()}</span>
              <span className="text-slate-700">مسحوبات: -{clearedWithdrawals.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Right Col: Reconciliation Summary & Finalize */}
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">ملخص مذكرة التسوية البنكية</h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">رصيد كشف الحساب الخارجي:</span>
                <span className="font-bold font-mono">{numStatementBalance.toLocaleString()} {activeBank?.currency}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">إيداعات تمت مطابقتها:</span>
                <span className="font-bold font-mono text-emerald-600">+{clearedDeposits.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">مسحوبات وشيكات تمت مطابقتها:</span>
                <span className="font-bold font-mono text-rose-600">-{clearedWithdrawals.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">رصيد الدفاتر المحاسبية:</span>
                <span className="font-bold font-mono text-slate-800">{bookBalance.toLocaleString()} {activeBank?.currency}</span>
              </div>
              <div className="flex justify-between py-2 font-bold text-sm bg-slate-50 p-2 rounded-lg">
                <span>الفارق المتبقي:</span>
                <span className={Math.abs(variance) < 0.01 ? 'text-emerald-600 font-mono' : 'text-rose-600 font-mono'}>
                  {variance.toLocaleString()} {activeBank?.currency}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ملاحظات محضر المطابقة</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="تطابق كامل لكشف حساب شهر..."
                className="w-full text-xs border border-slate-200 rounded-xl p-2.5 h-20"
              />
            </div>

            <button
              onClick={handleReconcile}
              disabled={saving}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50"
            >
              {saving ? 'جاري حفظ المطابقة...' : 'حفظ واعتماد المطابقة البنكية'}
            </button>
          </div>

          {/* Past Reconciliations History */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h4 className="text-xs font-bold text-slate-800">محاضر المطابقة السابقة</h4>
            {historyReconciliations.length === 0 ? (
              <p className="text-[11px] text-slate-400">لا توجد محاضر مطابقة سابقة لهذا الحساب.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-auto">
                {historyReconciliations.map((h) => (
                  <div key={h.id} className="text-xs p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="font-bold block text-slate-800">{h.reconciliationNumber}</span>
                      <span className="text-[10px] text-slate-400">بتاريخ {h.statementDate} - بواسطة {h.reconciledByName}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">
                      معتمد
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: New Bank Account */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-4">إضافة حساب بنكي جديد</h3>
            <form onSubmit={handleCreateBank} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">اسم الحساب (للعرض والتمييز)</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: البنك الأهلي - جاري رئيسي"
                  value={bankForm.accountName}
                  onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">اسم البنك</label>
                  <input
                    type="text"
                    required
                    placeholder="البنك الأهلي المصري"
                    value={bankForm.bankName}
                    onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">العملة</label>
                  <select
                    value={bankForm.currency}
                    onChange={(e) => setBankForm({ ...bankForm, currency: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2 bg-slate-50 font-bold"
                  >
                    <option value="EGP">EGP - جنيه مصري</option>
                    <option value="SAR">SAR - ريال سعودي</option>
                    <option value="USD">USD - دولار أمريكي</option>
                    <option value="EUR">EUR - يورو</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">رقم الحساب</label>
                <input
                  type="text"
                  required
                  value={bankForm.accountNumber}
                  onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">رقم الآيبان (IBAN) - اختياري</label>
                <input
                  type="text"
                  value={bankForm.iban}
                  onChange={(e) => setBankForm({ ...bankForm, iban: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">الرصيد الافتتاحي</label>
                <input
                  type="number"
                  step="0.01"
                  value={bankForm.openingBalance}
                  onChange={(e) => setBankForm({ ...bankForm, openingBalance: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2 font-mono font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBankModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700 shadow-sm"
                >
                  حفظ الحساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
