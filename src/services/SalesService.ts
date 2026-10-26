import { DatabaseManager } from '../database/db';
import type { SalesInvoice, SalesInvoiceItem, SalesReturn, SalesReturnItem, PaymentType, CustomerPayment } from '../types';
import { BranchAccessService } from './BranchAccessService';
import type { SalesContext } from './sales/context';
import type { CreateSaleDTO, InvoiceFilters, InvoiceStats, ReturnableItem, ReturnRequestItem, ReturnStats } from './sales/types';
import {
  fetchInvoiceById,
  fetchInvoicePayments,
  fetchInvoiceStats,
  fetchInvoicesFiltered,
} from './sales/invoiceQueries';
import { createSalesInvoice } from './sales/invoiceCreation';
import {
  deleteInvoicePaymentEntry,
  recordCustomerPaymentAllocationsEntry,
  recordInvoicePaymentEntry,
} from './sales/payments';
import { createSaleReturn } from './sales/returns';
import { voidSalesInvoice } from './sales/invoiceVoid';
import {
  fetchReturnableItems,
  fetchReturnById,
  fetchReturnItems,
  fetchReturns,
  fetchReturnStats,
  fetchTopReturnReasons,
} from './sales/returnQueries';

export type { CreateSaleDTO, InvoiceFilters, InvoiceStats, ReturnableItem, ReturnRequestItem, ReturnStats };

export class SalesService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private context(): SalesContext {
    return {
      db: this.db,
      branchAccess: this.branchAccess,
      getInvoiceById: (id: string) => this.getInvoiceById(id),
    };
  }

  // ─── Invoices ───────────────────────────────────────────────────────────────

  public getAllInvoices(search?: string, dateFrom?: string, dateTo?: string): SalesInvoice[] {
    return this.getInvoicesFiltered({ search, dateFrom, dateTo }, false);
  }

  public getInvoicesFiltered(
    filters: InvoiceFilters = {},
    includeVoid = true
  ): (SalesInvoice & { returnedAmount?: number; itemsCount?: number })[] {
    return fetchInvoicesFiltered(this.context(), filters, includeVoid);
  }

  public getStats(filters: InvoiceFilters = {}, includeVoid = true): InvoiceStats {
    return fetchInvoiceStats(this.context(), filters, includeVoid);
  }

  public getInvoiceById(id: string): (SalesInvoice & { items: SalesInvoiceItem[] }) | null {
    return fetchInvoiceById(this.context(), id);
  }

  public createSale(dto: CreateSaleDTO): SalesInvoice {
    return createSalesInvoice(this.context(), dto);
  }

  /** Collect a payment against an unpaid/partially-paid invoice (brief §68/§220). */
  public recordInvoicePayment(
    invoiceId: string,
    amount: number,
    paymentType: PaymentType = 'CASH',
    registerId?: string,
    shiftId?: string,
    notes = ''
  ): CustomerPayment {
    return recordInvoicePaymentEntry(this.context(), invoiceId, amount, paymentType, registerId, shiftId, notes);
  }

  /** Record one receipt allocated across several open invoices in one transaction. */
  public recordCustomerPaymentAllocations(
    customerId: string,
    allocations: Array<{ invoiceId: string; amount: number }>,
    paymentType: PaymentType = 'CASH',
    registerId = 'cr_main',
    date?: string,
    reference = '',
    notes = '',
    shiftId?: string,
    idempotencyKey?: string,
  ): { groupId: string; total: number; receipts: string[] } {
    return recordCustomerPaymentAllocationsEntry(
      this.context(),
      customerId,
      allocations,
      paymentType,
      registerId,
      date,
      reference,
      notes,
      shiftId,
      idempotencyKey,
    );
  }

  public getInvoicePayments(invoiceId: string): CustomerPayment[] {
    return fetchInvoicePayments(this.context(), invoiceId);
  }

  public deleteInvoicePayment(paymentId: string): void {
    deleteInvoicePaymentEntry(this.context(), paymentId);
  }

  // ─── Returns ────────────────────────────────────────────────────────────────

  public returnSale(
    invoiceId: string,
    returnItems: ReturnRequestItem[],
    refundCash = true,
    performedBy = 'usr_admin',
    options: {
      registerId?: string;
      shiftId?: string;
      refundMethod?: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'BALANCE';
    } = {}
  ): SalesReturn {
    return createSaleReturn(this.context(), invoiceId, returnItems, refundCash, performedBy, options);
  }

  /** Void a completed sales invoice with full reversal (brief §67/§220). */
  public voidInvoice(invoiceId: string, reason: string): SalesInvoice {
    return voidSalesInvoice(this.context(), invoiceId, reason);
  }

  public getReturns(search = '', dateFrom?: string, dateTo?: string): (SalesReturn & { customerName: string; invoiceNumber: string })[] {
    return fetchReturns(this.context(), search, dateFrom, dateTo);
  }

  public getReturnById(id: string): (SalesReturn & { items: SalesReturnItem[]; customerName?: string; invoiceNumber?: string }) | null {
    return fetchReturnById(this.context(), id);
  }

  public getReturnsStats(): ReturnStats {
    return fetchReturnStats(this.context());
  }

  public getTopReturnReasons(limit = 5): { reason: string; count: number; amount: number }[] {
    return fetchTopReturnReasons(this.context(), limit);
  }

  public getReturnItems(returnId: string): SalesReturnItem[] {
    return fetchReturnItems(this.context(), returnId);
  }

  /** Remaining returnable quantity per product for an invoice, after prior returns. */
  public getReturnableItems(invoiceId: string): ReturnableItem[] {
    return fetchReturnableItems(this.context(), invoiceId);
  }
}
