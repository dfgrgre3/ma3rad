import type { SystemSettings } from '../../../types';

export type InvoiceTemplateId = 'table' | 'classic' | 'modern' | 'compact' | 'detailed';
export type InvoiceSizeId = 'a4' | 'a5' | 'thermal';

export interface InvoiceHtmlOptions {
  autoPrint?: boolean;
  size?: InvoiceSizeId;
  template?: InvoiceTemplateId;
  settingsOverride?: Partial<SystemSettings>;
}
