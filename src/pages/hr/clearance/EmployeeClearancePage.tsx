import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
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
import { useTabPermissions } from '../../../hooks/domains/auth/useTabPermissions';
import { StatCard as UiStatCard } from '../../../components/ui/Card';


const statTone = (cls: string): 'default' | 'success' | 'danger' | 'warning' =>
  /rose|red|danger/.test(cls) ? 'danger' : /amber|orange/.test(cls) ? 'warning' : /emerald|green|success/.test(cls) ? 'success' : 'default';

const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: string }> = ({ label, value, hint, icon, tone }: any) => (
  <UiStatCard label={label} value={value} hint={hint} icon={icon} tone={statTone(tone || '')} />
);
type Tab = 'requests' | 'followup';

const TAB_PERMISSIONS: Record<Tab, readonly string[]> = {
  requests: ['hr.clearance.manage'],
  followup: ['hr.clearance.manage'],
};

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
    case 'CLEARED': return 'bg-success-soft text-success border-success-border';
    case 'PENDING': return 'bg-warning-soft text-warning border-warning-border';
    case 'IN_PROGRESS': return 'bg-accent-soft text-primary border-accent-border';
    case 'REJECTED': return 'bg-danger-soft text-danger border-danger-border';
    case 'CANCELLED': return 'bg-surface-sunken text-muted border-line';
    default: return 'bg-success-soft text-success border-success-border';
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


export const EmployeeClearancePage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('requests');
  const canTab = useTabPermissions<Tab>(TAB_PERMISSIONS);
  const anyTabAllowed = (['requests', 'followup'] as Tab[]).some(canTab);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setClearances(EmployeeClearanceService.getEmployeeClearances((statusFilter || undefined) as ClearanceStatus | undefined));
      setSummary(EmployeeClearanceService.getClearanceSummary());
      setEmployees(await EmployeeService.getAllAsync({}));
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات إخلاء الطرف.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { if (anyTabAllowed) load(); }, [load, anyTabAllowed]);

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
  const visibleTabs = tabs.filter((t) => canTab(t.id));
  const activeTab: Tab = canTab(tab) ? tab : (visibleTabs[0]?.id ?? tab);

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
    <div className="flex h-full flex-col overflow-hidden bg-surface-muted text-ink">
      <div className="border-b border-line bg-surface px-6 pt-4">
        <PageHeader
          icon={<ShieldCheck className="h-5 w-5" />}
          title="إخلاء الطرف"
          description="متابعة إنهاء خدمة الموظفين، إعادة الأصول، التسوية المالية، ومقابلات الخروج"
        />
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {error && <div className="rounded-xl border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>}
        {notice && <div className="rounded-xl border border-success-border bg-success-soft px-4 py-2.5 text-xs font-semibold text-success">{notice}</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="إجمالي الطلبات" value={String(summary?.total ?? 0)} icon={<ClipboardCheck className="h-4 w-4" />} tone="border-line bg-surface-muted text-ink-secondary" />
          <StatCard label="بالانتظار" value={String(summary?.pending ?? 0)} icon={<XCircle className="h-4 w-4" />} tone="border-warning-border bg-warning-soft text-warning" />
          <StatCard label="قيد الإجراء" value={String(summary?.inProgress ?? 0)} icon={<RefreshCw className="h-4 w-4" />} tone="border-accent-border bg-accent-soft text-primary" />
          <StatCard label="مكتمل" value={String(summary?.cleared ?? 0)} icon={<CheckCircle2 className="h-4 w-4" />} tone="border-success-border bg-success-soft text-success" />
          <StatCard label="مرفوض / ملغي" value={String((summary?.rejected ?? 0) + (summary?.cancelled ?? 0))} icon={<XCircle className="h-4 w-4" />} tone="border-danger-border bg-danger-soft text-danger" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${activeTab === item.id ? 'bg-success text-white' : 'border border-line bg-surface text-ink hover:bg-surface-muted'}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
          <div className="mr-auto flex items-center gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-xs">
              <option value="">كل الحالات</option>
              {(Object.keys(statusLabel) as ClearanceStatus[]).map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
            </select>
            <button onClick={load} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-success" /></div>
        ) : activeTab === 'requests' ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-black">الطلبات ({clearances.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <DataTable
                  ariaLabel="طلبات إخلاء الطرف"
                  rows={clearances}
                  rowKey={(clearance: any) => String(clearance.id)}
                  dense
                  tableClassName="text-xs"
                  rowClassName={(clearance: any) => `hover:bg-surface-muted/70 ${selectedId === clearance.id ? 'bg-success-soft/40' : ''}`}
                  columns={[
                    { key: 'num', header: 'رقم الطلب', render: (clearance: any) => <span className="font-mono text-[10px]">{clearance.clearanceNumber}</span> },
                    {
                      key: 'emp', header: 'الموظف',
                      render: (clearance: any) => (
                        <span className="block">
                          <span className="block font-bold">{clearance.employeeName}</span>
                          <span className="block text-[10px] text-muted">{clearance.departmentName} • {clearance.branchName}</span>
                        </span>
                      ),
                    },
                    { key: 'term', header: 'تاريخ الإنهاء', render: (clearance: any) => <span className="tabular-nums">{clearance.terminationDate}</span> },
                    { key: 'assets', header: 'الأصول', render: (clearance: any) => <span className="text-[10px]">{assetStatusLabel[clearance.assetClearanceStatus] || clearance.assetClearanceStatus}</span> },
                    { key: 'fin', header: 'المالية', render: (clearance: any) => <span className="text-[10px]">{financialStatusLabel[clearance.financialClearanceStatus] || clearance.financialClearanceStatus}</span> },
                    {
                      key: 'status', header: 'الحالة',
                      render: (clearance: any) => (
                        <span className="block">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(clearance.status)}`}>{statusLabel[clearance.status as keyof typeof statusLabel]}</span>
                          {clearance.clearanceCertificateIssued && <span className="mt-1 block text-[10px] font-bold text-success">شهادة صادرة</span>}
                        </span>
                      ),
                    },
                    {
                      key: 'actions', header: 'إجراءات',
                      render: (clearance: any) => (
                        <span className="flex flex-wrap gap-1">
                          <button onClick={() => openFollowup(clearance)} className="rounded border border-success-border px-2 py-1 text-[10px] font-bold text-success hover:bg-success-soft">متابعة</button>
                          {clearance.status === 'CLEARED' && !clearance.clearanceCertificateIssued && (
                            <button onClick={() => { setSelectedId(clearance.id); run(() => EmployeeClearanceService.issueClearanceCertificate(clearance.id), 'تم إصدار الشهادة.'); }} className="rounded border border-success-border px-2 py-1 text-[10px] font-bold text-success hover:bg-success-soft">شهادة</button>
                          )}
                          {clearance.status !== 'CLEARED' && clearance.status !== 'CANCELLED' && (
                            <button onClick={() => { if (window.confirm('إلغاء الطلب؟')) run(() => EmployeeClearanceService.cancelClearance(clearance.id), 'تم إلغاء الطلب.'); }} className="rounded border border-danger-border px-2 py-1 text-[10px] font-bold text-danger hover:bg-danger-soft" aria-label="إلغاء"><Trash2 className="h-3 w-3" /></button>
                          )}
                        </span>
                      ),
                    },
                  ]}
                  emptyTitle="لا توجد طلبات إخلاء طرف بهذه الحالة."
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm font-black">طلب إخلاء طرف جديد</h2>
              <label className="block text-[10px] font-bold text-muted">الموظف
                <select value={form.employeeId} onChange={(e) => setForm((prev) => ({ ...prev, employeeId: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="">اختر الموظف</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.name} ({employee.code})</option>
                  ))}
                </select>
              </label>
              <label className="block text-[10px] font-bold text-muted">تاريخ إنهاء الخدمة
                <input type="date" value={form.terminationDate} onChange={(e) => setForm((prev) => ({ ...prev, terminationDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
              </label>
              <label className="block text-[10px] font-bold text-muted">سبب إنهاء الخدمة
                <textarea value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} rows={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" placeholder="استقالة، إنهاء عقد، تقاعد..." />
              </label>
              <button onClick={createClearance} className="flex w-full items-center justify-center gap-1 rounded-lg bg-success px-4 py-2.5 text-xs font-bold text-white hover:bg-success">
                <Plus className="h-3.5 w-3.5" /> إنشاء الطلب
              </button>
              <p className="text-[10px] leading-4 text-muted">يُنشئ النظام تلقائياً قائمة تحقق تشمل الأصول، التسويات المالية، صلاحيات النظام، ومقابلة الخروج.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]">
            <div className="space-y-4">
              {!selected ? (
                <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
                  <ClipboardCheck className="mx-auto h-10 w-10 text-muted" />
                  <p className="mt-3 text-sm font-bold text-ink-secondary">اختر طلباً من قائمة الطلبات لمتابعة إخلاء الطرف.</p>
                  <button onClick={() => setTab('requests')} className="mt-3 rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-surface-muted">العودة للطلبات</button>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-black">{selected.employeeName} <span className="text-xs font-medium text-muted">({selected.clearanceNumber})</span></h2>
                        <p className="mt-1 text-[11px] text-muted">{selected.departmentName} • {selected.branchName} • تاريخ الإنهاء {selected.terminationDate}</p>
                        <p className="mt-1 text-[11px] text-muted">السبب: {selected.reason}</p>
                        <p className="mt-1 text-[10px] text-muted">مقدم الطلب: {selected.requestedByName} • {selected.requestedAt?.slice(0, 10)}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusTone(selected.status)}`}>{statusLabel[selected.status]}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                      <div className="rounded-lg bg-surface-muted px-3 py-2"><div className="text-muted">الأصول</div><div className="font-bold">{assetStatusLabel[selected.assetClearanceStatus] || selected.assetClearanceStatus}</div></div>
                      <div className="rounded-lg bg-surface-muted px-3 py-2"><div className="text-muted">المالية</div><div className="font-bold">{financialStatusLabel[selected.financialClearanceStatus] || selected.financialClearanceStatus}</div></div>
                      <div className="rounded-lg bg-surface-muted px-3 py-2"><div className="text-muted">مقابلة الخروج</div><div className="font-bold">{selected.exitInterviewDate || 'لم تُسجّل'}</div></div>
                      <div className="rounded-lg bg-surface-muted px-3 py-2"><div className="text-muted">الشهادة</div><div className="font-bold">{selected.clearanceCertificateIssued ? 'صادرة' : 'غير صادرة'}</div></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(selected.status === 'PENDING' || selected.status === 'IN_PROGRESS') && (
                        <>
                          <button onClick={approve} className="rounded-lg bg-success px-3 py-2 text-xs font-bold text-white hover:bg-success">اعتماد الإخلاء</button>
                          <button onClick={reject} className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs font-bold text-danger hover:bg-danger-soft">رفض</button>
                          <button onClick={cancel} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink-secondary hover:bg-surface-muted">إلغاء</button>
                        </>
                      )}
                      {selected.status === 'CLEARED' && !selected.clearanceCertificateIssued && (
                        <button onClick={issueCertificate} className="flex items-center gap-1 rounded-lg bg-success px-3 py-2 text-xs font-bold text-white hover:bg-success"><FileBadge className="h-3.5 w-3.5" /> إصدار شهادة إخلاء الطرف</button>
                      )}
                      {selected.clearanceCertificateIssued && (
                        <span className="rounded-lg border border-success-border bg-success-soft px-3 py-2 text-[10px] font-bold text-success">
                          صدرت الشهادة بتاريخ {selected.certificateIssuedAt?.slice(0, 10)} بواسطة {selected.certificateIssuedBy || '—'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-line bg-surface p-4">
                    <h3 className="text-sm font-black">قائمة التحقق ({selected.checklistItems.filter((item) => item.status === 'COMPLETED' || item.status === 'WAIVED' || item.status === 'NOT_APPLICABLE').length}/{selected.checklistItems.length})</h3>
                    <div className="mt-3 space-y-4">
                      {groupedItems.map(([category, items]) => (
                        <div key={category}>
                          <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-muted">{categoryLabel[category] || category}</div>
                          <div className="space-y-2">
                            {items.map((item) => (
                              <div key={item.id} className="rounded-lg border border-line bg-surface-muted/60 p-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-ink">{item.itemName}</span>
                                  <select
                                    value={item.status}
                                    onChange={(e) => updateItem(item, e.target.value as ClearanceItemStatus)}
                                    className="rounded-md border border-line bg-surface px-2 py-1 text-[10px] font-bold"
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
                                    className="w-full rounded-md border border-line bg-surface px-2 py-1 text-[10px]"
                                  />
                                  <button onClick={() => saveItemNotes(item)} className="rounded-md border border-line bg-surface px-2 py-1 text-[10px] font-bold text-ink-secondary hover:bg-surface-muted">حفظ</button>
                                </div>
                                {item.completedAt && <div className="mt-1 text-[10px] text-muted">اكتمل في {item.completedAt.slice(0, 10)} {item.completedByName ? `• ${item.completedByName}` : ''}</div>}
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

            <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-black"><MessageSquareText className="h-4 w-4 text-success" /> مقابلة الخروج</h2>
              {!selected ? (
                <p className="text-[11px] text-muted">اختر طلباً أولاً لتسجيل مقابلة الخروج.</p>
              ) : (
                <>
                  {selected.exitInterviewDate && (
                    <div className="rounded-lg border border-success-border bg-success-soft px-3 py-2 text-[10px] font-semibold text-success">
                      مسجلة بتاريخ {selected.exitInterviewDate} {selected.exitInterviewerName ? `• ${selected.exitInterviewerName}` : ''}
                      {selected.exitInterviewNotes && <div className="mt-1 font-normal text-success">{selected.exitInterviewNotes}</div>}
                    </div>
                  )}
                  <label className="block text-[10px] font-bold text-muted">مسؤول المقابلة
                    <select value={interviewForm.interviewerId} onChange={(e) => setInterviewForm((prev) => ({ ...prev, interviewerId: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                      <option value="">اختر المسؤول</option>
                      {interviewers.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-muted">تاريخ المقابلة
                    <input type="date" value={interviewForm.interviewDate} onChange={(e) => setInterviewForm((prev) => ({ ...prev, interviewDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  </label>
                  <label className="block text-[10px] font-bold text-muted">سبب ترك العمل
                    <input value={interviewForm.reasonForLeaving} onChange={(e) => setInterviewForm((prev) => ({ ...prev, reasonForLeaving: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-muted">درجة الرضا (1-5)
                      <input type="number" min="1" max="5" value={interviewForm.satisfactionScore} onChange={(e) => setInterviewForm((prev) => ({ ...prev, satisfactionScore: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">التوصية (1-5)
                      <input type="number" min="1" max="5" value={interviewForm.wouldRecommend} onChange={(e) => setInterviewForm((prev) => ({ ...prev, wouldRecommend: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold text-muted">ملاحظات الموظف
                    <textarea value={interviewForm.feedback} onChange={(e) => setInterviewForm((prev) => ({ ...prev, feedback: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  </label>
                  <label className="block text-[10px] font-bold text-muted">إجراءات مطلوبة
                    <textarea value={interviewForm.actionItems} onChange={(e) => setInterviewForm((prev) => ({ ...prev, actionItems: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  </label>
                  <button onClick={saveInterview} className="w-full rounded-lg bg-success px-4 py-2.5 text-xs font-bold text-white hover:bg-success">تسجيل المقابلة</button>
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
