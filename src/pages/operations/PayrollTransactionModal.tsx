import React from 'react';
import { Loader2, X, Plus } from 'lucide-react';
import type { Employee, PayrollTxType } from '../../services/EmployeeService';
import { TX_LABELS, fmt } from './payrollDisplay';
interface PayrollForm { type: PayrollTxType; amount: string; date: string; notes: string }
interface Props { target: Employee; form: PayrollForm; setForm: React.Dispatch<React.SetStateAction<PayrollForm>>; saving: boolean; onClose: () => void; onSubmit: (event: React.FormEvent) => void }
export const PayrollTransactionModal: React.FC<Props> = ({ target, form, setForm, saving, onClose, onSubmit }) => (
<div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">{TX_LABELS[form.type]}</h3>
              <button onClick={() => onClose()} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="mb-3 text-xs text-slate-500">الموظف: <span className="font-bold text-slate-800">{target.name}</span></div>
            <form onSubmit={onSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">نوع الحركة</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PayrollTxType })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  {(Object.keys(TX_LABELS) as PayrollTxType[]).map((t) => <option key={t} value={t}>{TX_LABELS[t]}</option>)}
                </select>
              </div>
              <div><label className="font-bold text-slate-700 block mb-1">المبلغ *</label><input required autoFocus type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">التاريخ *</label><input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div><label className="font-bold text-slate-700 block mb-1">ملاحظات</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => onClose()} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} <Plus className="w-3.5 h-3.5" /> تسجيل</button>
              </div>
            </form>
          </div>
        </div>
);
