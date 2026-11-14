import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { ProjectService } from './ProjectService';
import type { ApartmentEstimateVersion } from '../../../types/projects/apartmentEstimate';

type EstimateRow = { id: string; projectId: string; versionId: string; versionNumber: number; status: string; snapshotJson: string };
export type ProjectExecutionSummary = {
  contractValue: number;
  plannedCost: number;
  actualCost: number;
  costVariance: number;
  certifiedAmount: number;
  paidAmount: number;
  remainingContract: number;
  completionPercent: number;
  schedule: Array<{ title: string; plannedAmount: number; actualAmount: number }>;
};

export class ProjectExecutionService {
  private db = DatabaseManager.getInstance();
  private projects = new ProjectService();

  public initializeFromApprovedEstimate(estimateId: string, projectId: string, versionId?: string) {
    this.requireWrite(projectId);
    const estimate = this.requireApprovedEstimate(estimateId, projectId, versionId);
    const existing = this.db.query<{ id: string }>(
      'SELECT id FROM project_estimate_execution_setups WHERE estimate_version_id = ?', [estimate.versionId]
    )[0];
    if (existing) return { created: false, taskCount: 0, budgetCount: 0 };
    const snapshot = JSON.parse(estimate.snapshotJson) as ApartmentEstimateVersion['snapshot'];
    const lines = snapshot.costLines || [];
    const grouped = new Map<string, { planned: number; lines: string[] }>();
    for (const line of lines) {
      const category = line.phase?.trim() || line.category?.trim() || 'أعمال عامة';
      const quantity = Number(snapshot.lineQuantities?.[line.id] ?? line.manualQuantity ?? 0) || 0;
      const material = quantity * (Number(line.materialRate) || 0) * (1 + (Number(line.wastePercent) || 0) / 100);
      const labor = quantity * (Number(line.laborRate) || 0);
      const equipment = quantity * (Number(line.equipmentRate) || 0);
      const expense = quantity * (Number(line.expenseRate) || 0);
      const key = category;
      const group = grouped.get(key) || { planned: 0, lines: [] };
      group.planned += material + labor + equipment + expense;
      group.lines.push(line.name);
      grouped.set(key, group);
    }
    const project = this.projects.getProjectById(projectId);
    if (!project) throw new Error('المشروع غير موجود أو لا تملك صلاحية الوصول إليه.');
    const groups = [...grouped.entries()];
    const start = project.startDate || new Date().toISOString().slice(0, 10);
    const end = project.expectedEndDate || start;
    const startTime = new Date(`${start}T00:00:00`).getTime();
    const endTime = Math.max(startTime, new Date(`${end}T00:00:00`).getTime());
    const tasks = this.projects.getTasks(projectId);
    const budgets = this.projects.getBudgetLines(projectId);
    const createdTasks = [];
    const createdBudgets = [];
    for (let index = 0; index < groups.length; index += 1) {
      const [title, group] = groups[index];
      const startDate = new Date(startTime + ((endTime - startTime) * index) / Math.max(groups.length, 1)).toISOString().slice(0, 10);
      const dueDate = new Date(startTime + ((endTime - startTime) * (index + 1)) / Math.max(groups.length, 1)).toISOString().slice(0, 10);
      if (!tasks.some((task) => task.title === title && task.description?.includes(`estimate-version:${estimate.versionId}`))) {
        createdTasks.push(this.projects.createTask({
          projectId, title, description: `بنود المرحلة: ${group.lines.join('، ')} | estimate-version:${estimate.versionId}`,
          startDate, dueDate, sortOrder: index,
        }));
      }
      if (!budgets.some((line) => line.category === title && line.notes?.includes(`estimate-version:${estimate.versionId}`))) {
        createdBudgets.push(this.projects.addBudgetLine({
          projectId, category: title, description: group.lines.join('، '), plannedAmount: Number(group.planned.toFixed(2)), actualAmount: 0,
          notes: `تكلفة الإصدار المعتمد ${estimate.versionNumber} | estimate-version:${estimate.versionId}`,
        }));
      }
    }
    const actor = AuthService.requireAuth();
    this.db.run(
      `INSERT INTO project_estimate_execution_setups (id, project_id, estimate_id, estimate_version_id, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [`pees_${uuidv4().replace(/-/g, '').slice(0, 12)}`, projectId, estimateId, estimate.versionId, actor.id]
    );
    this.audit('تهيئة تنفيذ المشروع من إصدار مقايَسة معتمد', estimate.versionId, { projectId, estimateId, taskCount: createdTasks.length, budgetCount: createdBudgets.length });
    return { created: true, taskCount: createdTasks.length, budgetCount: createdBudgets.length };
  }

  public createContract(input: { estimateId: string; projectId: string; versionId?: string; contractDate: string; terms?: string; quotationId?: string }) {
    const actor = this.requireWrite(input.projectId);
    const estimate = this.requireApprovedEstimate(input.estimateId, input.projectId, input.versionId);
    const snapshot = JSON.parse(estimate.snapshotJson) as ApartmentEstimateVersion['snapshot'];
    let amount = (Number(snapshot.totalAmount) || 0)
      * (1 + (Number(snapshot.contingencyPercent) || 0) / 100)
      * (1 + (Number(snapshot.taxPercent) || 0) / 100);
    if (!input.contractDate) throw new Error('تاريخ العقد مطلوب.');
    if (input.quotationId) {
      const link = this.db.query<{ id: string }>(
        `SELECT q.id FROM project_apartment_estimate_quotation_links l JOIN quotations q ON q.id = l.quotation_id
         WHERE l.quotation_id = ? AND l.estimate_id = ? AND l.version_id = ? AND q.project_id = ?`,
        [input.quotationId, input.estimateId, estimate.versionId, input.projectId]
      )[0];
      if (!link) throw new Error('عرض السعر غير مرتبط بهذا الإصدار المعتمد.');
      amount = Number(this.db.query<{ totalAmount: number }>('SELECT total_amount AS totalAmount FROM quotations WHERE id = ?', [input.quotationId])[0]?.totalAmount) || amount;
    }
    const contractId = `pec_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const contractNumber = this.db.nextNumber('PCN');
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO project_estimate_contracts
         (id, project_id, estimate_id, estimate_version_id, contract_number, contract_date, contract_value, terms, quotation_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [contractId, input.projectId, input.estimateId, estimate.versionId, contractNumber, input.contractDate, amount, input.terms?.trim() || null, input.quotationId || null, actor.id]
      );
      db.run('UPDATE projects SET contract_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, input.projectId]);
    });
    this.audit('إنشاء عقد من إصدار مقايسة معتمد', contractId, { projectId: input.projectId, estimateId: input.estimateId, versionId: estimate.versionId, contractNumber, amount });
    return { id: contractId, contractNumber, contractValue: amount };
  }

  public getContracts(projectId: string) {
    this.requireView(projectId);
    return this.db.query<any>(
      `SELECT c.*, v.version_number AS versionNumber, q.quotation_number AS quotationNumber
       FROM project_estimate_contracts c JOIN project_apartment_estimate_versions v ON v.id = c.estimate_version_id
       LEFT JOIN quotations q ON q.id = c.quotation_id WHERE c.project_id = ? ORDER BY c.created_at DESC`, [projectId]
    );
  }

  public updateContractStatus(contractId: string, status: 'SIGNED' | 'CANCELLED') {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.approve');
    const contract = this.db.query<any>('SELECT * FROM project_estimate_contracts WHERE id = ?', [contractId])[0];
    if (!contract) throw new Error('العقد غير موجود.');
    if (!this.projects.getProjectById(contract.project_id)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
    this.db.run(`UPDATE project_estimate_contracts SET status = ?, signed_at = CASE WHEN ? = 'SIGNED' THEN CURRENT_TIMESTAMP ELSE signed_at END WHERE id = ?`, [status, status, contractId]);
    this.audit(status === 'SIGNED' ? 'اعتماد توقيع عقد المشروع' : 'إلغاء عقد المشروع', contractId, { projectId: contract.project_id, status });
  }

  public getCertificates(projectId: string) {
    this.requireView(projectId);
    return this.db.query<any>(
      `SELECT c.*, v.version_number AS versionNumber FROM project_payment_certificates c
       JOIN project_apartment_estimate_versions v ON v.id = c.estimate_version_id
       WHERE c.project_id = ? ORDER BY c.certificate_date DESC, c.created_at DESC`, [projectId]
    );
  }

  public createCertificate(input: { projectId: string; estimateId: string; versionId?: string; contractId?: string; date: string; periodStart?: string; periodEnd?: string; description: string; progressPercent: number; amount: number }) {
    const actor = this.requireWrite(input.projectId);
    const estimate = this.requireApprovedEstimate(input.estimateId, input.projectId, input.versionId);
    if (!input.description.trim() || !input.date) throw new Error('وصف المستخلص وتاريخه مطلوبان.');
    if (!Number.isFinite(input.progressPercent) || input.progressPercent < 0 || input.progressPercent > 100) throw new Error('نسبة الإنجاز يجب أن تكون بين 0 و100.');
    if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error('قيمة المستخلص غير صالحة.');
    if (input.contractId) {
      const contract = this.db.query<any>('SELECT id, estimate_version_id, status FROM project_estimate_contracts WHERE id = ? AND project_id = ?', [input.contractId, input.projectId])[0];
      if (!contract || contract.estimate_version_id !== estimate.versionId || contract.status === 'CANCELLED') throw new Error('العقد لا يتوافق مع إصدار المقايسة المعتمد.');
    }
    const contractValue = this.db.query<{ amount: number }>(
      `SELECT contract_value AS amount FROM project_estimate_contracts WHERE project_id = ? AND status <> 'CANCELLED'`,
      [input.projectId]
    ).reduce((sum, contract) => sum + (Number(contract.amount) || 0), 0);
    const approvedCertificates = this.db.query<{ amount: number }>(
      `SELECT COALESCE(SUM(approved_amount), 0) AS amount FROM project_payment_certificates WHERE project_id = ? AND status IN ('APPROVED','PAID')`,
      [input.projectId]
    )[0]?.amount || 0;
    if (Number(approvedCertificates) + input.amount > contractValue + 0.005) throw new Error('قيمة المستخلص تتجاوز الرصيد المتبقي من العقود المعتمدة.');
    const id = `ppc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const number = this.db.nextNumber('PPC');
    this.db.run(
      `INSERT INTO project_payment_certificates
       (id, project_id, estimate_id, estimate_version_id, contract_id, certificate_number, certificate_date, period_start, period_end, description, progress_percent, requested_amount, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.projectId, input.estimateId, estimate.versionId, input.contractId || null, number, input.date, input.periodStart || null, input.periodEnd || null, input.description.trim(), input.progressPercent, input.amount, actor.id]
    );
    this.audit('إنشاء مستخلص مشروع', id, { projectId: input.projectId, estimateId: input.estimateId, versionId: estimate.versionId, amount: input.amount });
    return { id, certificateNumber: number };
  }

  public submitCertificate(id: string) {
    const actor = this.requireWriteForRecord('project_payment_certificates', id);
    const row = this.db.query<any>('SELECT status FROM project_payment_certificates WHERE id = ?', [id])[0];
    if (!row || !['DRAFT', 'RETURNED'].includes(row.status)) throw new Error('يمكن إرسال المستخلصات المسودة أو المعادة فقط.');
    this.db.run(`UPDATE project_payment_certificates SET status = 'SUBMITTED', review_notes = NULL WHERE id = ?`, [id]);
    this.audit('إرسال مستخلص للمراجعة', id, { actorId: actor.id });
  }

  public reviewCertificate(id: string, decision: 'APPROVED' | 'RETURNED', notes = '') {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.approve');
    const row = this.db.query<any>('SELECT * FROM project_payment_certificates WHERE id = ?', [id])[0];
    if (!row) throw new Error('المستخلص غير موجود.');
    if (!this.projects.getProjectById(row.project_id)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
    if (row.status !== 'SUBMITTED') throw new Error('المستخلص يجب أن يكون مرسلًا للمراجعة.');
    if (row.created_by === actor.id) throw new Error('يجب أن يراجع المستخلص مستخدم مخول غير منشئه.');
    if (decision === 'RETURNED' && !notes.trim()) throw new Error('أضف ملاحظة عند إعادة المستخلص.');
    this.db.run(
      `UPDATE project_payment_certificates SET status = ?, approved_amount = ?, review_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [decision, decision === 'APPROVED' ? Number(row.requested_amount) : null, notes.trim() || null, actor.id, id]
    );
    this.audit(decision === 'APPROVED' ? 'اعتماد مستخلص مشروع' : 'إعادة مستخلص للمراجعة', id, { projectId: row.project_id, notes: notes.trim() || null });
  }

  public recordCertificatePayment(id: string, amount: number, reference = '') {
    const _actor = this.requireWriteForRecord('project_payment_certificates', id);
    const row = this.db.query<any>('SELECT * FROM project_payment_certificates WHERE id = ?', [id])[0];
    if (!row || !['APPROVED', 'PAID'].includes(row.status)) throw new Error('لا يمكن تسجيل دفعة لمستخلص غير معتمد.');
    if (!Number.isFinite(amount) || amount <= 0 || Number(row.paid_amount) + amount > Number(row.approved_amount) + 0.005) throw new Error('قيمة الدفعة تتجاوز الرصيد المعتمد أو غير صالحة.');
    const paid = Number(row.paid_amount) + amount;
    this.db.run(
      `UPDATE project_payment_certificates SET paid_amount = ?, payment_reference = ?, paid_at = CURRENT_TIMESTAMP,
       status = CASE WHEN ? + 0.005 >= approved_amount THEN 'PAID' ELSE 'APPROVED' END WHERE id = ?`,
      [Number(paid.toFixed(2)), reference.trim() || null, paid, id]
    );
    this.audit('تسجيل دفعة مستخلص', id, { projectId: row.project_id, amount, totalPaid: paid, reference: reference.trim() || null });
    return { paidAmount: Number(paid.toFixed(2)), remaining: Number((Number(row.approved_amount) - paid).toFixed(2)) };
  }

  public getActualCosts(projectId: string) {
    this.requireView(projectId);
    return this.db.query<any>(
      `SELECT c.*, v.version_number AS versionNumber FROM project_actual_cost_entries c
       LEFT JOIN project_apartment_estimate_versions v ON v.id = c.estimate_version_id
       WHERE c.project_id = ? ORDER BY c.cost_date DESC, c.created_at DESC`, [projectId]
    );
  }

  public addActualCost(input: { projectId: string; versionId?: string; budgetLineId?: string; date: string; category: string; description: string; amount: number; sourceType?: 'MANUAL' | 'PURCHASE' | 'LABOR' | 'OTHER'; referenceId?: string }) {
    const actor = this.requireWrite(input.projectId);
    if (!input.date || !input.category.trim() || !input.description.trim()) throw new Error('التاريخ والتصنيف والوصف مطلوبة للتكلفة الفعلية.');
    if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error('قيمة التكلفة غير صالحة.');
    if (input.versionId) {
      const approved = this.db.query<{ estimateId: string }>(
        `SELECT id AS estimateId FROM project_apartment_estimate_versions WHERE id = ? AND project_id = ? AND status = 'APPROVED'`,
        [input.versionId, input.projectId]
      )[0];
      if (!approved) throw new Error('إصدار المقايسة غير معتمد لهذا المشروع.');
      this.requireApprovedEstimate(approved.estimateId, input.projectId, input.versionId);
    }
    if (input.budgetLineId && !this.db.query('SELECT id FROM project_budget_lines WHERE id = ? AND project_id = ?', [input.budgetLineId, input.projectId]).length) throw new Error('بند الميزانية لا يتبع المشروع.');
    const id = `pac_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO project_actual_cost_entries (id, project_id, estimate_version_id, budget_line_id, cost_date, category, description, amount, source_type, reference_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.projectId, input.versionId || null, input.budgetLineId || null, input.date, input.category.trim(), input.description.trim(), input.amount, input.sourceType || 'MANUAL', input.referenceId?.trim() || null, actor.id]
    );
    this.audit('تسجيل تكلفة فعلية للمشروع', id, { projectId: input.projectId, amount: input.amount, sourceType: input.sourceType || 'MANUAL' });
    return { id };
  }

  public getSummary(projectId: string): ProjectExecutionSummary {
    this.requireView(projectId);
    const budget = this.projects.getBudgetLines(projectId);
    const costs = this.db.query<{ category: string; amount: number }>(`SELECT category, SUM(amount) AS amount FROM project_actual_cost_entries WHERE project_id = ? GROUP BY category`, [projectId]);
    const costByCategory = new Map(costs.map((row) => [row.category, Number(row.amount) || 0]));
    const certs = this.db.query<{ approved: number; paid: number }>(
      `SELECT COALESCE(SUM(CASE WHEN status IN ('APPROVED','PAID') THEN approved_amount ELSE 0 END),0) AS approved,
              COALESCE(SUM(paid_amount),0) AS paid FROM project_payment_certificates WHERE project_id = ?`, [projectId]
    )[0];
    const project = this.projects.getProjectById(projectId);
    const plannedCost = budget.reduce((sum, item) => sum + Number(item.plannedAmount || 0), 0);
    const actualCost = costs.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const completion = budget.reduce((sum, item) => {
      const actual = costByCategory.get(item.category) || 0;
      return sum + Number(item.plannedAmount || 0) * Math.min(1, actual / Math.max(Number(item.plannedAmount) || 1, 1));
    }, 0);
    const categories = new Set([...budget.map((item) => item.category), ...costByCategory.keys()]);
    return {
      contractValue: Number(project?.contractValue) || 0,
      plannedCost, actualCost, costVariance: plannedCost - actualCost,
      certifiedAmount: Number(certs?.approved) || 0, paidAmount: Number(certs?.paid) || 0,
      remainingContract: (Number(project?.contractValue) || 0) - actualCost,
      completionPercent: plannedCost ? Math.min(100, (completion / plannedCost) * 100) : 0,
      schedule: [...categories].map((category) => ({ title: category, plannedAmount: budget.filter((line) => line.category === category).reduce((sum, line) => sum + Number(line.plannedAmount || 0), 0), actualAmount: costByCategory.get(category) || 0 })),
    };
  }

  private requireApprovedEstimate(estimateId: string, projectId: string, versionId?: string): EstimateRow {
    this.requireView(projectId);
    const row = this.db.query<EstimateRow>(
      `SELECT e.id, e.project_id AS projectId, v.id AS versionId, v.version_number AS versionNumber, v.status, v.snapshot_json AS snapshotJson
       FROM project_apartment_estimate_versions v JOIN project_apartment_estimates e ON e.id = v.estimate_id
       WHERE e.id = ? AND e.project_id = ? AND v.id = COALESCE(?, (SELECT id FROM project_apartment_estimate_versions WHERE estimate_id = e.id ORDER BY version_number DESC LIMIT 1))`,
      [estimateId, projectId, versionId || null]
    )[0];
    if (!row || row.status !== 'APPROVED') throw new Error('يلزم اختيار إصدار معتمد من المقايسة لهذا المشروع.');
    const latest = this.db.query<{ id: string }>('SELECT id FROM project_apartment_estimate_versions WHERE estimate_id = ? ORDER BY version_number DESC LIMIT 1', [estimateId])[0];
    if (latest?.id !== row.versionId) throw new Error('يوجد إصدار أحدث؛ اعتمده قبل متابعة دورة المشروع.');
    return row;
  }

  private requireWrite(projectId: string) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.update');
    if (!this.projects.getProjectById(projectId)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
    return actor;
  }
  private requireView(projectId: string) {
    if (!this.projects.getProjectById(projectId)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
  }
  private requireWriteForRecord(table: 'project_payment_certificates', id: string) {
    const row = this.db.query<{ project_id: string }>(`SELECT project_id FROM ${table} WHERE id = ?`, [id])[0];
    if (!row) throw new Error('السجل غير موجود.');
    return this.requireWrite(row.project_id);
  }
  private audit(action: string, recordId: string, values: object) {
    const actor = AuthService.requireAuth();
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values) VALUES (?, ?, ?, ?, 'PROJECTS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId, JSON.stringify(values)]
    );
  }
}
