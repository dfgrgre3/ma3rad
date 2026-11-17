import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { InventoryCostingService } from './InventoryCostingService';
import { getStockLedgerBalanceSql } from './StockLedgerMovementPolicy';
import { round2 } from '../finance/financials';

/**
 * Transactions that move `inventory_transactions` but deliberately do NOT move
 * `warehouse_stock`: the quantity was already carved out of regular stock when
 * it was converted into special stock (damage/quarantine/discounted sale), so
 * the sale/void/return of that special stock only adjusts
 * `inventory_special_stocks.remaining_quantity_m2`.
 */
const SPECIAL_STOCK_TX_EXCLUSION = `('SPECIAL_STOCK_SALE', 'SPECIAL_STOCK_SALE_VOID', 'SPECIAL_STOCK_RETURN', 'SPECIAL_STOCK_RETURN_HOLD')`;

const STOCK_TRACKED_PRODUCT_JOIN = `JOIN products p ON p.id = %s.product_id
        AND p.product_type != 'SERVICE' AND COALESCE(p.base_unit, '') != 'SERVICE'`;

const QTY_TOLERANCE = 0.01;

export type StockAuditCheckKey =
  | 'STOCK_VS_LEDGER'
  | 'RESERVED_VS_RESERVATIONS'
  | 'FIFO_LAYERS'
  | 'BATCHES'
  | 'LOCATION_STOCK';

export type StockAuditStatus = 'MATCH' | 'DIFFERENCE' | 'INFO';

export interface StockAuditCheck {
  key: StockAuditCheckKey;
  label: string;
  /** Value stored on warehouse_stock (or its reserved/location counterpart). */
  book: number;
  /** Value derived from the source of truth being compared against. */
  ledger: number;
  difference: number;
  status: StockAuditStatus;
  note?: string;
}

export interface StockBalanceAuditRow {
  productId: string;
  productName: string;
  sku: string;
  productType: string;
  baseUnit: string;
  warehouseId: string;
  warehouseName: string;
  quantityM2: number;
  reservedM2: number;
  checks: StockAuditCheck[];
  status: 'MATCH' | 'DISCREPANCY';
  maxAbsDifference: number;
}

export interface StockBalanceAuditReport {
  generatedAt: string;
  costingMethod: string;
  warehouseId: string | null;
  scopeNote: string;
  totalPairs: number;
  matchedPairs: number;
  discrepancyPairs: number;
  checksSummary: Record<StockAuditCheckKey, { checked: number; matched: number; differences: number; info: number }>;
  rows: StockBalanceAuditRow[];
}

interface PairKey {
  productId: string;
  warehouseId: string;
}

interface StockSideRow extends PairKey {
  quantityM2: number;
  reservedM2: number;
  productName: string;
  sku: string;
  productType: string;
  baseUnit: string;
  warehouseName: string;
}

function pairKey(productId: string, warehouseId: string): string {
  return `${productId}${warehouseId}`;
}

function makeCheck(
  key: StockAuditCheckKey,
  label: string,
  book: number,
  ledger: number,
  note?: string,
  forceInfo = false,
): StockAuditCheck {
  const difference = round2(book - ledger);
  const diverged = Math.abs(difference) > QTY_TOLERANCE;
  return {
    key,
    label,
    book: round2(book),
    ledger: round2(ledger),
    difference,
    status: diverged ? (forceInfo ? 'INFO' : 'DIFFERENCE') : 'MATCH',
    note: diverged ? note : undefined,
  };
}

/**
 * Per-item audit comparing every balance source against the immutable movement
 * ledger (`inventory_transactions`) and the derived balances that must agree
 * with it:
 *
 *  - STOCK_VS_LEDGER:         warehouse_stock.quantity_m2 vs SUM(transaction qty)
 *  - RESERVED_VS_RESERVATIONS: warehouse_stock.reserved_m2 vs SUM(ACTIVE holds)
 *  - FIFO_LAYERS:             warehouse_stock.quantity_m2 vs SUM(cost layers left)
 *                             (only when costingMethod = 'FIFO')
 *  - BATCHES:                 warehouse_stock.quantity_m2 vs SUM(batch remaining)
 *                             (informational: untracked receipts are allowed)
 *  - LOCATION_STOCK:          SUM(bin allocations) must never exceed on-hand qty
 *
 * Read-only. Requires `ui.inventory.hub.view` and respects branch/company scope.
 */
export class StockBalanceAuditService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  public runAudit(options: { warehouseId?: string; includeMatched?: boolean } = {}): StockBalanceAuditReport {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.view');
    if (options.warehouseId) this.branchAccess.requireWarehouseAccess(options.warehouseId, actor);

    const warehouseScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
    const companyScope = this.branchAccess.companyScope('w.company_id', actor);
    const scopeClause = `${warehouseScope.clause} AND ${companyScope.clause}`;
    const scopeParams = [...warehouseScope.params, ...companyScope.params];
    const warehouseFilter = options.warehouseId ? ' AND w.id = ?' : '';
    const warehouseParams = options.warehouseId ? [options.warehouseId] : [];
    const params = [...scopeParams, ...warehouseParams];

    const stockRows = this.db.query<StockSideRow>(`
      SELECT ws.product_id AS productId, ws.warehouse_id AS warehouseId,
             ws.quantity_m2 AS quantityM2, ws.reserved_m2 AS reservedM2,
             p.name AS productName, p.sku AS sku,
             p.product_type AS productType, p.base_unit AS baseUnit,
             w.name AS warehouseName
      FROM warehouse_stock ws
      JOIN products p ON p.id = ws.product_id
        AND p.product_type != 'SERVICE' AND COALESCE(p.base_unit, '') != 'SERVICE'
      JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE ${scopeClause}${warehouseFilter}
    `, params);

    const balanceSql = getStockLedgerBalanceSql('it');
    const ledgerRows = this.db.query<{ productId: string; warehouseId: string; ledgerQty: number }>(`
      SELECT it.product_id AS productId, it.warehouse_id AS warehouseId,
             SUM(${balanceSql}) AS ledgerQty
      FROM inventory_transactions it
      JOIN warehouses w ON w.id = it.warehouse_id
      ${STOCK_TRACKED_PRODUCT_JOIN.replace('%s', 'it')}
      WHERE COALESCE(it.reference_type, '') NOT IN ${SPECIAL_STOCK_TX_EXCLUSION}
        AND ${scopeClause}${warehouseFilter}
      GROUP BY it.product_id, it.warehouse_id
    `, params);

    const reservedRows = this.db.query<{ productId: string; warehouseId: string; reservedQty: number }>(`
      SELECT r.product_id AS productId, r.warehouse_id AS warehouseId,
             SUM(r.quantity_m2) AS reservedQty
      FROM stock_reservations r
      JOIN warehouses w ON w.id = r.warehouse_id
      ${STOCK_TRACKED_PRODUCT_JOIN.replace('%s', 'r')}
      WHERE r.status = 'ACTIVE'
        AND ${scopeClause}${warehouseFilter}
      GROUP BY r.product_id, r.warehouse_id
    `, params);

    const costingMethod = InventoryCostingService.costingMethod(this.db);
    const layerRows = costingMethod === 'FIFO'
      ? this.db.query<{ productId: string; warehouseId: string; layerQty: number }>(`
          SELECT icl.product_id AS productId, icl.warehouse_id AS warehouseId,
                 SUM(icl.quantity_remaining) AS layerQty
          FROM inventory_cost_layers icl
          JOIN warehouses w ON w.id = icl.warehouse_id
          ${STOCK_TRACKED_PRODUCT_JOIN.replace('%s', 'icl')}
          WHERE ${scopeClause}${warehouseFilter}
          GROUP BY icl.product_id, icl.warehouse_id
        `, params)
      : [];

    const batchRows = this.db.query<{ productId: string; warehouseId: string; batchQty: number; batchCount: number }>(`
      SELECT pb.product_id AS productId, pb.warehouse_id AS warehouseId,
             SUM(pb.quantity_remaining_m2) AS batchQty, COUNT(*) AS batchCount
      FROM product_batches pb
      JOIN warehouses w ON w.id = pb.warehouse_id
      ${STOCK_TRACKED_PRODUCT_JOIN.replace('%s', 'pb')}
      WHERE ${scopeClause}${warehouseFilter}
      GROUP BY pb.product_id, pb.warehouse_id
    `, params);

    const locationRows = this.db.query<{ productId: string; warehouseId: string; locationQty: number }>(`
      SELECT pls.product_id AS productId, wl.warehouse_id AS warehouseId,
             SUM(pls.quantity_m2) AS locationQty
      FROM product_location_stock pls
      JOIN warehouse_locations wl ON wl.id = pls.location_id
      JOIN warehouses w ON w.id = wl.warehouse_id
      ${STOCK_TRACKED_PRODUCT_JOIN.replace('%s', 'pls')}
      WHERE ${scopeClause}${warehouseFilter}
      GROUP BY pls.product_id, wl.warehouse_id
    `, params);

    const ledgerByPair = new Map(ledgerRows.map((row) => [pairKey(row.productId, row.warehouseId), row]));
    const reservedByPair = new Map(reservedRows.map((row) => [pairKey(row.productId, row.warehouseId), row]));
    const layerByPair = new Map(layerRows.map((row) => [pairKey(row.productId, row.warehouseId), row]));
    const batchByPair = new Map(batchRows.map((row) => [pairKey(row.productId, row.warehouseId), row]));
    const locationByPair = new Map(locationRows.map((row) => [pairKey(row.productId, row.warehouseId), row]));

    // Union of keys: stock rows plus pairs that only exist on the ledger side
    // (e.g. a stock row was removed while movements remain).
    const pairs = new Map<string, PairKey & { stock?: StockSideRow }>();
    const addPair = (productId: string, warehouseId: string, stock?: StockSideRow) => {
      const key = pairKey(productId, warehouseId);
      if (!pairs.has(key)) pairs.set(key, { productId, warehouseId, stock });
    };
    for (const row of stockRows) addPair(row.productId, row.warehouseId, row);
    for (const row of ledgerRows) addPair(row.productId, row.warehouseId);
    for (const row of reservedRows) addPair(row.productId, row.warehouseId);

    const missingProductIds = [...new Set(
      [...pairs.values()].filter((pair) => !pair.stock).map((pair) => pair.productId)
    )];
    const productInfo = new Map<string, { name: string; sku: string; productType: string; baseUnit: string }>();
    if (missingProductIds.length) {
      const placeholders = missingProductIds.map(() => '?').join(', ');
      const infos = this.db.query<{ id: string; name: string; sku: string; productType: string; baseUnit: string }>(
        `SELECT id, name, sku, product_type AS productType, base_unit AS baseUnit
         FROM products WHERE id IN (${placeholders})`,
        missingProductIds
      );
      for (const info of infos) {
        productInfo.set(info.id, { name: info.name, sku: info.sku, productType: info.productType, baseUnit: info.baseUnit });
      }
    }
    const missingWarehouseIds = [...new Set(
      [...pairs.values()].filter((pair) => !pair.stock).map((pair) => pair.warehouseId)
    )];
    const warehouseNames = new Map<string, string>();
    if (missingWarehouseIds.length) {
      const placeholders = missingWarehouseIds.map(() => '?').join(', ');
      const names = this.db.query<{ id: string; name: string }>(
        `SELECT id, name FROM warehouses WHERE id IN (${placeholders})`,
        missingWarehouseIds
      );
      for (const name of names) warehouseNames.set(name.id, name.name);
    }

    const checksSummary: StockBalanceAuditReport['checksSummary'] = {
      STOCK_VS_LEDGER: { checked: 0, matched: 0, differences: 0, info: 0 },
      RESERVED_VS_RESERVATIONS: { checked: 0, matched: 0, differences: 0, info: 0 },
      FIFO_LAYERS: { checked: 0, matched: 0, differences: 0, info: 0 },
      BATCHES: { checked: 0, matched: 0, differences: 0, info: 0 },
      LOCATION_STOCK: { checked: 0, matched: 0, differences: 0, info: 0 },
    };
    const tally = (check: StockAuditCheck) => {
      const bucket = checksSummary[check.key];
      bucket.checked += 1;
      if (check.status === 'MATCH') bucket.matched += 1;
      else if (check.status === 'INFO') bucket.info += 1;
      else bucket.differences += 1;
    };

    const rows: StockBalanceAuditRow[] = [];
    let matchedPairs = 0;
    let discrepancyCount = 0;

    for (const pair of pairs.values()) {
      const key = pairKey(pair.productId, pair.warehouseId);
      const stock = pair.stock;
      const bookQty = Number(stock?.quantityM2 || 0);
      const bookReserved = Number(stock?.reservedM2 || 0);
      const ledgerQty = Number(ledgerByPair.get(key)?.ledgerQty || 0);
      const reservedLedger = Number(reservedByPair.get(key)?.reservedQty || 0);
      const layerQty = Number(layerByPair.get(key)?.layerQty || 0);
      const batch = batchByPair.get(key);
      const locationQty = Number(locationByPair.get(key)?.locationQty || 0);

      const checks: StockAuditCheck[] = [
        makeCheck(
          'STOCK_VS_LEDGER',
          'رصيد المخزن مقابل سجل الحركات',
          bookQty,
          ledgerQty,
          'يوجد فرق بين رصيد warehouse_stock ومجموع حركات inventory_transactions؛ تتبع آخر الحركات غير المتزامنة.',
        ),
        makeCheck(
          'RESERVED_VS_RESERVATIONS',
          'الكمية المحجوزة مقابل الحجوزات النشطة',
          bookReserved,
          reservedLedger,
          'يوجد حجز نشط في stock_reservations غير منعكس على warehouse_stock.reserved_m2 أو العكس.',
        ),
      ];

      if (costingMethod === 'FIFO') {
        checks.push(makeCheck(
          'FIFO_LAYERS',
          'الرصيد الفعلي مقابل طبقات تكلفة FIFO',
          bookQty,
          layerQty,
          'مجموع الكميات المتبقية في inventory_cost_layers لا يطابق رصيد المخزن؛ تكلفة البيع قد تكون غير دقيقة.',
        ));
      }

      if (batch && Number(batch.batchCount) > 0) {
        checks.push(makeCheck(
          'BATCHES',
          'الرصيد الفعلي مقابل رصيد الدفعات المسجلة',
          bookQty,
          Number(batch.batchQty),
          'الدفعات المسجلة لا تغطي كامل الرصيد؛ مقبول عند وجود استلامات بدون دفعة، لكنه يعني أن بعض الكميات بلا تتبع نغمة/عيار.',
          true,
        ));
      }

      if (locationQty > 0) {
        // Directional check: bins may legitimately hold less than on-hand
        // (unassigned stock), so only an excess over the warehouse balance
        // is a discrepancy.
        const locationDifference = round2(locationQty - bookQty);
        checks.push({
          key: 'LOCATION_STOCK',
          label: 'مجموع كميات الرفوف مقابل الرصيد الكلي',
          book: round2(bookQty),
          ledger: round2(locationQty),
          difference: locationDifference,
          status: locationDifference > QTY_TOLERANCE ? 'DIFFERENCE' : 'MATCH',
          note: locationDifference > QTY_TOLERANCE
            ? 'مجموع التخصيصات على الرفوف (product_location_stock) يتجاوز الرصيد الفعلي في المخزن.'
            : undefined,
        });
      }

      for (const check of checks) tally(check);

      const hasDifference = checks.some((check) => check.status === 'DIFFERENCE');
      const maxAbsDifference = Math.max(...checks.map((check) => Math.abs(check.difference)));
      if (hasDifference) discrepancyCount += 1;
      else matchedPairs += 1;

      const row: StockBalanceAuditRow = {
        productId: pair.productId,
        productName: stock?.productName || productInfo.get(pair.productId)?.name || pair.productId,
        sku: stock?.sku || productInfo.get(pair.productId)?.sku || '',
        productType: stock?.productType || productInfo.get(pair.productId)?.productType || '',
        baseUnit: stock?.baseUnit || productInfo.get(pair.productId)?.baseUnit || '',
        warehouseId: pair.warehouseId,
        warehouseName: stock?.warehouseName || warehouseNames.get(pair.warehouseId) || pair.warehouseId,
        quantityM2: round2(bookQty),
        reservedM2: round2(bookReserved),
        checks,
        status: hasDifference ? 'DISCREPANCY' : 'MATCH',
        maxAbsDifference: round2(maxAbsDifference),
      };
      if (options.includeMatched || hasDifference) rows.push(row);
    }

    rows.sort((a, b) => b.maxAbsDifference - a.maxAbsDifference);

    return {
      generatedAt: new Date().toISOString(),
      costingMethod,
      warehouseId: options.warehouseId || null,
      scopeNote: options.warehouseId
        ? 'نطاق التدقيق: المخزن المحدد فقط.'
        : 'نطاق التدقيق: جميع المخازن ضمن فروع وشركات المستخدم المصرح بها.',
      totalPairs: pairs.size,
      matchedPairs,
      discrepancyPairs: discrepancyCount,
      checksSummary,
      rows,
    };
  }
}

export const stockBalanceAuditService = new StockBalanceAuditService();