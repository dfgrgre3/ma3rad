import { DatabaseManager } from '../../database/repositories/databaseManager';
import type { SalesInvoice, SystemSettings } from '../../types';
import { SettingsService } from '../domains/config/SettingsService';
import { getEffectiveBusinessType } from '../domains/config/BusinessTypeService';
import { getProfilePrintTemplate } from '../../config/businessProfiles';
import { writeAndPrintWindow } from '../../utils/shared/printWindow';
import type { InvoiceHtmlOptions, InvoiceSizeId, InvoiceTemplateId } from './PrintService/types';
import { getSampleInvoice } from './PrintService/sampleInvoice';
import { getTableFirstInvoiceHtml } from './PrintService/templates/tableFirst';
import { getClassicInvoiceHtml } from './PrintService/templates/classic';
import { getModernInvoiceHtml } from './PrintService/templates/modern';
import { getCompactInvoiceHtml } from './PrintService/templates/compact';
import { getDetailedInvoiceHtml } from './PrintService/templates/detailed';
import { getThermalInvoiceHtml } from './PrintService/templates/thermal';
import { printThermalReceipt as printThermalReceiptDocument } from './PrintService/thermalReceipt';
import {
  printOrderDocument,
  printPurchaseReturnDocument,
  printQuotationDocument,
  printSalesReturnDocument,
} from './PrintService/documents';

export type { InvoiceHtmlOptions, InvoiceSizeId, InvoiceTemplateId } from './PrintService/types';

export class PrintService {
  private db = DatabaseManager.getInstance();

  public getSettings(): SystemSettings {
    return SettingsService.getSettings();
  }

  /**
   * Generates a realistic ceramic & building materials sample invoice for previewing
   * and testing print templates without needing live transactional data.
   */
  public getSampleInvoice(settingsOverride?: Partial<SystemSettings>): SalesInvoice & { items: any[] } {
    return getSampleInvoice(settingsOverride);
  }

  /**
   * Returns invoice document HTML based on the requested template and paper size.
   * Legacy autoPrint options are accepted for compatibility, but generated HTML
   * remains script-free; callers must initiate printing from the parent window.
   */
  public getInvoiceHtml(
    invoice: SalesInvoice & { items: any[] },
    optionsOrAutoPrint: boolean | InvoiceHtmlOptions = false,
  ): string {
    const opts: InvoiceHtmlOptions = typeof optionsOrAutoPrint === 'boolean'
      ? { autoPrint: optionsOrAutoPrint }
      : (optionsOrAutoPrint || {});

    const settings = { ...this.getSettings(), ...(opts.settingsOverride || {}) };
    const size: InvoiceSizeId = opts.size || (settings.defaultInvoiceSize as InvoiceSizeId) || 'a4';
    const profileTemplate = getProfilePrintTemplate(getEffectiveBusinessType(), 'sales_invoice');
    const resolvedProfileTemplate =
      profileTemplate && (['table', 'classic', 'modern', 'compact', 'detailed'] as const).includes(profileTemplate as any)
        ? (profileTemplate as InvoiceTemplateId)
        : undefined;
    const template: InvoiceTemplateId = opts.template || (settings.defaultInvoiceTemplate as InvoiceTemplateId) || resolvedProfileTemplate || 'table';

    if (size === 'thermal') {
      return getThermalInvoiceHtml(invoice, settings);
    }

    if (template === 'modern') {
      return getModernInvoiceHtml(invoice, settings, size);
    }
    if (template === 'compact') {
      return getCompactInvoiceHtml(invoice, settings, size);
    }
    if (template === 'detailed') {
      return getDetailedInvoiceHtml(invoice, settings, size);
    }
    if (template === 'table') {
      return getTableFirstInvoiceHtml(invoice, settings, size);
    }

    return getClassicInvoiceHtml(invoice, settings, size);
  }

  /**
   * Generates live preview HTML for any template & size combination.
   */
  public getTemplatePreviewHtml(
    template: InvoiceTemplateId = 'table',
    size: InvoiceSizeId = 'a4',
    settingsOverride?: Partial<SystemSettings>,
  ): string {
    const sample = this.getSampleInvoice(settingsOverride);
    return this.getInvoiceHtml(sample, {
      template,
      size,
      settingsOverride,
      autoPrint: false,
    });
  }

  public printInvoice(
    invoice: SalesInvoice & { items: any[] },
    size?: InvoiceSizeId,
    template?: InvoiceTemplateId,
  ): void {
    const printWindow = window.open('about:blank', '_blank', 'width=850,height=900');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة لطباعة الفاتورة');
      return;
    }
    writeAndPrintWindow(
      printWindow,
      this.getInvoiceHtml(invoice, { size, template }),
      true,
    );
  }

  /**
   * Prints a test page for the selected paper size and template.
   */
  public printTestPage(
    size: InvoiceSizeId = 'a4',
    template: InvoiceTemplateId = 'table',
  ): void {
    const sample = this.getSampleInvoice();
    this.printInvoice(sample, size, template);
  }

  /**
   * 80mm thermal receipt for point-of-sale checkout. Kept intentionally compact
   * (no table borders, monospace-ish) so it renders correctly on narrow roll paper.
   */
  public async printThermalReceipt(invoice: SalesInvoice & { items: any[] }): Promise<void> {
    return printThermalReceiptDocument(invoice);
  }

  // ─── Quotations / Orders / Returns ──────────────────────────────────────────

  public printQuotation(quotation: any): void {
    printQuotationDocument(quotation);
  }

  public printOrder(order: any): void {
    printOrderDocument(order);
  }

  public printSalesReturn(salesReturn: any): void {
    printSalesReturnDocument(salesReturn);
  }

  public printPurchaseReturn(purchaseReturn: any): void {
    printPurchaseReturnDocument(purchaseReturn);
  }
}
