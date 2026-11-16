import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/repositories/databaseManager.ts';
import { AuthService } from '../services/domains/auth/AuthService';
import { MasterDataSyncService } from './MasterDataSyncService.ts';
import { BusinessRecordSyncService } from './BusinessRecordSyncService.ts';
import { PendingChangeService } from './PendingChangeService.ts';
import type { PendingChange } from '../types/sync/index.ts';

/**
 * Owner-side decisions on edits staged by sub-branches or linked accounts.
 *
 * Approving a change re-captures the current record and writes it to the sync
 * outbox (bypassing the approval gate exactly once). Rejecting a change leaves
 * the local data untouched and sends the owner's note back to the account that
 * made the edit and to any additional recipients.
 */
export class SyncChangeApprovalService {
  private readonly db: DatabaseManager;
  private readonly pending: PendingChangeService;
  private readonly master: MasterDataSyncService;
  private readonly business: BusinessRecordSyncService;

  constructor(db: DatabaseManager = DatabaseManager.getInstance()) {
    this.db = db;
    this.pending = new PendingChangeService(db);
    this.master = new MasterDataSyncService(db);
    this.business = new BusinessRecordSyncService(db);
  }

  listPending(): PendingChange[] {
    return this.pending.list({ status: 'PENDING' });
  }

  list(filter?: Parameters<PendingChangeService['list']>[0]): PendingChange[] {
    return this.pending.list(filter);
  }

  get(id: string): PendingChange | null {
    return this.pending.get(id);
  }

  private requireOwner(): { id: string; fullName: string } {
    const actor = AuthService.requireAuth();
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new Error('اعتماد أو رفض تعديلات الفروع متاح لصاحب النشاط فقط.');
    }
    return { id: actor.id, fullName: actor.fullName };
  }

  decide(
    id: string,
    approved: boolean,
    options: {
      notes?: string;
      recipients?: Array<{ userId?: string | null; linkId?: string | null; label?: string | null }>;
    } = {}
  ): { status: 'APPLIED' | 'REJECTED'; applied: boolean } {
    const actor = this.requireOwner();
    const change = this.pending.get(id);
    if (!change) throw new Error('طلب التعديل غير موجود.');
    if (change.status !== 'PENDING') throw new Error('تم اتخاذ قرار في هذا الطلب بالفعل.');
    const notes = options.notes?.trim() || '';
    if (!approved && !notes) throw new Error('يجب كتابة سبب الرفض.');

    let applied = false;
    let skipReason: string | null = null;

    this.db.executeTransaction((transaction) => {
      if (approved) {
        try {
          const eventId = this.business.captureApproved(
            transaction, change.entityType, change.entityId, change.operationType
          ) ?? this.master.captureApproved(
            transaction, change.entityType, change.entityId, change.operationType
          );
          applied = Boolean(eventId);
          if (!applied) skipReason = 'التزامن غير مفعّل لهذا النوع حاليًا.';
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/Cannot synchronize missing|does not exist/i.test(message)) {
            skipReason = 'السجل لم يعد موجودًا عند الاعتماد.';
          } else {
            throw error;
          }
        }
      }

      const decisionNotes = skipReason && notes ? `${notes} (${skipReason})` : notes || skipReason;
      this.pending.markStatus(id, approved ? 'APPLIED' : 'REJECTED', actor.id, decisionNotes || null);
      transaction.run(
        `INSERT INTO sync_audit_log (id, action, details) VALUES (?, ?, ?)`,
        [
          `saud_${uuidv4().substring(0, 8)}`,
          approved ? 'CHANGE_APPROVED' : 'CHANGE_REJECTED',
          JSON.stringify({
            changeId: id, entityType: change.entityType, entityId: change.entityId,
            requestedBy: change.requestedBy, decidedBy: actor.id, notes: decisionNotes || null,
          }),
        ]
      );
    });

    if (notes) {
      this.pending.addNotes({
        changeId: id,
        notes,
        recipients: options.recipients?.length
          ? options.recipients
          : [{ userId: change.requestedBy, label: change.requestedByName }],
      });
    }
    this.pending.notifyDecision(change, approved, notes || null, actor.fullName);
    return { status: approved ? 'APPLIED' : 'REJECTED', applied };
  }

  /** Cancel a pending change without a decision (e.g. it became irrelevant). */
  cancel(id: string): void {
    const actor = this.requireOwner();
    const change = this.pending.get(id);
    if (!change) throw new Error('طلب التعديل غير موجود.');
    if (change.status !== 'PENDING') throw new Error('لا يمكن إلغاء طلب تم اتخاذ قرار فيه.');
    this.pending.markStatus(id, 'CANCELLED', actor.id, null);
  }

  sendNotes(
    id: string,
    notes: string,
    recipients: Array<{ userId?: string | null; linkId?: string | null; label?: string | null }>
  ): number {
    this.requireOwner();
    return this.pending.addNotes({ changeId: id, notes, recipients });
  }
}
