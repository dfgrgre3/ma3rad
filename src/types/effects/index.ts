/**
 * Domain-event / effect identifiers for the Dependency & Event Engine (Phase 5).
 *
 * An effect is a side-effect that MUST happen as part of a business operation
 * and that is currently inlined (and duplicated) inside services. This module
 * is the seed: it declares the vocabulary and the registry shape; the actual
 * dispatch happens inside `executeTransaction` via `EffectEngine`.
 */

export type EffectType =
  | 'inventory.stock.deduct'
  | 'inventory.stock.restore'
  | 'inventory.transaction.insert'
  | 'inventory.fifo.consume'
  | 'inventory.fifo.restore'
  | 'inventory.batch.deduct'
  | 'inventory.batch.restore'
  | 'cash.register.move'
  | 'cash.shift.accumulate'
  | 'customer.balance.update'
  | 'supplier.balance.update'
  | 'ledger.post'
  | 'audit.log'
  | 'sync.capture'
  | 'domain.event.persist';

export interface EffectPayload {
  /** Aggregate this effect belongs to, e.g. 'sales_invoice', 'purchase_invoice'. */
  aggregateType: string;
  /** Aggregate id. */
  aggregateId: string;
  /** Free-form, handler-specific data. */
  data: Record<string, unknown>;
}

export interface Effect {
  type: EffectType;
  payload: EffectPayload;
  /** Stable key for idempotency within (aggregateType, aggregateId, type). */
  key?: string;
}

export type EffectHandler = (ctx: EffectContext, effect: Effect) => void;

export interface EffectContext {
  /** The sql.js database handle (inside an open transaction). */
  db: any;
  /** Who performed the operation. */
  actorId: string;
  actorName: string;
}
