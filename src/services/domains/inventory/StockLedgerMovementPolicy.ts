/**
 * Single source of truth for stock ledger and warehouse stock movement calculations.
 *
 * Rules:
 * 1. TRANSFER_LOSS: A legacy transfer loss is a detail of quantity already shipped: dispatch
 *    has already removed the full shipped quantity from the source warehouse. The
 *    TRANSFER_LOSS movement must therefore stay visible for reporting but must
 *    not be subtracted from the source warehouse running balance or total quantity_out a second time.
 *    However, in a transit warehouse, the loss is recorded there and must reduce the in-transit balance
 *    (it is the only movement that removes the lost units from transit), so it is counted normally.
 */

/**
 * Returns SQL fragment for the signed balance contribution of an inventory transaction row.
 * Parameter `alias` is the table alias of `inventory_transactions` (defaults to 'it').
 */
export function getStockLedgerBalanceSql(alias = 'it'): string {
  return `
    CASE
      WHEN COALESCE(${alias}.reference_type, '') = 'TRANSFER_LOSS'
        AND NOT EXISTS (
          SELECT 1 FROM stock_transfers st
          WHERE st.id = ${alias}.reference_id
            AND st.transit_warehouse_id = ${alias}.warehouse_id
        )
      THEN 0
      ELSE ${alias}.quantity_m2
    END
  `;
}

/**
 * SQL fragment for inbound movements (quantity > 0).
 */
export function getStockLedgerQtyInSql(alias = 'it'): string {
  return `CASE WHEN ${alias}.quantity_m2 > 0 THEN ${alias}.quantity_m2 ELSE 0 END`;
}

/**
 * SQL fragment for regular outbound movements (quantity < 0, excluding damage/transfer-loss).
 */
export function getStockLedgerQtyOutSql(alias = 'it'): string {
  return `
    CASE
      WHEN ${alias}.quantity_m2 < 0
        AND ${alias}.type != 'DAMAGE'
        AND NOT (
          COALESCE(${alias}.reference_type, '') = 'TRANSFER_LOSS'
          AND NOT EXISTS (
            SELECT 1 FROM stock_transfers st
            WHERE st.id = ${alias}.reference_id
              AND st.transit_warehouse_id = ${alias}.warehouse_id
          )
        )
      THEN ABS(${alias}.quantity_m2)
      ELSE 0
    END
  `;
}

/**
 * SQL fragment for total outbound quantity at warehouse level (for aggregate reports & warehouse stock views).
 * Excludes source-warehouse TRANSFER_LOSS so units aren't deducted twice, while keeping transit warehouse losses.
 */
export function getStockLedgerTotalOutSql(alias = 'it'): string {
  return `
    CASE
      WHEN ${alias}.quantity_m2 < 0
        AND NOT (
          COALESCE(${alias}.reference_type, '') = 'TRANSFER_LOSS'
          AND NOT EXISTS (
            SELECT 1 FROM stock_transfers st
            WHERE st.id = ${alias}.reference_id
              AND st.transit_warehouse_id = ${alias}.warehouse_id
          )
        )
      THEN ABS(${alias}.quantity_m2)
      ELSE 0
    END
  `;
}

/**
 * SQL fragment for loss movements (DAMAGE or TRANSFER_LOSS).
 */
export function getStockLedgerQtyLossSql(alias = 'it'): string {
  return `
    CASE
      WHEN ${alias}.quantity_m2 < 0
        AND (${alias}.type = 'DAMAGE' OR COALESCE(${alias}.reference_type, '') = 'TRANSFER_LOSS')
      THEN ABS(${alias}.quantity_m2)
      ELSE 0
    END
  `;
}

export class StockLedgerMovementPolicy {
  static get balanceSql(): string {
    return getStockLedgerBalanceSql('it');
  }

  static get qtyInSql(): string {
    return getStockLedgerQtyInSql('it');
  }

  static get qtyOutSql(): string {
    return getStockLedgerQtyOutSql('it');
  }

  static get totalOutSql(): string {
    return getStockLedgerTotalOutSql('it');
  }

  static get qtyLossSql(): string {
    return getStockLedgerQtyLossSql('it');
  }
}

