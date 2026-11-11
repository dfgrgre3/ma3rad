import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, ClipboardCheck, FileBadge, MessageSquareText, Plus, RefreshCw,
  ShieldCheck, Trash2, UserMinus, XCircle,
} from 'lucide-react';
import {
  EmployeeClearanceService, EmployeeClearance, ClearanceStatus,
  ClearanceChecklistItem, ClearanceItemStatus, ClearanceSummary,
} from '../../../services/domains/hr/EmployeeClearanceService';
import { EmployeeService, Employee } from '../../../services/domains/hr/EmployeeService';
import { AuthService } from '../../../services/domains/auth/AuthService';

type Tab = 'requests' | 'followup';

const todayStr = () => new Date().toISOString().slice(0, 10);

const statusLabel: Record<ClearanceStatus, string> = {
  PENDING: 'بالانتظار',
  IN_PROGRESS: 'قيد الإجراء',
  ASSETS_RETURNED: 'أُعيدت الأصول',
  FINANCIAL_CLEARED: 'تمت التسوية المالية',
  CLEARED: 'مكتمل',
  REJECTED: 'مرفوض',
  CANCELLED: 'ملغي',
};

const itemStatusLabel: Record<ClearanceItemStatus, string> = {
  PENDING: 'بالانتظار',
  COMPLETED: 'مكتمل',
  WAIVED: 'معفى',
  NOT_APPLICABLE: 'لا ينطبق',
};

const statusTone = (status: string): string => {
  switch (status) {
    case 'CLEARED': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'PENDING': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'IN_PROGRESS': return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'REJECTED': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'CANCELLED': return 'bg-slate-100 text-slate-500 border-slate-200';
    default: return 'bg-teal-50 text-teal-700 border-teal-200';
  }
};

const assetStatusLabel: Record<string, string> = {
  PENDING: 'بالانتظار', RETURNED: 'تم الإرجاع', PARTIAL: 'جزئي', NOT_RETURNED: 'لم يُرجع',
};

const financialStatusLabel: Record<string, string> = {
  PENDING: 'بالانتظار', CLEARED: 'مسوّى', OUTSTANDING: 'مستحقات قائمة',
};

const categoryLabel: Record<string, string> = {
  ASSETS: 'الأصول',
  FINANCIAL: 'المالية',
  SYSTEM_ACCESS: 'صلاحيات النظام',
  ADMINISTRATIVE: 'إدارية',
};

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode; tone: string }> = ({ label, value, icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-slate-500">{label}</span>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${tone}`}>{icon}</span>
    </div>
    <div className="mt-2 text-xl font-black tabular-nums">{value}</div>
  </div>
);

export const EmployeeClearancePage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('requests');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [clearances, setClearances] = useState<EmployeeClearance[]>([]);
  const [summary, setSummary] = useState<ClearanceSummary | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [interviewers, setInterviewers] = useState<Array<{ id: string; fullName: string }>>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [form, setForm] = useState({ employeeId: '', terminationDate: todayStr(), reason: '' });
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [interviewForm, setInterviewForm] = useState({
    interviewerId: '', interviewDate: todayStr(), reasonForLeaving: '',
    satisfactionScore: '3', wouldRecommend: '3', feedback: '', actionItems: '',
  });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setClearances(EmployeeClearanceService.getEmployeeClearances((statusFilter || undefined) as ClearanceStatus | undefined));
      setSummary(EmployeeClearanceService.getClearanceSummary());
      setEmployees(EmployeeService.getAll({}));
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات إخلاء الطرف.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    try {
      const users = new AuthService().getAllUsers().map((user) => ({ id: user.id, fullName: user.fullName }));
      setInterviewers(users);
      const me = AuthService.getCurrentUser();
      setInterviewForm((prev) => ({ ...prev, interviewerId: prev.interviewerId || users[0]?.id || me?.id || '' }));
    } catch {
      const me = AuthService.getCurrentUser();
      if (me) {
        setInterviewers([{ id: me.id, fullName: me.fullName }]);
        setInterviewForm((prev) => ({ ...prev, interviewerId: prev.interviewerId || me.id }));
      }
    }
  }, []);

  const selected = useMemo(
    () => clearances.find((clearance) => clearance.id === selectedId) || null,
    [clearances, selectedId],
  );

  useEffect(() => {
    if (selected) {
      const drafts: Record<string, string> = {};
      for (const item of selected.checklistItems) drafts[item.id] = item.notes || '';
      setNotesDraft(drafts);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (action: () => void, success?: string) => {
    setError(null);
    setNotice(null);
    try {
      action();
      if (success) setNotice(success);
      load();
    } catch (e: any) {
      setError(e?.message || 'تعذر تنفيذ العملية.');
    }
  };

  const openFollowup = (clearance: EmployeeClearance) => {
    setSelectedId(clearance.id);
    setTab('followup');
  };

  const createClearance = () => {
    if (!form.employeeId) { setError('يجب اختيار الموظف.'); return; }
    if (!form.reason.trim()) { setError('سبب إنهاء الخدمة مطلوب.'); return; }
    run(() => {
      const created = EmployeeClearanceService.createEmployeeClearance({
        employeeId: form.employeeId,
        terminationDate: form.terminationDate,
        reason: form.reason.trim(),
      });
      setSelectedId(created.id);
      setForm({ employeeId: '', terminationDate: todayStr(), reason: '' });
    }, 'تم إنشاء طلب إخلاء الطرف بنجاح.');
  };

  const updateItem = (item: ClearanceChecklistItem, status: ClearanceItemStatus) => {
    if (!selected) return;
    run(() => EmployeeClearanceService.updateChecklistItem(selected.id, item.id, {
      status,
      notes: notesDraft[item.id] || undefined,
    }), 'تم تحديث بند قائمة التحقق.');
  };

  const saveItemNotes = (item: ClearanceChecklistItem) => {
    if (!selected) return;
    run(() => EmployeeClearanceService.updateChecklistItem(selected.id, item.id, {
      status: item.status,
      notes: notesDraft[item.id] || undefined,
    }), 'تم حفظ الملاحظات.');
  };

  const approve = () => {
    if (!selected) return;
    if (!window.confirm('اعتماد إخلاء الطرف نهائياً؟')) return;
    run(() => EmployeeClearanceService.approveClearance(selected.id), 'تم اعتماد إخلاء الطرف.');
  };

  const reject = () => {
    if (!selected) return;
    const reason = window.prompt('سبب رفض إخلاء الطرف:');
    if (!reason?.trim()) return;
    run(() => EmployeeClearanceService.rejectClearance(selected.id, reason.trim()), 'تم رفض الطلب.');
  };

  const cancel = () => {
    if (!selected) return;
    if (!window.confirm('إلغاء طلب إخلاء الطرف؟')) return;
    run(() => EmployeeClearanceService.cancelClearance(selected.id), 'تم إلغاء الطلب.');
  };

  const issueCertificate = () => {
    if (!selected) return;
    if (!window.confirm('إصدار شهادة إخلاء الطرف؟')) return;
    run(() => EmployeeClearanceService.issueClearanceCertificate(selected.id), 'تم إصدار الشهادة.');
  };

  const saveInterview = () => {
    if (!selected) return;
    if (!interviewForm.interviewerId) { setError('يجب اختيار مسؤول المقابلة.'); return; }
    run(() => EmployeeClearanceService.createExitInterview({
      clearanceId: selected.id,
      interviewerId: interviewForm.interviewerId,
      interviewDate: interviewForm.interviewDate,
      reasonForLeaving: interviewForm.reasonForLeaving || null,
      satisfactionScore: interviewForm.satisfactionScore ? Number(interviewForm.satisfactionScore) : null,
      wouldRecommend: interviewForm.wouldRecommend ? Number(interviewForm.wouldRecommend) : null,
      feedback: interviewForm.feedback || null,
      actionItems: interviewForm.actionItems || null,
    }), 'تم تسجيل مقابلة الخروج.');
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'requests', label: 'طلبات إخلاء الطرف', icon: <UserMinus className="h-4 w-4" /> },
    { id: 'followup', label: 'المتابعة وقائمة التحقق', icon: <ClipboardCheck className="h-4 w-4" /> },
  ];

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ClearanceChecklistItem[]>();
    for (const item of selected?.checklistItems || []) {
      const list = groups.get(item.category) || [];
      list.push(item);
      groups.set(item.category, list);
    }
    return Array.from(groups.entries());
  }, [selected]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 text-slate-900" dir="rtl">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-200 bg-teal-50">
          <ShieldCheck className="h-5 w-5 text-teal-600" />
        </div>
        <div>
          <h1 className="text-base font-black">إخلاء الطرف</h1>
          <p className="text-xs font-medium text-slate-500">متابعة إنهاء خدمة الموظفين، إعادة الأصول، التسوية المالية، ومقابلات الخروج</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700">{notice}</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="إجمالي الطلبات" value={String(summary?.total ?? 0)} icon={<ClipboardCheck className="h-4 w-4" />} tone="border-slate-200 bg-slate-50 text-slate-600" />
          <StatCard label="بالانتظار" value={String(summary?.pending ?? 0)} icon={<XCircle className="h-4 w-4" />} tone="border-amber-200 bg-amber-50 text-amber-600" />
          <StatCard label="قيد الإجراء" value={String(summary?.inProgress ?? 0)} icon={<RefreshCw className="h-4 w-4" />} tone="border-sky-200 bg-sky-50 text-sky-600" />
          <StatCard label="مكتمل" value={String(summary?.cleared ?? 0)} icon={<CheckCircle2 className="h-4 w-4" />} tone="border-emerald-200 bg-emerald-50 text-emerald-600" />
          <StatCard label="مرفوض / ملغي" value={String((summary?.rejected ?? 0) + (summary?.cancelled ?? 0))} icon={<XCircle className="h-4 w-4" />} tone="border-rose-200 bg-rose-50 text-rose-600" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${tab === item.id ? 'bg-teal-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
          <div className="mr-auto flex items-center gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <option value="">كل الحالات</option>
              {(Object.keys(statusLabel) as ClearanceStatus[]).map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
            </select>
            <button onClick={load} className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-teal-500" /></div>
        ) : tab === 'requests' ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-black">الطلبات ({clearances.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-right text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-bold">رقم الطلب</th>
                      <th className="px-3 py-2 font-bold">الموظف</th>
                      <th className="px-3 py-2 font-bold">تاريخ الإنهاء</th>
                      <th className="px-3 py-2 font-bold">الأصول</th>
                      <th className="px-3 py-2 font-bold">المالية</th>
                      <th className="px-3 py-2 font-bold">الحالة</th>
                      <th className="px-3 py-2 font-bold">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clearances.map((clearance) => (
                      <tr key={clearance.id} className={`hover:bg-slate-50/70 ${selectedId === clearance.id ? 'bg-teal-50/40' : ''}`}>
                        <td className="px-3 py-3 font-mono text-[10px]">{clearance.clearanceNumber}</td>
                        <td className="px-3 py-3">
                          <div className="font-bold">{clearance.employeeName}</div>
                          <div className="text-[10px] text-slate-500">{clearance.departmentName} • {clearance.branchName}</div>
                        </td>
                        <td className="px-3 py-3 tabular-nums">{clearance.terminationDate}</td>
                        <td className="px-3 py-3 text-[10px]">{assetStatusLabel[clearance.assetClearanceStatus] || clearance.assetClearanceStatus}</td>
                        <td className="px-3 py-3 text-[10px]">{financialStatusLabel[clearance.financialClearanceStatus] || clearance.financialClearanceStatus}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(clearance.status)}`}>{statusLabel[clearance.status]}</span>
                          {clearance.clearanceCertificateIssued && <div className="mt-1 text-[10px] font-bold text-emerald-600">شهادة صادرة</div>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            <button onClick={() => openFollowup(clearance)} className="rounded border border-teal-200 px-2 py-1 text-[10px] font-bold text-teal-700 hover:bg-teal-50">متابعة</button>
                            {clearance.status === 'CLEARED' && !clearance.clearanceCertificateIssued && (
                              <button onClick={() => { setSelectedId(clearance.id); run(() => EmployeeClearanceService.issueClearanceCertificate(clearance.id), 'تم إصدار الشهادة.'); }} className="rounded border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50">شهادة</button>
                            )}
                            {clearance.status !== 'CLEARED' && clearance.status !== 'CANCELLED' && (
                              <button onClick={() => { if (window.confirm('إلغاء الطلب؟')) run(() => EmployeeClearanceService.cancelClearance(clearance.id), 'تم إلغاء الطلب.'); }} className="rounded border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50" aria-label="إلغاء"><Trash2 className="h-3 w-3" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!clearances.length && (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-400">لا توجد طلبات إخلاء طرف بهذه الحالة.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-black">طلب إخلاء طرف جديد</h2>
              <label className="block text-[10px] font-bold text-slate-500">الموظف
                <select value={form.employeeId} onChange={(e) => setForm((prev) => ({ ...prev, employeeId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">اختر الموظف</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.name} ({employee.code})</option>
                  ))}
                </select>
              </label>
              <label className="block text-[10px] font-bold text-slate-500">تاريخ إنهاء الخدمة
                <input type="date" value={form.terminationDate} onChange={(e) => setForm((prev) => ({ ...prev, terminationDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="block text-[10px] font-bold text-slate-500">سبب إنهاء الخدمة
                <textarea value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="استقالة، إنهاء عقد، تقاعد..." />
              </label>
              <button onClick={createClearance} className="flex w-full items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-700">
                <Plus className="h-3.5 w-3.5" /> إنشاء الطلب
              </button>
              <p className="text-[10px] leading-4 text-slate-400">يُنشئ النظام تلقائياً قائمة تحقق تشمل الأصول، التسويات المالية، صلاحيات النظام، ومقابلة الخروج.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]">
            <div className="space-y-4">
              {!selected ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                  <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-sm font-bold text-slate-600">اختر طلباً من قائمة الطلبات لمتابعة إخلاء الطرف.</p>
                  <button onClick={() => setTab('requests')} className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">العودة للطلبات</button>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-black">{selected.employeeName} <span className="text-xs font-medium text-slate-400">({selected.clearanceNumber})</span></h2>
                        <p className="mt-1 text-[11px] text-slate-500">{selected.departmentName} • {selected.branchName} • تاريخ الإنهاء {selected.terminationDate}</p>
                        <p className="mt-1 text-[11px] text-slate-500">السبب: {selected.reason}</p>
                        <p className="mt-1 text-[10px] text-slate-400">مقدم الطلب: {selected.requestedByName} • {selected.requestedAt?.slice(0, 10)}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusTone(selected.status)}`}>{statusLabel[selected.status]}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                      <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-slate-400">الأصول</div><div className="font-bold">{assetStatusLabel[selected.assetClearanceStatus] || selected.assetClearanceStatus}</div></div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-slate-400">المالية</div><div className="font-bold">{financialStatusLabel[selected.financialClearanceStatus] || selected.financialClearanceStatus}</div></div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-slate-400">مقابلة الخروج</div><div className="font-bold">{selected.exitInterviewDate || 'لم تُسجّل'}</div></div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-slate-400">الشهادة</div><div className="font-bold">{selected.clearanceCertificateIssued ? 'صادرة' : 'غير صادرة'}</div></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(selected.status === 'PENDING' || selected.status === 'IN_PROGRESS') && (
                        <>
                          <button onClick={approve} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">اعتماد الإخلاء</button>
                          <button onClick={reject} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">رفض</button>
                          <button onClick={cancel} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">إلغاء</button>
                        </>
                      )}
                      {selected.status === 'CLEARED' && !selected.clearanceCertificateIssued && (
                        <button onClick={issueCertificate} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700"><FileBadge className="h-3.5 w-3.5" /> إصدار شهادة إخلاء الطرف</button>
                      )}
                      {selected.clearanceCertificateIssued && (
                        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700">
                          صدرت الشهادة بتاريخ {selected.certificateIssuedAt?.slice(0, 10)} بواسطة {selected.certificateIssuedBy || '—'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-black">قائمة التحقق ({selected.checklistItems.filter((item) => item.status === 'COMPLETED' || item.status === 'WAIVED' || item.status === 'NOT_APPLICABLE').length}/{selected.checklistItems.length})</h3>
                    <div className="mt-3 space-y-4">
                      {groupedItems.map(([category, items]) => (
                        <div key={category}>
                          <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">{categoryLabel[category] || category}</div>
                          <div className="space-y-2">
                            {items.map((item) => (
                              <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-slate-700">{item.itemName}</span>
                                  <select
                                    value={item.status}
                                    onChange={(e) => updateItem(item, e.target.value as ClearanceItemStatus)}
                                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold"
                                    aria-label={`حالة ${item.itemName}`}
                                  >
                                    {(Object.keys(itemStatusLabel) as ClearanceItemStatus[]).map((status) => <option key={status} value={status}>{itemStatusLabel[status]}</option>)}
                                  </select>
                                </div>
                                <div className="mt-1.5 flex items-center gap-1">
                                  <input
                                    value={notesDraft[item.id] ?? ''}
                                    onChange={(e) => setNotesDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                    placeholder="ملاحظات"
                                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px]"
                                  />
                                  <button onClick={() => saveItemNotes(item)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50">حفظ</button>
                                </div>
                                {item.completedAt && <div className="mt-1 text-[10px] text-slate-400">اكتمل في {item.completedAt.slice(0, 10)} {item.completedByName ? `• ${item.completedByName}` : ''}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-black"><MessageSquareText className="h-4 w-4 text-teal-600" /> مقابلة الخروج</h2>
              {!selected ? (
                <p className="text-[11px] text-slate-400">اختر طلباً أولاً لتسجيل مقابلة الخروج.</p>
              ) : (
                <>
                  {selected.exitInterviewDate && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-700">
                      مسجلة بتاريخ {selected.exitInterviewDate} {selected.exitInterviewerName ? `• ${selected.exitInterviewerName}` : ''}
                      {selected.exitInterviewNotes && <div className="mt-1 font-normal text-emerald-800">{selected.exitInterviewNotes}</div>}
                    </div>
                  )}
                  <label className="block text-[10px] font-bold text-slate-500">مسؤول المقابلة
                    <select value={interviewForm.interviewerId} onChange={(e) => setInterviewForm((prev) => ({ ...prev, interviewerId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">اختر المسؤول</option>
                      {interviewers.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-slate-500">تاريخ المقابلة
                    <input type="date" value={interviewForm.interviewDate} onChange={(e) => setInterviewForm((prev) => ({ ...prev, interviewDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <label className="block text-[10px] font-bold text-slate-500">سبب ترك العمل
                    <input value={interviewForm.reasonForLeaving} onChange={(e) => setInterviewForm((prev) => ({ ...prev, reasonForLeaving: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-500">درجة الرضا (1-5)
                      <input type="number" min="1" max="5" value={interviewForm.satisfactionScore} onChange={(e) => setInterviewForm((prev) => ({ ...prev, satisfactionScore: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">التوصية (1-5)
                      <input type="number" min="1" max="5" value={interviewForm.wouldRecommend} onChange={(e) => setInterviewForm((prev) => ({ ...prev, wouldRecommend: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold text-slate-500">ملاحظات الموظف
                    <textarea value={interviewForm.feedback} onChange={(e) => setInterviewForm((prev) => ({ ...prev, feedback: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <label className="block text-[10px] font-bold text-slate-500">إجراءات مطلوبة
                    <textarea value={interviewForm.actionItems} onChange={(e) => setInterviewForm((prev) => ({ ...prev, actionItems: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <button onClick={saveInterview} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-700">تسجيل المقابلة</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeClearancePage;
