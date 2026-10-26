import React, { useEffect, useMemo, useState } from 'react';
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
  CheckCircle2,
  Building2,
  Undo2,
  Scale,
} from 'lucide-react';
import { FinanceExtrasService, Cheque, ChequeType } from '../../services/FinanceExtrasService';
import { FinanceEnterpriseService } from '../../services/FinanceEnterpriseService';
import { AuthService } from '../../services/AuthService';
import { addLocalDays, localDateString } from '../../utils/date';
import type { ExtendedChequeStatus, ChequeStatusHistory, BankAccount } from '../../types/finance';

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
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  DEPOSITED: 'bg-sky-50 text-sky-700 border-sky-200',
  CLEARED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  BOUNCED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  RE_PRESENTED: 'bg-purple-50 text-purple-700 border-purple-200',
};
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';
const today = () => localDateString();

export const ChequesPage: React.FC = () => {
  const service = useMemo(() => new FinanceExtrasService(), []);
  const enterpriseService = useMemo(() => new FinanceEnterpriseService(), []);

  const [rows, setRows] = useState<Cheque[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
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

  const load = () => {
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
  };

  useEffect(() => {
    load();
  }, []);

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
      alert(err?.message || 'تعذر حفظ الشيك.');
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
      alert(err?.message || 'تعذر تنفيذ الإجراء المحاسبي على الشيك.');
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
      alert(err?.message || 'تعذر حذف الشيك.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-base font-black">إدارة ودورة حياة الشيكات</h1>
            <p className="text-xs text-slate-500 font-medium">
              إيداع، تحصيل، ارتداد، إعادة تقديم، وربط تلقائي بالقيود المحاسبية
            </p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition shrink-0"
        >
          <Plus className="w-4 h-4" /> تسجيل شيك
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-white border-b border-slate-200">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
            <ArrowDownLeft className="w-3 h-3" /> شيكات واردة فعالة
          </div>
          <div className="text-lg font-black text-emerald-700 mt-1">{fmt(totals.incoming)}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> شيكات صادرة للدفع
          </div>
          <div className="text-lg font-black text-rose-700 mt-1">{fmt(totals.outgoing)}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> تستحق خلال 7 أيام
          </div>
          <div className="text-lg font-black text-amber-700 mt-1">{totals.soon} شيك</div>
        </div>
      </div>

      {/* Filter Strip */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => e.preventDefault()} className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الشيك أو اسم الطرف..."
            className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-400"
          />
        </form>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        >
          <option value="ALL">كل الأنواع</option>
          <option value="RECEIVED">واردة (شيكات عملاء)</option>
          <option value="ISSUED">صادرة (شيكات موردين)</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
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
          <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {error}
          </div>
        )}
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
            لا توجد شيكات مطابقة للبحث
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((row) => {
              const statusKey = row.status as ExtendedChequeStatus;
              return (
                <div
                  key={row.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col hover:border-slate-300 transition shadow-xs"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] px-2 py-1 rounded border font-bold ${
                        row.type === 'RECEIVED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {TYPE_LABELS[row.type]}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-1 rounded-full border font-bold ${STATUS_COLORS[statusKey] || 'bg-slate-100 text-slate-600'}`}
                    >
                      {STATUS_LABELS[statusKey] || row.status}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-slate-900">{row.partyName}</h3>
                  <div className="text-[11px] text-slate-500 mt-1 font-mono">
                    #{row.chequeNumber} · {row.bankName || 'بدون بنك محدد'}
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-2">{fmt(Number(row.amount))}</div>
                  <div className="text-[11px] text-slate-500 mt-1 font-medium">الاستحقاق: {row.dueDate}</div>
                  {row.notes && <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-1">{row.notes}</p>}

                  {/* Lifecycle Action Buttons */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    {row.status === 'PENDING' && (
                      <button
                        onClick={() => setTransitionTarget({ cheque: row, toStatus: 'DEPOSITED' })}
                        className="px-2 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg text-[10px] font-bold"
                      >
                        إيداع بالبنك
                      </button>
                    )}
                    {(row.status === 'PENDING' || row.status === 'DEPOSITED' || (row.status as any) === 'RE_PRESENTED') && (
                      <button
                        onClick={() => setTransitionTarget({ cheque: row, toStatus: 'CLEARED' })}
                        className="px-2 py-1 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-[10px] font-bold"
                      >
                        تحصيل وقيد بنكي
                      </button>
                    )}
                    {(row.status === 'DEPOSITED' || row.status === 'CLEARED' || (row.status as any) === 'RE_PRESENTED') && (
                      <button
                        onClick={() => setTransitionTarget({ cheque: row, toStatus: 'BOUNCED' })}
                        className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-[10px] font-bold"
                      >
                        ارتداد
                      </button>
                    )}
                    {(row.status as any) === 'BOUNCED' && (
                      <button
                        onClick={() => setTransitionTarget({ cheque: row, toStatus: 'RE_PRESENTED' })}
                        className="px-2 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-[10px] font-bold"
                      >
                        إعادة تقديم
                      </button>
                    )}

                    <div className="mr-auto flex items-center gap-1">
                      <button
                        onClick={() => openHistory(row)}
                        title="سجل الحركات"
                        className="p-1 rounded-lg text-slate-500 hover:bg-slate-100"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEdit(row)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold hover:bg-slate-200"
                      >
                        تعديل
                      </button>
                      <button onClick={() => remove(row)} className="p-1 rounded-lg text-rose-500 hover:bg-rose-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Lifecycle Transition Confirmation */}
      {transitionTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 text-xs">
            <h3 className="text-base font-extrabold mb-2">
              تأكيد إجراء: {STATUS_LABELS[transitionTarget.toStatus]}
            </h3>
            <p className="text-slate-500 mb-4">
              شيك رقم #{transitionTarget.cheque.chequeNumber} بمبلغ {fmt(Number(transitionTarget.cheque.amount))} -{' '}
              {transitionTarget.cheque.partyName}
            </p>

            {transitionTarget.toStatus === 'CLEARED' && (
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl mb-3 space-y-1">
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
                <div className="p-3 bg-rose-50 text-rose-800 rounded-xl space-y-1">
                  <span className="font-bold block">الأثر المحاسبي التلقائي:</span>
                  <span>
                    سيتم عكس القيد وإعادة المديونية إلى حساب العميل، مع إمكانية إضافة رسم/غرامة ارتداد بنكية.
                  </span>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">سبب الارتداد البنكي</label>
                  <input
                    type="text"
                    value={actionBounceReason}
                    onChange={(e) => setActionBounceReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">مصاريف ارتداد بنكية تُحمل على العميل (ج.م)</label>
                  <input
                    type="number"
                    value={actionBounceFee}
                    onChange={(e) => setActionBounceFee(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTransitionTarget(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleActionConfirm}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white font-bold rounded-xl flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} تأكيد الترحيل المحاسبي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: History Audit Log */}
      {historyTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 text-xs">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-extrabold text-slate-800">
                  سجل دورة حياة الشيك #{historyTarget.chequeNumber}
                </h3>
              </div>
              <button onClick={() => setHistoryTarget(null)} className="p-1 rounded text-slate-400 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {historyLogs.length === 0 ? (
              <p className="py-8 text-center text-slate-400">لا توجد حركات مسجلة حتى الآن لهذا الشيك.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-auto">
                {historyLogs.map((h) => (
                  <div key={h.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-800">
                        تحويل الحالة إلى: {STATUS_LABELS[h.toStatus] || h.toStatus}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{h.changedAt}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      بواسطة: {h.changedByName || 'المستخدم'}{' '}
                      {h.journalEntryId && <span className="font-mono text-indigo-600 font-bold">· قيد رقم: {h.journalEntryId}</span>}
                    </div>
                    {h.notes && <div className="text-[11px] text-slate-600">{h.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create/Edit Cheque */}
      {modal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">{editing ? 'تعديل شيك' : 'تسجيل شيك جديد'}</h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">رقم الشيك *</label>
                  <input
                    required
                    value={form.chequeNumber}
                    onChange={(e) => setForm({ ...form, chequeNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">النوع</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as ChequeType })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  >
                    <option value="RECEIVED">وارد (لنا)</option>
                    <option value="ISSUED">صادر (علينا)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">نوع الطرف</label>
                  <select
                    value={form.partyType}
                    onChange={(e) => setForm({ ...form, partyType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  >
                    <option value="CUSTOMER">عميل</option>
                    <option value="SUPPLIER">مورد</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">اسم الطرف *</label>
                  <input
                    required
                    value={form.partyName}
                    onChange={(e) => setForm({ ...form, partyName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">البنك المسحوب عليه</label>
                  <input
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المبلغ *</label>
                  <input
                    required
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">تاريخ الاستحقاق *</label>
                <input
                  required
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">ملاحظات</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2"
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

