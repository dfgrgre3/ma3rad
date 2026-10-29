import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { getProductUnitLabel } from '../utils/productUnits';

export type CustomerSupplyStatus = 'OPEN' | 'PARTIAL' | 'READY' | 'CANCELLED';

export interface CustomerSupplyRequestItem {
  id: string;
  requestId: string;
  productId: string;
  productName: string;
  productSku?: string | null;
  productGrade?: string | null;
  size?: string | null;
  quantityRequested: number;
  quantityReceived: number;
  quantityRemaining: number;
  unit: string;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
  unitPrice: number;
  totalPrice: number;
  status: CustomerSupplyStatus;
  expectedDate?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface CustomerSupplyRequest {
  id: string;
  customerId: string;
  customerName: string;
  phone?: string | null;
  address?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  status: CustomerSupplyStatus;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  createdAt: string;
  items: CustomerSupplyRequestItem[];
}

export class CustomerSupplyService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private ensureTables(): void {
    this.db.run(`CREATE TABLE IF NOT EXISTS customer_supply_requests (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      invoice_id TEXT,
      invoice_number TEXT,
      warehouse_id TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','PARTIAL','READY','CANCELLED')),
      expected_delivery_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    this.db.run(`CREATE TABLE IF NOT EXISTS customer_supply_request_items (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_sku TEXT,
      product_grade TEXT,
      size TEXT,
      quantity_requested REAL NOT NULL DEFAULT 0,
      quantity_received REAL NOT NULL DEFAULT 0,
      quantity_remaining REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'M2',
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','PARTIAL','READY','CANCELLED')),
      expected_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES customer_supply_requests(id) ON DELETE CASCADE
    )`);
  }

  public getOpenRequests(filters: { customerId?: string; warehouseId?: string; search?: string } = {}): CustomerSupplyRequest[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.view');
    this.ensureTables();
    const companyScope = this.branchAccess.companyScope('w.company_id', actor);
    const params: any[] = [...companyScope.params];
    let sql = `
      SELECT r.id, r.customer_id AS customerId, c.name AS customerName, c.phone, c.address,
             r.invoice_id AS invoiceId, r.invoice_number AS invoiceNumber, r.warehouse_id AS warehouseId,
             COALESCE(w.name, '') AS warehouseName, r.status, r.expected_delivery_date AS expectedDeliveryDate,
             r.notes, r.created_at AS createdAt
      FROM customer_supply_requests r
      JOIN customers c ON c.id = r.customer_id
      LEFT JOIN warehouses w ON w.id = r.warehouse_id
      WHERE r.status IN ('OPEN', 'PARTIAL', 'READY') AND ${companyScope.clause}
    `;

    const accessibleBranches = this.branchAccess.getAccessibleBranchIds(actor);
    if (accessibleBranches !== null) {
      if (!accessibleBranches.length) {
        sql += ` AND 1 = 0`;
      } else {
        const branchParams = accessibleBranches.map(() => '?');
        const branchList = branchParams.join(', ');
        sql += ` AND (
          w.branch_id IN (${branchList})
          OR EXISTS (
            SELECT 1 FROM branch_warehouses bw
            WHERE bw.warehouse_id = w.id AND bw.branch_id IN (${branchList})
          )
        )`;
        params.push(...accessibleBranches, ...accessibleBranches);
      }
    }

    if (filters.customerId) {
      sql += ` AND r.customer_id = ?`;
      params.push(filters.customerId);
    }
    if (filters.warehouseId) {
      sql += ` AND r.warehouse_id = ?`;
      params.push(filters.warehouseId);
    }
    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      sql += ` AND (c.name LIKE ? OR c.phone LIKE ? OR r.invoice_number LIKE ?
        OR EXISTS (SELECT 1 FROM customer_supply_request_items i WHERE i.request_id = r.id AND i.product_name LIKE ?))`;
      params.push(term, term, term, term);
    }
    sql += ` ORDER BY r.created_at DESC`;

    const requests = this.db.query<any>(sql, params);
    return requests.map((request) => ({
      ...request,
      items: this.getItemRowsForRequest(request.id),
    }));
  }

  public getReadyRequests(filters: { customerId?: string } = {}): CustomerSupplyRequest[] {
    const all = this.getOpenRequests(filters);
    return all.filter((request) => request.status === 'READY' || request.items.every((item) => item.status === 'READY'));
  }

  public recordInvoiceDemand(input: {
    customerId: string;
    invoiceId?: string | null;
    invoiceNumber?: string | null;
    warehouseId?: string | null;
    productId: string;
    productName: string;
    productSku?: string | null;
    productGrade?: string | null;
    size?: string | null;
    quantityRequested: number;
    unitPrice?: number;
    expectedDate?: string | null;
    notes?: string | null;
  }): CustomerSupplyRequestItem {
    PermissionService.require(AuthService.requireAuth(), 'sales.create');
    this.ensureTables();
    const quantity = Number(input.quantityRequested || 0);
    if (!(quantity > 0)) throw new Error('يجب إدخال كمية أكبر من صفر للمنتج المطلوب.');

    const requestId = this.findOrCreateRequest({
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      invoiceNumber: input.invoiceNumber,
      warehouseId: input.warehouseId,
      expectedDeliveryDate: input.expectedDate,
      notes: input.notes,
    });

    const existing = this.db.query<any>(`SELECT * FROM customer_supply_request_items WHERE request_id = ? AND product_id = ?`, [requestId, input.productId])[0];
    const unitPrice = Number(input.unitPrice || 0);
    const totalPrice = Math.round(unitPrice * quantity * 100) / 100;

    if (existing) {
      const currentRequested = Number(existing.quantityRequested ?? existing.quantity_requested ?? 0);
      const currentReceived = Number(existing.quantityReceived ?? existing.quantity_received ?? 0);
      const nextRequested = currentRequested + quantity;
      const nextRemaining = Math.max(0, nextRequested - currentReceived);
      const nextStatus = nextRemaining <= 0 ? 'READY' : (currentReceived > 0 ? 'PARTIAL' : 'OPEN');
      // Preserve the value of earlier demand if the newly requested quantity
      // has a different price; unit_price remains the blended request price.
      const currentTotal = Number(existing.totalPrice ?? existing.total_price ?? 0);
      const nextTotalPrice = Math.round((currentTotal + totalPrice) * 100) / 100;
      const nextUnitPrice = nextRequested > 0 ? Math.round((nextTotalPrice / nextRequested) * 100) / 100 : unitPrice;
      this.db.run(`
        UPDATE customer_supply_request_items
        SET quantity_requested = ?, quantity_remaining = ?, total_price = ?, unit_price = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [nextRequested, nextRemaining, nextTotalPrice, nextUnitPrice, nextStatus, existing.id]);
      this.refreshRequestStatus(requestId);
      return this.getItemById(existing.id)!;
    }

    const itemId = `csi_${uuidv4().substring(0, 8)}`;
    const productUnit = this.db.query<any>(
      `SELECT product_type AS productType, base_unit AS baseUnit, custom_unit AS customUnit
       FROM products WHERE id = ?`,
      [input.productId]
    )[0];
    const unit = productUnit ? getProductUnitLabel(productUnit) : 'م²';
    this.db.run(`
      INSERT INTO customer_supply_request_items (
        id, request_id, product_id, product_name, product_sku, product_grade, size,
        quantity_requested, quantity_received, quantity_remaining, unit, unit_price,
        total_price, status, expected_date, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      itemId,
      requestId,
      input.productId,
      input.productName,
      input.productSku || null,
      input.productGrade || null,
      input.size || null,
      quantity,
      quantity,
      unit,
      unitPrice,
      totalPrice,
      'OPEN',
      input.expectedDate || null,
      input.notes || null,
    ]);

    this.refreshRequestStatus(requestId);
    return this.getItemById(itemId)!;
  }

  public allocateReceivedQuantity(warehouseId: string, productId: string, receivedQuantity: number, db = this.db): number {
    PermissionService.require(AuthService.requireAuth(), 'purchases.create');
    this.ensureTables();
    const qty = Number(receivedQuantity || 0);
    if (!(qty > 0)) return 0;

    const rows = db.query<any>(`
      SELECT i.id, i.request_id AS requestId, i.quantity_requested AS quantityRequested, i.quantity_received AS quantityReceived, i.quantity_remaining AS quantityRemaining, i.status,
             r.customer_id AS customerId, r.invoice_id AS invoiceId, r.invoice_number AS invoiceNumber
      FROM customer_supply_request_items i
      JOIN customer_supply_requests r ON r.id = i.request_id
      WHERE r.warehouse_id = ?
        AND i.product_id = ?
        AND i.status IN ('OPEN', 'PARTIAL')
        AND i.quantity_remaining > 0
      ORDER BY r.created_at ASC, i.created_at ASC
    `, [warehouseId, productId]);

    let remainingToAllocate = qty;
    for (const row of rows) {
      if (remainingToAllocate <= 0) break;
      const rem = Number(row.quantityRemaining ?? row.quantity_remaining ?? 0);
      const alloc = Math.min(rem, remainingToAllocate);
      if (alloc <= 0) continue;
      const rec = Number(row.quantityReceived ?? row.quantity_received ?? 0);
      const req = Number(row.quantityRequested ?? row.quantity_requested ?? 0);
      const nextReceived = rec + alloc;
      const nextRemaining = Math.max(0, req - nextReceived);
      const nextStatus = nextRemaining <= 0 ? 'READY' : 'PARTIAL';
      db.run(`UPDATE customer_supply_request_items SET quantity_received = ?, quantity_remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [nextReceived, nextRemaining, nextStatus, row.id]);
      remainingToAllocate -= alloc;
    }

    for (const row of rows) {
      const refreshed = db.query<any>(`SELECT quantity_requested AS quantityRequested, quantity_received AS quantityReceived, quantity_remaining AS quantityRemaining, status FROM customer_supply_request_items WHERE id = ?`, [row.id])[0];
      if (refreshed && Number(refreshed.quantityRemaining ?? refreshed.quantity_remaining ?? 0) <= 0) {
        db.run(`UPDATE customer_supply_request_items SET status = 'READY', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [row.id]);
      }
    }

    // Refresh parent request statuses after inventory allocation.
    const requestIds = Array.from(new Set(rows.map((row) => row.requestId ?? row.request_id).filter(Boolean)));
    for (const requestId of requestIds) {
      this.refreshRequestStatus(requestId, db);
    }

    return qty - remainingToAllocate;
  }

  public getReadyForDelivery(filters: { customerId?: string; search?: string } = {}): CustomerSupplyRequest[] {
    return this.getOpenRequests(filters).filter((request) => request.status === 'READY' || request.items.every((item) => item.status === 'READY'));
  }

  private getItemRowsForRequest(requestId: string): CustomerSupplyRequestItem[] {
    const rows = this.db.query<any>(`
      SELECT i.id, i.request_id AS requestId, i.product_id AS productId, i.product_name AS productName,
             i.product_sku AS productSku, i.product_grade AS productGrade, i.size,
             i.quantity_requested AS quantityRequested, i.quantity_received AS quantityReceived,
             i.quantity_remaining AS quantityRemaining, i.unit, i.unit_price AS unitPrice,
             i.total_price AS totalPrice, i.status, i.expected_date AS expectedDate, i.notes, i.created_at AS createdAt,
             p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
      FROM customer_supply_request_items i LEFT JOIN products p ON p.id = i.product_id
      WHERE i.request_id = ? ORDER BY i.created_at ASC
    `, [requestId]);
    return rows.map((row) => ({ ...row, quantityRequested: Number(row.quantityRequested || 0), quantityReceived: Number(row.quantityReceived || 0), quantityRemaining: Number(row.quantityRemaining || 0), unitPrice: Number(row.unitPrice || 0), totalPrice: Number(row.totalPrice || 0) }));
  }

  private getItemById(id: string): CustomerSupplyRequestItem | null {
    const row = this.db.query<any>(`
      SELECT i.id, i.request_id AS requestId, i.product_id AS productId, i.product_name AS productName,
             i.product_sku AS productSku, i.product_grade AS productGrade, i.size,
             i.quantity_requested AS quantityRequested, i.quantity_received AS quantityReceived,
             i.quantity_remaining AS quantityRemaining, i.unit, i.unit_price AS unitPrice,
             i.total_price AS totalPrice, i.status, i.expected_date AS expectedDate, i.notes, i.created_at AS createdAt,
             p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
      FROM customer_supply_request_items i LEFT JOIN products p ON p.id = i.product_id
      WHERE i.id = ?
    `, [id])[0];
    if (!row) return null;
    return { ...row, quantityRequested: Number(row.quantityRequested || 0), quantityReceived: Number(row.quantityReceived || 0), quantityRemaining: Number(row.quantityRemaining || 0), unitPrice: Number(row.unitPrice || 0), totalPrice: Number(row.totalPrice || 0) };
  }

  private findOrCreateRequest(input: {
    customerId: string;
    invoiceId?: string | null;
    invoiceNumber?: string | null;
    warehouseId?: string | null;
    expectedDeliveryDate?: string | null;
    notes?: string | null;
  }): string {
    const existing = this.db.query<any>(`SELECT id FROM customer_supply_requests WHERE customer_id = ? AND COALESCE(invoice_id, '__') = COALESCE(?, '__') LIMIT 1`, [input.customerId, input.invoiceId || null])[0];
    if (existing) return existing.id;

    const requestId = `csr_${uuidv4().substring(0, 8)}`;
    this.db.run(`
      INSERT INTO customer_supply_requests (
        id, customer_id, invoice_id, invoice_number, warehouse_id, status, expected_delivery_date, notes
      ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)
    `, [requestId, input.customerId, input.invoiceId || null, input.invoiceNumber || null, input.warehouseId || null, input.expectedDeliveryDate || null, input.notes || null]);
    return requestId;
  }

  private refreshRequestStatus(requestId: string, db = this.db): void {
    const items = db.query<any>(`SELECT status, quantity_requested AS quantityRequested, quantity_received AS quantityReceived FROM customer_supply_request_items WHERE request_id = ?`, [requestId]);
    if (!items.length) {
      db.run(`UPDATE customer_supply_requests SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [requestId]);
      return;
    }

    const allReady = items.every((item) => Number(item.quantityReceived ?? item.quantity_received ?? 0) >= Number(item.quantityRequested ?? item.quantity_requested ?? 0) || item.status === 'READY');
    const hasProgress = items.some((item) => Number(item.quantityReceived ?? item.quantity_received ?? 0) > 0 || item.status === 'PARTIAL');
    const nextStatus = allReady ? 'READY' : (hasProgress ? 'PARTIAL' : 'OPEN');
    db.run(`UPDATE customer_supply_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [nextStatus, requestId]);
  }
}
