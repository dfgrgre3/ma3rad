import { useEffect, useState } from 'react';
import {
  DashboardPreferencesService,
  type DashboardUserPrefs,
} from '../../../services/domains/dashboard/DashboardPreferencesService';

/**
 * Reactive per-user dashboard preferences. Re-renders subscribers whenever
 * `DashboardPreferencesService` saves or resets the stored layout.
 */
export function useDashboardPrefs(): DashboardUserPrefs {
  const [prefs, setPrefs] = useState<DashboardUserPrefs>(() => {
    try {
      return DashboardPreferencesService.getPreferences();
    } catch {
      return {};
    }
  });

  useEffect(() => DashboardPreferencesService.subscribe(() => {
    try {
      setPrefs(DashboardPreferencesService.getPreferences());
    } catch {
      setPrefs({});
    }
  }), []);

  return prefs;
}
