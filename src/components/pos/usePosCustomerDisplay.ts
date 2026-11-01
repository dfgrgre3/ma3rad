import { useCallback, useEffect, useRef } from 'react';
import type { CartItem, Toast } from './types';
import { round2 } from './types';

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
    const display = window.open('', 'pos-customer-display', 'width=420,height=720');
    if (!display) {
      notify('يرجى السماح بالنوافذ المنبثقة', 'error');
      return;
    }
    customerDisplayRef.current = display;
    display.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عرض العميل</title>
<style>body{font-family:Tahoma,sans-serif;margin:0;padding:16px;background:#0f172a;color:#fff;} .total{font-size:48px;font-weight:900;color:#38bdf8;} .item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155;font-size:16px;} .change{font-size:32px;color:#34d399;font-weight:800;}</style></head><body>
<div id="root"><div style="text-align:center;opacity:.5;">في انتظار عناصر...</div></div>
<script>
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ch = new BroadcastChannel('pos-customer-display');
ch.onmessage = (e) => {
  const d = e.data || {};
  let html = '';
  if (d.items && d.items.length) {
    html += d.items.map(i => '<div class="item"><span>'+esc(i.name)+'</span><span>'+esc(i.qty)+' × '+esc(i.price)+'</span></div>').join('');
  }
  html += '<div style="margin-top:16px;border-top:2px solid #38bdf8;padding-top:12px;">';
  html += '<div class="item"><span>المجموع الفرعي</span><span>'+esc(d.subtotal)+'</span></div>';
  if (d.discount>0) html += '<div class="item"><span>خصم</span><span>-'+esc(d.discount)+'</span></div>';
  if (d.tax>0) html += '<div class="item"><span>ضريبة</span><span>'+esc(d.tax)+'</span></div>';
  html += '<div class="total">الإجمالي: '+esc(d.total)+'</div>';
  if (d.paid>0) html += '<div class="item"><span>المدفوع</span><span>'+esc(d.paid)+'</span></div>';
  if (d.change>0) html += '<div class="change">الباقي: '+esc(d.change)+'</div>';
  html += '</div>';
  document.getElementById('root').innerHTML = html;
};
</script></body></html>`);
    display.document.close();
  }, [notify]);

  useEffect(() => {
    if (!customerDisplayRef.current || customerDisplayRef.current.closed) return;
    try {
      const channel = new BroadcastChannel('pos-customer-display');
      channel.postMessage({
        items: cart.map((item) => ({ name: item.product.name, qty: item.soldQuantity, price: item.unitPrice })),
        subtotal: lineSubtotal,
        discount: round2(discountAmount + promotionDiscount + loyaltyDiscount),
        tax: taxAmount,
        total: totalAmount,
        paid: paidAmount,
        change: changeDue,
      });
      channel.close();
    } catch {
      // Customer-display sync is best-effort while the main POS remains usable.
    }
  }, [cart, lineSubtotal, discountAmount, promotionDiscount, loyaltyDiscount, taxAmount, totalAmount, paidAmount, changeDue]);

  return { openCustomerDisplay };
};
