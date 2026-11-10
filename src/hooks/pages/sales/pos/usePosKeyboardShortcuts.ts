import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { InvoicePreview } from '../../../../types/pos';

interface UsePosKeyboardShortcutsOptions {
  handleCheckout: () => void;
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
  /** F5 — إعادة تحميل المنتجات والأرصدة دون إعادة تحميل الصفحة */
  refreshCatalog: () => void;
  /** F6 — التنقل بين طرق الدفع */
  cyclePaymentType: () => void;
  /** F8 — تعليق الفاتورة الحالية */
  holdCurrentOrder: () => void;
  /** Delete — حذف المنتج المحدد في السلة */
  deleteActiveCartLine: () => void;
  /** + / - — تعديل كمية المنتج المحدد في السلة */
  stepActiveCartLine: (direction: 1 | -1) => void;
}

export const usePosKeyboardShortcuts = (options: UsePosKeyboardShortcutsOptions) => {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const focusById = (id: string) => {
      const el = document.getElementById(id) as HTMLElement | null;
      el?.focus();
    };

    const handler = (event: KeyboardEvent) => {
      const state = latest.current;
      const target = event.target as HTMLElement | null;
      const isTyping = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const anyModalOpen =
        state.isCalculatorOpen || state.isCustomerModalOpen || state.isHeldModalOpen ||
        state.isShortcutsOpen || state.isShiftModalOpen || state.isCloseShiftModalOpen ||
        state.isToneWarningOpen || !!state.invoicePreview || !!state.successInvoice;

      // اختصارات تعمل حتى أثناء الكتابة في الحقول (F1–F10)
      if (event.key === 'F1') {
        event.preventDefault();
        state.setIsShortcutsOpen((value) => !value);
        return;
      }
      if (event.key === 'F2') {
        event.preventDefault();
        state.barcodeInputRef.current?.focus();
        state.barcodeInputRef.current?.select?.();
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        focusById('pos-customer-search');
        return;
      }
      if (event.key === 'F4') {
        event.preventDefault();
        state.paidInputRef.current?.focus();
        state.paidInputRef.current?.select?.();
        return;
      }
      if (event.key === 'F5') {
        event.preventDefault();
        state.refreshCatalog();
        return;
      }
      if (event.key === 'F6') {
        event.preventDefault();
        state.cyclePaymentType();
        return;
      }
      if (event.key === 'F7') {
        event.preventDefault();
        focusById('pos-invoice-discount');
        return;
      }

      // F8 / F9 ممنوعان أثناء فتح نافذة أخرى
      if (event.key === 'F8') {
        if (anyModalOpen) return;
        event.preventDefault();
        state.holdCurrentOrder();
        return;
      }
      if (event.key === 'F9') {
        if (anyModalOpen) return;
        event.preventDefault();
        state.handleCheckout();
        return;
      }
      if (event.key === 'F10') {
        event.preventDefault();
        state.setIsHeldModalOpen((value) => !value);
        return;
      }
      if (event.key === 'Escape') {
        state.setIsCalculatorOpen(false);
        state.setIsCustomerModalOpen(false);
        state.setIsHeldModalOpen(false);
        state.setIsShortcutsOpen(false);
        state.setIsShiftModalOpen(false);
        return;
      }

      // Delete و +/- لا يعملان أثناء الكتابة داخل حقل نصي
      if (isTyping) return;
      if (event.key === 'Delete') {
        event.preventDefault();
        state.deleteActiveCartLine();
        return;
      }
      if (event.key === '+' || event.key === '=' || event.key === 'Add') {
        event.preventDefault();
        state.stepActiveCartLine(1);
        return;
      }
      if (event.key === '-' || event.key === 'Subtract') {
        event.preventDefault();
        state.stepActiveCartLine(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
};
