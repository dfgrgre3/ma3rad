import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarCheck2, Check, ClipboardList, Clock3, Coins, GitBranch,
  Loader2, Plus, RefreshCw, Trash2, X,
} from 'lucide-react';
import {
  ProjectService,
  type ProjectBudgetLine,
  type ProjectBudgetSummary,
  type ProjectChangeRequest,
  type ProjectDeliverable,
  type ProjectDeliverableStatus,
  type ProjectRisk,
  type ProjectRiskProbability,
  type ProjectRiskSeverity,
  type ProjectRiskStatus,
  type ProjectTask,
  type ProjectTaskPriority,
  type ProjectTaskStatus,
  type ProjectTimeEntry,
  type ProjectTimeSummary,
} from '../../services/domains/projects/ProjectService';
import { useToast } from '../ui/Toast';
import { DataTable } from '../ui/DataTable';
import { localDateString } from '../../utils/shared/date';

const money = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

const today = () => localDateString();

const TASK_STATUS_LABELS: Record<ProjectTaskStatus, string> = {
  TODO: 'بالانتظار', IN_PROGRESS: 'جاري', BLOCKED: 'متوقف', DONE: 'مكتمل', CANCELLED: 'ملغي',
};
const TASK_PRIORITY_LABELS: Record<ProjectTaskPriority, string> = {
  LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية', URGENT: 'عاجلة',
};
const RISK_SEVERITY_LABELS: Record<ProjectRiskSeverity, string> = {
  LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية', CRITICAL: 'حرجة',
};
const RISK_PROBABILITY_LABELS: Record<ProjectRiskProbability, string> = {
  LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية',
};
const RISK_STATUS_LABELS: Record<ProjectRiskStatus, string> = {
  OPEN: 'مفتوح', MITIGATED: 'تم التخفيف', ACCEPTED: 'مقبول', CLOSED: 'مغلق',
};
const CHANGE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد الانتظار', APPROVED: 'معتمد', REJECTED: 'مرفوض', CANCELLED: 'ملغي',
};
const DELIVERABLE_STATUS_LABELS: Record<ProjectDeliverableStatus, string> = {
  PENDING: 'بالانتظار', IN_PROGRESS: 'جاري', DELIVERED: 'تم التسليم', ACCEPTED: 'مقبول', REJECTED: 'مرفوض',
};

const statusBadge: Record<string, string> = {
  PENDING: 'bg-warning-soft text-warning border-warning-border',
  APPROVED: 'bg-success-soft text-success border-success-border',
  REJECTED: 'bg-danger-soft text-danger border-danger-border',
  CANCELLED: 'bg-surface-sunken text-muted border-line',
};

type Tab = 'tasks' | 'budget' | 'time' | 'risks' | 'changes' | 'deliverables';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'tasks', label: 'المهام' },
  { key: 'budget', label: 'الميزانية' },
  { key: 'time', label: 'الوقت' },
  { key: 'risks', label: 'المخاطر' },
  { key: 'changes', label: 'طلبات التغيير' },
  { key: 'deliverables', label: 'المخرجات' },
];

interface Props {
  projectId: string;
  canUpdate: boolean;
  canApprove: boolean;
}

const inputClass = 'w-full rounded-lg border border-line bg-surface-muted px-2 py-1.5 text-xs';

export const ProjectControlsPanel: React.FC<Props> = ({ projectId, canUpdate, canApprove }) => {
  const service = useMemo(() => new ProjectService(), []);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('tasks');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [timeEntries, setTimeEntries] = useState<ProjectTimeEntry[]>([]);
  const [timeSummary, setTimeSummary] = useState<ProjectTimeSummary | null>(null);
  const [budgetLines, setBudgetLines] = useState<ProjectBudgetLine[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<ProjectBudgetSummary | null>(null);
  const [risks, setRisks] = useState<ProjectRisk[]>([]);
  const [changes, setChanges] = useState<ProjectChangeRequest[]>([]);
  const [deliverables, setDeliverables] = useState<ProjectDeliverable[]>([]);

  const [taskForm, setTaskForm] = useState({
    title: '', assigneeName: '', priority: 'MEDIUM' as ProjectTaskPriority,
    startDate: '', dueDate: '',
  });
  const [dependencyForm, setDependencyForm] = useState({ taskId: '', dependsOnTaskId: '' });
  const [budgetForm, setBudgetForm] = useState({ category: '', description: '', plannedAmount: '', actualAmount: '' });
  const [timeForm, setTimeForm] = useState({
    taskId: '', employeeName: '', entryDate: today(), hours: '', description: '', billable: true,
  });
  const [riskForm, setRiskForm] = useState({
    title: '', severity: 'MEDIUM' as ProjectRiskSeverity, probability: 'MEDIUM' as ProjectRiskProbability,
    ownerName: '', mitigation: '',
  });
  const [changeForm, setChangeForm] = useState({ title: '', costImpact: '', timeImpactDays: '', description: '' });
  const [deliverableForm, setDeliverableForm] = useState({ title: '', dueDate: '', description: '' });

  const fail = useCallback((error: any, fallback: string) => {
    toast.error(error?.message || fallback);
  }, [toast]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setTasks(service.getTasks(projectId));
      setTimeEntries(service.getTimeEntries(projectId));
      setTimeSummary(service.getTimeSummary(projectId));
      setBudgetLines(service.getBudgetLines(projectId));
      setBudgetSummary(service.getBudgetSummary(projectId));
      setRisks(service.getRisks(projectId));
      setChanges(service.getChangeRequests(projectId));
      setDeliverables(service.getDeliverables(projectId));
    } catch (error: any) {
      fail(error, 'تعذر تحميل بيانات متابعة المشروع.');
    } finally {
      setLoading(false);
    }
  }, [fail, projectId, service]);

  useEffect(() => { load(); }, [load]);

  const submitTask = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      service.createTask({
        projectId,
        title: taskForm.title,
        assigneeName: taskForm.assigneeName,
        priority: taskForm.priority,
        startDate: taskForm.startDate || undefined,
        dueDate: taskForm.dueDate || undefined,
      });
      setTaskForm({ title: '', assigneeName: '', priority: 'MEDIUM', startDate: '', dueDate: '' });
      toast.success('تمت إضافة المهمة.');
      load();
    } catch (error: any) {
      fail(error, 'تعذر إضافة المهمة.');
    } finally {
      setSaving(false);
    }
  };

  const setTaskStatus = (task: ProjectTask, status: ProjectTaskStatus) => {
    try {
      service.updateTask(task.id, { status });
      load();
    } catch (error: any) {
      fail(error, 'تعذر تحديث المهمة.');
    }
  };

  const removeTask = (task: ProjectTask) => {
    if (!window.confirm(`حذف المهمة "${task.title}"؟ سيتم حذف تبعياتها أيضاً.`)) return;
    try {
      service.deleteTask(task.id);
      toast.success('تم حذف المهمة.');
      load();
    } catch (error: any) {
      fail(error, 'تعذر حذف المهمة.');
    }
  };

  const addDependency = (event: React.FormEvent) => {
    event.preventDefault();
    if (!dependencyForm.taskId || !dependencyForm.dependsOnTaskId) {
      toast.error('اختر المهمة والمهمة السابقة.');
      return;
    }
    try {
      service.addTaskDependency({ projectId, ...dependencyForm });
      setDependencyForm({ taskId: '', dependsOnTaskId: '' });
      toast.success('تمت إضافة التبعية.');
      load();
    } catch (error: any) {
      fail(error, 'تعذر إضافة التبعية.');
    }
  };

  const removeDependency = (taskId: string, dependsOnTaskId: string) => {
    try {
      service.removeTaskDependencyByPair(projectId, taskId, dependsOnTaskId);
      toast.success('تم حذف التبعية.');
      load();
    } catch (error: any) {
      fail(error, 'تعذر حذف التبعية.');
    }
  };

  const submitBudget = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.addBudgetLine({
        projectId,
        category: budgetForm.category,
        description: budgetForm.description,
        plannedAmount: Number(budgetForm.plannedAmount) || 0,
        actualAmount: Number(budgetForm.actualAmount) || 0,
      });
      setBudgetForm({ category: '', description: '', plannedAmount: '', actualAmount: '' });
      toast.success('تمت إضافة بند الميزانية.');
      load();
    } catch (error: any) {
      fail(error, 'تعذر إضافة بند الميزانية.');
    }
  };

  const submitTime = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.addTimeEntry({
        projectId,
        taskId: timeForm.taskId || undefined,
        employeeName: timeForm.employeeName,
        entryDate: timeForm.entryDate,
        hours: Number(timeForm.hours) || 0,
        description: timeForm.description,
        billable: timeForm.billable,
      });
      setTimeForm({ ...timeForm, hours: '', description: '' });
      toast.success('تم تسجيل الوقت.');
      load();
    } catch (error: any) {
      fail(error, 'تعذر تسجيل الوقت.');
    }
  };

  const submitRisk = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createRisk({
        projectId,
        title: riskForm.title,
        severity: riskForm.severity,
        probability: riskForm.probability,
        ownerName: riskForm.ownerName,
        mitigation: riskForm.mitigation,
      });
      setRiskForm({ title: '', severity: 'MEDIUM', probability: 'MEDIUM', ownerName: '', mitigation: '' });
      toast.success('تمت إضافة الخطر.');
      load();
    } catch (error: any) {
      fail(error, 'تعذر إضافة الخطر.');
    }
  };

  const submitChange = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createChangeRequest({
        projectId,
        title: changeForm.title,
        costImpact: Number(changeForm.costImpact) || 0,
        timeImpactDays: Number(changeForm.timeImpactDays) || 0,
        description: changeForm.description,
      });
      setChangeForm({ title: '', costImpact: '', timeImpactDays: '', description: '' });
      toast.success('تم تسجيل طلب التغيير.');
      load();
    } catch (error: any) {
      fail(error, 'تعذر تسجيل طلب التغيير.');
    }
  };

  const decideChange = (request: ProjectChangeRequest, decision: 'APPROVED' | 'REJECTED') => {
    const label = decision === 'APPROVED' ? 'اعتماد' : 'رفض';
    const note = window.prompt(`${label} طلب التغيير "${request.title}" — ملاحظة (اختياري):`) ?? '';
    try {
      service.decideChangeRequest(request.id, decision, note);
      toast.success(`تم ${label} طلب التغيير.`);
      load();
    } catch (error: any) {
      fail(error, `تعذر ${label} طلب التغيير.`);
    }
  };

  const submitDeliverable = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      service.createDeliverable({
        projectId,
        title: deliverableForm.title,
        dueDate: deliverableForm.dueDate || undefined,
        description: deliverableForm.description,
      });
      setDeliverableForm({ title: '', dueDate: '', description: '' });
      toast.success('تمت إضافة المخرج.');
      load();
    } catch (error: any) {
      fail(error, 'تعذر إضافة المخرج.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-line bg-surface p-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                tab === item.key ? 'bg-primary text-white' : 'text-ink-secondary hover:bg-surface-sunken'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button onClick={load} className="rounded-lg border border-line p-2 text-muted" title="تحديث">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {tab === 'tasks' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-line bg-surface lg:col-span-2">
            <DataTable
                        ariaLabel="مهام المشروع"
                        rows={tasks}
                        rowKey={(task) => task.id}
                        dense
                        columns={[
                          {
                            key: 'task', header: 'المهمة',
                            render: (task) => (
                              <div>
                                <p className="font-bold text-ink">{task.title}</p>
                                {task.description && <p className="text-[10px] text-muted">{task.description}</p>}
                              </div>
                            ),
                          },
                          { key: 'assignee', header: 'المسؤول', render: (task) => <span className="text-ink-secondary">{task.assigneeName || '—'}</span> },
                          { key: 'priority', header: 'الأولوية', render: (task) => <span className="text-ink-secondary">{TASK_PRIORITY_LABELS[task.priority]}</span> },
                          { key: 'due', header: 'الاستحقاق', render: (task) => <span className="font-mono text-ink-secondary">{task.dueDate || '—'}</span> },
                          {
                            key: 'deps', header: 'التبعيات',
                            render: (task) => (
                              <div className="flex flex-wrap gap-1">
                                {(task.dependencyIds || []).map((dependencyId) => {
                                  const dependency = tasks.find((item) => item.id === dependencyId);
                                  if (!dependency) return null;
                                  return (
                                    <span key={dependencyId} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[10px] text-ink-secondary">
                                      <GitBranch className="h-3 w-3" />
                                      {dependency.title}
                                      {canUpdate && (
                                        <button onClick={() => removeDependency(task.id, dependencyId)} className="text-muted hover:text-danger" title="حذف التبعية">
                                          <X className="h-3 w-3" />
                                        </button>
                                      )}
                                    </span>
                                  );
                                })}
                                {(task.dependencyIds || []).length === 0 && <span className="text-muted">—</span>}
                              </div>
                            ),
                          },
                          {
                            key: 'status', header: 'الحالة',
                            render: (task) => (
                              <div>
                                {canUpdate ? (
                                  <select
                                    value={task.status}
                                    onChange={(event) => setTaskStatus(task, event.target.value as ProjectTaskStatus)}
                                    className="rounded-lg border border-line bg-surface px-2 py-1 text-[10px] font-bold"
                                  >
                                    {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-[10px] font-bold">{TASK_STATUS_LABELS[task.status]}</span>
                                )}
                                <span className="mr-1 text-[10px] text-muted">{task.progress}%</span>
                              </div>
                            ),
                          },
                          {
                            key: 'actions', header: '',
                            render: (task) => canUpdate ? (
                              <button onClick={() => removeTask(task)} className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger" title="حذف">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null,
                          },
                        ]}
                      />

          </div>

          {canUpdate && (
            <div className="space-y-3">
              <form onSubmit={submitTask} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs">
                <h3 className="flex items-center gap-1.5 font-black text-ink">
                  <ClipboardList className="h-4 w-4 text-primary" /> إضافة مهمة
                </h3>
                <input required placeholder="عنوان المهمة" value={taskForm.title}
                  onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} className={inputClass} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input placeholder="المسؤول" value={taskForm.assigneeName}
                    onChange={(event) => setTaskForm({ ...taskForm, assigneeName: event.target.value })} className={inputClass} />
                  <select value={taskForm.priority}
                    onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value as ProjectTaskPriority })}
                    className={inputClass}>
                    {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <input type="date" value={taskForm.startDate}
                    onChange={(event) => setTaskForm({ ...taskForm, startDate: event.target.value })} className={inputClass} />
                  <input type="date" value={taskForm.dueDate}
                    onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })} className={inputClass} />
                </div>
                <button type="submit" disabled={saving}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-1.5 font-bold text-white disabled:opacity-60">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} إضافة
                </button>
              </form>

              <form onSubmit={addDependency} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs">
                <h3 className="flex items-center gap-1.5 font-black text-ink">
                  <GitBranch className="h-4 w-4 text-primary" /> ربط تبعية
                </h3>
                <select value={dependencyForm.taskId}
                  onChange={(event) => setDependencyForm({ ...dependencyForm, taskId: event.target.value })} className={inputClass}>
                  <option value="">المهمة</option>
                  {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
                <select value={dependencyForm.dependsOnTaskId}
                  onChange={(event) => setDependencyForm({ ...dependencyForm, dependsOnTaskId: event.target.value })} className={inputClass}>
                  <option value="">تعتمد على</option>
                  {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
                <button type="submit" className="w-full rounded-lg border border-accent-border bg-accent-soft py-1.5 font-bold text-primary">
                  إضافة التبعية
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {tab === 'budget' && (
        <div className="space-y-3">
          {budgetSummary && (
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                { label: 'المخطط', value: money(budgetSummary.plannedTotal) },
                { label: 'الفعلي', value: money(budgetSummary.actualTotal) },
                { label: 'الفرق', value: money(budgetSummary.variance) },
                { label: 'المتبقي من العقد', value: money(budgetSummary.remainingContract) },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-line bg-surface p-3">
                  <p className="text-[10px] font-bold text-muted">{card.label}</p>
                  <p className="text-sm font-black text-ink">{card.value}</p>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="overflow-hidden rounded-xl border border-line bg-surface lg:col-span-2">
              <DataTable
                            ariaLabel="بنود ميزانية المشروع"
                            rows={budgetLines}
                            rowKey={(line) => line.id}
                            dense
                            columns={[
                              { key: 'category', header: 'البند', render: (line) => <span className="font-bold text-ink">{line.category}</span> },
                              { key: 'desc', header: 'الوصف', render: (line) => <span className="text-muted">{line.description || '—'}</span> },
                              { key: 'planned', header: 'المخطط', render: (line) => <span className="font-mono">{money(line.plannedAmount)}</span> },
                              {
                                key: 'actual', header: 'الفعلي',
                                render: (line) => canUpdate ? (
                                  <input type="number" min="0" step="0.01" defaultValue={line.actualAmount}
                                    onBlur={(event) => {
                                      const value = Number(event.target.value);
                                      if (value !== line.actualAmount) {
                                        try { service.updateBudgetLine(line.id, { actualAmount: value }); load(); }
                                        catch (error: any) { fail(error, 'تعذر تحديث المبلغ الفعلي.'); }
                                      }
                                    }}
                                    className="w-24 rounded-lg border border-line px-2 py-1 font-mono" />
                                ) : money(line.actualAmount),
                              },
                              {
                                key: 'actions', header: '',
                                render: (line) => canUpdate ? (
                                  <button onClick={() => {
                                    if (!window.confirm(`حذف بند الميزانية "${line.category}"؟`)) return;
                                    try { service.deleteBudgetLine(line.id); load(); } catch (error: any) { fail(error, 'تعذر حذف البند.'); }
                                  }} className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger" title="حذف">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null,
                              },
                            ]}
                          />

            </div>
            {canUpdate && (
              <form onSubmit={submitBudget} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs">
                <h3 className="flex items-center gap-1.5 font-black text-ink">
                  <Coins className="h-4 w-4 text-success" /> إضافة بند
                </h3>
                <input required placeholder="البند (مواد، عمالة...)" value={budgetForm.category}
                  onChange={(event) => setBudgetForm({ ...budgetForm, category: event.target.value })} className={inputClass} />
                <input placeholder="الوصف" value={budgetForm.description}
                  onChange={(event) => setBudgetForm({ ...budgetForm, description: event.target.value })} className={inputClass} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input type="number" min="0" step="0.01" placeholder="المخطط" value={budgetForm.plannedAmount}
                    onChange={(event) => setBudgetForm({ ...budgetForm, plannedAmount: event.target.value })} className={inputClass} />
                  <input type="number" min="0" step="0.01" placeholder="الفعلي" value={budgetForm.actualAmount}
                    onChange={(event) => setBudgetForm({ ...budgetForm, actualAmount: event.target.value })} className={inputClass} />
                </div>
                <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-success py-1.5 font-bold text-white">
                  <Plus className="h-3.5 w-3.5" /> إضافة
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {tab === 'time' && (
        <div className="space-y-3">
          {timeSummary && (
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { label: 'إجمالي الساعات', value: timeSummary.totalHours },
                { label: 'ساعات قابلة للفوترة', value: timeSummary.billableHours },
                { label: 'ساعات غير قابلة للفوترة', value: timeSummary.nonBillableHours },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-line bg-surface p-3">
                  <p className="text-[10px] font-bold text-muted">{card.label}</p>
                  <p className="text-sm font-black text-ink">{card.value}</p>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="overflow-hidden rounded-xl border border-line bg-surface lg:col-span-2">
              <DataTable
                            ariaLabel="سجلات وقت المشروع"
                            rows={timeEntries}
                            rowKey={(entry) => entry.id}
                            dense
                            columns={[
                              { key: 'date', header: 'التاريخ', render: (entry) => <span className="font-mono text-ink-secondary">{entry.entryDate}</span> },
                              { key: 'task', header: 'المهمة', render: (entry) => <span className="text-ink-secondary">{entry.taskTitle || '—'}</span> },
                              { key: 'employee', header: 'الموظف', render: (entry) => <span className="text-ink-secondary">{entry.employeeName || '—'}</span> },
                              { key: 'hours', header: 'الساعات', render: (entry) => <span className="font-bold">{entry.hours}</span> },
                              { key: 'billable', header: 'الفوترة', render: (entry) => <span>{Number(entry.billable) === 1 ? 'نعم' : 'لا'}</span> },
                              {
                                key: 'actions', header: '',
                                render: (entry) => canUpdate ? (
                                  <button onClick={() => {
                                    try { service.deleteTimeEntry(entry.id); load(); } catch (error: any) { fail(error, 'تعذر حذف سجل الوقت.'); }
                                  }} className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger" title="حذف">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null,
                              },
                            ]}
                          />

            </div>
            {canUpdate && (
              <form onSubmit={submitTime} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs">
                <h3 className="flex items-center gap-1.5 font-black text-ink">
                  <Clock3 className="h-4 w-4 text-primary" /> تسجيل وقت
                </h3>
                <select value={timeForm.taskId} onChange={(event) => setTimeForm({ ...timeForm, taskId: event.target.value })} className={inputClass}>
                  <option value="">بدون مهمة</option>
                  {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
                <input placeholder="الموظف" value={timeForm.employeeName}
                  onChange={(event) => setTimeForm({ ...timeForm, employeeName: event.target.value })} className={inputClass} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input type="date" value={timeForm.entryDate}
                    onChange={(event) => setTimeForm({ ...timeForm, entryDate: event.target.value })} className={inputClass} />
                  <input type="number" required min="0.25" max="24" step="0.25" placeholder="الساعات" value={timeForm.hours}
                    onChange={(event) => setTimeForm({ ...timeForm, hours: event.target.value })} className={inputClass} />
                </div>
                <input placeholder="الوصف" value={timeForm.description}
                  onChange={(event) => setTimeForm({ ...timeForm, description: event.target.value })} className={inputClass} />
                <label className="flex items-center gap-2 text-ink-secondary">
                  <input type="checkbox" checked={timeForm.billable}
                    onChange={(event) => setTimeForm({ ...timeForm, billable: event.target.checked })} />
                  قابلة للفوترة
                </label>
                <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-1.5 font-bold text-white">
                  <Plus className="h-3.5 w-3.5" /> تسجيل
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {tab === 'risks' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-line bg-surface lg:col-span-2">
            <DataTable
                        ariaLabel="مخاطر المشروع"
                        rows={risks}
                        rowKey={(risk) => risk.id}
                        dense
                        columns={[
                          {
                            key: 'risk', header: 'الخطر',
                            render: (risk) => (
                              <div>
                                <p className="font-bold text-ink">{risk.title}</p>
                                {risk.mitigation && <p className="text-[10px] text-muted">التخفيف: {risk.mitigation}</p>}
                              </div>
                            ),
                          },
                          { key: 'severity', header: 'الخطورة', render: (risk) => <span className="text-ink-secondary">{RISK_SEVERITY_LABELS[risk.severity]}</span> },
                          { key: 'prob', header: 'الاحتمالية', render: (risk) => <span className="text-ink-secondary">{RISK_PROBABILITY_LABELS[risk.probability]}</span> },
                          { key: 'owner', header: 'المسؤول', render: (risk) => <span className="text-ink-secondary">{risk.ownerName || '—'}</span> },
                          {
                            key: 'status', header: 'الحالة',
                            render: (risk) => canUpdate ? (
                              <select value={risk.status}
                                onChange={(event) => {
                                  try { service.updateRisk(risk.id, { status: event.target.value as ProjectRiskStatus }); load(); }
                                  catch (error: any) { fail(error, 'تعذر تحديث الخطر.'); }
                                }}
                                className="rounded-lg border border-line bg-surface px-2 py-1 text-[10px] font-bold">
                                {Object.entries(RISK_STATUS_LABELS).map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            ) : RISK_STATUS_LABELS[risk.status],
                          },
                          {
                            key: 'actions', header: '',
                            render: (risk) => canUpdate ? (
                              <button onClick={() => {
                                if (!window.confirm(`حذف الخطر "${risk.title}"؟`)) return;
                                try { service.deleteRisk(risk.id); load(); } catch (error: any) { fail(error, 'تعذر حذف الخطر.'); }
                              }} className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger" title="حذف">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null,
                          },
                        ]}
                      />

          </div>
          {canUpdate && (
            <form onSubmit={submitRisk} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs">
              <h3 className="flex items-center gap-1.5 font-black text-ink">
                <AlertTriangle className="h-4 w-4 text-warning" /> إضافة خطر
              </h3>
              <input required placeholder="عنوان الخطر" value={riskForm.title}
                onChange={(event) => setRiskForm({ ...riskForm, title: event.target.value })} className={inputClass} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select value={riskForm.severity}
                  onChange={(event) => setRiskForm({ ...riskForm, severity: event.target.value as ProjectRiskSeverity })} className={inputClass}>
                  {Object.entries(RISK_SEVERITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <select value={riskForm.probability}
                  onChange={(event) => setRiskForm({ ...riskForm, probability: event.target.value as ProjectRiskProbability })} className={inputClass}>
                  {Object.entries(RISK_PROBABILITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <input placeholder="المسؤول" value={riskForm.ownerName}
                onChange={(event) => setRiskForm({ ...riskForm, ownerName: event.target.value })} className={inputClass} />
              <input placeholder="خطة التخفيف" value={riskForm.mitigation}
                onChange={(event) => setRiskForm({ ...riskForm, mitigation: event.target.value })} className={inputClass} />
              <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-warning py-1.5 font-bold text-white">
                <Plus className="h-3.5 w-3.5" /> إضافة
              </button>
            </form>
          )}
        </div>
      )}

      {tab === 'changes' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-line bg-surface lg:col-span-2">
            <DataTable
                        ariaLabel="طلبات تغيير المشروع"
                        rows={changes}
                        rowKey={(change) => change.id}
                        dense
                        columns={[
                          {
                            key: 'change', header: 'الطلب',
                            render: (change) => (
                              <div>
                                <p className="font-bold text-ink">{change.title}</p>
                                {change.description && <p className="text-[10px] text-muted">{change.description}</p>}
                                {change.decisionNote && <p className="text-[10px] text-muted">قرار: {change.decisionNote}</p>}
                              </div>
                            ),
                          },
                          { key: 'cost', header: 'الأثر المالي', render: (change) => <span className="font-mono">{money(change.costImpact)}</span> },
                          { key: 'time', header: 'الأثر الزمني', render: (change) => <span>{change.timeImpactDays} يوم</span> },
                          { key: 'requester', header: 'مقدم الطلب', render: (change) => <span className="text-ink-secondary">{change.requesterName || '—'}</span> },
                          {
                            key: 'status', header: 'الحالة',
                            render: (change) => (
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadge[change.status] || statusBadge.PENDING}`}>
                                {CHANGE_STATUS_LABELS[change.status]}
                              </span>
                            ),
                          },
                          {
                            key: 'actions', header: '',
                            render: (change) => canApprove && change.status === 'PENDING' ? (
                              <div className="flex gap-1">
                                <button onClick={() => decideChange(change, 'APPROVED')} className="rounded bg-success-soft p-1 text-success" title="اعتماد">
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => decideChange(change, 'REJECTED')} className="rounded bg-danger-soft p-1 text-danger" title="رفض">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : null,
                          },
                        ]}
                      />

          </div>
          {canUpdate && (
            <form onSubmit={submitChange} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs">
              <h3 className="flex items-center gap-1.5 font-black text-ink">
                <ClipboardList className="h-4 w-4 text-primary" /> طلب تغيير
              </h3>
              <input required placeholder="عنوان الطلب" value={changeForm.title}
                onChange={(event) => setChangeForm({ ...changeForm, title: event.target.value })} className={inputClass} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="number" step="0.01" placeholder="الأثر المالي" value={changeForm.costImpact}
                  onChange={(event) => setChangeForm({ ...changeForm, costImpact: event.target.value })} className={inputClass} />
                <input type="number" step="1" placeholder="أيام إضافية" value={changeForm.timeImpactDays}
                  onChange={(event) => setChangeForm({ ...changeForm, timeImpactDays: event.target.value })} className={inputClass} />
              </div>
              <textarea placeholder="الوصف" value={changeForm.description}
                onChange={(event) => setChangeForm({ ...changeForm, description: event.target.value })} className={inputClass} rows={2} />
              <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-1.5 font-bold text-white">
                <Plus className="h-3.5 w-3.5" /> تسجيل الطلب
              </button>
              {!canApprove && <p className="text-[10px] text-muted">الاعتماد يتطلب صلاحية اعتماد طلبات التغيير.</p>}
            </form>
          )}
        </div>
      )}

      {tab === 'deliverables' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-line bg-surface lg:col-span-2">
            <DataTable
                        ariaLabel="مخرجات المشروع"
                        rows={deliverables}
                        rowKey={(deliverable) => deliverable.id}
                        dense
                        columns={[
                          {
                            key: 'deliverable', header: 'المخرج',
                            render: (deliverable) => (
                              <div>
                                <p className="font-bold text-ink">{deliverable.title}</p>
                                {deliverable.description && <p className="text-[10px] text-muted">{deliverable.description}</p>}
                              </div>
                            ),
                          },
                          { key: 'due', header: 'الاستحقاق', render: (deliverable) => <span className="font-mono text-ink-secondary">{deliverable.dueDate || '—'}</span> },
                          { key: 'delivered', header: 'التسليم', render: (deliverable) => <span className="font-mono text-ink-secondary">{deliverable.deliveredAt?.slice(0, 10) || '—'}</span> },
                          {
                            key: 'status', header: 'الحالة',
                            render: (deliverable) => canUpdate ? (
                              <select value={deliverable.status}
                                onChange={(event) => {
                                  try { service.updateDeliverable(deliverable.id, { status: event.target.value as ProjectDeliverableStatus }); load(); }
                                  catch (error: any) { fail(error, 'تعذر تحديث المخرج.'); }
                                }}
                                className="rounded-lg border border-line bg-surface px-2 py-1 text-[10px] font-bold">
                                {Object.entries(DELIVERABLE_STATUS_LABELS).map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            ) : DELIVERABLE_STATUS_LABELS[deliverable.status],
                          },
                          {
                            key: 'actions', header: '',
                            render: (deliverable) => canUpdate ? (
                              <button onClick={() => {
                                if (!window.confirm(`حذف المخرج "${deliverable.title}"؟`)) return;
                                try { service.deleteDeliverable(deliverable.id); load(); } catch (error: any) { fail(error, 'تعذر حذف المخرج.'); }
                              }} className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger" title="حذف">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null,
                          },
                        ]}
                      />

          </div>
          {canUpdate && (
            <form onSubmit={submitDeliverable} className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs">
              <h3 className="flex items-center gap-1.5 font-black text-ink">
                <CalendarCheck2 className="h-4 w-4 text-success" /> إضافة مخرج
              </h3>
              <input required placeholder="عنوان المخرج" value={deliverableForm.title}
                onChange={(event) => setDeliverableForm({ ...deliverableForm, title: event.target.value })} className={inputClass} />
              <input type="date" value={deliverableForm.dueDate}
                onChange={(event) => setDeliverableForm({ ...deliverableForm, dueDate: event.target.value })} className={inputClass} />
              <textarea placeholder="الوصف" value={deliverableForm.description}
                onChange={(event) => setDeliverableForm({ ...deliverableForm, description: event.target.value })} className={inputClass} rows={2} />
              <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-success py-1.5 font-bold text-white">
                <Plus className="h-3.5 w-3.5" /> إضافة
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
