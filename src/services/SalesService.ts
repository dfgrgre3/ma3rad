import { DatabaseManager } from '../database/db';
import type { SalesInvoice, SalesInvoiceItem, SalesReturn, SalesReturnItem, PaymentType, CustomerPayment } from '../types';
import { BranchAccessService } from './BranchAccessService';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { ModuleRegistryService } from './ModuleRegistryService';
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
      getInvoiceById: (id: string) => this.readInvoice(id),
    };
  }

  /** Internal invoice read used by mutations; public reads add `sales.view`. */
  private readInvoice(id: string): (SalesInvoice & { items: SalesInvoiceItem[] }) | null {
    return fetchInvoiceById(this.context(), id);
  }

  private requireSalesView(): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.view');
  }

  // ─── Invoices ───────────────────────────────────────────────────────────────

  public getAllInvoices(search?: string, dateFrom?: string, dateTo?: string): SalesInvoice[] {
    this.requireSalesView();
    return this.getInvoicesFiltered({ search, dateFrom, dateTo }, false);
  }

  public getInvoicesFiltered(
    filters: InvoiceFilters = {},
    includeVoid = true
  ): (SalesInvoice & { returnedAmount?: number; itemsCount?: number })[] {
    this.requireSalesView();
    return fetchInvoicesFiltered(this.context(), filters, includeVoid);
  }

  public getStats(filters: InvoiceFilters = {}, includeVoid = true): InvoiceStats {
    this.requireSalesView();
    return fetchInvoiceStats(this.context(), filters, includeVoid);
  }

  public getInvoiceById(id: string): (SalesInvoice & { items: SalesInvoiceItem[] }) | null {
    this.requireSalesView();
    return this.readInvoice(id);
  }

  public createSale(dto: CreateSaleDTO): SalesInvoice {
    ModuleRegistryService.assertModuleEnabled('sales');
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
    ModuleRegistryService.assertModuleEnabled('sales');
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
    ModuleRegistryService.assertModuleEnabled('sales');
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
    this.requireSalesView();
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
    ModuleRegistryService.assertModuleEnabled('sales');
    return createSaleReturn(this.context(), invoiceId, returnItems, refundCash, performedBy, options);
  }

  /**
   * Exchange (swap): return some items from an invoice (refunded to customer balance)
   * and sell new items in the same operation. The returned value becomes credit that
   * offsets the new purchase, so the customer's balance nets automatically.
   */
  public exchangeSale(
    invoiceId: string,
    returnItems: ReturnRequestItem[],
    newItems: CreateSaleDTO['items'],
    performedBy = 'usr_admin',
    options: {
      warehouseId?: string;
      shiftId?: string;
      notes?: string;
    } = {}
  ): { return: SalesReturn; invoice: SalesInvoice } {
    ModuleRegistryService.assertModuleEnabled('sales');
    const ctx = this.context();
    const inv = ctx.getInvoiceById(invoiceId);
    if (!inv) throw new Error('الفاتورة الأصلية غير موجودة.');
    const warehouseId = options.warehouseId || inv.warehouseId;

    // 1. Return selected items, refunding to customer balance (credit).
    const ret = createSaleReturn(ctx, invoiceId, returnItems, false, performedBy, {
      refundMethod: 'BALANCE',
      shiftId: options.shiftId,
    });

    // 2. Create a new sale for the replacement items on credit.
    const newInvoice = createSalesInvoice(ctx, {
      customerId: inv.customerId,
      warehouseId,
      shiftId: options.shiftId,
      items: newItems,
      paidAmount: 0,
      paymentType: 'CREDIT',
      notes: options.notes || `استبدال من فاتورة ${inv.invoiceNumber}`,
      performedBy,
    });

    return { return: ret, invoice: newInvoice };
  }

  /** Void a completed sales invoice with full reversal (brief §67/§220). */
  public voidInvoice(invoiceId: string, reason: string): SalesInvoice {
    return voidSalesInvoice(this.context(), invoiceId, reason);
  }

  public getReturns(search = '', dateFrom?: string, dateTo?: string): (SalesReturn & { customerName: string; invoiceNumber: string })[] {
    this.requireSalesView();
    return fetchReturns(this.context(), search, dateFrom, dateTo);
  }

  public getReturnById(id: string): (SalesReturn & { items: SalesReturnItem[]; customerName?: string; invoiceNumber?: string }) | null {
    this.requireSalesView();
    return fetchReturnById(this.context(), id);
  }

  public getReturnsStats(): ReturnStats {
    this.requireSalesView();
    return fetchReturnStats(this.context());
  }

  public getTopReturnReasons(limit = 5): { reason: string; count: number; amount: number }[] {
    this.requireSalesView();
    return fetchTopReturnReasons(this.context(), limit);
  }

  public getReturnItems(returnId: string): SalesReturnItem[] {
    this.requireSalesView();
    return fetchReturnItems(this.context(), returnId);
  }

  /** Remaining returnable quantity per product for an invoice, after prior returns. */
  public getReturnableItems(invoiceId: string): ReturnableItem[] {
    this.requireSalesView();
    return fetchReturnableItems(this.context(), invoiceId);
  }
}
