import type { CartItem, Toast } from '../../types/pos';

export interface CustomerDisplayData {
  items: Array<{ name: string; qty: number; price: number }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
}

export const renderCustomerDisplay = (display: Window, data: CustomerDisplayData) => {
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

export interface UsePosCustomerDisplayOptions {
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
