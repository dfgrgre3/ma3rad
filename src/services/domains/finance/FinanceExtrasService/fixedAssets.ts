import { v4 as uuidv4 } from 'uuid';
import { paymentAccountCode, postLedgerEntry } from '../../../../database/repositories/ledger';
import { unscaleMoneyRow } from '../../../../utils/money';
import { ExtrasChequesBase } from './cheques';
import { FA_MONEY_FIELDS, round2, validDate } from './types';
import type { FixedAsset } from './types';
import { AuthService } from '../../auth/AuthService';

export abstract class ExtrasFixedAssetsBase extends ExtrasChequesBase {
  // ─── Fixed assets ───────────────────────────────────────────────────────────

  getFixedAssets(): FixedAsset[] {
    const actor = this.requireView();
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed === null) return this.db.query<FixedAsset>('SELECT * FROM fixed_assets ORDER BY code ASC')
      .map((r) => unscaleMoneyRow(r, FA_MONEY_FIELDS));
    if (!allowed.length) return [];
    return this.db.query<FixedAsset>(
      `SELECT * FROM fixed_assets WHERE branch_id IN (${allowed.map(() => '?').join(',')}) ORDER BY code ASC`,
      allowed
    ).map((r) => unscaleMoneyRow(r, FA_MONEY_FIELDS));
  }

  protected requireAssetAccess(asset: FixedAsset, actor = AuthService.requireAuth()): void {
    if (!asset.branchId) {
      if (actor.role !== 'ADMIN') throw new Error('الأصل غير مرتبط بفرع ولا يمكن الوصول إليه.');
      return;
    }
    const allowed = this.branchAccess.getAccessibleBranchIds(actor);
    if (allowed !== null && !allowed.includes(asset.branchId)) throw new Error('ليس لديك صلاحية الوصول إلى هذا الأصل.');
  }

  saveFixedAsset(input: Partial<FixedAsset> & {
    name: string; purchaseDate: string; purchaseCost: number; paymentType?: string; registerId?: string;
    depreciationMethod?: FixedAsset['depreciationMethod']; decliningRate?: number | null; expectedUnits?: number | null;
  }): void {
    const actor = this.requireManage();
    if (!input.name.trim()) throw new Error('اسم الأصل مطلوب.');
    if (!Number.isFinite(Number(input.purchaseCost)) || round2(Number(input.purchaseCost)) <= 0) throw new Error('تكلفة الشراء يجب أن تكون أكبر من صفر.');
    if (!validDate(input.purchaseDate)) throw new Error('تاريخ الشراء غير صحيح.');
    const method = input.depreciationMethod || 'STRAIGHT_LINE';
    if (!['STRAIGHT_LINE', 'DECLINING_BALANCE', 'UNITS_OF_PRODUCTION', 'NON_DEPRECIABLE'].includes(method)) {
      throw new Error('طريقة الإهلاك غير صحيحة.');
    }
    const salvage = Number(input.salvageValue || 0);
    const life = Number(input.usefulLifeYears || 5);
    const rate = input.decliningRate == null ? null : Number(input.decliningRate);
    const units = input.expectedUnits == null ? null : Number(input.expectedUnits);
    if (!Number.isFinite(salvage) || salvage < 0 || salvage > Number(input.purchaseCost)) throw new Error('قيمة الإنقاذ يجب ألا تتجاوز تكلفة الأصل.');
    if (!Number.isFinite(life) || life < 0 || (method !== 'NON_DEPRECIABLE' && life <= 0)) {
      throw new Error('العمر الإنتاجي غير صحيح.');
    }
    if (method === 'DECLINING_BALANCE' && (rate === null || !Number.isFinite(rate) || rate <= 0 || rate > 1)) {
      throw new Error('معدل الإهلاك المتناقص مطلوب ويجب أن يكون بين 0 و1.');
    }
    if (method === 'UNITS_OF_PRODUCTION' && (units === null || !Number.isFinite(units) || units <= 0)) {
      throw new Error('إجمالي الوحدات المتوقع يجب أن يكون أكبر من صفر.');
    }
    const values = [
      input.name.trim(),
      input.category || 'OTHER',
      input.purchaseDate,
      round2(Number(input.purchaseCost)),
      round2(salvage),
      method === 'NON_DEPRECIABLE' ? Math.max(0, life) : life,
      input.status || 'ACTIVE',
      input.location || null,
      input.notes || null,
      method,
      rate,
      units,
    ];
    if (input.id) {
      const posted = this.db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='ASSET_ACQUISITION' AND reference_id=?`, [input.id])[0];
      const existing = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id=?', [input.id])[0], FA_MONEY_FIELDS);
      if (!existing) throw new Error('Fixed asset not found.');
      this.requireAssetAccess(existing, actor);
      if (existing.status === 'DISPOSED') throw new Error('لا يمكن تعديل أصل مستبعد.');
      if (input.status !== undefined && input.status !== existing.status) throw new Error('يجب تنفيذ تغيير حالة الأصل من خلال إجراء الاستبعاد.');
      if ((input.location || null) !== (existing.location || null)) throw new Error('غيّر موقع الأصل من خلال سجل النقل للحفاظ على سجل الحركة.');
      if (this.db.query('SELECT id FROM fixed_asset_depreciation_periods WHERE asset_id = ? LIMIT 1', [input.id]).length &&
          (existing.depreciationMethod !== method || Number(existing.usefulLifeYears) !== life ||
            Number(existing.salvageValue) !== salvage || Number(existing.decliningRate || 0) !== Number(rate || 0) ||
            Number(existing.expectedUnits || 0) !== Number(units || 0))) {
        throw new Error('لا يمكن تغيير طريقة أو مدخلات الإهلاك بعد ترحيل إهلاك للأصل.');
      }
      if (posted && (existing.purchaseDate !== input.purchaseDate || Math.abs(Number(existing.purchaseCost) - Number(input.purchaseCost)) > 0.009)) {
        throw new Error('The acquisition date and cost cannot be edited after posting. Dispose and re-enter the asset to correct it.');
      }
      this.db.run(
        `UPDATE fixed_assets SET name = ?, category = ?, purchase_date = ?, purchase_cost = ROUND(?*100), salvage_value = ROUND(?*100),
           useful_life_years = ?, status = ?, location = ?, notes = ?, depreciation_method = ?, declining_rate = ?,
           expected_units = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, input.id]
      );
    } else {
      if (input.status !== undefined && input.status !== 'ACTIVE') throw new Error('يجب تسجيل الأصل أولًا كأصل نشط.');
      const id = `fa_${uuidv4().substring(0, 8)}`;
      const maxCode = this.db.query<{ code: string }>('SELECT code FROM fixed_assets ORDER BY code DESC LIMIT 1')[0]?.code;
      const lastNumber = maxCode ? Number(String(maxCode).replace(/\D/g, '')) : 0;
      const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
      const paymentType = input.paymentType || 'CREDIT';
      const registerId = input.registerId || 'cr_main';
      const branchId = input.branchId || this.branchAccess.getCurrentBranchId(actor);
      const allowed = this.branchAccess.getAccessibleBranchIds(actor);
      if (!this.db.query('SELECT id FROM branches WHERE id = ? AND is_active = 1', [branchId]).length ||
          (allowed !== null && !allowed.includes(branchId))) throw new Error('الفرع المحدد غير متاح أو خارج نطاق صلاحيتك.');
      this.db.executeFinancialTransaction((db) => {
        db.run(
          `INSERT INTO fixed_assets (id, code, name, category, purchase_date, purchase_cost, salvage_value,
             useful_life_years, status, location, notes, depreciation_method, declining_rate, expected_units,
             branch_id, department_id, responsible_user_id)
           VALUES (?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, `FA-${String(next).padStart(4, '0')}`, ...values, branchId, input.departmentId || null, input.responsibleUserId || null]
        );
        const cashAccount = paymentType === 'CREDIT' ? '2201' : paymentAccountCode(paymentType);
        if (paymentType === 'CASH') {
          const register = db.query<any>('SELECT id FROM cash_registers WHERE id=? AND is_active=1', [registerId])[0];
          if (!register) throw new Error('The selected cash register is unavailable.');
          db.run('UPDATE cash_registers SET current_balance = current_balance - ROUND(?*100) WHERE id=?', [Number(input.purchaseCost), registerId]);
        }
        postLedgerEntry(db.getDatabase(), {
          date: input.purchaseDate,
          description: `Fixed asset acquisition: ${input.name.trim()}`,
          referenceType: 'ASSET_ACQUISITION', referenceId: id, createdBy: actor.id, branchId,
          lines: [
            { accountCode: '1601', debit: Number(input.purchaseCost), credit: 0 },
            { accountCode: cashAccount, debit: 0, credit: Number(input.purchaseCost) },
          ],
        });
        db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
          [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Record fixed asset acquisition', 'FINANCE', id,
            JSON.stringify({ purchaseCost: input.purchaseCost, purchaseDate: input.purchaseDate, paymentType, registerId })]);
      });
    }
  }
}
