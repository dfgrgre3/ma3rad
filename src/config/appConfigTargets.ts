import type { AppConfigDomain } from './appConfiguration';

export interface ConfigTargetDefinition {
  domain: AppConfigDomain;
  key: string;
  label: string;
  description?: string;
  pagePath?: string;
}

const registry = new Map<string, ConfigTargetDefinition>();
const listeners = new Set<() => void>();

export function registerConfigTarget(target: ConfigTargetDefinition): () => void {
  const id = `${target.domain}:${target.key}`;
  const previous = registry.get(id);
  if (!previous) {
    registry.set(id, target);
    listeners.forEach((listener) => {
      try { listener(); } catch { /* ignore */ }
    });
    return () => {
      if (registry.get(id) === target) {
        registry.delete(id);
        listeners.forEach((listener) => {
          try { listener(); } catch { /* ignore */ }
        });
      }
    };
  }
  return () => undefined;
}

export function getRegisteredConfigTargets(): ConfigTargetDefinition[] {
  return [...registry.values()];
}

export function subscribeConfigTargets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
