import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { BranchAccessService } from '../../auth/BranchAccessService';
import { auditPartner } from './audit';
import type { PartnerActor } from './types';

/** Shared infrastructure for the partner service class hierarchy. */
export abstract class PartnerServiceBase {
  protected readonly db = DatabaseManager.getInstance();
  protected readonly branchAccess = new BranchAccessService();

  protected audit(
    db: DatabaseManager,
    actor: PartnerActor,
    action: string,
    recordId: string,
    oldValues: unknown,
    newValues: unknown
  ): void {
    auditPartner(db, actor, action, recordId, oldValues, newValues);
  }
}
