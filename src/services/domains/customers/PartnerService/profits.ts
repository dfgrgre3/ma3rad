import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { postLedgerEntry } from '../../../../database/repositories/ledger';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { localDateString } from '../../../../utils/shared/date';
import { assertAmount, assertDate, MONEY_EPSILON, money } from './money';
import { partnerCurrentAccountCode } from './ledger';
import { PartnerServiceBase } from './base';
import type {
  BusinessPartner,
  ProfitAllocation,
  PartnerProfitBatch,
  PartnerProfitBatchLine,
} from './types';

/** Profit distribution and sale-profit allocation operations. */
export abstract class PartnerProfitOperations extends PartnerServiceBase {
  public abstract getPartners(): BusinessPartner[];

  public distributeProfits(
    totalAmount: number,
    allocations: ProfitAllocation[],
    transactionDate = localDateString(),
    notes = ''
  ): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.partners.partners.profits');
    const amount = assertAmount(totalAmount);
    assertDate(transactionDate);
    const partners = this.getPartners().filter((partner) => partner.isActive);
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
      "SELECT balance / 100.0 AS balance FROM chart_of_accounts WHERE code = '3102' AND is_active = 1"
    )[0]?.balance;
    if (retainedProfits === undefined || Math.max(0, -Number(retainedProfits)) + MONEY_EPSILON < amount) {
      throw new Error('الأرباح المحتجزة في الحسابات لا تكفي للمبلغ المراد توزيعه.');
    }

    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const batchId = `pdist_${uuidv4().slice(0, 10)}`;
    const cleanNotes = String(notes || '').trim();
    this.db.executeFinancialTransaction((db) => {
      for (const allocation of normalized.filter((item) => item.amount > 0)) {
        const transactionId = `ptx_${uuidv4().slice(0, 10)}`;
        const partner = partners.find((item) => item.id === allocation.partnerId)!;
        const description = `توزيع أرباح (${batchId})${cleanNotes ? ` - ${cleanNotes}` : ''}`;
        const journalEntryId = postLedgerEntry(db.getDatabase(), {
          date: transactionDate,
          description: `${description} - ${partner.name}`,
          referenceType: 'PARTNER_TRANSACTION',
          referenceId: transactionId,
          createdBy: actor.id,
          branchId,
          lines: [
            { accountCode: '3102', debit: allocation.amount, credit: 0 },
            { accountCode: partnerCurrentAccountCode(partner.id), debit: 0, credit: allocation.amount },
          ],
        });
        db.run(`
          INSERT INTO partner_account_transactions (
            id, partner_id, company_id, branch_id, transaction_type, amount, balance_effect,
            transaction_date, reference_number, description, journal_entry_id, allocation_batch_id, created_by
          ) VALUES (?, ?, ?, ?, 'PROFIT_ALLOCATION', ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?)
        `, [
          transactionId, partner.id, partner.companyId, branchId, allocation.amount,
          allocation.amount, transactionDate, `DIST-${batchId}-${partner.id}`, description,
          journalEntryId, batchId, actor.id,
        ]);
      }
      this.audit(db, actor, 'توزيع أرباح الشركاء', batchId, null, {
        totalAmount: amount, allocations: normalized, notes: cleanNotes || null,
      });
    });
  }

  public allocateSaleProfit(
    db: DatabaseManager,
    input: {
      invoiceId: string;
      invoiceNumber: string;
      companyId: string | null;
      branchId: string;
      transactionDate: string;
      profit: number;
      actorId: string;
    }
  ): void {
    const profit = money(Number(input.profit));
    if (!Number.isFinite(profit)) throw new Error('قيمة ربح الفاتورة غير صحيحة.');
    if (!input.companyId || profit <= 0) return;
    assertDate(input.transactionDate);

    const batchId = `sale_${input.invoiceId}`;
    if (db.query<{ id: string }>(`
      SELECT id FROM partner_account_transactions
      WHERE allocation_batch_id = ? AND transaction_type = 'PROFIT_ALLOCATION'
        AND reference_number = 'SALE_PROFIT'
      LIMIT 1
    `, [batchId]).length > 0) return;

    const partners = db.query<{
      id: string;
      companyId: string;
      name: string;
      profitSharePercent: number;
    }>(`
      SELECT id, company_id AS companyId, name, profit_share_percent AS profitSharePercent
      FROM business_partners
      WHERE company_id = ? AND is_active = 1 AND ownership_percent > 0
      ORDER BY id
    `, [input.companyId]);
    const profitShareTotal = money(partners.reduce((sum, partner) => sum + Number(partner.profitSharePercent), 0));
    if (profitShareTotal > 100 + MONEY_EPSILON) {
      throw new Error('مجموع نسب توزيع الأرباح للشركاء النشطين لا يمكن أن يتجاوز 100%.');
    }

    for (const partner of partners) {
      const amount = money(profit * Number(partner.profitSharePercent) / 100);
      if (amount <= 0) continue;
      this.postSaleProfitMovement(db, {
        partnerId: partner.id,
        companyId: partner.companyId,
        partnerName: partner.name,
        branchId: input.branchId,
        transactionDate: input.transactionDate,
        amount,
        actorId: input.actorId,
        batchId,
        referenceNumber: `SALE_PROFIT:${input.invoiceId}`,
        description: `استحقاق حصة أرباح فاتورة البيع ${input.invoiceNumber}`,
      });
    }
  }

  public adjustSaleProfitAllocation(
    db: DatabaseManager,
    input: {
      invoiceId: string;
      invoiceNumber: string;
      branchId: string;
      transactionDate: string;
      invoiceProfit: number;
      targetProfit: number;
      actorId: string;
    }
  ): void {
    assertDate(input.transactionDate);
    const invoiceProfit = Number(input.invoiceProfit);
    if (!Number.isFinite(invoiceProfit) || invoiceProfit <= 0) return;
    const targetProfit = Math.max(0, Number(input.targetProfit));
    if (!Number.isFinite(targetProfit)) throw new Error('قيمة الربح بعد المرتجعات غير صحيحة.');

    const batchId = `sale_${input.invoiceId}`;
    const allocations = db.query<{
      id: string;
      partnerId: string;
      companyId: string;
      partnerName: string;
      amount: number;
      referenceNumber: string | null;
    }>(`
      SELECT t.id, t.partner_id AS partnerId, t.company_id AS companyId,
             p.name AS partnerName, t.amount / 100.0 AS amount, t.reference_number AS referenceNumber
      FROM partner_account_transactions t
      JOIN business_partners p ON p.id = t.partner_id
      WHERE t.allocation_batch_id = ? AND t.transaction_type = 'PROFIT_ALLOCATION'
      ORDER BY t.rowid
    `, [batchId]);
    const initialAllocations = allocations.filter((allocation) =>
      allocation.referenceNumber?.startsWith('SALE_PROFIT:'));
    if (initialAllocations.length === 0) return;

    const partnerIds = [...new Set(initialAllocations.map((allocation) => allocation.partnerId))];
    for (const partnerId of partnerIds) {
      const partnerAllocations = allocations.filter((allocation) => allocation.partnerId === partnerId);
      const initialAmount = money(initialAllocations
        .filter((allocation) => allocation.partnerId === partnerId)
        .reduce((sum, allocation) => sum + Number(allocation.amount), 0));
      const targetAmount = money(targetProfit * initialAmount / invoiceProfit);
      const outstanding = partnerAllocations.map((allocation) => {
        const reversed = Number(db.query<{ amount: number }>(`
          SELECT COALESCE(SUM(amount), 0) / 100.0 AS amount
          FROM partner_account_transactions
          WHERE reversal_of_id = ? AND transaction_type = 'REVERSAL'
            AND reversal_of_type = 'PROFIT_ALLOCATION'
        `, [allocation.id])[0]?.amount || 0);
        return { allocation, amount: money(Math.max(0, Number(allocation.amount) - reversed)) };
      });
      const currentAmount = money(outstanding.reduce((sum, item) => sum + item.amount, 0));
      const delta = money(targetAmount - currentAmount);
      const partner = partnerAllocations[0];

      if (delta > 0) {
        this.postSaleProfitMovement(db, {
          partnerId,
          companyId: partner.companyId,
          partnerName: partner.partnerName,
          branchId: input.branchId,
          transactionDate: input.transactionDate,
          amount: delta,
          actorId: input.actorId,
          batchId,
          referenceNumber: `SALE_PROFIT_ADJUSTMENT:${uuidv4().slice(0, 8)}`,
          description: `تسوية حصة أرباح فاتورة البيع ${input.invoiceNumber}`,
        });
        continue;
      }

      let remaining = -delta;
      for (const item of [...outstanding].reverse()) {
        if (remaining <= MONEY_EPSILON) break;
        const amount = money(Math.min(remaining, item.amount));
        if (amount <= 0) continue;
        this.postSaleProfitMovement(db, {
          partnerId,
          companyId: item.allocation.companyId,
          partnerName: item.allocation.partnerName,
          branchId: input.branchId,
          transactionDate: input.transactionDate,
          amount,
          actorId: input.actorId,
          batchId,
          referenceNumber: `SALE_PROFIT_REVERSAL:${uuidv4().slice(0, 8)}`,
          description: `عكس حصة أرباح فاتورة البيع ${input.invoiceNumber}`,
          reversalOfId: item.allocation.id,
        });
        remaining = money(remaining - amount);
      }
    }
  }

  public getProfitDistributionHistory(): PartnerProfitBatch[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.partners.partners.view');
    const scope = this.branchAccess.companyScope('p.company_id', actor);
    return this.db.query<PartnerProfitBatch>(`
      SELECT t.allocation_batch_id AS batchId,
             MIN(t.transaction_date) AS transactionDate,
             COALESCE(SUM(CASE
               WHEN t.transaction_type = 'PROFIT_ALLOCATION' THEN t.amount
               WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'PROFIT_ALLOCATION' THEN -t.amount
               ELSE 0
             END), 0) / 100.0 AS totalAmount,
             COUNT(DISTINCT CASE WHEN t.transaction_type = 'PROFIT_ALLOCATION' THEN t.partner_id END) AS partnersCount,
             MAX(t.created_at) AS createdAt
      FROM partner_account_transactions t
      JOIN business_partners p ON p.id = t.partner_id
      WHERE (t.transaction_type = 'PROFIT_ALLOCATION'
         OR (t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'PROFIT_ALLOCATION'))
        AND t.allocation_batch_id IS NOT NULL
        AND ${scope.clause}
      GROUP BY t.allocation_batch_id
      ORDER BY transactionDate DESC, createdAt DESC
    `, scope.params);
  }

  public getProfitDistributionBatch(batchId: string): PartnerProfitBatchLine[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.partners.partners.view');
    const scope = this.branchAccess.companyScope('p.company_id', actor);
    return this.db.query<PartnerProfitBatchLine>(`
      SELECT t.partner_id AS partnerId, p.name AS partnerName,
             COALESCE(SUM(CASE
               WHEN t.transaction_type = 'PROFIT_ALLOCATION' THEN t.amount
               WHEN t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'PROFIT_ALLOCATION' THEN -t.amount
               ELSE 0
             END), 0) / 100.0 AS amount,
             GROUP_CONCAT(DISTINCT je.entry_number) AS journalEntryNumber
      FROM partner_account_transactions t
      JOIN business_partners p ON p.id = t.partner_id
      JOIN journal_entries je ON je.id = t.journal_entry_id
      WHERE t.allocation_batch_id = ? AND (t.transaction_type = 'PROFIT_ALLOCATION'
         OR (t.transaction_type = 'REVERSAL' AND t.reversal_of_type = 'PROFIT_ALLOCATION'))
        AND ${scope.clause}
      GROUP BY t.partner_id, p.name
      HAVING ABS(amount) > ?
      ORDER BY p.name COLLATE NOCASE ASC
    `, [batchId, ...scope.params, MONEY_EPSILON]);
  }

  private postSaleProfitMovement(
    db: DatabaseManager,
    input: {
      partnerId: string;
      companyId: string;
      partnerName: string;
      branchId: string;
      transactionDate: string;
      amount: number;
      actorId: string;
      batchId: string;
      referenceNumber: string;
      description: string;
      reversalOfId?: string;
    }
  ): void {
    const transactionId = `ptx_${uuidv4().slice(0, 10)}`;
    const isReversal = Boolean(input.reversalOfId);
    const journalEntryId = postLedgerEntry(db.getDatabase(), {
      date: input.transactionDate,
      description: `${input.description} - ${input.partnerName}`,
      referenceType: 'PARTNER_TRANSACTION',
      referenceId: transactionId,
      createdBy: input.actorId,
      branchId: input.branchId,
      lines: isReversal
        ? [
          { accountCode: partnerCurrentAccountCode(input.partnerId), debit: input.amount, credit: 0 },
          { accountCode: '3102', debit: 0, credit: input.amount },
        ]
        : [
          { accountCode: '3102', debit: input.amount, credit: 0 },
          { accountCode: partnerCurrentAccountCode(input.partnerId), debit: 0, credit: input.amount },
        ],
    });

    db.run(`
      INSERT INTO partner_account_transactions (
        id, partner_id, company_id, branch_id, transaction_type, amount, balance_effect,
        transaction_date, reference_number, description, journal_entry_id, allocation_batch_id,
        reversal_of_id, reversal_of_type, created_by
      ) VALUES (?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      transactionId,
      input.partnerId,
      input.companyId,
      input.branchId,
      isReversal ? 'REVERSAL' : 'PROFIT_ALLOCATION',
      input.amount,
      isReversal ? -input.amount : input.amount,
      input.transactionDate,
      input.referenceNumber,
      input.description,
      journalEntryId,
      input.batchId,
      input.reversalOfId || null,
      isReversal ? 'PROFIT_ALLOCATION' : null,
      input.actorId,
    ]);
  }
}
