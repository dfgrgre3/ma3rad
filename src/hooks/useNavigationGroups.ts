import { useEffect, useMemo, useState } from 'react';
import { AppConfigService } from '../services/AppConfigService';
import { CENTRAL_CONFIG_CHANGED_EVENT } from '../services/CentralLicenseService';
import { NavigationService } from '../services/NavigationService';
import { SettingsService } from '../services/SettingsService';
import type { NavGroupDef } from '../config/navigationTypes';
import type { User } from '../types';

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
