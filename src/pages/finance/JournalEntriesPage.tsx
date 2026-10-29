import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Loader2, X, Trash2, Scale, Search, ChevronDown } from 'lucide-react';
import { FinanceExtrasService, Account, JournalEntry, JournalLine } from '../../services/FinanceExtrasService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { localDateString } from '../../utils/date';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';
type DraftLine = { accountId: string; debit: string; credit: string; description: string };
const emptyLine = (): DraftLine => ({ accountId: '', debit: '', credit: '', description: '' });

export const JournalEntriesPage: React.FC = () => {
  const service = useMemo(() => new FinanceExtrasService(), []);
  const canManage = PermissionService.can(AuthService.getCurrentUser(), 'finance.approve');
  const [tab, setTab] = useState<'entries' | 'trial'>('entries');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trial, setTrial] = useState<Array<{ code: string; name: string; type: string; debit: number; credit: number }>>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, JournalLine[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ date: localDateString(), description: '' });
  const [draft, setDraft] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    try {
      setEntries(service.getJournalEntries());
      setAccounts(service.getAccounts().filter((a) => a.isActive));
      setTrial(service.getTrialBalance());
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل القيود.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => ({
    debit: draft.reduce((s, l) => s + Number(l.debit || 0), 0),
    credit: draft.reduce((s, l) => s + Number(l.credit || 0), 0),
  }), [draft]);

  const filtered = entries.filter((e) => !search.trim() || e.description.includes(search) || e.entryNumber.includes(search));

  const toggleEntry = (entry: JournalEntry) => {
    if (expanded === entry.id) { setExpanded(null); return; }
    setExpanded(entry.id);
    if (!lines[entry.id]) {
      try { setLines((prev) => ({ ...prev, [entry.id]: service.getJournalLines(entry.id) })); } catch { /* ignore */ }
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.createJournalEntry({
        date: form.date,
        description: form.description,
        createdBy: AuthService.getCurrentUser()?.id || 'usr_admin',
        lines: draft.map((l) => ({ accountId: l.accountId, debit: Number(l.debit || 0), credit: Number(l.credit || 0), description: l.description })),
      });
      setModal(false);
      setForm({ date: localDateString(), description: '' });
      setDraft([emptyLine(), emptyLine()]);
      load();
    } catch (err: any) { alert(err?.message || 'تعذر حفظ القيد.'); }
    finally { setSaving(false); }
  };

  const removeEntry = (entry: JournalEntry) => {
    if (!confirm(`حذف القيد ${entry.entryNumber}؟ سيتم عكس أثره على الأرصدة.`)) return;
    try { service.deleteJournalEntry(entry.id); load(); }
    catch (err: any) { alert(err?.message || 'تعذر حذف القيد.'); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center"><FileText className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <h1 className="text-base font-black">القيود اليومية وميزان المراجعة</h1>
            <p className="text-xs text-slate-500 font-medium">تسجيل القيود المحاسبية المزدوجة ومتابعة أرصدة الحسابات</p>
          </div>
        </div>
        {canManage && <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shrink-0">
          <Plus className="w-4 h-4" /> قيد جديد
        </button>}
      </div>

      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-1">
        {([['entries', 'القيود اليومية', FileText], ['trial', 'ميزان المراجعة', Scale]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
        {tab === 'entries' && (
          <form onSubmit={(e) => e.preventDefault()} className="relative mr-auto w-64 py-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في القيود..." className="w-full pl-3 pr-9 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
          </form>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div> : tab === 'entries' ? (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <div key={entry.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <button onClick={() => toggleEntry(entry)} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 text-right">
                  <div className="flex items-center gap-3 min-w-0">
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition ${expanded === entry.id ? 'rotate-180' : ''}`} />
                    <span className="font-mono text-xs font-bold text-indigo-700">{entry.entryNumber}</span>
                    <span className="text-xs text-slate-400">{entry.date}</span>
                    <span className="text-sm font-bold text-slate-800 truncate">{entry.description}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs">
                    <span className="text-slate-500">{entry.lineCount || 0} سطور</span>
                    <span className="font-mono font-black text-slate-800">{fmt(Number(entry.totalDebit))}</span>
                    {canManage && <button onClick={(e) => { e.stopPropagation(); removeEntry(entry); }} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </button>
                {expanded === entry.id && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                    <table className="w-full text-xs text-right">
                      <thead><tr className="text-slate-400">{['الحساب', 'البيان', 'مدين', 'دائن'].map((h) => <th key={h} className="py-1.5 font-bold">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {(lines[entry.id] || []).map((line) => (
                          <tr key={line.id}>
                            <td className="py-1.5 font-bold text-slate-700">{line.accountCode} — {line.accountName}</td>
                            <td className="py-1.5 text-slate-500">{line.description || '—'}</td>
                            <td className="py-1.5 font-mono text-emerald-700">{Number(line.debit) ? fmt(Number(line.debit)) : '—'}</td>
                            <td className="py-1.5 font-mono text-rose-700">{Number(line.credit) ? fmt(Number(line.credit)) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-white">لا توجد قيود مسجلة</div>}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['الكود', 'الحساب', 'النوع', 'إجمالي المدين', 'إجمالي الدائن', 'الرصيد'].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trial.map((row) => (
                  <tr key={row.code} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-mono text-slate-600">{row.code}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-800">{row.name}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{row.type}</td>
                    <td className="px-4 py-2.5 font-mono text-emerald-700">{fmt(Number(row.debit))}</td>
                    <td className="px-4 py-2.5 font-mono text-rose-700">{fmt(Number(row.credit))}</td>
                    <td className="px-4 py-2.5 font-mono font-black text-slate-900">{fmt(Number(row.debit) - Number(row.credit))}</td>
                  </tr>
                ))}
                {trial.length === 0 && <tr><td colSpan={6} className="py-16 text-center text-slate-400">لا توجد حركات مسجلة بعد</td></tr>}
              </tbody>
              {trial.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-black">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-xs text-slate-600">الإجمالي</td>
                    <td className="px-4 py-3 font-mono text-emerald-700">{fmt(trial.reduce((s, r) => s + Number(r.debit), 0))}</td>
                    <td className="px-4 py-3 font-mono text-rose-700">{fmt(trial.reduce((s, r) => s + Number(r.credit), 0))}</td>
                    <td className="px-4 py-3 font-mono">{fmt(trial.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {modal && canManage && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">تسجيل قيد يومية</h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><label className="font-bold text-slate-700 block mb-1">التاريخ *</label><input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
                <div className="sm:col-span-2"><label className="font-bold text-slate-700 block mb-1">البيان *</label><input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-50"><tr>{['الحساب', 'مدين', 'دائن', 'بيان السطر', ''].map((h) => <th key={h} className="px-2 py-2 font-bold text-slate-500">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {draft.map((line, idx) => (
                      <tr key={idx}>
                        <td className="p-1.5">
                          <select required value={line.accountId} onChange={(e) => setDraft(draft.map((l, i) => i === idx ? { ...l, accountId: e.target.value } : l))} className="w-full px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                            <option value="">— اختر الحساب —</option>
                            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                          </select>
                        </td>
                        <td className="p-1.5"><input type="number" min={0} step="0.01" value={line.debit} onChange={(e) => setDraft(draft.map((l, i) => i === idx ? { ...l, debit: e.target.value, credit: '' } : l))} className="w-28 px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-200 font-mono" /></td>
                        <td className="p-1.5"><input type="number" min={0} step="0.01" value={line.credit} onChange={(e) => setDraft(draft.map((l, i) => i === idx ? { ...l, credit: e.target.value, debit: '' } : l))} className="w-28 px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-200 font-mono" /></td>
                        <td className="p-1.5"><input value={line.description} onChange={(e) => setDraft(draft.map((l, i) => i === idx ? { ...l, description: e.target.value } : l))} className="w-full px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-200" /></td>
                        <td className="p-1.5">
                          <button type="button" disabled={draft.length <= 2} onClick={() => setDraft(draft.filter((_, i) => i !== idx))} className="p-1 rounded text-rose-500 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-200">
                  <button type="button" onClick={() => setDraft([...draft, emptyLine()])} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">+ إضافة سطر</button>
                  <div className="flex items-center gap-4 text-[11px] font-bold">
                    <span className="text-emerald-700">مدين: {fmt(totals.debit)}</span>
                    <span className="text-rose-700">دائن: {fmt(totals.credit)}</span>
                    <span className={Math.abs(totals.debit - totals.credit) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}>
                      {Math.abs(totals.debit - totals.credit) < 0.01 ? 'متوازن ✓' : `الفرق: ${fmt(totals.debit - totals.credit)}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving || Math.abs(totals.debit - totals.credit) > 0.009 || totals.debit <= 0} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} ترحيل القيد</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
