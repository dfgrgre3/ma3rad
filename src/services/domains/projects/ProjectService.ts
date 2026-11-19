// Public API is unchanged: this file re-exports the service class and all of
// its types. The implementation lives in the sibling `ProjectService/` folder,
// split by responsibility (projects, units, products, tasks, time, budget,
// risks, change requests, deliverables) as an inheritance chain of layers.
export { ProjectService } from './ProjectService/index';
export type {
  ProjectStatus,
  ProjectType,
  Project,
  ProjectUnit,
  ProjectProduct,
  ProjectTaskStatus,
  ProjectTaskPriority,
  ProjectRiskSeverity,
  ProjectRiskProbability,
  ProjectRiskStatus,
  ProjectChangeStatus,
  ProjectDeliverableStatus,
  ProjectTask,
  ProjectTaskDependency,
  ProjectTimeEntry,
  ProjectBudgetLine,
  ProjectBudgetSummary,
  ProjectTimeSummary,
  ProjectRisk,
  ProjectChangeRequest,
  ProjectDeliverable,
} from './ProjectService/types';
