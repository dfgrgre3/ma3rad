import React from 'react';
import { usePermission } from '../../hooks/usePermission';
import type { User } from '../../types';

interface CanProps {
  permission: string;
  user?: User | null;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Declarative button/action guard:
 *   <Can permission="products.delete"><button>حذف</button></Can>
 */
export const Can: React.FC<CanProps> = ({ permission, user, fallback = null, children }) => {
  const can = usePermission(user);
  return <>{can(permission) ? children : fallback}</>;
};
