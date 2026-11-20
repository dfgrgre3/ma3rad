import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  CreditCard,
  Plus,
  Loader2,
  X,
  Trash2,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  History,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { FinanceExtrasService, Cheque, ChequeType } from '../../../services/domains/finance/FinanceExtrasService';
import { FinanceEnterpriseService } from '../../../services/domains/finance/FinanceEnterpriseService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { addLocalDays, localDateString } from '../../../utils/shared/date';
import type { ExtendedChequeStatus, ChequeStatusHistory, BankAccount } from '../../../types/finance';

import { useToast } from '../../../components/ui/Toast';
const TYPE_LABELS: Record<ChequeType, string> = { RECEIVED: 'شيك وارد (لنا)', ISSUED: 'شيك صادر (علينا)' };
const STATUS_LABELS: Record<ExtendedChequeStatus, string> = {
  PENDING: 'معلق بالخزينة',
  DEPOSITED: 'مودع بالبنك',
  CLEARED: 'محصل ومقيد بالبنك',
  BOUNCED: 'مرتد / مرفوض',
  CANCELLED: 'ملغي',
  RE_PRESENTED: 'أعيد تقديمه للبنك',
};
const STATUS_COLORS: Record<ExtendedChequeStatus, string> = {
  PENDING: 'bg-warning-soft text-warning border-warning-border',
  DEPOSITED: 'bg-accent-soft text-primary border-accent-border',
  CLEARED: 'bg-success-soft text-success border-success-border',
  BOUNCED: 'bg-danger-soft text-danger border-danger-border',
  CANCELLED: 'bg-surface-sunken text-muted border-line',
  RE_PRESENTED: 'bg-accent-soft text-primary border-accent-border',
};
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';
const today = () => localDateString();

export const ChequesPage: React.FC = () => {
  const toast = useToast();
  const service = useMemo(() => new FinanceExtrasService(), []);
  const enterpriseService = useMemo(() => new FinanceEnterpriseService(), []);
  const canManageCheques = PermissionService.can(AuthService.getCurrentUser(), 'ui.finance.cheques.approve');

  const [rows, setRows] = useState<Cheque[]>([]);
  const [_bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ChequeType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ExtendedChequeStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New/Edit Modal
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Cheque | null>(null);
  const [form, setForm] = useState({
    chequeNumber: '',
    type: 'RECEIVED' as ChequeType,
    partyType: 'CUSTOMER' as 'CUSTOMER' | 'SUPPLIER' | 'OTHER',
    partyName: '',
    bankName: '',
    amount: '',
    dueDate: today(),
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  // Action / Transition Modal
  const [transitionTarget, setTransitionTarget] = useState<{ cheque: Cheque; toStatus: ExtendedChequeStatus } | null>(null);
  const [actionBankId, setActionBankId] = useState('');
  const [actionBounceReason, setActionBounceReason] = useState('شيك بدون رصيد');
  const [actionBounceFee, setActionBounceFee] = useState('50');

  // History Modal
  const [historyTarget, setHistoryTarget] = useState<Cheque | null>(null);
  const [historyLogs, setHistoryLogs] = useState<ChequeStatusHistory[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setRows(service.getCheques());
      const banks = enterpriseService.getBankAccounts();
      setBankAccounts(banks);
      if (banks.length && !actionBankId) setActionBankId(banks[0].id);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الشيكات.');
    } finally {
      setLoading(false);
    }
  }, [service, enterpriseService, setRows, setBankAccounts, actionBankId, setActionBankId, setError, setLoading]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((row) => {
    const q = search.trim();
    return (
      (typeFilter === 'ALL' || row.type === typeFilter) &&
      (statusFilter === 'ALL' || (row.status as any) === statusFilter) &&
      (!q || row.partyName.includes(q) || row.chequeNumber.includes(q) || (row.bankName || '').includes(q))
    );
  });

  const totals = useMemo(() => {
    const incoming = rows
      .filter((r) => r.type === 'RECEIVED' && r.status !== 'CANCELLED' && (r.status as any) !== 'BOUNCED')
      .reduce((s, r) => s + Number(r.amount), 0);
    const outgoing = rows
      .filter((r) => r.type === 'ISSUED' && r.status !== 'CANCELLED' && (r.status as any) !== 'BOUNCED')
      .reduce((s, r) => s + Number(r.amount), 0);
    const soon = rows.filter((r) => r.status === 'PENDING' && r.dueDate <= localDateString(addLocalDays(new Date(), 7))).length;
    return { incoming, outgoing, soon };
  }, [rows]);

  const openNew = () => {
    setEditing(null);
    setForm({
      chequeNumber: '',
      type: 'RECEIVED',
      partyType: 'CUSTOMER',
      partyName: '',
      bankName: '',
      amount: '',
      dueDate: today(),
      notes: '',
    });
    setModal(true);
  };

  const openEdit = (row: Cheque) => {
    setEditing(row);
    setForm({
      chequeNumber: row.chequeNumber,
      type: row.type,
      partyType: row.partyType,
      partyName: row.partyName,
      bankName: row.bankName || '',
      amount: String(row.amount),
      dueDate: row.dueDate,
      notes: row.notes || '',
    });
    setModal(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      service.saveCheque({
        id: editing?.id,
        chequeNumber: form.chequeNumber,
        type: form.type,
        partyType: form.partyType,
        partyName: form.partyName,
        bankName: form.bankName,
        amount: Number(form.amount),
        dueDate: form.dueDate,
        notes: form.notes,
        status: editing?.status || 'PENDING',
        createdBy: AuthService.getCurrentUser()?.id,
      });
      setModal(false);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حفظ الشيك.');
    } finally {
      setSaving(false);
    }
  };

  const handleActionConfirm = () => {
    if (!transitionTarget) return;
    setSaving(true);
    try {
      enterpriseService.transitionChequeStatus(transitionTarget.cheque.id, transitionTarget.toStatus, {
        bankAccountId: actionBankId,
        bounceReason: actionBounceReason,
        bounceFee: Number(actionBounceFee) || 0,
        date: localDateString(),
      });
      setTransitionTarget(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تنفيذ الإجراء المحاسبي على الشيك.');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = (row: Cheque) => {
    setHistoryTarget(row);
    try {
      setHistoryLogs(enterpriseService.getChequeHistory(row.id));
    } catch {
      setHistoryLogs([]);
    }
  };

  const remove = (row: Cheque) => {
    if (!confirm(`حذف الشيك ${row.chequeNumber}؟`)) return;
    try {
      service.deleteCheque(row.id);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حذف الشيك.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      {/* Header */}
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<CreditCard className="h-5 w-5" />}
          title="إدارة ودورة حياة الشيكات"
          description="إيداع، تحصيل، ارتداد، إعادة تقديم، وربط تلقائي بالقيود المحاسبية"
          actions={canManageCheques && <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-warning hover:bg-warning text-white rounded-xl text-sm font-bold transition shrink-0"
          >
            <Plus className="w-4 h-4" /> تسجيل شيك
          </button>}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-surface border-b border-line">
        <div className="rounded-xl border border-success-border bg-success-soft px-4 py-3">
          <div className="text-[10px] font-bold text-success flex items-center gap-1">
            <ArrowDownLeft className="w-3 h-3" /> شيكات واردة فعالة
          </div>
          <div className="text-lg font-black text-success mt-1">{fmt(totals.incoming)}</div>
        </div>
        <div className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3">
          <div className="text-[10px] font-bold text-danger flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> شيكات صادرة للدفع
          </div>
          <div className="text-lg font-black text-danger mt-1">{fmt(totals.outgoing)}</div>
        </div>
        <div className="rounded-xl border border-warning-border bg-warning-soft px-4 py-3">
          <div className="text-[10px] font-bold text-warning flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> تستحق خلال 7 أيام
          </div>
          <div className="text-lg font-black text-warning mt-1">{totals.soon} شيك</div>
        </div>
      </div>

      {/* Filter Strip */}
      <div className="px-6 py-3 bg-surface border-b border-line flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => e.preventDefault()} className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الشيك أو اسم الطرف..."
            className="w-full pl-4 pr-10 py-2 bg-surface-muted border border-line rounded-xl text-sm focus:outline-none focus:border-warning"
          />
        </form>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          className="px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold"
        >
          <option value="ALL">كل الأنواع</option>
          <option value="RECEIVED">واردة (شيكات عملاء)</option>
          <option value="ISSUED">صادرة (شيكات موردين)</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold"
        >
          <option value="ALL">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Cheques Grid */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">
            {error}
          </div>
        )}
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-warning" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted border-2 border-dashed border-line rounded-2xl bg-surface">
            لا توجد شيكات مطابقة للبحث
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((row) => {
              const statusKey = row.status as ExtendedChequeStatus;
              return (
                <div
                  key={row.id}
                  className="bg-surface border border-line rounded-xl p-4 flex flex-col hover:border-line-strong transition shadow-xs"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] px-2 py-1 rounded border font-bold ${
                        row.type === 'RECEIVED'
                          ? 'bg-success-soft text-success border-success-border'
                          : 'bg-danger-soft text-danger border-danger-border'
                      }`}
                    >
                      {TYPE_LABELS[row.type]}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-1 rounded-full border font-bold ${STATUS_COLORS[statusKey] || 'bg-surface-sunken text-ink-secondary'}`}
                    >
                      {STATUS_LABELS[statusKey] || row.status}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-ink">{row.partyName}</h3>
                  <div className="text-[11px] text-muted mt-1 font-mono">
                    #{row.chequeNumber} · {row.bankName || 'بدون بنك محدد'}
                  </div>
                  <div className="text-lg font-black text-ink mt-2">{fmt(Number(row.amount))}</div>
                  <div className="text-[11px] text-muted mt-1 font-medium">الاستحقاق: {row.dueDate}</div>
                  {row.notes && <p className="text-[11px] text-muted mt-1.5 line-clamp-1">{row.notes}</p>}

                  {/* Lifecycle Action Buttons */}
                  <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center gap-1.5">
                    {canManageCheques && row.status === 'PENDING' && (
                      <button
                        onClick={() => setTransitionTarget({ cheque: row, toStatus: 'DEPOSITED' })}
                        className="px-2 py-1 bg-accent-soft text-primary hover:bg-accent-soft rounded-lg text-[10px] font-bold"
                      >
                        إيداع بالبنك
                      </button>
                    )}
                    {canManageCheques && (row.status === 'PENDING' || row.status === 'DEPOSITED' || (row.status as any) === 'RE_PRESENTED') && (
                      <button
                        onClick={() => setTransitionTarget({ cheque: row, toStatus: 'CLEARED' })}
                        className="px-2 py-1 bg-success text-white hover:bg-success rounded-lg text-[10px] font-bold"
                      >
                        تحصيل وقيد بنكي
                      </button>
                    )}
                    {canManageCheques && (row.status === 'DEPOSITED' || row.status === 'CLEARED' || (row.status as any) === 'RE_PRESENTED') && (
                      <button
                        onClick={() => setTransitionTarget({ cheque: row, toStatus: 'BOUNCED' })}
                        className="px-2 py-1 bg-danger-soft text-danger hover:bg-danger-soft rounded-lg text-[10px] font-bold"
                      >
                        ارتداد
                      </button>
                    )}
                    {canManageCheques && (row.status as any) === 'BOUNCED' && (
                      <button
                        onClick={() => setTransitionTarget({ cheque: row, toStatus: 'RE_PRESENTED' })}
                        className="px-2 py-1 bg-accent-soft text-primary hover:bg-accent-soft rounded-lg text-[10px] font-bold"
                      >
                        إعادة تقديم
                      </button>
                    )}

                    <div className="mr-auto flex items-center gap-1">
                      <button
                        onClick={() => openHistory(row)}
                        title="سجل الحركات"
                        className="p-1 rounded-lg text-muted hover:bg-surface-sunken"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      {canManageCheques && <button
                        onClick={() => openEdit(row)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-surface-sunken text-ink-secondary font-bold hover:bg-surface-sunken"
                      >
                        تعديل
                      </button>}
                      {canManageCheques && <button onClick={() => remove(row)} className="p-1 rounded-lg text-danger hover:bg-danger-soft">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Lifecycle Transition Confirmation */}
      {transitionTarget && canManageCheques && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-md w-full p-6 text-xs">
            <h3 className="text-base font-extrabold mb-2">
              تأكيد إجراء: {STATUS_LABELS[transitionTarget.toStatus]}
            </h3>
            <p className="text-muted mb-4">
              شيك رقم #{transitionTarget.cheque.chequeNumber} بمبلغ {fmt(Number(transitionTarget.cheque.amount))} -{' '}
              {transitionTarget.cheque.partyName}
            </p>

            {transitionTarget.toStatus === 'CLEARED' && (
              <div className="p-3 bg-success-soft text-success rounded-xl mb-3 space-y-1">
                <span className="font-bold block">الأثر المحاسبي التلقائي:</span>
                <span>
                  {transitionTarget.cheque.type === 'RECEIVED'
                    ? 'سيتم ترحيل قيد تحصيل: من حـ/ البنك (1102) إلى حـ/ شيكات برسم التحصيل (1105).'
                    : 'سيتم ترحيل قيد صرف: من حـ/ أوراق دفع وشيكات صادرة (2105) إلى حـ/ البنك (1102).'}
                </span>
              </div>
            )}

            {transitionTarget.toStatus === 'BOUNCED' && (
              <div className="space-y-3 mb-4">
                <div className="p-3 bg-danger-soft text-danger rounded-xl space-y-1">
                  <span className="font-bold block">الأثر المحاسبي التلقائي:</span>
                  <span>
                    سيتم عكس القيد وإعادة المديونية إلى حساب العميل، مع إمكانية إضافة رسم/غرامة ارتداد بنكية.
                  </span>
                </div>
                <div>
                  <label className="font-bold text-ink block mb-1">سبب الارتداد البنكي</label>
                  <input
                    type="text"
                    value={actionBounceReason}
                    onChange={(e) => setActionBounceReason(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line"
                  />
                </div>
                <div>
                  <label className="font-bold text-ink block mb-1">مصاريف ارتداد بنكية تُحمل على العميل (ج.م)</label>
                  <input
                    type="number"
                    value={actionBounceFee}
                    onChange={(e) => setActionBounceFee(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setTransitionTarget(null)}
                className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleActionConfirm}
                className="px-5 py-2 bg-primary hover:bg-black text-white font-bold rounded-xl flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} تأكيد الترحيل المحاسبي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: History Audit Log */}
      {historyTarget && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-lg w-full p-6 text-xs">
            <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-warning" />
                <h3 className="text-base font-extrabold text-ink">
                  سجل دورة حياة الشيك #{historyTarget.chequeNumber}
                </h3>
              </div>
              <button onClick={() => setHistoryTarget(null)} className="p-1 rounded text-muted hover:bg-surface-sunken">
                <X className="w-4 h-4" />
              </button>
            </div>

            {historyLogs.length === 0 ? (
              <p className="py-8 text-center text-muted">لا توجد حركات مسجلة حتى الآن لهذا الشيك.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-auto">
                {historyLogs.map((h) => (
                  <div key={h.id} className="p-2.5 bg-surface-muted rounded-xl border border-line space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-ink">
                        تحويل الحالة إلى: {STATUS_LABELS[h.toStatus] || h.toStatus}
                      </span>
                      <span className="font-mono text-[10px] text-muted">{h.changedAt}</span>
                    </div>
                    <div className="text-[11px] text-muted">
                      بواسطة: {h.changedByName || 'المستخدم'}{' '}
                      {h.journalEntryId && <span className="font-mono text-primary font-bold">· قيد رقم: {h.journalEntryId}</span>}
                    </div>
                    {h.notes && <div className="text-[11px] text-ink-secondary">{h.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create/Edit Cheque */}
      {modal && canManageCheques && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">{editing ? 'تعديل شيك' : 'تسجيل شيك جديد'}</h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-ink block mb-1">رقم الشيك *</label>
                  <input
                    required
                    value={form.chequeNumber}
                    onChange={(e) => setForm({ ...form, chequeNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-ink block mb-1">النوع</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as ChequeType })}
                    className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold"
                  >
                    <option value="RECEIVED">وارد (لنا)</option>
                    <option value="ISSUED">صادر (علينا)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-ink block mb-1">نوع الطرف</label>
                  <select
                    value={form.partyType}
                    onChange={(e) => setForm({ ...form, partyType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold"
                  >
                    <option value="CUSTOMER">عميل</option>
                    <option value="SUPPLIER">مورد</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-ink block mb-1">اسم الطرف *</label>
                  <input
                    required
                    value={form.partyName}
                    onChange={(e) => setForm({ ...form, partyName: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-ink block mb-1">البنك المسحوب عليه</label>
                  <input
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line"
                  />
                </div>
                <div>
                  <label className="font-bold text-ink block mb-1">المبلغ *</label>
                  <input
                    required
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-ink block mb-1">تاريخ الاستحقاق *</label>
                <input
                  required
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-ink block mb-1">ملاحظات</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-warning hover:bg-warning text-white font-bold rounded-xl flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
