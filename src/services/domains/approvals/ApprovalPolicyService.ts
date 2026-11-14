import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';

export type ApprovalPolicyMode = 'DIRECT' | 'APPROVAL' | 'DISABLED';

export interface ApprovalPolicy {
  operationCode: string;
  mode: ApprovalPolicyMode;
  executorRoles: string[];
  approverRoles: string[];
  minApprovals: number;
  allowSelfApproval: boolean;
  maxValue: number | null;
  expiresAfterHours: number | null;
  approvalMode: 'SINGLE' | 'MULTI';
  scopeType: 'BRANCH' | 'WAREHOUSE' | 'GLOBAL';
  updatedAt: string;
}

export interface ApprovalOperationDefinition {
  code: string;
  label: string;
  category: string;
  permission: string;
  integrated: boolean;
}

// Policies are available for the major operations in the application. `integrated`
// marks the operations whose service currently pauses and applies the business effect.
export const APPROVAL_OPERATIONS: ApprovalOperationDefinition[] = [
  { code: 'inventory.adjustment.create', label: 'إضافة أو تسوية المخزون', category: 'المخزون والمستودعات', permission: 'inventory.adjust', integrated: true },
  { code: 'inventory.transfer.create', label: 'نقل المخزون بين المستودعات', category: 'المخزون والمستودعات', permission: 'inventory.transfer', integrated: false },
  { code: 'inventory.count.post', label: 'ترحيل الجرد', category: 'المخزون والمستودعات', permission: 'inventory.count', integrated: false },
  { code: 'inventory.return.create', label: 'إرجاع المنتجات للمخزون', category: 'المخزون والمستودعات', permission: 'inventory.adjust', integrated: false },
  { code: 'products.create', label: 'إضافة منتج', category: 'المنتجات', permission: 'ui.products.catalog.create', integrated: false },
  { code: 'products.update', label: 'تعديل بيانات المنتج والأسعار', category: 'المنتجات', permission: 'ui.products.catalog.update', integrated: false },
  { code: 'products.delete', label: 'حذف منتج', category: 'المنتجات', permission: 'ui.products.catalog.delete', integrated: false },
  { code: 'sales.invoice.create', label: 'إنشاء فاتورة وخصم استثنائي', category: 'المبيعات', permission: 'ui.sales.invoices.create', integrated: false },
  { code: 'sales.invoice.update', label: 'تعديل فاتورة', category: 'المبيعات', permission: 'ui.sales.invoices.update', integrated: false },
  { code: 'sales.invoice.cancel', label: 'إلغاء فاتورة', category: 'المبيعات', permission: 'ui.sales.invoices.delete', integrated: false },
  { code: 'sales.return.create', label: 'مرتجع أو استرداد أموال', category: 'المبيعات', permission: 'ui.sales.returns.create', integrated: false },
  { code: 'purchases.request.create', label: 'إنشاء طلب شراء', category: 'المشتريات', permission: 'ui.purchases.requests.create', integrated: false },
  { code: 'purchases.order.create', label: 'إنشاء أمر شراء', category: 'المشتريات', permission: 'ui.purchases.orders.create', integrated: false },
  { code: 'purchases.receive', label: 'استلام بضاعة', category: 'المشتريات', permission: 'ui.purchases.orders.create', integrated: false },
  { code: 'purchases.invoice.create', label: 'إنشاء فاتورة شراء', category: 'المشتريات', permission: 'ui.purchases.invoices.create', integrated: false },
  { code: 'purchases.return.create', label: 'مرتجع مورد', category: 'المشتريات', permission: 'ui.purchases.returns.return', integrated: false },
  { code: 'finance.expense.create', label: 'إضافة مصروف', category: 'الحسابات والخزينة', permission: 'ui.cashier.expenses.expense', integrated: false },
  { code: 'finance.income.create', label: 'إضافة إيراد أو صرف أموال', category: 'الحسابات والخزينة', permission: 'finance.approve', integrated: false },
  { code: 'finance.transfer.create', label: 'تحويل أموال أو تعديل أرصدة', category: 'الحسابات والخزينة', permission: 'finance.approve', integrated: false },
  { code: 'finance.journal.delete', label: 'حذف قيد مالي', category: 'الحسابات والخزينة', permission: 'finance.journal.post', integrated: false },
  { code: 'users.create', label: 'إنشاء مستخدم', category: 'المستخدمون والإدارة', permission: 'ui.users.users.create', integrated: false },
  { code: 'users.update', label: 'تعديل مستخدم أو دور', category: 'المستخدمون والإدارة', permission: 'ui.users.users.update', integrated: false },
  { code: 'users.delete', label: 'حذف مستخدم', category: 'المستخدمون والإدارة', permission: 'ui.users.users.delete', integrated: false },
  { code: 'branches.manage', label: 'إدارة الفروع', category: 'المستخدمون والإدارة', permission: 'ui.branches.branches.manage', integrated: false },
];

const OPERATION_CODES = new Set(APPROVAL_OPERATIONS.map(({ code }) => code));

export class ApprovalPolicyService {
  private readonly db = DatabaseManager.getInstance();

  getPolicies(): ApprovalPolicy[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'approvals.settings.manage');
    return this.db.query<any>('SELECT * FROM approval_policies ORDER BY operation_code').map((row) => this.mapPolicy(row));
  }

  getPolicy(operationCode: string): ApprovalPolicy {
    const row = this.db.query<any>('SELECT * FROM approval_policies WHERE operation_code = ?', [operationCode])[0];
    return row ? this.mapPolicy(row) : {
      operationCode, mode: operationCode === 'inventory.adjustment.create' ? 'APPROVAL' : 'DIRECT', executorRoles: [], approverRoles: [], minApprovals: 1,
      allowSelfApproval: false, maxValue: null, expiresAfterHours: null, updatedAt: '',
      approvalMode: 'SINGLE', scopeType: 'BRANCH',
    };
  }

  assertCanExecute(operationCode: string, actor: ReturnType<typeof AuthService.requireAuth>): ApprovalPolicy {
    const definition = APPROVAL_OPERATIONS.find((operation) => operation.code === operationCode);
    if (!definition) throw new Error('Unknown approval operation.');
    PermissionService.require(actor, definition.permission);
    const policy = this.getPolicy(operationCode);
    if (actor.role === 'ADMIN') return policy;
    if (policy.mode === 'DISABLED') throw new Error('تم تعطيل هذه العملية بواسطة سياسة الموافقات.');
    if (policy.executorRoles.length && !policy.executorRoles.includes(actor.role)) throw new Error('دور المستخدم غير مخول بتنفيذ هذه العملية.');
    if (policy.mode === 'APPROVAL') PermissionService.require(actor, 'approvals.create');
    return policy;
  }

  isOperation(operationCode: string): boolean {
    return OPERATION_CODES.has(operationCode);
  }

  setPolicy(input: Omit<ApprovalPolicy, 'updatedAt' | 'approvalMode' | 'scopeType'> & Partial<Pick<ApprovalPolicy, 'approvalMode' | 'scopeType'>>): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'approvals.settings.manage');
    if (!OPERATION_CODES.has(input.operationCode)) throw new Error('Unknown approval operation.');
    if (!['DIRECT', 'APPROVAL', 'DISABLED'].includes(input.mode)) throw new Error('Invalid approval mode.');
    const minApprovals = Math.floor(Number(input.minApprovals));
    if (!Number.isFinite(minApprovals) || minApprovals < 1 || minApprovals > 10) throw new Error('Minimum approvals must be between 1 and 10.');
    const maxValue = input.maxValue == null ? null : Number(input.maxValue);
    if (maxValue !== null && (!Number.isFinite(maxValue) || maxValue < 0)) throw new Error('Invalid approval threshold.');
    const expiresAfterHours = input.expiresAfterHours == null ? null : Math.floor(Number(input.expiresAfterHours));
    if (expiresAfterHours !== null && (!Number.isFinite(expiresAfterHours) || expiresAfterHours < 1 || expiresAfterHours > 8760)) throw new Error('Approval expiry must be between 1 and 8760 hours.');
    const roles = this.db.query<{ code: string }>('SELECT code FROM roles').map((row) => row.code);
    const validateRoles = (values: string[]) => {
      if (!Array.isArray(values) || values.some((role) => !roles.includes(role))) throw new Error('Unknown role in approval policy.');
      return [...new Set(values)];
    };
    this.db.run(`
      INSERT INTO approval_policies (
        operation_code, mode, executor_roles, approver_roles, min_approvals,
        allow_self_approval, max_value, expires_after_hours, approval_mode, scope_type, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(operation_code) DO UPDATE SET mode = excluded.mode,
        executor_roles = excluded.executor_roles, approver_roles = excluded.approver_roles,
        min_approvals = excluded.min_approvals, allow_self_approval = excluded.allow_self_approval,
        max_value = excluded.max_value, expires_after_hours = excluded.expires_after_hours,
        approval_mode = excluded.approval_mode, scope_type = excluded.scope_type,
        updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
    `, [input.operationCode, input.mode, JSON.stringify(validateRoles(input.executorRoles)), JSON.stringify(validateRoles(input.approverRoles)),
      minApprovals, input.allowSelfApproval ? 1 : 0, maxValue, expiresAfterHours,
      input.approvalMode === 'MULTI' ? 'MULTI' : 'SINGLE', ['BRANCH', 'WAREHOUSE', 'GLOBAL'].includes(input.scopeType || '') ? input.scopeType : 'BRANCH', actor.id]);
  }

  private mapPolicy(row: any): ApprovalPolicy {
    const parseRoles = (value: string): string[] => {
      try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.filter((role) => typeof role === 'string') : []; }
      catch { return []; }
    };
    return {
      operationCode: row.operationCode, mode: row.mode, executorRoles: parseRoles(row.executorRoles), approverRoles: parseRoles(row.approverRoles),
      minApprovals: Number(row.minApprovals) || 1, allowSelfApproval: Boolean(row.allowSelfApproval),
      approvalMode: row.approvalMode === 'MULTI' ? 'MULTI' : 'SINGLE', scopeType: ['BRANCH','WAREHOUSE','GLOBAL'].includes(row.scopeType) ? row.scopeType : 'BRANCH',
      maxValue: row.maxValue == null ? null : Number(row.maxValue), expiresAfterHours: row.expiresAfterHours == null ? null : Number(row.expiresAfterHours),
      updatedAt: row.updatedAt,
    };
  }
}

