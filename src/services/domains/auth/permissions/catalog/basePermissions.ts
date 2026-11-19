import type { PermissionDef } from '../types';
import { BUSINESS_PERMISSIONS } from './businessPermissions';
import { ADMIN_PERMISSIONS } from './adminPermissions';
import { GRANULAR_PAGE_PERMISSIONS } from './granularPermissions';

// ─── Permission catalog ───────────────────────────────────────────────────────
// Every actionable capability in the app lives here. UI guards, route guards
// and service-layer enforcement all resolve against these codes.
// The array order is identical to the original single-file catalog.
export const BASE_PERMISSIONS: PermissionDef[] = [
  ...BUSINESS_PERMISSIONS,
  ...ADMIN_PERMISSIONS,
  ...GRANULAR_PAGE_PERMISSIONS,
];
