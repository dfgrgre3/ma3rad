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
import { FinanceEnterprisePart03 } from './FinanceEnterprisePart03';

export abstract class FinanceEnterprisePart04 extends FinanceEnterprisePart03 {
public createBankReconciliation(input: {
    bankAccountId: string;
    statementDate: string;
    statementBalance: number;
    clearedTransactions: Array<{ journalLineId?: string; chequeId?: string; date: string; reference: string; description: string; type: 'DEPOSIT' | 'WITHDRAWAL'; amount: number }>;
    notes?: string;
  }): BankReconciliation {
    const actor = this.requireManage();
    const bank = this.db.query<any>('SELECT * FROM bank_accounts WHERE id = ?', [input.bankAccountId])[0];
    if (!bank) throw new Error('الحساب البنكي غير موجود.');

    // Calculate current book balance from GL up to statement date
    const glRes = this.db.query<any>(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) as balance
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.account_id = ? AND e.is_posted = 1 AND e.date <= ?
    `, [bank.gl_account_id, input.statementDate])[0];
    const bookBalance = round2(Number(glRes?.balance || 0));

    const clearedDeposits = round2(input.clearedTransactions.filter(t => t.type === 'DEPOSIT').reduce((s, t) => s + t.amount, 0));
    const clearedWithdrawals = round2(input.clearedTransactions.filter(t => t.type === 'WITHDRAWAL').reduce((s, t) => s + t.amount, 0));

    // Reconciled balance = Statement Balance - Uncleared Deposits + Uncleared Cheques
    const unreconciledDifference = round2(Number(input.statementBalance) - bookBalance);

    const recId = `brec_${uuidv4().substring(0, 8)}`;
    const recNumber = `BR-${input.statementDate.slice(0, 7)}-${uuidv4().substring(0, 4).toUpperCase()}`;

    this.db.executeTransaction((tx) => {
      tx.run(`
        INSERT INTO bank_reconciliations (
          id, reconciliation_number, bank_account_id, statement_date,
          statement_balance, book_balance, unreconciled_difference,
          cleared_deposits, cleared_withdrawals, status, reconciled_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECONCILED', ?, ?)
      `, [
        recId, recNumber, input.bankAccountId, input.statementDate,
        round2(input.statementBalance), bookBalance, unreconciledDifference,
        clearedDeposits, clearedWithdrawals, actor.id, input.notes || null,
      ]);

      for (const t of input.clearedTransactions) {
        tx.run(`
          INSERT INTO bank_reconciliation_lines (
            id, reconciliation_id, journal_line_id, cheque_id, transaction_date,
            reference, description, type, amount, is_cleared, cleared_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `, [
          `brl_${uuidv4().substring(0, 8)}`, recId, t.journalLineId || null, t.chequeId || null,
          t.date, t.reference, t.description, t.type, round2(t.amount), input.statementDate,
        ]);
      }

      // Update bank account current_balance with statement balance if verified
      tx.run('UPDATE bank_accounts SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [round2(input.statementBalance), input.bankAccountId]);
    });

    return this.getBankReconciliationById(recId)!;
  }

public getBankReconciliations(bankAccountId?: string): BankReconciliation[] {
    this.requireView();
    let sql = `
      SELECT br.*, ba.account_name as bankAccountName, u1.full_name as reconciledByName, u2.full_name as approvedByName
      FROM bank_reconciliations br
      JOIN bank_accounts ba ON br.bank_account_id = ba.id
      JOIN users u1 ON br.reconciled_by = u1.id
      LEFT JOIN users u2 ON br.approved_by = u2.id
    `;
    const params: any[] = [];
    if (bankAccountId) {
      sql += ' WHERE br.bank_account_id = ?';
      params.push(bankAccountId);
    }
    sql += ' ORDER BY br.statement_date DESC';

    return this.db.query<any>(sql, params).map(r => ({
      id: r.id,
      reconciliationNumber: r.reconciliation_number,
      bankAccountId: r.bank_account_id,
      bankAccountName: r.bankAccountName,
      statementDate: r.statement_date,
      statementBalance: Number(r.statement_balance),
      bookBalance: Number(r.book_balance),
      unreconciledDifference: Number(r.unreconciled_difference),
      clearedDeposits: Number(r.cleared_deposits),
      clearedWithdrawals: Number(r.cleared_withdrawals),
      status: r.status,
      reconciledBy: r.reconciled_by,
      reconciledByName: r.reconciledByName,
      approvedBy: r.approved_by,
      approvedByName: r.approvedByName,
      notes: r.notes,
      createdAt: r.created_at,
    }));
  }

public getBankReconciliationById(id: string): BankReconciliation | null {
    this.requireView();
    const rows = this.getBankReconciliations();
    return rows.find(r => r.id === id) || null;
  }
}
