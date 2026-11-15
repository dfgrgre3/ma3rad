// Unified central-platform client (Phase 0 of the central-admin migration).
//
// This is the single entry point Super Admin screens should use when
// `PlatformAdminService.getDataSource() === 'central'`. It wraps the existing
// `PlatformAdminApiClient` (which speaks to central-server via the Electron
// bridge) and centralizes base-URL / auth-token wiring so pages never touch
// the transport directly.
import { PlatformAdminApiClient, platformAdminApiClient } from './PlatformAdminApiClient';

export class CentralPlatformClient extends PlatformAdminApiClient {}

export const centralPlatformClient: CentralPlatformClient =
  platformAdminApiClient as unknown as CentralPlatformClient;