import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X, Clock, Loader2, RefreshCw, MessageSquare, Send, UserCheck, Building2 } from 'lucide-react';
import { AuthService } from '../../services/domains/auth/AuthService';
import type { User } from '../../types';
import { SyncChangeApprovalService } from '../../sync/SyncChangeApprovalService';
import { entityLabel, operationLabel } from '../../sync/PendingChangeService';
import type { PendingChange } from '../../types/sync';
import { useToast } from '../ui/Toast';

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'بانتظار الاعتماد', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  APPLIED: { label: 'تم الاعتماد', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  APPROVED: { label: 'تم الاعتماد', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'مرفوض', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { label: 'ملغي', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

interface Props {
  /** Restrict the list to a single requester (used inside the approvals inbox). */
  requestedBy?: string;
  canDecide?: boolean;
}

/**
 * Owner-facing approval inbox for edits staged by sub-branches and linked
 * accounts. Approving pushes the current record to the sync outbox; rejecting
 * keeps local data as-is. Notes can be addressed to the requester and to any
 * number of additional accounts, and every recipient is notified.
 */
export const SyncChangeApprovalsPanel: React.FC<Props> = ({ requestedBy, canDecide = true }) => {
  const toast = useToast();
  const service = useMemo(() => new SyncChangeApprovalService(), []);
  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selected = changes.find((change) => change.id === selectedId) ?? null;

  const refresh = useCallback(() => {
    setLoading(true);
    try {
      setChanges(service.list({ requestedBy, limit: 300 }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل تعديلات الفروع.');
    } finally {
      setLoading(false);
    }
  }, [requestedBy, service, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    try {
      setUsers(new AuthService().getAllUsers().filter((user) => user.isActive));
    } catch {
      setUsers([]);
    }
  }, []);

  const pendingCount = changes.filter((change) => change.status === 'PENDING').length;

  const decide = async (change: PendingChange, approved: boolean) => {
    if (!approved && !notes.trim()) {
      toast.error('اكتب سبب الرفض أو ملاحظة توضح المطلوب.');
      return;
    }
    setBusy(change.id);
    try {
      const recipients = recipientIds
        .map((id) => {
          const user = users.find((candidate) => candidate.id === id);
          return { userId: id, label: user?.fullName ?? null };
        });
      const result = service.decide(change.id, approved, { notes: notes.trim(), recipients });
      toast.success(approved
        ? (result.applied ? 'تم اعتماد التعديل وإضافته للمزامنة.' : 'تم اعتماد التعديل.')
        : 'تم رفض التعديل وإبلاغ الحساب.');
      setNotes('');
      setRecipientIds([]);
      setSelectedId(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تنفيذ القرار.');
    } finally {
      setBusy(null);
    }
  };

  const sendNote = () => {
    if (!selected) return;
    if (!notes.trim()) {
      toast.error('اكتب الملاحظة أولًا.');
      return;
    }
    setBusy(selected.id);
    try {
      const recipients = recipientIds.map((id) => ({
        userId: id,
        label: users.find((candidate) => candidate.id === id)?.fullName ?? null,
      }));
      const sent = service.sendNotes(selected.id, notes.trim(), recipients);
      toast.success(`تم إرسال الملاحظة إلى ${sent} حساب.`);
      setNotes('');
      setRecipientIds([]);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إرسال الملاحظة.');
    } finally {
      setBusy(null);
    }
  };

  const toggleRecipient = (id: string) => {
    setRecipientIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-black text-slate-900">اعتماد تعديلات الفروع والحسابات المرتبطة</h3>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">
              {pendingCount} بانتظار القرار
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* List */}
        <div className="lg:col-span-2 space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {loading && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
            </div>
          )}
          {!loading && changes.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
              لا توجد تعديلات بانتظار الاعتماد.
            </div>
          )}
          {changes.map((change) => {
            const status = STATUS_STYLES[change.status] ?? STATUS_STYLES.PENDING;
            const active = change.id === selectedId;
            return (
              <button
                key={change.id}
                type="button"
                onClick={() => { setSelectedId(change.id); setNotes(''); setRecipientIds([]); }}
                className={`w-full text-right rounded-xl border p-3 transition ${
                  active ? 'border-indigo-400 bg-indigo-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 truncate">{change.title}</span>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${status.cls}`}>
                    {status.label}
                  </span>
                </div>
                {change.summary && <p className="mt-1 text-[11px] text-slate-600 line-clamp-2">{change.summary}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                  <span className="font-bold text-slate-500">{change.requestedByName || '—'}</span>
                  <span className="font-mono">{formatTimestamp(change.createdAt)}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">
                    {operationLabel(change.operationType)} {entityLabel(change.entityType)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          {!selected ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-xs text-slate-500">
              اختر تعديلًا من القائمة لعرض تفاصيله واتخاذ القرار.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                    {operationLabel(selected.operationType)} {entityLabel(selected.entityType)}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">{selected.requestedByName || '—'}</span>
                  {selected.requestedByRole && (
                    <span className="text-[10px] text-slate-400">({selected.requestedByRole})</span>
                  )}
                  <span className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                    <Clock className="h-3 w-3" /> {formatTimestamp(selected.createdAt)}
                  </span>
                </div>
                <h4 className="mt-2 text-sm font-black text-slate-900">{selected.title}</h4>
                {selected.summary && <p className="mt-1 text-xs text-slate-600">{selected.summary}</p>}
                {selected.decisionNotes && (
                  <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                    ملاحظات القرار: {selected.decisionNotes}
                  </p>
                )}
              </div>

              {selected.notes && selected.notes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                    <MessageSquare className="h-3.5 w-3.5" /> سجل الملاحظات
                  </p>
                  {selected.notes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-2 text-[11px] text-slate-700">
                      <span className="font-bold">{note.createdByName || '—'}</span>
                      <span className="text-slate-400"> → {note.recipientLabel || '—'} · {formatTimestamp(note.createdAt)}</span>
                      <p className="mt-0.5">{note.notes}</p>
                    </div>
                  ))}
                </div>
              )}

              {selected.status === 'PENDING' && canDecide && (
                <>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-slate-700">
                      ملاحظة لصاحب التعديل (تُرسل مع القرار):
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={3}
                        placeholder="مثال: راجع الكمية قبل الاعتماد، أو سبب الرفض…"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                      <Building2 className="h-3.5 w-3.5" /> إرسال الملاحظة إلى حسابات إضافية
                    </p>
                    {users.length === 0 ? (
                      <p className="text-[11px] text-slate-400">لا توجد حسابات متاحة للإرسال.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                        {users.map((user) => {
                          const active = recipientIds.includes(user.id);
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => toggleRecipient(user.id)}
                              className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                                active
                                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {user.fullName}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={sendNote}
                      disabled={busy === selected.id}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" /> إرسال الملاحظة فقط
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(selected, false)}
                      disabled={busy === selected.id}
                      className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      {busy === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} رفض
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(selected, true)}
                      disabled={busy === selected.id}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} اعتماد
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SyncChangeApprovalsPanel;
