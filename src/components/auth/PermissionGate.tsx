import React from 'react';
import { usePermission } from '../../hooks/domains/auth/usePermission';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import type { User } from '../../types';

export interface PermissionGateProps {
  /** صلاحية واحدة مطلوبة. */
  permission?: string;
  /** يكفي توفر واحدة من هذه الصلاحيات. */
  anyOf?: string[];
  /** يجب توفر كل هذه الصلاحيات. */
  allOf?: string[];
  /** صلاحيات تمنع العرض إذا توفرت (أولوية عليا). */
  deny?: string[];
  user?: User | null;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * حارس واجهة صارم لأي زر/قسم/حقل:
 *
 *   <PermissionGate permission="ui.sales.invoices.create">
 *     <button>إضافة فاتورة</button>
 *   </PermissionGate>
 *
 * الإخفاء هنا ليس تفويضاً — الخدمات تتحقق مجدداً عبر PermissionService.require.
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  anyOf,
  allOf,
  deny,
  user,
  fallback = null,
  children,
}) => {
  const can = usePermission(user);
  const denied = (deny ?? []).some((code) => can(code));
  if (denied) return <>{fallback}</>;

  const single = permission ? can(permission) : true;
  const anyAllowed = !anyOf?.length || anyOf.some((code) => can(code));
  const allAllowed = !allOf?.length || allOf.every((code) => can(code));

  return <>{single && anyAllowed && allAllowed ? children : fallback}</>;
};

export interface GuardedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  permission?: string;
  anyOf?: string[];
  deny?: string[];
  user?: User | null;
  /** بديل يظهر عند عدم امتلاك الصلاحية (افتراضياً لا يظهر الزر). */
  unauthorizedFallback?: React.ReactNode;
}

/**
 * زر محمي يمنع النقر حتى لو أُزيلت سمة الإخفاء من أدوات المتصفح.
 * التحقق يتم عند الـ render وعند النقر.
 */
export const GuardedButton = React.forwardRef<HTMLButtonElement, GuardedButtonProps>(
  ({ permission, anyOf, deny, user, unauthorizedFallback = null, onClick, children, ...rest }, ref) => {
    const can = usePermission(user);
    const denied = (deny ?? []).some((code) => can(code));
    const allowed = !denied
      && (!permission || can(permission))
      && (!anyOf?.length || anyOf.some((code) => can(code)));

    if (!allowed) return <>{unauthorizedFallback}</>;

    return (
      <button
        {...rest}
        ref={ref}
        onClick={(event) => {
          const required = permission ?? anyOf?.[0];
          if (required && !PermissionService.hasRoleGrant(user ?? AuthService.getCurrentUser(), required)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClick?.(event);
        }}
      >
        {children}
      </button>
    );
  }
);
GuardedButton.displayName = 'GuardedButton';
