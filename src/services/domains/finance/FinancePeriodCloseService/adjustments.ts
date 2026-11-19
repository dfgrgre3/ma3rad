import { v4 as uuidv4 } from 'uuid';
import { postLedgerEntry } from '../../../../database/repositories/ledger';
import { round2 } from '../financials';
import { PeriodCloseWorkflowBase } from './workflow';
import type { AdjustmentInput, PeriodAdjustment } from './types';

export abstract class PeriodAdjustmentsBase extends PeriodCloseWorkflowBase {
  // -----------------------------------------------------------------
  // Monthly adjusting entries
  // -----------------------------------------------------------------
  public getPeriodAdjustments(periodId: string): PeriodAdjustment[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT id, fiscal_period_id AS fiscalPeriodId, adjustment_type AS adjustmentType,
             description, amount / 100.0 AS amount, debit_account_code AS debitAccountCode,
             credit_account_code AS creditAccountCode, status,
             journal_entry_id AS journalEntryId, created_by AS createdBy,
             created_at AS createdAt, approved_by AS approvedBy, approved_at AS approvedAt,
             posted_at AS postedAt, rejection_reason AS rejectionReason
      FROM period_adjustments
      WHERE fiscal_period_id = ?
      ORDER BY created_at DESC
    `, [periodId]);
  }

  public createPeriodAdjustment(input: AdjustmentInput): string {
    const actor = this.requireManage();
    this.getPeriodRow(input.fiscalPeriodId);
    if (!input.description?.trim()) throw new Error('وصف التسوية إلزامي.');
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('مبلغ التسوية يجب أن يكون أكبر من صفر.');
    if (input.debitAccountCode === input.creditAccountCode) throw new Error('يجب اختيار حسابين مختلفين للتسوية.');
    for (const code of [input.debitAccountCode, input.creditAccountCode]) {
      const account = this.db.query<any>('SELECT id FROM chart_of_accounts WHERE code = ? AND is_active = 1', [code])[0];
      if (!account) throw new Error(`حساب التسوية ${code} غير موجود أو غير نشط.`);
    }
    const id = `padj_${uuidv4().slice(0, 8)}`;
    this.db.executeFinancialTransaction((tx) => {
      tx.run(`
        INSERT INTO period_adjustments
          (id, fiscal_period_id, adjustment_type, description, amount,
           debit_account_code, credit_account_code, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ROUND(?*100), ?, ?, 'DRAFT', ?, ?)
      `, [
        id, input.fiscalPeriodId, input.adjustmentType, input.description.trim(),
        round2(input.amount), input.debitAccountCode, input.creditAccountCode, actor.id,
        new Date().toISOString(),
      ]);
      this.fiscalAudit(tx, actor, 'ADJUSTMENT', id, 'CREATE_ADJUSTMENT', null, 'DRAFT', null, {
        metadata: { ...input },
      });
    });
    return id;
  }

  public submitPeriodAdjustment(adjustmentId: string): void {
    const actor = this.requireManage();
    const adjustment = this.requireAdjustment(adjustmentId);
    if (adjustment.status !== 'DRAFT') throw new Error('لا يمكن إرسال تسوية إلا من حالة المسودة.');
    this.db.executeFinancialTransaction((tx) => {
      tx.run(`
        UPDATE period_adjustments
        SET status = 'PENDING_APPROVAL', submitted_by = ?, submitted_at = ?
        WHERE id = ?
      `, [actor.id, new Date().toISOString(), adjustmentId]);
      this.fiscalAudit(tx, actor, 'ADJUSTMENT', adjustmentId, 'SUBMIT_ADJUSTMENT', 'DRAFT', 'PENDING_APPROVAL');
    });
  }

  public approvePeriodAdjustment(adjustmentId: string): void {
    const actor = this.requireManage();
    const adjustment = this.requireAdjustment(adjustmentId);
    if (adjustment.status !== 'PENDING_APPROVAL') throw new Error('لا يمكن اعتماد تسوية قبل إرسالها للاعتماد.');
    if (adjustment.createdBy === actor.id) {
      throw new Error('يجب أن يعتمد التسوية مستخدم آخر غير مُنشئها (فصل المهام).');
    }
    this.db.executeFinancialTransaction((tx) => {
      const now = new Date().toISOString();
      tx.run(`
        UPDATE period_adjustments
        SET status = 'APPROVED', approved_by = ?, approved_at = ?
        WHERE id = ?
      `, [actor.id, now, adjustmentId]);
      this.fiscalAudit(tx, actor, 'ADJUSTMENT', adjustmentId, 'APPROVE_ADJUSTMENT', 'PENDING_APPROVAL', 'APPROVED');
      tx.run(`
        INSERT INTO fiscal_close_approvals (id, entity_type, entity_id, stage, decision, actor_id, actor_name, created_at)
        VALUES (?, 'ADJUSTMENT', ?, 'APPROVAL', 'APPROVED', ?, ?, ?)
      `, [`fap_${uuidv4().slice(0, 8)}`, adjustmentId, actor.id, actor.fullName, now]);
    });
  }

  public rejectPeriodAdjustment(adjustmentId: string, reason: string): void {
    const actor = this.requireManage();
    if (!reason.trim()) throw new Error('سبب رفض التسوية إلزامي.');
    const adjustment = this.requireAdjustment(adjustmentId);
    if (adjustment.status === 'POSTED') throw new Error('لا يمكن رفض تسوية مرحّلة؛ استخدم قيد عكسي.');
    this.db.executeFinancialTransaction((tx) => {
      tx.run(`
        UPDATE period_adjustments
        SET status = 'REJECTED', approved_by = ?, approved_at = ?, rejection_reason = ?
        WHERE id = ?
      `, [actor.id, new Date().toISOString(), reason.trim(), adjustmentId]);
      this.fiscalAudit(tx, actor, 'ADJUSTMENT', adjustmentId, 'REJECT_ADJUSTMENT', adjustment.status, 'REJECTED', reason);
    });
  }

  public postPeriodAdjustment(adjustmentId: string): string {
    const actor = this.requireCloseControl();
    const adjustment = this.requireAdjustment(adjustmentId);
    if (adjustment.status !== 'APPROVED') throw new Error('لا يمكن ترحيل تسوية قبل اعتمادها.');
    const period = this.getPeriodRow(adjustment.fiscalPeriodId);
    if (period.status === 'CLOSED' || period.status === 'LOCKED') {
      throw new Error('لا يمكن ترحيل تسوية داخل فترة مقفلة؛ أعد فتح الفترة أولًا.');
    }
    let entryId = '';
    this.db.executeFinancialTransaction((tx) => {
      entryId = postLedgerEntry(tx.getDatabase(), {
        date: period.endDate,
        description: `تسوية شهرية (${adjustment.adjustmentType}): ${adjustment.description}`,
        referenceType: 'PERIOD_ADJUSTMENT',
        referenceId: adjustmentId,
        createdBy: actor.id,
        lines: [
          { accountCode: adjustment.debitAccountCode, debit: Number(adjustment.amount) / 100, credit: 0, description: adjustment.description },
          { accountCode: adjustment.creditAccountCode, debit: 0, credit: Number(adjustment.amount) / 100, description: adjustment.description },
        ],
      });
      tx.run(`
        UPDATE period_adjustments
        SET status = 'POSTED', journal_entry_id = ?, posted_by = ?, posted_at = ?
        WHERE id = ?
      `, [entryId, actor.id, new Date().toISOString(), adjustmentId]);
      this.fiscalAudit(tx, actor, 'ADJUSTMENT', adjustmentId, 'POST_ADJUSTMENT', 'APPROVED', 'POSTED', null, {
        journalEntryId: entryId,
      });
    });
    return entryId;
  }

  private requireAdjustment(adjustmentId: string): any {
    const adjustment = this.db.query<any>('SELECT * FROM period_adjustments WHERE id = ?', [adjustmentId])[0];
    if (!adjustment) throw new Error('تسوية الفترة غير موجودة.');
    return adjustment;
  }
}
