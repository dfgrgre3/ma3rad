import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Briefcase, CheckCircle2, ClipboardList, Plus, RefreshCw, Scale,
  Trash2, TrendingDown, TrendingUp, Users,
} from 'lucide-react';
import {
  WorkforcePlanningService, WorkforcePlan, WorkforcePlanStatus, WorkforceSummary,
  HiringRequisition, HiringRequisitionStatus,
} from '../../../services/domains/hr/WorkforcePlanningService';
import { EmployeeOrganizationService, EmployeeDepartment } from '../../../services/domains/hr/EmployeeOrganizationService';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';

type Tab = 'plans' | 'requisitions' | 'comparison';

interface JobPlanRow {
  jobTitle: string;
  employmentType: string;
  plannedOpenings: string;
  estimatedMonthlySalary: string;
  notes: string;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

const emptyJobPlan = (): JobPlanRow => ({
  jobTitle: '', employmentType: 'FULL_TIME', plannedOpenings: '1', estimatedMonthlySalary: '0', notes: '',
});

const planStatusLabel: Record<WorkforcePlanStatus, string> = {
  DRAFT: 'مسودة', APPROVED: 'معتمدة', CLOSED: 'مغلقة',
};

const requisitionStatusLabel: Record<HiringRequisitionStatus, string> = {
  PENDING: 'بالانتظار', APPROVED: 'معتمد', REJECTED: 'مرفوض', CLOSED: 'مغلق',
};

const statusTone = (status: string): string => {
  switch (status) {
    case 'APPROVED': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'PENDING': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'REJECTED': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'CLOSED': return 'bg-slate-100 text-slate-600 border-slate-200';
    default: return 'bg-sky-50 text-sky-700 border-sky-200';
  }
};

const money = (value: number) => Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });

const StatCard: React.FC<{ label: string; value: string; hint?: string; icon: React.ReactNode; tone: string }> = ({ label, value, hint, icon, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-slate-500">{label}</span>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${tone}`}>{icon}</span>
    </div>
    <div className="mt-2 text-xl font-black tabular-nums">{value}</div>
    {hint && <div className="mt-0.5 text-[10px] font-semibold text-slate-400">{hint}</div>}
  </div>
);

export const WorkforcePlanningPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('plans');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [plans, setPlans] = useState<WorkforcePlan[]>([]);
  const [requisitions, setRequisitions] = useState<HiringRequisition[]>([]);
  const [summary, setSummary] = useState<WorkforceSummary | null>(null);

  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string; isMain: boolean }>>([]);
  const [departments, setDepartments] = useState<EmployeeDepartment[]>([]);
  const [periodFilter, setPeriodFilter] = useState('');
  const [comparisonMonth, setComparisonMonth] = useState(currentMonth());

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState({
    branchId: '', departmentId: '', periodMonth: currentMonth(), plannedHeadcount: '0',
    approvedRecruitmentBudget: '0', expectedEmployeeCost: '0', notes: '',
  });
  const [jobPlans, setJobPlans] = useState<JobPlanRow[]>([emptyJobPlan()]);

  const [reqForm, setReqForm] = useState({
    branchId: '', departmentId: '', jobTitle: '', employmentType: 'FULL_TIME',
    openings: '1', estimatedMonthlySalary: '0', justification: '',
  });

  const organization = useMemo(() => new EmployeeOrganizationService(), []);
  const branchAccess = useMemo(() => new BranchAccessService(), []);

  const loadBranches = useCallback(() => {
    try {
      const list = branchAccess.getSelectableBranches();
      setBranches(list);
      setPlanForm((prev) => ({ ...prev, branchId: prev.branchId || list[0]?.id || '' }));
      setReqForm((prev) => ({ ...prev, branchId: prev.branchId || list[0]?.id || '' }));
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الفروع.');
    }
  }, [branchAccess]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setPlans(WorkforcePlanningService.getWorkforcePlans(periodFilter || undefined));
      setRequisitions(WorkforcePlanningService.getHiringRequisitions());
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات القوى العاملة.');
    } finally {
      setLoading(false);
    }
  }, [periodFilter]);

  useEffect(() => { loadBranches(); }, [loadBranches]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!planForm.branchId) { setDepartments([]); return; }
    try {
      setDepartments(organization.getDepartments(planForm.branchId));
    } catch {
      setDepartments([]);
    }
  }, [organization, planForm.branchId]);

  useEffect(() => {
    if (tab !== 'comparison') return;
    try {
      setSummary(WorkforcePlanningService.getHeadcountComparison(comparisonMonth));
    } catch (e: any) {
      setError(e?.message || 'تعذر احتساب المقارنة.');
    }
  }, [tab, comparisonMonth]);

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

  const resetPlanForm = () => {
    setEditingPlanId(null);
    setPlanForm({
      branchId: branches[0]?.id || '', departmentId: '', periodMonth: currentMonth(),
      plannedHeadcount: '0', approvedRecruitmentBudget: '0', expectedEmployeeCost: '0', notes: '',
    });
    setJobPlans([emptyJobPlan()]);
  };

  const startEdit = (plan: WorkforcePlan) => {
    setEditingPlanId(plan.id);
    setPlanForm({
      branchId: plan.branchId,
      departmentId: plan.departmentId,
      periodMonth: plan.periodMonth,
      plannedHeadcount: String(plan.plannedHeadcount),
      approvedRecruitmentBudget: String(plan.approvedRecruitmentBudget),
      expectedEmployeeCost: String(plan.expectedEmployeeCost),
      notes: plan.notes || '',
    });
    setJobPlans(plan.jobPlans.length
      ? plan.jobPlans.map((job) => ({
        jobTitle: job.jobTitle,
        employmentType: job.employmentType,
        plannedOpenings: String(job.plannedOpenings),
        estimatedMonthlySalary: String(job.estimatedMonthlySalary),
        notes: job.notes || '',
      }))
      : [emptyJobPlan()]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const savePlan = () => {
    if (!planForm.branchId || !planForm.departmentId) {
      setError('يجب اختيار الفرع والقسم.');
      return;
    }
    if (!planForm.periodMonth) {
      setError('يجب تحديد فترة الخطة.');
      return;
    }
    run(() => {
      WorkforcePlanningService.saveWorkforcePlan({
        branchId: planForm.branchId,
        departmentId: planForm.departmentId,
        periodMonth: planForm.periodMonth,
        plannedHeadcount: Number(planForm.plannedHeadcount) || 0,
        approvedRecruitmentBudget: Number(planForm.approvedRecruitmentBudget) || 0,
        expectedEmployeeCost: Number(planForm.expectedEmployeeCost) || 0,
        notes: planForm.notes || undefined,
        jobPlans: jobPlans
          .filter((job) => job.jobTitle.trim())
          .map((job) => ({
            jobTitle: job.jobTitle.trim(),
            employmentType: job.employmentType,
            plannedOpenings: Number(job.plannedOpenings) || 0,
            estimatedMonthlySalary: Number(job.estimatedMonthlySalary) || 0,
            notes: job.notes || undefined,
          })),
      }, editingPlanId || undefined);
      resetPlanForm();
    }, editingPlanId ? 'تم تحديث الخطة بنجاح.' : 'تم إنشاء الخطة بنجاح.');
  };

  const saveRequisition = () => {
    if (!reqForm.branchId || !reqForm.departmentId || !reqForm.jobTitle.trim()) {
      setError('يجب اختيار الفرع والقسم وإدخال المسمى الوظيفي.');
      return;
    }
    run(() => {
      WorkforcePlanningService.createHiringRequisition({
        branchId: reqForm.branchId,
        departmentId: reqForm.departmentId,
        jobTitle: reqForm.jobTitle.trim(),
        employmentType: reqForm.employmentType,
        openings: Number(reqForm.openings) || 0,
        estimatedMonthlySalary: Number(reqForm.estimatedMonthlySalary) || 0,
        justification: reqForm.justification || undefined,
      });
      setReqForm((prev) => ({
        ...prev, jobTitle: '', employmentType: 'FULL_TIME', openings: '1',
        estimatedMonthlySalary: '0', justification: '',
      }));
    }, 'تم إنشاء طلب التوظيف بنجاح.');
  };

  const decideRequisition = (req: HiringRequisition, approve: boolean) => {
    let note: string | undefined;
    if (!approve) {
      const entered = window.prompt('سبب رفض طلب التوظيف:');
      if (!entered?.trim()) return;
      note = entered.trim();
    }
    run(() => WorkforcePlanningService.decideHiringRequisition(req.id, approve, note),
      approve ? 'تم اعتماد طلب التوظيف.' : 'تم رفض طلب التوظيف.');
  };

  const stats = useMemo(() => {
    const planned = plans.reduce((sum, plan) => sum + plan.plannedHeadcount, 0);
    const actual = plans.reduce((sum, plan) => sum + plan.actualHeadcount, 0);
    const shortage = plans.reduce((sum, plan) => sum + plan.shortage, 0);
    const surplus = plans.reduce((sum, plan) => sum + plan.surplus, 0);
    const pending = requisitions.filter((item) => item.status === 'PENDING').length;
    return { planned, actual, shortage, surplus, pending };
  }, [plans, requisitions]);

  const reqDepartments = useMemo(() => {
    if (!reqForm.branchId) return [] as EmployeeDepartment[];
    try { return organization.getDepartments(reqForm.branchId); } catch { return [] as EmployeeDepartment[]; }
  }, [organization, reqForm.branchId]);

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'plans', label: 'خطط القوى العاملة', icon: <Briefcase className="h-4 w-4" /> },
    { id: 'requisitions', label: 'طلبات التوظيف', icon: <ClipboardList className="h-4 w-4" /> },
    { id: 'comparison', label: 'المخطط مقابل الفعلي', icon: <Scale className="h-4 w-4" /> },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 text-slate-900" dir="rtl">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-violet-50">
          <Briefcase className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-base font-black">تخطيط القوى العاملة</h1>
          <p className="text-xs font-medium text-slate-500">مقارنة الاحتياج المخطط بالعدد الفعلي، اعتماد الخطط، وإدارة طلبات التوظيف</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700">{notice}</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="المخطط" value={money(stats.planned)} hint="إجمالي الوظائف المخططة" icon={<Users className="h-4 w-4" />} tone="border-sky-200 bg-sky-50 text-sky-600" />
          <StatCard label="الفعلي" value={money(stats.actual)} hint="الموظفون الحاليون" icon={<CheckCircle2 className="h-4 w-4" />} tone="border-emerald-200 bg-emerald-50 text-emerald-600" />
          <StatCard label="النقص" value={money(stats.shortage)} hint="وظائف مطلوبة" icon={<TrendingDown className="h-4 w-4" />} tone="border-rose-200 bg-rose-50 text-rose-600" />
          <StatCard label="الفائض" value={money(stats.surplus)} hint="زيادة عن الحاجة" icon={<TrendingUp className="h-4 w-4" />} tone="border-amber-200 bg-amber-50 text-amber-600" />
          <StatCard label="طلبات معلقة" value={money(stats.pending)} hint="بانتظار القرار" icon={<AlertTriangle className="h-4 w-4" />} tone="border-violet-200 bg-violet-50 text-violet-600" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${tab === item.id ? 'bg-violet-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
          <div className="mr-auto flex items-center gap-2">
            <input
              type="month"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              aria-label="فلترة الخطط حسب الشهر"
            />
            {periodFilter && (
              <button onClick={() => setPeriodFilter('')} className="text-xs font-bold text-slate-500 hover:text-slate-800">مسح</button>
            )}
            <button onClick={load} className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-violet-500" /></div>
        ) : (
          <>
            {tab === 'plans' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <h2 className="text-sm font-black">الخطط ({plans.length})</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-right text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-bold">الفترة</th>
                          <th className="px-3 py-2 font-bold">الفرع / القسم</th>
                          <th className="px-3 py-2 font-bold">المخطط</th>
                          <th className="px-3 py-2 font-bold">الفعلي</th>
                          <th className="px-3 py-2 font-bold">النقص / الفائض</th>
                          <th className="px-3 py-2 font-bold">التكلفة</th>
                          <th className="px-3 py-2 font-bold">الحالة</th>
                          <th className="px-3 py-2 font-bold">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {plans.map((plan) => (
                          <tr key={plan.id} className="hover:bg-slate-50/70">
                            <td className="px-3 py-3 font-bold tabular-nums">{plan.periodMonth}</td>
                            <td className="px-3 py-3">
                              <div className="font-bold">{plan.departmentName}</div>
                              <div className="text-[10px] text-slate-500">{plan.branchName}</div>
                              {plan.jobPlans.length > 0 && (
                                <div className="mt-1 text-[10px] text-slate-400">{plan.jobPlans.length} وظيفة مخططة</div>
                              )}
                            </td>
                            <td className="px-3 py-3 font-bold tabular-nums">{money(plan.plannedHeadcount)}</td>
                            <td className="px-3 py-3 tabular-nums">{money(plan.actualHeadcount)}</td>
                            <td className="px-3 py-3">
                              {plan.shortage > 0 && <span className="font-bold text-rose-600">-{plan.shortage}</span>}
                              {plan.surplus > 0 && <span className="font-bold text-amber-600">+{plan.surplus}</span>}
                              {plan.shortage === 0 && plan.surplus === 0 && <span className="text-emerald-600">مطابق</span>}
                            </td>
                            <td className="px-3 py-3 tabular-nums">
                              <div>{money(plan.expectedEmployeeCost)}</div>
                              <div className="text-[10px] text-slate-400">ميزانية {money(plan.approvedRecruitmentBudget)}</div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(plan.status)}`}>{planStatusLabel[plan.status]}</span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-1">
                                {plan.status === 'DRAFT' && (
                                  <>
                                    <button onClick={() => startEdit(plan)} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50">تعديل</button>
                                    <button onClick={() => run(() => WorkforcePlanningService.approveWorkforcePlan(plan.id), 'تم اعتماد الخطة.')} className="rounded border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50">اعتماد</button>
                                    <button onClick={() => { if (window.confirm('حذف خطة القوى العاملة؟')) run(() => WorkforcePlanningService.deleteWorkforcePlan(plan.id), 'تم حذف الخطة.'); }} className="rounded border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50" aria-label="حذف"><Trash2 className="h-3 w-3" /></button>
                                  </>
                                )}
                                {plan.status !== 'CLOSED' && (
                                  <button onClick={() => { if (window.confirm('إغلاق الخطة؟ لن يمكن تعديلها بعد ذلك.')) run(() => WorkforcePlanningService.closeWorkforcePlan(plan.id), 'تم إغلاق الخطة.'); }} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50">إغلاق</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!plans.length && (
                          <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-slate-400">لا توجد خطط مسجلة للفترة المحددة.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black">{editingPlanId ? 'تعديل خطة' : 'خطة جديدة'}</h2>
                    {editingPlanId && <button onClick={resetPlanForm} className="text-[10px] font-bold text-slate-500 hover:text-slate-800">إلغاء التعديل</button>}
                  </div>
                  <label className="block text-[10px] font-bold text-slate-500">الفرع
                    <select value={planForm.branchId} onChange={(e) => setPlanForm((prev) => ({ ...prev, branchId: e.target.value, departmentId: '' }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">اختر الفرع</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-slate-500">القسم
                    <select value={planForm.departmentId} onChange={(e) => setPlanForm((prev) => ({ ...prev, departmentId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">اختر القسم</option>
                      {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-500">الفترة
                      <input type="month" value={planForm.periodMonth} onChange={(e) => setPlanForm((prev) => ({ ...prev, periodMonth: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">العدد المخطط
                      <input type="number" min="0" value={planForm.plannedHeadcount} onChange={(e) => setPlanForm((prev) => ({ ...prev, plannedHeadcount: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">ميزانية التوظيف
                      <input type="number" min="0" value={planForm.approvedRecruitmentBudget} onChange={(e) => setPlanForm((prev) => ({ ...prev, approvedRecruitmentBudget: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">تكلفة الموظفين
                      <input type="number" min="0" value={planForm.expectedEmployeeCost} onChange={(e) => setPlanForm((prev) => ({ ...prev, expectedEmployeeCost: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold text-slate-500">ملاحظات
                    <textarea value={planForm.notes} onChange={(e) => setPlanForm((prev) => ({ ...prev, notes: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>

                  <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-600">الوظائف المخططة</span>
                      <button onClick={() => setJobPlans((prev) => [...prev, emptyJobPlan()])} className="flex items-center gap-0.5 text-[10px] font-bold text-violet-600"><Plus className="h-3 w-3" /> إضافة</button>
                    </div>
                    {jobPlans.map((job, index) => (
                      <div key={index} className="space-y-1 rounded-md border border-slate-200 bg-white p-2">
                        <div className="flex items-center gap-1">
                          <input value={job.jobTitle} onChange={(e) => setJobPlans((prev) => prev.map((row, i) => i === index ? { ...row, jobTitle: e.target.value } : row))} placeholder="المسمى الوظيفي" className="w-full rounded border border-slate-200 px-2 py-1 text-[11px]" />
                          <button onClick={() => setJobPlans((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : [emptyJobPlan()])} className="text-rose-500" aria-label="حذف الوظيفة"><Trash2 className="h-3 w-3" /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <select value={job.employmentType} onChange={(e) => setJobPlans((prev) => prev.map((row, i) => i === index ? { ...row, employmentType: e.target.value } : row))} className="rounded border border-slate-200 px-1 py-1 text-[10px]">
                            <option value="FULL_TIME">دوام كامل</option>
                            <option value="PART_TIME">دوام جزئي</option>
                            <option value="CONTRACT">عقد</option>
                            <option value="TEMPORARY">مؤقت</option>
                          </select>
                          <input type="number" min="0" value={job.plannedOpenings} onChange={(e) => setJobPlans((prev) => prev.map((row, i) => i === index ? { ...row, plannedOpenings: e.target.value } : row))} placeholder="العدد" className="rounded border border-slate-200 px-2 py-1 text-[10px]" />
                          <input type="number" min="0" value={job.estimatedMonthlySalary} onChange={(e) => setJobPlans((prev) => prev.map((row, i) => i === index ? { ...row, estimatedMonthlySalary: e.target.value } : row))} placeholder="الراتب" className="rounded border border-slate-200 px-2 py-1 text-[10px]" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={savePlan} className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-700">
                    {editingPlanId ? 'حفظ التعديلات' : 'إنشاء الخطة'}
                  </button>
                  <p className="text-[10px] leading-4 text-slate-400">لا يمكن تعديل الخطة بعد اعتمادها أو إغلاقها. يظهر النقص/الفائض تلقائياً بمقارنة العدد المخطط بعدد الموظفين النشطين في القسم.</p>
                </div>
              </div>
            )}

            {tab === 'requisitions' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <h2 className="text-sm font-black">طلبات التوظيف ({requisitions.length})</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-right text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-bold">الرقم</th>
                          <th className="px-3 py-2 font-bold">الوظيفة</th>
                          <th className="px-3 py-2 font-bold">الفرع / القسم</th>
                          <th className="px-3 py-2 font-bold">الشواغر</th>
                          <th className="px-3 py-2 font-bold">الراتب التقديري</th>
                          <th className="px-3 py-2 font-bold">طلب بواسطة</th>
                          <th className="px-3 py-2 font-bold">الحالة</th>
                          <th className="px-3 py-2 font-bold">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {requisitions.map((req) => (
                          <tr key={req.id} className="hover:bg-slate-50/70">
                            <td className="px-3 py-3 font-mono text-[10px]">{req.requisitionNumber}</td>
                            <td className="px-3 py-3">
                              <div className="font-bold">{req.jobTitle}</div>
                              <div className="text-[10px] text-slate-500">{req.employmentType}</div>
                            </td>
                            <td className="px-3 py-3">
                              <div>{req.departmentName}</div>
                              <div className="text-[10px] text-slate-500">{req.branchName}</div>
                            </td>
                            <td className="px-3 py-3 font-bold tabular-nums">{req.openings}</td>
                            <td className="px-3 py-3 tabular-nums">{money(req.estimatedMonthlySalary)}</td>
                            <td className="px-3 py-3 text-[10px]">
                              <div>{req.requestedByName || '—'}</div>
                              <div className="text-slate-400">{req.requestedAt?.slice(0, 10)}</div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(req.status)}`}>{requisitionStatusLabel[req.status]}</span>
                              {req.decisionNote && <div className="mt-1 max-w-[140px] truncate text-[10px] text-slate-400" title={req.decisionNote}>{req.decisionNote}</div>}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-1">
                                {req.status === 'PENDING' && (
                                  <>
                                    <button onClick={() => decideRequisition(req, true)} className="rounded border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50">اعتماد</button>
                                    <button onClick={() => decideRequisition(req, false)} className="rounded border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50">رفض</button>
                                  </>
                                )}
                                {(req.status === 'APPROVED' || req.status === 'REJECTED') && (
                                  <button onClick={() => run(() => WorkforcePlanningService.closeHiringRequisition(req.id), 'تم إغلاق الطلب.')} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50">إغلاق</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!requisitions.length && (
                          <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-slate-400">لا توجد طلبات توظيف.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="text-sm font-black">طلب توظيف جديد</h2>
                  <label className="block text-[10px] font-bold text-slate-500">الفرع
                    <select value={reqForm.branchId} onChange={(e) => setReqForm((prev) => ({ ...prev, branchId: e.target.value, departmentId: '' }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">اختر الفرع</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-slate-500">القسم
                    <select value={reqForm.departmentId} onChange={(e) => setReqForm((prev) => ({ ...prev, departmentId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="">اختر القسم</option>
                      {reqDepartments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-slate-500">المسمى الوظيفي
                    <input value={reqForm.jobTitle} onChange={(e) => setReqForm((prev) => ({ ...prev, jobTitle: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="مثال: محاسب" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-slate-500">نوع التوظيف
                      <select value={reqForm.employmentType} onChange={(e) => setReqForm((prev) => ({ ...prev, employmentType: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <option value="FULL_TIME">دوام كامل</option>
                        <option value="PART_TIME">دوام جزئي</option>
                        <option value="CONTRACT">عقد</option>
                        <option value="TEMPORARY">مؤقت</option>
                      </select>
                    </label>
                    <label className="block text-[10px] font-bold text-slate-500">عدد الشواغر
                      <input type="number" min="1" value={reqForm.openings} onChange={(e) => setReqForm((prev) => ({ ...prev, openings: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold text-slate-500">الراتب التقديري
                    <input type="number" min="0" value={reqForm.estimatedMonthlySalary} onChange={(e) => setReqForm((prev) => ({ ...prev, estimatedMonthlySalary: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <label className="block text-[10px] font-bold text-slate-500">المبرر
                    <textarea value={reqForm.justification} onChange={(e) => setReqForm((prev) => ({ ...prev, justification: e.target.value }))} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="سبب الحاجة للوظيفة" />
                  </label>
                  <button onClick={saveRequisition} className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-700">إنشاء الطلب</button>
                  <p className="text-[10px] leading-4 text-slate-400">يبدأ الطلب بحالة «بالانتظار» ويتطلب الاعتماد قبل المتابعة.</p>
                </div>
              </div>
            )}

            {tab === 'comparison' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <label className="text-[10px] font-bold text-slate-500">فترة المقارنة
                    <input type="month" value={comparisonMonth} onChange={(e) => setComparisonMonth(e.target.value)} className="mr-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs" />
                  </label>
                  {summary && (
                    <div className="flex flex-wrap gap-3 text-[11px] font-bold">
                      <span className="rounded-lg bg-sky-50 px-3 py-1.5 text-sky-700">المخطط: {summary.totalPlanned}</span>
                      <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-700">الفعلي: {summary.totalActual}</span>
                      <span className="rounded-lg bg-rose-50 px-3 py-1.5 text-rose-700">نقص: {summary.totalShortage}</span>
                      <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-700">فائض: {summary.totalSurplus}</span>
                      <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600">أقسام بنقص: {summary.departmentsWithShortage} • بفائض: {summary.departmentsWithSurplus}</span>
                    </div>
                  )}
                  <button
                    onClick={() => run(() => WorkforcePlanningService.generateShortageSurplusAlerts(comparisonMonth), 'تم توليد تنبيهات النقص والفائض.')}
                    className="mr-auto rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-100"
                  >
                    توليد التنبيهات
                  </button>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-right text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-bold">الفرع</th>
                          <th className="px-3 py-2 font-bold">القسم</th>
                          <th className="px-3 py-2 font-bold">المخطط</th>
                          <th className="px-3 py-2 font-bold">الفعلي</th>
                          <th className="px-3 py-2 font-bold">النقص</th>
                          <th className="px-3 py-2 font-bold">الفائض</th>
                          <th className="px-3 py-2 font-bold">التنبيه</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(summary?.comparisons || []).map((row) => (
                          <tr key={`${row.branchId}-${row.departmentId}`} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2.5 text-slate-600">{row.branchName}</td>
                            <td className="px-3 py-2.5 font-bold">{row.departmentName}</td>
                            <td className="px-3 py-2.5 tabular-nums">{row.plannedHeadcount}</td>
                            <td className="px-3 py-2.5 tabular-nums">{row.actualHeadcount}</td>
                            <td className="px-3 py-2.5 font-bold text-rose-600">{row.shortage || '—'}</td>
                            <td className="px-3 py-2.5 font-bold text-amber-600">{row.surplus || '—'}</td>
                            <td className="px-3 py-2.5">
                              {row.alert === 'OK' && <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">مطابق</span>}
                              {row.alert === 'SHORTAGE' && <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">نقص</span>}
                              {row.alert === 'SURPLUS' && <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">فائض</span>}
                            </td>
                          </tr>
                        ))}
                        {!summary?.comparisons?.length && (
                          <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-400">لا توجد أقسام للمقارنة في هذه الفترة.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WorkforcePlanningPage;
