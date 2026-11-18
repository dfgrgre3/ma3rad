import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { platformAdminApiClient } from '../../services/domains/platform/PlatformAdminApiClient';

export interface CentralDataSourceState {
  /** `platform.dataSource` setting is 'central'. */
  enabled: boolean;
  /** The Electron central bridge is present in this runtime. */
  available: boolean;
  /** Pages should read/write through the central server. */
  active: boolean;
  /** Central was selected but the bridge is missing — show an error, don't fall back silently. */
  misconfigured: boolean;
}

/**
 * Resolve whether platform admin screens should use the central server.
 * Reads the `platform.dataSource` platform setting ('local' | 'central').
 */
export function getCentralDataSourceState(): CentralDataSourceState {
  let enabled = false;
  try {
    enabled = platformAdminService.getDataSource() === 'central';
  } catch {
    enabled = false;
  }
  const available = platformAdminApiClient.isAvailable();
  return {
    enabled,
    available,
    active: enabled && available,
    misconfigured: enabled && !available,
  };
}
