import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { SalesService } from './SalesService';
import type { PaymentType, SalesInvoice } from '../../../types';
import { BranchAccessService } from '../auth/BranchAccessService';
import {
  getOrder,
  getOrderDeposits,
  getOrderItems,
  getOrders,
  getStats,
  getStatusHistory,
} from './OrderService/queries';
import {
  cancelOrder,
  createOrder,
  deleteCancelledOrder,
  recordDelivery,
  updateOrder,
  updateStatus,
} from './OrderService/lifecycle';
import { recordDeposit, refundDeposit } from './OrderService/deposits';
import { convertToInvoice } from './OrderService/invoicing';
import type {
  ConvertOrderOptions,
  Order,
  OrderDeliveryLine,
  OrderDeposit,
  OrderInput,
  OrderItem,
  OrderStats,
  OrderStatus,
  OrderStatusEntry,
} from './OrderService/types';

export type {
  OrderStatus,
  Order,
  OrderItem,
  OrderDeposit,
  OrderDeliveryLine,
  OrderStatusEntry,
  OrderItemInput,
  OrderInput,
  OrderFilters,
  OrderStats,
  ConvertOrderOptions,
} from './OrderService/types';

export class OrderService {
  private db = DatabaseManager.getInstance();
  private sales = new SalesService();
  private branchAccess = new BranchAccessService();

  public getOrders(search = '', status: 'ALL' | OrderStatus = 'ALL', dateFrom?: string, dateTo?: string): Order[] {
    return getOrders(this.db, this.branchAccess, search, status, dateFrom, dateTo);
  }

  public getOrder(id: string): Order | null {
    return getOrder(this.db, this.branchAccess, id);
  }

  public getOrderDeposits(orderId: string): OrderDeposit[] {
    return getOrderDeposits(this.db, this.branchAccess, orderId);
  }

  public getOrderItems(orderId: string): OrderItem[] {
    return getOrderItems(this.db, this.branchAccess, orderId);
  }

  public getStats(): OrderStats {
    return getStats(this.db, this.branchAccess);
  }

  public createOrder(input: OrderInput): Order {
    return createOrder(this.db, this.branchAccess, input);
  }

  public updateOrder(id: string, input: OrderInput): Order {
    return updateOrder(this.db, this.branchAccess, id, input);
  }

  public updateStatus(id: string, status: OrderStatus): void {
    return updateStatus(this.db, this.branchAccess, id, status);
  }

  /**
   * Records the quantities actually handed to the customer. Deliveries may be
   * split across multiple visits; each call accumulates the delivered metres.
   * The order becomes PARTIAL until every line is fully delivered.
   */
  public recordDelivery(
    id: string,
    lines: OrderDeliveryLine[],
    note?: string,
    markDeliveredAt = true
  ): Order {
    return recordDelivery(this.db, this.branchAccess, id, lines, note, markDeliveredAt);
  }

  public getStatusHistory(orderId: string): OrderStatusEntry[] {
    return getStatusHistory(this.db, this.branchAccess, orderId);
  }

  public recordDeposit(id: string, amount: number, paymentType: PaymentType = 'CASH', notes?: string, bankAccountId?: string, idempotencyKey?: string): Order {
    return recordDeposit(this.db, this.branchAccess, id, amount, paymentType, notes, bankAccountId, idempotencyKey);
  }

  public refundDeposit(depositId: string, reason: string): string {
    return refundDeposit(this.db, this.branchAccess, depositId, reason);
  }

  public cancelOrder(id: string): void {
    return cancelOrder(this.db, this.branchAccess, id);
  }

  public convertToInvoice(id: string, options: ConvertOrderOptions = {}): SalesInvoice {
    return convertToInvoice(this.db, this.branchAccess, this.sales, id, options);
  }

  public deleteCancelledOrder(id: string): void {
    return deleteCancelledOrder(this.db, this.branchAccess, id);
  }
}
