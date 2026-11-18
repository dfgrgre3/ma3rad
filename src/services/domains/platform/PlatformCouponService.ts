import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PlatformStaffAuthService } from './PlatformStaffAuthService';
import { PlatformAuthorizationService } from './PlatformAuthorizationService';
import { centralAuditService } from './CentralAuditService';
import type {
  PlatformCoupon,
  PlatformCouponInput,
} from './platformTypes';
import { nowIso, toNumber, safeJsonArray } from './platformUtils';

export class PlatformCouponService {
  private db = DatabaseManager.getInstance();

  private static requirePlatformAccess(modules: string | string[], action?: string) {
    const user = AuthService.getCurrentUser();
    if (!user || !user.isActive) {
      throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    }

    if (user.role === 'SUPER_ADMIN') {
      return user;
    }

    const allowedRoles = new Set(['PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER']);
    if (!allowedRoles.has(String(user.role))) {
      throw new Error('هذه العملية متاحة لمستخدمي المنصة المصرح لهم فقط.');
    }

    const permissionsOverride = PlatformStaffAuthService.getCurrentPermissionsOverride();
    const required = Array.isArray(modules) ? modules : [modules];
    const permitted = required.some((moduleKey) => {
      if (action && action.startsWith('platform.')) {
        return PlatformAuthorizationService.canAccessPermission(user.role, action, permissionsOverride);
      }
      return PlatformAuthorizationService.canAccessModule(user.role, moduleKey, permissionsOverride)
        && (!action || PlatformAuthorizationService.canAccessModule(user.role, action, permissionsOverride));
    });

    if (!permitted) {
      throw new Error('لا تملك صلاحية تنفيذ هذه العملية.');
    }

    return user;
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string | null,
    details?: unknown,
    options?: {
      severity?: import('./platformTypes').AuditSeverity;
      status?: import('./platformTypes').AuditStatus;
      actorType?: import('./platformTypes').AuditActorType;
      tenantId?: string | null;
      deviceId?: string | null;
      deviceName?: string | null;
      ipAddress?: string | null;
      oldValues?: unknown;
      newValues?: unknown;
      errorMessage?: string | null;
    }
  ): void {
    const actor = AuthService.getCurrentUser();
    if (!actor) throw new Error('هذه العملية تتطلب جلسة منصة صالحة.');
    centralAuditService.log(actor, {
      action,
      entityType,
      entityId,
      details,
      severity: options?.severity,
      status: options?.status,
      actorType: options?.actorType,
      tenantId: options?.tenantId,
      deviceId: options?.deviceId,
      deviceName: options?.deviceName,
      ipAddress: options?.ipAddress,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      errorMessage: options?.errorMessage,
    });
  }

  // ─── Coupon Management ────────────────────────────────────────────────────────

  public listCoupons(): PlatformCoupon[] {
    PlatformCouponService.requirePlatformAccess('coupons', 'platform.coupons.view');
    const rows = this.db.query<any>('SELECT * FROM platform_coupons ORDER BY created_at DESC');
    return rows.map(this.mapCoupon);
  }

  public getCoupon(id: string): PlatformCoupon | null {
    PlatformCouponService.requirePlatformAccess('coupons', 'platform.coupons.view');
    const row = this.db.query<any>('SELECT * FROM platform_coupons WHERE id = ?', [id])[0];
    return row ? this.mapCoupon(row) : null;
  }

  public createCoupon(input: PlatformCouponInput): PlatformCoupon {
    PlatformCouponService.requirePlatformAccess('coupons', 'platform.coupons.create');

    const code = input.code.trim().toUpperCase();
    if (code.length < 3) throw new Error('رمز الكوبون يجب أن يكون 3 أحرف على الأقل.');
    if (!input.name?.trim()) throw new Error('اسم الكوبون مطلوب.');
    if (this.db.query('SELECT 1 FROM platform_coupons WHERE code = ?', [code]).length) {
      throw new Error('رمز الكوبون مستخدم بالفعل.');
    }

    const id = `cpn_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = nowIso();

    this.db.run(
      `INSERT INTO platform_coupons
        (id, code, name, type, value, max_uses, used_count, expires_at, is_active, applicable_plans, min_subtotal, starts_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?)`,
      [
        id, code, input.name.trim(), input.type, input.value,
        input.maxUses ?? null, input.expiresAt ?? null, input.isActive !== false ? 1 : 0,
        input.applicablePlans ?? [], input.minSubtotal ?? 0, input.startsAt ?? null, input.notes ?? null, now, now,
      ]
    );

    this.audit('إنشاء كوبون', 'COUPON', id, { code, name: input.name });

    const coupon = this.getCoupon(id);
    if (!coupon) throw new Error('فشل إنشاء الكوبون.');
    return coupon;
  }

  public updateCoupon(id: string, input: Partial<PlatformCouponInput>): PlatformCoupon {
    PlatformCouponService.requirePlatformAccess('coupons', 'platform.coupons.update');

    const existing = this.getCoupon(id);
    if (!existing) throw new Error('الكوبون غير موجود.');

    if (input.code && input.code !== existing.code) {
      const code = input.code.trim().toUpperCase();
      if (code.length < 3) throw new Error('رمز الكوبون يجب أن يكون 3 أحرف على الأقل.');
      if (this.db.query('SELECT 1 FROM platform_coupons WHERE code = ? AND id <> ?', [code, id]).length) {
        throw new Error('رمز الكوبون مستخدم بالفعل.');
      }
    }

    const now = nowIso();
    this.db.run(
      `UPDATE platform_coupons SET
         code = ?, name = ?, type = ?, value = ?, max_uses = ?, expires_at = ?, is_active = ?, applicable_plans = ?, min_subtotal = ROUND(?*100), starts_at = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.code?.trim().toUpperCase() ?? existing.code,
        input.name?.trim() ?? existing.name,
        input.type ?? existing.type,
        input.value ?? existing.value,
        input.maxUses ?? existing.maxUses,
        input.expiresAt ?? existing.expiresAt,
        input.isActive !== undefined ? (input.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
        input.applicablePlans ?? existing.applicablePlans,
        input.minSubtotal ?? existing.minSubtotal,
        input.startsAt ?? existing.startsAt,
        input.notes ?? existing.notes,
        now, id,
      ]
    );

    this.audit('تحديث كوبون', 'COUPON', id, { name: input.name?.trim() ?? existing.name });

    const updated = this.getCoupon(id);
    if (!updated) throw new Error('فشل تحديث الكوبون.');
    return updated;
  }

  public validateCoupon(code: string, subtotal: number): { coupon: PlatformCoupon; discount: number } {
    PlatformCouponService.requirePlatformAccess('coupons', 'platform.coupons.view');

    const row = this.db.query<any>('SELECT * FROM platform_coupons WHERE code = ?', [code])[0];
    if (!row) throw new Error('الكوبون غير موجود.');

    const coupon = this.mapCoupon(row);

    if (!coupon.isActive) throw new Error('الكوبون غير فعّال.');
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) throw new Error('الكوبون منتهي الصلاحية.');
    if (coupon.startsAt && new Date(coupon.startsAt) > new Date()) throw new Error('الكوبون لم يبدأ سريانه بعد.');
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new Error('تم استنفاد استخدامات الكوبون.');
    if (coupon.minSubtotal > 0 && subtotal < coupon.minSubtotal) {
      throw new Error(`الحد الأدنى للطلب ${coupon.minSubtotal} لتطبيق الكوبون.`);
    }
    if (coupon.applicablePlans.length > 0) {
      // Note: plan validation would need context, skipping for now
    }

    let discount = 0;
    if (coupon.type === 'PERCENT') discount = round2(subtotal * coupon.value / 100);
    else if (coupon.type === 'FIXED') discount = Math.min(coupon.value, subtotal);

    return { coupon, discount };
  }

  public applyCoupon(code: string, planId?: string): PlatformCoupon {
    PlatformCouponService.requirePlatformAccess('coupons', 'platform.coupons.use');

    const row = this.db.query<any>('SELECT * FROM platform_coupons WHERE code = ?', [code])[0];
    if (!row) throw new Error('الكوبون غير موجود.');

    const coupon = this.mapCoupon(row);

    if (!coupon.isActive) throw new Error('الكوبون غير فعّال.');
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) throw new Error('الكوبون منتهي الصلاحية.');
    if (coupon.startsAt && new Date(coupon.startsAt) > new Date()) throw new Error('الكوبون لم يبدأ سريانه بعد.');
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new Error('تم استنفاد استخدامات الكوبون.');

    // Validate plan restriction if applicablePlans is set and planId is provided
    if (coupon.applicablePlans.length > 0 && planId) {
      if (!coupon.applicablePlans.includes(planId)) {
        throw new Error('هذا الكوبون غير متاح للخطة المحددة.');
      }
    }

    this.db.run('UPDATE platform_coupons SET used_count = used_count + 1, updated_at = ? WHERE id = ?', [nowIso(), coupon.id]);

    this.audit('استخدام كوبون', 'COUPON', coupon.id, { code, planId });

    return coupon;
  }

  public deleteCoupon(id: string): void {
    PlatformCouponService.requirePlatformAccess('coupons', 'platform.coupons.delete');

    const coupon = this.getCoupon(id);
    if (!coupon) throw new Error('الكوبون غير موجود.');

    this.db.run('DELETE FROM platform_coupons WHERE id = ?', [id]);
    this.audit('حذف كوبون', 'COUPON', id, { code: coupon.code });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private mapCoupon(row: any): PlatformCoupon {
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      type: row.type,
      value: toNumber(row.value, 0),
      minSubtotal: toNumber(row.min_subtotal, 0) / 100,
      maxUses: row.max_uses ?? null,
      usedCount: toNumber(row.used_count, 0),
      startsAt: row.starts_at ?? null,
      expiresAt: row.expires_at ?? null,
      applicablePlans: safeJsonArray(row.applicable_plans),
      isActive: Boolean(row.is_active),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const platformCouponService = new PlatformCouponService();