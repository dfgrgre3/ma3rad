import React from 'react';
import { X, Loader2 } from 'lucide-react';
import { TYPE_CONFIG } from './crmActivityConfig';

interface LeadOption { id: string; name: string; phone: string }
interface ActivityForm { leadId: string; activityType: string; subject: string; scheduledAt: string; body: string }
interface CrmActivityModalProps { leads: LeadOption[]; form: ActivityForm; setForm: React.Dispatch<React.SetStateAction<ActivityForm>>; saving: boolean; onClose: () => void; onSubmit: (event: React.FormEvent) => void }
export const CrmActivityModal: React.FC<CrmActivityModalProps> = ({ leads, form, setForm, saving, onClose, onSubmit }) => {
  const idPrefix = React.useId();

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">جدولة نشاط جديد</h3>
              <button onClick={() => onClose()} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={onSubmit} className="space-y-3 text-xs">
              <div>
                <label htmlFor={`${idPrefix}-lead`} className="font-bold text-slate-700 block mb-1">العميل المحتمل *</label>
                <select id={`${idPrefix}-lead`} required value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  <option value="">— اختر —</option>
                  {leads.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.phone}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${idPrefix}-activity-type`} className="font-bold text-slate-700 block mb-1">نوع النشاط</label>
                  <select id={`${idPrefix}-activity-type`} value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    {Object.entries(TYPE_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${idPrefix}-scheduled-at`} className="font-bold text-slate-700 block mb-1">الموعد</label>
                  <input id={`${idPrefix}-scheduled-at`} type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
                </div>
              </div>
              <div>
                <label htmlFor={`${idPrefix}-subject`} className="font-bold text-slate-700 block mb-1">العنوان *</label>
                <input id={`${idPrefix}-subject`} required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-semibold" />
              </div>
              <div>
                <label htmlFor={`${idPrefix}-body`} className="font-bold text-slate-700 block mb-1">تفاصيل / ملاحظات</label>
                <textarea id={`${idPrefix}-body`} rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => onClose()} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
    </div>
  );
};
