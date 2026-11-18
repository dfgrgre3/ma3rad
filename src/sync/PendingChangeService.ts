import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/repositories/databaseManager.ts';
import { AuthService } from '../services/domains/auth/AuthService';
import { NotificationService } from '../services/domains/notifications/NotificationService';
import { SyncPolicyService } from './SyncPolicyService.ts';
import { AccountLinkService } from './AccountLinkService.ts';
import type {
  PendingChange,
  PendingChangeNote,
  PendingChangeStatus,
  SyncDataScope,
  SyncOperation,
} from '../types/sync/index.ts';

export const CHANGE_APPROVAL_MODE_KEY = 'sync.change_approval.mode';
export type ChangeApprovalMode = 'AUTO' | 'ALWAYS' | 'OFF';

const ENTITY_LABELS: Record<string, string> = {
  sales_invoice: 'فاتورة بيع',
  sales_return: 'مرتجع بيع',
  purchase_invoice: 'فاتورة شراء',
  purchase_return: 'مرتجع شراء',
  customer_payment: 'دفعة عميل',
  supplier_payment: 'سداد مورد',
  stock_transfer: 'تحويل مخزون',
  expense: 'مصروف',
  product: 'منتج',
  category: 'تصنيف',
  brand: 'ماركة',
  customer: 'عميل',
  supplier: 'مورد',
  operational_field: 'حقل تشغيلي',
  operational_field_option: 'خيار حقل تشغيلي',
  operational_field_value: 'قيمة حقل تشغيلي',
  product_grade_option: 'خيار فرز',
};

const OPERATION_LABELS: Record<string, string> = {
  CREATE: 'إضافة',
  UPDATE: 'تعديل',
  DELETE: 'حذف',
  UPSERT: 'حفظ',
};

interface PendingChangeRow {
  id: string;
  tenantId: string | null;
  branchId: string | null;
  deviceId: string | null;
  linkId: string | null;
  entityType: string;
  entityId: string;
  operationType: SyncOperation;
  entityVersion: number;
  dataScope: SyncDataScope;
  payload: string;
  title: string;
  summary: string | null;
  status: PendingChangeStatus;
  requestedBy: string;
  requestedByName: string | null;
  requestedByRole: string | null;
  requestedBranchId: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

const CHANGE_COLUMNS = `id, tenant_id, branch_id, device_id, link_id, entity_type, entity_id,
  operation_type, entity_version, data_scope, payload, title, summary, status, requested_by,
  requested_by_name, requested_by_role, requested_branch_id, decided_by, decided_by_name,
  decided_at, decision_notes, created_at, updated_at`;

function toChange(row: PendingChangeRow): PendingChange {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    deviceId: row.deviceId,
    linkId: row.linkId,
    entityType: row.entityType,
    entityId: row.entityId,
    operationType: row.operationType,
    entityVersion: row.entityVersion,
    dataScope: row.dataScope,
    payload: row.payload,
    title: row.title,
    summary: row.summary,
    status: row.status,
    requestedBy: row.requestedBy,
    requestedByName: row.requestedByName,
    requestedByRole: row.requestedByRole,
    requestedBranchId: row.requestedBranchId,
    decidedBy: row.decidedBy,
    decidedByName: row.decidedByName,
    decidedAt: row.decidedAt,
    decisionNotes: row.decisionNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

export function operationLabel(operationType: string): string {
  return OPERATION_LABELS[operationType] ?? operationType;
}

/** Arabic summary of the fields that changed, when a header snapshot is available. */
function describeChange(entityType: string, operationType: string, payload: unknown): string | null {
  const label = entityLabel(entityType);
  const op = operationLabel(operationType);
  if (!payload || typeof payload !== 'object') return `${op} ${label}`;
  const envelope = payload as { deleted?: boolean; record?: { header?: Record<string, unknown> } };
  if (envelope.deleted) return `${op} ${label} (حذف)`;
  const header = envelope.record?.header;
  if (!header) return `${op} ${label}`;
  const numberFields = ['invoiceNumber', 'returnNumber', 'receiptNumber', 'transferNumber', 'name', 'code'];
  const number = numberFields
    .map((field) => header[field])
    .find((value) => typeof value === 'string' && value.trim().length > 0);
  const amountFields = ['totalAmount', 'amount', 'totalCost'];
  const minorUnitEntities = new Set(['sales_invoice', 'sales_return']);
  const scale = minorUnitEntities.has(entityType) ? 100 : 1;
  const amount = amountFields
    .map((field) => header[field])
    .find((value) => typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''));
  const parts = [`${op} ${label}`];
  if (number) parts.push(String(number));
  if (amount !== undefined) parts.push(`بقيمة ${new Intl.NumberFormat('ar-EG').format(Number(amount) / scale)}`);
  return parts.join(' — ');
}

/**
 * Stages edits that a sub-branch or a linked (non-owner) account made, so the
 * business owner can approve or reject them before they propagate.
 *
 * The gate is deliberately conservative: it never fires for the owner, and in
 * `AUTO` mode it only fires when this device is actually synchronised with a
 * head office or linked account.
 */
export class PendingChangeService {
  private readonly db: DatabaseManager;
  private readonly notifications: NotificationService;
  private readonly links: AccountLinkService;

  constructor(db: DatabaseManager = DatabaseManager.getInstance()) {
    this.db = db;
    this.notifications = new NotificationService();
    this.links = new AccountLinkService(db);
  }

  // -- policy ---------------------------------------------------------------

  getMode(): ChangeApprovalMode {
    const value = this.db.query<{ value: string }>(
      'SELECT value FROM system_settings WHERE key = ?',
      [CHANGE_APPROVAL_MODE_KEY]
    )[0]?.value;
    const mode = String(value || '').trim().toUpperCase();
    return mode === 'ALWAYS' || mode === 'OFF' ? mode : 'AUTO';
  }

  setMode(mode: ChangeApprovalMode): void {
    const actor = AuthService.requireAuth();
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new Error('تغيير سياسة اعتماد التعديلات متاح لصاحب النشاط فقط.');
    }
    if (!['AUTO', 'ALWAYS', 'OFF'].includes(mode)) {
      throw new Error('سياسة اعتماد التعديلات غير صحيحة.');
    }
    this.db.run(
      `INSERT INTO system_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [CHANGE_APPROVAL_MODE_KEY, mode]
    );
    this.db.run(
      `INSERT INTO sync_audit_log (id, action, details) VALUES (?, 'CHANGE_APPROVAL_MODE', ?)`,
      [`saud_${uuidv4().substring(0, 8)}`, JSON.stringify({ mode, by: actor.id })]
    );
  }

  /** True when the acting user is a sub-account whose edits need owner approval. */
  isApprovalRequired(): boolean {
    const mode = this.getMode();
    if (mode === 'OFF') return false;
    const actor = AuthService.getCurrentUser();
    if (!actor || actor.isActive === false) return false;
    if (actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN') return false;
    // An explicit per-link opt-out wins over the global AUTO policy.
    const link = this.currentLink();
    if (link && !link.requiresApproval) return false;
    if (mode === 'ALWAYS') return true;
    // AUTO: only meaningful when this device is synchronised with a head office
    // or with another company account.
    if (SyncPolicyService.currentIdentity() !== null) return true;
    return this.links.listActive().length > 0;
  }

  /** The link that owns this device, if the device was enrolled as a linked account. */
  currentLink(): ReturnType<AccountLinkService['get']> {
    const identity = SyncPolicyService.currentIdentity();
    return this.links.findActiveLinkForDevice(identity?.deviceId ?? null, identity?.branchId ?? null);
  }

  // -- staging --------------------------------------------------------------

  /**
   * Record a pending change for owner approval. Must be called inside the
   * business transaction that produced the edit so the request rolls back with
   * it. Repeated edits to the same entity by the same user update the existing
   * pending request instead of stacking duplicates.
   */
  stage(input: {
    transaction: DatabaseManager;
    entityType: string;
    entityId: string;
    operationType: SyncOperation;
    payload: unknown;
    dataScope: SyncDataScope;
    entityVersion: number;
    title?: string;
    summary?: string | null;
  }): string {
    const actor = AuthService.requireAuth();
    const identity = SyncPolicyService.currentIdentity();
    const link = this.currentLink();
    const payload = JSON.stringify(input.payload ?? null);
    if (new TextEncoder().encode(payload).length > 1024 * 1024) {
      throw new Error('التعديل المطلوب اعتماده أكبر من الحد المسموح للمزامنة.');
    }
    const title = input.title || `${operationLabel(input.operationType)} ${entityLabel(input.entityType)}`;
    const summary = input.summary !== undefined
      ? input.summary
      : describeChange(input.entityType, input.operationType, input.payload);

    const existing = input.transaction.query<{ id: string }>(
      `SELECT id FROM sync_pending_changes
       WHERE entity_type = ? AND entity_id = ? AND requested_by = ? AND status = 'PENDING'`,
      [input.entityType, input.entityId, actor.id]
    )[0];

    if (existing) {
      input.transaction.run(
        `UPDATE sync_pending_changes
         SET operation_type = ?, entity_version = ?, data_scope = ?, payload = ?, title = ?,
             summary = ?, device_id = ?, branch_id = ?, link_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          input.operationType, input.entityVersion, input.dataScope, payload, title, summary,
          identity?.deviceId ?? null, identity?.branchId ?? null, link?.id ?? null, existing.id,
        ]
      );
      this.notifyOwners(existing.id, title, summary, actor.fullName);
      return existing.id;
    }

    const id = `spc_${uuidv4().substring(0, 10)}`;
    input.transaction.run(
      `INSERT INTO sync_pending_changes
        (id, tenant_id, branch_id, device_id, link_id, entity_type, entity_id, operation_type,
         entity_version, data_scope, payload, title, summary, status, requested_by,
         requested_by_name, requested_by_role, requested_branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      [
        id, identity?.tenantId ?? null, identity?.branchId ?? null, identity?.deviceId ?? null,
        link?.id ?? null, input.entityType, input.entityId, input.operationType,
        input.entityVersion, input.dataScope, payload, title, summary, actor.id,
        actor.fullName, actor.role, identity?.branchId ?? null,
      ]
    );
    input.transaction.run(
      `INSERT INTO sync_audit_log (id, action, details) VALUES (?, 'CHANGE_STAGED', ?)`,
      [`saud_${uuidv4().substring(0, 8)}`, JSON.stringify({
        changeId: id, entityType: input.entityType, entityId: input.entityId,
        operation: input.operationType, requestedBy: actor.id,
      })]
    );
    this.notifyOwners(id, title, summary, actor.fullName);
    return id;
  }

  private notifyOwners(changeId: string, title: string, summary: string | null, requesterName: string): void {
    const owners = this.db.query<{ id: string }>(
      `SELECT id FROM users WHERE is_active = 1 AND role IN ('ADMIN', 'SUPER_ADMIN')`
    );
    const message = `${requesterName}: ${summary || title}. يرجى المراجعة والاعتماد من صفحة الموافقات.`;
    for (const owner of owners) {
      this.notifications.createNotification(
        'SYNC_APPROVAL', 'تعديل بانتظار موافقتك', message, owner.id, 'SYNC_CHANGE', changeId
      );
    }
  }

  // -- queries --------------------------------------------------------------

  list(filter: { status?: PendingChangeStatus; requestedBy?: string; limit?: number } = {}): PendingChange[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    if (filter.requestedBy) {
      clauses.push('requested_by = ?');
      params.push(filter.requestedBy);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(filter.limit) || 200, 1), 500);
    return this.db
      .query<PendingChangeRow>(
        `SELECT ${CHANGE_COLUMNS} FROM sync_pending_changes ${where}
         ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END, created_at DESC LIMIT ?`,
        [...params, limit]
      )
      .map(toChange);
  }

  get(id: string): PendingChange | null {
    const row = this.db.query<PendingChangeRow>(
      `SELECT ${CHANGE_COLUMNS} FROM sync_pending_changes WHERE id = ?`,
      [id]
    )[0];
    if (!row) return null;
    const change = toChange(row);
    change.notes = this.listNotes(id);
    return change;
  }

  /** Pending change (if any) the current user created for an entity. */
  findPendingFor(entityType: string, entityId: string, requestedBy?: string): PendingChange | null {
    const actor = requestedBy || AuthService.getCurrentUser()?.id;
    if (!actor) return null;
    const row = this.db.query<PendingChangeRow>(
      `SELECT ${CHANGE_COLUMNS} FROM sync_pending_changes
       WHERE entity_type = ? AND entity_id = ? AND requested_by = ? AND status = 'PENDING'`,
      [entityType, entityId, actor]
    )[0];
    return row ? toChange(row) : null;
  }

  countPending(): number {
    return Number(
      this.db.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM sync_pending_changes WHERE status = 'PENDING'`
      )[0]?.count ?? 0
    );
  }

  markStatus(id: string, status: PendingChangeStatus, decidedBy?: string | null, notes?: string | null): void {
    this.db.run(
      `UPDATE sync_pending_changes
       SET status = ?, decided_by = COALESCE(?, decided_by), decided_at = CURRENT_TIMESTAMP,
           decision_notes = COALESCE(?, decision_notes), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, decidedBy ?? null, notes ?? null, id]
    );
  }

  // -- decision notes -------------------------------------------------------

  listNotes(changeId: string): PendingChangeNote[] {
    return this.db.query<PendingChangeNote>(
      `SELECT id, change_id, recipient_user_id, recipient_link_id, recipient_label, notes,
              created_by, created_by_name, created_at
       FROM sync_change_notes WHERE change_id = ? ORDER BY created_at ASC`,
      [changeId]
    );
  }

  /**
   * Send a note about a change to one or many accounts. Every recipient gets a
   * notification; the note is also stored on the change so it shows in the
   * approvals history.
   */
  addNotes(input: {
    changeId: string;
    notes: string;
    recipients: Array<{ userId?: string | null; linkId?: string | null; label?: string | null }>;
  }): number {
    const actor = AuthService.requireAuth();
    const notes = String(input.notes || '').trim();
    if (!notes) throw new Error('نص الملاحظة مطلوب.');
    const change = this.get(input.changeId);
    if (!change) throw new Error('طلب التعديل غير موجود.');

    const recipients = input.recipients.length
      ? input.recipients
      : [{ userId: change.requestedBy, label: change.requestedByName }];

    let sent = 0;
    this.db.executeTransaction((transaction) => {
      for (const recipient of recipients) {
        if (!recipient.userId && !recipient.linkId) continue;
        const label = recipient.label
          || (recipient.userId
            ? this.db.query<{ fullName: string }>('SELECT full_name AS full_name FROM users WHERE id = ?', [recipient.userId])[0]?.fullName
            : null)
          || 'حساب مرتبط';
        transaction.run(
          `INSERT INTO sync_change_notes
            (id, change_id, recipient_user_id, recipient_link_id, recipient_label, notes, created_by, created_by_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `scn_${uuidv4().substring(0, 8)}`, input.changeId, recipient.userId ?? null,
            recipient.linkId ?? null, label, notes, actor.id, actor.fullName,
          ]
        );
        if (recipient.userId) {
          this.notifications.createNotification(
            'SYNC_APPROVAL_NOTE',
            'ملاحظة على تعديل',
            `${actor.fullName}: ${notes}`,
            recipient.userId,
            'SYNC_CHANGE',
            input.changeId
          );
        }
        sent++;
      }
    });
    return sent;
  }

  /** Notify the account that requested the change of the owner's decision. */
  notifyDecision(change: PendingChange, approved: boolean, notes?: string | null, byName?: string): void {
    const title = approved ? 'تم اعتماد تعديلك' : 'تم رفض تعديلك';
    const message = `${byName || 'صاحب النشاط'} ${approved ? 'اعتمد' : 'رفض'} تعديلك: ${change.summary || change.title}`
      + (notes ? ` — الملاحظة: ${notes}` : '');
    this.notifications.createNotification(
      'SYNC_APPROVAL',
      title,
      message,
      change.requestedBy,
      'SYNC_CHANGE',
      change.id
    );
  }
}
