import type { SystemSettings } from '../types';

export type SettingsPatch = Partial<Record<string, string | number | boolean | null | undefined>>;

export type Listener = (settings: SystemSettings) => void;

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function bool(value: unknown): boolean {
  return value === true || value === '1' || value === 1 || value === 'true';
}

export function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}


const listeners = new Set<Listener>();

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifySettings(settings: SystemSettings): void {
  for (const listener of listeners) {
    try { listener(settings); } catch (error) { console.error('Settings listener failed:', error); }
  }
}
