import type { SalesInvoice, SystemSettings } from '../types';
import { CeramicMath } from '../utils/ceramicMath';

/**
 * Builds raw ESC/POS byte streams for 80mm thermal receipt printers.
 * The bytes are sent straight to the Windows spooler through the
 * `print:raw` IPC channel (electron/main.js) — no driver dialog involved.
 *
 * Arabic text is encoded as Windows-1256 and the receipt opens with
 * `ESC t n` so the printer interprets those bytes with the matching
 * codepage (54 = CP1256 on most Epson-compatible firmware; configurable
 * in system settings via `thermalCodepage` for other devices).
 */

const ESC = 0x1b;
const GS = 0x1d;

// Windows-1256 Arabic portion (verified against the official codec table).
// ASCII passes through unchanged; anything outside the table falls back to
// '?' so we never emit invalid bytes.
const CP1256: Record<string, number> = {
  '،': 0xa1, '؛': 0xba, '؟': 0xbf, 'ـ': 0xdc,
  'ء': 0xc1, 'آ': 0xc2, 'أ': 0xc3, 'ؤ': 0xc4, 'إ': 0xc5, 'ئ': 0xc6,
  'ا': 0xc7, 'ب': 0xc8, 'ة': 0xc9, 'ت': 0xca, 'ث': 0xcb, 'ج': 0xcc,
  'ح': 0xcd, 'خ': 0xce, 'د': 0xcf, 'ذ': 0xd0, 'ر': 0xd1, 'ز': 0xd2,
  'س': 0xd3, 'ش': 0xd4, 'ص': 0xd5, 'ض': 0xd6, 'ط': 0xd8, 'ظ': 0xd9,
  'ع': 0xda, 'غ': 0xdb, 'ف': 0xdd, 'ق': 0xde, 'ك': 0xdf, 'ل': 0xe1,
  'م': 0xe3, 'ن': 0xe4, 'ه': 0xe5, 'و': 0xe6, 'ى': 0xec, 'ي': 0xed,
  'ً': 0xf0, 'ٌ': 0xf1, 'ٍ': 0xf2, 'َ': 0xf3, 'ُ': 0xf5, 'ِ': 0xf6,
  'ّ': 0xf8, 'ْ': 0xfa,
  'پ': 0x81, 'ٹ': 0x8a, 'ڈ': 0x8f, 'چ': 0x8d, 'ژ': 0x8e, 'گ': 0x90,
  'ک': 0x98, 'ڑ': 0x9a, 'ں': 0x9f, 'ھ': 0xaa, 'ہ': 0xc0, 'ے': 0xff,
};

export class EscPosService {
  /** Encodes text to Windows-1256 bytes (ASCII-safe). */
  public static encodeCp1256(text: string): number[] {
    const out: number[] = [];
    for (const ch of String(text ?? '')) {
      const code = ch.codePointAt(0)!;
      if (code < 0x80) out.push(code);
      else if (CP1256[ch] !== undefined) out.push(CP1256[ch]);
      else out.push(0x3f); // '?'
    }
    return out;
  }

  /** Truncates to `width` code points so a long Arabic name never breaks the layout. */
  public static pad(line: string, width: number): string {
    const chars = Array.from(line);
    return chars.length > width ? chars.slice(0, width - 1).join('') + '…' : line;
  }

  /** Two-column line (label left, amount right) fitted to `width`. */
  public static row(left: string, right: string, width: number): string {
    const space = Math.max(1, width - Array.from(left).length - Array.from(right).length);
    return this.pad(left + ' '.repeat(space) + right, width);
  }

  /**
   * Receipt line width in characters from settings — 32 for 58mm paper,
   * 48 for 80mm (standard 12-dot ESC/POS font).
   */
  public static lineWidthFor(settings: SystemSettings): number {
    return settings.thermalPaperWidth === '58' ? 32 : 48;
  }

  private static writeInvoiceItems(
    items: any[],
    width: number,
    line: (value: string) => void,
    centered: (value: string) => void
  ): void {
    for (const item of items) {
      centered(item.productName);
      const meta = `${item.productSku} ${item.size} ${item.quantityM2}م² (${item.boxesCount}ك)`;
      line(EscPosService.row(meta, `${CeramicMath.formatCurrency(item.totalPrice)}`, width));
      if (item.discountAmount > 0) {
        line(EscPosService.row('خصم الصنف', `-${CeramicMath.formatCurrency(item.discountAmount)}`, width));
      }
    }
  }

  /**
   * Builds the complete receipt for a sales invoice, ending with a partial
   * paper cut. `width` is the printer line width in characters (32 for the
   * standard 12-dot font on 80mm paper).
   */
  public static buildReceiptBytes(
    invoice: SalesInvoice & { items: any[] },
    settings: SystemSettings,
    width = 32
  ): Uint8Array {
    const bytes: number[] = [];
    const push = (...b: number[]) => bytes.push(...b);
    const text = (s: string) => bytes.push(...EscPosService.encodeCp1256(s));
    const line = (s: string) => { text(s + '\n'); };
    const centered = (s: string) => { text(EscPosService.pad(s, width) + '\n'); };
    const dashes = '-'.repeat(width);

    // init + select codepage + center + bold
    push(ESC, 0x40);
    push(ESC, 0x74, Math.min(255, Math.max(0, Math.floor(settings.thermalCodepage ?? 54))));
    push(ESC, 0x61, 0x01);
    push(ESC, 0x45, 0x01);
    centered(settings.showroomName);
    push(ESC, 0x45, 0x00);
    if (settings.tagline) centered(settings.tagline);
    if (settings.address) centered(settings.address);
    if (settings.phone) centered('ت: ' + settings.phone);
    line(dashes);

    line(EscPosService.row('إيصال بيع', invoice.invoiceNumber, width));
    line(EscPosService.row('التاريخ', invoice.date, width));
    line(EscPosService.row('العميل', invoice.customerName || 'عميل نقدي', width));
    if (invoice.warehouseName) line(EscPosService.row('المخزن', invoice.warehouseName, width));
    line(dashes);

    EscPosService.writeInvoiceItems(invoice.items, width, line, centered);
    line(dashes);

    line(EscPosService.row('المجموع الفرعي', CeramicMath.formatCurrency(invoice.subtotal), width));
    if (invoice.discountAmount > 0) {
      line(EscPosService.row('خصم الفاتورة', `-${CeramicMath.formatCurrency(invoice.discountAmount)}`, width));
    }
    if (invoice.taxAmount > 0) {
      line(EscPosService.row('ضريبة', `+${CeramicMath.formatCurrency(invoice.taxAmount)}`, width));
    }
    if (invoice.shippingCost > 0) {
      line(EscPosService.row('مشال ونقل', `+${CeramicMath.formatCurrency(invoice.shippingCost)}`, width));
    }
    push(ESC, 0x45, 0x01); // bold the grand total
    line(EscPosService.row('الإجمالي', CeramicMath.formatCurrency(invoice.totalAmount), width));
    push(ESC, 0x45, 0x00);
    line(EscPosService.row('المدفوع', CeramicMath.formatCurrency(invoice.paidAmount), width));
    if (invoice.remainingAmount > 0) {
      line(EscPosService.row('المتبقي (آجل)', CeramicMath.formatCurrency(invoice.remainingAmount), width));
    }
    line(EscPosService.row('الدفع', invoice.paymentType === 'CASH' ? 'نقدي' : invoice.paymentType === 'CARD' ? 'بطاقة' : 'آجل', width));
    line(dashes);
    if (settings.receiptFooter) {
      for (const l of String(settings.receiptFooter).split('\n')) centered(l.trim());
    }

    // feed + partial cut
    push(0x0a, 0x0a, 0x0a);
    push(GS, 0x56, 0x42, 0x00);
    return new Uint8Array(bytes);
  }
}
