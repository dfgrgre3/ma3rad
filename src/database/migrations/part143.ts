import type { Migration } from './support';

/**
 * Migration 227: semantic money-unit alignment.
 *
 * cash_registers.current_balance and quotations.total_amount were declared
 * INTEGER but historically stored MAJOR currency units while every other
 * money column stores INTEGER piastres. This migration rewrites the stored
 * values to piastres (x100). Column types are unchanged.
 *
 * NOTE: runs exactly once per database via the migration ledger.
 */
export const MIGRATION_PART_143: Migration = {
  id: '227_cash_register_quotation_money_minor_units',
  description: 'Convert cash register balances and quotation totals stored as major units to INTEGER piastres',
  disableForeignKeys: true,
  up: (db) => {
    db.exec('UPDATE cash_registers SET current_balance = ROUND(current_balance * 100)');
    db.exec('UPDATE quotations SET total_amount = ROUND(total_amount * 100)');
  },
};
