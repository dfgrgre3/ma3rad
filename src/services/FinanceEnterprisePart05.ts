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
import { FinanceEnterprisePart04 } from './FinanceEnterprisePart04';

export abstract class FinanceEnterprisePart05 extends FinanceEnterprisePart04 {
public transitionChequeStatus(
    chequeId: string,
    toStatus: ExtendedChequeStatus,
    options: {
      bankAccountId?: string;
      bounceReason?: string;
      bounceFee?: number;
      date?: string;
      notes?: string;
    } = {}
  ): void {
    const actor = this.requireManage();
    const chq = this.db.query<Cheque & { bankAccountId?: string; journalEntryId?: string }>('SELECT * FROM cheques WHERE id = ?', [chequeId])[0];
    if (!chq) throw new Error('الشيك غير موجود.');

    const fromStatus = chq.status;
    const actionDate = options.date || localDateString();
    let journalEntryId: string | null = null;

    this.db.executeTransaction((tx) => {
      const dbInstance = tx.getDatabase();

      if (toStatus === 'CLEARED') {
        if (chq.type === 'RECEIVED') {
          // Received Cheque Clearance: Dr Bank (1102) / Cr Cheques Under Collection (1105)
          journalEntryId = postLedgerEntry(dbInstance, {
            date: actionDate,
            description: `تحصيل شيك وارد رقم ${chq.chequeNumber} من ${chq.partyName}`,
            referenceType: 'CHEQUE_CLEARANCE',
            referenceId: chequeId,
            createdBy: actor.id,
            lines: [
              { accountCode: '1102', debit: Number(chq.amount), credit: 0 },
              { accountCode: '1105', debit: 0, credit: Number(chq.amount) },
            ],
          });
        } else {
          // Issued Cheque Clearance: Dr Cheques Payable (2105) / Cr Bank (1102)
          journalEntryId = postLedgerEntry(dbInstance, {
            date: actionDate,
            description: `صرف شيك صادر مسدد رقم ${chq.chequeNumber} لصالح ${chq.partyName}`,
            referenceType: 'CHEQUE_PAYABLE_CLEARANCE',
            referenceId: chequeId,
            createdBy: actor.id,
            lines: [
              { accountCode: '2105', debit: Number(chq.amount), credit: 0 },
              { accountCode: '1102', debit: 0, credit: Number(chq.amount) },
            ],
          });
        }
        tx.run('UPDATE cheques SET status = ?, cleared_at = ?, clearing_entry_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [toStatus, actionDate, journalEntryId, chequeId]);
      } else if (toStatus === 'BOUNCED') {
        // Bounced Cheque: Reverse to Customer/Supplier Account + optional bounce fee
        const bounceFee = Number(options.bounceFee || 0);
        const lines = [
          { accountCode: chq.type === 'RECEIVED' ? '1103' : '2101', debit: Number(chq.amount), credit: 0 },
          { accountCode: '1105', debit: 0, credit: Number(chq.amount) },
        ];
        if (bounceFee > 0) {
          lines.push(
            { accountCode: '1103', debit: bounceFee, credit: 0 },
            { accountCode: '5206', debit: 0, credit: bounceFee } // Bank bounce fee / penalty
          );
        }

        journalEntryId = postLedgerEntry(dbInstance, {
          date: actionDate,
          description: `ارتداد شيك رقم ${chq.chequeNumber} - ${options.bounceReason || 'بدون رصيد'}`,
          referenceType: 'CHEQUE_BOUNCE',
          referenceId: `${chequeId}_bounce_${uuidv4().substring(0, 4)}`,
          createdBy: actor.id,
          lines,
        });

        tx.run(`
          UPDATE cheques
          SET status = ?, bounced_at = ?, bounce_reason = ?, bounce_fee = ?, bounce_entry_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [toStatus, actionDate, options.bounceReason || 'ارتداد بنكي', bounceFee, journalEntryId, chequeId]);
      } else if (toStatus === 'DEPOSITED') {
        tx.run(`
          UPDATE cheques
          SET status = ?, deposited_at = ?, bank_account_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [toStatus, actionDate, options.bankAccountId || null, chequeId]);
      } else {
        tx.run('UPDATE cheques SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [toStatus, chequeId]);
      }

      // Record in history table
      tx.run(`
        INSERT INTO cheque_status_history (id, cheque_id, from_status, to_status, changed_by, journal_entry_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        `csh_${uuidv4().substring(0, 8)}`, chequeId, fromStatus, toStatus,
        actor.id, journalEntryId, options.notes || options.bounceReason || null,
      ]);
    });
  }

public getChequeHistory(chequeId: string): ChequeStatusHistory[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT csh.*, u.full_name as changedByName
      FROM cheque_status_history csh
      JOIN users u ON csh.changed_by = u.id
      WHERE csh.cheque_id = ?
      ORDER BY csh.changed_at DESC
    `, [chequeId]).map(r => ({
      id: r.id,
      chequeId: r.cheque_id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      changedAt: r.changed_at,
      changedBy: r.changed_by,
      changedByName: r.changedByName,
      journalEntryId: r.journal_entry_id,
      notes: r.notes,
    }));
  }
}
