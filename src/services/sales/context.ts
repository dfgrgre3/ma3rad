import type { DatabaseManager } from '../../database/db';
import type { BranchAccessService } from '../BranchAccessService';
import type { SalesInvoice, SalesInvoiceItem } from '../../types';

export type InvoiceWithItems = SalesInvoice & { items: SalesInvoiceItem[] };
export type InvoiceLookup = (id: string) => InvoiceWithItems | null;

/** Dependencies shared by the extracted sales modules. */
export interface SalesContext {
  db: DatabaseManager;
  branchAccess: BranchAccessService;
  getInvoiceById: InvoiceLookup;
}
