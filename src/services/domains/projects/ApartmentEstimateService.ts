import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { ProjectService } from './ProjectService';
import type { ApartmentEstimate, ApartmentEstimateQuotationLink, ApartmentEstimateVersion, EstimatePayment, EstimateVersionStatus, SaveApartmentEstimateInput } from '../../../types/projects/apartmentEstimate';
import type { EstimateLine, EstimateRoom } from '../../../types/projects/estimateMeasurement';
import { validateEstimateMeasurements } from './estimateValidation';

export class ApartmentEstimateService {
  private db = DatabaseManager.getInstance();
  private projects = new ProjectService();

  public getByProject(projectId: string): ApartmentEstimate[] {
    if (!this.projects.getProjectById(projectId)) {
      throw new Error('المشروع غير موجود أو ليس لديك صلاحية الوصول إليه.');
    }
    return this.db.query<{
      id: string;
      projectId: string;
      name: string;
      areaM2: number;
      totalAmount: number;
      terms: string;
      contingencyPercent: number;
      taxPercent: number;
      paymentsJson: string;
      roomsJson: string;
      costLinesJson: string;
      quotationId: string | null;
      createdAt: string;
      updatedAt: string;
      currentVersionId: string | null;
      currentVersionNumber: number | null;
      currentVersionStatus: EstimateVersionStatus | null;
    }>(
      `SELECT id, project_id AS projectId, name, area_m2 AS areaM2,
              total_amount AS totalAmount, terms, contingency_percent AS contingencyPercent,
              tax_percent AS taxPercent, payments_json AS paymentsJson, rooms_json AS roomsJson,
              cost_lines_json AS costLinesJson, quotation_id AS quotationId,
              created_at AS createdAt, updated_at AS updatedAt,
              (SELECT ev.id FROM project_apartment_estimate_versions ev WHERE ev.estimate_id = project_apartment_estimates.id ORDER BY ev.version_number DESC LIMIT 1) AS currentVersionId,
              (SELECT ev.version_number FROM project_apartment_estimate_versions ev WHERE ev.estimate_id = project_apartment_estimates.id ORDER BY ev.version_number DESC LIMIT 1) AS currentVersionNumber,
              (SELECT ev.status FROM project_apartment_estimate_versions ev WHERE ev.estimate_id = project_apartment_estimates.id ORDER BY ev.version_number DESC LIMIT 1) AS currentVersionStatus
       FROM project_apartment_estimates
       WHERE project_id = ? ORDER BY updated_at DESC, created_at DESC`,
      [projectId]
    ).map((row) => ({
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      areaM2: Number(row.areaM2),
      totalAmount: Number(row.totalAmount),
      terms: row.terms || '',
      contingencyPercent: Number(row.contingencyPercent || 0),
      taxPercent: Number(row.taxPercent || 0),
      payments: this.parseJson<EstimatePayment[]>(row.paymentsJson || '[]', 'الدفعات'),
      rooms: this.parseJson<EstimateRoom[]>(row.roomsJson, 'الغرف'),
      costLines: this.parseJson<EstimateLine[]>(row.costLinesJson, 'بنود المقايسة'),
      quotationId: row.quotationId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      currentVersionId: row.currentVersionId,
      currentVersionNumber: row.currentVersionNumber === null ? null : Number(row.currentVersionNumber),
      currentVersionStatus: row.currentVersionStatus,
    }));
  }

  public save(input: SaveApartmentEstimateInput): ApartmentEstimate {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('projects');
    PermissionService.require(actor, 'ui.projects.list.update');
    const project = this.projects.getProjectById(input.projectId);
    if (!project) throw new Error('المشروع غير موجود أو ليس لديك صلاحية الوصول إليه.');
    if (!input.name.trim()) throw new Error('اسم تصميم الشقة مطلوب.');
    if (!Number.isFinite(input.areaM2) || input.areaM2 < 0) throw new Error('مساحة الشقة غير صالحة.');
    if (!Number.isFinite(input.totalAmount) || input.totalAmount < 0) throw new Error('إجمالي المقايسة غير صالح.');
    if (!Array.isArray(input.rooms) || !Array.isArray(input.costLines)) {
      throw new Error('بيانات الغرف وبنود المقايسة غير صالحة.');
    }
    const validationErrors = validateEstimateMeasurements({
      name: input.name, areaM2: input.areaM2, rooms: input.rooms, costLines: input.costLines,
      payments: input.payments, contingencyPercent: input.contingencyPercent, taxPercent: input.taxPercent,
      totalAmount: input.totalAmount,
    });
    if (validationErrors.length) throw new Error(`بيانات المقايسة غير مكتملة: ${validationErrors.slice(0, 5).join('، ')}`);

    const roomsJson = JSON.stringify(input.rooms);
    const costLinesJson = JSON.stringify(input.costLines);
    const paymentsJson = JSON.stringify(input.payments || []);
    if (roomsJson.length > 500_000 || costLinesJson.length > 500_000 || paymentsJson.length > 100_000) {
      throw new Error('بيانات التصميم أكبر من الحد المسموح.');
    }

    const id = input.id || `pae_${uuidv4().substring(0, 12)}`;
    const existing = input.id
      ? this.db.query<{ id: string }>(
        'SELECT id FROM project_apartment_estimates WHERE id = ? AND project_id = ?',
        [input.id, input.projectId]
      )[0]
      : undefined;
    if (input.id && !existing) throw new Error('تصميم الشقة غير موجود ضمن هذا المشروع.');

    const versionId = `paev_${uuidv4().substring(0, 12)}`;
    const snapshot = JSON.stringify({
      id, projectId: input.projectId, name: input.name.trim(), areaM2: input.areaM2,
      totalAmount: input.totalAmount, terms: input.terms?.trim() || '', contingencyPercent: input.contingencyPercent || 0,
      taxPercent: input.taxPercent || 0, payments: input.payments || [],
      rooms: input.rooms, costLines: input.costLines, lineQuantities: input.lineQuantities || {},
    });
    if (snapshot.length > 1_000_000) throw new Error('Estimate version exceeds the permitted size.');
    const previousSnapshotJson = this.db.query<{ snapshotJson: string }>(
      'SELECT snapshot_json AS snapshotJson FROM project_apartment_estimate_versions WHERE estimate_id = ? ORDER BY version_number DESC LIMIT 1',
      [id]
    )[0]?.snapshotJson;
    const previousSnapshot = previousSnapshotJson
      ? this.parseJson<{ costLines?: EstimateLine[]; lineQuantities?: Record<string, number> }>(previousSnapshotJson, 'النسخة السابقة')
      : null;
    const previousLines = new Map((previousSnapshot?.costLines || []).map((line) => [line.id, line]));
    const changedPricesAndQuantities = input.costLines.flatMap((line) => {
      const previous = previousLines.get(line.id);
      const previousQuantity = previousSnapshot?.lineQuantities?.[line.id];
      const quantity = input.lineQuantities?.[line.id];
      const fields = ['materialRate', 'laborRate', 'equipmentRate', 'expenseRate', 'discountPercent', 'profitPercent'] as const;
      const changedPrices = previous ? fields.filter((field) => (previous[field] || 0) !== (line[field] || 0)).map((field) => ({ field, before: previous[field] || 0, after: line[field] || 0 })) : [];
      const quantityChanged = previousQuantity !== undefined && quantity !== undefined && previousQuantity !== quantity;
      if (!previous || changedPrices.length || quantityChanged) return [{
        lineId: line.id, name: line.name, action: previous ? 'UPDATED' : 'ADDED',
        previousQuantity: previousQuantity ?? null, quantity: quantity ?? null, changedPrices,
      }];
      return [];
    });
    const currentLineIds = new Set(input.costLines.map((line) => line.id));
    for (const previous of previousSnapshot?.costLines || []) {
      if (!currentLineIds.has(previous.id)) changedPricesAndQuantities.push({
        lineId: previous.id, name: previous.name, action: 'DELETED',
        previousQuantity: previousSnapshot?.lineQuantities?.[previous.id] ?? previous.manualQuantity ?? null,
        quantity: null, changedPrices: [],
      });
    }
    const versionNumber = this.db.executeTransaction((txDb) => {
      txDb.run(
        `INSERT INTO project_apartment_estimates
          (id, project_id, name, area_m2, total_amount, terms, contingency_percent, tax_percent, payments_json, rooms_json, cost_lines_json, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           area_m2 = excluded.area_m2,
           total_amount = excluded.total_amount,
           terms = excluded.terms,
           contingency_percent = excluded.contingency_percent,
           tax_percent = excluded.tax_percent,
           payments_json = excluded.payments_json,
           rooms_json = excluded.rooms_json,
           cost_lines_json = excluded.cost_lines_json,
           updated_by = excluded.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
        [
          id, input.projectId, input.name.trim(), input.areaM2, input.totalAmount, input.terms?.trim() || '',
          input.contingencyPercent || 0, input.taxPercent || 0, paymentsJson,
          roomsJson, costLinesJson, actor.id, actor.id,
        ]
      );
      const nextNumber = Number(txDb.query<{ versionNumber: number }>(
        'SELECT COALESCE(MAX(version_number), 0) + 1 AS versionNumber FROM project_apartment_estimate_versions WHERE estimate_id = ?',
        [id]
      )[0]?.versionNumber || 1);
      txDb.run(
        `INSERT INTO project_apartment_estimate_versions
          (id, estimate_id, project_id, version_number, status, snapshot_json, change_summary, created_by, created_by_name)
         VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
        [versionId, id, input.projectId, nextNumber, snapshot, input.changeSummary?.trim() || 'Saved a new estimate version', actor.id, actor.fullName]
      );
      return nextNumber;
    });
    this.audit(actor.id, actor.fullName, input.id ? 'تحديث تصميم شقة ومقايسة' : 'حفظ تصميم شقة ومقايسة', id, {
      projectId: input.projectId,
      name: input.name.trim(),
      areaM2: input.areaM2,
      totalAmount: input.totalAmount,
      versionId,
      versionNumber,
      changedPricesAndQuantities,
    });
    const saved = this.getByProject(input.projectId).find((estimate) => estimate.id === id);
    if (!saved) throw new Error('تعذر استرجاع تصميم الشقة بعد حفظه.');
    return saved;
  }

  public getVersions(estimateId: string, projectId: string): ApartmentEstimateVersion[] {
    if (!this.projects.getProjectById(projectId)) throw new Error('Project not found or access denied.');
    return this.db.query<{
      id: string; estimateId: string; projectId: string; versionNumber: number; status: EstimateVersionStatus;
      snapshotJson: string; changeSummary: string; createdBy: string; createdByName: string; createdAt: string;
      reviewedBy: string | null; reviewedByName: string | null; reviewedAt: string | null; reviewNotes: string | null;
    }>(
      `SELECT id, estimate_id AS estimateId, project_id AS projectId, version_number AS versionNumber,
              status, snapshot_json AS snapshotJson, change_summary AS changeSummary,
              created_by AS createdBy, created_by_name AS createdByName, created_at AS createdAt,
              reviewed_by AS reviewedBy, reviewed_by_name AS reviewedByName, reviewed_at AS reviewedAt,
              review_notes AS reviewNotes
       FROM project_apartment_estimate_versions WHERE estimate_id = ? AND project_id = ?
       ORDER BY version_number DESC`,
      [estimateId, projectId]
    ).map((row) => ({
      ...row,
      snapshot: this.parseJson<ApartmentEstimateVersion['snapshot']>(row.snapshotJson, 'نسخة المقايسة'),
    }));
  }

  public submitVersionForReview(estimateId: string, versionId: string, projectId: string): void {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('projects');
    PermissionService.require(actor, 'ui.projects.list.update');
    if (!this.projects.getProjectById(projectId)) throw new Error('Project not found or access denied.');
    const version = this.db.query<{ status: EstimateVersionStatus; createdBy: string; versionNumber: number }>(
      'SELECT status, created_by AS createdBy, version_number AS versionNumber FROM project_apartment_estimate_versions WHERE id = ? AND estimate_id = ? AND project_id = ?',
      [versionId, estimateId, projectId]
    )[0];
    if (!version) throw new Error('Estimate version not found.');
    if (version.status !== 'DRAFT' && version.status !== 'RETURNED') throw new Error('Only draft or returned versions can be submitted.');
    const latestNumber = Number(this.db.query<{ versionNumber: number }>(
      'SELECT MAX(version_number) AS versionNumber FROM project_apartment_estimate_versions WHERE estimate_id = ?', [estimateId]
    )[0]?.versionNumber || 0);
    if (version.versionNumber !== latestNumber) throw new Error('Only the latest estimate version can be submitted for review.');
    this.db.run(
      `UPDATE project_apartment_estimate_versions SET status = 'PENDING', reviewed_by = NULL,
       reviewed_by_name = NULL, reviewed_at = NULL, review_notes = NULL WHERE id = ?`,
      [versionId]
    );
    this.audit(actor.id, actor.fullName, 'إرسال إصدار المقايسة للمراجعة', versionId, { estimateId, projectId });
  }

  public decideVersion(estimateId: string, versionId: string, projectId: string, decision: 'APPROVED' | 'RETURNED', notes = ''): void {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('projects');
    PermissionService.require(actor, 'ui.projects.list.approve');
    if (!this.projects.getProjectById(projectId)) throw new Error('Project not found or access denied.');
    const version = this.db.query<{ status: EstimateVersionStatus; createdBy: string; versionNumber: number }>(
      'SELECT status, created_by AS createdBy, version_number AS versionNumber FROM project_apartment_estimate_versions WHERE id = ? AND estimate_id = ? AND project_id = ?',
      [versionId, estimateId, projectId]
    )[0];
    if (!version || version.status !== 'PENDING') throw new Error('Only pending estimate versions can be reviewed.');
    const latestNumber = Number(this.db.query<{ versionNumber: number }>(
      'SELECT MAX(version_number) AS versionNumber FROM project_apartment_estimate_versions WHERE estimate_id = ?', [estimateId]
    )[0]?.versionNumber || 0);
    if (decision === 'APPROVED' && version.versionNumber !== latestNumber) throw new Error('A newer estimate version exists; review the latest version instead.');
    if (version.createdBy === actor.id) throw new Error('A different authorized user must review this estimate version.');
    if (decision === 'RETURNED' && !notes.trim()) throw new Error('Add a review note before returning the estimate.');
    this.db.run(
      `UPDATE project_apartment_estimate_versions
       SET status = ?, reviewed_by = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP, review_notes = ?
       WHERE id = ? AND estimate_id = ? AND project_id = ? AND status = 'PENDING'`,
      [decision, actor.id, actor.fullName, notes.trim() || null, versionId, estimateId, projectId]
    );
    this.audit(actor.id, actor.fullName, decision === 'APPROVED' ? 'اعتماد إصدار المقايسة' : 'إعادة إصدار المقايسة للمراجعة', versionId, { estimateId, projectId, notes: notes.trim() || null });
  }

  public getQuotationLinks(estimateId: string, projectId: string): ApartmentEstimateQuotationLink[] {
    if (!this.projects.getProjectById(projectId)) throw new Error('Project not found or access denied.');
    return this.db.query<ApartmentEstimateQuotationLink>(
      `SELECT l.quotation_id AS quotationId, q.quotation_number AS quotationNumber,
              l.version_id AS versionId, v.version_number AS versionNumber, l.created_at AS createdAt
       FROM project_apartment_estimate_quotation_links l
       JOIN project_apartment_estimates e ON e.id = l.estimate_id
       JOIN quotations q ON q.id = l.quotation_id
       LEFT JOIN project_apartment_estimate_versions v ON v.id = l.version_id
       WHERE l.estimate_id = ? AND e.project_id = ? ORDER BY l.created_at DESC`,
      [estimateId, projectId]
    ).map((row) => ({ ...row, versionNumber: row.versionNumber === null ? null : Number(row.versionNumber) }));
  }

  public linkQuotation(estimateId: string, projectId: string, quotationId: string, versionId?: string): void {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('projects');
    PermissionService.require(actor, 'ui.projects.list.update');
    if (!this.projects.getProjectById(projectId)) {
      throw new Error('المشروع غير موجود أو ليس لديك صلاحية الوصول إليه.');
    }
    const quotation = this.db.query<{ id: string }>(
      'SELECT id FROM quotations WHERE id = ? AND project_id = ?',
      [quotationId, projectId]
    )[0];
    if (!quotation) throw new Error('عرض السعر غير مرتبط بالمشروع المحدد.');
    const currentVersionId = versionId || this.db.query<{ id: string }>(
      'SELECT id FROM project_apartment_estimate_versions WHERE estimate_id = ? ORDER BY version_number DESC LIMIT 1',
      [estimateId]
    )[0]?.id || null;
    this.db.executeTransaction((txDb) => {
      txDb.run(
      `UPDATE project_apartment_estimates
       SET quotation_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND project_id = ?`,
      [quotationId, actor.id, estimateId, projectId]
      );
      txDb.run(
        `INSERT OR IGNORE INTO project_apartment_estimate_quotation_links
         (id, estimate_id, version_id, quotation_id, created_by) VALUES (?, ?, ?, ?, ?)`,
        [`paeq_${uuidv4().substring(0, 12)}`, estimateId, currentVersionId, quotationId, actor.id]
      );
    });
    const linked = this.db.query<{ id: string }>(
      `SELECT id FROM project_apartment_estimates
       WHERE id = ? AND project_id = ? AND quotation_id = ?`,
      [estimateId, projectId, quotationId]
    )[0];
    if (!linked) throw new Error('تعذر ربط عرض السعر بتصميم الشقة.');
    this.audit(actor.id, actor.fullName, 'ربط عرض سعر بتصميم شقة', estimateId, {
      projectId,
      quotationId,
    });
  }

  private parseJson<T>(value: string, label: string): T {
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      throw new Error(`تعذر قراءة ${label} المحفوظة: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private audit(userId: string, userName: string, action: string, recordId: string, values: object): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'PROJECTS', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, userId, userName, action, recordId, JSON.stringify(values)]
    );
  }
}
