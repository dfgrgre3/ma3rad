import { useCallback, useEffect, useMemo, useRef } from 'react';
import { round2 } from '../../../../types/pos';
import { renderCustomerDisplay, type CustomerDisplayData, type CustomerDisplayLabels } from './usePosCustomerDisplay_part01';
import type { UsePosCustomerDisplayOptions } from './usePosCustomerDisplay_part01';
import { usePosActivityCopy } from './usePosActivityCopy';

const escHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char] || char));

export const usePosCustomerDisplay = ({
  cart,
  lineSubtotal,
  discountAmount,
  promotionDiscount,
  loyaltyDiscount,
  taxAmount,
  totalAmount,
  paidAmount,
  changeDue,
  notify,
}: UsePosCustomerDisplayOptions) => {
  const copy = usePosActivityCopy();
  const labels = useMemo<CustomerDisplayLabels>(() => ({
    displayWaiting: copy.displayWaiting,
    displaySubtotal: copy.displaySubtotal,
    displayDiscount: copy.displayDiscount,
    displayTax: copy.displayTax,
    displayTotal: copy.displayTotal,
    displayPaid: copy.displayPaid,
    displayChange: copy.displayChange,
  }), [copy]);
  const data = useMemo<CustomerDisplayData>(() => ({
    items: cart.map((item) => ({ name: item.product.name, qty: item.soldQuantity, price: item.unitPrice })),
    subtotal: lineSubtotal,
    discount: round2(discountAmount + promotionDiscount + loyaltyDiscount),
    tax: taxAmount,
    total: totalAmount,
    paid: paidAmount,
    change: changeDue,
  }), [cart, lineSubtotal, discountAmount, promotionDiscount, loyaltyDiscount, taxAmount, totalAmount, paidAmount, changeDue]);
  const customerDisplayRef = useRef<Window | null>(null);

  const openCustomerDisplay = useCallback(() => {
    if (customerDisplayRef.current && !customerDisplayRef.current.closed) {
      customerDisplayRef.current.focus();
      return;
    }
    const display = window.open('about:blank', 'pos-customer-display', 'width=420,height=720');
    if (!display) {
      notify('يرجى السماح بالنوافذ المنبثقة', 'error');
      return;
    }
    customerDisplayRef.current = display;
    display.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escHtml(copy.displayTitle)}</title>
<style>body{font-family:Tahoma,sans-serif;margin:0;padding:16px;background:#0f172a;color:#fff;} .total{font-size:48px;font-weight:900;color:#38bdf8;} .item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155;font-size:16px;} .change{font-size:32px;color:#34d399;font-weight:800;}</style></head><body>
<div id="root"><div style="text-align:center;opacity:.5;">${escHtml(copy.displayWaiting)}</div></div></body></html>`);
    display.document.close();
    renderCustomerDisplay(display, data, labels);
  }, [data, labels, copy.displayTitle, copy.displayWaiting, notify]);

  useEffect(() => {
    if (!customerDisplayRef.current || customerDisplayRef.current.closed) return;
    renderCustomerDisplay(customerDisplayRef.current, data, labels);
  }, [data, labels]);

  return { openCustomerDisplay };
};
