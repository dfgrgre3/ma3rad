import { StockLedgerMovementPolicy } from '../../../services/domains/inventory/StockLedgerMovementPolicy';

/**
 * Single source of truth for the stock ledger running balance.
 * Re-exports the unified policy implementation.
 */
export const STOCK_LEDGER_BALANCE_AMOUNT = StockLedgerMovementPolicy.balanceSql;
