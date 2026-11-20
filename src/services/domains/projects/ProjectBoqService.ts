import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { ProjectService } from './ProjectService';
import type { ApartmentEstimateVersion } from '../../../types/projects/apartmentEstimate';
import type { EstimateLine } from '../../../types/projects/estimateMeasurement';
import { round2 } from '../finance/financials';

export interface BoqLineInput {
  id?: string;
  name: string;
  category?: string;
  unit?: string;
  quantity?: number;
  materialRate?: number;
  laborRate?: number;
  equipmentRate?: number;
  expenseRate?: number;
  wastePercent?: number;
  discountPercent?: number;
  profitPercent?: number;
}

export interface BoqEstimateSummary {
  id: string;
  projectId: string;
  name: string;
  totalAmount: number;
  terms: string;
  contingencyPercent: number;
  taxPercent: number;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  currentVersionStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Sale value of one BOQ line — mirrors getRoomLineTotal for a manual line. */
export function boqLineTotal(line: {
  quantity: number;
  materialRate: number; laborRate: number; equipmentRate: number; expenseRate: number;
  wastePercent: number; discountPercent: number; profitPercent: number;
}): number {
  const quantity = Math.max(0, Number(line.quantity) || 0);
  const materialQuantity = quantity * (1 + Math.max(0, Number(line.wastePercent) || 0) / 100);
  const beforeAdjustments = round2(
    materialQuantity * Math.max(0, Number(line.materialRate) || 0)
    + quantity * Math.max(0, Number(line.laborRate) || 0)
    + quantity * Math.max(0, Number(line.equipmentRate) || 0)
    + quantity * Math.max(0, Number(line.expenseRate) || 0)
  );
  const saleBeforeDiscount = round2(beforeAdjustments * (1 + Math.max(0, Number(line.profitPercent) || 0) / 100));
  return round2(saleBeforeDiscount * (1 - Math.min(100, Math.max(0, Number(line.discountPercent) || 0)) / 100));
}

/**
 * General bill-of-quantities estimates (مقاييس أعمال عامة) for non-residential
 * work. Rows live in project_apartment_estimates with estimate_kind='BOQ' and
 * reuse the version/approval pipeline, so contracts, progress certificates,
 * executed-quantity tracking and certificate suggestions work unchanged.
 */
export class ProjectBoqService {
  private db = DatabaseManager.getInstance();
  private projects = new ProjectService();

  public getByProject(projectId: string): BoqEstimateSummary[] {
    if (!this.projects.getProjectById(projectId)) {
      throw new Error('المشروع غير موجود أو ليس لديك صلاحية الوصول إليه.');
    }
    return this.db.query<any>(
      `SELECT id, project_id AS projectId, name,
              total_amount / 100.0 AS totalAmount, terms,
              contingency_percent AS contingencyPercent, tax_percent AS taxPercent,
              created_at AS createdAt, updated_at AS updatedAt,
              (SELECT ev.id FROM project_apartment_estimate_versions ev WHERE ev.estimate_id = project_apartment_estimates.id ORDER BY ev.version_number DESC LIMIT 1) AS currentVersionId,
              (SELECT ev.version_number FROM project_apartment_estimate_versions ev WHERE ev.estimate_id = project_apartment_estimates.id ORDER BY ev.version_number DESC LIMIT 1) AS currentVersionNumber,
              (SELECT ev.status FROM project_apartment_estimate_versions ev WHERE ev.estimate_id = project_apartment_estimates.id ORDER BY ev.version_number DESC LIMIT 1) AS currentVersionStatus
       FROM project_apartment_estimates
       WHERE project_id = ? AND estimate_kind = 'BOQ'
       ORDER BY updated_at DESC, created_at DESC`,
      [projectId]
    );
  }

  /** Latest version snapshot of a BOQ estimate, for editing. */
  public getSnapshot(estimateId: string, projectId: string) {
    if (!this.projects.getProjectById(projectId)) throw new Error('المشروع غير موجود أو ليس لديك صلاحية الوصول إليه.');
    const row = this.db.query<{ id: string; snapshotJson: string }>(
      `SELECT v.id, v.snapshot_json AS snapshotJson
       FROM project_apartment_estimate_versions v
       JOIN project_apartment_estimates e ON e.id = v.estimate_id
       WHERE v.estimate_id = ? AND e.project_id = ? AND e.estimate_kind = 'BOQ'
       ORDER BY v.version_number DESC LIMIT 1`,
      [estimateId, projectId]
    )[0];
    if (!row) throw new Error('المقايسة غير موجودة.');
    return JSON.parse(row.snapshotJson) as ApartmentEstimateVersion['snapshot'];
  }

  public save(input: {
    id?: string;
    projectId: string;
    name: string;
    terms?: string;
    contingencyPercent?: number;
    taxPercent?: number;
    lines: BoqLineInput[];
    changeSummary?: string;
  }): { id: string; versionNumber: number; totalAmount: number } {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('projects');
    PermissionService.require(actor, 'ui.projects.list.update');
    const project = this.projects.getProjectById(input.projectId);
    if (!project) throw new Error('المشروع غير موجود أو ليس لديك صلاحية الوصول إليه.');
    if (!input.name.trim()) throw new Error('اسم المقايسة مطلوب.');
    if (!Array.isArray(input.lines) || !input.lines.length) throw new Error('أضف بندًا واحدًا على الأقل للمقايسة.');

    const costLines: EstimateLine[] = input.lines.map((line, index) => {
      const name = line.name?.trim();
      if (!name) throw new Error(`اسم البند ${index + 1} مطلوب.`);
      const quantity = Math.max(0, Number(line.quantity) || 0);
      return {
        id: line.id || `boq_${uuidv4().replace(/-/g, '').slice(0, 10)}`,
        category: line.category?.trim() || 'أعمال عامة',
        name,
        measure: 'manual',
        unit: line.unit?.trim() || 'وحدة',
        manualQuantity: quantity,
        materialProductId: '',
        materialRate: Number(line.materialRate) || 0,
        laborRate: Number(line.laborRate) || 0,
        equipmentRate: Number(line.equipmentRate) || 0,
        expenseRate: Number(line.expenseRate) || 0,
        wastePercent: Number(line.wastePercent) || 0,
        discountPercent: Number(line.discountPercent) || 0,
        profitPercent: Number(line.profitPercent) || 0,
      };
    });
    const lineQuantities = Object.fromEntries(costLines.map((line) => [line.id, line.manualQuantity]));
    const totalAmount = round2(costLines.reduce((sum, line) => sum + boqLineTotal({
      quantity: line.manualQuantity,
      materialRate: line.materialRate, laborRate: line.laborRate,
      equipmentRate: line.equipmentRate || 0, expenseRate: line.expenseRate || 0,
      wastePercent: line.wastePercent, discountPercent: line.discountPercent, profitPercent: line.profitPercent,
    }), 0));
    if (!Number.isFinite(totalAmount) || totalAmount < 0) throw new Error('إجمالي المقايسة غير صالح.');

    const id = input.id || `boqe_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    if (input.id) {
      const existing = this.db.query<{ id: string }>(
        `SELECT id FROM project_apartment_estimates WHERE id = ? AND project_id = ? AND estimate_kind = 'BOQ'`,
        [id, input.projectId]
      )[0];
      if (!existing) throw new Error('المقايسة غير موجودة ضمن هذا المشروع.');
    }

    const versionId = `boqv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const snapshot = JSON.stringify({
      id, projectId: input.projectId, name: input.name.trim(), areaM2: 0,
      totalAmount, terms: input.terms?.trim() || '',
      contingencyPercent: input.contingencyPercent || 0, taxPercent: input.taxPercent || 0,
      payments: [], rooms: [], costLines, lineQuantities, boq: true,
    });
    if (snapshot.length > 1_000_000) throw new Error('Estimate version exceeds the permitted size.');

    const versionNumber = this.db.executeTransaction((txDb) => {
      txDb.run(
        `INSERT INTO project_apartment_estimates
          (id, project_id, name, area_m2, total_amount, terms, contingency_percent, tax_percent,
           payments_json, rooms_json, cost_lines_json, estimate_kind, created_by, updated_by)
         VALUES (?, ?, ?, 0, ROUND(?*100), ?, ?, ?, '[]', '[]', ?, 'BOQ', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           total_amount = excluded.total_amount,
           terms = excluded.terms,
           contingency_percent = excluded.contingency_percent,
           tax_percent = excluded.tax_percent,
           cost_lines_json = excluded.cost_lines_json,
           updated_by = excluded.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
        [
          id, input.projectId, input.name.trim(), totalAmount, input.terms?.trim() || '',
          input.contingencyPercent || 0, input.taxPercent || 0, JSON.stringify(costLines), actor.id, actor.id,
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
        [versionId, id, input.projectId, nextNumber, snapshot,
         input.changeSummary?.trim() || 'Saved a new BOQ estimate version', actor.id, actor.fullName]
      );
      return nextNumber;
    });
    this.audit(actor.id, actor.fullName, input.id ? 'تحديث مقايَسة عامة' : 'حفظ مقايَسة عامة', id, {
      projectId: input.projectId, name: input.name.trim(), totalAmount, versionId, versionNumber, linesCount: costLines.length,
    });
    return { id, versionNumber, totalAmount };
  }

  private audit(userId: string, userName: string, action: string, recordId: string, values: object) {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values) VALUES (?, ?, ?, ?, 'PROJECTS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, userId, userName, action, recordId, JSON.stringify(values)]
    );
  }
}
