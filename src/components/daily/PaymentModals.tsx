import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../ui/DataTable';
import { Trash2, Loader2, Save, AlertTriangle } from 'lucide-react';
import { CustomerService } from '../../services/domains/customers/CustomerService';
import { SalesService } from '../../services/domains/sales/SalesService';
import { PurchaseService } from '../../services/domains/purchases/PurchaseService';
import { useToast } from '../ui/Toast';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { formatProductQuantity } from '../../utils/products/productUnits';
import type { PaymentType } from '../../types';
import { LoadErrorNotice, ModalShell } from './DailyModalShared';
import { useRegisters } from '../../hooks/domains/daily/useRegisters';
import { fmt, input, label } from './DailyModalUtils';
import { useIdempotencyKey } from '../../hooks/shared/useIdempotencyKey';
import { FinanceEnterpriseService } from '../../services/domains/finance/FinanceEnterpriseService';
import type { BankAccount } from '../../types/finance';

export type PaymentTarget =
  | { kind: 'sale'; id: string; branchId?: string; name: string; remaining: number }
  | { kind: 'purchase'; id: string; branchId?: string; name: string; remaining: number }
  | { kind: 'customer'; id: string; branchId?: string; name: string; remaining: number };

export const PaymentModal: React.FC<{ target: PaymentTarget; onClose: () => void; onSaved: () => void }> = ({ target, onClose, onSaved }) => {
  const toast = useToast();
  const paymentKey = useIdempotencyKey();
  const { registers, error: registersError } = useRegisters();
  const [amount, setAmount] = useState(String(target.remaining));
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const financeService = useMemo(() => new FinanceEnterpriseService(), []);
  const [registerId, setRegisterId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const availableRegisters = target.branchId
    ? registers.filter((register) => register.branchId === target.branchId)
    : registers;

  useEffect(() => {
    try {
      const accounts = financeService.getBankAccounts().filter((account) => account.isActive);
      setBankAccounts(accounts);
      setBankAccountId(accounts[0]?.id || '');
    } catch { setBankAccounts([]); }
  }, [financeService]);

  useEffect(() => {
    if (availableRegisters.some((register) => register.id === registerId)) return;
    const defaultRegister = availableRegisters.find((register) => register.isDefault) || availableRegisters[0];
    setRegisterId(defaultRegister?.id || '');
  }, [availableRegisters, registerId]);

  const save = () => {
    const value = Number(amount);
    if (saving) return;
    if (!Number.isFinite(value) || value <= 0) { toast.error('أدخل مبلغًا صحيحًا'); return; }
    if (value > target.remaining) { toast.error('المبلغ يتجاوز الرصيد المتبقي'); return; }
    if (!availableRegisters.some((register) => register.id === registerId)) { toast.error('اختر خزينة تابعة لفرع المعاملة'); return; }
    setSaving(true);
    try {
      if (target.kind === 'sale') {
        new SalesService().recordInvoicePayment(target.id, value, paymentType, registerId, undefined, notes, paymentKey.getKey(), undefined, bankAccountId || undefined);
      } else if (target.kind === 'purchase') {
        new PurchaseService().recordPayment(target.id, value, paymentType, registerId, notes, paymentKey.getKey());
      } else {
        new CustomerService().recordPayment(target.id, value, paymentType, registerId, undefined, notes, AuthService.getCurrentUser()?.id || 'usr_admin', undefined, paymentKey.getKey(), bankAccountId || undefined);
      }
      paymentKey.resetKey();
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
        {!registersError && availableRegisters.length === 0 && <LoadErrorNotice message="لا توجد خزائن نشطة مرتبطة بفرع هذه المعاملة." />}
        <div className="rounded-xl bg-surface-muted border border-line px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-muted">المتبقي</span>
          <span className="text-base font-black text-danger">{fmt(target.remaining)}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="payment-amount" className={label}>المبلغ *</label>
            <input id="payment-amount" type="number" min="0" max={target.remaining} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="payment-type" className={label}>طريقة الدفع</label>
            <select id="payment-type" value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className={input}>
              <option value="CASH">نقدي</option>
              <option value="BANK_TRANSFER">بنكي</option>
              <option value="CARD">بطاقة</option>
            </select>
          </div>
        </div>
        {paymentType !== 'BANK_TRANSFER' && <div>
          <label htmlFor="payment-register" className={label}>الخزينة</label>
          <select id="payment-register" value={registerId} onChange={(e) => setRegisterId(e.target.value)} className={input} disabled={Boolean(registersError) || availableRegisters.length === 0}>
            <option value="">اختر الخزينة</option>
            {availableRegisters.map((r) => <option key={r.id} value={r.id}>{r.name}{r.branchName ? ` — ${r.branchName}` : ''}</option>)}
          </select>
        </div>}
        {paymentType === 'BANK_TRANSFER' && target.kind === 'purchase' && (
          <div>
            <label htmlFor="payment-bank-account" className={label}>Bank account</label>
            <select id="payment-bank-account" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={input}>
              <option value="">Select bank account</option>
              {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountName} — {account.bankName}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="payment-notes" className={label}>ملاحظات</label>
          <input id="payment-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-ink-secondary rounded-lg hover:bg-surface-sunken disabled:opacity-50">إلغاء</button>
          <button type="button" onClick={save} disabled={saving || Boolean(registersError) || availableRegisters.length === 0 || target.remaining <= 0} className="flex items-center gap-1.5 px-5 py-2 bg-success text-white rounded-lg text-sm font-bold hover:bg-success disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} تسجيل الدفعة
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

export const DetailsModal: React.FC<{ kind: 'sale' | 'purchase'; id: string; onClose: () => void; onChanged: () => void }> = ({ kind, id, onClose, onChanged }) => {
  const toast = useToast();
  const canReversePayment = PermissionService.can(AuthService.getCurrentUser(), 'customers.payment.reverse');
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
      {loading ? <div className="py-12 flex justify-center" role="status" aria-label="جارٍ تحميل التفاصيل"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        : loadError ? <div className="space-y-3">
          <LoadErrorNotice message={loadError} />
          <button type="button" onClick={load} className="px-3 py-2 text-xs font-bold text-primary rounded-lg hover:bg-accent-soft">إعادة المحاولة</button>
        </div>
        : !invoice ? <LoadErrorNotice message="لم يتم العثور على الفاتورة." /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            {[
              ['الإجمالي', invoice.totalAmount],
              ['المدفوع', invoice.paidAmount],
              ['المتبقي', invoice.remainingAmount],
            ].map(([labelText, value]) => (
              <div key={String(labelText)} className="rounded-lg bg-surface-muted border border-line px-3 py-2">
                <p className="text-[10px] text-muted">{labelText}</p>
                <p className="text-sm font-black text-ink">{fmt(Number(value))}</p>
              </div>
            ))}
            <div className="rounded-lg bg-surface-muted border border-line px-3 py-2">
              <p className="text-[10px] text-muted">الحالة</p>
              <p className="text-sm font-black text-ink">{invoice.paymentStatus}</p>
            </div>
          </div>

          <div className="rounded-xl border border-line overflow-x-auto">
            <DataTable
              ariaLabel="أصناف الفاتورة"
              rows={invoice.items || []}
              rowKey={(item: any) => String(item.id)}
              minWidth={520}
              dense
              tableClassName="text-xs"
              columns={[
                { key: 'product', header: 'الصنف', render: (item: any) => <span className="font-semibold">{item.productName}</span> },
                { key: 'qty', header: 'الكمية', render: (item: any) => formatProductQuantity(item.quantityM2, item) },
                { key: 'price', header: 'السعر/التكلفة', render: (item: any) => fmt(item.unitPrice ?? item.unitCost) },
                { key: 'total', header: 'الإجمالي', render: (item: any) => <span className="font-bold">{fmt(item.totalPrice ?? item.totalCost)}</span> },
              ]}
            />
          </div>

          {kind === 'sale' && (
            <div className="rounded-xl border border-line overflow-hidden">
              <div className="px-3 py-2 bg-surface-muted text-xs font-bold text-ink">سندات التحصيل</div>
              {payments.length === 0 ? <p className="p-4 text-xs text-muted text-center">لا توجد دفعات مسجلة</p> : (
                <div className="divide-y divide-line-strong">
                  {payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="font-mono text-success">{payment.receiptNumber}</span>
                      <span>{fmt(payment.amount)}</span>
                      <span className="text-muted">{payment.paymentType}</span>
                      {canReversePayment && <button onClick={() => removePayment(payment.id)} className="p-1 text-danger hover:bg-danger-soft rounded"><Trash2 className="w-3.5 h-3.5" /></button>}
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
        <div className="flex items-start gap-2 rounded-xl bg-warning-soft border border-warning-border p-3 text-[11px] text-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p>
            {target.kind === 'sale'
              ? 'سيتم إرجاع الكميات للمخزون وعكس أثر الفاتورة على حساب العميل. لا يمكن التراجع.'
              : 'سيتم خصم الكميات من المخزون وعكس أثر الفاتورة على حساب المورد. لا يمكن التراجع.'}
          </p>
        </div>
        <div>
          <label htmlFor="void-reason" className={label}>السبب *</label>
          <textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={input} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-ink-secondary rounded-lg hover:bg-surface-sunken disabled:opacity-50">رجوع</button>
          <button type="button" onClick={save} disabled={saving || !reason.trim()} className="flex items-center gap-1.5 px-5 py-2 bg-danger text-white rounded-lg text-sm font-bold hover:bg-danger disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} تأكيد
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
