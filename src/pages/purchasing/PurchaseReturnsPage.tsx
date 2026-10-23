import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Plus, Search, X, Loader2, Banknote, Wallet, Eye, RefreshCw, PackageX } from 'lucide-react';
import { PurchaseReturnService, PurchaseReturnRow, ReturnablePurchaseItem } from '../../services/PurchaseReturnService';
import { PurchaseService } from '../../services/PurchaseService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { useToast } from '../../components/ui/Toast';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';

export const PurchaseReturnsPage: React.FC = () => {
  const service = useMemo(() => new PurchaseReturnService(), []);
  const purchaseService = useMemo(() => new PurchaseService(), []);
  const toast = useToast();
  const canReturn = PermissionService.can(AuthService.getCurrentUser(), 'purchases.return');

  const [rows, setRows] = useState<PurchaseReturnRow[]>([]);
  const [stats, setStats] = useState({ count: 0, total: 0, cashRefunded: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [purchaseId, setPurchaseId] = useState('');
  const [items, setItems] = useState<ReturnablePurchaseItem[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'BALANCE'>('BALANCE');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    try {
      setRows(service.getAllReturns(search));
      setStats(service.getStats());
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل مرتجعات الشراء.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openDetails = (row: PurchaseReturnRow) => {
    if (expanded === row.id) { setExpanded(null); setDetails(null); return; }
    try {
      setDetails(service.getReturnById(row.id));
      setExpanded(row.id);
    } catch (e: any) { toast.error(e?.message); }
  };

  const openModal = () => {
    try {
      setPurchases(purchaseService.getAllPurchases());
      setPurchaseId('');
      setItems([]);
      setQty({});
      setReason('');
      setRefundMethod('BALANCE');
      setModalOpen(true);
    } catch (e: any) { toast.error(e?.message); }
  };

  const pickPurchase = (id: string) => {
    setPurchaseId(id);
    setQty({});
    try {
      setItems(service.getReturnableItems(id).filter((item) => item.returnableM2 > 0));
    } catch (e: any) {
      setItems([]);
      toast.error(e?.message);
    }
  };

  const total = items.reduce((sum, item) => sum + (Number(qty[item.productId]) || 0) * item.unitCost, 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = items
      .map((item) => ({ productId: item.productId, quantityM2: Number(qty[item.productId]) || 0 }))
      .filter((line) => line.quantityM2 > 0);
    if (!purchaseId) return toast.error('اختر فاتورة الشراء أولًا.');
    if (lines.length === 0) return toast.error('أدخل كمية مرتجعة لصنف واحد على الأقل.');
    if (!reason.trim()) return toast.error('سبب المرتجع مطلوب.');
    setSaving(true);
    try {
      service.createReturn({ purchaseId, reason, refundMethod, items: lines });
      toast.success('تم تسجيل مرتجع الشراء وتحديث المخزون وحساب المورد.');
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تسجيل المرتجع.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h1 className="text-base font-black">مرتجعات الشراء</h1>
            <p className="text-xs text-slate-500 font-medium">إرجاع أصناف للمورد مع عكس المخزون وحساب المورد</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100" title="تحديث">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canReturn && (
            <button onClick={openModal} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold">
              <Plus className="w-4 h-4" /> تسجيل مرتجع
            </button>
          )}
        </div>
      </div>

      <div className="px-6 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] text-slate-500 font-bold">عدد المرتجعات</p>
          <p className="text-lg font-black text-slate-900">{stats.count}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] text-slate-500 font-bold">إجمالي قيمة المرتجعات</p>
          <p className="text-lg font-black text-rose-600">{fmt(stats.total)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] text-slate-500 font-bold">المردود نقدًا</p>
          <p className="text-lg font-black text-emerald-600">{fmt(stats.cashRefunded)}</p>
        </div>
      </div>

      <div className="p-4 bg-white border-b border-slate-200 mt-4 flex gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم المرتجع أو الفاتورة أو المورد أو السبب..." className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-400" />
        </form>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-rose-500" /></div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>{['رقم المرتجع', 'التاريخ', 'فاتورة الشراء', 'المورد', 'المخزن', 'الأصناف', 'القيمة', 'طريقة التسوية', 'الحالة'].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono font-bold text-rose-600">{row.returnNumber}</td>
                      <td className="px-4 py-3 text-slate-500">{row.date}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{row.originalInvoiceNumber}</td>
                      <td className="px-4 py-3 font-semibold">{row.supplierName || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.warehouseName || '—'}</td>
                      <td className="px-4 py-3">{row.itemsCount || 0}</td>
                      <td className="px-4 py-3 font-mono font-bold">{fmt(row.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600">
                          {row.refundedAmount > 0 ? <Banknote className="w-3.5 h-3.5 text-emerald-600" /> : <Wallet className="w-3.5 h-3.5 text-sky-600" />}
                          {row.refundedAmount > 0 ? 'نقدي' : 'على الحساب'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openDetails(row)} className="flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-700">
                          <Eye className="w-3.5 h-3.5" /> تفاصيل
                        </button>
                      </td>
                    </tr>
                    {expanded === row.id && details && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={9} className="px-6 py-3">
                          <div className="text-[11px] text-slate-500 mb-2">السبب: {details.reason}</div>
                          <table className="w-full text-right text-[11px] bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <thead className="bg-slate-100 text-slate-500"><tr><th className="px-3 py-2">الصنف</th><th className="px-3 py-2">الفرز</th><th className="px-3 py-2">الكمية (م²)</th><th className="px-3 py-2">الكراتين</th><th className="px-3 py-2">سعر التكلفة</th><th className="px-3 py-2">الإجمالي</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {details.items.map((item: any) => (
                                <tr key={item.id}>
                                  <td className="px-3 py-2 font-semibold">{item.productName}</td>
                                  <td className="px-3 py-2">{item.grade}</td>
                                  <td className="px-3 py-2 font-mono">{item.quantityM2}</td>
                                  <td className="px-3 py-2 font-mono">{item.boxesCount}</td>
                                  <td className="px-3 py-2 font-mono">{fmt(item.unitCost)}</td>
                                  <td className="px-3 py-2 font-mono font-bold">{fmt(item.totalRefund)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="py-16 text-center text-slate-400">
                    <PackageX className="w-8 h-8 mx-auto mb-2 text-slate-300" /> لا توجد مرتجعات شراء مسجلة
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">تسجيل مرتجع شراء</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">فاتورة الشراء</label>
                <select value={purchaseId} onChange={(e) => pickPurchase(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  <option value="">— اختر فاتورة —</option>
                  {purchases.map((p) => <option key={p.id} value={p.id}>{p.invoiceNumber} — {p.supplierName} — {fmt(p.totalAmount)}</option>)}
                </select>
              </div>

              {purchaseId && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-[11px]">
                    <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">الصنف</th><th className="px-3 py-2">المشترى</th><th className="px-3 py-2">المرتجع سابقًا</th><th className="px-3 py-2">المتاح</th><th className="px-3 py-2 w-28">كمية المرتجع</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item) => (
                        <tr key={item.productId}>
                          <td className="px-3 py-2 font-semibold">{item.productName}</td>
                          <td className="px-3 py-2 font-mono">{item.purchasedM2}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{item.returnedM2}</td>
                          <td className="px-3 py-2 font-mono font-bold text-emerald-700">{item.returnableM2}</td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} max={item.returnableM2} step="0.01" value={qty[item.productId] || ''} onChange={(e) => setQty((prev) => ({ ...prev, [item.productId]: Math.min(Number(e.target.value) || 0, item.returnableM2) }))} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" />
                          </td>
                        </tr>
                      ))}
                      {items.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400">لا توجد أصناف قابلة للارتجاع</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">طريقة التسوية</label>
                  <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as any)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="BALANCE">خصم من حساب المورد</option>
                    <option value="CASH">استرداد نقدي من الخزينة</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">قيمة المرتجع</label>
                  <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl font-black text-rose-700">{fmt(total)}</div>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">سبب المرتجع *</label>
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: كسر، عيب صناعة، صنف خاطئ..." className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} ترحيل المرتجع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
