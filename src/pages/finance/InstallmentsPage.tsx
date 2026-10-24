import React, { useState, useEffect } from 'react';
import {
  CalendarDays, Plus, Search, Calendar, CheckCircle2, AlertTriangle,
  User, CreditCard, DollarSign, Clock, Check, Printer, FileText, ArrowUpRight
} from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { CustomerService } from '../../services/CustomerService';
import { Customer } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface InstallmentRow {
  id: string;
  planId: string;
  planNumber: string;
  sequenceNumber: number;
  totalInstallments: number;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  paidAt?: string;
  status: 'UPCOMING' | 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';
}

interface InstallmentPlanRecord {
  id: string;
  planNumber: string;
  customerId: string;
  customerName: string;
  totalAmount: number;
  downPayment: number;
  financedAmount: number;
  installmentsCount: number;
  installmentAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
  startDate: string;
}

export const InstallmentsPage: React.FC = () => {
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [plans, setPlans] = useState<InstallmentPlanRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'INSTALLMENTS' | 'PLANS'>('INSTALLMENTS');

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [totalFinanced, setTotalFinanced] = useState<number>(36000);
  const [downPayment, setDownPayment] = useState<number>(6000);
  const [monthsCount, setMonthsCount] = useState<number>(6);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  const customerService = new CustomerService();

  const loadData = () => {
    const db = DatabaseManager.getInstance().getDb();
    if (!db) return;

    try {
      const allCusts = customerService.getAllCustomers();
      setCustomers(allCusts);
      if (allCusts.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(allCusts[0].id);
      }

      // Check if plans exist
      const plansRes = db.exec(`
        SELECT ip.id, ip.plan_number, ip.customer_id, c.name as customer_name,
               ip.total_amount, ip.down_payment, ip.financed_amount, ip.installments_count,
               ip.installment_amount, ip.paid_amount, ip.remaining_amount, ip.status, ip.start_date
        FROM installment_plans ip
        LEFT JOIN customers c ON ip.customer_id = c.id
        ORDER BY ip.created_at DESC
      `);

      if (plansRes.length > 0 && plansRes[0].values.length > 0) {
        const pRows: InstallmentPlanRecord[] = plansRes[0].values.map((r: any[]) => ({
          id: String(r[0]),
          planNumber: String(r[1]),
          customerId: String(r[2]),
          customerName: String(r[3] || 'عميل'),
          totalAmount: Number(r[4] || 0),
          downPayment: Number(r[5] || 0),
          financedAmount: Number(r[6] || 0),
          installmentsCount: Number(r[7] || 0),
          installmentAmount: Number(r[8] || 0),
          paidAmount: Number(r[9] || 0),
          remainingAmount: Number(r[10] || 0),
          status: (r[11] || 'ACTIVE') as any,
          startDate: String(r[12]),
        }));
        setPlans(pRows);

        // Load all installments
        const instRes = db.exec(`
          SELECT i.id, i.plan_id, ip.plan_number, i.sequence_number, ip.installments_count,
                 ip.customer_id, c.name, c.phone, i.amount, i.paid_amount, i.due_date, i.paid_at, i.status
          FROM installments i
          JOIN installment_plans ip ON i.plan_id = ip.id
          LEFT JOIN customers c ON ip.customer_id = c.id
          ORDER BY i.due_date ASC
        `);

        if (instRes.length > 0 && instRes[0].values.length > 0) {
          const iRows: InstallmentRow[] = instRes[0].values.map((r: any[]) => {
            const dueDate = String(r[10]);
            let status = String(r[12] || 'UPCOMING');
            const isPaid = status === 'PAID';
            const isOverdue = !isPaid && new Date(dueDate) < new Date();
            if (isOverdue) status = 'OVERDUE';

            return {
              id: String(r[0]),
              planId: String(r[1]),
              planNumber: String(r[2]),
              sequenceNumber: Number(r[3]),
              totalInstallments: Number(r[4]),
              customerId: String(r[5]),
              customerName: String(r[6] || 'عميل'),
              customerPhone: r[7] ? String(r[7]) : undefined,
              amount: Number(r[8] || 0),
              paidAmount: Number(r[9] || 0),
              dueDate,
              paidAt: r[11] ? String(r[11]) : undefined,
              status: status as any,
            };
          });
          setInstallments(iRows);
        }
      } else {
        // Seed default plan if empty
        if (allCusts.length > 0) {
          const cust = allCusts[0];
          const planId = uuidv4();
          const planNum = 'PLN-2026-001';
          const tot = 30000;
          const down = 6000;
          const fin = tot - down;
          const count = 6;
          const monthly = fin / count;
          const today = new Date();

          db.run(`
            INSERT INTO installment_plans (
              id, plan_number, customer_id, total_amount, down_payment, financed_amount,
              installments_count, installment_amount, start_date, paid_amount, remaining_amount, status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'ACTIVE', 'usr_admin')
          `, [planId, planNum, cust.id, tot, down, fin, count, monthly, today.toISOString().split('T')[0], fin]);

          for (let seq = 1; seq <= count; seq++) {
            const due = new Date();
            due.setMonth(due.getMonth() + seq - 1);
            const dueStr = due.toISOString().split('T')[0];
            const isPassed = seq === 1 && due < new Date();

            db.run(`
              INSERT INTO installments (id, plan_id, sequence_number, due_date, amount, paid_amount, remaining_amount, status)
              VALUES (?, ?, ?, ?, ?, 0, ?, ?)
            `, [uuidv4(), planId, seq, dueStr, monthly, monthly, isPassed ? 'OVERDUE' : 'UPCOMING']);
          }

          DatabaseManager.getInstance().saveToStorage();
          loadData();
        }
      }
    } catch (e) {
      console.error('Error loading installments', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    const db = DatabaseManager.getInstance().getDb();
    if (!db) return;

    try {
      const planId = uuidv4();
      const year = new Date().getFullYear();
      const planSequence = db.query<{ nextNumber: number }>(
        `SELECT COALESCE(MAX(CAST(SUBSTR(plan_number, 10) AS INTEGER)), 0) + 1 AS nextNumber
         FROM installment_plans WHERE plan_number LIKE ?`,
        [`PLN-${year}-%`]
      )[0]?.nextNumber ?? 1;
      const planNum = `PLN-${year}-${String(planSequence).padStart(4, '0')}`;
      const financed = Math.max(0, totalFinanced - downPayment);
      const monthlyAmount = Math.round(financed / monthsCount);

      db.run(`
        INSERT INTO installment_plans (
          id, plan_number, customer_id, total_amount, down_payment, financed_amount,
          installments_count, installment_amount, start_date, paid_amount, remaining_amount, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'ACTIVE', 'usr_admin')
      `, [
        planId,
        planNum,
        selectedCustomerId,
        totalFinanced,
        downPayment,
        financed,
        monthsCount,
        monthlyAmount,
        startDate,
        financed
      ]);

      // Generate monthly installments
      const baseDate = new Date(startDate);
      for (let i = 1; i <= monthsCount; i++) {
        const d = new Date(baseDate);
        d.setMonth(d.getMonth() + i);
        const dueStr = d.toISOString().split('T')[0];

        db.run(`
          INSERT INTO installments (
            id, plan_id, sequence_number, due_date, amount, paid_amount, remaining_amount, status
          ) VALUES (?, ?, ?, ?, ?, 0, ?, 'UPCOMING')
        `, [
          uuidv4(),
          planId,
          i,
          dueStr,
          monthlyAmount,
          monthlyAmount
        ]);
      }

      DatabaseManager.getInstance().saveToStorage();
      alert(`✅ تم إنشاء خطة التقسيط رقم ${planNum} بنجاح (${monthsCount} أقساط شهرية)!`);
      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      alert(`خطأ أثناء إنشاء خطة التقسيط: ${err?.message}`);
    }
  };

  const handlePayInstallment = (inst: InstallmentRow) => {
    if (inst.status === 'PAID') {
      alert('هذا القسط مسدد بالفعل.');
      return;
    }

    const confirmPay = window.confirm(`تأكيد استلام وسداد القسط رقم (${inst.sequenceNumber} من ${inst.totalInstallments}) بقيمة ${inst.amount} ج من العميل: ${inst.customerName}؟`);
    if (!confirmPay) return;

    const db = DatabaseManager.getInstance().getDb();
    if (!db) return;

    try {
      const nowStr = new Date().toISOString();
      const year = new Date().getFullYear();
      const receiptSequence = db.query<{ nextNumber: number }>(
        `SELECT COALESCE(MAX(CAST(SUBSTR(receipt_number, 15) AS INTEGER)), 0) + 1 AS nextNumber
         FROM customer_payments WHERE receipt_number LIKE ?`,
        [`RCP-INST-${year}-%`]
      )[0]?.nextNumber ?? 1;
      const receiptNum = `RCP-INST-${year}-${String(receiptSequence).padStart(5, '0')}`;

      // 1. Mark installment as PAID
      db.run(`
        UPDATE installments
        SET status = 'PAID',
            paid_amount = ?,
            remaining_amount = 0,
            paid_at = ?
        WHERE id = ?
      `, [inst.amount, nowStr, inst.id]);

      // 2. Record Customer Payment Receipt
      db.run(`
        INSERT INTO customer_payments (
          id, receipt_number, customer_id, amount, payment_type, date, notes, performed_by
        ) VALUES (?, ?, ?, ?, 'CASH', ?, ?, 'usr_admin')
      `, [
        uuidv4(),
        receiptNum,
        inst.customerId,
        inst.amount,
        nowStr.split('T')[0],
        `سداد قسط رقم ${inst.sequenceNumber}/${inst.totalInstallments} لخطة ${inst.planNumber}`
      ]);

      // 3. Update customer balance
      db.run(`
        UPDATE customers
        SET current_balance = current_balance - ?
        WHERE id = ?
      `, [inst.amount, inst.customerId]);

      // 4. Update Plan totals
      db.run(`
        UPDATE installment_plans
        SET paid_amount = paid_amount + ?,
            remaining_amount = remaining_amount - ?
        WHERE id = ?
      `, [inst.amount, inst.amount, inst.planId]);

      // 5. Update Cash Register
      db.run(`
        UPDATE cash_registers
        SET current_balance = current_balance + ?
        WHERE is_default = 1 OR is_active = 1
        LIMIT 1
      `, [inst.amount]);

      DatabaseManager.getInstance().saveToStorage();
      alert(`✅ تم تسجيل سداد القسط بنجاح!\nرقم الإيصال: ${receiptNum}\nتم إضافة ${inst.amount} ج إلى الخزينة وتخفيض مديونية العميل.`);
      loadData();
    } catch (err: any) {
      alert(`خطأ أثناء سداد القسط: ${err?.message}`);
    }
  };

  const filteredInstallments = installments.filter(i => {
    const matchesSearch =
      i.customerName.includes(search) ||
      i.planNumber.toLowerCase().includes(search.toLowerCase()) ||
      (i.customerPhone && i.customerPhone.includes(search));
    const matchesStatus = statusFilter === 'ALL' || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalFinancedSum = plans.reduce((acc, p) => acc + p.financedAmount, 0);
  const totalPaidSum = plans.reduce((acc, p) => acc + p.paidAmount, 0);
  const overdueCount = installments.filter(i => i.status === 'OVERDUE').length;

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n) + ' ج';

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">إدارة الأقساط والتحصيلات المجدولة (Installment Plans)</h1>
            <p className="text-xs text-slate-500 font-medium">
              جدولة الأقساط الشهرية، تسجيل سندات السداد، ومتابعة المتأخرات مع إدراجها بالخزينة تلقائياً
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold transition shrink-0 shadow-lg shadow-amber-600/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          إنشاء خطة تقسيط جديدة
        </button>
      </div>

      {/* Metrics Row */}
      <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3 bg-white border-b border-slate-200">
        <div className="p-3 bg-white rounded-xl border border-slate-200">
          <span className="text-[11px] text-slate-500 font-semibold block">إجمالي مبالغ التقسيط</span>
          <span className="text-sm font-black text-slate-900 mt-1 block">{fmt(totalFinancedSum)}</span>
        </div>

        <div className="p-3 bg-white rounded-xl border border-slate-200">
          <span className="text-[11px] text-slate-500 font-semibold block">المحصل من الأقساط</span>
          <span className="text-sm font-black text-emerald-600 mt-1 block">{fmt(totalPaidSum)}</span>
        </div>

        <div className="p-3 bg-white rounded-xl border border-slate-200">
          <span className="text-[11px] text-slate-500 font-semibold block">المتبقي قيد التحصيل</span>
          <span className="text-sm font-black text-sky-600 mt-1 block">{fmt(totalFinancedSum - totalPaidSum)}</span>
        </div>

        <div className="p-3 bg-white rounded-xl border border-slate-200">
          <span className="text-[11px] text-slate-500 font-semibold block">الأقساط المتأخرة</span>
          <span className="text-sm font-black text-rose-600 mt-1 block">{overdueCount} أقساط متأخرة</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-white border-b border-slate-200/80 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث باسم العميل أو رقم الخطة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500/50 transition font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">جميع الحالات</option>
            <option value="OVERDUE">متأخر عن موعده</option>
            <option value="UPCOMING">قادم ومستحق</option>
            <option value="PAID">مسدد بالكامل</option>
          </select>
        </div>
      </div>

      {/* Installments Table / Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInstallments.map((inst) => (
            <div
              key={inst.id}
              className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 transition flex flex-col justify-between shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-mono font-bold border border-slate-300">
                    القسط {inst.sequenceNumber} من {inst.totalInstallments}
                  </span>

                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
 inst.status === 'PAID'
 ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
 : inst.status === 'OVERDUE'
 ? 'bg-rose-500/10 border-rose-500/20 animate-pulse'
 : 'bg-amber-500/10 border-amber-500/20'
 }`}
                  >
                    {inst.status === 'PAID' ? 'تم السداد' : inst.status === 'OVERDUE' ? 'متأخر ومستحق' : 'قادم ومستحق'}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm mb-1">{inst.customerName}</h3>
                <span className="text-[11px] text-slate-500 font-mono block mb-3">
                  الخطة: {inst.planNumber}
                </span>

                <div className="space-y-1.5 text-xs text-slate-500 mb-4 bg-white p-3 rounded-xl border border-slate-200/60">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-600" />
                      تاريخ الاستحقاق:
                    </span>
                    <span className={`font-mono font-bold ${inst.status === 'OVERDUE' ? 'text-rose-600' : 'text-slate-700'}`}>
                      {inst.dueDate}
                    </span>
                  </div>

                  {inst.paidAt && (
                    <div className="flex items-center justify-between text-emerald-600">
                      <span className="text-[11px] flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        تاريخ السداد:
                      </span>
                      <span className="font-mono">{inst.paidAt.split('T')[0]}</span>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl p-3 border border-slate-200 flex items-center justify-between">
                  <span className="text-xs text-slate-500">قيمة القسط:</span>
                  <span className="text-base font-black text-amber-600">{fmt(inst.amount)}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-end gap-2">
                {inst.status !== 'PAID' ? (
                  <button
                    onClick={() => handlePayInstallment(inst)}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    تسجيل سداد القسط بالخزينة
                  </button>
                ) : (
                  <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 py-1">
                    <CheckCircle2 className="w-4 h-4" />
                    تم السداد بالكامل
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Plan Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CalendarDays className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-black text-slate-900">إنشاء خطة تقسيط جديدة لعميل</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-500 hover:text-slate-900 text-lg font-mono p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">اختر العميل</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                >
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">إجمالي قيمة الفاتورة (ج.م)</label>
                  <input
                    type="number"
                    min="1000"
                    value={totalFinanced}
                    onChange={(e) => setTotalFinanced(Number(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">الدفعة المقدمة (مقدماً)</label>
                  <input
                    type="number"
                    min="0"
                    value={downPayment}
                    onChange={(e) => setDownPayment(Number(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">عدد الأقساط (شهور)</label>
                  <select
                    value={monthsCount}
                    onChange={(e) => setMonthsCount(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                  >
                    <option value={3}>3 شهور</option>
                    <option value={6}>6 شهور</option>
                    <option value={10}>10 شهور</option>
                    <option value={12}>12 شهر (سنة)</option>
                    <option value={24}>24 شهر (سنتين)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ أول قسط</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Summary Card */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">المبلغ المتبقي للتمويل:</span>
                  <span className="font-mono font-bold text-slate-900">{fmt(totalFinanced - downPayment)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">قيمة القسط الشهري المحسوبة:</span>
                  <span className="font-mono font-black text-amber-600">
                    {fmt(Math.round((totalFinanced - downPayment) / monthsCount))} / شهر
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/20"
                >
                  تأكيد وإنشاء خطة الأقساط
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
