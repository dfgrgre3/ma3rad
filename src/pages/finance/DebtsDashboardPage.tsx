import React, { useEffect, useState } from 'react';
import { Banknote, Search, Calendar, User, Phone, Loader2, X, ArrowDownLeft, ArrowUpRight, MapPin, ChevronDown } from 'lucide-react';
import { DatabaseManager } from '../../database/db';
import { DebtService, DebtRow } from '../../services/DebtService';
import { CustomerService } from '../../services/CustomerService';
import { SupplierService } from '../../services/SupplierService';
import { CashierService } from '../../services/CashierService';
import { AuthService } from '../../services/AuthService';
import { localDateString } from '../../utils/date';
import { PermissionService } from '../../services/PermissionService';
import { SalesService } from '../../services/SalesService';
import { useNavigate } from 'react-router-dom';
import { exportToExcel, exportToPdf } from '../../utils/export';
import { v4 as uuidv4 } from 'uuid';

const TYPE_LABELS: Record<DebtRow['type'], { label: string; color: string }> = {
  CUSTOMER_RECEIVABLE: { label: 'ذمم مدينة (لنا)', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  SUPPLIER_PAYABLE: { label: 'مستحقات للموردين (علينا)', color: 'text-rose-600 bg-rose-50 border-rose-200' },
};
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n) + ' ج';
type PromiseRow = { id:string; promisedAmount:number|null; promiseDate:string|null; followupDate:string|null; status:string; notes:string|null };

export const DebtsDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const debtService = new DebtService();
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [totals, setTotals] = useState({ receivable: 0, payable: 0, net: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<DebtRow | null>(null);
  const [amount, setAmount] = useState('');
  const [invoiceOptions, setInvoiceOptions] = useState<Array<{ id: string; invoiceNumber: string; remaining: number }>>([]);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [paymentType, setPaymentType] = useState<'CASH' | 'CARD' | 'BANK_TRANSFER'>('CASH');
  const [paymentDate, setPaymentDate] = useState(localDateString());
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentGroupKey, setPaymentGroupKey] = useState('');
  const [promiseCustomerId, setPromiseCustomerId] = useState<string|null>(null);
  const [promiseForm, setPromiseForm] = useState({ amount:'', promiseDate:'', followupDate:'', notes:'' });
  const [saving, setSaving] = useState(false);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [customerDetails, setCustomerDetails] = useState<Record<string, { address: string; invoices: Array<{ id: string; invoiceNumber: string; date: string; total: number; paid: number; remaining: number; items: Array<{ name: string; sku:string; grade:string; size:string; quantity: number; unit: string; unitPrice:number; discount:number; total:number; returned:number }> }>; payments: Array<{ id:string; invoiceId:string|null; paymentGroupId:string|null; receiptNumber: string; date: string; amount: number; paymentType: string; notes: string | null }>; promises:PromiseRow[] }>>({});
  const [summary, setSummary] = useState({ openCustomers: 0, openInvoices: 0, overdueInvoices: 0, overdueInvoiceCount: 0, pendingGoodsValue: 0, overdueOrders: 0, otherReceivables: 0 });
  const canReversePayments = PermissionService.can(AuthService.getCurrentUser(),'customers.payment.reverse');
  const canManagePromises = PermissionService.can(AuthService.getCurrentUser(),'customers.update');

  const toggleCustomer = (id: string) => {
    if (expandedCustomer === id) { setExpandedCustomer(null); return; }
    setExpandedCustomer(id);
    if (customerDetails[id]) return;
    try {
      const db = DatabaseManager.getInstance();
      const customer = db.query<{ address: string | null; city: string | null }>('SELECT address, city FROM customers WHERE id = ?', [id])[0];
      const invoices = db.query<{ id: string; invoiceNumber: string; date: string; total: number; paid: number; remaining: number }>(
        `SELECT id, invoice_number AS invoiceNumber, date, total_amount AS total, paid_amount AS paid, remaining_amount AS remaining FROM sales_invoices WHERE customer_id = ? AND invoice_status <> 'VOID' ORDER BY date DESC`, [id]
      ).map((invoice) => ({ ...invoice, items: db.query<{ name: string; sku:string; grade:string; size:string; quantity: number; unit: string; unitPrice:number; discount:number; total:number; returned:number }>(
        `SELECT i.product_name AS name,i.product_sku AS sku,i.product_grade AS grade,i.size,i.quantity_m2 AS quantity,i.sold_by AS unit,i.unit_price AS unitPrice,i.discount_amount AS discount,i.total_price AS total,
          COALESCE((SELECT SUM(sri.quantity_m2) FROM sales_return_items sri JOIN sales_returns sr ON sr.id=sri.return_id WHERE sr.original_invoice_id=i.invoice_id AND sri.product_id=i.product_id),0) AS returned
         FROM sales_invoice_items i WHERE i.invoice_id = ?`, [invoice.id]
      ) }));
      const payments = db.query<{ id:string; invoiceId:string|null; paymentGroupId:string|null; receiptNumber: string; date: string; amount: number; paymentType: string; notes: string | null }>(`SELECT id,invoice_id AS invoiceId,payment_group_id AS paymentGroupId,receipt_number AS receiptNumber,date,amount,payment_type AS paymentType,notes FROM customer_payments WHERE customer_id=? ORDER BY date`,[id]);
      const promises=db.query<PromiseRow>(`SELECT id,promised_amount AS promisedAmount,promise_date AS promiseDate,followup_date AS followupDate,status,notes FROM customer_payment_promises WHERE customer_id=? ORDER BY created_at DESC`,[id]);
      setCustomerDetails((prev) => ({ ...prev, [id]: { address: [customer?.address, customer?.city].filter(Boolean).join('، ') || '—', invoices, payments, promises } }));
    } catch { setCustomerDetails((prev) => ({ ...prev, [id]: { address: '—', invoices: [], payments: [], promises:[] } })); }
  };

  const savePromise = (e:React.FormEvent) => { e.preventDefault(); if(!promiseCustomerId)return; try { const actor=AuthService.requireAuth();PermissionService.require(actor,'customers.update'); const promiseId=`promise_${uuidv4().slice(0,10)}`; const db=DatabaseManager.getInstance(); db.executeTransaction(tx=>{tx.run(`INSERT INTO customer_payment_promises (id,customer_id,promised_amount,promise_date,followup_date,notes,created_by) VALUES (?,?,?,?,?,?,?)`,[promiseId,promiseCustomerId,promiseForm.amount?Number(promiseForm.amount):null,promiseForm.promiseDate||null,promiseForm.followupDate||null,promiseForm.notes||null,actor.id]);tx.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,[`aud_${uuidv4().slice(0,8)}`,actor.id,actor.fullName,'تسجيل وعد سداد','CUSTOMERS',promiseCustomerId,JSON.stringify(promiseForm)]);});const promises=db.query<PromiseRow>(`SELECT id,promised_amount AS promisedAmount,promise_date AS promiseDate,followup_date AS followupDate,status,notes FROM customer_payment_promises WHERE customer_id=? ORDER BY created_at DESC`,[promiseCustomerId]);setCustomerDetails(prev=>({...prev,[promiseCustomerId!]:{...prev[promiseCustomerId!],promises}}));setPromiseCustomerId(null);setPromiseForm({amount:'',promiseDate:'',followupDate:'',notes:''});}catch(error:any){alert(error?.message||'تعذر تسجيل وعد السداد.');} };

  const exportCustomerStatement = (customer: DebtRow, format: 'excel' | 'pdf') => {
    const detail = customerDetails[customer.id]; if (!detail) return;
    const rows = [
      ...detail.invoices.map((invoice) => ({ type: 'فاتورة', document: invoice.invoiceNumber, date: invoice.date, debit: invoice.total, credit: invoice.paid, balance: invoice.remaining, details: invoice.items.map((item) => `${item.name} ${item.sku} ${item.grade} ${item.size} (${item.quantity} ${item.unit} × ${item.unitPrice}، خصم ${item.discount}، مرتجع ${item.returned})`).join('، ') })),
      ...detail.payments.map((payment) => ({ type: 'تحصيل', document: payment.receiptNumber, date: payment.date, debit: 0, credit: payment.amount, balance: '', details: [payment.paymentType,payment.notes].filter(Boolean).join(' · ') })),
    ];
    const options = { title: `كشف حساب ${customer.name}`, subtitle: `الهاتف: ${customer.phone || '—'} · العنوان: ${detail.address}`, fileName: `كشف-حساب-${customer.name}`, columns: [{key:'type',label:'النوع'},{key:'document',label:'المرجع'},{key:'date',label:'التاريخ'},{key:'debit',label:'مدين'},{key:'credit',label:'دائن'},{key:'balance',label:'متبقي'},{key:'details',label:'التفاصيل'}], rows };
    if (format === 'excel') exportToExcel(options); else exportToPdf(options);
  };
  const exportOverdueReport = (format:'excel'|'pdf') => {
    const rows=DatabaseManager.getInstance().query(`SELECT c.name AS customer,c.phone,si.invoice_number AS invoice,si.date,si.due_date AS dueDate,si.total_amount AS total,si.paid_amount AS paid,si.remaining_amount AS remaining,CAST(julianday(date('now','localtime'))-julianday(si.due_date) AS INTEGER) AS daysOverdue FROM sales_invoices si JOIN customers c ON c.id=si.customer_id WHERE si.invoice_status<>'VOID' AND si.due_date IS NOT NULL AND si.due_date<date('now','localtime') AND si.remaining_amount>0.009 ORDER BY si.due_date`);
    const options={title:'تقرير الفواتير المتأخرة',columns:[{key:'customer',label:'العميل'},{key:'phone',label:'الهاتف'},{key:'invoice',label:'الفاتورة'},{key:'date',label:'تاريخ الفاتورة'},{key:'dueDate',label:'الاستحقاق'},{key:'total',label:'الإجمالي'},{key:'paid',label:'المدفوع'},{key:'remaining',label:'المتبقي'},{key:'daysOverdue',label:'أيام التأخير'}],rows,fileName:'الفواتير-المتأخرة'};
    if(format==='excel') exportToExcel(options); else exportToPdf(options);
  };
  const reverseCustomerPayment = (customerId:string,payment:{id:string;invoiceId:string|null;paymentGroupId:string|null;receiptNumber:string}) => {
    if(!confirm(`سيتم عكس سند ${payment.receiptNumber}${payment.paymentGroupId ? ' والدفعة الموزعة كاملة على فواتيرها' : ''}. متابعة؟`)) return;
    try { if(payment.invoiceId) new SalesService().deleteInvoicePayment(payment.id); else new CustomerService().deletePayment(payment.id); setCustomerDetails(prev=>{const next={...prev};delete next[customerId];return next;}); setExpandedCustomer(null); load(); }
    catch(error:any){alert(error?.message || 'تعذر عكس السند.');}
  };

  const load = () => {
    setLoading(true);
    try {
      const db = DatabaseManager.getInstance();
      setDebts(debtService.getDebts(search)); setTotals(debtService.getTotals());
      const value = (sql: string) => Number(db.query<{ v: number }>(sql)[0]?.v || 0);
      setSummary({
        openCustomers: value("SELECT COUNT(*) AS v FROM customers c WHERE c.current_balance>0.009 OR EXISTS (SELECT 1 FROM sales_invoices si WHERE si.customer_id=c.id AND si.invoice_status<>'VOID' AND si.remaining_amount>0.009)"),
        openInvoices: value("SELECT COUNT(*) AS v FROM sales_invoices WHERE invoice_status <> 'VOID' AND remaining_amount > 0.009"),
        overdueInvoices: value("SELECT COALESCE(SUM(remaining_amount),0) AS v FROM sales_invoices WHERE invoice_status <> 'VOID' AND due_date IS NOT NULL AND due_date < date('now','localtime') AND remaining_amount > 0.009"),
        overdueInvoiceCount: value("SELECT COUNT(*) AS v FROM sales_invoices WHERE invoice_status <> 'VOID' AND due_date IS NOT NULL AND due_date < date('now','localtime') AND remaining_amount > 0.009"),
        pendingGoodsValue: value("SELECT COALESCE(SUM(CASE WHEN totals.subtotal>0 THEN totals.pending_value/totals.subtotal*po.total_amount ELSE 0 END),0) AS v FROM purchase_orders po JOIN (SELECT purchase_order_id,SUM(quantity_m2*unit_cost) AS subtotal,SUM((quantity_m2-received_m2)*unit_cost) AS pending_value FROM purchase_order_items GROUP BY purchase_order_id) totals ON totals.purchase_order_id=po.id WHERE po.status IN ('SENT','CONFIRMED','PARTIAL')"),
        overdueOrders: value("SELECT COUNT(*) AS v FROM purchase_orders WHERE status IN ('SENT','CONFIRMED','PARTIAL') AND expected_date IS NOT NULL AND expected_date < date('now','localtime')"),
        otherReceivables: value("SELECT COUNT(*) AS v FROM receivables WHERE status IN ('OPEN','IN_PROGRESS')"),
      }); setError(null);
    }
    catch (e: any) { setError(e?.message || 'تعذر تحميل الديون.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openPayment = (d: DebtRow) => {
    setTarget(d); setAmount(String(d.amount)); setAllocationAmounts({}); setPaymentDate(localDateString()); setPaymentReference(''); setPaymentGroupKey(`ui-${uuidv4()}`);
    if (d.type === 'CUSTOMER_RECEIVABLE') {
      const options = DatabaseManager.getInstance().query<{ id: string; invoiceNumber: string; remaining: number }>(
        `SELECT id, invoice_number AS invoiceNumber, remaining_amount AS remaining FROM sales_invoices WHERE customer_id=? AND invoice_status <> 'VOID' AND remaining_amount > 0.009 ORDER BY date`, [d.id]);
      setInvoiceOptions(options);
    } else setInvoiceOptions([]);
  };

  const submitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const allocations = invoiceOptions.map((invoice) => ({ invoiceId: invoice.id, amount: Number(allocationAmounts[invoice.id]) || 0 })).filter((a) => a.amount > 0);
    const value = invoiceOptions.length ? allocations.reduce((sum, a) => sum + a.amount, 0) : Number(amount);
    if (!(value > 0)) return alert('أدخل مبلغاً صحيحاً.');
    if (value > target.amount + 0.009) return alert('المبلغ أكبر من إجمالي المستحق.');
    if (invoiceOptions.length && allocations.length === 0) return alert('وزّع الدفعة على فاتورة واحدة على الأقل.');
    if (allocations.some((a) => a.amount > (invoiceOptions.find((invoice) => invoice.id === a.invoiceId)?.remaining || 0) + 0.009)) return alert('أحد المبالغ أكبر من المتبقي في الفاتورة.');
    setSaving(true);
    try {
      const registers = new CashierService().getAllRegisters();
      const registerId = registers.find((r) => (r as any).isDefault)?.id || registers[0]?.id;
      if (target.type === 'CUSTOMER_RECEIVABLE') {
        if (invoiceOptions.length) new SalesService().recordCustomerPaymentAllocations(target.id, allocations, paymentType, registerId, paymentDate, paymentReference, '', undefined, paymentGroupKey);
        else new CustomerService().recordPayment(target.id, value, paymentType, registerId, undefined, paymentReference, AuthService.getCurrentUser()?.id || 'usr_admin', paymentDate, paymentGroupKey);
      } else {
        new SupplierService().recordPayment(target.id, value, paymentType, registerId, paymentReference);
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

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-2 p-4 bg-slate-50 border-b border-slate-200">
        <button onClick={() => setSearch('')} className="text-right rounded-xl border bg-white p-3 hover:border-emerald-300"><div className="text-[10px] text-slate-500">عملاء بأرصدة مدينة</div><strong className="text-lg">{summary.openCustomers}</strong></button>
        <button onClick={() => setSearch('')} className="text-right rounded-xl border bg-white p-3 hover:border-amber-300"><div className="text-[10px] text-slate-500">فواتير غير مسددة بالكامل</div><strong className="text-lg">{summary.openInvoices}</strong></button>
        <button onClick={() => {setSearch('');}} title="الفواتير ذات تاريخ استحقاق مسجل ومضى موعده" className="text-right rounded-xl border bg-white p-3 hover:border-rose-300"><div className="text-[10px] text-slate-500">مبالغ الفواتير المتأخرة · {summary.overdueInvoiceCount} فاتورة</div><strong className="text-lg text-rose-700">{fmt(summary.overdueInvoices)}</strong></button>
        <button onClick={() => navigate('/purchases/incoming')} className="text-right rounded-xl border bg-white p-3 hover:border-sky-300"><div className="text-[10px] text-slate-500">قيمة البضائع المنتظرة</div><strong className="text-lg">{fmt(summary.pendingGoodsValue)}</strong></button>
        <button onClick={() => navigate('/purchases/incoming')} className="text-right rounded-xl border bg-white p-3 hover:border-rose-300"><div className="text-[10px] text-slate-500">توريدات متأخرة</div><strong className="text-lg text-rose-700">{summary.overdueOrders}</strong></button>
        <button onClick={() => navigate('/finance/other-receivables')} className="text-right rounded-xl border bg-white p-3 hover:border-violet-300"><div className="text-[10px] text-slate-500">مستحقات أخرى مفتوحة</div><strong className="text-lg">{summary.otherReceivables}</strong></button>
      </div>

      <div className="p-4 bg-white border-b border-slate-200">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الحساب ثم Enter..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-400" />
        </form>
        <div className="mt-2 flex justify-end gap-2"><button onClick={()=>exportOverdueReport('excel')} className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs">تقرير المتأخرات Excel</button><button onClick={()=>exportOverdueReport('pdf')} className="px-3 py-2 rounded-lg bg-slate-700 text-white text-xs">طباعة التقرير</button></div>
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
                    {d.type === 'CUSTOMER_RECEIVABLE' && <button onClick={() => toggleCustomer(d.id)} className="text-xs font-bold text-sky-700 inline-flex items-center gap-1 mb-3"><ChevronDown className={`w-4 h-4 transition-transform ${expandedCustomer === d.id ? 'rotate-180' : ''}`} />تفاصيل الفواتير والأصناف</button>}
                    {expandedCustomer === d.id && d.type === 'CUSTOMER_RECEIVABLE' && <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
                      <div className="flex items-start gap-1.5 text-slate-600"><MapPin className="w-3.5 h-3.5 shrink-0"/>العنوان: {customerDetails[d.id]?.address || 'جارٍ التحميل...'}</div>
                      {canManagePromises && <button onClick={()=>{setPromiseCustomerId(d.id);setPromiseForm({amount:'',promiseDate:'',followupDate:'',notes:''});}} className="rounded-lg bg-amber-100 text-amber-800 px-2 py-1">تسجيل وعد سداد / متابعة</button>}
                      {(customerDetails[d.id]?.promises || []).map((promise)=><div key={promise.id} className="border rounded-lg p-2 text-slate-600">وعد: {promise.promisedAmount!=null?fmt(promise.promisedAmount):'قيمة غير محددة'} · الموعد {promise.promiseDate||'غير محدد'} · المتابعة {promise.followupDate||'غير محددة'} · {promise.status==='OPEN'?'مفتوح':promise.status} {promise.notes||''}</div>)}
                      {customerDetails[d.id] && <div className="flex gap-2"><button onClick={()=>exportCustomerStatement(d,'excel')} className="rounded-lg bg-emerald-700 text-white px-2 py-1">تصدير كشف Excel</button><button onClick={()=>exportCustomerStatement(d,'pdf')} className="rounded-lg bg-slate-700 text-white px-2 py-1">طباعة / PDF</button></div>}
                      {(customerDetails[d.id]?.invoices || []).map((invoice) => <div key={invoice.id} className="bg-white rounded-lg border border-slate-200 p-2.5"><div className="flex justify-between gap-2 font-bold"><span>فاتورة {invoice.invoiceNumber} · {invoice.date}</span><span className="text-slate-700">الإجمالي {fmt(invoice.total)} · مدفوع {fmt(invoice.paid)} · متبقي {fmt(invoice.remaining)}</span></div><ul className="mt-1 text-slate-500">{invoice.items.map((item, index) => <li key={index}>{item.name} {item.sku} · {item.grade} · {item.size} — {item.quantity} {item.unit} × {fmt(item.unitPrice)} · خصم {fmt(item.discount)} · مرتجع {fmt(item.returned)} · صافي الصنف {fmt(item.total)}</li>)}</ul></div>)}
                      {(customerDetails[d.id]?.payments || []).map((payment) => <div key={payment.id} className="flex flex-wrap items-center gap-2 text-slate-600">سند {payment.receiptNumber} · {payment.date} · {fmt(payment.amount)} · {payment.paymentType} {payment.notes || ''}{canReversePayments && <button onClick={()=>reverseCustomerPayment(d.id,payment)} className="text-rose-700 underline">عكس السند</button>}</div>)}
                      {customerDetails[d.id] && customerDetails[d.id].invoices.length === 0 && <div className="text-slate-500">لا توجد فواتير مسجلة؛ قد يتضمن الرصيد حركة مرحّلة.</div>}
                    </div>}
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

      {promiseCustomerId && <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"><form onSubmit={savePromise} className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-3"><h3 className="font-black text-lg">وعد السداد والمتابعة</h3><label className="block text-xs font-bold">المبلغ المتوقع<input type="number" min="0" step="0.01" value={promiseForm.amount} onChange={(e)=>setPromiseForm({...promiseForm,amount:e.target.value})} className="mt-1 w-full border rounded-lg p-2"/></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold">تاريخ الوعد<input type="date" value={promiseForm.promiseDate} onChange={(e)=>setPromiseForm({...promiseForm,promiseDate:e.target.value})} className="mt-1 w-full border rounded-lg p-2"/></label><label className="text-xs font-bold">المتابعة القادمة<input type="date" value={promiseForm.followupDate} onChange={(e)=>setPromiseForm({...promiseForm,followupDate:e.target.value})} className="mt-1 w-full border rounded-lg p-2"/></label></div><textarea placeholder="ملاحظات الوعد" value={promiseForm.notes} onChange={(e)=>setPromiseForm({...promiseForm,notes:e.target.value})} className="w-full border rounded-lg p-2 text-sm"/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setPromiseCustomerId(null)} className="px-4 py-2 bg-slate-100 rounded-lg">إلغاء</button><button className="px-4 py-2 bg-amber-600 text-white font-bold rounded-lg">حفظ</button></div></form></div>}
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
              {target.type === 'CUSTOMER_RECEIVABLE' && invoiceOptions.length > 0 && <div className="space-y-2"><label className="font-bold text-slate-700 block">توزيع الدفعة على الفواتير المفتوحة</label>{invoiceOptions.map((invoice) => <label key={invoice.id} className="flex items-center justify-between gap-3 rounded-lg border p-2"><span>فاتورة {invoice.invoiceNumber} · متبقي {fmt(invoice.remaining)}</span><input aria-label={`المبلغ من الفاتورة ${invoice.invoiceNumber}`} type="number" min="0" max={invoice.remaining} step="0.01" value={allocationAmounts[invoice.id] || ''} onChange={(e) => setAllocationAmounts((prev) => ({ ...prev, [invoice.id]: e.target.value }))} className="w-32 px-2 py-1 border rounded-lg" /></label>)}</div>}
              {(!invoiceOptions.length || target.type !== 'CUSTOMER_RECEIVABLE') && <div><label className="font-bold text-slate-700 block mb-1">المبلغ *</label><input required type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold" /></div>}
              <div className="grid grid-cols-2 gap-2"><label className="font-bold">طريقة الدفع<select value={paymentType} onChange={(e) => setPaymentType(e.target.value as 'CASH' | 'CARD' | 'BANK_TRANSFER')} className="mt-1 w-full p-2 border rounded-lg"><option value="CASH">نقدي</option><option value="CARD">بطاقة</option><option value="BANK_TRANSFER">تحويل بنكي</option></select></label>{target.type === 'CUSTOMER_RECEIVABLE' && <label className="font-bold">تاريخ الدفع<input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1 w-full p-2 border rounded-lg" /></label>}</div>
              {target.type === 'CUSTOMER_RECEIVABLE' && invoiceOptions.length > 0 && <label className="font-bold block">المرجع / الملاحظات<input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="mt-1 w-full p-2 border rounded-lg" /></label>}
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
