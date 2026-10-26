import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { round2 } from './financials';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import type {
  FiscalYear,
  FiscalPeriod,
  BankAccount,
  BankReconciliation,
  BankReconciliationLine,
  ExtendedChequeStatus,
  ChequeStatusHistory,
  CostCenter,
  Budget,
  BudgetItem,
  CashForecastItem,
  CashForecastDaySummary,
  PaymentGateway,
  PaymentGatewaySettlement,
  MultiDimensionalReportFilters,
} from '../types/finance';
import type { Cheque } from './FinanceExtrasService';
import { FinanceEnterprisePart02 } from './FinanceEnterprisePart02';

export abstract class FinanceEnterprisePart03 extends FinanceEnterprisePart02 {
public getBankAccounts(): BankAccount[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT ba.*, coa.code as glAccountCode, coa.name as glAccountName, b.name as branchName
      FROM bank_accounts ba
      JOIN chart_of_accounts coa ON ba.gl_account_id = coa.id
      LEFT JOIN branches b ON ba.branch_id = b.id
      ORDER BY ba.is_active DESC, ba.account_name ASC
    `).map(r => ({
      id: r.id,
      accountName: r.accountName,
      bankName: r.bankName,
      accountNumber: r.accountNumber,
      iban: r.iban,
      swiftCode: r.swiftCode,
      currency: r.currency || 'EGP',
      openingBalance: Number(r.openingBalance || 0),
      currentBalance: Number(r.currentBalance || 0),
      glAccountId: r.glAccountId,
      glAccountCode: r.glAccountCode,
      glAccountName: r.glAccountName,
      branchId: r.branchId,
      branchName: r.branchName,
      isActive: r.isActive === 1,
      createdAt: r.createdAt,
    }));
  }

public saveBankAccount(input: Partial<BankAccount> & { accountName: string; bankName: string; accountNumber: string; glAccountId: string }): string {
    const actor = this.requireManage();
    if (!input.accountName?.trim()) throw new Error('اسم الحساب البنكي مطلوب.');
    if (!input.bankName?.trim()) throw new Error('اسم البنك مطلوب.');
    if (!input.accountNumber?.trim()) throw new Error('رقم الحساب مطلوب.');

    const glAcc = this.db.query<any>('SELECT id FROM chart_of_accounts WHERE id = ? AND is_active = 1', [input.glAccountId])[0];
    if (!glAcc) throw new Error('الحساب المحاسبي المحدد غير موجود أو موقوف.');

    if (input.id) {
      this.db.run(`
        UPDATE bank_accounts
        SET account_name = ?, bank_name = ?, account_number = ?, iban = ?, swift_code = ?,
            currency = ?, gl_account_id = ?, branch_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        input.accountName.trim(), input.bankName.trim(), input.accountNumber.trim(),
        input.iban?.trim() || null, input.swiftCode?.trim() || null, input.currency || 'EGP',
        input.glAccountId, input.branchId || null, input.isActive ? 1 : 0, input.id,
      ]);
      return input.id;
    } else {
      const id = `bank_${uuidv4().substring(0, 8)}`;
      this.db.run(`
        INSERT INTO bank_accounts (id, account_name, bank_name, account_number, iban, swift_code, currency, opening_balance, current_balance, gl_account_id, branch_id, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, input.accountName.trim(), input.bankName.trim(), input.accountNumber.trim(),
        input.iban?.trim() || null, input.swiftCode?.trim() || null, input.currency || 'EGP',
        round2(input.openingBalance || 0), round2(input.openingBalance || 0), input.glAccountId, input.branchId || null, 1,
      ]);
      return id;
    }
  }

public getUnreconciledBankTransactions(bankAccountId: string, asOfDate: string): Array<{
    id: string;
    journalLineId?: string;
    chequeId?: string;
    date: string;
    reference: string;
    description: string;
    type: 'DEPOSIT' | 'WITHDRAWAL';
    amount: number;
    isCleared: boolean;
  }> {
    this.requireView();
    const bank = this.db.query<any>('SELECT * FROM bank_accounts WHERE id = ?', [bankAccountId])[0];
    if (!bank) throw new Error('الحساب البنكي غير موجود.');

    // Fetch journal entry lines for this bank's GL account up to asOfDate not yet cleared
    const rows = this.db.query<any>(`
      SELECT l.id as journalLineId, e.entry_number as reference, e.date,
             COALESCE(l.description, e.description) as description,
             l.debit, l.credit
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.account_id = ? AND e.is_posted = 1 AND e.date <= ?
        AND l.id NOT IN (
          SELECT journal_line_id FROM bank_reconciliation_lines
          WHERE journal_line_id IS NOT NULL AND is_cleared = 1
        )
      ORDER BY e.date ASC
    `, [bank.glAccountId, asOfDate]);

    return rows.map(r => {
      const isDeposit = Number(r.debit) > 0;
      return {
        id: r.journalLineId,
        journalLineId: r.journalLineId,
        date: r.date,
        reference: r.reference,
        description: r.description,
        type: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
        amount: isDeposit ? Number(r.debit) : Number(r.credit),
        isCleared: false,
      };
    });
  }
}
