import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AppConfigService } from '../../../services/domains/config/AppConfigService';
import { CENTRAL_CONFIG_CHANGED_EVENT } from '../../../services/domains/licensing/CentralLicenseService';
import { NavigationService } from '../../../services/domains/config/NavigationService';
import { SettingsService } from '../../../services/domains/config/SettingsService';
import type { NavGroupDef } from '../../../types/config/navigation';
import type { User } from '../../../types';

const NavigationGroupsContext = createContext<NavGroupDef[] | null>(null);

export function NavigationGroupsProvider({
  groups,
  children,
}: {
  groups: NavGroupDef[];
  children: ReactNode;
}) {
  return createElement(NavigationGroupsContext.Provider, { value: groups }, children);
}

export function useSharedNavigationGroups(): NavGroupDef[] {
  const groups = useContext(NavigationGroupsContext);
  if (!groups) throw new Error('Navigation groups must be consumed inside NavigationGroupsProvider.');
  return groups;
}

export function useNavigationGroups(user: User | null): NavGroupDef[] {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const unsubscribeSettings = SettingsService.subscribe(refresh);
    const unsubscribeAppConfig = AppConfigService.subscribe(refresh);
    window.addEventListener(CENTRAL_CONFIG_CHANGED_EVENT, refresh);
    return () => {
      unsubscribeSettings();
      unsubscribeAppConfig();
      window.removeEventListener(CENTRAL_CONFIG_CHANGED_EVENT, refresh);
    };
  }, []);

  return useMemo(
    () => NavigationService.getNavigationGroups(user),
    // Revision is an invalidation token for service-managed settings/config events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, user]
  );
}
