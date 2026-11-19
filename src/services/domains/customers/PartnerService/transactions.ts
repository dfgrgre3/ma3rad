import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { postLedgerEntry, reverseLedgerEntry } from '../../../../database/repositories/ledger';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { localDateString } from '../../../../utils/shared/date';
import {
  assertAmount,
  assertDate,
  CASH_AFFECTING_TYPES,
  MONEY_EPSILON,
  money,
  signedAmount,
} from './money';
import { validateAttachments } from './attachments';
import {
  applyCashMovement,
  cashDelta,
  getPostingLines,
  transactionLabel,
} from './ledger';
import { recalculateOwnershipAfterCapitalMovement } from './ownership';
import { PartnerProfitOperations } from './profits';
import type {
  BusinessPartner,
  PartnerPaymentType,
  PartnerStatement,
  PartnerStatementFilters,
  PartnerTransaction,
  PartnerTransactionDraft,
  PartnerTransactionType,
} from './types';

/** Partner account movements: posting and reversal. */
export abstract class PartnerTransactionOperations extends PartnerProfitOperations {
  protected abstract getPartnerById(partnerId: string): BusinessPartner;

  public abstract getPartnerStatement(partnerId: string, filters?: PartnerStatementFilters): PartnerStatement;

  public postTransaction(draft: PartnerTransactionDraft): PartnerTransaction {
    const actor = AuthService.requireAuth();
    const isAdjustment = draft.transactionType === 'ADJUSTMENT_INCREASE'
      || draft.transactionType === 'ADJUSTMENT_DECREASE';
    PermissionService.require(actor, 'ui.partners.partners.view');
    const actionCode = isAdjustment ? 'ui.partners.partners.adjust' : 'ui.partners.partners.transactions';
    const partner = this.getPartnerById(draft.partnerId);
    if (!partner.isActive) throw new Error('لا يمكن تسجيل حركات على حساب شريك غير نشط.');

    return this.db.executeFinancialTransaction((db) => {
      // حدود المبلغ/النطاق داخل المعاملة — استهلاك اعتماد المبلغ ذرّي
      // مع قيد الحركة فلا تحترق الموافقة إذا فشلت العملية.
      PermissionService.require(actor, actionCode, undefined, {
        amount: draft.amount,
        branchId: this.branchAccess.getCurrentBranchId(actor),
        operation: 'partners.transaction',
      });
      const transactionId = this.postTransactionInDb(db, actor, draft, partner);
      return this.getPartnerStatement(draft.partnerId).transactions
        .find((transaction) => transaction.id === transactionId)!;
    });
  }

  /**
   * Reverses a partner movement with an auditable contra entry. Partner history
   * is immutable: corrections are always new movements, never edits/deletes.
   */
  public reverseTransaction(transactionId: string, reason: string): PartnerTransaction {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.partners.partners.reverse');
    PermissionService.require(actor, 'ui.partners.partners.view');
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) throw new Error('سبب العكس مطلوب.');

    const scope = this.branchAccess.companyScope('t.company_id', actor);
    const original = this.db.query<{
      id: string;
      partnerId: string;
      companyId: string;
      branchId: string;
      transactionType: PartnerTransactionType;
      amount: number;
      balanceEffect: number;
      paymentType: PartnerPaymentType | null;
      registerId: string | null;
      bankAccountId: string | null;
      journalEntryId: string;
      reversalOfId: string | null;
      description: string;
    }>(`
      SELECT t.id, t.partner_id AS partnerId, t.company_id AS companyId,
             t.branch_id AS branchId, t.transaction_type AS transactionType,
             t.amount / 100.0 AS amount, t.balance_effect / 100.0 AS balanceEffect, t.payment_type AS paymentType,
             t.register_id AS registerId, t.bank_account_id AS bankAccountId,
             t.journal_entry_id AS journalEntryId,
             t.reversal_of_id AS reversalOfId, t.description
      FROM partner_account_transactions t
      WHERE t.id = ? AND ${scope.clause}
    `, [transactionId, ...scope.params])[0];
    if (!original) throw new Error('حركة الشريك غير موجودة أو خارج نطاق صلاحيتك.');
    if (original.transactionType === 'REVERSAL' || original.reversalOfId) {
      throw new Error('لا يمكن عكس قيد عكسي.');
    }
    const alreadyReversed = this.db.query<{ id: string }>(
      'SELECT id FROM partner_account_transactions WHERE reversal_of_id = ? LIMIT 1',
      [transactionId]
    )[0];
    if (alreadyReversed) throw new Error('تم عكس هذه الحركة مسبقًا.');

    if (original.registerId) {
      this.branchAccess.requireRegisterAccess(original.registerId, actor, original.branchId);
    } else {
      this.branchAccess.requireBranchAuthorization(original.branchId, actor);
    }

    const reversalId = `ptx_${uuidv4().slice(0, 10)}`;
    const transactionDate = localDateString();
    return this.db.executeFinancialTransaction((db) => {
      const journalEntryId = reverseLedgerEntry(db.getDatabase(), original.journalEntryId, {
        date: transactionDate,
        description: `عكس ${transactionLabel(original.transactionType)} - ${cleanReason}`,
        referenceType: 'PARTNER_TRANSACTION',
        referenceId: reversalId,
        createdBy: actor.id,
        branchId: original.branchId,
      });
      if (!journalEntryId) throw new Error('تعذر عكس القيد المحاسبي الأصلي.');

      db.run(`
        INSERT INTO partner_account_transactions (
          id, partner_id, company_id, branch_id, transaction_type, amount, balance_effect,
            transaction_date, payment_type, register_id, bank_account_id, reference_number, description,
          journal_entry_id, reversal_of_id, reversal_of_type, created_by
          ) VALUES (?, ?, ?, ?, 'REVERSAL', ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        reversalId, original.partnerId, original.companyId, original.branchId,
        original.amount, money(-Number(original.balanceEffect)), transactionDate,
          original.paymentType, original.registerId, original.bankAccountId,
          `REV-${reversalId.toUpperCase()}`,
          `عكس: ${original.description} — ${cleanReason}`,
          journalEntryId, original.id, original.transactionType, actor.id,
      ]);

      if (original.paymentType === 'CASH' && original.registerId) {
        const originalDelta = cashDelta(original.transactionType, original.amount);
        applyCashMovement(
          db, original.transactionType, original.amount, original.paymentType,
          original.registerId, original.branchId, true, originalDelta
        );
      }
      if (original.paymentType === 'BANK_TRANSFER' && original.bankAccountId) {
        db.run('UPDATE bank_accounts SET current_balance = current_balance - ROUND(?*100) WHERE id = ?', [
          cashDelta(original.transactionType, original.amount), original.bankAccountId,
        ]);
      }
      if (['CAPITAL_CONTRIBUTION', 'WITHDRAWAL'].includes(original.transactionType)) {
        recalculateOwnershipAfterCapitalMovement(
          db, actor, original.companyId, transactionDate,
          `إعادة حساب الملكية بعد عكس ${transactionLabel(original.transactionType)}`
        );
      }

      this.audit(db, actor, 'عكس حركة شريك', reversalId, null, {
        transactionId, reason: cleanReason, journalEntryId,
      });
      return this.getPartnerStatement(original.partnerId).transactions
        .find((transaction) => transaction.id === reversalId)!;
    });
  }

  protected postTransactionInDb(
    db: DatabaseManager,
    actor: ReturnType<typeof AuthService.requireAuth>,
    draft: PartnerTransactionDraft,
    partner: Pick<BusinessPartner, 'id' | 'companyId' | 'name' | 'capitalAmount'> & Partial<Pick<BusinessPartner, 'capitalContributions' | 'withdrawals' | 'profitsDue' | 'profitsDistributed' | 'loansReceived' | 'loansRepaid'>>
  ): string {
    const amount = assertAmount(draft.amount);
    const description = String(draft.description || '').trim();
    if (!description) throw new Error('بيان العملية مطلوب.');
    const transactionDate = assertDate(draft.transactionDate || localDateString());
    const transactionType = draft.transactionType;
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const paymentType = CASH_AFFECTING_TYPES.includes(transactionType) ? draft.paymentType : undefined;
    if (CASH_AFFECTING_TYPES.includes(transactionType) && !paymentType) {
      throw new Error('حدد طريقة الدفع أو التحصيل.');
    }
    const registerId = paymentType === 'CASH'
      ? draft.registerId || this.branchAccess.getDefaultRegisterId(branchId, actor)
      : undefined;
    if (registerId) this.branchAccess.requireRegisterAccess(registerId, actor, branchId);
    if (paymentType) {
      this.validatePaymentDestination(db, branchId, paymentType, registerId, draft.bankAccountId, actor);
    }
    const referenceNumber = String(draft.referenceNumber || '').trim()
      || `PAR-${transactionDate.replace(/-/g, '')}-${uuidv4().slice(0, 8).toUpperCase()}`;
    if (db.query<{ id: string }>(
      'SELECT id FROM partner_account_transactions WHERE company_id = ? AND reference_number = ? LIMIT 1',
      [partner.companyId, referenceNumber]
    ).length > 0) throw new Error('الرقم المرجعي مستخدم من قبل في حسابات الشركاء.');

    if (transactionType === 'CAPITAL_CONTRIBUTION') {
      const paid = Number(partner.capitalContributions || 0) - Number(partner.withdrawals || 0);
      if (amount > money(partner.capitalAmount - paid) + MONEY_EPSILON) {
        throw new Error('مبلغ المساهمة أكبر من رأس المال المتبقي غير المسدد.');
      }
    }
    if (transactionType === 'PROFIT_DISTRIBUTION'
      && amount > money(Number(partner.profitsDue || 0) - Number(partner.profitsDistributed || 0)) + MONEY_EPSILON) {
      throw new Error('مبلغ التوزيع أكبر من الأرباح المستحقة لهذا الشريك.');
    }
    if (transactionType === 'WITHDRAWAL'
      && amount > money(Number(partner.capitalContributions || 0) - Number(partner.withdrawals || 0)) + MONEY_EPSILON) {
      throw new Error('مبلغ السحب أكبر من رأس المال المتاح (المدفوع) لهذا الشريك.');
    }
    if (transactionType === 'LOAN_REPAYMENT'
      && amount > money(Number(partner.loansReceived || 0) - Number(partner.loansRepaid || 0)) + MONEY_EPSILON) {
      throw new Error('مبلغ السداد أكبر من رصيد قروض الشريك المستحقة.');
    }

    const bankAccountId = paymentType === 'BANK_TRANSFER' ? draft.bankAccountId : undefined;
    const bankAccount = bankAccountId
      ? db.query<{ code: string }>(`
          SELECT coa.code FROM bank_accounts ba
          JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
          WHERE ba.id = ? AND ba.is_active = 1
        `, [bankAccountId])[0]
      : undefined;
    if (bankAccountId && !bankAccount) throw new Error('الحساب البنكي المحدد غير موجود أو غير نشط.');
    const movementDelta = cashDelta(transactionType, amount);
    if (paymentType === 'CASH' && registerId && movementDelta < 0) {
      const balance = db.query<{ currentBalance: number }>(
        'SELECT current_balance / 100.0 AS currentBalance FROM cash_registers WHERE id = ? AND is_active = 1',
        [registerId]
      )[0]?.currentBalance;
      if (balance === undefined || Number(balance) + MONEY_EPSILON < amount) {
        throw new Error('رصيد الخزينة غير كافٍ لإتمام عملية الصرف.');
      }
    }
    if (paymentType === 'BANK_TRANSFER' && bankAccountId && movementDelta < 0) {
      const balance = db.query<{ currentBalance: number }>(
        'SELECT current_balance / 100.0 AS currentBalance FROM bank_accounts WHERE id = ? AND is_active = 1',
        [bankAccountId]
      )[0]?.currentBalance;
      if (balance === undefined || Number(balance) + MONEY_EPSILON < amount) {
        throw new Error('رصيد الحساب البنكي غير كافٍ لإتمام عملية الصرف.');
      }
    }
    const transactionId = `ptx_${uuidv4().slice(0, 10)}`;
    const lines = getPostingLines(transactionType, amount, paymentType, partner.id, bankAccount?.code);
    const journalEntryId = postLedgerEntry(db.getDatabase(), {
      date: transactionDate,
      description: `${transactionLabel(transactionType)} - ${partner.name}: ${description}`,
      referenceType: 'PARTNER_TRANSACTION',
      referenceId: transactionId,
      createdBy: actor.id,
      branchId,
      lines,
    });
    const attachments = validateAttachments(draft.attachments || []);
    db.run(`
      INSERT INTO partner_account_transactions (
        id, partner_id, company_id, branch_id, transaction_type, amount, balance_effect,
        transaction_date, payment_type, register_id, bank_account_id, reference_number,
        description, journal_entry_id, attachments_json, created_by
      ) VALUES (?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      transactionId, draft.partnerId, partner.companyId, branchId, transactionType,
      amount, signedAmount(transactionType, amount), transactionDate, paymentType || null,
      registerId || null, bankAccountId || null, referenceNumber, description,
      journalEntryId, JSON.stringify(attachments), actor.id,
    ]);
    applyCashMovement(db, transactionType, amount, paymentType, registerId, branchId, false);
    if (bankAccountId) {
      db.run('UPDATE bank_accounts SET current_balance = current_balance + ROUND(?*100) WHERE id = ?', [movementDelta, bankAccountId]);
    }
    this.audit(db, actor, transactionLabel(transactionType), transactionId, null, {
      partnerId: draft.partnerId, amount, transactionDate, paymentType, referenceNumber,
      description, journalEntryId, bankAccountId: bankAccountId || null, attachments,
    });
    if (transactionType === 'CAPITAL_CONTRIBUTION' || transactionType === 'WITHDRAWAL') {
      recalculateOwnershipAfterCapitalMovement(
        db, actor, partner.companyId, transactionDate,
        `إعادة حساب الملكية بعد ${transactionLabel(transactionType)}`
      );
    }
    return transactionId;
  }

  protected validatePaymentDestination(
    db: DatabaseManager,
    branchId: string,
    paymentType: PartnerPaymentType,
    registerId: string | undefined,
    bankAccountId: string | undefined,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): void {
    if (paymentType === 'CASH') {
      const resolvedRegister = registerId || this.branchAccess.getDefaultRegisterId(branchId, actor);
      this.branchAccess.requireRegisterAccess(resolvedRegister, actor, branchId);
      return;
    }
    if (paymentType === 'BANK_TRANSFER') {
      if (!bankAccountId) throw new Error('حدد الحساب البنكي المستلم للتحويل.');
      const account = db.query<{ branchId: string | null }>(
        'SELECT branch_id AS branchId FROM bank_accounts WHERE id = ? AND is_active = 1',
        [bankAccountId]
      )[0];
      if (!account || (account.branchId && account.branchId !== branchId)) {
        throw new Error('الحساب البنكي غير نشط أو خارج نطاق الفرع.');
      }
    }
  }
}
