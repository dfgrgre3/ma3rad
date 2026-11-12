/**
 * Single source of truth for the stock ledger running balance.
 *
 * A legacy transfer loss is a detail of quantity already shipped: dispatch
 * has already removed the full shipped quantity from the source warehouse. The
 * TRANSFER_LOSS movement must therefore stay visible for reporting but must
 * not be subtracted from the source running balance a second time.
 *
 * Once the goods sit in a transit warehouse, the loss is recorded there and
 * must reduce the in-transit balance (it is the only movement that removes the
 * lost units from transit), so it is counted normally at that warehouse.
 */
export const STOCK_LEDGER_BALANCE_AMOUNT = `
  CASE
    WHEN COALESCE(it.reference_type, '') = 'TRANSFER_LOSS'
      AND NOT EXISTS (
        SELECT 1 FROM stock_transfers st
        WHERE st.id = it.reference_id
          AND st.transit_warehouse_id = it.warehouse_id
      )
    THEN 0
    ELSE it.quantity_m2
  END`;
