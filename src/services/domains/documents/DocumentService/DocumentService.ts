import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { ModuleRegistryService } from '../../config/ModuleRegistryService';
import { ApprovalService } from '../../approvals/ApprovalService';
import { localDateString } from '../../../../utils/shared/date';
import type {
  ContractEffectiveStatus,
  ContractStatus,
  DocumentCompanyOption,
  DocumentModuleSummary,
} from '../../../../types/documents';
import { CONTRACT_STATUSES, MODULE_ID } from './validation';
import { ContractOperations } from './contracts';

/**
 * Central document and contract registry.
 *
 * Security and integrity rules enforced here (not only in the UI):
 * - `documents.view/create/update/archive` and `contracts.*` permissions;
 * - explicit company ownership plus branch filtering derived from the user's
 *   accessible branches, so records cannot leak between legal entities;
 * - module lifecycle guard for every mutation;
 * - immutable version rows: a version is only ever appended, never rewritten;
 * - append-only event history and audit entries for material actions.
 */
export class DocumentService extends ContractOperations {
  // ─── Company options ───────────────────────────────────────────────────────

  /** Companies the current user may file documents against. Does not require `companies.view`. */
  public getCompanyOptions(): DocumentCompanyOption[] {
    const actor = AuthService.requireAuth();
    if (!PermissionService.can(actor, 'ui.documents.documents.view') && !PermissionService.can(actor, 'ui.contracts.contracts.view')) {
      throw new Error('ليس لديك صلاحية الوصول إلى المستندات أو العقود.');
    }
    const companies = this.access.getAccessibleCompanyIds(actor);
    const filter =
      companies === null
        ? { clause: '1 = 1', params: [] as string[] }
        : companies.length
          ? { clause: `c.id IN (${companies.map(() => '?').join(', ')})`, params: companies }
          : { clause: '1 = 0', params: [] as string[] };
    return this.db.query<DocumentCompanyOption>(
      `SELECT c.id, c.code, c.name
       FROM companies c
       WHERE c.is_active = 1 AND ${filter.clause}
       ORDER BY c.name`,
      filter.params
    );
  }

  // ─── Approval requests ─────────────────────────────────────────────────────

  public requestActivationApproval(id: string, kind: 'DOCUMENT' | 'CONTRACT'): { approvalId: string; requestNumber: string } {
    const actor = AuthService.requireAuth();
    if (kind === 'DOCUMENT') {
      PermissionService.require(actor, 'ui.documents.documents.update');
    } else {
      PermissionService.require(actor, 'ui.contracts.contracts.update');
    }
    ModuleRegistryService.assertModuleEnabled(MODULE_ID);
    ModuleRegistryService.assertModuleEnabled('approvals');

    let branchId: string | null = null;
    let title = '';
    if (kind === 'DOCUMENT') {
      const document = this.getDocument(id);
      if (!document) throw new Error('المستند غير موجود.');
      if (document.status !== 'DRAFT') throw new Error('يمكن طلب اعتماد المستندات المسودة فقط.');
      branchId = (document as any).branchId ?? null;
      title = `تفعيل مستند: ${document.title}`;
    } else {
      const contract = this.getContract(id);
      if (!contract) throw new Error('العقد غير موجود.');
      if (contract.status !== 'DRAFT') throw new Error('يمكن طلب اعتماد العقود المسودة فقط.');
      branchId = (contract as any).branchId ?? null;
      title = `تفعيل عقد: ${contract.title}`;
    }

    const approvals = new ApprovalService();
    const request = approvals.createRequest({
      requestType: 'OTHER',
      referenceType: kind,
      referenceId: id,
      title,
      description: `طلب اعتماد تفعيل ${kind === 'DOCUMENT' ? 'مستند' : 'عقد'} (${id})`,
      priority: 'NORMAL',
      branchId: branchId || undefined,
    });
    return { approvalId: request.id, requestNumber: request.requestNumber };
  }

  // ─── Shared reporting ──────────────────────────────────────────────────────

  public getSummary(): DocumentModuleSummary {
    const actor = AuthService.requireAuth();
    const canDocuments = PermissionService.can(actor, 'ui.documents.documents.view');
    const canContracts = PermissionService.can(actor, 'ui.contracts.contracts.view');
    if (!canDocuments && !canContracts) {
      throw new Error('ليس لديك صلاحية الوصول إلى المستندات أو العقود.');
    }
    const today = localDateString();
    const in30 = new Date(`${today}T00:00:00Z`);
    in30.setUTCDate(in30.getUTCDate() + 30);
    const in30String = in30.toISOString().slice(0, 10);
    const summary: DocumentModuleSummary = {
      documents: 0,
      activeDocuments: 0,
      archivedDocuments: 0,
      expiringDocuments: 0,
      contracts: 0,
      activeContracts: 0,
      expiringContracts: 0,
    };

    if (canDocuments) {
      const docScope = this.companyScope('d', actor);
      const docBranch = this.branchScope('d', actor);
      const row = this.db.query<any>(
        `SELECT COUNT(*) AS documents,
                SUM(CASE WHEN d.status = 'ACTIVE' THEN 1 ELSE 0 END) AS activeDocuments,
                SUM(CASE WHEN d.status = 'ARCHIVED' THEN 1 ELSE 0 END) AS archivedDocuments,
                SUM(CASE WHEN d.status <> 'ARCHIVED' AND d.expires_at IS NOT NULL
                          AND d.expires_at >= ? AND d.expires_at <= ? THEN 1 ELSE 0 END) AS expiringDocuments
         FROM enterprise_documents d
         WHERE ${docScope.clause} AND ${docBranch.clause}`,
        [today, in30String, ...docScope.params, ...docBranch.params]
      )[0];
      summary.documents = Number(row?.documents || 0);
      summary.activeDocuments = Number(row?.activeDocuments || 0);
      summary.archivedDocuments = Number(row?.archivedDocuments || 0);
      summary.expiringDocuments = Number(row?.expiringDocuments || 0);
    }

    if (canContracts) {
      const contractScope = this.companyScope('ct', actor);
      const contractBranch = this.branchScope('ct', actor);
      const row = this.db.query<any>(
        `SELECT COUNT(*) AS contracts,
                SUM(CASE WHEN ct.status = 'ACTIVE' AND ct.start_date <= ? AND ct.end_date >= ? THEN 1 ELSE 0 END) AS activeContracts,
                SUM(CASE WHEN ct.status = 'ACTIVE' AND ct.end_date >= ? AND ct.end_date <= ? THEN 1 ELSE 0 END) AS expiringContracts
         FROM enterprise_contracts ct
         WHERE ${contractScope.clause} AND ${contractBranch.clause}`,
        [today, today, today, in30String, ...contractScope.params, ...contractBranch.params]
      )[0];
      summary.contracts = Number(row?.contracts || 0);
      summary.activeContracts = Number(row?.activeContracts || 0);
      summary.expiringContracts = Number(row?.expiringContracts || 0);
    }

    return summary;
  }

  public getEvents(entityType: 'DOCUMENT' | 'CONTRACT', entityId: string): Array<{
    id: string;
    action: string;
    actorName: string | null;
    details: string | null;
    createdAt: string;
  }> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, entityType === 'DOCUMENT' ? 'ui.documents.documents.view' : 'ui.contracts.contracts.view');
    if (entityType === 'DOCUMENT') this.getDocument(entityId);
    else this.getContract(entityId);
    return this.db.query<any>(
      `SELECT id, action, actor_name AS actorName, details, created_at AS createdAt
       FROM enterprise_document_events
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
      [entityType, entityId]
    );
  }

  /** Exposed for tests and UI diagnostics. */
  public static isSupportedContractStatus(value: string): value is ContractEffectiveStatus {
    return ['DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED'].includes(value)
      || CONTRACT_STATUSES.includes(value as ContractStatus);
  }
}
