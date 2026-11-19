import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import { postLedgerEntry } from '../../../../database/repositories/ledger';
import { unscaleMoneyRow } from '../../../../utils/money';
import { ExtrasFixedAssetsBase } from './fixedAssets';
import { FA_DEPR_MONEY_FIELDS, FA_MONEY_FIELDS, round2, validDate } from './types';
import type {
  AccountType,
  FixedAsset,
  FixedAssetDepreciationPeriod,
  FixedAssetDepreciationRequest,
} from './types';

export abstract class ExtrasDepreciationBase extends ExtrasFixedAssetsBase {
  postMonthlyDepreciation(id: string): void {
    this.requestFixedAssetDepreciation(id, localDateString().slice(0, 7));
  }

  getDepreciationSchedule(assetId: string, throughPeriod: string, usageQuantity?: number): Array<{
    period: string; amount: number; usageQuantity: number | null; status: 'POSTED' | 'SCHEDULED';
  }> {
    this.requireView();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(throughPeriod)) throw new Error('فترة الإهلاك غير صحيحة.');
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset);
    const depreciationRows = this.db.query<{ period: string; amount: number; usageQuantity: number | null }>(
      'SELECT period, amount / 100.0 AS amount, usage_quantity FROM fixed_asset_depreciation_periods WHERE asset_id = ? ORDER BY period',
      [assetId]
    );
    const posted = new Map(depreciationRows.map((row) => [row.period, row]));
    const postedTotal = depreciationRows.reduce((total, row) => total + Number(row.amount), 0);
    let accumulated = Math.max(0, Number(asset.accumulatedDepreciation || 0) - postedTotal);
    const depreciable = Math.max(0, Number(asset.purchaseCost) - Number(asset.salvageValue));
    const start = asset.purchaseDate.slice(0, 7);
    if (throughPeriod < start) return [];
    const schedule: Array<{ period: string; amount: number; usageQuantity: number | null; status: 'POSTED' | 'SCHEDULED' }> = [];
    let [year, month] = start.split('-').map(Number);
    let cursor = start;
    while (cursor <= throughPeriod) {
      const prior = posted.get(cursor);
      if (prior) {
        accumulated += Number(prior.amount);
        schedule.push({ period: cursor, amount: Number(prior.amount), usageQuantity: prior.usageQuantity, status: 'POSTED' });
      } else {
        let amount = 0;
        const remaining = Math.max(0, depreciable - accumulated);
        switch (asset.depreciationMethod || 'STRAIGHT_LINE') {
          case 'STRAIGHT_LINE':
            amount = asset.usefulLifeYears > 0 ? round2(depreciable / (Number(asset.usefulLifeYears) * 12)) : 0;
            break;
          case 'DECLINING_BALANCE':
            amount = round2(Math.max(0, Number(asset.purchaseCost) - accumulated) * Number(asset.decliningRate || 0) / 12);
            break;
          case 'UNITS_OF_PRODUCTION':
            if (cursor === throughPeriod && usageQuantity !== undefined) {
              if (!Number.isFinite(usageQuantity) || usageQuantity < 0) throw new Error('كمية الاستخدام يجب أن تكون رقمًا غير سالب.');
              amount = Number(asset.expectedUnits) > 0
                ? round2(depreciable * usageQuantity / Number(asset.expectedUnits))
                : 0;
            }
            break;
          case 'NON_DEPRECIABLE':
            amount = 0;
            break;
          default:
            throw new Error('طريقة الإهلاك المخزنة غير مدعومة.');
        }
        amount = round2(Math.min(remaining, amount));
        accumulated += amount;
        schedule.push({
          period: cursor, amount,
          usageQuantity: cursor === throughPeriod && asset.depreciationMethod === 'UNITS_OF_PRODUCTION' ? usageQuantity ?? null : null,
          status: 'SCHEDULED',
        });
      }
      month += 1;
      if (month > 12) { month = 1; year += 1; }
      cursor = `${year}-${String(month).padStart(2, '0')}`;
    }
    return schedule;
  }

  requestFixedAssetDepreciation(id: string, period: string, usageQuantity?: number): string {
    const actor = this.requireManage();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [id])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (asset.status !== 'ACTIVE') throw new Error('لا يمكن إهلاك أصل غير نشط.');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('فترة الإهلاك غير صحيحة.');
    const today = localDateString();
    if (period > today.slice(0, 7)) throw new Error('لا يمكن ترحيل إهلاك فترة مستقبلية.');
    if (asset.depreciationMethod === 'UNITS_OF_PRODUCTION' &&
        (usageQuantity === undefined || !Number.isFinite(usageQuantity) || usageQuantity < 0)) {
      throw new Error('طريقة وحدات الإنتاج تتطلب كمية استخدام غير سالبة للفترة.');
    }
    const postingDate = `${period}-${new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).getDate()}`;
    if (!validDate(postingDate) || postingDate < asset.purchaseDate) throw new Error('فترة الإهلاك تسبق تاريخ بدء الأصل.');
    this.assertPostingDate(postingDate, true);
    if (this.db.query('SELECT id FROM fixed_asset_depreciation_periods WHERE asset_id = ? AND period = ?', [id, period]).length) {
      throw new Error('تم ترحيل إهلاك هذا الأصل لهذه الفترة بالفعل.');
    }
    if (this.db.query('SELECT id FROM fixed_asset_depreciation_requests WHERE asset_id = ? AND period = ?', [id, period]).length) {
      throw new Error('تم تقديم طلب إهلاك لهذا الأصل والفترة بالفعل.');
    }
    if (this.db.query(
      'SELECT id FROM fixed_asset_depreciation_requests WHERE asset_id = ? AND status = ?',
      [id, 'PENDING']
    ).length) {
      throw new Error('يوجد طلب إهلاك آخر قيد المراجعة لهذا الأصل.');
    }
    if (this.db.query(
      'SELECT id FROM journal_entries WHERE reference_type = ? AND reference_id = ?',
      ['ASSET_DEPRECIATION', `${id}:${period}`]
    ).length) {
      throw new Error('يوجد قيد إهلاك سابق لهذه الفترة؛ راجع سجل الترحيل قبل أي معالجة.');
    }
    const schedule = this.getDepreciationSchedule(id, period, usageQuantity);
    const currentPeriod = schedule[schedule.length - 1];
    const amount = Number(currentPeriod?.amount || 0);
    if (amount <= 0) throw new Error('لا توجد قيمة قابلة للإهلاك.');
    const requestId = `fadr_${uuidv4().substring(0, 12)}`;
    this.db.executeFinancialTransaction((db) => {
      db.run(
        `INSERT INTO fixed_asset_depreciation_requests
         (id, asset_id, period, posting_date, amount, usage_quantity, requested_by)
         VALUES (?, ?, ?, ?, ROUND(?*100), ?, ?)`,
        [requestId, id, period, postingDate, round2(amount),
          asset.depreciationMethod === 'UNITS_OF_PRODUCTION' ? usageQuantity ?? null : null, actor.id]
      );
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Request fixed asset depreciation', 'FINANCE',
          asset.id, JSON.stringify({ requestId, period, postingDate, amount: round2(amount) })]
      );
    });
    return requestId;
  }

  postDepreciationPeriod(id: string, period: string, usageQuantity?: number): void {
    this.requestFixedAssetDepreciation(id, period, usageQuantity);
  }

  getFixedAssetDepreciationRequests(assetId: string): FixedAssetDepreciationRequest[] {
    const actor = this.requireView();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetDepreciationRequest>(
      `SELECT r.*, requester.full_name AS requester_name, approver.full_name AS approver_name
       FROM fixed_asset_depreciation_requests r
       JOIN users requester ON requester.id = r.requested_by
       LEFT JOIN users approver ON approver.id = r.approved_by
       WHERE r.asset_id = ? ORDER BY r.created_at DESC, r.id DESC`,
      [assetId]
    ).map((row) => unscaleMoneyRow(row, FA_DEPR_MONEY_FIELDS));
  }

  approveFixedAssetDepreciationRequest(requestId: string): FixedAssetDepreciationPeriod {
    const actor = this.requireManage();
    const request = unscaleMoneyRow(this.db.query<FixedAssetDepreciationRequest>(
      'SELECT * FROM fixed_asset_depreciation_requests WHERE id = ?',
      [requestId]
    )[0], FA_DEPR_MONEY_FIELDS);
    if (!request) throw new Error('طلب الإهلاك غير موجود.');
    if (request.status !== 'PENDING') throw new Error('تمت معالجة طلب الإهلاك بالفعل.');
    if (request.requestedBy === actor.id) throw new Error('يجب أن يكون معتمد الإهلاك مستخدمًا مختلفًا عن مقدم الطلب.');
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [request.assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (asset.status !== 'ACTIVE') throw new Error('لا يمكن إهلاك أصل غير نشط.');
    this.assertPostingDate(request.postingDate, true);
    if (this.db.query(
      'SELECT id FROM fixed_asset_depreciation_periods WHERE asset_id = ? AND period = ?',
      [asset.id, request.period]
    ).length) throw new Error('تم ترحيل إهلاك هذا الأصل لهذه الفترة بالفعل.');
    if (this.db.query(
      'SELECT id FROM journal_entries WHERE reference_type = ? AND reference_id = ?',
      ['ASSET_DEPRECIATION', `${asset.id}:${request.period}`]
    ).length) throw new Error('يوجد قيد إهلاك سابق لهذه الفترة؛ راجع سجل الترحيل قبل أي معالجة.');
    const expense = this.accountByCode('5205', 'EXPENSE');
    const accumulated = this.accountByCode('1602', 'ASSET');
    if (!expense || !accumulated) throw new Error('حسابات الإهلاك غير مهيأة في دليل الحسابات.');
    const amount = round2(Number(request.amount));
    const depreciable = Math.max(0, Number(asset.purchaseCost) - Number(asset.salvageValue));
    const nextAccumulated = round2(Number(asset.accumulatedDepreciation) + amount);
    if (amount <= 0 || nextAccumulated > depreciable + 0.009) {
      throw new Error('تغير رصيد الأصل منذ تقديم الطلب؛ أعد تقديم طلب الإهلاك بعد المراجعة.');
    }
    const periodId = `fad_${uuidv4().substring(0, 8)}`;
    let result: FixedAssetDepreciationPeriod | undefined;
    this.db.executeFinancialTransaction((db) => {
      const current = db.query<{ status: string; requestedBy: string }>(
        'SELECT status, requested_by AS requestedBy FROM fixed_asset_depreciation_requests WHERE id = ?',
        [requestId]
      )[0];
      if (!current || current.status !== 'PENDING') throw new Error('تمت معالجة طلب الإهلاك بالفعل.');
      if (current.requestedBy === actor.id) throw new Error('يجب أن يكون معتمد الإهلاك مستخدمًا مختلفًا عن مقدم الطلب.');
      const entryId = postLedgerEntry(db.getDatabase(), {
        date: request.postingDate,
        description: `إهلاك ${request.period}: ${asset.name} (${asset.code})`,
        referenceType: 'ASSET_DEPRECIATION', referenceId: `${asset.id}:${request.period}`,
        createdBy: actor.id, branchId: asset.branchId,
        lines: [
          { accountCode: '5205', debit: amount, credit: 0 },
          { accountCode: '1602', debit: 0, credit: amount },
        ],
      });
      db.run(
        `INSERT INTO fixed_asset_depreciation_periods
         (id, asset_id, period, posting_date, amount, usage_quantity, status, journal_entry_id, posted_by)
         VALUES (?, ?, ?, ?, ROUND(?*100), ?, 'POSTED', ?, ?)`,
        [periodId, asset.id, request.period, request.postingDate, amount, request.usageQuantity, entryId, actor.id]
      );
      db.run(
        'UPDATE fixed_assets SET accumulated_depreciation = ROUND(?*100), status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [Math.min(depreciable, nextAccumulated), nextAccumulated >= depreciable - 0.009 ? 'FULLY_DEPRECIATED' : 'ACTIVE', asset.id]
      );
      db.run(
        `UPDATE fixed_asset_depreciation_requests
         SET status = 'APPROVED', approved_by = ?, journal_entry_id = ?, depreciation_period_id = ?, approved_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'PENDING'`,
        [actor.id, entryId, periodId, requestId]
      );
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Approve fixed asset depreciation', 'FINANCE',
          asset.id, JSON.stringify({ requestId, period: request.period, amount, journalEntryId: entryId })]
      );
      result = {
        id: periodId, assetId: asset.id, period: request.period, postingDate: request.postingDate,
        amount, usageQuantity: request.usageQuantity, status: 'POSTED', journalEntryId: entryId, postedBy: actor.id,
      };
    });
    if (!result) throw new Error('تعذر اعتماد طلب الإهلاك.');
    return result;
  }

  private accountByCode(code: string, type: AccountType): { id: string } | undefined {
    return this.db.query<{ id: string }>('SELECT id FROM chart_of_accounts WHERE code = ? AND type = ? AND is_active = 1', [code, type])[0];
  }

  getFixedAssetDepreciationPeriods(assetId: string): FixedAssetDepreciationPeriod[] {
    const actor = this.requireView();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return this.db.query<FixedAssetDepreciationPeriod>(
      'SELECT * FROM fixed_asset_depreciation_periods WHERE asset_id = ? ORDER BY period DESC',
      [assetId]
    ).map((row) => unscaleMoneyRow(row, FA_DEPR_MONEY_FIELDS));
  }
}
