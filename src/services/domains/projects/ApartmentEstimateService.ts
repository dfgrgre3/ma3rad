import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { ProjectService } from './ProjectService';
import type { ApartmentEstimate, SaveApartmentEstimateInput } from '../../../types/projects/apartmentEstimate';
import type { EstimateLine, EstimateRoom } from '../../../types/projects/estimateMeasurement';

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
      roomsJson: string;
      costLinesJson: string;
      quotationId: string | null;
      createdAt: string;
      updatedAt: string;
    }>(
      `SELECT id, project_id AS projectId, name, area_m2 AS areaM2,
              total_amount AS totalAmount, rooms_json AS roomsJson,
              cost_lines_json AS costLinesJson, quotation_id AS quotationId,
              created_at AS createdAt, updated_at AS updatedAt
       FROM project_apartment_estimates
       WHERE project_id = ? ORDER BY updated_at DESC, created_at DESC`,
      [projectId]
    ).map((row) => ({
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      areaM2: Number(row.areaM2),
      totalAmount: Number(row.totalAmount),
      rooms: this.parseJson<EstimateRoom[]>(row.roomsJson, 'الغرف'),
      costLines: this.parseJson<EstimateLine[]>(row.costLinesJson, 'بنود المقايسة'),
      quotationId: row.quotationId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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

    const roomsJson = JSON.stringify(input.rooms);
    const costLinesJson = JSON.stringify(input.costLines);
    if (roomsJson.length > 500_000 || costLinesJson.length > 500_000) {
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

    this.db.run(
      `INSERT INTO project_apartment_estimates
        (id, project_id, name, area_m2, total_amount, rooms_json, cost_lines_json, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         area_m2 = excluded.area_m2,
         total_amount = excluded.total_amount,
         rooms_json = excluded.rooms_json,
         cost_lines_json = excluded.cost_lines_json,
         quotation_id = NULL,
         updated_by = excluded.updated_by,
         updated_at = CURRENT_TIMESTAMP`,
      [
        id, input.projectId, input.name.trim(), input.areaM2, input.totalAmount,
        roomsJson, costLinesJson, actor.id, actor.id,
      ]
    );
    this.audit(actor.id, actor.fullName, input.id ? 'تحديث تصميم شقة ومقايسة' : 'حفظ تصميم شقة ومقايسة', id, {
      projectId: input.projectId,
      name: input.name.trim(),
      areaM2: input.areaM2,
      totalAmount: input.totalAmount,
    });
    const saved = this.getByProject(input.projectId).find((estimate) => estimate.id === id);
    if (!saved) throw new Error('تعذر استرجاع تصميم الشقة بعد حفظه.');
    return saved;
  }

  public linkQuotation(estimateId: string, projectId: string, quotationId: string): void {
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
    this.db.run(
      `UPDATE project_apartment_estimates
       SET quotation_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND project_id = ?`,
      [quotationId, actor.id, estimateId, projectId]
    );
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
