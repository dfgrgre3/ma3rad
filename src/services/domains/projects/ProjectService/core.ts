import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { BranchAccessService } from '../../auth/BranchAccessService';
import { ModuleRegistryService } from '../../config/ModuleRegistryService';
import { unscaleMoneyRow } from '../../../../utils/money';
import { PROJECT_MONEY_FIELDS, type Project } from './types';

/**
 * Shared infrastructure for ProjectService: database handle, branch scoping,
 * permission guards and audit logging. All domain layers extend this class.
 */
export abstract class ProjectServiceCore {
  protected db = DatabaseManager.getInstance();
  protected branchAccess = new BranchAccessService();

  protected scopedProject(id: string): Project | null {
    const actor = AuthService.requireAuth();
    const scope = this.branchAccess.sqlScope('p.branch_id', undefined, actor);
    const rows = this.db.query<Project>(
      `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id) AS units_count,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id AND u.status = 'DELIVERED') AS delivered_units,
        (SELECT COALESCE(SUM(si.total_amount), 0) / 100.0 FROM sales_invoices si WHERE si.project_id = p.id AND si.invoice_status != 'VOID') AS invoiced_amount
       FROM projects p JOIN customers c ON c.id = p.customer_id
       WHERE p.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    );
    if (rows.length === 0) return null;
    const project = unscaleMoneyRow(rows[0], PROJECT_MONEY_FIELDS);
    return { ...project, progress: this.computeProgress(project) };
  }

  protected requireProject(id: string): Project {
    const project = this.scopedProject(id);
    if (!project) throw new Error('المشروع غير موجود أو ليس لديك صلاحية الوصول إليه.');
    return project;
  }

  protected requireWrite(permission: 'ui.projects.list.create' | 'ui.projects.list.update' | 'ui.projects.list.delete'): void {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('projects');
    PermissionService.require(actor, permission);
  }

  protected requireApprove(): void {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('projects');
    PermissionService.require(actor, 'ui.projects.list.approve');
  }

  protected audit(action: string, recordId: string, values?: unknown): void {
    const actor = AuthService.requireAuth();
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'PROJECTS', ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId,
        values === undefined ? null : JSON.stringify(values),
      ]
    );
  }

  protected computeProgress(p: Project): number {
    if (p.status === 'COMPLETED') return 100;
    if (p.status === 'CANCELLED') return 0;
    if (p.unitsCount && p.unitsCount > 0) {
      return Math.round(((p.deliveredUnits || 0) / p.unitsCount) * 100);
    }
    return p.status === 'ACTIVE' ? 25 : p.status === 'ON_HOLD' ? 15 : 0;
  }
}
