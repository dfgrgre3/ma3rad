// Permission catalog — public facade.
// The catalog data lives in ./catalog/* modules grouped by responsibility;
// every name that was exported from this file before the split is re-exported
// here unchanged so existing imports keep working.

export { PERMISSIONS } from './catalog/permissions';
export { BASE_PERMISSIONS } from './catalog/basePermissions';
export { EMPLOYEE_PERMISSION_ALIASES } from './catalog/aliases';
export {
  ALL,
  MANAGER_RESTRICTED,
  ROLE_DEFAULTS,
  EXPORT_PERMISSION_SOURCES,
  RECEIVABLE_PERMISSION_BACKFILL,
  PERMISSION_BACKFILL_SOURCES,
  ROLE_NAMES,
} from './catalog/roleDefaults';
