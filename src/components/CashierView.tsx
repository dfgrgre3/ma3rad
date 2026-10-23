import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Wallet, DollarSign, ArrowUpRight, ArrowDownRight, 
  Plus, CheckCircle, Clock, AlertCircle, RefreshCw, X, Loader2
} from 'lucide-react';
import { CashierService } from '../services/CashierService';
import { CashRegister, CashShift, Expense, ExpenseCategory, PaymentType } from '../types';
import { CeramicMath } from '../utils/ceramicMath';

// Singleton instance to prevent re-creation on every render
const cashierService = new CashierService();

export const CashierView: React.FC = () => {
  // --- State Management ---
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // UI States
  const [isOpenShiftModal, setIsOpenShiftModal] = useState(false);
  const [isCloseShiftModal, setIsCloseShiftModal] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

  // Form States
  const [openingBalance, setOpeningBalance] = useState(500);
  const [actualEndingCash, setActualEndingCash] = useState(0);
  const [closingNotes, setClosingNotes] = useState('');

  const [expenseData, setExpenseData] = useState({
    category: '',
    amount: 150,
    recipient: '',
    description: '',
    paymentType: 'CASH' as PaymentType
  });

  // --- Helpers & Memoization ---
  
  // Calculate expected cash safely
  const expectedEndingCash = useMemo(() => {
    if (!activeShift) return 0;
    return Number((
      activeShift.openingBalance +
      activeShift.totalSalesCash +
      activeShift.totalCustomerPayments -
      activeShift.totalSupplierPayments -
      activeShift.totalExpenses -
      activeShift.totalRefunds
    ).toFixed(2));
  }, [activeShift]);

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // --- Data Fetching ---
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      // Simulate async behavior if service is sync but heavy, or just wrap for consistency
      const regs = cashierService.getAllRegisters();
      const shift = cashierService.getActiveShift();
      const exps = cashierService.getAllExpenses();
      const cats = cashierService.getExpenseCategories();

      setRegisters(regs);
      setActiveShift(shift);
      setExpenses(exps);
      setCategories(cats);

      // Set default expense category if empty
      if (cats.length > 0 && !expenseData.category) {
        setExpenseData(prev => ({ ...prev, category: cats[0].name }));
      }

      if (shift) {
        // Sync actual ending cash input with expected when opening modal
        setActualEndingCash(Number((
          shift.openingBalance + shift.totalSalesCash + shift.totalCustomerPayments -
          shift.totalSupplierPayments - shift.totalExpenses - shift.totalRefunds
        ).toFixed(2)));
      }
    } catch (e: any) {
      console.error(e);
      showNotification('error', `فشل تحميل البيانات: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [showNotification, expenseData.category]); // Added dependency carefully

  useEffect(() => {
    loadData();
  }, []); // Run once on mount

  // --- Handlers ---
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      cashierService.openShift('cr_main', 'usr_admin', openingBalance);
      setIsOpenShiftModal(false);
      await loadData();
      showNotification('success', 'تم فتح الوردية بنجاح.');
    } catch (err: any) {
      showNotification('error', `خطأ: ${err.message || err}`);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    try {
      cashierService.closeShift(activeShift.id, actualEndingCash, closingNotes);
      setIsCloseShiftModal(false);
      setClosingNotes('');
      await loadData();
      showNotification('success', 'تم إغلاق الوردية وتسوية العجز/الزيادة.');
    } catch (err: any) {
      showNotification('error', `خطأ: ${err.message || err}`);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) {
      showNotification('error', 'لا يمكن صرف مصروفات بدون فتح وردية نشطة.');
      return;
    }
    try {
      cashierService.addExpense(
        expenseData.category,
        expenseData.amount,
        expenseData.description,
        'cr_main',
        activeShift.id,
        expenseData.paymentType,
        expenseData.recipient
      );
      setIsExpenseModalOpen(false);
      // Reset form partially
      setExpenseData(prev => ({ ...prev, amount: 150, description: '', recipient: '' }));
      await loadData();
      showNotification('success', 'تم تسجيل سند الصرف وخصمه من الخزينة.');
    } catch (err: any) {
      showNotification('error', `خطأ: ${err.message || err}`);
    }
  };

  const defaultReg = registers[0];

  if (isLoading && registers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin ml-2" />
        جاري تحميل بيانات الخزينة...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative" dir="rtl">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-6 left-6 z-[60] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2 fade-in duration-300 ${
 notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
 }`}>
          {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-bold text-sm">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-600" />
            الخزينة النقدية والورديات
          </h2>
          <p className="text-xs text-slate-500 mt-1">إدارة ورديات الكاشير، متابعة رصيد الدرج، وتسجيل المصروفات التشغيلية</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {activeShift ? (
            <button
              onClick={() => setIsCloseShiftModal(true)}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-amber-600/20 transition-all active:scale-95 text-xs"
            >
              <Clock className="w-4 h-4" />
              <span>إغلاق الوردية ({activeShift.shiftNumber})</span>
            </button>
          ) : (
            <button
              onClick={() => setIsOpenShiftModal(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95 text-xs"
            >
              <Clock className="w-4 h-4" />
              <span>فتح وردية جديدة</span>
            </button>
          )}

          <button
            onClick={() => setIsExpenseModalOpen(true)}
            disabled={!activeShift}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/20 transition-all active:scale-95 text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>سند صرف مصروف</span>
          </button>
          
          <button 
            onClick={loadData}
            className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Cash Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Main Treasury Balance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">رصيد الخزينة الرئيسي</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {CeramicMath.formatCurrency(defaultReg?.currentBalance || 0)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            الرصيد النقدي المتوفر بالدرج
          </div>
        </div>

        {/* Current Active Shift */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">حالة الوردية الحالية</span>
            <div className={`w-3 h-3 rounded-full ${activeShift ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-slate-300 '}`} />
          </div>
          <div className="text-lg font-extrabold text-slate-900">
            {activeShift ? `وردية #${activeShift.shiftNumber}` : 'لا توجد وردية نشطة'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {activeShift 
              ? `مبيعات نقدية: ${CeramicMath.formatCurrency(activeShift.totalSalesCash)}` 
              : 'يجب فتح وردية للبدء في العمليات'}
          </div>
        </div>

        {/* Total Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">إجمالي المصروفات</span>
            <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-600 flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-red-600 tracking-tight">
            {CeramicMath.formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">مصاريف تشغيلية ونظافة ونقل</div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-100 ">
          <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-slate-500" />
            سجل سندات صرف المصروفات
          </h3>
          <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded-md">
            {expenses.length} سجل
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">بند المصروف</th>
                <th className="p-3.5">المبلغ</th>
                <th className="p-3.5">المستلم</th>
                <th className="p-3.5 min-w-[200px]">البيان</th>
                <th className="p-3.5">طريقة الصرف</th>
                <th className="p-3.5">المستخدم</th>
                <th className="p-3.5">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 ">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-1">
                      <CheckCircle className="w-6 h-6 opacity-50" />
                    </div>
                    لا توجد مصروفات مسجلة في هذه الفترة
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-100 transition-colors group">
                    <td className="p-3.5 font-bold text-slate-900">{exp.category}</td>
                    <td className="p-3.5 font-black text-red-600 text-sm tabular-nums">{CeramicMath.formatCurrency(exp.amount)}</td>
                    <td className="p-3.5 text-slate-700">{exp.recipient || '-'}</td>
                    <td className="p-3.5 text-slate-500 max-w-xs truncate" title={exp.description}>{exp.description}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold border ${
 exp.paymentType === 'CASH' 
 ? 'bg-emerald-50 border-emerald-100 text-emerald-700 ' 
 : 'bg-blue-50 text-blue-600'
 }`}>
                        {exp.paymentType === 'CASH' ? 'نقدي' : 'تحويل'}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600 ">{exp.performedByName || 'المدير'}</td>
                    <td className="p-3.5 font-mono text-slate-500 text-[11px] tabular-nums">{exp.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODALS --- */}
      
      {/* Open Shift Modal */}
      {isOpenShiftModal && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">فتح وردية جديدة</h3>
            </div>

            <form onSubmit={handleOpenShift} className="space-y-4">
              <div>
                <label className="font-bold text-xs text-slate-700 block mb-1.5">الرصيد الافتتاحي (ج.م) *</label>
                <input
                  type="number"
                  required
                  autoFocus
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 font-black text-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpenShiftModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-[2] px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98]"
                >
                  تأكيد الفتح
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {isCloseShiftModal && activeShift && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">تصفية وإغلاق الوردية</h3>
              <button onClick={() => setIsCloseShiftModal(false)} className="text-slate-500 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl space-y-2.5 text-xs border border-slate-100 ">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">الرصيد الافتتاحي:</span>
                <span className="font-bold text-slate-900">{CeramicMath.formatCurrency(activeShift.openingBalance)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">(+ ) مبيعات وتحصيلات:</span>
                <span className="font-bold text-emerald-600">{CeramicMath.formatCurrency(activeShift.totalSalesCash + activeShift.totalCustomerPayments)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">(-) مصروفات ومدفوعات:</span>
                <span className="font-bold text-red-500">{CeramicMath.formatCurrency(activeShift.totalExpenses + activeShift.totalSupplierPayments + activeShift.totalRefunds)}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between items-center">
                <span className="font-black text-slate-900">المبلغ المتوقع:</span>
                <span className="font-black text-sky-600 text-base">{CeramicMath.formatCurrency(expectedEndingCash)}</span>
              </div>
            </div>

            <form onSubmit={handleCloseShift} className="space-y-4">
              <div>
                <label className="font-bold text-xs text-slate-700 block mb-1.5">المبلغ الفعلي بعد العد *</label>
                <input
                  type="number"
                  required
                  autoFocus
                  value={actualEndingCash}
                  onChange={(e) => setActualEndingCash(parseFloat(e.target.value) || 0)}
                  className={`w-full px-4 py-3 bg-slate-50 rounded-xl border font-black text-lg outline-none transition-all ${
 Math.abs(actualEndingCash - expectedEndingCash) > 0.01 
 ? 'border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-amber-600' 
 : 'border-slate-200 focus:ring-2 focus:border-emerald-500'
 }`}
                />
                {Math.abs(actualEndingCash - expectedEndingCash) > 0.01 && (
                  <p className="text-[10px] text-amber-600 mt-1 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    يوجد فرق مقداره: {CeramicMath.formatCurrency(actualEndingCash - expectedEndingCash)}
                  </p>
                )}
              </div>

              <div>
                <label className="font-bold text-xs text-slate-700 block mb-1.5">ملاحظات الإغلاق</label>
                <textarea
                  rows={2}
                  placeholder="اكتب سبب العجز أو الزيادة إن وجد..."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm resize-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCloseShiftModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  className="flex-[2] px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-lg shadow-amber-600/20 transition-all active:scale-[0.98]"
                >
                  اعتماد الإغلاق
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
             <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">سند صرف مصروفات</h3>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="font-bold text-xs text-slate-700 block mb-1.5">بند المصروف *</label>
                  <select
                    required
                    value={expenseData.category}
                    onChange={(e) => setExpenseData({ ...expenseData, category: e.target.value })}
                    className="w-full px-3 py-3 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-sky-500"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                 <div className="col-span-2 sm:col-span-1">
                  <label className="font-bold text-xs text-slate-700 block mb-1.5">المبلغ (ج.م) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.5"
                    value={expenseData.amount}
                    onChange={(e) => setExpenseData({ ...expenseData, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-3 bg-slate-50 rounded-xl border border-slate-200 font-black text-sm text-red-600 outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-xs text-slate-700 block mb-1.5">المستلم / الجهة</label>
                <input
                  type="text"
                  placeholder="مثال: عامل النظافة / شركة الكهرباء"
                  value={expenseData.recipient}
                  onChange={(e) => setExpenseData({ ...expenseData, recipient: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="font-bold text-xs text-slate-700 block mb-1.5">البيان والشرح *</label>
                <input
                  type="text"
                  required
                  placeholder="تفاصيل الغرض من الصرف..."
                  value={expenseData.description}
                  onChange={(e) => setExpenseData({ ...expenseData, description: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-100 mt-4">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-[2] px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 transition-all active:scale-[0.98]"
                >
                  حفظ وصرف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};