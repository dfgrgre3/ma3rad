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
import { FinanceEnterprisePart08 } from './FinanceEnterprisePart08';

export abstract class FinanceEnterprisePart09 extends FinanceEnterprisePart08 {
public getPaymentGateways(): PaymentGateway[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT pg.*, coa.code as glAccountCode
      FROM payment_gateways pg
      JOIN chart_of_accounts coa ON pg.gl_account_id = coa.id
      ORDER BY pg.is_active DESC, pg.name ASC
    `).map(r => ({
      id: r.id,
      name: r.name,
      providerCode: r.provider_code,
      glAccountId: r.gl_account_id,
      glAccountCode: r.glAccountCode,
      commissionRate: Number(r.commission_rate),
      fixedFee: Number(r.fixed_fee),
      settlementPeriodDays: Number(r.settlement_period_days),
      isActive: r.is_active === 1,
      configJson: r.config_json,
      createdAt: r.created_at,
    }));
  }

public savePaymentGateway(input: Partial<PaymentGateway> & { name: string; providerCode: string; glAccountId: string }): string {
    const actor = this.requireManage();
    if (!input.name.trim()) throw new Error('اسم بوابة الدفع مطلوب.');

    if (input.id) {
      this.db.run(`
        UPDATE payment_gateways
        SET name = ?, provider_code = ?, gl_account_id = ?, commission_rate = ?, fixed_fee = ?,
            settlement_period_days = ?, is_active = ?
        WHERE id = ?
      `, [
        input.name.trim(), input.providerCode.trim(), input.glAccountId,
        Number(input.commissionRate || 0), Number(input.fixedFee || 0),
        Number(input.settlementPeriodDays || 1), input.isActive ? 1 : 0, input.id,
      ]);
      return input.id;
    } else {
      const id = `gw_${uuidv4().substring(0, 8)}`;
      this.db.run(`
        INSERT INTO payment_gateways (id, name, provider_code, gl_account_id, commission_rate, fixed_fee, settlement_period_days, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        id, input.name.trim(), input.providerCode.trim(), input.glAccountId,
        Number(input.commissionRate || 0), Number(input.fixedFee || 0), Number(input.settlementPeriodDays || 1),
      ]);
      return id;
    }
  }

public getPaymentGatewaySettlements(): PaymentGatewaySettlement[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT s.*, pg.name as gatewayName, ba.account_name as bankAccountName, u.full_name as createdByName
      FROM payment_gateway_settlements s
      JOIN payment_gateways pg ON s.gateway_id = pg.id
      JOIN bank_accounts ba ON s.bank_account_id = ba.id
      JOIN users u ON s.created_by = u.id
      ORDER BY s.settlement_date DESC
    `).map(r => ({
      id: r.id,
      settlementNumber: r.settlement_number,
      gatewayId: r.gateway_id,
      gatewayName: r.gatewayName,
      settlementDate: r.settlement_date,
      grossAmount: Number(r.gross_amount),
      commissionAmount: Number(r.commission_amount),
      taxDeduction: Number(r.tax_deduction),
      netAmount: Number(r.net_amount),
      bankAccountId: r.bank_account_id,
      bankAccountName: r.bankAccountName,
      journalEntryId: r.journal_entry_id,
      status: r.status,
      notes: r.notes,
      createdBy: r.created_by,
      createdByName: r.createdByName,
      createdAt: r.created_at,
    }));
  }

public recordGatewaySettlement(input: {
    gatewayId: string;
    settlementDate: string;
    grossAmount: number;
    commissionAmount: number;
    taxDeduction?: number;
    bankAccountId: string;
    notes?: string;
  }): string {
    const actor = this.requireManage();
    const gateway = this.db.query<any>('SELECT * FROM payment_gateways WHERE id = ?', [input.gatewayId])[0];
    if (!gateway) throw new Error('بوابة الدفع غير موجودة.');
    const bank = this.db.query<any>('SELECT * FROM bank_accounts WHERE id = ?', [input.bankAccountId])[0];
    if (!bank) throw new Error('الحساب البنكي غير موجود.');

    const gross = round2(input.grossAmount);
    const comm = round2(input.commissionAmount);
    const tax = round2(input.taxDeduction || 0);
    const net = round2(gross - comm - tax);
    if (net <= 0) throw new Error('صافي مبلغ التسوية يجب أن يكون أكبر من صفر.');

    const settlementId = `pgs_${uuidv4().substring(0, 8)}`;
    const settlementNumber = `SETTLE-${input.settlementDate.replace(/-/g, '')}-${uuidv4().substring(0, 4).toUpperCase()}`;

    let jvId: string | null = null;
    this.db.executeTransaction((tx) => {
      // 1. Post JV:
      // Dr Bank Account (1102): net
      // Dr Payment Gateway Fees (5207): comm + tax
      // Cr Gateway Receivable / Clearing (1106): gross
      jvId = postLedgerEntry(tx.getDatabase(), {
        date: input.settlementDate,
        description: `تسوية مستحقات بوابة الدفع ${gateway.name} بإيداع بنكي`,
        referenceType: 'GATEWAY_SETTLEMENT',
        referenceId: settlementId,
        createdBy: actor.id,
        lines: [
          { accountCode: '1102', debit: net, credit: 0 },
          { accountCode: '5207', debit: round2(comm + tax), credit: 0 },
          { accountCode: '1106', debit: 0, credit: gross },
        ],
      });

      // 2. Insert settlement record
      tx.run(`
        INSERT INTO payment_gateway_settlements (
          id, settlement_number, gateway_id, settlement_date, gross_amount,
          commission_amount, tax_deduction, net_amount, bank_account_id,
          journal_entry_id, status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SETTLED', ?, ?)
      `, [
        settlementId, settlementNumber, input.gatewayId, input.settlementDate,
        gross, comm, tax, net, input.bankAccountId, jvId, input.notes || null, actor.id,
      ]);

      // 3. Update bank account balance
      tx.run('UPDATE bank_accounts SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [net, input.bankAccountId]);
    });

    return settlementId;
  }
}
