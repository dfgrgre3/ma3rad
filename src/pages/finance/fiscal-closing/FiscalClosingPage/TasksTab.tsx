import { Plus } from 'lucide-react';
import type { FC } from 'react';
import type { FinanceEnterpriseService } from '../../../../services/domains/finance/FinanceEnterpriseService';
import type { PeriodCloseTask } from '../../../../services/domains/finance/FinancePeriodCloseService';
import type { FiscalPeriod } from '../../../../types/finance';
import { formatDate, priorityLabel, taskStatusLabel } from '../utils';

type RunAction = (action: () => void, successMessage: string, closeModal?: () => void) => void;

interface TasksTabProps {
  tasks: PeriodCloseTask[];
  canManage: boolean;
  selectedPeriod: FiscalPeriod | undefined;
  service: FinanceEnterpriseService;
  runAction: RunAction;
  onNewTask: () => void;
}

/** Period close tasks list with status updates and standard-task generation. */
export const TasksTab: FC<TasksTabProps> = ({
  tasks,
  canManage,
  selectedPeriod,
  service,
  runAction,
  onNewTask,
}) => (
  <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {canManage && (
        <>
          <button type="button" onClick={onNewTask} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-800">
            <Plus className="h-4 w-4" /> مهمة جديدة
          </button>
          <button type="button" onClick={() => runAction(() => service.generateDefaultPeriodTasks(selectedPeriod!.id), 'تم توليد مهام الإقفال القياسية.')} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            توليد المهام القياسية
          </button>
        </>
      )}
    </div>
    {tasks.length === 0 && <p className="text-sm text-slate-500">لا توجد مهام لهذه الفترة بعد.</p>}
    <div className="space-y-2">
      {tasks.map((task) => (
        <article key={task.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-bold text-slate-800">{task.title}</p>
              <p className="mt-1 text-xs text-slate-500">{task.department || 'بدون قسم'} · {task.assigneeName || 'غير مسندة'} · استحقاق {task.dueDate ? formatDate(task.dueDate) : 'غير محدد'}</p>
              {task.notes && <p className="mt-1 text-xs text-slate-500">{task.notes}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700">{priorityLabel[task.priority]}</span>
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-bold text-cyan-800">{taskStatusLabel[task.status]}</span>
              {canManage && task.status !== 'APPROVED' && task.status !== 'CANCELLED' && (
                <select
                  value={task.status}
                  onChange={(event) => runAction(() => service.updatePeriodCloseTask(task.id, { status: event.target.value as any }), 'تم تحديث حالة المهمة.')}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                >
                  {Object.entries(taskStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  </div>
);
