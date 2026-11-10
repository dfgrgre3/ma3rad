import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { CentralLicenseService } from './CentralLicenseService';
import { CentralUsageLimitService } from './CentralUsageLimitService';
import { SettingsService } from '../config/SettingsService';
import { AuditService } from '../security/AuditService';

/** الشركة القانونية الافتراضية التي تُنشئها تهيئة ma3rad. */
const MAIN_COMPANY_ID = 'cmp_main';
/** بادئة أكواد الفروع المسحوبة من منصة الإدارة المركزية. */
const CENTRAL_BRANCH_CODE_PREFIX = 'CTR-';

export interface CentralEstablishmentSyncResult {
  ok: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  error?: string;
}

interface CentralBranchPayload {
  id?: string;
  name?: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
}

interface CentralEstablishmentPayload {
  establishment?: {
    id?: string;
    name?: string;
    legal_name?: string | null;
    tax_number?: string | null;
    commercial_register?: string | null;
  } | null;
  branches?: CentralBranchPayload[];
}

/**
 * سحب بيانات المنشأة والفروع من منصة الإدارة المركزية وتطبيقها محليًا.
 * المنشأة تُحدَّث على الشركة الافتراضية، والفروع تُنشأ/تُحدَّث بأكواد ثابتة
 * (`CTR-<centralId>`) حتى يكون السحب قابلاً للتكرار بلا تكرار بيانات.
 */
export class CentralEstablishmentService {
  static async sync(): Promise<CentralEstablishmentSyncResult> {
    try {
      const payload = (await CentralLicenseService.fetchEstablishment()) as CentralEstablishmentPayload | null;
      if (!payload) {
        return { ok: false, inserted: 0, updated: 0, skipped: 0, error: 'central_establishment_unavailable' };
      }
      return CentralEstablishmentService.apply(payload);
    } catch (e: any) {
      return { ok: false, inserted: 0, updated: 0, skipped: 0, error: e?.message || String(e) };
    }
  }

  /** يطبّق الحمولة على قاعدة البيانات المحلية (بدون أي اعتماد على جلسة مستخدم). */
  static apply(payload: CentralEstablishmentPayload): CentralEstablishmentSyncResult {
    const db = DatabaseManager.getInstance();
    const result: CentralEstablishmentSyncResult = { ok: true, inserted: 0, updated: 0, skipped: 0 };

    const establishment = payload.establishment || null;
    if (establishment) {
      CentralEstablishmentService.applyEstablishment(establishment);
    }

    const limit = CentralUsageLimitService.getState('maxBranches');
    let used = limit.used ?? CentralEstablishmentService.countBranches();

    for (const branch of payload.branches || []) {
      const centralId = String(branch.id || '').trim();
      const name = String(branch.name || '').trim();
      if (!centralId || !name) continue;

      const code = `${CENTRAL_BRANCH_CODE_PREFIX}${centralId}`;
      // المطابقة بالكود أولًا، ثم بالاسم لمنع أي خرق لقيد الاسم الفريد.
      const existing = db.query<{ id: string; code: string }>(
        'SELECT id, code FROM branches WHERE code = ? OR name = ? LIMIT 1',
        [code, name]
      )[0];

      if (existing) {
        db.run(
          `UPDATE branches
             SET phone = COALESCE(?, phone),
                 address = COALESCE(?, address),
                 city = COALESCE(?, city),
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [branch.phone ?? null, branch.address ?? null, branch.city ?? null, existing.id]
        );
        CentralEstablishmentService.audit('تحديث فرع من المنصة المركزية', existing.id, { code, name });
        result.updated += 1;
        continue;
      }

      if (limit.limited && limit.allowed !== null && used >= limit.allowed) {
        result.skipped += 1;
        continue;
      }

      const branchId = CentralEstablishmentService.uniqueBranchId(centralId);
      db.run(
        `INSERT INTO branches (id, code, name, phone, address, city, is_main, is_active, created_at, updated_at, company_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`,
        [
          branchId,
          code,
          name,
          branch.phone ?? null,
          branch.address ?? null,
          branch.city ?? null,
          CentralEstablishmentService.mainCompanyId(),
        ]
      );
      CentralEstablishmentService.ensureCashRegister(branchId, name);
      CentralEstablishmentService.audit('إضافة فرع من المنصة المركزية', branchId, { code, name });
      used += 1;
      result.inserted += 1;
    }

    try {
      SettingsService.applyCentral({ centralEstablishmentSyncedAt: new Date().toISOString() });
    } catch {
      // مؤشر تشخيصي فقط؛ لا يعطّل المزامنة.
    }

    return result;
  }

  private static applyEstablishment(establishment: NonNullable<CentralEstablishmentPayload['establishment']>): void {
    try {
      const db = DatabaseManager.getInstance();
      const current = db.query<{ id: string }>('SELECT id FROM companies WHERE id = ?', [MAIN_COMPANY_ID])[0];
      if (!current) return;
      const name = String(establishment.name || '').trim();
      const legalName = String(establishment.legal_name || '').trim();
      db.run(
        `UPDATE companies
            SET name = COALESCE(?, name),
                legal_name = COALESCE(?, legal_name),
                tax_number = COALESCE(?, tax_number),
                commercial_record = COALESCE(?, commercial_record),
                updated_at = ?
          WHERE id = ?`,
        [
          name || null,
          // لا نستبدل الاسم القانوني بالاسم التجاري إلا إذا أرسلته المنصة صراحة.
          legalName || null,
          establishment.tax_number || null,
          establishment.commercial_register || null,
          new Date().toISOString(),
          MAIN_COMPANY_ID,
        ]
      );
      CentralEstablishmentService.audit('تحديث بيانات المنشأة من المنصة المركزية', MAIN_COMPANY_ID, {
        name: name || undefined,
        legalName: legalName || undefined,
        taxNumber: establishment.tax_number || undefined,
      });
    } catch {
      // جداول الشركات غير متوفرة في مخططات قديمة => تجاهل.
    }
  }

  /** تسجيل تدقيق غير معطِّل لأي تغيير قادم من المنصة المركزية. */
  private static audit(action: string, recordId: string, details: Record<string, unknown>): void {
    try {
      new AuditService().log({
        action,
        module: 'SYSTEM',
        recordId,
        newValues: JSON.stringify(details),
      });
    } catch {
      // التسجيل لا يجب أن يعطّل المزامنة المركزية.
    }
  }

  private static mainCompanyId(): string | null {
    try {
      const row = DatabaseManager.getInstance()
        .query<{ id: string }>('SELECT id FROM companies WHERE id = ?', [MAIN_COMPANY_ID])[0];
      return row?.id ?? null;
    } catch {
      return null;
    }
  }

  private static uniqueBranchId(centralId: string): string {
    const db = DatabaseManager.getInstance();
    const base = `br_ctr_${centralId}`.slice(0, 40);
    const taken = db.query<{ id: string }>('SELECT id FROM branches WHERE id = ?', [base]).length > 0;
    return taken ? `${base}_${Date.now().toString(36)}` : base;
  }

  private static ensureCashRegister(branchId: string, branchName: string): void {
    try {
      DatabaseManager.getInstance().run(
        `INSERT OR IGNORE INTO cash_registers (id, name, current_balance, is_default, is_active, branch_id)
         VALUES (?, ?, 0, 0, 1, ?)`,
        [`cr_${branchId}`, `الخزينة الرئيسية - ${branchName}`, branchId]
      );
    } catch {
      // مخططات قديمة بلا عمود branch_id => تجاهل بصمت.
    }
  }

  private static countBranches(): number {
    try {
      const rows = DatabaseManager.getInstance().query<{ c: number }>(
        'SELECT COUNT(*) AS c FROM branches WHERE is_active = 1'
      );
      const value = Number(rows[0]?.c);
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }
}
