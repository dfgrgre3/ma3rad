import React from 'react';

export interface FormFieldProps {
  id?: string;
  label: string;
  required?: boolean;
  hint?: string;
  visuallyHidden?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  required,
  hint,
  visuallyHidden = false,
  className = '',
  children,
}) => {
  const childElement = React.isValidElement(children)
    ? children as React.ReactElement<{
        id?: string;
        required?: boolean;
        'aria-describedby'?: string;
        'aria-required'?: boolean | 'true' | 'false';
      }>
    : null;
  const controlId = id || childElement?.props.id || `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const isRequired = required ?? Boolean(
    childElement?.props.required ||
    childElement?.props['aria-required'] === true ||
    childElement?.props['aria-required'] === 'true'
  );
  const fieldChildren = React.isValidElement(children)
    ? (() => {
        const element = childElement!;
        const describedBy = new Set((element.props['aria-describedby'] || '').split(/\s+/).filter(Boolean));
        if (hint) describedBy.add(`${controlId}-hint`);

        return React.cloneElement(element, {
          id: controlId,
          ...(describedBy.size ? { 'aria-describedby': Array.from(describedBy).join(' ') } : {}),
          ...(isRequired || required === false
            ? { required: isRequired, 'aria-required': isRequired }
            : {}),
        });
      })()
    : children;

  return (
    <div className={`ui-form-field ${className}`}>
      <label htmlFor={controlId} className={visuallyHidden ? 'sr-only' : undefined}>
        {label} {isRequired && <span aria-hidden="true" className="text-rose-500">*</span>}
      </label>
      {fieldChildren}
      {hint && <p id={`${controlId}-hint`} className="mt-1 text-[10px] text-[var(--cerami-muted)]">{hint}</p>}
    </div>
  );
};

export default FormField;
