import type { User } from '../../../../types';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { CentralFeaturePermissionService } from '../../licensing/CentralFeaturePermissionService';
import { getCachedPermissionLimits } from '../../licensing/centralConfigStore';
import { PermissionChecker } from '../permissions/permissionChecker';
import { PERMISSIONS } from '../permissions/catalog';
import type { PermissionDef } from '../permissions/types';
import { screenRequirementFor } from '../../../../config/screenRegistry';

/**
 * محرك الصلاحيات الموحد (المرحلة 1 من توحيد الصلاحيات).
 *
 * يقيّم (user, permissionCode, context) على ستة أبعاد مرتبة:
 *   central → screen → grant → scope → amount → sensitivity
 * ويعيد Decision بسبب الرفض والبُعد المرفوض بدل boolean، حتى تستطيع الواجهة
 * تفسير الرفض («تجاوز حد الصلاحية») وتكتب audit دقيقة.
 *
 * PermissionChecker.can/require تبقى الواجهة العامة وتفوّض إليه — كل الاستدعاءات
 * الحالية (~مئات المواضع) تستفيد من الأبعاد الجديدة دون تغيير توقيع.
 */

export type AuthDimension = 'central' | 'screen' | 'scope' | 'grant' | 'amount' | 'sensitivity';

export interface AuthContext {
  /** مسار الصفحة الحالي — يُستخدم للقيود المركزية ولكود الشاشة لاحقاً. */
  path?: string;
  /** مفتاح التبويب داخل الشاشة (المرحلة 2). */
  tab?: string;
  branchId?: string;
  warehouseId?: string;
  /** مخازن إضافية تُقيَّم كلها ضد user_warehouse_grants (مثل تحويل بين مخزنين). */
  warehouseIds?: string[];
  /** قيمة العملية المالية — تُقارن بحدود permission_amount_limits. */
  amount?: number;
  currency?: string;
  /** كود العملية التي يُقيَّم عليها حد المبلغ (قد يختلف عن كود الصلاحية). */
  operation?: string;
}

export type Decision =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
      requiredCode: string;
      dimension?: AuthDimension;
      /** true عندما تجاوز المبلغ الحد لكن السياسة تتطلب موافقة لا/refuse. */
      requiresApproval?: boolean;
      /** معرف طلب الاعتماد المنشأ عند requiresApproval (إن وُجد). */
      approvalRequestId?: string;
    };

const deny = (
  reason: string,
  requiredCode: string,
  dimension?: AuthDimension,
  requiresApproval?: boolean,
  approvalRequestId?: string
): Decision => ({ allowed: false, reason, requiredCode, dimension, requiresApproval, approvalRequestId });

const SENSITIVITY_VIEW_CODES: Record<string, string> = {
  COST: 'finance.cost.view',
  PROFIT: 'finance.profit.view',
};

/** خريطة الكود → تعريف الصلاحية (أساسية + دقيقة) لقراءة أعلام sensitivity. */
const SENSITIVITY_BY_CODE: ReadonlyMap<string, PermissionDef['sensitivity']> = (() => {
  const map = new Map<string, PermissionDef['sensitivity']>();
  for (const permission of PERMISSIONS) {
    if (permission.sensitivity) map.set(permission.code, permission.sensitivity);
  }
  return map;
})();

interface AmountLimitRow {
  max_amount: number;
  currency?: string;
  on_exceed: string;
  scope_type: string;
  scope_id: string;
}

type ScopeMode = 'ALL' | 'LIMITED' | 'DENIED' | 'UNRESOLVED';

interface ScopeResolution {
  branchMode: ScopeMode;
  /** grants فارغة = بدون قائمة بيضاء مخازن (تُقيَّم عبر الفرع). */
  warehouseMode: 'RESOLVED' | 'UNRESOLVED';
  branches: Set<string>;
  warehouses: Set<string>;
}

export class AuthorizationService {
  /** أبعاد Scope المخبأة لكل مستخدم — تُبطل مع PermissionChecker.invalidate. */
  private static scopeCache = new Map<string, ScopeResolution>();

  public static invalidate(userId?: string): void {
    if (userId) AuthorizationService.scopeCache.delete(userId);
    else AuthorizationService.scopeCache.clear();
  }

  /**
   * يحسم نطاق الفروع/المخازن بشكل صريح — لا يوجد «فارغ = مسموح» ناتج عن
   * فشل استعلام. الدلالة مطابقة لـ BranchAccessService:
   *   ADMIN/SUPER_ADMIN             → ALL
   *   users.branch_scope='ALL'      → ALL بشرط صلاحية branches.access_all
   *   users.branch_scope='ASSIGNED' → LIMITED على users_branches
   *   غياب الصف/فشل الاستعلام       → UNRESOLVED (رفض في checkScope)
   * user_warehouse_grants: قائمة بيضاء عند عدم فراغها؛ الفراغ يعني
   * التقييم عبر فرع المخزن (وليس سماحًا مطلقًا).
   */
  private static scopeResolution(user: User): ScopeResolution {
    const cached = AuthorizationService.scopeCache.get(user.id);
    if (cached) return cached;

    const db = DatabaseManager.getInstance();
    const resolution: ScopeResolution = {
      branchMode: 'UNRESOLVED',
      warehouseMode: 'UNRESOLVED',
      branches: new Set<string>(),
      warehouses: new Set<string>(),
    };

    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      resolution.branchMode = 'ALL';
    } else {
      let branchScope: string | null = null;
      let scopeRowFound = false;
      try {
        const row = db.query<{ branchScope: string }>(
          'SELECT branch_scope AS branchScope FROM users WHERE id = ? AND is_active = 1',
          [user.id]
        )[0];
        scopeRowFound = Boolean(row);
        branchScope = row?.branchScope ?? null;
      } catch {
        // عمود/جدول غير متاح — يبقى UNRESOLVED.
      }
      if (branchScope === 'ALL') {
        resolution.branchMode = PermissionChecker.hasRoleGrant(user, 'branches.access_all')
          ? 'ALL'
          : 'DENIED';
      } else if (scopeRowFound && branchScope === 'ASSIGNED') {
        try {
          resolution.branches = new Set(
            db
              .query<{ branch_id: string }>('SELECT branch_id FROM users_branches WHERE user_id = ?', [user.id])
              .map((row) => row.branch_id)
          );
          resolution.branchMode = 'LIMITED';
        } catch {
          resolution.branchMode = 'UNRESOLVED';
        }
      }
      // غياب الصف أو قيمة branch_scope غير معروفة → UNRESOLVED (رفض).
    }

    try {
      resolution.warehouses = new Set(
        db
          .query<{ warehouse_id: string }>('SELECT warehouse_id FROM user_warehouse_grants WHERE user_id = ?', [
            user.id,
          ])
          .map((row) => row.warehouse_id)
      );
      resolution.warehouseMode = 'RESOLVED';
    } catch {
      resolution.warehouseMode = 'UNRESOLVED';
    }

    AuthorizationService.scopeCache.set(user.id, resolution);
    return resolution;
  }

  /**
   * *_scope: ALL = وصول مركزي صريح؛ LIMITED = قائمة بيضاء من users_branches
   * (فارغة = لا فروع)؛ DENIED = branch_scope=ALL بلا صلاحية؛ UNRESOLVED =
   * تعذر حسم النطاق → رفض. المخزن يُقبل إذا كان ضمن منح user_warehouse_grants
   * أو إذا كان فرعه ضمن الفروع المسموحة (عبر warehouses.branch_id ثم
   * branch_warehouses).
   */
  private static checkScope(user: User, ctx: AuthContext): Decision | null {
    if (!ctx.branchId && !ctx.warehouseId && !(ctx.warehouseIds && ctx.warehouseIds.length)) return null;
    const scope = AuthorizationService.scopeResolution(user);
    if (scope.branchMode === 'UNRESOLVED' || scope.warehouseMode === 'UNRESOLVED') {
      return deny('تعذر تحديد نطاق الفروع والمخازن للمستخدم', 'scope', 'scope');
    }
    if (scope.branchMode === 'DENIED') {
      return deny('لا تملك صلاحية الوصول المركزي إلى جميع الفروع', 'scope.branch', 'scope');
    }
    const db = DatabaseManager.getInstance();

    if (ctx.branchId && scope.branchMode === 'LIMITED' && !scope.branches.has(ctx.branchId)) {
      return deny('الفرع المطلوب خارج نطاق صلاحياتك', 'scope.branch', 'scope');
    }

    const warehouseIds = [ctx.warehouseId, ...(ctx.warehouseIds ?? [])].filter(
      (id): id is string => Boolean(id)
    );
    if (warehouseIds.length > 0) {
      for (const warehouseId of warehouseIds) {
        const denied = AuthorizationService.checkWarehouseScope(db, scope, warehouseId);
        if (denied) return denied;
      }
    }
    return null;
  }

  private static checkWarehouseScope(
    db: DatabaseManager,
    scope: ScopeResolution,
    warehouseId: string
  ): Decision | null {
    if (scope.warehouses.size > 0) {
      if (!scope.warehouses.has(warehouseId)) {
        return deny('المخزن المطلوب خارج نطاق صلاحياتك', 'scope.warehouse', 'scope');
      }
      return null;
    }
    if (scope.branchMode === 'ALL') return null;
    // لا منح مخازن صريحة — اسمح فقط إذا كان المخزن يتبع فرعاً مسموحاً.
    // فشل قراءة الربط أو غياب أي فرع مرتبط = رفض (fail-closed).
    let warehouseBranch: string | null = null;
    try {
      warehouseBranch =
        db.query<{ branch_id: string | null }>(
          'SELECT branch_id FROM warehouses WHERE id = ? LIMIT 1',
          [warehouseId]
        )[0]?.branch_id ?? null;
      if (!warehouseBranch) {
        warehouseBranch =
          db.query<{ branch_id: string }>(
            'SELECT branch_id FROM branch_warehouses WHERE warehouse_id = ? ORDER BY is_primary DESC, branch_id ASC LIMIT 1',
            [warehouseId]
          )[0]?.branch_id ?? null;
      }
    } catch {
      return deny('تعذر تحديد فرع المخزن المطلوب', 'scope.warehouse', 'scope');
    }
    if (!warehouseBranch) {
      return deny('المخزن المطلوب غير مرتبط بفرع مسموح', 'scope.warehouse', 'scope');
    }
    if (!scope.branches.has(warehouseBranch)) {
      return deny('المخزن يتبع فرعاً خارج نطاق صلاحياتك', 'scope.warehouse', 'scope');
    }
    return null;
  }

  /**
   * ينشئ طلب اعتماد فعلياً في approval_requests عندما يتجاوز المبلغ حد
   * on_exceed=REQUIRE_APPROVAL. idempotent على مستوى «معلق واحد لكل
   * (مستخدم، عملية)» — الطلب المعلق القائم يُعاد استخدامه بدل التكرار.
   * تنفيذ الأثر بعد الموافقة مسؤولية خدمة العملية (مرحلة تالية).
   */
  private static createAmountApprovalRequest(
    user: User,
    ctx: AuthContext,
    operation: string,
    limit: AmountLimitRow
  ): string | null {
    const db = DatabaseManager.getInstance();
    try {
      const operationMarker = `"operationCode":"${operation}"`;
      const existing = db.query<{ id: string }>(
        `SELECT id FROM approval_requests
         WHERE request_type = 'OTHER' AND status = 'PENDING' AND requested_by = ?
           AND payload LIKE ?
         ORDER BY created_at DESC LIMIT 1`,
        [user.id, `%${operationMarker}%`]
      )[0];
      if (existing) return existing.id;

      const id = `apr_${uuidv4().substring(0, 8)}`;
      const requestNumber = db.nextNumber('APR');
      // approval_requests.branch_id إلزامي في المخطط المُرحَّل —
      // نستخدم فرع العملية ثم فرع المستخدم الافتراضي ثم أول فرع نشط.
      const branchId =
        ctx.branchId
        ?? db.query<{ branch_id: string }>(
          'SELECT branch_id FROM users_branches WHERE user_id = ? LIMIT 1',
          [user.id]
        )[0]?.branch_id
        ?? db.query<{ id: string }>('SELECT id FROM branches LIMIT 1')[0]?.id
        ?? null;
      if (!branchId) return null;
      db.run(
        `INSERT INTO approval_requests (
          id, request_number, request_type, reference_type, reference_id, branch_id,
          title, description, requested_value, payload, priority, requested_by
        ) VALUES (?, ?, 'OTHER', 'AUTH_AMOUNT_LIMIT', NULL, ?, ?, ?, ?, ?, 'HIGH', ?)`,
        [
          id,
          requestNumber,
          branchId,
          `اعتماد مبلغ-operation: ${operation}`,
          `تجاوز حد الصلاحية ${limit.max_amount} ${limit.currency ?? ''} للعملية ${operation} — المبلغ المطلوب ${ctx.amount}.`,
          ctx.amount ?? null,
          JSON.stringify({
            kind: 'AUTH_AMOUNT_LIMIT',
            operationCode: operation,
            permissionCode: ctx.operation ?? operation,
            amount: ctx.amount ?? null,
            currency: ctx.currency ?? null,
            maxAmount: limit.max_amount,
            branchId: ctx.branchId ?? null,
            warehouseId: ctx.warehouseId ?? null,
          }),
          user.id,
        ]
      );
      return id;
    } catch (error) {
      console.warn('[AuthorizationService] approval request creation failed:', error);
      // approvals قد لا تكون مُرحَّلة في قواعد قديمة — الرفض يبقى سارياً.
      return null;
    }
  }

  private static checkAmountLimit(user: User, ctx: AuthContext): Decision | null {
    if (ctx.amount === undefined || ctx.amount === null) return null;
    const operation = ctx.operation;
    if (!operation) return null;

    const db = DatabaseManager.getInstance();
    // سياسة حدود المبالغ جزء من سلامة المخطط — غياب الجدول أو فشل قراءة
    // الحدود يعني عدم القدرة على فرض الحد، لذا نرفض بدل السماح (fail-closed).
    // الحالة الوحيدة المسموحة هي: الجدول موجود ولا يوجد حد معرّف للعملية.
    let rows: AmountLimitRow[] = [];
    try {
      const table = db.query<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'permission_amount_limits' LIMIT 1`
      );
      if (table.length === 0) {
        return deny('سياسة حدود المبالغ غير مهيأة في قاعدة البيانات', operation, 'amount');
      }
      rows = db.query<AmountLimitRow>(
        `SELECT max_amount / 100.0 AS max_amount, currency, on_exceed, scope_type, scope_id FROM permission_amount_limits
         WHERE permission_code = ? AND ((scope_type = 'USER' AND scope_id = ?) OR (scope_type = 'ROLE' AND scope_id = ?))`,
        [operation, user.id, user.role]
      );
    } catch {
      return deny('تعذر تحميل سياسة حدود المبالغ', operation, 'amount');
    }
    if (rows.length === 0) return null;

    // USER limit يتقدم على ROLE limit.
    const limit =
      rows.find((row) => row.scope_type === 'USER') ?? rows.find((row) => row.scope_type === 'ROLE');
    if (!limit || ctx.amount <= limit.max_amount) return null;

    if (limit.on_exceed === 'REQUIRE_APPROVAL') {
      // اعتماد سابق معتمد وغير مستهلك يغطي نفس العملية والمبلغ → اسمح
      // واستهلكه ذرّيًا (single-use) قبل متابعة الأبعاد الأخرى.
      const consumed = AuthorizationService.consumeApprovedAmountRequest(user, ctx, operation);
      if (consumed) return null;

      const approvalRequestId = AuthorizationService.createAmountApprovalRequest(user, ctx, operation, limit);
      return deny(
        `المبلغ ${ctx.amount} يتجاوز الحد ${limit.max_amount} — يتطلب موافقة`,
        operation,
        'amount',
        true,
        approvalRequestId ?? undefined
      );
    }
    return deny(`المبلغ ${ctx.amount} يتجاوز الحد المسموح ${limit.max_amount}`, operation, 'amount');
  }

  /**
   * يبحث عن طلب AUTH_AMOUNT_LIMIT معتمد يغطي (user, operation, amount)
   * ويستهلكه بتعيين reference_id — الطلب الواحد لا يُستخدم إلا مرة واحدة.
   * المطابقة: نفس operationCode في payload، والمبلغ المعتمد ≥ المطلوب،
   * ونفس الفرع عند تمريره في ctx.
   */
  private static consumeApprovedAmountRequest(
    user: User,
    ctx: AuthContext,
    operation: string
  ): boolean {
    const db = DatabaseManager.getInstance();
    try {
      const rows = db.query<{ id: string; requested_value: number | null; payload: string | null }>(
        `SELECT id, requested_value, payload FROM approval_requests
         WHERE request_type = 'OTHER' AND status = 'APPROVED' AND requested_by = ?
           AND reference_type = 'AUTH_AMOUNT_LIMIT' AND reference_id IS NULL`,
        [user.id]
      );
      const operationMarker = `"operationCode":"${operation}"`;
      const match = rows.find((row) => {
        if (!row.payload || !row.payload.includes(operationMarker)) return false;
        // الاعتماد يجب أن يغطي المبلغ المطلوب (أو لا يحمل مبلغاً محدداً).
        if (row.requested_value != null && Number(row.requested_value) < Number(ctx.amount)) {
          return false;
        }
        try {
          const payload = JSON.parse(row.payload) as { branchId?: string | null };
          if (payload.branchId && ctx.branchId && payload.branchId !== ctx.branchId) return false;
        } catch {
          /* payload تالف — لا تطابق */
          return false;
        }
        return true;
      });
      if (!match) return false;

      // استهلاك شرطي — صف واحد فقط ينجح؛ الفاشل يعيد الرفضياً.
      db.run(
        `UPDATE approval_requests SET reference_id = ?
         WHERE id = ? AND status = 'APPROVED' AND reference_id IS NULL`,
        [`consumed:${match.id}`, match.id]
      );
      if ((db.getDatabase() as { getRowsModified?: () => number }).getRowsModified?.() !== 1) {
        return false;
      }
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'استهلاك اعتماد مبلغ', 'AUTH', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`,
          user.id,
          user.fullName ?? user.username ?? '',
          match.id,
          JSON.stringify({ operation, amount: ctx.amount, consumedFor: 'AUTH_AMOUNT_LIMIT' }),
        ]
      );
      return true;
    } catch {
      return false; // approvals غير مُرحَّلة — سلوك الرفض القائم يبقى.
    }
  }

  /**
   * بُعد مركزي إضافي (المرحلة 4): tenant_permission_limits الموقّعة من
   * المنصة. المنصة تقيّد ولا توسّع — سقف المبلغ هنا نهائي (لا يتجاوزه
   * اعتماد محلي)، وcost_visible/profit_visible=0 يمنع كشف البيانات
   * الحساسة مهما مُنحت الصلاحية محليًا.
   */
  private static checkCentralPermissionLimits(
    requiredCode: string,
    ctx: AuthContext
  ): Decision | null {
    const limits = getCachedPermissionLimits();
    if (limits.length === 0) return null;
    const limit =
      limits.find((row) => row.permissionCode === requiredCode)
      ?? limits.find((row) => row.permissionCode === '*');
    if (!limit) return null;

    if (limit.disabled) {
      return deny('المنصة عطّلت هذه الصلاحية لمستأجرك', requiredCode, 'central');
    }

    if (
      limit.maxAmount != null
      && ctx.amount != null
      && Number.isFinite(Number(ctx.amount))
      && Number(ctx.amount) > Number(limit.maxAmount)
    ) {
      return deny(
        `المنصة تحدد حدًا أقصى ${limit.maxAmount} لهذه العملية`,
        requiredCode,
        'central'
      );
    }

    const sensitivity = SENSITIVITY_BY_CODE.get(requiredCode);
    if (sensitivity === 'COST' || sensitivity === 'COST_PROFIT' || sensitivity === 'PROFIT') {
      const needsCost = sensitivity === 'COST' || sensitivity === 'COST_PROFIT';
      const needsProfit = sensitivity === 'PROFIT' || sensitivity === 'COST_PROFIT';
      if (needsCost && limit.costVisible === 0) {
        return deny('المنصة منعت رؤية التكلفة لهذا المستأجر', requiredCode, 'central');
      }
      if (needsProfit && limit.profitVisible === 0) {
        return deny('المنصة منعت رؤية الربح لهذا المستأجر', requiredCode, 'central');
      }
    }
    return null;
  }

  /**
   * بُعد الشاشة: عند تمرير ctx.path يُفرض المتطلب الموحّد للشاشة
   * (قاعدة المسار all/any + كود ui.* لعرض الصفحة) عبر hasRoleGrant —
   * نفس منطق RouteGuard + useRouteAccess لكن من مصدر واحد.
   * غياب ctx.path (استدعاءات الخدمات بدون سياق صفحة) = لا تقييد شاشة.
   */
  private static checkScreen(user: User, ctx: AuthContext): Decision | null {
    const requirement = screenRequirementFor(ctx.path);
    if (!requirement) return null;
    for (const code of requirement.all) {
      if (!PermissionChecker.hasRoleGrant(user, code)) {
        return deny('لا تملك صلاحية عرض هذه الشاشة', code, 'screen');
      }
    }
    if (requirement.any.length > 0
      && !requirement.any.some((code) => PermissionChecker.hasRoleGrant(user, code))) {
      return deny('لا تملك صلاحية عرض هذه الشاشة', requirement.any[0], 'screen');
    }
    return null;
  }

  /** بُعد الحساسية: COST/PROFIT يتطلبان كود الرؤية المقابل صراحةً. */
  private static checkSensitivity(user: User, requiredCode: string): Decision | null {
    const sensitivity = SENSITIVITY_BY_CODE.get(requiredCode);
    if (!sensitivity || sensitivity === 'NONE' || sensitivity === 'AMOUNT') return null;

    const needs: string[] = [];
    if (sensitivity === 'COST' || sensitivity === 'COST_PROFIT') needs.push(SENSITIVITY_VIEW_CODES.COST);
    if (sensitivity === 'PROFIT' || sensitivity === 'COST_PROFIT') needs.push(SENSITIVITY_VIEW_CODES.PROFIT);

    for (const viewCode of needs) {
      if (!PermissionChecker.hasRoleGrant(user, viewCode)) {
        return deny(
          `الصلاحية ${requiredCode} تكشف بيانات حساسة وتتطلب ${viewCode}`,
          requiredCode,
          'sensitivity'
        );
      }
    }
    return null;
  }

  /**
   * التقييم الكامل — يعيد Decision rather than boolean.
   * لا يرمي استثناءً؛ استخدم require() للتنفيذ.
   */
  public static evaluate(user: User | null, requiredCode: string, ctx: AuthContext = {}): Decision {
    if (!user) return deny('غير مسجل الدخول', requiredCode, 'grant');

    // 1) القيود المركزية — تتقدم على كل شيء ولا يمكن توسيعها محلياً.
    if (CentralFeaturePermissionService.isPermissionDisabled(requiredCode)) {
      return deny('الميزة معطلة مركزياً', requiredCode, 'central');
    }
    // صفحة الإجراء مخفية مركزياً بالكامل — يُمنع حتى بدون سياق صفحة،
    // فلا يمكن استدعاء وظائف صفحة سحبها الاشتراك عبر مسار آخر.
    if (CentralFeaturePermissionService.isPermissionPageHidden(requiredCode)) {
      return deny('صفحة هذا الإجراء مخفية في اشتراكك', requiredCode, 'central');
    }
    if (ctx.path && !CentralFeaturePermissionService.allowsPermission(requiredCode, ctx.path)) {
      return deny('الإجراء غير مسموح في هذه الصفحة مركزياً', requiredCode, 'central');
    }

    // 1ب) حدود المنصة الموقّعة (tenant_permission_limits) — تقيّد ولا توسّع.
    const centralLimitDecision = AuthorizationService.checkCentralPermissionLimits(requiredCode, ctx);
    if (centralLimitDecision) return centralLimitDecision;

    // 2) بُعد الشاشة: ctx.path يُحل عبر ScreenRegistry (المصدر الموحد
    //    للخرائط الثلاث) — يفرض قاعدة المسار + صلاحية عرض الصفحة معاً.
    const screenDecision = AuthorizationService.checkScreen(user, ctx);
    if (screenDecision) return screenDecision;

    // 3) صلاحية العملية نفسها (أدوار + تجاوزات + wildcards).
    if (!PermissionChecker.hasRoleGrant(user, requiredCode)) {
      return deny('لا تملك صلاحية هذا الإجراء', requiredCode, 'grant');
    }

    // 3) نطاق الفرع/المخزن.
    const scopeDecision = AuthorizationService.checkScope(user, ctx);
    if (scopeDecision) return scopeDecision;

    // 4) حدود المبالغ.
    const amountDecision = AuthorizationService.checkAmountLimit(user, ctx);
    if (amountDecision) return amountDecision;

    // 5) رؤية التكلفة/الربح.
    const sensitivityDecision = AuthorizationService.checkSensitivity(user, requiredCode);
    if (sensitivityDecision) return sensitivityDecision;

    return { allowed: true };
  }

  /** غلاف boolean للتوافق — يعادل evaluate(...).allowed. */
  public static allows(user: User | null, requiredCode: string, ctx: AuthContext = {}): boolean {
    return AuthorizationService.evaluate(user, requiredCode, ctx).allowed;
  }

  /** فرض للخدمات — يرمي مع سبب الرفض والبُعد، ويسجل audit. */
  public static require(user: User | null, requiredCode: string, ctx: AuthContext = {}): void {
    const decision = AuthorizationService.evaluate(user, requiredCode, ctx);
    if (decision.allowed) return;
    const label =
      decision.dimension === 'amount' && decision.requiresApproval
        ? 'يتطلب موافقة'
        : decision.reason;
    throw new Error(`غير مصرح: ${label} (الصلاحية: ${requiredCode}).`);
  }
}
