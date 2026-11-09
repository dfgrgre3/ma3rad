import { useMemo } from 'react';
import { type AppConfigRule } from '../../config/appConfiguration';
import { useAppConfig } from './useAppConfig_part01';

export function useConfigRules(kind?: AppConfigRule['kind']): AppConfigRule[] {
  const state = useAppConfig();
  return useMemo(
    () => (kind ? state.rules.filter((rule) => rule.kind === kind) : state.rules),
    [state, kind],
  );
}

export function usePolicyNumber(key: string, fallback: number): number {
  const state = useAppConfig();
  return useMemo(() => {
    const raw = state.entryIndex.get(`policy:${key}`)?.value;
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }, [state, key, fallback]);
}

export function usePolicyBoolean(key: string, fallback: boolean): boolean {
  const state = useAppConfig();
  return useMemo(() => {
    const raw = state.entryIndex.get(`policy:${key}`)?.value;
    if (raw === undefined || raw === '') return fallback;
    return raw === '1' || raw === 'true' || raw === 'نعم';
  }, [state, key, fallback]);
}
