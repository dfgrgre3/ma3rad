import React, { useEffect, useState } from 'react';
import { Banknote, Search, Calendar, User, Phone, Loader2, X, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { DebtService, DebtRow } from '../../services/DebtService';
import { CustomerService } from '../../services/CustomerService';
import { SupplierService } from '../../services/SupplierService';
import { CashierService } from '../../services/CashierService';
import { AuthService } from '../../services/AuthService';

const TYPE_LABELS: Record<DebtRow['type'], { label: string; color: string }> = {
  CUSTOMER_RECEIVABLE: { label: 'ذمم مدينة (لنا)', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  SUPPLIER_PAYABLE: { label: 'مستحقات للموردين (علينا)', color: 'text-rose-600 bg-rose-50 border-rose-200' },
};
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n) + ' ج';

export const DebtsDashboardPage: React.FC = () => {
  const debtService = new DebtService();
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [totals, setTotals] = useState({ receivable: 0, payable: 0, net: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<DebtRow | null>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    try { setDebts(debtService.getDebts(search)); setTotals(debtService.getTotals()); setError(null); }
    catch (e: any) { setError(e?.message || 'تعذر تحميل الديون.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openPayment = (d: DebtRow) => { setTarget(d); setAmount(String(d.amount)); };

  const submitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const value = Number(amount);
    if (!(value > 0)) return alert('أدخل مبلغاً صحيحاً.');
    if (value > target.amount + 0.009) return alert('المبلغ أكبر من إجمالي المستحق.');
    setSaving(true);
    try {
      const registers = new CashierService().getAllRegisters();
      const registerId = registers.find((r) => (r as any).isDefault)?.id || registers[0]?.id;
      if (target.type === 'CUSTOMER_RECEIVABLE') {
        new CustomerService().recordPayment(target.id, value, 'CASH', registerId, undefined, '', AuthService.getCurrentUser()?.id || 'usr_admin');
      } else {
        new SupplierService().recordPayment(target.id, value, 'CASH', registerId, '', AuthService.getCurrentUser()?.id || 'usr_admin');
      }
      setTarget(null);
      load();
    } catch (err: any) { alert(err?.message || 'تعذر تسجيل الدفعة.'); }
    finally { setSaving(false); }
  };

  const filtered = debts;

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center"><Banknote className="w-5 h-5 text-rose-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">الديون والذمم المالية</h1>
            <p className="text-xs text-slate-500 font-medium">متابعة مديونيات العملاء ومستحقات الموردين</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-white border-b border-slate-200">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-[10px] font-bold text-emerald-700 flex items-center gap-1"><ArrowDownLeft className="w-3 h-3" /> ذمم مدينة (لنا)</div>
          <div className="text-lg font-black text-emerald-700 mt-1">{fmt(totals.receivable)}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="text-[10px] font-bold text-rose-700 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" /> مستحقات للموردين</div>
          <div className="text-lg font-black text-rose-700 mt-1">{fmt(totals.payable)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[10px] font-bold text-slate-500">صافي المركز</div>
          <div className={`text-lg font-black mt-1 ${totals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(totals.net)}</div>
        </div>
      </div>

      <div className="p-4 bg-white border-b border-slate-200">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الحساب ثم Enter..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-400" />
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-rose-500" /></div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((d) => {
              const typeConfig = TYPE_LABELS[d.type];
              return (
                <div key={`${d.type}-${d.id}`} className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[10px] px-2.5 py-1 rounded font-bold border ${typeConfig.color}`}>{typeConfig.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${d.overdue ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{d.overdue ? 'متأخرة السداد' : 'قائمة'}</span>
                    </div>
                    <h3 className="font-extrabold text-slate-900 mb-2 text-base flex items-center gap-1"><User className="w-4 h-4 text-slate-400" />{d.name}</h3>
                    <div className="space-y-1.5 text-xs text-slate-500 mb-4">
                      <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{d.phone || '—'}</div>
                      <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />آخر حركة: {d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('ar-EG') : '—'}</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-500">المبلغ المستحق</span>
                      <span className={`text-sm font-black ${d.type === 'CUSTOMER_RECEIVABLE' ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(d.amount)}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                    <button onClick={() => openPayment(d)} className={`px-3 py-1.5 text-white rounded-lg text-xs font-bold transition ${d.type === 'CUSTOMER_RECEIVABLE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                      {d.type === 'CUSTOMER_RECEIVABLE' ? 'تسجيل تحصيل' : 'سداد دفعة'}
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="col-span-full py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-white">لا توجد مديونيات مستحقة</div>}
          </div>
        )}
      </div>

      {target && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">{target.type === 'CUSTOMER_RECEIVABLE' ? 'تسجيل تحصيل' : 'سداد دفعة'}</h3>
              <button onClick={() => setTarget(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="mb-3 text-xs text-slate-500">
              الحساب: <span className="font-bold text-slate-800">{target.name}</span>
              <br />المستحق: <span className="font-black text-rose-600">{fmt(target.amount)}</span>
            </div>
            <form onSubmit={submitPayment} className="space-y-3 text-xs">
              <div><label className="font-bold text-slate-700 block mb-1">المبلغ *</label><input required autoFocus type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} تأكيد</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
