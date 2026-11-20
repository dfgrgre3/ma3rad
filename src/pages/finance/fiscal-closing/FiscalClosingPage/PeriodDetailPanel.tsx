import type { ElementType, FC } from 'react';
import { formatDate, periodStatus, type PeriodTab } from './utils';
import type { FiscalClosingState } from './useFiscalClosing';
import { OverviewTab } from './OverviewTab';
import { ChecksTab } from './ChecksTab';
import { TasksTab } from './TasksTab';
import { AdjustmentsTab } from './AdjustmentsTab';
import { ReportsTab } from './ReportsTab';
import { AuditTab } from './AuditTab';
import { ActivityGate } from '../../../../components/ui/ActivityGate';
import { useActivityElementHidden } from '../../../../hooks/domains/config/useActivityUi';

interface PeriodDetailPanelProps {
  state: FiscalClosingState;
  activeTab: PeriodTab;
  onTabChange: (tab: PeriodTab) => void;
  tabs: Array<{ id: PeriodTab; label: string; icon: ElementType; badge?: number }>;
}

/** Selected-period detail section: header actions, tab bar and tab content. */
export const PeriodDetailPanel: FC<PeriodDetailPanelProps> = ({ state, activeTab, onTabChange, tabs }) => {
  const {
    selectedPeriod, canManage, canClose, service, runAction, closeNotes,
    checks, failedChecks, warningChecks, tasks, completedTasks, adjustments,
    report, audit, runs, openLegacyReconcile, setShowTaskModal, setShowAdjustmentModal,
  } = state;
  const auditTabHidden = useActivityElementHidden('audit');
  if (!selectedPeriod) return null;
  const visibleTabs = auditTabHidden ? tabs.filter((tab) => tab.id !== 'audit') : tabs;

  return (
    <section className="rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-ink">{selectedPeriod.name}</h2>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${periodStatus(selectedPeriod).className}`}>
              {periodStatus(selectedPeriod).label}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            من {formatDate(selectedPeriod.startDate)} إلى {formatDate(selectedPeriod.endDate)}
          </p>
        </div>
        <ActivityGate element="run">
          <div className="flex flex-wrap gap-2">
            {(selectedPeriod.workflowState === 'OPEN' || !selectedPeriod.workflowState) && canClose && selectedPeriod.status === 'OPEN' && (
            <button type="button" onClick={() => runAction(() => service.startPeriodReview(selectedPeriod.id), 'بدأت مراجعة الفترة.')} className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-xs font-bold text-warning hover:bg-warning-soft">
              بدء المراجعة
            </button>
          )}
          {selectedPeriod.workflowState === 'IN_REVIEW' && canClose && (
            <button type="button" onClick={() => runAction(() => service.submitPeriodForApproval(selectedPeriod.id), 'تم إرسال الفترة للاعتماد.')} className="rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-xs font-bold text-primary hover:bg-accent-soft">
              إرسال للاعتماد
            </button>
          )}
            {selectedPeriod.workflowState === 'PENDING_APPROVAL' && canManage && (
              <button type="button" onClick={() => runAction(() => service.approveAndClosePeriod(selectedPeriod.id, closeNotes || undefined), 'تم اعتماد وإقفال الفترة.')} className="rounded-lg bg-success px-3 py-2 text-xs font-bold text-white hover:bg-success">
                اعتماد وإقفال
              </button>
            )}
          </div>
        </ActivityGate>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line px-3 pt-3">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex items-center gap-2 rounded-t-xl px-3 py-2 text-sm font-bold transition ${activeTab === tab.id ? 'bg-accent-soft text-primary' : 'text-muted hover:bg-surface-muted'}`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {!!tab.badge && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">{tab.badge}</span>}
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-5">
        {activeTab === 'overview' && (
          <OverviewTab
            failedChecksCount={failedChecks.length}
            warningChecksCount={warningChecks.length}
            completedTasks={completedTasks}
            tasksCount={tasks.length}
            adjustmentsCount={adjustments.length}
            closingNotes={selectedPeriod.closingNotes}
          />
        )}

        {activeTab === 'checks' && (
          <ChecksTab
            checks={checks}
            canManage={canManage}
            selectedPeriod={selectedPeriod}
            onLegacyReconcile={openLegacyReconcile}
          />
        )}

        {activeTab === 'tasks' && (
          <TasksTab
            tasks={tasks}
            canManage={canManage}
            selectedPeriod={selectedPeriod}
            service={service}
            runAction={runAction}
            onNewTask={() => setShowTaskModal(true)}
          />
        )}

        {activeTab === 'adjustments' && (
          <AdjustmentsTab
            adjustments={adjustments}
            canManage={canManage}
            canClose={canClose}
            service={service}
            runAction={runAction}
            onNewAdjustment={() => setShowAdjustmentModal(true)}
          />
        )}

        {activeTab === 'reports' && <ReportsTab report={report} />}

        {activeTab === 'audit' && <AuditTab audit={audit} runs={runs} />}
      </div>
    </section>
  );
};
