import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText, Download, Printer, Calendar, DollarSign,
  ArrowUpRight, ArrowDownRight, Building2, CheckCircle2,
  Clock, RefreshCw, Layers, Check, X, SlidersHorizontal
} from 'lucide-react';
import { SupplierService } from '../../services/SupplierService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { useToast } from '../../components/ui/Toast';
import { exportToExcel, exportToPdf } from '../../utils/export';
import type { Supplier } from '../../types';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';

export const SupplierStatementPage: React.FC = () => {
  const service = useMemo(() => new SupplierService(), []);
  const toast = useToast();
  const currentUser = AuthService.getCurrentUser();
  const canUpdate = PermissionService.can(currentUser, 'suppliers.payment')
    && PermissionService.can(currentUser, 'finance.debts.view');
  const canExport = PermissionService.can(currentUser, 'suppliers.export')
    && PermissionService.can(currentUser, 'finance.debts.view');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'statement' | 'matching'>('statement');
  const [statementData, setStatementData] = useState<any | null>(null);
  const [invoicesWithAlloc, setInvoicesWithAlloc] = useState<any[]>([]);
  const [paymentsWithAlloc, setPaymentsWithAlloc] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Reallocation Modal
  const [reallocModal, setReallocModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [allocDraft, setAllocDraft] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const sups = service.getAllSuppliers();
      setSuppliers(sups);
      if (sups.length > 0) {
        setSelectedSupplierId(sups[0].id);
      }
    } catch (e: any) {
      toast.error(e?.message);
    }
  }, []);

  const loadStatement = () => {
    if (!selectedSupplierId) return;
    setLoading(true);
    try {
      const stmt = service.getSupplierStatement(selectedSupplierId, dateFrom, dateTo);
      setStatementData(stmt);
      const invs = service.getInvoicesWithAllocations(selectedSupplierId);
      setInvoicesWithAlloc(invs);
      const pays = service.getPaymentsWithAllocations(selectedSupplierId);
      setPaymentsWithAlloc(pays);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل كشف حساب المورد.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatement();
  }, [selectedSupplierId, dateFrom, dateTo]);

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  const handleExport = (type: 'excel' | 'pdf') => {
    if (!canExport) return;
    if (!statementData || !selectedSupplier) return;
    const title = `كشف حساب المورد: ${selectedSupplier.name}`;
    const columns = [
      { key: 'date', label: 'التاريخ' },
      { key: 'docNumber', label: 'رقم المستند' },
      { key: 'description', label: 'البيان' },
      { key: 'credit', label: 'دائن / فواتير (ج)' },
      { key: 'debit', label: 'مدين / سداد (ج)' },
      { key: 'balanceAfter', label: 'الرصيد المستحق (ج)' },
    ];
    const rows = statementData.transactions.map((t: any) => ({
      date: t.date,
      docNumber: t.docNumber,
      description: t.description,
      credit: t.credit > 0 ? fmt(t.credit) : '—',
      debit: t.debit > 0 ? fmt(t.debit) : '—',
      balanceAfter: fmt(t.balanceAfter),
    }));

    if (type === 'excel') exportToExcel({ title, columns, rows, fileName: `كشف-حساب-${selectedSupplier.name}`, permission: 'suppliers.export' });
    else exportToPdf({ title, columns, rows, fileName: `كشف-حساب-${selectedSupplier.name}`, permission: 'suppliers.export' });
  };

  const handleOpenReallocate = (pay: any) => {
    if (!canUpdate) return;
    setSelectedPayment(pay);
    const draft: Record<string, number> = {};
    for (const al of pay.allocations || []) {
      draft[al.purchase_invoice_id || al.purchaseInvoiceId] = Number(al.amount);
    }
    setAllocDraft(draft);
    setReallocModal(true);
  };

  const handleSaveReallocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpdate || !selectedPayment) return;

    const allocations = Object.entries(allocDraft)
      .map(([purchaseInvoiceId, amount]) => ({ purchaseInvoiceId, amount: Number(amount) }))
      .filter((a) => a.amount > 0);

    try {
      service.reallocateSupplierPayment(selectedPayment.id, allocations);
      toast.success('تم تحديث مطابقة السند على الفواتير المحددة بنجاح.');
      setReallocModal(false);
      loadStatement();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حفظ مطابقة السند.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center">
            <FileText className="w-6 h-6 text-sky-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">كشف حساب المورد ومطابقة الفواتير والدفعات</h1>
            <p className="text-xs text-slate-500 font-medium">سجل الحركات المالية الموثقة، رصيد المورد، وتوزيع كل سند صرف على فواتير شراء محددة</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canExport && <button
            onClick={() => handleExport('excel')}
            className="px-3 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800 transition"
          >
            تصدير جدول بيانات
          </button>}
          {canExport && <button
            onClick={() => handleExport('pdf')}
            className="px-3 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> طباعة / مستند
          </button>}
        </div>
      </header>

      {/* Filter and selection bar */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[240px]">
          <select
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
            className="w-full px-3 py-2.5 border rounded-xl text-sm font-black bg-slate-50"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (رصيد حالي: {fmt(s.currentBalance)})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-bold">من:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-2 border rounded-xl bg-slate-50 text-xs"
          />
          <span className="text-slate-500 font-bold">إلى:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-2 border rounded-xl bg-slate-50 text-xs"
          />
        </div>
        <div className="flex border border-slate-200 rounded-xl p-0.5 bg-slate-100 text-xs font-bold">
          <button
            onClick={() => setViewMode('statement')}
            className={`px-3 py-1.5 rounded-lg transition ${viewMode === 'statement' ? 'bg-white shadow-sm text-sky-700' : 'text-slate-600'}`}
          >
            كشف الحساب التفصيلي
          </button>
          <button
            onClick={() => setViewMode('matching')}
            className={`px-3 py-1.5 rounded-lg transition ${viewMode === 'matching' ? 'bg-white shadow-sm text-sky-700' : 'text-slate-600'}`}
          >
            مطابقة الفواتير والسندات
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      {selectedSupplier && statementData && (
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white border-b border-slate-200">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-[11px] text-slate-500 font-bold">الرصيد الافتتاحي للمدة</div>
            <div className="text-base font-black text-slate-900 mt-0.5">{fmt(statementData.openingBalance)}</div>
          </div>
          <div className="p-3 bg-sky-50 rounded-xl border border-sky-100">
            <div className="text-[11px] text-sky-700 font-bold">إجمالي المشتريات</div>
            <div className="text-base font-black text-sky-800 mt-0.5">{fmt(selectedSupplier.totalPurchases)}</div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
            <div className="text-[11px] text-emerald-700 font-bold">إجمالي المسدد والمخصوم</div>
            <div className="text-base font-black text-emerald-800 mt-0.5">
              {fmt(selectedSupplier.totalPurchases - selectedSupplier.currentBalance)}
            </div>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
            <div className="text-[11px] text-rose-700 font-bold">الرصيد المستحق الحالي للمورد</div>
            <div className="text-base font-black text-rose-800 mt-0.5">{fmt(selectedSupplier.currentBalance)}</div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {viewMode === 'statement' ? (
          /* Running Account Statement View */
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-xs font-black text-slate-800">سجل القيود والمستندات المالية المتتالية</span>
              <span className="text-xs text-slate-500 font-semibold">عدد الحركات: {statementData?.transactions?.length || 0}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                  <tr>
                    <th className="p-3.5">التاريخ</th>
                    <th className="p-3.5">رقم المستند</th>
                    <th className="p-3.5">البيان والحركة</th>
                    <th className="p-3.5 text-orange-600">دائن (فاتورة شراء)</th>
                    <th className="p-3.5 text-emerald-700">مدين (سداد / تسوية)</th>
                    <th className="p-3.5 text-slate-900 font-black">الرصيد المستحق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statementData?.transactions?.map((t: any, idx: number) => {
                    const isInvoice = t.type === 'PURCHASE';
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition">
                        <td className="p-3.5 text-slate-600 font-medium">{t.date}</td>
                        <td className="p-3.5 font-bold font-mono text-slate-800">{t.docNumber}</td>
                        <td className="p-3.5 font-medium text-slate-700">{t.description}</td>
                        <td className="p-3.5 font-bold text-orange-600">{t.credit > 0 ? fmt(t.credit) : '—'}</td>
                        <td className="p-3.5 font-bold text-emerald-700">{t.debit > 0 ? fmt(t.debit) : '—'}</td>
                        <td className="p-3.5 font-black text-slate-900 bg-slate-50/30">{fmt(t.balanceAfter)}</td>
                      </tr>
                    );
                  })}
                  {!statementData?.transactions?.length && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400">لا توجد حركات مالية مسجلة في هذه الفترة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Matching and Allocations View */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Purchase Invoices & their paid status */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-900">فواتير الشراء والتوريد وتوزيع السداد</h3>
                <span className="text-xs text-slate-500 font-bold">{invoicesWithAlloc.length} فاتورة</span>
              </div>

              <div className="space-y-3">
                {invoicesWithAlloc.map((inv) => {
                  const isPaid = inv.remaining_amount <= 0.01;
                  return (
                    <div key={inv.id} className="p-4 border rounded-xl bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-black text-xs text-slate-900">{inv.invoice_number}</span>
                          {inv.supplier_invoice_number && (
                            <span className="text-[11px] text-slate-500 mr-2">(رقم المورد: {inv.supplier_invoice_number})</span>
                          )}
                          <div className="text-[11px] text-slate-400">{inv.date}</div>
                        </div>
                        <div className="text-left">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                            isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {isPaid ? 'مسددة بالكامل' : `متبقي: ${fmt(inv.remaining_amount)}`}
                          </span>
                          <div className="text-xs font-black text-slate-900 mt-1">{fmt(inv.total_amount)}</div>
                        </div>
                      </div>

                      {/* Allocations breakdown */}
                      {inv.allocations?.length > 0 ? (
                        <div className="pt-2 border-t border-slate-200 text-xs space-y-1">
                          <div className="text-[10px] text-slate-500 font-bold">السندات المغطية لهذه الفاتورة:</div>
                          {inv.allocations.map((al: any) => (
                            <div key={al.id} className="flex justify-between items-center text-slate-600 bg-white p-1.5 rounded-lg border border-slate-100">
                              <span>سند صرف {al.receiptNumber} ({al.paymentDate})</span>
                              <span className="font-black text-emerald-700">+{fmt(al.amount)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 pt-1">لم يتم تخصيص أي سند صرف لهذه الفاتورة بعد (آجلة بالكامل).</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payments & their allocations */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-900">سندات الصرف وتوزيعها على الفواتير</h3>
                <span className="text-xs text-slate-500 font-bold">{paymentsWithAlloc.length} سند صرف</span>
              </div>

              <div className="space-y-3">
                {paymentsWithAlloc.map((pay) => (
                  <div key={pay.id} className="p-4 border rounded-xl bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-black text-xs text-slate-900">{pay.receipt_number}</span>
                        <span className="text-[11px] text-slate-500 mr-2">({pay.date} · {pay.payment_type})</span>
                        <div className="text-[11px] text-slate-400">{pay.notes || 'سداد نقدي'}</div>
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-black text-emerald-700">{fmt(pay.amount)}</div>
                        {canUpdate && (
                          <button
                            onClick={() => handleOpenReallocate(pay)}
                            className="mt-1 text-[11px] font-bold text-sky-700 hover:underline flex items-center gap-1"
                          >
                            <SlidersHorizontal className="w-3 h-3" /> إعادة توزيع
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Invoices paid by this payment */}
                    {pay.allocations?.length > 0 ? (
                      <div className="pt-2 border-t border-slate-200 text-xs space-y-1">
                        <div className="text-[10px] text-slate-500 font-bold">الفواتير التي سددها هذا السند:</div>
                        {pay.allocations.map((al: any) => (
                          <div key={al.id} className="flex justify-between items-center text-slate-600 bg-white p-1.5 rounded-lg border border-slate-100">
                            <span>فاتورة {al.invoiceNumber} ({al.invoiceDate})</span>
                            <span className="font-black text-sky-800">{fmt(al.amount)}</span>
                          </div>
                        ))}
                        {pay.unallocatedAmount > 0.01 && (
                          <div className="flex justify-between items-center text-amber-700 bg-amber-50 p-1.5 rounded-lg border border-amber-200 font-bold">
                            <span>رصيد معلق غير مخصص لفاتورة محددة:</span>
                            <span>{fmt(pay.unallocatedAmount)}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-600 pt-1">رصيد السند بالكامل معلق كدفعة عامة في حساب المورد.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Reallocate Payment to specific invoices */}
      {reallocModal && selectedPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <section className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-black text-slate-900">توزيع سند الصرف {selectedPayment.receipt_number}</h2>
                <p className="text-xs text-slate-500">إجمالي قيمة السند: {fmt(selectedPayment.amount)}</p>
              </div>
              <button onClick={() => setReallocModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSaveReallocation} className="mt-4 space-y-4">
              <p className="text-xs text-slate-600">
                حدد المبلغ المخصص لكل فاتورة من فواتير هذا المورد. سيتم تحديث حالة سداد الفواتير آلياً:
              </p>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {invoicesWithAlloc.map((inv) => {
                  const val = allocDraft[inv.id] || 0;
                  return (
                    <div key={inv.id} className="p-3 border rounded-xl bg-slate-50 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-black text-slate-900">{inv.invoice_number} ({inv.date})</div>
                        <div className="text-slate-500 text-[11px]">الإجمالي: {fmt(inv.total_amount)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>المبلغ المخصص:</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={inv.total_amount}
                          value={val || ''}
                          onChange={(e) => setAllocDraft({ ...allocDraft, [inv.id]: Number(e.target.value) })}
                          className="w-28 bg-white border rounded-lg px-2.5 py-1 text-center font-bold text-sky-800"
                        />
                        <span>ج</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total allocation balance */}
              {(() => {
                const totalAssigned = Object.values(allocDraft).reduce((s, v) => s + (Number(v) || 0), 0);
                const unassigned = Number(selectedPayment.amount) - totalAssigned;
                return (
                  <div className="p-3 bg-slate-100 rounded-xl text-xs font-bold flex justify-between">
                    <span>المجموع الموزع: {fmt(totalAssigned)}</span>
                    <span className={unassigned < 0 ? 'text-rose-600 font-black' : 'text-slate-600'}>
                      {unassigned < 0 ? `تجاوز قيمة السند بمقدار ${fmt(Math.abs(unassigned))}` : `المتبقي كدفعة عامة: ${fmt(unassigned)}`}
                    </span>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setReallocModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-700">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-sky-600 text-white rounded-xl text-xs font-black shadow-md shadow-sky-600/20">
                  حفظ وتطبيق المطابقة
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
