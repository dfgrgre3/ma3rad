import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { CashierService } from '../../services/CashierService';
import { useToast } from '../ui/Toast';
import type { PaymentType } from '../../types';
import { input, label, LoadErrorNotice, ModalShell, useExpenseCategories, useRegisters } from './DailyModalShared';

export const ExpenseModal: React.FC<{ initial?: any; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const toast = useToast();
  const { categories, error: categoriesError } = useExpenseCategories();
  const { registers, error: registersError } = useRegisters();
  const listsError = categoriesError || registersError;
  const [form, setForm] = useState({
    category: initial?.category || categories[0]?.name || '',
    amount: initial ? String(initial.amount) : '',
    description: initial?.description || '',
    recipient: initial?.recipient || '',
    paymentType: (initial?.paymentType || 'CASH') as PaymentType,
    registerId: initial?.registerId || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form.category && categories.length) {
      setForm((current) => ({ ...current, category: categories[0].name }));
    }
  }, [categories, form.category]);

  useEffect(() => {
    if (!form.registerId && registers.length) {
      setForm((current) => ({ ...current, registerId: registers[0].id }));
    }
  }, [registers, form.registerId]);

  const save = () => {
    if (saving) return;
    const amount = Number(form.amount);
    if (!form.category || !form.description.trim()) { toast.error('اختر البند واكتب البيان'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('أدخل مبلغًا صحيحًا'); return; }
    if (!form.registerId) { toast.error('اختر الخزينة'); return; }
    setSaving(true);
    try {
      const service = new CashierService();
      if (initial?.id) {
        service.updateExpense(initial.id, {
          category: form.category, amount, description: form.description,
          recipient: form.recipient, paymentType: form.paymentType, registerId: form.registerId,
        });
        toast.success('تم تعديل المصروف');
      } else {
        service.addExpense(form.category, amount, form.description, form.registerId, undefined, form.paymentType, form.recipient);
        toast.success('تم تسجيل المصروف');
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حفظ المصروف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={initial ? 'تعديل مصروف' : 'إضافة مصروف'} subtitle="يُخصم المصروف النقدي من الخزينة المحددة" onClose={onClose} busy={saving}>
      <div className="space-y-3">
        {listsError && <LoadErrorNotice message={listsError} />}
        {!categoriesError && categories.length === 0 && <LoadErrorNotice message="لا توجد بنود مصروفات مهيأة." />}
        {!registersError && registers.length === 0 && <LoadErrorNotice message="لا توجد خزائن نشطة للاختيار." />}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="expense-category" className={label}>البند *</label>
            <select id="expense-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input} disabled={Boolean(categoriesError) || categories.length === 0}>
              {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="expense-amount" className={label}>المبلغ *</label>
            <input id="expense-amount" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
          </div>
        </div>
        <div>
          <label htmlFor="expense-description" className={label}>البيان *</label>
          <input id="expense-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="expense-recipient" className={label}>المستفيد</label>
            <input id="expense-recipient" value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} className={input} />
          </div>
          <div>
            <label htmlFor="expense-payment-type" className={label}>طريقة الدفع</label>
            <select id="expense-payment-type" value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value as PaymentType })} className={input}>
              <option value="CASH">نقدي</option>
              <option value="BANK_TRANSFER">بنكي</option>
            </select>
          </div>
          <div>
            <label htmlFor="expense-register" className={label}>الخزينة</label>
            <select id="expense-register" value={form.registerId} onChange={(e) => setForm({ ...form, registerId: e.target.value })} className={input} disabled={Boolean(registersError) || registers.length === 0}>
              <option value="">اختر الخزينة</option>
              {registers.map((r: any) => <option key={r.id} value={r.id}>{r.name}{r.branchName ? ` — ${r.branchName}` : ''}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-50">إلغاء</button>
          <button type="button" onClick={save} disabled={saving || Boolean(listsError) || categories.length === 0 || registers.length === 0} className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
