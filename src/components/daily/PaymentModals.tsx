import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Loader2, Save, AlertTriangle } from 'lucide-react';
import { CustomerService } from '../../services/CustomerService';
import { SalesService } from '../../services/SalesService';
import { PurchaseService } from '../../services/PurchaseService';
import { useToast } from '../ui/Toast';
import { formatProductQuantity } from '../../utils/productUnits';
import type { PaymentType } from '../../types';
import { fmt, input, label, LoadErrorNotice, ModalShell, useRegisters } from './DailyModalShared';

export type PaymentTarget =
  | { kind: 'sale'; id: string; name: string; remaining: number }
  | { kind: 'purchase'; id: string; name: string; remaining: number }
  | { kind: 'customer'; id: string; name: string; remaining: number };

export const PaymentModal: React.FC<{ target: PaymentTarget; onClose: () => void; onSaved: () => void }> = ({ target, onClose, onSaved }) => {
  const toast = useToast();
  const { registers, error: registersError } = useRegisters();
  const [amount, setAmount] = useState(String(target.remaining));
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [registerId, setRegisterId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!registerId && registers.length) setRegisterId(registers[0].id);
  }, [registerId, registers]);

  const save = () => {
    const value = Number(amount);
    if (saving) return;
    if (!Number.isFinite(value) || value <= 0) { toast.error('أدخل مبلغًا صحيحًا'); return; }
    if (value > target.remaining) { toast.error('المبلغ يتجاوز الرصيد المتبقي'); return; }
    if (!registerId) { toast.error('اختر الخزينة'); return; }
    setSaving(true);
    try {
      if (target.kind === 'sale') {
        new SalesService().recordInvoicePayment(target.id, value, paymentType, registerId, undefined, notes);
      } else if (target.kind === 'purchase') {
        new PurchaseService().recordPayment(target.id, value, paymentType, registerId, notes);
      } else {
        new CustomerService().recordPayment(target.id, value, paymentType, registerId, undefined, notes);
      }
      toast.success('تم تسجيل الدفعة');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تسجيل الدفعة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="تسجيل دفعة" subtitle={target.name} onClose={onClose} busy={saving}>
      <div className="space-y-3">
        {registersError && <LoadErrorNotice message={registersError} />}
        {!registersError && registers.length === 0 && <LoadErrorNotice message="لا توجد خزائن نشطة للاختيار." />}
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">المتبقي</span>
          <span className="text-base font-black text-rose-600">{fmt(target.remaining)}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={label}>المبلغ *</label>
            <input type="number" min="0" max={target.remaining} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>طريقة الدفع</label>
            <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className={input}>
              <option value="CASH">نقدي</option>
              <option value="BANK_TRANSFER">بنكي</option>
              <option value="CARD">بطاقة</option>
            </select>
          </div>
        </div>
        <div>
          <label className={label}>الخزينة</label>
          <select value={registerId} onChange={(e) => setRegisterId(e.target.value)} className={input} disabled={Boolean(registersError) || registers.length === 0}>
            <option value="">اختر الخزينة</option>
            {registers.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>ملاحظات</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-50">إلغاء</button>
          <button type="button" onClick={save} disabled={saving || Boolean(registersError) || registers.length === 0 || target.remaining <= 0} className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} تسجيل الدفعة
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

export const DetailsModal: React.FC<{ kind: 'sale' | 'purchase'; id: string; onClose: () => void; onChanged: () => void }> = ({ kind, id, onClose, onChanged }) => {
  const toast = useToast();
  const [invoice, setInvoice] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    setInvoice(null);
    setPayments([]);
    try {
      if (kind === 'sale') {
        const loadedInvoice = new SalesService().getInvoiceById(id);
        if (!loadedInvoice) throw new Error('فاتورة البيع غير موجودة.');
        setInvoice(loadedInvoice);
        setPayments(new SalesService().getInvoicePayments(id));
      } else {
        const loadedInvoice = new PurchaseService().getPurchaseById(id);
        if (!loadedInvoice) throw new Error('فاتورة التوريد غير موجودة.');
        setInvoice(loadedInvoice);
        setPayments([]);
      }
    } catch (e: any) {
      const message = e instanceof Error ? e.message : 'تعذر تحميل التفاصيل';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [id, kind, toast]);
  useEffect(() => { load(); }, [load]);

  const removePayment = (paymentId: string) => {
    if (!window.confirm('حذف سند التحصيل وعكس أثره على الفاتورة والخزينة؟')) return;
    try {
      new SalesService().deleteInvoicePayment(paymentId);
      toast.success('تم حذف سند التحصيل');
      load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حذف السند');
    }
  };

  return (
    <ModalShell title={`تفاصيل ${kind === 'sale' ? 'فاتورة البيع' : 'فاتورة التوريد'}`} subtitle={invoice?.invoiceNumber} onClose={onClose} wide>
      {loading ? <div className="py-12 flex justify-center" role="status" aria-label="جارٍ تحميل التفاصيل"><Loader2 className="w-6 h-6 animate-spin text-sky-600" /></div>
        : loadError ? <div className="space-y-3">
          <LoadErrorNotice message={loadError} />
          <button type="button" onClick={load} className="px-3 py-2 text-xs font-bold text-sky-700 rounded-lg hover:bg-sky-50">إعادة المحاولة</button>
        </div>
        : !invoice ? <LoadErrorNotice message="لم يتم العثور على الفاتورة." /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              ['الإجمالي', invoice.totalAmount],
              ['المدفوع', invoice.paidAmount],
              ['المتبقي', invoice.remainingAmount],
            ].map(([labelText, value]) => (
              <div key={String(labelText)} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-[10px] text-slate-500">{labelText}</p>
                <p className="text-sm font-black text-slate-900">{fmt(Number(value))}</p>
              </div>
            ))}
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <p className="text-[10px] text-slate-500">الحالة</p>
              <p className="text-sm font-black text-slate-900">{invoice.paymentStatus}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs text-right min-w-[520px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['الصنف', 'الكمية', 'السعر/التكلفة', 'الإجمالي'].map((h) => <th key={h} className="px-3 py-2 font-bold text-slate-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(invoice.items || []).map((item: any) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-semibold">{item.productName}</td>
                    <td className="px-3 py-2">{formatProductQuantity(item.quantityM2, item)}</td>
                    <td className="px-3 py-2">{fmt(item.unitPrice ?? item.unitCost)}</td>
                    <td className="px-3 py-2 font-bold">{fmt(item.totalPrice ?? item.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {kind === 'sale' && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 text-xs font-bold text-slate-700">سندات التحصيل</div>
              {payments.length === 0 ? <p className="p-4 text-xs text-slate-400 text-center">لا توجد دفعات مسجلة</p> : (
                <div className="divide-y divide-slate-100">
                  {payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="font-mono text-emerald-600">{payment.receiptNumber}</span>
                      <span>{fmt(payment.amount)}</span>
                      <span className="text-slate-500">{payment.paymentType}</span>
                      <button onClick={() => removePayment(payment.id)} className="p-1 text-rose-500 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};

export const VoidModal: React.FC<{ target: { kind: 'sale' | 'purchase'; id: string; name: string }; onClose: () => void; onDeleted: () => void }> = ({ target, onClose, onDeleted }) => {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const save = () => {
    if (saving) return;
    if (!reason.trim()) { toast.error('سبب الإلغاء/الحذف مطلوب'); return; }
    setSaving(true);
    try {
      if (target.kind === 'sale') new SalesService().voidInvoice(target.id, reason);
      else new PurchaseService().deletePurchase(target.id, reason);
      toast.success(target.kind === 'sale' ? 'تم إلغاء الفاتورة' : 'تم حذف فاتورة التوريد');
      onDeleted();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تنفيذ العملية');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={target.kind === 'sale' ? 'إلغاء فاتورة بيع' : 'حذف فاتورة توريد'} subtitle={target.name} onClose={onClose} busy={saving}>
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p>
            {target.kind === 'sale'
              ? 'سيتم إرجاع الكميات للمخزون وعكس أثر الفاتورة على حساب العميل. لا يمكن التراجع.'
              : 'سيتم خصم الكميات من المخزون وعكس أثر الفاتورة على حساب المورد. لا يمكن التراجع.'}
          </p>
        </div>
        <div>
          <label className={label}>السبب *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={input} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-50">رجوع</button>
          <button type="button" onClick={save} disabled={saving || !reason.trim()} className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} تأكيد
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
