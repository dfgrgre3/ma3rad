import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { PermissionChecker } from '../auth/permissions/permissionChecker';
import { BranchAccessService } from '../auth/BranchAccessService';
import { StockLedgerMovementPolicy } from '../inventory/StockLedgerMovementPolicy';
import { InventoryService } from '../inventory/InventoryService';

export type AuditRunType =
  | 'STOCK_VS_TRANSACTIONS'
  | 'STOCK_VS_BATCHES'
  | 'GL_VS_JOURNAL'
  | 'JOURNAL_BALANCE_INTEGRITY'
  | 'INVENTORY_VS_GL'
  | 'FULL';

export interface AuditDiscrepancy {
  check: string;
  key?: string;
  expected?: number | string | null;
  actual?: number | string | null;
  variance?: number | null;
  severity: 'ERROR' | 'WARNING';
  details?: Record<string, unknown>;
}

export interface CheckResult {
  check: string;
  status: 'PASS' | 'DISCREPANCY' | 'ERROR';
  scanned: number;
  discrepancies: AuditDiscrepancy[];
  error?: string;
}

export interface AuditRunResult {
  id: string;
  runType: AuditRunType;
  scope: string;
  branchId: string | null;
  warehouseId: string | null;
  status: 'PASSED' | 'DISCREPANCY' | 'FAILED';
  startedAt: string;
  finishedAt: string;
  summary: Record<string, CheckResult>;
  discrepancyCount: number;
}

const MAX_DISCREPANCIES_PER_CHECK = 200;
const QTY_TOLERANCE = 0.01;
const MONEY_TOLERANCE = 0.01;

export class ConsistencyAuditService {
  private readonly db = DatabaseManager.getInstance();
  private readonly branchAccess = new BranchAccessService();

  private requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.view');
    return actor;
  }

  /**
   * Runs consistency checks and records the outcome in reconciliation_runs.
   * Read-only with respect to business data; only writes the audit row.
   */
  public runAudit(options: {
    runType?: AuditRunType;
    branchId?: string | null;
    warehouseId?: string | null;
  } = {}): AuditRunResult {
    const actor = this.requireView();
    const runType = options.runType || 'FULL';
    const branchId = options.branchId ?? this.branchAccess.getCurrentBranchId(actor);
    const warehouseId = options.warehouseId || null;
    const startedAt = new Date().toISOString();
    const runId = `rr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    this.db.run(
      `INSERT INTO reconciliation_runs (id, run_type, scope, branch_id, warehouse_id, started_at, status, triggered_by)
       VALUES (?, ?, ?, ?, ?, ?, 'RUNNING', ?)`,
      [runId, runType, branchId ? `branch:${branchId}` : 'ALL', branchId, warehouseId, startedAt, actor.id],
    );

    const results: Record<string, CheckResult> = {};
    const checks: Array<() => CheckResult> = [];
    if (runType === 'FULL' || runType === 'JOURNAL_BALANCE_INTEGRITY') {
      checks.push(() => this.checkJournalBalanceIntegrity(branchId));
    }
    if (runType === 'FULL' || runType === 'GL_VS_JOURNAL') {
      checks.push(() => this.checkGlVsJournal(branchId));
    }
    if (runType === 'FULL' || runType === 'STOCK_VS_TRANSACTIONS') {
      checks.push(() => this.checkStockVsTransactions(branchId, warehouseId));
    }
    if (runType === 'FULL' || runType === 'STOCK_VS_BATCHES') {
      checks.push(() => this.checkStockVsBatches(branchId, warehouseId));
    }
    if (runType === 'FULL' || runType === 'INVENTORY_VS_GL') {
      checks.push(() => this.checkInventoryVsGl(warehouseId));
    }

    const discrepancies: AuditDiscrepancy[] = [];
    for (const run of checks) {
      try {
        const result = run();
        results[result.check] = result;
        discrepancies.push(...result.discrepancies);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result: CheckResult = {
          check: 'UNKNOWN', status: 'ERROR', scanned: 0, discrepancies: [], error: message,
        };
        results[`error_${Object.keys(results).length}`] = result;
        discrepancies.push({ check: 'RUN', severity: 'ERROR', details: { message } });
      }
    }

    const hasDiscrepancy = Object.values(results).some((r) => r.status === 'DISCREPANCY' || r.status === 'ERROR');
    const status = hasDiscrepancy ? 'DISCREPANCY' : 'PASSED';
    const finishedAt = new Date().toISOString();

    this.db.run(
      `UPDATE reconciliation_runs
       SET finished_at = ?, status = ?, summary_json = ?, discrepancies_json = ?
       WHERE id = ?`,
      [
        finishedAt, status,
        JSON.stringify(results),
        JSON.stringify(discrepancies.slice(0, 1000)),
        runId,
      ],
    );

    return {
      id: runId,
      runType,
      scope: branchId ? `branch:${branchId}` : 'ALL',
      branchId,
      warehouseId,
      status,
      startedAt,
      finishedAt,
      summary: results,
      discrepancyCount: discrepancies.length,
    };
  }

  /**
   * Runs a FULL audit at most once per calendar day, and only when an
   * authenticated session with finance.view exists (e.g. app startup with
   * a restored session). Returns silently otherwise.
   */
  public runDailyCheck(): { ran: boolean; reason?: string } {
    const actor = AuthService.getCurrentUser();
    if (!actor || !PermissionChecker.can(actor, 'finance.view')) {
      return { ran: false, reason: 'no-authorized-session' };
    }
    const today = new Date().toISOString().slice(0, 10);
    const last = this.db.query<{ startedAt: string | null }>('SELECT started_at AS startedAt FROM reconciliation_runs ORDER BY started_at DESC LIMIT 1', [])[0];
    if (last?.startedAt && String(last.startedAt).slice(0, 10) === today) {
      return { ran: false, reason: 'already-ran-today' };
    }
    try {
      this.runAudit({ runType: 'FULL' });
      return { ran: true };
    } catch (error) {
      console.error('Daily consistency audit failed:', error);
      return { ran: false, reason: 'audit-failed' };
    }
  }
  public listRuns(limit = 50): Array<Record<string, unknown>> {
    this.requireView();
    return this.db.query<Record<string, unknown>>(
      `SELECT id, run_type AS runType, scope, branch_id AS branchId, warehouse_id AS warehouseId,
              started_at AS startedAt, finished_at AS finishedAt, status,
              LENGTH(discrepancies_json) AS discrepancyBytes, triggered_by AS triggeredBy
       FROM reconciliation_runs ORDER BY created_at DESC LIMIT ?`,
      [Math.max(1, Math.min(500, limit))],
    );
  }

  public getRun(id: string): Record<string, unknown> | null {
    this.requireView();
    const row = this.db.query<Record<string, unknown>>(
      `SELECT id, run_type AS runType, scope, branch_id AS branchId, warehouse_id AS warehouseId,
              started_at AS startedAt, finished_at AS finishedAt, status,
              summary_json AS summaryJson, discrepancies_json AS discrepanciesJson,
              triggered_by AS triggeredBy, created_at AS createdAt
       FROM reconciliation_runs WHERE id = ?`,
      [id],
    )[0];
    if (!row) return null;
    return {
      ...row,
      summary: row.summaryJson ? JSON.parse(String(row.summaryJson)) : {},
      discrepancies: row.discrepanciesJson ? JSON.parse(String(row.discrepanciesJson)) : [],
    };
  }

  // ------------------------------------------------------------------
  // Individual checks
  // ------------------------------------------------------------------

  /** Every posted journal entry must balance: header totals equal each other
   *  and equal the sum of their lines. */
  private checkJournalBalanceIntegrity(branchId: string | null): CheckResult {
    const branchFilter = branchId ? 'AND je.branch_id = ?' : '';
    const params = branchId ? [branchId] : [];
    const rows = this.db.query<Record<string, unknown>>(
      `SELECT je.id, je.entry_number AS entryNumber, je.date, je.branch_id AS branchId,
              je.total_debit / 100.0 AS totalDebit, je.total_credit / 100.0 AS totalCredit,
              COALESCE((SELECT SUM(l.debit) FROM journal_entry_lines l WHERE l.entry_id = je.id), 0) / 100.0 AS linesDebit,
              COALESCE((SELECT SUM(l.credit) FROM journal_entry_lines l WHERE l.entry_id = je.id), 0) / 100.0 AS linesCredit
       FROM journal_entries je
       WHERE je.is_posted = 1 ${branchFilter}`,
      params,
    );
    const discrepancies: AuditDiscrepancy[] = [];
    for (const row of rows) {
      const totalDebit = Number(row.totalDebit || 0);
      const totalCredit = Number(row.totalCredit || 0);
      const linesDebit = Number(row.linesDebit || 0);
      const linesCredit = Number(row.linesCredit || 0);
      const problems: string[] = [];
      if (Math.abs(totalDebit - totalCredit) > MONEY_TOLERANCE) problems.push('total_debit != total_credit');
      if (Math.abs(totalDebit - linesDebit) > MONEY_TOLERANCE) problems.push('total_debit != SUM(lines.debit)');
      if (Math.abs(totalCredit - linesCredit) > MONEY_TOLERANCE) problems.push('total_credit != SUM(lines.credit)');
      if (Math.abs(linesDebit - linesCredit) > MONEY_TOLERANCE) problems.push('SUM(debit) != SUM(credit)');
      if (problems.length) {
        discrepancies.push({
          check: 'JOURNAL_BALANCE_INTEGRITY',
          key: String(row.entryNumber || row.id),
          expected: `${totalDebit}/${totalCredit}`,
          actual: `${linesDebit}/${linesCredit}`,
          variance: Math.abs(totalDebit - linesDebit),
          severity: 'ERROR',
          details: { entryId: row.id, date: row.date, branchId: row.branchId, problems },
        });
        if (discrepancies.length >= MAX_DISCREPANCIES_PER_CHECK) break;
      }
    }
    return {
      check: 'JOURNAL_BALANCE_INTEGRITY',
      status: discrepancies.length ? 'DISCREPANCY' : 'PASS',
      scanned: rows.length,
      discrepancies,
    };
  }

  /** Cached chart_of_accounts.balance must equal the sum of posted journal
   *  lines (same definition migration 042 used to rebuild balances). */
  private checkGlVsJournal(_branchId: string | null): CheckResult {
    const rows = this.db.query<Record<string, unknown>>(
      `SELECT coa.id, coa.code, coa.name, coa.type, coa.balance / 100.0 AS balance,
              COALESCE((
                SELECT SUM((l.debit - l.credit) / 100.0)
                FROM journal_entry_lines l
                JOIN journal_entries e ON e.id = l.entry_id
                WHERE l.account_id = coa.id AND e.is_posted = 1
              ), 0) AS journalNet
       FROM chart_of_accounts coa`,
    );
    const discrepancies: AuditDiscrepancy[] = [];
    for (const row of rows) {
      const balance = Number(row.balance || 0);
      const journalNet = Number(row.journalNet || 0);
      const variance = Number((balance - journalNet).toFixed(2));
      if (Math.abs(variance) > MONEY_TOLERANCE) {
        discrepancies.push({
          check: 'GL_VS_JOURNAL',
          key: String(row.code || row.id),
          expected: journalNet,
          actual: balance,
          variance,
          severity: 'ERROR',
          details: { accountId: row.id, code: row.code, name: row.name, type: row.type },
        });
        if (discrepancies.length >= MAX_DISCREPANCIES_PER_CHECK) break;
      }
    }
    return {
      check: 'GL_VS_JOURNAL',
      status: discrepancies.length ? 'DISCREPANCY' : 'PASS',
      scanned: rows.length,
      discrepancies,
    };
  }

  /** warehouse_stock.quantity_m2 must equal the net signed sum of
   *  inventory_transactions for the same warehouse+product. */
  private checkStockVsTransactions(branchId: string | null, warehouseId: string | null): CheckResult {
    const balanceSql = StockLedgerMovementPolicy.balanceSql;
    const whBranchClause = branchId
      ? `AND (w.branch_id = ? OR EXISTS (SELECT 1 FROM branch_warehouses bw WHERE bw.warehouse_id = w.id AND bw.branch_id = ?))`
      : '';
    const whParams = branchId ? [branchId, branchId] : [];
    const whFilter = warehouseId ? 'AND ws.warehouse_id = ?' : '';
    const whParams2 = [...whParams, ...(warehouseId ? [warehouseId] : [])];

    const stockRows = this.db.query<Record<string, unknown>>(
      `SELECT ws.warehouse_id AS warehouseId, ws.product_id AS productId,
              ws.quantity_m2 AS stockQty, COALESCE(m.ledgerQty, 0) AS ledgerQty
       FROM warehouse_stock ws
       JOIN warehouses w ON w.id = ws.warehouse_id
       LEFT JOIN (
         SELECT it.warehouse_id, it.product_id, SUM(${balanceSql}) AS ledgerQty
         FROM inventory_transactions it
         AND COALESCE(it.reference_type, '') NOT IN ('SPECIAL_STOCK_SALE', 'SPECIAL_STOCK_SALE_VOID', 'SPECIAL_STOCK_RETURN', 'SPECIAL_STOCK_RETURN_HOLD')
         GROUP BY it.warehouse_id, it.product_id
       ) m ON m.warehouse_id = ws.warehouse_id AND m.product_id = ws.product_id
       WHERE 1 = 1 ${whBranchClause} ${whFilter}`,
      whParams2,
    );

    const discrepancies: AuditDiscrepancy[] = [];
    let scanned = stockRows.length;
    for (const row of stockRows) {
      const stockQty = Number(row.stockQty || 0);
      const ledgerQty = Number(row.ledgerQty || 0);
      const variance = Number((stockQty - ledgerQty).toFixed(3));
      if (Math.abs(variance) > QTY_TOLERANCE) {
        discrepancies.push({
          check: 'STOCK_VS_TRANSACTIONS',
          key: `${row.warehouseId}/${row.productId}`,
          expected: ledgerQty,
          actual: stockQty,
          variance,
          severity: 'ERROR',
          details: { warehouseId: row.warehouseId, productId: row.productId },
        });
        if (discrepancies.length >= MAX_DISCREPANCIES_PER_CHECK) break;
      }
    }

    // Movements whose warehouse+product pair has no stock row at all.
    const orphanFilter = warehouseId ? 'AND m.warehouse_id = ?' : '';
    const orphanParams = [...whParams, ...(warehouseId ? [warehouseId] : [])];
    const orphans = this.db.query<Record<string, unknown>>(
      `SELECT m.warehouse_id AS warehouseId, m.product_id AS productId, m.ledgerQty
       FROM (
         SELECT it.warehouse_id, it.product_id, SUM(${balanceSql}) AS ledgerQty
         FROM inventory_transactions it
         AND COALESCE(it.reference_type, '') NOT IN ('SPECIAL_STOCK_SALE', 'SPECIAL_STOCK_SALE_VOID', 'SPECIAL_STOCK_RETURN', 'SPECIAL_STOCK_RETURN_HOLD')
         GROUP BY it.warehouse_id, it.product_id
       ) m
       JOIN warehouses w ON w.id = m.warehouse_id
       LEFT JOIN warehouse_stock ws
         ON ws.warehouse_id = m.warehouse_id AND ws.product_id = m.product_id
       WHERE ws.product_id IS NULL ${whBranchClause} ${orphanFilter}`,
      orphanParams,
    );
    scanned += orphans.length;
    for (const row of orphans) {
      discrepancies.push({
        check: 'STOCK_VS_TRANSACTIONS',
        key: `orphan:${row.warehouseId}/${row.productId}`,
        expected: 0,
        actual: Number(row.ledgerQty || 0),
        variance: Number(row.ledgerQty || 0),
        severity: 'ERROR',
        details: { warehouseId: row.warehouseId, productId: row.productId, note: 'ledger movements without a stock row' },
      });
      if (discrepancies.length >= MAX_DISCREPANCIES_PER_CHECK) break;
    }

    return {
      check: 'STOCK_VS_TRANSACTIONS',
      status: discrepancies.length ? 'DISCREPANCY' : 'PASS',
      scanned,
      discrepancies,
    };
  }

  /** For batch-tracked stock, SUM(product_batches.quantity_remaining_m2) must
   *  match warehouse_stock.quantity_m2 per warehouse+product. Products with
   *  no batches are out of scope for this check. */
  private checkStockVsBatches(branchId: string | null, warehouseId: string | null): CheckResult {
    const whBranchClause = branchId
      ? `AND (w.branch_id = ? OR EXISTS (SELECT 1 FROM branch_warehouses bw WHERE bw.warehouse_id = w.id AND bw.branch_id = ?))`
      : '';
    const whFilter = warehouseId ? 'AND b.warehouse_id = ?' : '';
    const params = [
      ...(whBranchClause ? [branchId, branchId] : []),
      ...(warehouseId ? [warehouseId] : []),
    ];

    const rows = this.db.query<Record<string, unknown>>(
      `SELECT b.warehouse_id AS warehouseId, b.product_id AS productId,
              SUM(b.quantity_remaining_m2) AS batchQty, ws.quantity_m2 AS stockQty
       FROM product_batches b
       JOIN warehouse_stock ws
         ON ws.warehouse_id = b.warehouse_id AND ws.product_id = b.product_id
       JOIN warehouses w ON w.id = b.warehouse_id
       WHERE 1 = 1 ${whBranchClause} ${whFilter}
       GROUP BY b.warehouse_id, b.product_id`,
      params,
    );

    const discrepancies: AuditDiscrepancy[] = [];
    for (const row of rows) {
      const batchQty = Number(row.batchQty || 0);
      const stockQty = Number(row.stockQty || 0);
      const variance = Number((batchQty - stockQty).toFixed(3));
      if (Math.abs(variance) > QTY_TOLERANCE) {
        discrepancies.push({
          check: 'STOCK_VS_BATCHES',
          key: `${row.warehouseId}/${row.productId}`,
          expected: batchQty,
          actual: stockQty,
          variance,
          severity: 'WARNING',
          details: { warehouseId: row.warehouseId, productId: row.productId },
        });
        if (discrepancies.length >= MAX_DISCREPANCIES_PER_CHECK) break;
      }
    }
    return {
      check: 'STOCK_VS_BATCHES',
      status: discrepancies.length ? 'DISCREPANCY' : 'PASS',
      scanned: rows.length,
      discrepancies,
    };
  }

  /** Physical stock vs FIFO cost layers vs GL account 1104, reusing the
   *  canonical inventory reconciliation logic. */
  private checkInventoryVsGl(warehouseId: string | null): CheckResult {
    const reconciliation = new InventoryService().reconcileInventoryWithGL(warehouseId || undefined);
    const status = reconciliation?.status === 'BALANCED' ? 'PASS' : 'DISCREPANCY';
    const discrepancies: AuditDiscrepancy[] = [];
    if (status === 'DISCREPANCY') {
      for (const reason of reconciliation.unmatchableReasons || []) {
        discrepancies.push({
          check: 'INVENTORY_VS_GL',
          severity: 'WARNING',
          details: { reason },
        });
      }
      if (!discrepancies.length) {
        discrepancies.push({
          check: 'INVENTORY_VS_GL',
          severity: 'WARNING',
          details: { status: reconciliation.status },
        });
      }
    }
    return {
      check: 'INVENTORY_VS_GL',
      status,
      scanned: 1,
      discrepancies: discrepancies.slice(0, MAX_DISCREPANCIES_PER_CHECK),
    };
  }
}

export default ConsistencyAuditService;
