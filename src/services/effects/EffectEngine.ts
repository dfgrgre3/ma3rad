import type { Effect, EffectContext } from '../../types/effects';
import { EffectRegistry, defaultEffectRegistry } from './EffectRegistry';

/**
 * Runs a list of effects inside an already-open transaction.
 *
 * Contract:
 *  - Effects are executed in declaration order.
 *  - A handler that throws aborts the whole transaction (caller must ROLLBACK).
 *  - The engine does NOT open/commit/rollback transactions; that stays with
 *    `DatabaseManager.executeTransaction` (single owner of DB writes).
 *  - Persistence of a `domain_events` row (migration 111) is the responsibility
 *    of the `domain.event.persist` effect, registered by services that want an
 *    audit trail of emitted effects.
 */
export class EffectEngine {
  private readonly registry: EffectRegistry;
  constructor(registry: EffectRegistry = defaultEffectRegistry) {
    this.registry = registry;
  }

  run(ctx: EffectContext, effects: Effect[]): void {
    for (const effect of effects) {
      const handlers = this.registry.handlersFor(effect.type);
      for (const handler of handlers) {
        handler(ctx, effect);
      }
    }
  }

  /** Convenience: run effects only if any are declared. */
  runIfAny(ctx: EffectContext, effects: Effect[]): void {
    if (effects.length === 0) return;
    this.run(ctx, effects);
  }
}

export const defaultEffectEngine = new EffectEngine();
