import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X, Clock, Loader2, RefreshCw, MessageSquare, Send, UserCheck, Building2 } from 'lucide-react';
import { AuthService } from '../../services/domains/auth/AuthService';
import type { User } from '../../types';
import { SyncChangeApprovalService } from '../../sync/SyncChangeApprovalService';
import { entityLabel, operationLabel } from '../../sync/PendingChangeService';
import type { PendingChange } from '../../types/sync';
import { useToast } from '../ui/Toast';

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'بانتظار الاعتماد', cls: 'bg-warning-soft text-warning border-warning-border' },
  APPLIED: { label: 'تم الاعتماد', cls: 'bg-success-soft text-success border-success-border' },
  APPROVED: { label: 'تم الاعتماد', cls: 'bg-success-soft text-success border-success-border' },
  REJECTED: { label: 'مرفوض', cls: 'bg-danger-soft text-danger border-danger-border' },
  CANCELLED: { label: 'ملغي', cls: 'bg-surface-sunken text-muted border-line' },
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
          <UserCheck className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-black text-ink">اعتماد تعديلات الفروع والحسابات المرتبطة</h3>
          {pendingCount > 0 && (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-black text-warning">
              {pendingCount} بانتظار القرار
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-surface-muted"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* List */}
        <div className="lg:col-span-2 space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {loading && (
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-4 text-xs text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
            </div>
          )}
          {!loading && changes.length === 0 && (
            <div className="rounded-xl border border-dashed border-line bg-surface-muted p-6 text-center text-xs text-muted">
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
                  active ? 'border-primary bg-accent-soft/60 shadow-sm' : 'border-line bg-surface hover:border-line-strong'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-ink truncate">{change.title}</span>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${status.cls}`}>
                    {status.label}
                  </span>
                </div>
                {change.summary && <p className="mt-1 text-[11px] text-ink-secondary line-clamp-2">{change.summary}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted">
                  <span className="font-bold text-muted">{change.requestedByName || '—'}</span>
                  <span className="font-mono">{formatTimestamp(change.createdAt)}</span>
                  <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-bold text-ink-secondary">
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
            <div className="rounded-2xl border border-dashed border-line bg-surface-muted p-10 text-center text-xs text-muted">
              اختر تعديلًا من القائمة لعرض تفاصيله واتخاذ القرار.
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-black text-primary">
                    {operationLabel(selected.operationType)} {entityLabel(selected.entityType)}
                  </span>
                  <span className="text-[11px] font-bold text-muted">{selected.requestedByName || '—'}</span>
                  {selected.requestedByRole && (
                    <span className="text-[10px] text-muted">({selected.requestedByRole})</span>
                  )}
                  <span className="flex items-center gap-1 text-[10px] font-mono text-muted">
                    <Clock className="h-3 w-3" /> {formatTimestamp(selected.createdAt)}
                  </span>
                </div>
                <h4 className="mt-2 text-sm font-black text-ink">{selected.title}</h4>
                {selected.summary && <p className="mt-1 text-xs text-ink-secondary">{selected.summary}</p>}
                {selected.decisionNotes && (
                  <p className="mt-2 rounded-lg bg-surface-muted p-2 text-[11px] text-ink-secondary">
                    ملاحظات القرار: {selected.decisionNotes}
                  </p>
                )}
              </div>

              {selected.notes && selected.notes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink-secondary">
                    <MessageSquare className="h-3.5 w-3.5" /> سجل الملاحظات
                  </p>
                  {selected.notes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-line bg-surface-muted/70 p-2 text-[11px] text-ink">
                      <span className="font-bold">{note.createdByName || '—'}</span>
                      <span className="text-muted"> → {note.recipientLabel || '—'} · {formatTimestamp(note.createdAt)}</span>
                      <p className="mt-0.5">{note.notes}</p>
                    </div>
                  ))}
                </div>
              )}

              {selected.status === 'PENDING' && canDecide && (
                <>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-ink">
                      ملاحظة لصاحب التعديل (تُرسل مع القرار):
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={3}
                        placeholder="مثال: راجع الكمية قبل الاعتماد، أو سبب الرفض…"
                        className="mt-1 w-full rounded-xl border border-line-strong px-3 py-2 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
                      <Building2 className="h-3.5 w-3.5" /> إرسال الملاحظة إلى حسابات إضافية
                    </p>
                    {users.length === 0 ? (
                      <p className="text-[11px] text-muted">لا توجد حسابات متاحة للإرسال.</p>
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
                                  ? 'border-primary bg-accent-soft text-primary'
                                  : 'border-line bg-surface text-ink-secondary hover:bg-surface-muted'
                              }`}
                            >
                              {user.fullName}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                    <button
                      type="button"
                      onClick={sendNote}
                      disabled={busy === selected.id}
                      className="flex items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs font-bold text-ink hover:bg-surface-muted disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" /> إرسال الملاحظة فقط
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(selected, false)}
                      disabled={busy === selected.id}
                      className="flex items-center gap-1.5 rounded-xl border border-danger-border bg-danger-soft px-4 py-2 text-xs font-bold text-danger hover:bg-danger-soft disabled:opacity-50"
                    >
                      {busy === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} رفض
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(selected, true)}
                      disabled={busy === selected.id}
                      className="flex items-center gap-1.5 rounded-xl bg-success px-4 py-2 text-xs font-bold text-white hover:bg-success disabled:opacity-50"
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
