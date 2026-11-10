import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { normalizePagePath, type AppConfigEntry } from '../../../config/appConfiguration';
import { AppConfigService, type AppConfigFieldState, type AppConfigState } from '../../../services/domains/config/AppConfigService';

/**
 * React binding for the Dynamic Application Configuration Engine.
 * Subscribes to every configuration write so visibility/labels update live
 * without a page reload.
 */
export function useAppConfig(): AppConfigState {
  const [state, setState] = useState<AppConfigState>(() => AppConfigService.getState());
  useEffect(() => AppConfigService.subscribe((next) => setState(next)), []);
  return state;
}

export function useConfigText(key: string, fallback: string): string {
  const state = useAppConfig();
  return useMemo(() => AppConfigService.resolveText(state, key, fallback), [state, key, fallback]);
}

export function usePageConfig(pathname?: string) {
  const location = useLocation();
  const state = useAppConfig();
  const page = normalizePagePath(pathname ?? location.pathname);
  return useMemo(() => {
    const entry = state.entryIndex.get(`page:${page}`) ?? null;
    return {
      enabled: entry?.enabled ?? true,
      label: entry?.label || null,
      order: entry?.order ?? null,
      entry,
    };
  }, [state, page]);
}

export function useSectionConfig(sectionId: string, pathname?: string) {
  const location = useLocation();
  const state = useAppConfig();
  const page = normalizePagePath(pathname ?? location.pathname);
  return useMemo(() => {
    const entry = state.entryIndex.get(`section:${page}#${sectionId}`) ?? null;
    return {
      enabled: entry?.enabled ?? true,
      label: entry?.label || null,
      entry,
    };
  }, [state, page, sectionId]);
}

export function useFieldConfig(formId: string, fieldKey: string): AppConfigFieldState {
  const state = useAppConfig();
  return useMemo(() => {
    const entry = state.entryIndex.get(`field:${formId}#${fieldKey}`) ?? null;
    return {
      visible: entry?.enabled ?? true,
      required: entry?.required ?? false,
      label: entry?.label || null,
      entry,
    };
  }, [state, formId, fieldKey]);
}

export function useConfigEntries(domain: AppConfigEntry['domain']): AppConfigEntry[] {
  const state = useAppConfig();
  return useMemo(
    () => state.entries.filter((entry) => entry.domain === domain),
    [state, domain],
  );
}
