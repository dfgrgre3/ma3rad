import { useCallback, useMemo } from 'react';
import { AuthService } from '../services/AuthService';
import { ModuleRegistryService } from '../services/ModuleRegistryService';
import { FeatureService } from '../services/FeatureService';
import { ActionRegistryService } from '../services/ActionRegistryService';
import { AppConfigService } from '../services/AppConfigService';
import { PermissionService } from '../services/PermissionService';
import type { User } from '../types';

export function useConfiguration() {
  return {
    state: AppConfigService.getState(),
    getEntry: AppConfigService.getEntry,
    isEnabled: AppConfigService.isEnabled,
    getLabel: AppConfigService.getLabel,
    getText: AppConfigService.getText,
    getPolicyNumber: AppConfigService.getPolicyNumber,
    getPolicyBoolean: AppConfigService.getPolicyBoolean,
    getPolicyString: AppConfigService.getPolicyString,
    getNumbering: AppConfigService.getNumbering,
    getPage: AppConfigService.getPage,
    getSection: AppConfigService.getSection,
    getField: AppConfigService.getField,
    getOrigin: AppConfigService.getOrigin,
  };
}

export function useFeature(id: string, user?: User | null) {
  const subject = user ?? AuthService.getCurrentUser();
  return useMemo(() => FeatureService.resolve(id, subject), [id, subject?.id, subject?.role]);
}

export function useModule(id: string) {
  return useMemo(() => {
    const states = ModuleRegistryService.getModuleState();
    return states.find((state) => state.id === id) ?? null;
  }, [id]);
}

export function useDynamicAction(id: string, user?: User | null) {
  const subject = user ?? AuthService.getCurrentUser();
  return useMemo(() => ActionRegistryService.resolve(id, subject), [id, subject?.id, subject?.role]);
}

export function useEffectivePermissions(codes: string[], user?: User | null) {
  const subject = user ?? AuthService.getCurrentUser();
  return useMemo(
    () => codes.map((code) => ({ code, allowed: PermissionService.can(subject, code) })),
    [codes.join('|'), subject?.id, subject?.role],
  );
}

export function assertDynamicActionAllowed(id: string, actor?: User | null): void {
  ActionRegistryService.assertAllowed(id, actor);
}
