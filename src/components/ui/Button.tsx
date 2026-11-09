import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'erp-btn--primary',
  secondary: 'erp-btn--secondary',
  ghost: 'erp-btn--ghost',
  danger: 'erp-btn--danger',
  success: 'erp-btn--success',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'erp-btn--sm',
  md: '',
  lg: 'erp-btn--lg',
};

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  block?: boolean;
  className?: string;
}

/** Central button class resolver used by every button in the design system. */
export function buttonClass({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
  block = false,
  className = '',
}: ButtonClassOptions = {}): string {
  return [
    'erp-btn',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    iconOnly ? 'erp-btn--icon' : '',
    block ? 'erp-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  block?: boolean;
  loading?: boolean;
  leadingIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    iconOnly = false,
    block = false,
    loading = false,
    leadingIcon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, iconOnly, block, className })}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        leadingIcon
      )}
      {children}
    </button>
  );
});

export default Button;
