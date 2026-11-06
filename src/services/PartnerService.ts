import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { paymentAccountCode, postLedgerEntry } from '../database/ledger';
import { AuthService } from './AuthService';
import { BranchAccessService } from './BranchAccessService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import type { PaymentType } from '../types';

export type PartnerTransactionType =
  | 'CAPITAL_CONTRIBUTION'
  | 'WITHDRAWAL'
  | 'PROFIT_ALLOCATION'
  | 'PROFIT_DISTRIBUTION'
  | 'PARTNER_EXPENSE_PAID'
  | 'COMPANY_EXPENSE_FOR_PARTNER';

export type PartnerPaymentType = Exclude<PaymentType, 'CREDIT' | 'MIXED'>;

export interface BusinessPartner {
  id: string;
  companyId: string;
  name: string;
  phone: string | null;
  email: string | null;
  ownershipPercent: number;
  capitalAmount: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  capitalContributions: number;
  withdrawals: number;
  profitsDue: number;
  profitsDistributed: number;
  expensesPaid: number;
  expensesForPartner: number;
  netBalance: number;
}

export interface PartnerTransaction {
  id: string;
  partnerId: string;
  transactionType: PartnerTransactionType;
  amount: number;
  transactionDate: string;
  paymentType: PartnerPaymentType | null;
  registerName: string | null;
  branchName: string;
  description: string;
  journalEntryId: string;
  journalEntryNumber: string;
  createdByName: string;
  createdAt: string;
  runningBalance: number;
}

export interface PartnerDraft {
  name: string;
  phone?: string;
  email?: string;
  ownershipPercent: number;
  capitalAmount: number;
  notes?: string;
  isActive?: boolean;
}

export interface PartnerTransactionDraft {
  partnerId: string;
  transactionType: Exclude<PartnerTransactionType, 'PROFIT_ALLOCATION'>;
  amount: number;
  transactionDate?: string;
  paymentType?: PartnerPaymentType;
  registerId?: string;
  description: string;
}

export interface ProfitAllocation {
  partnerId: string;
  amount: number;
}

export interface PartnerCashRegister {
  id: string;
  name: string;
}

const MONEY_EPSILON = 0.005;

function money(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function assertAmount(amount: number): number {
  const normalized = money(Number(amount));
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('يجب إدخال مبلغ أكبر من صفر.');
  }
  return normalized;
}

function assertDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error('تاريخ العملية غير صحيح.');
  }
  return value;
}

function signedAmount(type: PartnerTransactionType, amount: number): number {
  switch (type) {
    case 'CAPITAL_CONTRIBUTION':
    case 'PROFIT_ALLOCATION':
    case 'PARTNER_EXPENSE_PAID':
      return amount;
    case 'WITHDRAWAL':
    case 'PROFIT_DISTRIBUTION':
    case 'COMPANY_EXPENSE_FOR_PARTNER':
      return -amount;
  }
}

const PARTNER_SUMMARY_SQL = `
  COALESCE(SUM(CASE WHEN t.transaction_type = 'CAPITAL_CONTRIBUTION' THEN t.amount ELSE 0 END), 0) AS capitalContributions,
  COALESCE(SUM(CASE WHEN t.transaction_type = 'WITHDRAWAL' THEN t.amount ELSE 0 END), 0) AS withdrawals,
  COALESCE(SUM(CASE WHEN t.transaction_type = 'PROFIT_ALLOCATION' THEN t.amount ELSE 0 END), 0) AS profitsDue,
  COALESCE(SUM(CASE WHEN t.transaction_type = 'PROFIT_DISTRIBUTION' THEN t.amount ELSE 0 END), 0) AS profitsDistributed,
  COALESCE(SUM(CASE WHEN t.transaction_type = 'PARTNER_EXPENSE_PAID' THEN t.amount ELSE 0 END), 0) AS expensesPaid,
  COALESCE(SUM(CASE WHEN t.transaction_type = 'COMPANY_EXPENSE_FOR_PARTNER' THEN t.amount ELSE 0 END), 0) AS expensesForPartner,
  COALESCE(SUM(CASE
    WHEN t.transaction_type IN ('CAPITAL_CONTRIBUTION', 'PROFIT_ALLOCATION', 'PARTNER_EXPENSE_PAID') THEN t.amount
    ELSE -t.amount
  END), 0) AS netBalance
`;

const PARTNER_SUMMARY_JOIN = `
  FROM business_partners p
  LEFT JOIN partner_account_transactions t ON t.partner_id = p.id
`;

export class PartnerService {
  private readonly db = DatabaseManager.getInstance();
  private readonly branchAccess = new BranchAccessService();

  public getPartners(): BusinessPartner[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'partners.view');
    const scope = this.branchAccess.companyScope('p.company_id', actor);
    const rows = this.db.query<BusinessPartner>(`
      SELECT p.id, p.company_id AS companyId, p.name, p.phone, p.email,
             p.ownership_percent AS ownershipPercent, p.capital_amount AS capitalAmount,
             p.is_active AS isActive,
             p.notes, p.created_at AS createdAt, p.updated_at AS updatedAt,
             ${PARTNER_SUMMARY_SQL}
      ${PARTNER_SUMMARY_JOIN}
      WHERE ${scope.clause}
      GROUP BY p.id
      ORDER BY p.is_active DESC, p.name COLLATE NOCASE ASC
    `, scope.params);
    return rows.map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
  }

  public getAvailableRegisters(): PartnerCashRegister[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'partners.transactions');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    return this.db.query<PartnerCashRegister>(`
      SELECT id, name
      FROM cash_registers
      WHERE branch_id = ? AND is_active = 1
      ORDER BY is_default DESC, name COLLATE NOCASE ASC
    `, [branchId]);
  }

  public getPartnerStatement(partnerId: string): {
    partner: BusinessPartner;
    transactions: PartnerTransaction[];
  } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'partners.view');
    const scope = this.branchAccess.companyScope('p.company_id', actor);
    const partner = this.db.query<BusinessPartner>(`
      SELECT p.id, p.company_id AS companyId, p.name, p.phone, p.email,
             p.ownership_percent AS ownershipPercent, p.capital_amount AS capitalAmount,
             p.is_active AS isActive,
             p.notes, p.created_at AS createdAt, p.updated_at AS updatedAt,
             ${PARTNER_SUMMARY_SQL}
      ${PARTNER_SUMMARY_JOIN}
      WHERE p.id = ? AND ${scope.clause}
      GROUP BY p.id
    `, [partnerId, ...scope.params])[0];
    if (!partner) throw new Error('الشريك غير موجود أو خارج نطاق صلاحيتك.');

    const rows = this.db.query<PartnerTransaction>(`
      SELECT t.id, t.partner_id AS partnerId, t.transaction_type AS transactionType,
             t.amount, t.transaction_date AS transactionDate, t.payment_type AS paymentType,
             cr.name AS registerName, b.name AS branchName, t.description,
             t.journal_entry_id AS journalEntryId, je.entry_number AS journalEntryNumber,
             u.full_name AS createdByName,
             t.created_at AS createdAt
      FROM partner_account_transactions t
      JOIN business_partners p ON p.id = t.partner_id
      JOIN branches b ON b.id = t.branch_id
      JOIN journal_entries je ON je.id = t.journal_entry_id
      LEFT JOIN cash_registers cr ON cr.id = t.register_id
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.partner_id = ? AND ${scope.clause}
      ORDER BY t.transaction_date ASC, t.rowid ASC
    `, [partnerId, ...scope.params]);

    let runningBalance = 0;
    const transactions = rows.map((transaction) => {
      runningBalance = money(runningBalance + signedAmount(transaction.transactionType, transaction.amount));
      return { ...transaction, runningBalance };
    }).reverse().map((transaction) => ({
      ...transaction,
      paymentType: transaction.paymentType as PartnerPaymentType | null,
    }));

    return {
      partner: { ...partner, isActive: Boolean(partner.isActive) },
      transactions,
    };
  }

  public createPartner(draft: PartnerDraft): BusinessPartner {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'partners.manage');
    PermissionService.require(actor, 'partners.view');
    const companyScope = this.branchAccess.companyScope('company_id', actor);
    const companyId = companyScope.params[0];
    const cleanName = String(draft.name || '').trim();
    const ownershipPercent = Number(draft.ownershipPercent);
    const capitalAmount = this.validateCapitalAmount(draft.capitalAmount);
    if (!companyId) throw new Error('تعذر تحديد الشركة التابعة للفرع النشط.');
    if (!cleanName) throw new Error('اسم الشريك مطلوب.');
    this.assertOwnershipPercent(ownershipPercent);
    this.assertOwnershipCapacity(companyId, ownershipPercent);

    const id = `par_${uuidv4().slice(0, 10)}`;
    this.db.executeTransaction((db) => {
      db.run(`
        INSERT INTO business_partners
          (id, company_id, name, phone, email, ownership_percent, capital_amount, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, companyId, cleanName, draft.phone?.trim() || null, draft.email?.trim() || null,
        ownershipPercent, capitalAmount, draft.notes?.trim() || null, actor.id,
      ]);
      this.createPartnerLedgerAccounts(db, id, cleanName);
      this.audit(db, actor, 'إضافة شريك', id, null, draft);
    });
    return this.getPartnerById(id);
  }

  public updatePartner(partnerId: string, draft: PartnerDraft): BusinessPartner {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'partners.manage');
    PermissionService.require(actor, 'partners.view');
    const current = this.getPartnerById(partnerId);
    const cleanName = String(draft.name || '').trim();
    const ownershipPercent = Number(draft.ownershipPercent);
    const capitalAmount = this.validateCapitalAmount(draft.capitalAmount);
    if (!cleanName) throw new Error('اسم الشريك مطلوب.');
    this.assertOwnershipPercent(ownershipPercent);
    if (draft.isActive !== false) {
      this.assertOwnershipCapacity(current.companyId, ownershipPercent, partnerId);
    }

    this.db.executeTransaction((db) => {
      db.run(`
        UPDATE business_partners
        SET name = ?, phone = ?, email = ?, ownership_percent = ?, capital_amount = ?, notes = ?,
            is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        cleanName, draft.phone?.trim() || null, draft.email?.trim() || null,
        ownershipPercent, capitalAmount, draft.notes?.trim() || null, draft.isActive === false ? 0 : 1, partnerId,
      ]);
      db.run('UPDATE chart_of_accounts SET name = ? WHERE code = ?', [
        `رأس مال الشريك - ${cleanName}`, this.partnerCapitalAccountCode(partnerId),
      ]);
      db.run('UPDATE chart_of_accounts SET name = ? WHERE code = ?', [
        `الحساب الجاري للشريك - ${cleanName}`, this.partnerCurrentAccountCode(partnerId),
      ]);
      db.run('UPDATE chart_of_accounts SET name = ? WHERE code = ?', [
        `ذمم مدينة على الشريك - ${cleanName}`, this.partnerReceivableAccountCode(partnerId),
      ]);
      this.audit(db, actor, 'تعديل بيانات شريك', partnerId, current, draft);
    });
    return this.getPartnerById(partnerId);
  }

  public postTransaction(draft: PartnerTransactionDraft): PartnerTransaction {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'partners.transactions');
    PermissionService.require(actor, 'partners.view');
    const amount = assertAmount(draft.amount);
    const description = String(draft.description || '').trim();
    if (!description) throw new Error('بيان العملية مطلوب.');
    const transactionDate = assertDate(draft.transactionDate || localDateString());
    const partner = this.getPartnerById(draft.partnerId);
    if (!partner.isActive) throw new Error('لا يمكن تسجيل حركات على حساب شريك غير نشط.');
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const transactionId = `ptx_${uuidv4().slice(0, 10)}`;
    const needsPayment = [
      'CAPITAL_CONTRIBUTION',
      'WITHDRAWAL',
      'PROFIT_DISTRIBUTION',
      'COMPANY_EXPENSE_FOR_PARTNER',
    ].includes(draft.transactionType);
    const paymentType = needsPayment ? draft.paymentType : undefined;
    if (needsPayment && !paymentType) throw new Error('حدد طريقة الدفع أو التحصيل.');

    const registerId = paymentType === 'CASH'
      ? draft.registerId || this.branchAccess.getDefaultRegisterId(branchId, actor)
      : undefined;
    if (registerId) this.branchAccess.requireRegisterAccess(registerId, actor, branchId);

    if (draft.transactionType === 'PROFIT_DISTRIBUTION') {
      const statement = this.getPartnerStatement(draft.partnerId);
      if (amount > money(statement.partner.profitsDue - statement.partner.profitsDistributed) + MONEY_EPSILON) {
        throw new Error('مبلغ التوزيع أكبر من الأرباح المستحقة لهذا الشريك.');
      }
    }
    if (draft.transactionType === 'WITHDRAWAL') {
      const statement = this.getPartnerStatement(draft.partnerId);
      if (amount > money(statement.partner.capitalContributions - statement.partner.withdrawals) + MONEY_EPSILON) {
        throw new Error('مبلغ السحب أكبر من رأس المال المتاح لهذا الشريك.');
      }
    }

    return this.db.executeTransaction((db) => {
      if (paymentType === 'CASH' && registerId && this.cashDelta(draft.transactionType, amount) < 0) {
        const balance = db.query<{ currentBalance: number }>(
          'SELECT current_balance AS currentBalance FROM cash_registers WHERE id = ? AND is_active = 1',
          [registerId]
        )[0]?.currentBalance;
        if (balance === undefined || Number(balance) + MONEY_EPSILON < amount) {
          throw new Error('رصيد الخزينة غير كافٍ لإتمام عملية الصرف.');
        }
      }
      const ledgerDb = db.getDatabase();
      const lines = this.getPostingLines(draft.transactionType, amount, paymentType, partner.id);
      const journalEntryId = postLedgerEntry(ledgerDb, {
        date: transactionDate,
        description: `${this.transactionLabel(draft.transactionType)} - ${partner.name}: ${description}`,
        referenceType: 'PARTNER_TRANSACTION',
        referenceId: transactionId,
        createdBy: actor.id,
        branchId,
        lines,
      });

      db.run(`
        INSERT INTO partner_account_transactions (
          id, partner_id, company_id, branch_id, transaction_type, amount, transaction_date,
          payment_type, register_id, description, journal_entry_id, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        transactionId, draft.partnerId, partner.companyId, branchId, draft.transactionType,
        amount, transactionDate, paymentType || null, registerId || null, description,
        journalEntryId, actor.id,
      ]);

      if (paymentType === 'CASH' && registerId) {
        const cashDelta = this.cashDelta(draft.transactionType, amount);
        db.run('UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?', [cashDelta, registerId]);
        const shift = db.query<{ id: string }>(
          `SELECT id FROM cash_shifts WHERE register_id = ? AND branch_id = ? AND status = 'OPEN'
           ORDER BY opened_at DESC LIMIT 1`,
          [registerId, branchId]
        )[0];
        if (shift) {
          if (cashDelta > 0) {
            db.run('UPDATE cash_shifts SET total_partner_inflows = total_partner_inflows + ? WHERE id = ?', [amount, shift.id]);
          } else {
            db.run('UPDATE cash_shifts SET total_partner_outflows = total_partner_outflows + ? WHERE id = ?', [amount, shift.id]);
          }
        }
      }

      this.audit(db, actor, this.transactionLabel(draft.transactionType), transactionId, null, {
        partnerId: draft.partnerId, amount, transactionDate, paymentType, description, journalEntryId,
      });
      return this.getPartnerStatement(draft.partnerId).transactions
        .find((transaction) => transaction.id === transactionId)!;
    });
  }

  public distributeProfits(totalAmount: number, allocations: ProfitAllocation[], transactionDate = localDateString()): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'partners.profits.distribute');
    const amount = assertAmount(totalAmount);
    assertDate(transactionDate);
    const partners = this.getPartners().filter((partner) => partner.isActive);
    const ownership = money(partners.reduce((sum, partner) => sum + Number(partner.ownershipPercent), 0));
    if (Math.abs(ownership - 100) > MONEY_EPSILON) {
      throw new Error('يجب أن يكون مجموع نسب الشراكة للشركاء النشطين 100% قبل توزيع الأرباح.');
    }
    if (allocations.length !== partners.length
      || allocations.some((allocation) => !partners.some((partner) => partner.id === allocation.partnerId))) {
      throw new Error('يجب تضمين كل الشركاء النشطين مرة واحدة في عملية التوزيع.');
    }
    if (new Set(allocations.map((allocation) => allocation.partnerId)).size !== allocations.length) {
      throw new Error('لا يمكن تكرار الشريك في عملية توزيع الأرباح.');
    }
    const normalized = allocations.map((allocation) => ({
      partnerId: allocation.partnerId,
      amount: money(Number(allocation.amount)),
    }));
    if (normalized.some((allocation) => !Number.isFinite(allocation.amount) || allocation.amount < 0)
      || Math.abs(money(normalized.reduce((sum, allocation) => sum + allocation.amount, 0)) - amount) > MONEY_EPSILON) {
      throw new Error('يجب أن يساوي مجموع حصص الشركاء إجمالي الأرباح المراد توزيعها.');
    }

    const retainedProfits = this.db.query<{ balance: number }>(
      "SELECT balance FROM chart_of_accounts WHERE code = '3102' AND is_active = 1"
    )[0]?.balance;
    if (retainedProfits === undefined || Math.max(0, -Number(retainedProfits)) + MONEY_EPSILON < amount) {
      throw new Error('الأرباح المحتجزة في الحسابات لا تكفي للمبلغ المراد توزيعه.');
    }

    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const batchId = `pdist_${uuidv4().slice(0, 10)}`;
    this.db.executeTransaction((db) => {
      for (const allocation of normalized.filter((item) => item.amount > 0)) {
        const transactionId = `ptx_${uuidv4().slice(0, 10)}`;
        const partner = partners.find((item) => item.id === allocation.partnerId)!;
        const description = `توزيع أرباح (${batchId})`;
        const journalEntryId = postLedgerEntry(db.getDatabase(), {
          date: transactionDate,
          description: `${description} - ${partner.name}`,
          referenceType: 'PARTNER_TRANSACTION',
          referenceId: transactionId,
          createdBy: actor.id,
          branchId,
          lines: [
            { accountCode: '3102', debit: allocation.amount, credit: 0 },
            { accountCode: this.partnerCurrentAccountCode(partner.id), debit: 0, credit: allocation.amount },
          ],
        });
        db.run(`
          INSERT INTO partner_account_transactions (
            id, partner_id, company_id, branch_id, transaction_type, amount, transaction_date,
            description, journal_entry_id, allocation_batch_id, created_by
          ) VALUES (?, ?, ?, ?, 'PROFIT_ALLOCATION', ?, ?, ?, ?, ?, ?)
        `, [
          transactionId, partner.id, partner.companyId, branchId, allocation.amount,
          transactionDate, description, journalEntryId, batchId, actor.id,
        ]);
      }
      this.audit(db, actor, 'توزيع أرباح الشركاء', batchId, null, { totalAmount: amount, allocations: normalized });
    });
  }

  private getPartnerById(partnerId: string): BusinessPartner {
    const actor = AuthService.requireAuth();
    const scope = this.branchAccess.companyScope('p.company_id', actor);
    const partner = this.db.query<BusinessPartner>(`
      SELECT p.id, p.company_id AS companyId, p.name, p.phone, p.email,
             p.ownership_percent AS ownershipPercent, p.capital_amount AS capitalAmount,
             p.is_active AS isActive,
             p.notes, p.created_at AS createdAt, p.updated_at AS updatedAt,
             ${PARTNER_SUMMARY_SQL}
      ${PARTNER_SUMMARY_JOIN}
      WHERE p.id = ? AND ${scope.clause}
      GROUP BY p.id
    `, [partnerId, ...scope.params])[0];
    if (!partner) throw new Error('الشريك غير موجود أو خارج نطاق صلاحيتك.');
    return { ...partner, isActive: Boolean(partner.isActive) };
  }

  private assertOwnershipPercent(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error('نسبة الشراكة يجب أن تكون بين 0 و100%.');
    }
  }

  private validateCapitalAmount(value: number): number {
    const amount = money(Number(value));
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('رأس المال المتفق عليه يجب أن يكون رقمًا غير سالب.');
    }
    return amount;
  }

  private assertOwnershipCapacity(companyId: string, ownership: number, exceptPartnerId?: string): void {
    const remaining = this.db.query<{ total: number }>(`
      SELECT COALESCE(SUM(ownership_percent), 0) AS total
      FROM business_partners
      WHERE company_id = ? AND is_active = 1 AND (? IS NULL OR id <> ?)
    `, [companyId, exceptPartnerId || null, exceptPartnerId || null])[0]?.total || 0;
    if (money(Number(remaining) + ownership) > 100 + MONEY_EPSILON) {
      throw new Error('مجموع نسب الشراكة للشركاء النشطين لا يمكن أن يتجاوز 100%.');
    }
  }

  private getPostingLines(
    type: PartnerTransactionDraft['transactionType'],
    amount: number,
    paymentType: PartnerPaymentType | undefined,
    partnerId: string
  ) {
    const paymentCode = paymentType ? paymentAccountCode(paymentType) : null;
    switch (type) {
      case 'CAPITAL_CONTRIBUTION':
        return [
          { accountCode: paymentCode!, debit: amount, credit: 0 },
          { accountCode: this.partnerCapitalAccountCode(partnerId), debit: 0, credit: amount },
        ];
      case 'WITHDRAWAL':
        return [
          { accountCode: this.partnerCapitalAccountCode(partnerId), debit: amount, credit: 0 },
          { accountCode: paymentCode!, debit: 0, credit: amount },
        ];
      case 'PROFIT_DISTRIBUTION':
        return [
          { accountCode: this.partnerCurrentAccountCode(partnerId), debit: amount, credit: 0 },
          { accountCode: paymentCode!, debit: 0, credit: amount },
        ];
      case 'PARTNER_EXPENSE_PAID':
        return [
          { accountCode: '5201', debit: amount, credit: 0 },
          { accountCode: this.partnerCurrentAccountCode(partnerId), debit: 0, credit: amount },
        ];
      case 'COMPANY_EXPENSE_FOR_PARTNER':
        return [
          { accountCode: this.partnerReceivableAccountCode(partnerId), debit: amount, credit: 0 },
          { accountCode: paymentCode!, debit: 0, credit: amount },
        ];
    }
  }

  private cashDelta(type: PartnerTransactionDraft['transactionType'], amount: number): number {
    switch (type) {
      case 'CAPITAL_CONTRIBUTION': return amount;
      case 'WITHDRAWAL':
      case 'PROFIT_DISTRIBUTION':
      case 'COMPANY_EXPENSE_FOR_PARTNER': return -amount;
      case 'PARTNER_EXPENSE_PAID': return 0;
    }
  }

  private transactionLabel(type: PartnerTransactionType): string {
    const labels: Record<PartnerTransactionType, string> = {
      CAPITAL_CONTRIBUTION: 'إيداع مساهمة رأسمالية',
      WITHDRAWAL: 'سحب من رأس المال',
      PROFIT_ALLOCATION: 'استحقاق أرباح',
      PROFIT_DISTRIBUTION: 'صرف أرباح',
      PARTNER_EXPENSE_PAID: 'مصروف دفعه الشريك عن الشركة',
      COMPANY_EXPENSE_FOR_PARTNER: 'مصروف دفعته الشركة عن الشريك',
    };
    return labels[type];
  }

  private createPartnerLedgerAccounts(db: DatabaseManager, partnerId: string, partnerName: string): void {
    const accounts = [
      [this.partnerCapitalAccountCode(partnerId), `رأس مال الشريك - ${partnerName}`, 'EQUITY', '3103'],
      [this.partnerCurrentAccountCode(partnerId), `الحساب الجاري للشريك - ${partnerName}`, 'LIABILITY', '2103'],
      [this.partnerReceivableAccountCode(partnerId), `ذمم مدينة على الشريك - ${partnerName}`, 'ASSET', '1106'],
    ] as const;
    for (const [code, name, type, parentCode] of accounts) {
      db.run(`
        INSERT INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
        VALUES (?, ?, ?, ?, ?, 0, 1)
      `, [`acc_${code}`, code, name, type, parentCode]);
    }
  }

  private partnerCapitalAccountCode(partnerId: string): string {
    return `3103_${partnerId}`;
  }

  private partnerCurrentAccountCode(partnerId: string): string {
    return `2103_${partnerId}`;
  }

  private partnerReceivableAccountCode(partnerId: string): string {
    return `1106_${partnerId}`;
  }

  private audit(
    db: DatabaseManager,
    actor: ReturnType<typeof AuthService.requireAuth>,
    action: string,
    recordId: string,
    oldValues: unknown,
    newValues: unknown
  ): void {
    db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
      VALUES (?, ?, ?, ?, 'PARTNERS', ?, ?, ?)
    `, [
      `aud_${uuidv4().slice(0, 10)}`, actor.id, actor.fullName, action, recordId,
      oldValues === null ? null : JSON.stringify(oldValues), JSON.stringify(newValues),
    ]);
  }
}
