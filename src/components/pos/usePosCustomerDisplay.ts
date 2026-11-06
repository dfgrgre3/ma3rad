import { useCallback, useEffect, useRef } from 'react';
import type { CartItem, Toast } from './types';
import { round2 } from './types';

interface CustomerDisplayData {
  items: Array<{ name: string; qty: number; price: number }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
}

const renderCustomerDisplay = (display: Window, data: CustomerDisplayData) => {
  const root = display.document.getElementById('root');
  if (!root) return;
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
  let html = '';
  if (data.items.length) {
    html += data.items.map((item) => `<div class="item"><span>${esc(item.name)}</span><span>${esc(item.qty)} × ${esc(item.price)}</span></div>`).join('');
  }
  html += '<div style="margin-top:16px;border-top:2px solid #38bdf8;padding-top:12px;">';
  html += `<div class="item"><span>المجموع الفرعي</span><span>${esc(data.subtotal)}</span></div>`;
  if (data.discount > 0) html += `<div class="item"><span>خصم</span><span>-${esc(data.discount)}</span></div>`;
  if (data.tax > 0) html += `<div class="item"><span>ضريبة</span><span>${esc(data.tax)}</span></div>`;
  html += `<div class="total">الإجمالي: ${esc(data.total)}</div>`;
  if (data.paid > 0) html += `<div class="item"><span>المدفوع</span><span>${esc(data.paid)}</span></div>`;
  if (data.change > 0) html += `<div class="change">الباقي: ${esc(data.change)}</div>`;
  root.innerHTML = `${html}</div>`;
};

interface UsePosCustomerDisplayOptions {
  cart: CartItem[];
  lineSubtotal: number;
  discountAmount: number;
  promotionDiscount: number;
  loyaltyDiscount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  changeDue: number;
  notify: (message: string, type?: Toast['type']) => void;
}

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
    display.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عرض العميل</title>
<style>body{font-family:Tahoma,sans-serif;margin:0;padding:16px;background:#0f172a;color:#fff;} .total{font-size:48px;font-weight:900;color:#38bdf8;} .item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155;font-size:16px;} .change{font-size:32px;color:#34d399;font-weight:800;}</style></head><body>
<div id="root"><div style="text-align:center;opacity:.5;">في انتظار عناصر...</div></div></body></html>`);
    display.document.close();
    renderCustomerDisplay(display, {
      items: cart.map((item) => ({ name: item.product.name, qty: item.soldQuantity, price: item.unitPrice })),
      subtotal: lineSubtotal,
      discount: round2(discountAmount + promotionDiscount + loyaltyDiscount),
      tax: taxAmount,
      total: totalAmount,
      paid: paidAmount,
      change: changeDue,
    });
  }, [cart, lineSubtotal, discountAmount, promotionDiscount, loyaltyDiscount, taxAmount, totalAmount, paidAmount, changeDue, notify]);

  useEffect(() => {
    if (!customerDisplayRef.current || customerDisplayRef.current.closed) return;
    renderCustomerDisplay(customerDisplayRef.current, {
      items: cart.map((item) => ({ name: item.product.name, qty: item.soldQuantity, price: item.unitPrice })),
      subtotal: lineSubtotal,
      discount: round2(discountAmount + promotionDiscount + loyaltyDiscount),
      tax: taxAmount,
      total: totalAmount,
      paid: paidAmount,
      change: changeDue,
    });
  }, [cart, lineSubtotal, discountAmount, promotionDiscount, loyaltyDiscount, taxAmount, totalAmount, paidAmount, changeDue]);

  return { openCustomerDisplay };
};
