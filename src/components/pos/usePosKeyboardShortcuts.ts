import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { InvoicePreview } from './types';

interface UsePosKeyboardShortcutsOptions {
  handleCheckout: () => void;
  hasCeramicCatalog: boolean;
  isCalculatorOpen: boolean;
  setIsCalculatorOpen: Dispatch<SetStateAction<boolean>>;
  isCustomerModalOpen: boolean;
  setIsCustomerModalOpen: Dispatch<SetStateAction<boolean>>;
  isHeldModalOpen: boolean;
  setIsHeldModalOpen: Dispatch<SetStateAction<boolean>>;
  isShortcutsOpen: boolean;
  setIsShortcutsOpen: Dispatch<SetStateAction<boolean>>;
  isShiftModalOpen: boolean;
  setIsShiftModalOpen: Dispatch<SetStateAction<boolean>>;
  isCloseShiftModalOpen: boolean;
  isToneWarningOpen: boolean;
  invoicePreview: InvoicePreview | null;
  successInvoice: unknown;
  barcodeInputRef: RefObject<HTMLInputElement>;
  paidInputRef: RefObject<HTMLInputElement>;
}

export const usePosKeyboardShortcuts = (options: UsePosKeyboardShortcutsOptions) => {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const state = latest.current;
      const target = event.target as HTMLElement | null;
      const isTyping = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key === 'F9' && (
        state.isCalculatorOpen || state.isCustomerModalOpen || state.isHeldModalOpen ||
        state.isShortcutsOpen || state.isShiftModalOpen || state.isCloseShiftModalOpen ||
        state.isToneWarningOpen || state.invoicePreview || state.successInvoice
      )) return;
      if (isTyping && !['F1', 'F8', 'Escape'].includes(event.key)) return;
      if (event.key === 'F2') {
        event.preventDefault();
        state.barcodeInputRef.current?.focus();
      } else if (event.key === 'F4') {
        event.preventDefault();
        state.paidInputRef.current?.focus();
      } else if (event.key === 'F8') {
        event.preventDefault();
        if (state.hasCeramicCatalog) state.setIsCalculatorOpen((value) => !value);
      } else if (event.key === 'F9') {
        event.preventDefault();
        state.handleCheckout();
      } else if (event.key === 'F1') {
        event.preventDefault();
        state.setIsShortcutsOpen((value) => !value);
      } else if (event.key === 'Escape') {
        state.setIsCalculatorOpen(false);
        state.setIsCustomerModalOpen(false);
        state.setIsHeldModalOpen(false);
        state.setIsShortcutsOpen(false);
        state.setIsShiftModalOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
};
