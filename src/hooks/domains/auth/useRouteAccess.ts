import { useCallback } from 'react';
import { NavigationService } from '../../../services/domains/config/NavigationService';
import { usePermission } from './usePermission';

/**
 * Evaluates a path against the same rule set the MainLayout route guard uses
 * (ROUTE_PERMISSIONS merged with navigation item permissions): every `all`
 * permission must pass and at least one `any` permission must pass.
 *
 * Use it for secondary navigation surfaces (hub tabs, shortcuts) so their
 * visibility always matches what the route gate would allow.
 */
export function useRouteAccess() {
  const can = usePermission();
  return useCallback(
    (path: string): boolean => {
      const rule = NavigationService.getRequiredPermissionGroups(path);
      if (!rule) return true;
      return (
        rule.all.every((permission) => can(permission)) &&
        (rule.any.length === 0 || rule.any.some((permission) => can(permission)))
      );
    },
    [can]
  );
}

export default useRouteAccess;
