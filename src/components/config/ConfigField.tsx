import React, { useEffect } from 'react';
import { registerConfigTarget } from '../../config/appConfigTargets';
import { useFieldConfig } from '../../hooks/useAppConfig';

export interface ConfigFieldProps {
  /** Stable form id, e.g. `sales.invoice`. */
  form: string;
  /** Stable field key inside the form. */
  name: string;
  label?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Field-level wrapper: hides the field when the engine disables it, marks it
 * required, and exposes the configured label through data attributes so forms
 * can adopt overrides incrementally without rewriting their markup.
 */
export const ConfigField: React.FC<ConfigFieldProps> = ({
  form,
  name,
  label,
  className,
  children,
}) => {
  const { visible, required, label: configuredLabel } = useFieldConfig(form, name);

  useEffect(() => {
    return registerConfigTarget({
      domain: 'field',
      key: `${form}#${name}`,
      label: label || name,
      description: `حقل داخل النموذج ${form}`,
    });
  }, [form, name, label]);

  if (!visible) return null;

  return (
    <div
      data-config-field={name}
      data-config-form={form}
      data-config-required={required ? 'true' : undefined}
      data-config-label={configuredLabel || undefined}
      className={className}
    >
      {children}
    </div>
  );
};

export default ConfigField;
