import type { Effect, EffectHandler, EffectType } from './EffectTypes';

/**
 * In-process registry of effect handlers. Mirrors the shape of
 * `EventDispatcher` in src/sync/PullChangesService.ts but is scoped to local
 * business operations (not cross-branch sync).
 */
export class EffectRegistry {
  private readonly handlers = new Map<EffectType, EffectHandler[]>();

  register(type: EffectType, handler: EffectHandler): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      const current = this.handlers.get(type);
      if (!current) return;
      const idx = current.indexOf(handler);
      if (idx >= 0) current.splice(idx, 1);
    };
  }

  handlersFor(type: EffectType): EffectHandler[] {
    return this.handlers.get(type) ?? [];
  }

  has(type: EffectType): boolean {
    return (this.handlers.get(type)?.length ?? 0) > 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const defaultEffectRegistry = new EffectRegistry();
