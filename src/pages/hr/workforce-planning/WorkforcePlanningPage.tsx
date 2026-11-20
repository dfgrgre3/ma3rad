import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import {
  AlertTriangle, Briefcase, CheckCircle2, ClipboardList, Plus, RefreshCw, Scale,
  Trash2, TrendingDown, TrendingUp, Users,
} from 'lucide-react';
import {
  WorkforcePlanningService, WorkforcePlan, WorkforcePlanStatus, WorkforceSummary,
  HiringRequisition, HiringRequisitionStatus,
} from '../../../services/domains/hr/WorkforcePlanningService';
import { EmployeeOrganizationService, EmployeeDepartment } from '../../../services/domains/hr/EmployeeOrganizationService';
import { resolveActivitySubTabs } from '../../../config/activityElementSpec';
import { PageHeader } from '../../../components/ui/PageHeader';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';
import { useTabPermissions } from '../../../hooks/domains/auth/useTabPermissions';
import { StatCard as UiStatCard } from '../../../components/ui/Card';


const statTone = (cls: string): 'default' | 'success' | 'danger' | 'warning' =>
  /rose|red|danger/.test(cls) ? 'danger' : /amber|orange/.test(cls) ? 'warning' : /emerald|green|success/.test(cls) ? 'success' : 'default';

const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: string }> = ({ label, value, hint, icon, tone }: any) => (
  <UiStatCard label={label} value={value} hint={hint} icon={icon} tone={statTone(tone || '')} />
);
type Tab = 'plans' | 'requisitions' | 'comparison';

const TAB_PERMISSIONS: Record<Tab, readonly string[]> = {
  plans: ['hr.workforce.manage'],
  requisitions: ['hr.workforce.manage'],
  comparison: ['hr.workforce.manage'],
};

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
    case 'APPROVED': return 'bg-success-soft text-success border-success-border';
    case 'PENDING': return 'bg-warning-soft text-warning border-warning-border';
    case 'REJECTED': return 'bg-danger-soft text-danger border-danger-border';
    case 'CLOSED': return 'bg-surface-sunken text-ink-secondary border-line';
    default: return 'bg-accent-soft text-primary border-accent-border';
  }
};

const money = (value: number) => Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });


export const WorkforcePlanningPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('plans');
  const canTab = useTabPermissions<Tab>(TAB_PERMISSIONS);
  const anyTabAllowed = (['plans', 'requisitions', 'comparison'] as Tab[]).some(canTab);
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
  useEffect(() => { if (anyTabAllowed) load(); }, [load, anyTabAllowed]);

  useEffect(() => {
    if (!planForm.branchId) { setDepartments([]); return; }
    try {
      setDepartments(organization.getDepartments(planForm.branchId));
    } catch {
      setDepartments([]);
    }
  }, [organization, planForm.branchId]);

  useEffect(() => {
    if (activeTab !== 'comparison') return;
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
  const visibleTabs = resolveActivitySubTabs(tabs.filter((t) => canTab(t.id)), '/hr/workforce-planning');
  const activeTab: Tab = canTab(tab) ? tab : (visibleTabs[0]?.id ?? tab);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-muted text-ink">
      <div className="border-b border-line bg-surface px-6 pt-4">
        <PageHeader
          icon={<Briefcase className="h-5 w-5" />}
          title="تخطيط القوى العاملة"
          description="مقارنة الاحتياج المخطط بالعدد الفعلي، اعتماد الخطط، وإدارة طلبات التوظيف"
        />
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {error && <div className="rounded-xl border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>}
        {notice && <div className="rounded-xl border border-success-border bg-success-soft px-4 py-2.5 text-xs font-semibold text-success">{notice}</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="المخطط" value={money(stats.planned)} hint="إجمالي الوظائف المخططة" icon={<Users className="h-4 w-4" />} tone="border-accent-border bg-accent-soft text-primary" />
          <StatCard label="الفعلي" value={money(stats.actual)} hint="الموظفون الحاليون" icon={<CheckCircle2 className="h-4 w-4" />} tone="border-success-border bg-success-soft text-success" />
          <StatCard label="النقص" value={money(stats.shortage)} hint="وظائف مطلوبة" icon={<TrendingDown className="h-4 w-4" />} tone="border-danger-border bg-danger-soft text-danger" />
          <StatCard label="الفائض" value={money(stats.surplus)} hint="زيادة عن الحاجة" icon={<TrendingUp className="h-4 w-4" />} tone="border-warning-border bg-warning-soft text-warning" />
          <StatCard label="طلبات معلقة" value={money(stats.pending)} hint="بانتظار القرار" icon={<AlertTriangle className="h-4 w-4" />} tone="border-accent-border bg-accent-soft text-primary" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${activeTab === item.id ? 'bg-primary text-white' : 'border border-line bg-surface text-ink hover:bg-surface-muted'}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
          <div className="mr-auto flex items-center gap-2">
            <input
              type="month"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-xs"
              aria-label="فلترة الخطط حسب الشهر"
            />
            {periodFilter && (
              <button onClick={() => setPeriodFilter('')} className="text-xs font-bold text-muted hover:text-ink">مسح</button>
            )}
            <button onClick={load} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {activeTab === 'plans' && canTab('plans') && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="border-b border-line px-4 py-3">
                    <h2 className="text-sm font-black">الخطط ({plans.length})</h2>
                  </div>
                  <DataTable
                                        ariaLabel="خطط القوى العاملة"
                                        rows={plans}
                                        rowKey={(plan) => plan.id}
                                        dense
                                        columns={[
                                          { key: 'period', header: 'الفترة', render: (plan) => <span className="font-bold tabular-nums">{plan.periodMonth}</span> },
                                          {
                                            key: 'dept', header: 'الفرع / القسم',
                                            render: (plan) => (
                                              <span>
                                                <span className="font-bold block">{plan.departmentName}</span>
                                                <span className="text-[10px] text-muted">{plan.branchName}</span>
                                                {plan.jobPlans.length > 0 && <span className="mt-1 block text-[10px] text-muted">{plan.jobPlans.length} وظيفة مخططة</span>}
                                              </span>
                                            ),
                                          },
                                          { key: 'planned', header: 'المخطط', render: (plan) => <span className="font-bold tabular-nums">{money(plan.plannedHeadcount)}</span> },
                                          { key: 'actual', header: 'الفعلي', render: (plan) => <span className="tabular-nums">{money(plan.actualHeadcount)}</span> },
                                          {
                                            key: 'diff', header: 'النقص / الفائض',
                                            render: (plan) => (
                                              <span>
                                                {plan.shortage > 0 && <span className="font-bold text-danger">-{plan.shortage}</span>}
                                                {plan.surplus > 0 && <span className="font-bold text-warning">+{plan.surplus}</span>}
                                                {plan.shortage === 0 && plan.surplus === 0 && <span className="text-success">مطابق</span>}
                                              </span>
                                            ),
                                          },
                                          {
                                            key: 'cost', header: 'التكلفة',
                                            render: (plan) => (
                                              <span className="tabular-nums">
                                                <span className="block">{money(plan.expectedEmployeeCost)}</span>
                                                <span className="text-[10px] text-muted">ميزانية {money(plan.approvedRecruitmentBudget)}</span>
                                              </span>
                                            ),
                                          },
                                          { key: 'status', header: 'الحالة', render: (plan) => <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(plan.status)}`}>{planStatusLabel[plan.status]}</span> },
                                          {
                                            key: 'actions', header: 'إجراءات',
                                            render: (plan) => (
                                              <div className="flex flex-wrap gap-1">
                                                {plan.status === 'DRAFT' && (
                                                  <>
                                                    <button onClick={() => startEdit(plan)} className="rounded border border-line px-2 py-1 text-[10px] font-bold text-ink hover:bg-surface-muted">تعديل</button>
                                                    <button onClick={() => run(() => WorkforcePlanningService.approveWorkforcePlan(plan.id), 'تم اعتماد الخطة.')} className="rounded border border-success-border px-2 py-1 text-[10px] font-bold text-success hover:bg-success-soft">اعتماد</button>
                                                    <button onClick={() => { if (window.confirm('حذف خطة القوى العاملة؟')) run(() => WorkforcePlanningService.deleteWorkforcePlan(plan.id), 'تم حذف الخطة.'); }} className="rounded border border-danger-border px-2 py-1 text-[10px] font-bold text-danger hover:bg-danger-soft" aria-label="حذف"><Trash2 className="h-3 w-3" /></button>
                                                  </>
                                                )}
                                                {plan.status !== 'CLOSED' && (
                                                  <button onClick={() => { if (window.confirm('إغلاق الخطة؟ لن يمكن تعديلها بعد ذلك.')) run(() => WorkforcePlanningService.closeWorkforcePlan(plan.id), 'تم إغلاق الخطة.'); }} className="rounded border border-line px-2 py-1 text-[10px] font-bold text-ink-secondary hover:bg-surface-muted">إغلاق</button>
                                                )}
                                              </div>
                                            ),
                                          },
                                        ]}
                                        emptyTitle="لا توجد خطط مسجلة للفترة المحددة."
                                      />

                </div>

                <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black">{editingPlanId ? 'تعديل خطة' : 'خطة جديدة'}</h2>
                    {editingPlanId && <button onClick={resetPlanForm} className="text-[10px] font-bold text-muted hover:text-ink">إلغاء التعديل</button>}
                  </div>
                  <label className="block text-[10px] font-bold text-muted">الفرع
                    <select value={planForm.branchId} onChange={(e) => setPlanForm((prev) => ({ ...prev, branchId: e.target.value, departmentId: '' }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                      <option value="">اختر الفرع</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-muted">القسم
                    <select value={planForm.departmentId} onChange={(e) => setPlanForm((prev) => ({ ...prev, departmentId: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                      <option value="">اختر القسم</option>
                      {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-muted">الفترة
                      <input type="month" value={planForm.periodMonth} onChange={(e) => setPlanForm((prev) => ({ ...prev, periodMonth: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">العدد المخطط
                      <input type="number" min="0" value={planForm.plannedHeadcount} onChange={(e) => setPlanForm((prev) => ({ ...prev, plannedHeadcount: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">ميزانية التوظيف
                      <input type="number" min="0" value={planForm.approvedRecruitmentBudget} onChange={(e) => setPlanForm((prev) => ({ ...prev, approvedRecruitmentBudget: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-[10px] font-bold text-muted">تكلفة الموظفين
                      <input type="number" min="0" value={planForm.expectedEmployeeCost} onChange={(e) => setPlanForm((prev) => ({ ...prev, expectedEmployeeCost: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold text-muted">ملاحظات
                    <textarea value={planForm.notes} onChange={(e) => setPlanForm((prev) => ({ ...prev, notes: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  </label>

                  <div className="space-y-2 rounded-lg border border-line bg-surface-muted p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-ink-secondary">الوظائف المخططة</span>
                      <button onClick={() => setJobPlans((prev) => [...prev, emptyJobPlan()])} className="flex items-center gap-0.5 text-[10px] font-bold text-primary"><Plus className="h-3 w-3" /> إضافة</button>
                    </div>
                    {jobPlans.map((job, index) => (
                      <div key={index} className="space-y-1 rounded-md border border-line bg-surface p-2">
                        <div className="flex items-center gap-1">
                          <input value={job.jobTitle} onChange={(e) => setJobPlans((prev) => prev.map((row, i) => i === index ? { ...row, jobTitle: e.target.value } : row))} placeholder="المسمى الوظيفي" className="w-full rounded border border-line px-2 py-1 text-[11px]" />
                          <button onClick={() => setJobPlans((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : [emptyJobPlan()])} className="text-danger" aria-label="حذف الوظيفة"><Trash2 className="h-3 w-3" /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <select value={job.employmentType} onChange={(e) => setJobPlans((prev) => prev.map((row, i) => i === index ? { ...row, employmentType: e.target.value } : row))} className="rounded border border-line px-1 py-1 text-[10px]">
                            <option value="FULL_TIME">دوام كامل</option>
                            <option value="PART_TIME">دوام جزئي</option>
                            <option value="CONTRACT">عقد</option>
                            <option value="TEMPORARY">مؤقت</option>
                          </select>
                          <input type="number" min="0" value={job.plannedOpenings} onChange={(e) => setJobPlans((prev) => prev.map((row, i) => i === index ? { ...row, plannedOpenings: e.target.value } : row))} placeholder="العدد" className="rounded border border-line px-2 py-1 text-[10px]" />
                          <input type="number" min="0" value={job.estimatedMonthlySalary} onChange={(e) => setJobPlans((prev) => prev.map((row, i) => i === index ? { ...row, estimatedMonthlySalary: e.target.value } : row))} placeholder="الراتب" className="rounded border border-line px-2 py-1 text-[10px]" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={savePlan} className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary">
                    {editingPlanId ? 'حفظ التعديلات' : 'إنشاء الخطة'}
                  </button>
                  <p className="text-[10px] leading-4 text-muted">لا يمكن تعديل الخطة بعد اعتمادها أو إغلاقها. يظهر النقص/الفائض تلقائياً بمقارنة العدد المخطط بعدد الموظفين النشطين في القسم.</p>
                </div>
              </div>
            )}

            {activeTab === 'requisitions' && canTab('requisitions') && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="border-b border-line px-4 py-3">
                    <h2 className="text-sm font-black">طلبات التوظيف ({requisitions.length})</h2>
                  </div>
                  <DataTable
                                        ariaLabel="طلبات التوظيف"
                                        rows={requisitions}
                                        rowKey={(req) => req.id}
                                        dense
                                        columns={[
                                          { key: 'number', header: 'الرقم', render: (req) => <span className="font-mono text-[10px]">{req.requisitionNumber}</span> },
                                          { key: 'job', header: 'الوظيفة', render: (req) => <span><span className="font-bold block">{req.jobTitle}</span><span className="text-[10px] text-muted">{req.employmentType}</span></span> },
                                          { key: 'dept', header: 'الفرع / القسم', render: (req) => <span><span className="block">{req.departmentName}</span><span className="text-[10px] text-muted">{req.branchName}</span></span> },
                                          { key: 'openings', header: 'الشواغر', render: (req) => <span className="font-bold tabular-nums">{req.openings}</span> },
                                          { key: 'salary', header: 'الراتب التقديري', render: (req) => <span className="tabular-nums">{money(req.estimatedMonthlySalary)}</span> },
                                          { key: 'requested', header: 'طلب بواسطة', render: (req) => <span className="text-[10px]"><span className="block">{req.requestedByName || '—'}</span><span className="text-muted">{req.requestedAt?.slice(0, 10)}</span></span> },
                                          {
                                            key: 'status', header: 'الحالة',
                                            render: (req) => (
                                              <span>
                                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(req.status)}`}>{requisitionStatusLabel[req.status]}</span>
                                                {req.decisionNote && <span className="mt-1 block max-w-[140px] truncate text-[10px] text-muted" title={req.decisionNote}>{req.decisionNote}</span>}
                                              </span>
                                            ),
                                          },
                                          {
                                            key: 'actions', header: 'إجراءات',
                                            render: (req) => (
                                              <div className="flex flex-wrap gap-1">
                                                {req.status === 'PENDING' && (
                                                  <>
                                                    <button onClick={() => decideRequisition(req, true)} className="rounded border border-success-border px-2 py-1 text-[10px] font-bold text-success hover:bg-success-soft">اعتماد</button>
                                                    <button onClick={() => decideRequisition(req, false)} className="rounded border border-danger-border px-2 py-1 text-[10px] font-bold text-danger hover:bg-danger-soft">رفض</button>
                                                  </>
                                                )}
                                                {(req.status === 'APPROVED' || req.status === 'REJECTED') && (
                                                  <button onClick={() => run(() => WorkforcePlanningService.closeHiringRequisition(req.id), 'تم إغلاق الطلب.')} className="rounded border border-line px-2 py-1 text-[10px] font-bold text-ink-secondary hover:bg-surface-muted">إغلاق</button>
                                                )}
                                              </div>
                                            ),
                                          },
                                        ]}
                                        emptyTitle="لا توجد طلبات توظيف."
                                      />

                </div>

                <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
                  <h2 className="text-sm font-black">طلب توظيف جديد</h2>
                  <label className="block text-[10px] font-bold text-muted">الفرع
                    <select value={reqForm.branchId} onChange={(e) => setReqForm((prev) => ({ ...prev, branchId: e.target.value, departmentId: '' }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                      <option value="">اختر الفرع</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-muted">القسم
                    <select value={reqForm.departmentId} onChange={(e) => setReqForm((prev) => ({ ...prev, departmentId: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                      <option value="">اختر القسم</option>
                      {reqDepartments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold text-muted">المسمى الوظيفي
                    <input value={reqForm.jobTitle} onChange={(e) => setReqForm((prev) => ({ ...prev, jobTitle: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" placeholder="مثال: محاسب" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold text-muted">نوع التوظيف
                      <select value={reqForm.employmentType} onChange={(e) => setReqForm((prev) => ({ ...prev, employmentType: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                        <option value="FULL_TIME">دوام كامل</option>
                        <option value="PART_TIME">دوام جزئي</option>
                        <option value="CONTRACT">عقد</option>
                        <option value="TEMPORARY">مؤقت</option>
                      </select>
                    </label>
                    <label className="block text-[10px] font-bold text-muted">عدد الشواغر
                      <input type="number" min="1" value={reqForm.openings} onChange={(e) => setReqForm((prev) => ({ ...prev, openings: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold text-muted">الراتب التقديري
                    <input type="number" min="0" value={reqForm.estimatedMonthlySalary} onChange={(e) => setReqForm((prev) => ({ ...prev, estimatedMonthlySalary: e.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  </label>
                  <label className="block text-[10px] font-bold text-muted">المبرر
                    <textarea value={reqForm.justification} onChange={(e) => setReqForm((prev) => ({ ...prev, justification: e.target.value }))} rows={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" placeholder="سبب الحاجة للوظيفة" />
                  </label>
                  <button onClick={saveRequisition} className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary">إنشاء الطلب</button>
                  <p className="text-[10px] leading-4 text-muted">يبدأ الطلب بحالة «بالانتظار» ويتطلب الاعتماد قبل المتابعة.</p>
                </div>
              </div>
            )}

            {activeTab === 'comparison' && canTab('comparison') && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
                  <label className="text-[10px] font-bold text-muted">فترة المقارنة
                    <input type="month" value={comparisonMonth} onChange={(e) => setComparisonMonth(e.target.value)} className="mr-2 rounded-lg border border-line px-3 py-1.5 text-xs" />
                  </label>
                  {summary && (
                    <div className="flex flex-wrap gap-3 text-[11px] font-bold">
                      <span className="rounded-lg bg-accent-soft px-3 py-1.5 text-primary">المخطط: {summary.totalPlanned}</span>
                      <span className="rounded-lg bg-success-soft px-3 py-1.5 text-success">الفعلي: {summary.totalActual}</span>
                      <span className="rounded-lg bg-danger-soft px-3 py-1.5 text-danger">نقص: {summary.totalShortage}</span>
                      <span className="rounded-lg bg-warning-soft px-3 py-1.5 text-warning">فائض: {summary.totalSurplus}</span>
                      <span className="rounded-lg bg-surface-sunken px-3 py-1.5 text-ink-secondary">أقسام بنقص: {summary.departmentsWithShortage} • بفائض: {summary.departmentsWithSurplus}</span>
                    </div>
                  )}
                  <button
                    onClick={() => run(() => WorkforcePlanningService.generateShortageSurplusAlerts(comparisonMonth), 'تم توليد تنبيهات النقص والفائض.')}
                    className="mr-auto rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-xs font-bold text-primary hover:bg-accent-soft"
                  >
                    توليد التنبيهات
                  </button>
                </div>
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <DataTable
                                      ariaLabel="مقارنة النقص والفائض"
                                      rows={summary?.comparisons || []}
                                      rowKey={(row) => `${row.branchId}-${row.departmentId}`}
                                      dense
                                      columns={[
                                        { key: 'branch', header: 'الفرع', render: (row) => <span className="text-ink-secondary">{row.branchName}</span> },
                                        { key: 'dept', header: 'القسم', render: (row) => <span className="font-bold">{row.departmentName}</span> },
                                        { key: 'planned', header: 'المخطط', render: (row) => <span className="tabular-nums">{row.plannedHeadcount}</span> },
                                        { key: 'actual', header: 'الفعلي', render: (row) => <span className="tabular-nums">{row.actualHeadcount}</span> },
                                        { key: 'shortage', header: 'النقص', render: (row) => <span className="font-bold text-danger">{row.shortage || '—'}</span> },
                                        { key: 'surplus', header: 'الفائض', render: (row) => <span className="font-bold text-warning">{row.surplus || '—'}</span> },
                                        {
                                          key: 'alert', header: 'التنبيه',
                                          render: (row) => (
                                            <span>
                                              {row.alert === 'OK' && <span className="inline-flex rounded-full border border-success-border bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">مطابق</span>}
                                              {row.alert === 'SHORTAGE' && <span className="inline-flex rounded-full border border-danger-border bg-danger-soft px-2 py-0.5 text-[10px] font-bold text-danger">نقص</span>}
                                              {row.alert === 'SURPLUS' && <span className="inline-flex rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-[10px] font-bold text-warning">فائض</span>}
                                            </span>
                                          ),
                                        },
                                      ]}
                                      emptyTitle="لا توجد أقسام للمقارنة في هذه الفترة."
                                    />

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
