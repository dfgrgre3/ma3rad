import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { FileText, Plus, Loader2, X, Trash2, Scale, Search, ChevronDown, RotateCcw } from 'lucide-react';
import { FinanceExtrasService, Account, JournalEntry, JournalLine } from '../../../services/domains/finance/FinanceExtrasService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';

import { useToast } from '../../../components/ui/Toast';
import { useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';
type DraftLine = { accountId: string; debit: string; credit: string; description: string };
const emptyLine = (): DraftLine => ({ accountId: '', debit: '', credit: '', description: '' });

export const JournalEntriesPage: React.FC = () => {
  const toast = useToast();
  const newEntryLabel = useBusinessTerm('actions.newJournalEntry');
  const service = useMemo(() => new FinanceExtrasService(), []);
  const canManage = PermissionService.can(AuthService.getCurrentUser(), 'ui.finance.journal.approve');
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

  const load = useCallback(() => {
    setLoading(true);
    try {
      setEntries(service.getJournalEntries());
      setAccounts(service.getAccounts().filter((a) => a.isActive));
      setTrial(service.getTrialBalance());
      setError(null);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل القيود.'); }
    finally { setLoading(false); }
  }, [service, setLoading, setEntries, setAccounts, setTrial, setError]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => ({
    debit: draft.reduce((s, l) => s + Number(l.debit || 0), 0),
    credit: draft.reduce((s, l) => s + Number(l.credit || 0), 0),
  }), [draft]);

  const filtered = entries.filter((e) => !search.trim() || e.description.includes(search) || e.entryNumber.includes(search) || (e.sourceLabel || '').includes(search));

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
    } catch (err: any) { toast.error(err?.message || 'تعذر حفظ القيد.'); }
    finally { setSaving(false); }
  };

  const isManualEntry = (entry: JournalEntry) =>
    !entry.referenceType || entry.referenceType === 'MANUAL_JOURNAL';

  const reverseEntry = (entry: JournalEntry) => {
    const reason = prompt(`سبب عكس القيد ${entry.entryNumber} (اختياري):`, 'تصحيح قيد');
    if (reason === null) return;
    try {
      service.reverseJournalEntry(entry.id, { reason });
      load();
    } catch (err: any) { toast.error(err?.message || 'تعذر عكس القيد.'); }
  };

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<FileText className="h-5 w-5" />}
          title="القيود اليومية وميزان المراجعة"
          description="تسجيل القيود المحاسبية المزدوجة ومتابعة أرصدة الحسابات"
          actions={canManage && <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-sm font-bold transition shrink-0">
            <Plus className="w-4 h-4" /> {newEntryLabel}
          </button>}
        />
      </div>

      <div className="bg-surface border-b border-line px-6 flex items-center gap-1">
        {([['entries', 'القيود اليومية', FileText], ['trial', 'ميزان المراجعة', Scale]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
        {tab === 'entries' && (
          <form onSubmit={(e) => e.preventDefault()} className="relative mr-auto w-64 py-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في القيود..." className="w-full pl-3 pr-9 py-1.5 bg-surface-muted border border-line rounded-lg text-xs focus:outline-none focus:border-primary" />
          </form>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : tab === 'entries' ? (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <div key={entry.id} className="bg-surface border border-line rounded-xl overflow-hidden">
                <button onClick={() => toggleEntry(entry)} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted text-right">
                  <div className="flex items-center gap-3 min-w-0">
                    <ChevronDown className={`w-4 h-4 text-muted transition ${expanded === entry.id ? 'rotate-180' : ''}`} />
                    <span className="font-mono text-xs font-bold text-primary">{entry.entryNumber}</span>
                    <span className="text-xs text-muted">{entry.date}</span>
                    <span className="text-sm font-bold text-ink truncate">{entry.description}</span>
                    <span className="hidden sm:inline-flex shrink-0 rounded-md bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-ink-secondary">{entry.sourceLabel || 'قيد يدوي'}</span>
                    {entry.reversedByEntryId && <span className="shrink-0 rounded-md bg-danger-soft px-2 py-0.5 text-[10px] font-bold text-danger">معكوس</span>}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs">
                    <span className="text-muted">{entry.lineCount || 0} سطور</span>
                    <span className="font-mono font-black text-ink">{fmt(Number(entry.totalDebit))}</span>
                    {canManage && isManualEntry(entry) && !entry.reversedByEntryId && (
                      <button onClick={(e) => { e.stopPropagation(); reverseEntry(entry); }} title="عكس القيد" aria-label={`عكس القيد ${entry.entryNumber}`} className="p-1.5 rounded-lg text-warning hover:bg-warning-soft"><RotateCcw className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </button>
                {expanded === entry.id && (
                  <div className="border-t border-line bg-surface-muted/50 px-4 py-3">
                    <DataTable
                      ariaLabel="سطور القيد"
                      rows={lines[entry.id] || []}
                      rowKey={(line) => line.id}
                      dense
                      tableClassName="text-xs"
                      columns={[
                        { key: 'account', header: 'الحساب', render: (line) => <span className="font-bold text-ink">{line.accountCode} — {line.accountName}</span> },
                        { key: 'desc', header: 'البيان', render: (line) => <span className="text-muted">{line.description || '—'}</span> },
                        { key: 'debit', header: 'مدين', render: (line) => <span className="font-mono text-success">{Number(line.debit) ? fmt(Number(line.debit)) : '—'}</span> },
                        { key: 'credit', header: 'دائن', render: (line) => <span className="font-mono text-danger">{Number(line.credit) ? fmt(Number(line.credit)) : '—'}</span> },
                      ]}
                      emptyTitle="لا توجد سطور"
                    />
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && <div className="py-16 text-center text-muted border-2 border-dashed border-line rounded-2xl bg-surface">لا توجد قيود مسجلة</div>}
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-xl overflow-hidden">
            <DataTable
              ariaLabel="ميزان المراجعة"
              rows={trial}
              rowKey={(row) => row.code}
              emptyTitle="لا توجد حركات مسجلة بعد"
              columns={[
                { key: 'code', header: 'الكود', render: (row) => <span className="font-mono text-ink-secondary">{row.code}</span> },
                { key: 'name', header: 'الحساب', render: (row) => <span className="font-bold text-ink">{row.name}</span> },
                { key: 'type', header: 'النوع', render: (row) => <span className="text-muted text-xs">{row.type}</span> },
                { key: 'debit', header: 'إجمالي المدين', render: (row) => <span className="font-mono text-success">{fmt(Number(row.debit))}</span> },
                { key: 'credit', header: 'إجمالي الدائن', render: (row) => <span className="font-mono text-danger">{fmt(Number(row.credit))}</span> },
                { key: 'balance', header: 'الرصيد', render: (row) => <span className="font-mono font-black text-ink">{fmt(Number(row.debit) - Number(row.credit))}</span> },
              ]}
            />
            {trial.length > 0 && (
              <div className="flex items-center gap-4 border-t-2 border-line bg-surface-muted px-4 py-3 text-xs font-black">
                <span className="text-ink-secondary">الإجمالي</span>
                <span className="font-mono text-success">{fmt(trial.reduce((sum, r) => sum + Number(r.debit), 0))}</span>
                <span className="font-mono text-danger">{fmt(trial.reduce((sum, r) => sum + Number(r.credit), 0))}</span>
                <span className="font-mono">{fmt(trial.reduce((sum, r) => sum + Number(r.debit) - Number(r.credit), 0))}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {modal && canManage && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">تسجيل قيد يومية</h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><label className="font-bold text-ink block mb-1">التاريخ *</label><input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" /></div>
                <div className="sm:col-span-2"><label className="font-bold text-ink block mb-1">البيان *</label><input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line" /></div>
              </div>

              <div className="border border-line rounded-xl overflow-hidden">
                <DataTable
                    ariaLabel="سطور القيد الجديد"
                    rows={draft.map((line, idx) => ({ ...line, __idx: idx }))}
                    rowKey={(line) => String(line.__idx)}
                    dense
                    tableClassName="text-xs"
                    columns={[
                      {
                        key: 'account', header: 'الحساب',
                        render: (line) => (
                          <select required value={line.accountId} onChange={(e) => setDraft(draft.map((l, i) => i === line.__idx ? { ...l, accountId: e.target.value } : l))} className="w-full px-2 py-1.5 bg-surface-muted rounded-lg border border-line">
                            <option value="">— اختر الحساب —</option>
                            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                          </select>
                        ),
                      },
                      { key: 'debit', header: 'مدين', render: (line) => <input type="number" min={0} step="0.01" value={line.debit} onChange={(e) => setDraft(draft.map((l, i) => i === line.__idx ? { ...l, debit: e.target.value, credit: '' } : l))} className="w-28 px-2 py-1.5 bg-surface-muted rounded-lg border border-line font-mono" /> },
                      { key: 'credit', header: 'دائن', render: (line) => <input type="number" min={0} step="0.01" value={line.credit} onChange={(e) => setDraft(draft.map((l, i) => i === line.__idx ? { ...l, credit: e.target.value, debit: '' } : l))} className="w-28 px-2 py-1.5 bg-surface-muted rounded-lg border border-line font-mono" /> },
                      { key: 'desc', header: 'بيان السطر', render: (line) => <input value={line.description} onChange={(e) => setDraft(draft.map((l, i) => i === line.__idx ? { ...l, description: e.target.value } : l))} className="w-full px-2 py-1.5 bg-surface-muted rounded-lg border border-line" /> },
                      {
                        key: 'del', header: '',
                        render: (line) => (
                          <button type="button" disabled={draft.length <= 2} onClick={() => setDraft(draft.filter((_, i) => i !== line.__idx))} className="p-1 rounded text-danger hover:bg-danger-soft disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
                        ),
                      },
                    ]}
                  />
                <div className="flex items-center justify-between px-3 py-2 bg-surface-muted border-t border-line">
                  <button type="button" onClick={() => setDraft([...draft, emptyLine()])} className="text-[11px] font-bold text-primary hover:text-primary">+ إضافة سطر</button>
                  <div className="flex items-center gap-4 text-[11px] font-bold">
                    <span className="text-success">مدين: {fmt(totals.debit)}</span>
                    <span className="text-danger">دائن: {fmt(totals.credit)}</span>
                    <span className={Math.abs(totals.debit - totals.credit) < 0.01 ? 'text-success' : 'text-danger'}>
                      {Math.abs(totals.debit - totals.credit) < 0.01 ? 'متوازن ✓' : `الفرق: ${fmt(totals.debit - totals.credit)}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving || Math.abs(totals.debit - totals.credit) > 0.009 || totals.debit <= 0} className="px-5 py-2 bg-primary hover:bg-primary disabled:opacity-40 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} ترحيل القيد</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
