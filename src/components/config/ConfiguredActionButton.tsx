import React from 'react';
import { ActionRegistryService } from '../../services/ActionRegistryService';
import { usePermission } from '../../hooks/usePermission';
import { useDynamicAction } from '../../hooks/useDace';

interface ConfiguredActionButtonProps {
  actionId: string;
  fallbackLabel?: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
  title?: string;
}

/**
 * Renders a button whose label, visibility and enabled state come from the
 * Dynamic Application Configuration Engine. Permission and module checks are
 * still enforced by `ActionRegistryService` and the service layer.
 */
export const ConfiguredActionButton: React.FC<ConfiguredActionButtonProps> = ({
  actionId,
  fallbackLabel,
  icon,
  className,
  disabled,
  children,
  onClick,
  title,
}) => {
  const action = useDynamicAction(actionId);
  const can = usePermission();
  const definition = action.definition;
  const permissionAllowed = definition
    ? definition.permissions.every((permission) => can(permission))
    : true;

  if (!action.visible) return null;

  const isDisabled = Boolean(disabled) || !action.enabled || !permissionAllowed;
  const label = action.label || fallbackLabel || actionId;

  const handleClick = () => {
    if (isDisabled) return;
    if (action.confirm) {
      const accepted = window.confirm(`هل أنت متأكد من "${label}"؟`);
      if (!accepted) return;
    }
    try {
      ActionRegistryService.assertAllowed(actionId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'الإجراء غير مسموح.');
      return;
    }
    onClick?.();
  };

  return (
    <button
      type="button"
      title={title || action.reason || label}
      disabled={isDisabled}
      onClick={handleClick}
      className={className}
    >
      {icon}
      {children ?? <span>{label}</span>}
    </button>
  );
};
