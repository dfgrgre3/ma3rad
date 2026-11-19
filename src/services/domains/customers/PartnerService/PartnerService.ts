import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { localDateString } from '../../../../utils/shared/date';
import { assertDate, MONEY_EPSILON, money } from './money';
import { parseAttachments } from './attachments';
import {
  PARTNER_SELECT_COLUMNS,
  PARTNER_SUMMARY_JOIN,
  PARTNER_SUMMARY_SQL,
} from './sql';
import {
  applyOwnershipShares,
  applyProfitShares,
  areProfitSharesAligned,
  assertOwnershipCapacity,
  assertOwnershipPercent,
  assertProfitShareCapacity,
  calculateCurrentOwnershipShares,
  calculateOwnershipShares,
  recordCapitalHistory,
  recordOwnershipHistory,
  recordProfitShareHistory,
  setOwnershipBasis,
} from './ownership';
import {
  createPartnerLedgerAccounts,
  partnerCapitalAccountCode,
  partnerCurrentAccountCode,
  partnerReceivableAccountCode,
} from './ledger';
import { PartnerTransactionOperations } from './transactions';
import type {
  BusinessPartner,
  PartnerBankAccount,
  PartnerCapitalHistory,
  PartnerCashRegister,
  PartnerDraft,
  PartnerOverview,
  PartnerPaymentType,
  PartnerStatement,
  PartnerStatementFilters,
  PartnerTransaction,
  PartnerTransactionType,
} from './types';

/**
 * Business partners (شركاء): registry, capital/ownership engine, account
 * transactions, profit distribution and partner statements.
 */
export class PartnerService extends PartnerTransactionOperations {
  public getPartners(): BusinessPartner[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.partners.partners.view');
    const scope = this.branchAccess.companyScope('p.company_id', actor);
    const rows = this.db.query<BusinessPartner>(`
      SELECT ${PARTNER_SELECT_COLUMNS},
             ${PARTNER_SUMMARY_SQL},
             MAX(0, p.capital_amount - COALESCE(SUM(CASE
               WHEN t.transaction_type = 'CAPITAL_CONTRIBUTION' THEN t.amount
               WHEN t.transaction_type = 'WITHDRAWAL' THEN -t.amount
               WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'CAPITAL_CONTRIBUTION' THEN -t.amount
               WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'WITHDRAWAL' THEN t.amount
               ELSE 0
             END), 0)) / 100.0 AS remainingCapital
      ${PARTNER_SUMMARY_JOIN}
      WHERE ${scope.clause}
      GROUP BY p.id
      ORDER BY p.is_active DESC, p.name COLLATE NOCASE ASC
    `, scope.params);
    return rows.map((row) => ({
      ...row,
      capitalPaid: money(Number(row.capitalContributions) - Number(row.withdrawals)),
      isActive: Boolean(row.isActive),
    }));
  }

  public getOverview(): PartnerOverview {
    const partners = this.getPartners();
    const total = (selector: (partner: BusinessPartner) => number) =>
      money(partners.reduce((sum, partner) => sum + Number(selector(partner) || 0), 0));
    return {
      partnersCount: partners.length,
      activePartnersCount: partners.filter((partner) => partner.isActive).length,
      ownershipTotal: total((partner) => partner.ownershipPercent),
      totalCapitalAgreed: total((partner) => partner.capitalAmount),
      totalContributions: total((partner) => partner.capitalContributions),
      totalWithdrawals: total((partner) => partner.withdrawals),
      totalProfitsDue: total((partner) => partner.profitsDue),
      totalProfitsDistributed: total((partner) => partner.profitsDistributed),
      totalExpensesPaid: total((partner) => partner.expensesPaid),
      totalExpensesForPartner: total((partner) => partner.expensesForPartner),
      totalLoansReceived: total((partner) => partner.loansReceived),
      totalLoansRepaid: total((partner) => partner.loansRepaid),
      totalDrawings: total((partner) => partner.personalDrawings),
      totalAdjustments: total((partner) => partner.adjustments),
      totalNetBalance: total((partner) => partner.netBalance),
    };
  }

  public getAvailableRegisters(): PartnerCashRegister[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.partners.partners.transactions');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    return this.db.query<PartnerCashRegister>(`
      SELECT id, name
      FROM cash_registers
      WHERE branch_id = ? AND is_active = 1
      ORDER BY is_default DESC, name COLLATE NOCASE ASC
    `, [branchId]);
  }

  public getAvailableBankAccounts(): PartnerBankAccount[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.partners.partners.transactions');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    return this.db.query<PartnerBankAccount>(`
      SELECT ba.id, ba.account_name AS name
      FROM bank_accounts ba
      WHERE ba.is_active = 1 AND (ba.branch_id = ? OR ba.branch_id IS NULL)
      ORDER BY ba.account_name COLLATE NOCASE ASC
    `, [branchId]);
  }

  public getOwnershipBasis(): 'AGREED_CAPITAL' | 'PAID_CONTRIBUTIONS' {
    const actor = AuthService.requireAuth();
    const scope = this.branchAccess.companyScope('company_id', actor);
    const basis = this.db.query<{ basis: 'AGREED_CAPITAL' | 'PAID_CONTRIBUTIONS' }>(
      'SELECT basis FROM partner_ownership_policies WHERE company_id = ?',
      [scope.params[0]]
    )[0]?.basis;
    return basis || 'AGREED_CAPITAL';
  }

  public getPartnerCapitalHistory(partnerId: string): PartnerCapitalHistory[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.partners.partners.view');
    const scope = this.branchAccess.companyScope('company_id', actor);
    this.getPartnerById(partnerId);
    return this.db.query<PartnerCapitalHistory>(`
      SELECT h.id, 'OWNERSHIP' AS type, h.old_percent AS oldValue, h.new_percent AS newValue,
             h.effective_date AS effectiveDate, h.reason, u.full_name AS createdByName,
             h.created_at AS createdAt
      FROM partner_ownership_history h
      JOIN users u ON u.id = h.created_by
      WHERE h.partner_id = ? AND ${scope.clause}
      UNION ALL
      SELECT h.id, 'PROFIT_SHARE' AS type, h.old_percent AS oldValue, h.new_percent AS newValue,
             h.effective_date AS effectiveDate, h.reason, u.full_name AS createdByName,
             h.created_at AS createdAt
      FROM partner_profit_share_history h
      JOIN users u ON u.id = h.created_by
      WHERE h.partner_id = ? AND ${scope.clause}
      UNION ALL
      SELECT h.id, 'CAPITAL' AS type, h.old_amount / 100.0 AS oldValue, h.new_amount / 100.0 AS newValue,
             h.effective_date AS effectiveDate, h.reason, u.full_name AS createdByName,
             h.created_at AS createdAt
      FROM partner_capital_history h
      JOIN users u ON u.id = h.created_by
      WHERE h.partner_id = ? AND ${scope.clause}
      ORDER BY effectiveDate DESC, createdAt DESC
    `, [partnerId, ...scope.params, partnerId, ...scope.params, partnerId, ...scope.params]);
  }

  public getPartnerStatement(partnerId: string, filters: PartnerStatementFilters = {}): PartnerStatement {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.partners.partners.view');
    const scope = this.branchAccess.companyScope('p.company_id', actor);
    const partner = this.getPartnerById(partnerId);

    const from = filters.from ? assertDate(filters.from) : undefined;
    const to = filters.to ? assertDate(filters.to) : undefined;
    if (from && to && from > to) throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية.');

    const openingBalance = from
      ? money(this.db.query<{ balance: number }>(`
          SELECT COALESCE(SUM(t.balance_effect), 0) / 100.0 AS balance
          FROM partner_account_transactions t
          JOIN business_partners p ON p.id = t.partner_id
          WHERE t.partner_id = ? AND ${scope.clause} AND t.transaction_date < ?
        `, [partnerId, ...scope.params, from])[0]?.balance || 0)
      : 0;

    const conditions = [`t.partner_id = ?`, scope.clause];
    const params: Array<string | number> = [partnerId, ...scope.params];
    if (from) {
      conditions.push('t.transaction_date >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('t.transaction_date <= ?');
      params.push(to);
    }
    if (filters.types?.length) {
      conditions.push(`t.transaction_type IN (${filters.types.map(() => '?').join(', ')})`);
      params.push(...filters.types);
    }
    const search = String(filters.search || '').trim();
    if (search) {
      conditions.push(`(t.description LIKE ? OR COALESCE(t.reference_number, '') LIKE ? OR COALESCE(t.payment_type, '') LIKE ?)`);
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const rows = this.db.query<Omit<PartnerTransaction, 'runningBalance' | 'isReversed' | 'attachments'> & {
      isReversed: number;
      attachmentsJson?: string;
    }>(`
      SELECT t.id, t.partner_id AS partnerId, t.transaction_type AS transactionType,
             t.amount / 100.0 AS amount, t.balance_effect / 100.0 AS balanceEffect, t.transaction_date AS transactionDate,
             t.payment_type AS paymentType, cr.name AS registerName, ba.account_name AS bankAccountName,
             b.name AS branchName,
             t.reference_number AS referenceNumber, t.description,
             t.journal_entry_id AS journalEntryId, je.entry_number AS journalEntryNumber,
             u.full_name AS createdByName, t.created_at AS createdAt,
             t.reversal_of_id AS reversalOfId, t.reversal_of_type AS reversalOfType,
             t.attachments_json AS attachmentsJson,
             EXISTS(
               SELECT 1 FROM partner_account_transactions rv WHERE rv.reversal_of_id = t.id
             ) AS isReversed
      FROM partner_account_transactions t
      JOIN business_partners p ON p.id = t.partner_id
      JOIN branches b ON b.id = t.branch_id
      JOIN journal_entries je ON je.id = t.journal_entry_id
      LEFT JOIN cash_registers cr ON cr.id = t.register_id
      LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
      LEFT JOIN users u ON u.id = t.created_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.transaction_date ASC, t.rowid ASC
    `, params);

    let runningBalance = openingBalance;
    let periodInflows = 0;
    let periodOutflows = 0;
    const transactions = rows.map((transaction) => {
      runningBalance = money(runningBalance + Number(transaction.balanceEffect));
      if (Number(transaction.balanceEffect) >= 0) periodInflows = money(periodInflows + Number(transaction.balanceEffect));
      else periodOutflows = money(periodOutflows - Number(transaction.balanceEffect));
      return {
        ...transaction,
        paymentType: transaction.paymentType as PartnerPaymentType | null,
        attachments: parseAttachments(transaction.attachmentsJson),
        reversalOfType: transaction.reversalOfType as PartnerTransactionType | null,
        isReversed: Boolean(transaction.isReversed),
        runningBalance,
      };
    }).reverse();

    return {
      partner,
      transactions,
      openingBalance,
      closingBalance: money(runningBalance),
      periodInflows,
      periodOutflows,
      from,
      to,
    };
  }

  public createPartner(draft: PartnerDraft): BusinessPartner {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.partners.partners.manage');
    PermissionService.require(actor, 'ui.partners.partners.view');
    const companyScope = this.branchAccess.companyScope('company_id', actor);
    const companyId = companyScope.params[0];
    const cleanName = String(draft.name || '').trim();
    const capitalAmount = this.validateCapitalAmount(draft.capitalAmount);
    if (!companyId) throw new Error('تعذر تحديد الشركة التابعة للفرع النشط.');
    if (!cleanName) throw new Error('اسم الشريك مطلوب.');
    const id = `par_${uuidv4().slice(0, 10)}`;
    const ownershipMode: 'AUTO' | 'MANUAL' = draft.ownershipMode || 'MANUAL';
    const ownershipBasis = draft.ownershipBasis || 'AGREED_CAPITAL';
    const initialPaidAmount = this.validateCapitalPayment(draft.initialPaidAmount || 0, capitalAmount);
    const transactionDate = assertDate(draft.ownershipEffectiveDate || localDateString());
    const ownershipShares = ownershipMode === 'AUTO'
      ? calculateOwnershipShares(this.db, companyId, ownershipBasis, id, capitalAmount, initialPaidAmount)
      : new Map<string, number>();
    const ownershipPercent = ownershipMode === 'AUTO'
      ? ownershipShares.get(id) || 0
      : money(Number(draft.ownershipPercent));
    const profitSharePercent = money(Number(draft.profitSharePercent
      ?? (ownershipMode === 'AUTO' ? 0 : ownershipPercent)));
    assertOwnershipPercent(ownershipPercent);
    assertOwnershipPercent(profitSharePercent);
    if (ownershipMode === 'MANUAL') assertOwnershipCapacity(this.db, companyId, ownershipPercent);
    if (draft.profitSharePercent !== undefined || ownershipMode === 'MANUAL') {
      assertProfitShareCapacity(this.db, companyId, profitSharePercent);
    }
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    if (initialPaidAmount > 0) {
      PermissionService.require(actor, 'ui.partners.partners.transactions');
      this.validatePaymentDestination(
        this.db, branchId, draft.initialPaymentType || 'CASH',
        draft.initialRegisterId, draft.initialBankAccountId, actor
      );
    }

    this.db.executeFinancialTransaction((db) => {
      const profitSharesAligned = ownershipMode === 'AUTO'
        && areProfitSharesAligned(db, companyId);
      db.run(`
        INSERT INTO business_partners
          (id, company_id, name, phone, email, ownership_percent, profit_share_percent, capital_amount, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?)
      `, [
        id, companyId, cleanName, draft.phone?.trim() || null, draft.email?.trim() || null,
        ownershipPercent, profitSharePercent, capitalAmount, draft.notes?.trim() || null, actor.id,
      ]);
      createPartnerLedgerAccounts(db, id, cleanName);
      recordCapitalHistory(db, actor, id, companyId, 0, capitalAmount, transactionDate,
        draft.capitalChangeReason || 'تسجيل رأس المال المتفق عليه عند إضافة الشريك');
      recordProfitShareHistory(
        db, actor, id, companyId, 0, profitSharePercent, transactionDate,
        draft.profitShareChangeReason || 'تحديد نسبة توزيع الأرباح عند إضافة الشريك'
      );
      if (initialPaidAmount > 0) {
        this.postTransactionInDb(db, actor, {
          partnerId: id,
          transactionType: 'CAPITAL_CONTRIBUTION',
          amount: initialPaidAmount,
          transactionDate,
          paymentType: draft.initialPaymentType || 'CASH',
          registerId: draft.initialRegisterId,
          bankAccountId: draft.initialPaymentType === 'BANK_TRANSFER' ? draft.initialBankAccountId : undefined,
          description: 'سداد مساهمة رأس المال عند إضافة الشريك',
        }, { id, companyId, name: cleanName, capitalAmount });
      }
      if (ownershipMode === 'AUTO') {
        setOwnershipBasis(db, actor, companyId, ownershipBasis);
        const currentShares = calculateCurrentOwnershipShares(db, companyId, ownershipBasis);
        applyOwnershipShares(db, actor, companyId, currentShares, transactionDate,
          draft.ownershipChangeReason || 'إعادة توزيع نسب الملكية حسب رأس المال');
        if (profitSharesAligned && draft.profitSharePercent === undefined) {
          applyProfitShares(db, actor, companyId, currentShares, transactionDate,
            'إعادة توزيع حصة الأرباح حسب نسبة الملكية');
        } else {
          assertProfitShareCapacity(db, companyId, profitSharePercent, id);
        }
      } else {
        recordOwnershipHistory(
          db, actor, id, companyId, 0, ownershipPercent, transactionDate,
          draft.ownershipChangeReason || 'إضافة الشريك وتحديد نسبة الملكية'
        );
      }
      this.audit(db, actor, 'إضافة شريك', id, null, draft);
    });
    return this.getPartnerById(id);
  }

  public updatePartner(partnerId: string, draft: PartnerDraft): BusinessPartner {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.partners.partners.manage');
    PermissionService.require(actor, 'ui.partners.partners.view');
    const current = this.getPartnerById(partnerId);
    const cleanName = String(draft.name || '').trim();
    const capitalAmount = this.validateCapitalAmount(draft.capitalAmount);
    if (capitalAmount + MONEY_EPSILON < current.capitalPaid) {
      throw new Error('لا يمكن أن يقل رأس المال المتفق عليه عن المساهمات المسددة بالفعل.');
    }
    if (!cleanName) throw new Error('اسم الشريك مطلوب.');
    const ownershipMode: 'AUTO' | 'MANUAL' = draft.ownershipMode || 'MANUAL';
    const ownershipBasis = draft.ownershipBasis || 'AGREED_CAPITAL';
    const effectiveDate = assertDate(draft.ownershipEffectiveDate || localDateString());
    const ownershipShares = ownershipMode === 'AUTO' && draft.isActive !== false
      ? calculateOwnershipShares(this.db, current.companyId, ownershipBasis, partnerId, capitalAmount)
      : new Map<string, number>();
    // A deactivated partner must not keep an ownership stake: otherwise the
    // active partners' percentages no longer add up to 100%.
    const ownershipPercent = draft.isActive === false
      ? 0
      : ownershipMode === 'AUTO'
        ? ownershipShares.get(partnerId) || 0
        : money(Number(draft.ownershipPercent));
    const profitSharePercent = money(Number(draft.profitSharePercent ?? current.profitSharePercent));
    assertOwnershipPercent(ownershipPercent);
    assertOwnershipPercent(profitSharePercent);
    if (draft.isActive !== false && ownershipMode === 'MANUAL') {
      assertOwnershipCapacity(this.db, current.companyId, ownershipPercent, partnerId);
    }
    if (draft.profitSharePercent !== undefined) {
      assertProfitShareCapacity(this.db, current.companyId, profitSharePercent, partnerId);
    }
    if (draft.isActive === false && current.isActive && Math.abs(current.netBalance) > MONEY_EPSILON) {
      throw new Error('لا يمكن إيقاف شريك له رصيد قائم. سوِّ رصيده أولًا ثم أوقفه.');
    }

    this.db.executeFinancialTransaction((db) => {
      const profitSharesAligned = ownershipMode === 'AUTO'
        && draft.profitSharePercent === undefined
        && areProfitSharesAligned(db, current.companyId);
      db.run(`
        UPDATE business_partners
        SET name = ?, phone = ?, email = ?, ownership_percent = ?, profit_share_percent = ?, capital_amount = ROUND(?*100), notes = ?,
            is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        cleanName, draft.phone?.trim() || null, draft.email?.trim() || null,
        ownershipPercent, profitSharePercent, capitalAmount, draft.notes?.trim() || null,
        draft.isActive === false ? 0 : 1, partnerId,
      ]);
      if (money(current.capitalAmount) !== capitalAmount) {
        recordCapitalHistory(
          db, actor, partnerId, current.companyId, current.capitalAmount, capitalAmount,
          assertDate(draft.capitalEffectiveDate || effectiveDate),
          draft.capitalChangeReason || 'تعديل رأس المال المتفق عليه'
        );
      }
      if (money(current.profitSharePercent) !== profitSharePercent) {
        recordProfitShareHistory(
          db, actor, partnerId, current.companyId, current.profitSharePercent, profitSharePercent,
          effectiveDate, draft.profitShareChangeReason || draft.ownershipChangeReason || 'تعديل نسبة توزيع الأرباح'
        );
      }
      if (draft.isActive === false) {
        if (money(current.ownershipPercent) !== 0) {
          recordOwnershipHistory(
            db, actor, partnerId, current.companyId, current.ownershipPercent, 0,
            effectiveDate, draft.ownershipChangeReason || 'إيقاف الشريك وإلغاء نسبة ملكيته'
          );
        }
      } else if (ownershipMode !== 'AUTO' && money(current.ownershipPercent) !== ownershipPercent) {
        recordOwnershipHistory(
          db, actor, partnerId, current.companyId, current.ownershipPercent, ownershipPercent,
          effectiveDate, draft.ownershipChangeReason || 'تعديل نسبة ملكية الشريك'
        );
      }
      if (ownershipMode === 'AUTO') {
        setOwnershipBasis(db, actor, current.companyId, ownershipBasis);
        const currentShares = calculateCurrentOwnershipShares(db, current.companyId, ownershipBasis, draft.isActive === false);
        applyOwnershipShares(db, actor, current.companyId, currentShares, effectiveDate,
          draft.ownershipChangeReason || 'إعادة توزيع نسب الملكية حسب رأس المال');
        if (profitSharesAligned) {
          applyProfitShares(db, actor, current.companyId, currentShares, effectiveDate,
            'إعادة توزيع حصة الأرباح حسب نسبة الملكية');
        }
      }
      db.run('UPDATE chart_of_accounts SET name = ? WHERE code = ?', [
        `رأس مال الشريك - ${cleanName}`, partnerCapitalAccountCode(partnerId),
      ]);
      db.run('UPDATE chart_of_accounts SET name = ? WHERE code = ?', [
        `الحساب الجاري للشريك - ${cleanName}`, partnerCurrentAccountCode(partnerId),
      ]);
      db.run('UPDATE chart_of_accounts SET name = ? WHERE code = ?', [
        `ذمم مدينة على الشريك - ${cleanName}`, partnerReceivableAccountCode(partnerId),
      ]);
      this.audit(db, actor, 'تعديل بيانات شريك', partnerId, current, draft);
    });
    return this.getPartnerById(partnerId);
  }

  protected getPartnerById(partnerId: string): BusinessPartner {
    const actor = AuthService.requireAuth();
    const scope = this.branchAccess.companyScope('p.company_id', actor);
    const partner = this.db.query<BusinessPartner>(`
      SELECT ${PARTNER_SELECT_COLUMNS},
             ${PARTNER_SUMMARY_SQL},
             MAX(0, p.capital_amount - COALESCE(SUM(CASE
               WHEN t.transaction_type = 'CAPITAL_CONTRIBUTION' THEN t.amount
               WHEN t.transaction_type = 'WITHDRAWAL' THEN -t.amount
               WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'CAPITAL_CONTRIBUTION' THEN -t.amount
               WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'WITHDRAWAL' THEN t.amount
               ELSE 0
             END), 0)) / 100.0 AS remainingCapital
      ${PARTNER_SUMMARY_JOIN}
      WHERE p.id = ? AND ${scope.clause}
      GROUP BY p.id
    `, [partnerId, ...scope.params])[0];
    if (!partner) throw new Error('الشريك غير موجود أو خارج نطاق صلاحيتك.');
    return {
      ...partner,
      capitalPaid: money(Number(partner.capitalContributions) - Number(partner.withdrawals)),
      isActive: Boolean(partner.isActive),
    };
  }

  private validateCapitalAmount(value: number): number {
    const amount = money(Number(value));
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('رأس المال المتفق عليه يجب أن يكون رقمًا غير سالب.');
    }
    return amount;
  }

  private validateCapitalPayment(amountValue: number, agreedCapital: number): number {
    const amount = money(Number(amountValue));
    if (!Number.isFinite(amount) || amount < 0) throw new Error('مبلغ المساهمة المدفوع غير صحيح.');
    if (amount > agreedCapital + MONEY_EPSILON) {
      throw new Error('المبلغ المدفوع لا يمكن أن يتجاوز رأس المال المتفق عليه.');
    }
    return amount;
  }
}

