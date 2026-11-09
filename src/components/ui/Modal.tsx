import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Prevent closing from the backdrop / Escape while an operation is running. */
  busy?: boolean;
  closeOnBackdrop?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'erp-modal--sm',
  md: 'erp-modal--md',
  lg: 'erp-modal--lg',
  xl: 'erp-modal--xl',
};

/**
 * Shared modal shell: consistent sizing, internal scrolling, sticky header and
 * footer, Escape handling, backdrop dismissal and body scroll locking.
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  icon,
  size = 'md',
  children,
  footer,
  busy = false,
  closeOnBackdrop = true,
  className = '',
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const target = dialog.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      (target ?? dialog).focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="erp-modal-layer" dir="rtl">
      <div
        className="erp-modal-backdrop"
        aria-hidden="true"
        onClick={() => { if (closeOnBackdrop && !busy) onClose(); }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`erp-modal ${SIZE_CLASS[size]} ${className}`}
      >
        <header className="erp-modal__header">
          {icon && <span className="erp-modal__icon" aria-hidden="true">{icon}</span>}
          <div className="erp-modal__heading">
            <h2 id={titleId} className="erp-modal__title">{title}</h2>
            {description && <p id={descriptionId} className="erp-modal__description">{description}</p>}
          </div>
          <button
            type="button"
            className="erp-btn erp-btn--ghost erp-btn--icon erp-btn--sm"
            onClick={onClose}
            disabled={busy}
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="erp-modal__body">{children}</div>
        {footer && <footer className="erp-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
