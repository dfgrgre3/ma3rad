import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import { postLedgerEntry, reverseLedgerEntry } from '../../../../database/repositories/ledger';
import { unscaleMoneyRow } from '../../../../utils/money';
import { ExtrasAssetOpsBase } from './assetOps';
import { FA_DISPOSAL_MONEY_FIELDS, FA_MONEY_FIELDS, round2, validDate } from './types';
import type { FixedAsset, FixedAssetDisposal, FixedAssetSettlementSource } from './types';

export abstract class ExtrasDisposalBase extends ExtrasAssetOpsBase {
  getFixedAssetDisposal(assetId: string): FixedAssetDisposal | null {
    const actor = this.requireView();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    return unscaleMoneyRow(this.db.query<FixedAssetDisposal>('SELECT * FROM fixed_asset_disposals WHERE asset_id = ?', [assetId])[0], FA_DISPOSAL_MONEY_FIELDS) || null;
  }

  getFixedAssetSettlementSources(assetId: string): FixedAssetSettlementSource[] {
    const actor = this.requireView();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (!asset.branchId) return [];
    return [
      ...this.db.query<{ id: string; name: string; currentBalance: number }>(
        `SELECT id, name, current_balance / 100.0 AS currentBalance FROM cash_registers
         WHERE is_active = 1 AND branch_id = ? ORDER BY is_default DESC, name`,
        [asset.branchId]
      ).map((row) => ({ ...row, type: 'CASH_REGISTER' as const, currentBalance: Number(row.currentBalance) })),
      ...this.db.query<{ id: string; name: string; currentBalance: number }>(
        `SELECT ba.id, ba.account_name AS name, ba.current_balance / 100.0 AS currentBalance
         FROM bank_accounts ba
         JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
         WHERE ba.is_active = 1 AND ba.branch_id = ? AND ba.currency = 'EGP'
           AND coa.is_active = 1 AND coa.type = 'ASSET'
         ORDER BY ba.account_name`,
        [asset.branchId]
      ).map((row) => ({ ...row, type: 'BANK_ACCOUNT' as const, currentBalance: Number(row.currentBalance) })),
    ];
  }

  disposeFixedAsset(input: {
    assetId: string; date: string; reason: string; proceeds: number; expenses?: number; buyer?: string;
    settlementType: 'CASH_REGISTER' | 'BANK_ACCOUNT'; settlementId: string;
  }): FixedAssetDisposal {
    const actor = this.requireManage();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id = ?', [input.assetId])[0], FA_MONEY_FIELDS);
    if (!asset) throw new Error('الأصل غير موجود.');
    this.requireAssetAccess(asset, actor);
    if (asset.status === 'DISPOSED') throw new Error('الأصل مستبعد بالفعل.');
    if (!validDate(input.date) || input.date < asset.purchaseDate || input.date > localDateString()) throw new Error('تاريخ الاستبعاد غير صحيح.');
    this.assertPostingDate(input.date);
    if (!input.reason.trim()) throw new Error('سبب الاستبعاد مطلوب.');
    const proceeds = Number(input.proceeds);
    const expenses = Number(input.expenses || 0);
    if (!Number.isFinite(proceeds) || proceeds < 0 || !Number.isFinite(expenses) || expenses < 0) {
      throw new Error('المتحصلات والمصروفات يجب أن تكون أرقامًا غير سالبة.');
    }
    const already = this.db.query('SELECT id FROM fixed_asset_disposals WHERE asset_id = ?', [asset.id])[0];
    if (already) throw new Error('تم استبعاد هذا الأصل بالفعل.');
    const cost = round2(Number(asset.purchaseCost));
    const depreciable = Math.max(0, cost - Number(asset.salvageValue || 0));
    const depreciation = round2(Math.min(depreciable, Number(asset.accumulatedDepreciation || 0)));
    const bookValue = round2(Math.max(0, cost - depreciation));
    const gainLoss = round2(proceeds - bookValue);
    if (!['CASH_REGISTER', 'BANK_ACCOUNT'].includes(input.settlementType) || !input.settlementId) {
      throw new Error('حدد قناة تسوية نشطة للاستبعاد.');
    }
    const lines: Array<{ accountCode: string; debit: number; credit: number }> = [
      ...(depreciation > 0 ? [{ accountCode: '1602', debit: depreciation, credit: 0 }] : []),
      ...(proceeds > 0 ? [{ accountCode: '__SETTLEMENT__', debit: round2(proceeds), credit: 0 }] : []),
      ...(gainLoss < 0 ? [{ accountCode: '5208', debit: round2(-gainLoss), credit: 0 }] : []),
      ...(gainLoss > 0 ? [{ accountCode: '4205', debit: 0, credit: gainLoss }] : []),
      { accountCode: '1601', debit: 0, credit: cost },
      ...(expenses > 0 ? [{ accountCode: '5201', debit: round2(expenses), credit: 0 }, { accountCode: '__SETTLEMENT__', debit: 0, credit: round2(expenses) }] : []),
    ];
    const disposalId = `fadsp_${uuidv4().substring(0, 8)}`;
    let result: FixedAssetDisposal | undefined;
    this.db.executeFinancialTransaction((db) => {
      let settlementAccountCode = '1101';
      let currentBalance = 0;
      if (input.settlementType === 'CASH_REGISTER') {
        const register = db.query<{ currentBalance: number; branchId: string | null }>(
          'SELECT current_balance / 100.0 AS currentBalance, branch_id AS branchId FROM cash_registers WHERE id = ? AND is_active = 1',
          [input.settlementId]
        )[0];
        if (!register || !register.branchId || register.branchId !== asset.branchId) {
          throw new Error('الخزينة المحددة غير نشطة أو لا تتبع فرع الأصل.');
        }
        this.branchAccess.requireBranchAuthorization(register.branchId, actor);
        currentBalance = Number(register.currentBalance);
      } else {
        const bank = db.query<{ currentBalance: number; branchId: string | null; accountCode: string }>(
          `SELECT ba.current_balance / 100.0 AS currentBalance, ba.branch_id AS branchId, coa.code AS accountCode
           FROM bank_accounts ba JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
           WHERE ba.id = ? AND ba.is_active = 1 AND ba.currency = 'EGP'
             AND coa.is_active = 1 AND coa.type = 'ASSET'`,
          [input.settlementId]
        )[0];
        if (!bank || !bank.branchId || bank.branchId !== asset.branchId) {
          throw new Error('الحساب البنكي المحدد غير نشط أو لا يتبع فرع الأصل أو ليس حسابًا نقديًا صالحًا.');
        }
        this.branchAccess.requireBranchAuthorization(bank.branchId, actor);
        settlementAccountCode = bank.accountCode;
        currentBalance = Number(bank.currentBalance);
      }
      if (!Number.isFinite(currentBalance) || currentBalance + proceeds - expenses < -0.009) {
        throw new Error('رصيد قناة التسوية غير كافٍ لمصروفات الاستبعاد.');
      }
      const postingLines = lines.map((line) => ({
        ...line, accountCode: line.accountCode === '__SETTLEMENT__' ? settlementAccountCode : line.accountCode,
      }));
      const journalEntryId = postLedgerEntry(db.getDatabase(), {
        date: input.date, description: `استبعاد أصل ${asset.code}: ${input.reason.trim()}`,
        referenceType: 'ASSET_DISPOSAL', referenceId: disposalId, createdBy: actor.id,
        branchId: asset.branchId, lines: postingLines,
      });
      db.run(
        `INSERT INTO fixed_asset_disposals
         (id, asset_id, disposal_date, reason, sale_proceeds, expenses, buyer, accumulated_depreciation, book_value, gain_loss, journal_entry_id, approved_by, settlement_type, settlement_id)
         VALUES (?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ?, ?, ?, ?)`,
        [disposalId, asset.id, input.date, input.reason.trim(), round2(proceeds), round2(expenses),
          input.buyer?.trim() || null, depreciation, bookValue, gainLoss, journalEntryId, actor.id,
          input.settlementType, input.settlementId]
      );
      db.run("UPDATE fixed_assets SET status = 'DISPOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [asset.id]);
      if (input.settlementType === 'CASH_REGISTER') {
        db.run('UPDATE cash_registers SET current_balance = current_balance + ROUND(?*100) - ROUND(?*100) WHERE id = ?',
          [round2(proceeds), round2(expenses), input.settlementId]);
      } else {
        db.run('UPDATE bank_accounts SET current_balance = current_balance + ROUND(?*100) - ROUND(?*100), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [round2(proceeds), round2(expenses), input.settlementId]);
      }
      db.run(
        'INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)',
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Approve fixed asset disposal', 'FINANCE', asset.id,
          JSON.stringify({ date: input.date, reason: input.reason, proceeds, expenses, bookValue, gainLoss, journalEntryId,
            settlementType: input.settlementType, settlementId: input.settlementId })]
      );
      result = {
        id: disposalId, assetId: asset.id, disposalDate: input.date, reason: input.reason.trim(),
        saleProceeds: round2(proceeds), expenses: round2(expenses), buyer: input.buyer?.trim() || null,
        accumulatedDepreciation: depreciation, bookValue, gainLoss, journalEntryId, approvedBy: actor.id,
        settlementType: input.settlementType, settlementId: input.settlementId,
      };
    });
    if (!result) throw new Error('تعذر اعتماد استبعاد الأصل.');
    return result;
  }

  deleteFixedAsset(id: string): void {
    const actor = this.requireManage();
    const asset = unscaleMoneyRow(this.db.query<FixedAsset>('SELECT * FROM fixed_assets WHERE id=?', [id])[0], FA_MONEY_FIELDS);
    if (!asset) return;
    this.requireAssetAccess(asset, actor);
    const historyCount = this.db.query<{ count: number }>(
      `SELECT
        (SELECT COUNT(*) FROM fixed_asset_transfers WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_maintenance WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_disposals WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_depreciation_periods WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_depreciation_requests WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_attachments WHERE asset_id = ?) +
        (SELECT COUNT(*) FROM fixed_asset_count_snapshots WHERE asset_id = ?) AS count`,
      [id, id, id, id, id, id, id]
    )[0]?.count || 0;
    if (historyCount) throw new Error('لا يمكن حذف أصل له سجل نقل أو صيانة أو إهلاك أو جرد أو استبعاد.');
    if (this.db.query('SELECT id FROM journal_entries WHERE reference_id = ? OR reference_id LIKE ?', [id, `${id}:%`]).length) {
      throw new Error('لا يمكن حذف أصل مرتبط بحركة محاسبية.');
    }
    const acquisition = this.db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='ASSET_ACQUISITION' AND reference_id=?`, [id])[0];
    this.db.executeFinancialTransaction((db) => {
      if (acquisition) {
        const cashLine = db.query<any>(`SELECT 1 AS found FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id WHERE l.entry_id=? AND a.code='1101' AND l.credit>0`, [acquisition.id])[0];
        reverseLedgerEntry(db.getDatabase(), acquisition.id, {
          date: localDateString(), description: `Reverse fixed asset acquisition ${asset.code}`,
          referenceType: 'ASSET_ACQUISITION_VOID', referenceId: `${id}:${uuidv4()}`, createdBy: actor.id,
        });
        if (cashLine) db.run('UPDATE cash_registers SET current_balance = current_balance + ROUND(?*100) WHERE id=?', [asset.purchaseCost, 'cr_main']);
      }
      db.run('DELETE FROM fixed_assets WHERE id=?', [id]);
    });
  }
}
