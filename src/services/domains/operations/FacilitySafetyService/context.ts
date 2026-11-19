import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import type { NotificationService } from '../../notifications/NotificationService';
import type { User } from '../../../../types';

/**
 * Internal context shared by the FacilitySafetyService modules.
 * The class in ../FacilitySafetyService.ts builds this object once; every
 * entry is a closure over the class so `this` semantics are preserved.
 */
export interface SafetyContext {
  db: DatabaseManager;
  branchAccess: BranchAccessService;
  notification: NotificationService;
  requireView(): User;
  requireManage(): User;
  currentCompanyId(actor?: User): string;
  auditActor(actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void;
  auditDB(db: any, actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void;
}
