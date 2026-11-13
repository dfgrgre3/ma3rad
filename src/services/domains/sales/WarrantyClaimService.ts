import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { round2 } from '../finance/financials';
import { localDateString } from '../../../utils/shared/date';
import { SalesService } from './SalesService';

export type WarrantyClaimStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESOLVED'
  | 'CANCELLED';

export type WarrantyClaimType = 'WARRANTY' | 'REPAIR' | 'REPLACEMENT' | 'COMPLAINT';

export type WarrantyResolutionType = 'REPAIR' | 'REPLACEMENT' | 'REFUND' | 'REJECTED' | 'OTHER';

export type WarrantyClaimAction = 'review' | 'approve' | 'reject' | 'resolve' | 'cancel';

export interface WarrantyClaimEvent {
  id: string;
  claimId: string;
  action: string;
  fromStatus: WarrantyClaimStatus | null;
  toStatus: WarrantyClaimStatus;
  notes?: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
}

export interface WarrantyClaim {
  id: string;
  claimNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceItemId?: string | null;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  productId: string;
  productName: string;
  productSku?: string | null;
  productType?: string | null;
  baseUnit?: string | null;
  customUnit?: string | null;
  grade?: string | null;
  size?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  warehouseId?: string | null;
  claimType: WarrantyClaimType;
  status: WarrantyClaimStatus;
  quantityM2: number;
  warrantyMonths: number;
  warrantyExpiresAt?: string | null;
  issueDescription: string;
  resolutionType?: WarrantyResolutionType | null;
  resolutionNotes?: string | null;
  decidedBy?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  closedAt?: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  events?: WarrantyClaimEvent[];
  execution?: {
    resolutionType: WarrantyResolutionType;
    referenceType: string;
    referenceId?: string | null;
    returnId?: string | null;
    replacementInvoiceId?: string | null;
    amount: number;
    details: string;
    executedAt: string;
  } | null;
}

export interface EligibleWarrantyItem {
  productId: string;
  invoiceItemId: string | null;
  productName: string;
  productSku?: string | null;
  grade?: string | null;
  size?: string | null;
  soldQuantity: number;
  returnedQuantity: number;
  claimedQuantity: number;
  availableQuantity: number;
  unitPrice: number;
  boxesCount: number;
  metersPerBox: number;
  productType?: string | null;
  baseUnit?: string | null;
  customUnit?: string | null;
  warrantyMonths: number;
  warrantyExpiresAt: string;
  warrantyActive: boolean;
  daysRemaining: number;
}

export interface WarrantyInvoiceHeader {
  id: string;
  invoiceNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  invoiceStatus?: string | null;
  branchId?: string | null;
  warehouseId?: string | null;
}

export interface WarrantyClaimsStats {
  total: number;
  open: number;
  underReview: number;
  approved: number;
  rejected: number;
  resolved: number;
  cancelled: number;
  active: number;
  thisMonth: number;
  byType: Record<WarrantyClaimType, number>;
}

export interface CreateWarrantyClaimInput {
  invoiceId: string;
  productId: string;
  claimType?: WarrantyClaimType;
  quantityM2: number;
  issueDescription: string;
  warrantyMonths?: number;
  invoiceItemId?: string;
}

const DEFAULT_WARRANTY_MONTHS = 12;
const CLAIM_TYPES: WarrantyClaimType[] = ['WARRANTY', 'REPAIR', 'REPLACEMENT', 'COMPLAINT'];
const RESOLUTION_TYPES: WarrantyResolutionType[] = ['REPAIR', 'REPLACEMENT', 'REFUND', 'REJECTED', 'OTHER'];

const TRANSITIONS: Record<WarrantyClaimAction, {
  permission: string;
  from: WarrantyClaimStatus[];
  to: WarrantyClaimStatus;
  decided: boolean;
  closes: boolean;
}> = {
  review: {
    permission: 'ui.sales.after_sales.update',
    from: ['OPEN'],
    to: 'UNDER_REVIEW',
    decided: false,
    closes: false,
  },
  approve: {
    permission: 'ui.sales.after_sales.approve',
    from: ['OPEN', 'UNDER_REVIEW'],
    to: 'APPROVED',
    decided: true,
    closes: false,
  },
  reject: {
    permission: 'ui.sales.after_sales.reject',
    from: ['OPEN', 'UNDER_REVIEW'],
    to: 'REJECTED',
    decided: true,
    closes: true,
  },
  resolve: {
    permission: 'ui.sales.after_sales.resolve',
    from: ['APPROVED'],
    to: 'RESOLVED',
    decided: false,
    closes: true,
  },
  cancel: {
    permission: 'ui.sales.after_sales.delete',
    from: ['OPEN', 'UNDER_REVIEW', 'APPROVED'],
    to: 'CANCELLED',
    decided: false,
    closes: true,
  },
};

const CLAIM_SELECT = `
  SELECT c.id, c.claim_number AS claimNumber, c.invoice_id AS invoiceId,
         si.invoice_number AS invoiceNumber, si.date AS invoiceDate,
         c.invoice_item_id AS invoiceItemId, c.customer_id AS customerId,
         cu.name AS customerName, cu.phone AS customerPhone,
         c.product_id AS productId, COALESCE(p.name, sii.product_name) AS productName,
         p.sku AS productSku, p.product_type AS productType, p.base_unit AS baseUnit,
         p.custom_unit AS customUnit,
         COALESCE(sii.product_grade, p.grade) AS grade,
         COALESCE(sii.size, p.size) AS size,
         c.branch_id AS branchId, b.name AS branchName, c.warehouse_id AS warehouseId,
         c.claim_type AS claimType, c.status, c.quantity_m2 AS quantityM2,
         c.warranty_months AS warrantyMonths, c.warranty_expires_at AS warrantyExpiresAt,
         c.issue_description AS issueDescription, c.resolution_type AS resolutionType,
         c.resolution_notes AS resolutionNotes, c.decided_by AS decidedBy,
         ud.full_name AS decidedByName, c.decided_at AS decidedAt, c.closed_at AS closedAt,
         c.created_by AS createdBy, uc.full_name AS createdByName,
         c.created_at AS createdAt, c.updated_at AS updatedAt,
         wx.resolution_type AS executionResolutionType,
         wx.reference_type AS executionReferenceType,
         wx.reference_id AS executionReferenceId,
         wx.return_id AS executionReturnId,
         wx.replacement_invoice_id AS executionReplacementInvoiceId,
         wx.amount AS executionAmount, wx.details AS executionDetails,
         wx.executed_at AS executionDate
  FROM customer_warranty_claims c
  JOIN customers cu ON cu.id = c.customer_id
  JOIN sales_invoices si ON si.id = c.invoice_id
  LEFT JOIN warehouses w ON w.id = si.warehouse_id
  LEFT JOIN products p ON p.id = c.product_id
  LEFT JOIN sales_invoice_items sii ON sii.id = c.invoice_item_id
  LEFT JOIN branches b ON b.id = c.branch_id
  LEFT JOIN users uc ON uc.id = c.created_by
  LEFT JOIN users ud ON ud.id = c.decided_by
  LEFT JOIN warranty_claim_executions wx ON wx.claim_id = c.id`;

function addMonths(dateString: string, months: number): string {
  const base = new Date(`${String(dateString || '').substring(0, 10)}T00:00:00`);
  if (Number.isNaN(base.getTime())) return String(dateString || '').substring(0, 10);
  const expiry = new Date(base.getFullYear(), base.getMonth() + Math.max(0, Math.trunc(months)), base.getDate());
  return localDateString(expiry);
}

function daysUntil(dateString: string): number {
  const target = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 0;
  const today = new Date(`${localDateString()}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

export class WarrantyClaimService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private require(permission: string) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission);
    return actor;
  }

  private scopedClaim(id: string): WarrantyClaim | null {
    const scope = this.branchAccess.sqlScope('c.branch_id', 'si.branch_id');
    const rows = this.db.query<WarrantyClaim>(
      `${CLAIM_SELECT} WHERE c.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    );
    return rows[0] ?? null;
  }

  public listClaims(filters: {
    status?: WarrantyClaimStatus | 'ALL';
    claimType?: WarrantyClaimType | 'ALL';
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}): WarrantyClaim[] {
    this.require('ui.sales.after_sales.view');
    const scope = this.branchAccess.sqlScope('c.branch_id', 'si.branch_id');
    let sql = `${CLAIM_SELECT} WHERE ${scope.clause}`;
    const params: any[] = [...scope.params];

    if (filters.status && filters.status !== 'ALL') {
      sql += ` AND c.status = ?`;
      params.push(filters.status);
    }
    if (filters.claimType && filters.claimType !== 'ALL') {
      sql += ` AND c.claim_type = ?`;
      params.push(filters.claimType);
    }
    if (filters.dateFrom) {
      sql += ` AND substr(c.created_at, 1, 10) >= ?`;
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      sql += ` AND substr(c.created_at, 1, 10) <= ?`;
      params.push(filters.dateTo);
    }
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      sql += ` AND (c.claim_number LIKE ? OR cu.name LIKE ? OR cu.phone LIKE ?
                   OR si.invoice_number LIKE ? OR p.name LIKE ?)`;
      params.push(term, term, term, term, term);
    }
    sql += ` ORDER BY CASE c.status
                WHEN 'OPEN' THEN 0 WHEN 'UNDER_REVIEW' THEN 1 WHEN 'APPROVED' THEN 2 ELSE 3 END,
              c.created_at DESC`;
    return this.db.query<WarrantyClaim>(sql, params);
  }

  public getClaim(id: string): WarrantyClaim | null {
    this.require('ui.sales.after_sales.view');
    const claim = this.scopedClaim(id);
    if (!claim) return null;
    claim.events = this.db.query<WarrantyClaimEvent>(
      `SELECT e.id, e.claim_id AS claimId, e.action, e.from_status AS fromStatus,
              e.to_status AS toStatus, e.notes, e.created_by AS createdBy,
              u.full_name AS createdByName, e.created_at AS createdAt
       FROM customer_warranty_claim_events e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.claim_id = ?
       ORDER BY e.created_at ASC, e.id ASC`,
      [id]
    );
    const execution = this.db.query<any>(`SELECT resolution_type AS resolutionType,
      reference_type AS referenceType, reference_id AS referenceId, return_id AS returnId,
      replacement_invoice_id AS replacementInvoiceId, amount, details, executed_at AS executedAt
      FROM warranty_claim_executions WHERE claim_id = ?`, [id])[0];
    claim.execution = execution || null;
    return claim;
  }

  private readInvoiceHeader(invoiceId: string): WarrantyInvoiceHeader | null {
    const scope = this.branchAccess.sqlScope('si.branch_id', 'w.branch_id');
    const row = this.db.query<WarrantyInvoiceHeader>(
      `SELECT si.id, si.invoice_number AS invoiceNumber, si.date,
              si.customer_id AS customerId, cu.name AS customerName,
              si.invoice_status AS invoiceStatus,
              si.branch_id AS branchId, si.warehouse_id AS warehouseId
       FROM sales_invoices si
       JOIN customers cu ON cu.id = si.customer_id
       LEFT JOIN warehouses w ON w.id = si.warehouse_id
       WHERE si.id = ? AND ${scope.clause}`,
      [invoiceId, ...scope.params]
    )[0];
    return row ?? null;
  }

  public getInvoiceHeader(invoiceId: string): WarrantyInvoiceHeader | null {
    this.require('ui.sales.after_sales.view');
    return this.readInvoiceHeader(invoiceId);
  }

  /**
   * Remaining warranty-eligible quantity per product for an invoice. Sold
   * quantity minus already returned quantity minus quantities already claimed
   * (claims that were rejected or cancelled free their quantity again).
   */
  public getEligibleItems(invoiceId: string, warrantyMonths = DEFAULT_WARRANTY_MONTHS): EligibleWarrantyItem[] {
    this.require('ui.sales.after_sales.view');
    return this.computeEligibleItems(invoiceId, warrantyMonths);
  }

  private computeEligibleItems(invoiceId: string, warrantyMonths = DEFAULT_WARRANTY_MONTHS): EligibleWarrantyItem[] {
    const invoice = this.readInvoiceHeader(invoiceId);
    if (!invoice) throw new Error('الفاتورة غير موجودة أو لا تنتمي إلى فرع متاح لك.');
    if (invoice.invoiceStatus && invoice.invoiceStatus !== 'COMPLETED') {
      throw new Error('لا يمكن تسجيل مطالبة على فاتورة غير مكتملة أو ملغاة.');
    }

    const months = Math.max(0, Math.trunc(Number(warrantyMonths) || DEFAULT_WARRANTY_MONTHS));
    const expiry = addMonths(invoice.date, months);
    const remainingDays = daysUntil(expiry);

    const rows = this.db.query<any>(
      `SELECT sii.id AS invoiceItemId, sii.product_id AS productId,
              sii.product_name AS productName, sii.product_grade AS grade,
              sii.size, sii.quantity_m2 AS soldQuantity, sii.boxes_count AS boxesCount,
              sii.meters_per_box AS metersPerBox,
              CASE WHEN sii.quantity_m2 > 0 THEN sii.total_price / sii.quantity_m2 ELSE 0 END AS unitPrice,
              p.sku AS productSku, p.product_type AS productType,
              p.base_unit AS baseUnit, p.custom_unit AS customUnit
       FROM sales_invoice_items sii
       LEFT JOIN products p ON p.id = sii.product_id
       WHERE sii.invoice_id = ?
       ORDER BY productName ASC, sii.id ASC`,
      [invoiceId]
    );

    const returnedByItem = new Map<string, number>();
    const legacyReturned = new Map<string, number>();
    for (const row of this.db.query<any>(
      `SELECT CASE WHEN sii.id IS NULL THEN NULL ELSE sii.id END AS invoiceItemId,
              sri.product_id AS productId, COALESCE(SUM(sri.quantity_m2), 0) AS quantity
       FROM sales_return_items sri
       JOIN sales_returns sr ON sr.id = sri.return_id
       LEFT JOIN sales_invoice_items sii ON sii.id = sri.invoice_item_id
         AND sii.invoice_id = sr.original_invoice_id AND sii.product_id = sri.product_id
       WHERE sr.original_invoice_id = ?
       GROUP BY CASE WHEN sii.id IS NULL THEN NULL ELSE sii.id END, sri.product_id`,
      [invoiceId]
    )) {
      const quantity = round2(Number(row.quantity || 0));
      if (row.invoiceItemId) returnedByItem.set(row.invoiceItemId, quantity);
      else legacyReturned.set(row.productId, quantity);
    }

    const claimedByItem = new Map<string, number>();
    const legacyClaimed = new Map<string, number>();
    for (const row of this.db.query<any>(
      `SELECT CASE WHEN sii.id IS NULL THEN NULL ELSE sii.id END AS invoiceItemId,
              c.product_id AS productId, COALESCE(SUM(c.quantity_m2), 0) AS quantity
       FROM customer_warranty_claims c
       LEFT JOIN sales_invoice_items sii ON sii.id = c.invoice_item_id
         AND sii.invoice_id = c.invoice_id AND sii.product_id = c.product_id
       WHERE c.invoice_id = ? AND c.status NOT IN ('REJECTED', 'CANCELLED')
         AND NOT EXISTS (
           SELECT 1 FROM warranty_claim_executions wx
           WHERE wx.claim_id = c.id AND wx.return_id IS NOT NULL
         )
       GROUP BY CASE WHEN sii.id IS NULL THEN NULL ELSE sii.id END, c.product_id`,
      [invoiceId]
    )) {
      const quantity = round2(Number(row.quantity || 0));
      if (row.invoiceItemId) claimedByItem.set(row.invoiceItemId, quantity);
      else legacyClaimed.set(row.productId, quantity);
    }

    const rowsByProduct = new Map<string, any[]>();
    for (const row of rows) rowsByProduct.set(row.productId, [...(rowsByProduct.get(row.productId) || []), row]);
    const returned = new Map(returnedByItem);
    const claimed = new Map(claimedByItem);
    for (const [productId, productRows] of rowsByProduct) {
      let unallocatedReturns = legacyReturned.get(productId) || 0;
      for (const row of productRows) {
        const lineSold = round2(Number(row.soldQuantity || 0));
        const lineReturns = returned.get(row.invoiceItemId) || 0;
        const allocation = Math.min(Math.max(0, lineSold - lineReturns), unallocatedReturns);
        if (allocation > 0) returned.set(row.invoiceItemId, round2(lineReturns + allocation));
        unallocatedReturns = round2(unallocatedReturns - allocation);
      }
      let unallocatedClaims = legacyClaimed.get(productId) || 0;
      for (const row of productRows) {
        const lineSold = round2(Number(row.soldQuantity || 0));
        const lineReturns = returned.get(row.invoiceItemId) || 0;
        const lineClaims = claimed.get(row.invoiceItemId) || 0;
        const allocation = Math.min(Math.max(0, lineSold - lineReturns - lineClaims), unallocatedClaims);
        if (allocation > 0) claimed.set(row.invoiceItemId, round2(lineClaims + allocation));
        unallocatedClaims = round2(unallocatedClaims - allocation);
      }
    }

    return rows.map((row) => {
      const soldQuantity = round2(Number(row.soldQuantity || 0));
      const returnedQuantity = returned.get(row.invoiceItemId) || 0;
      const claimedQuantity = claimed.get(row.invoiceItemId) || 0;
      const availableQuantity = round2(Math.max(0, soldQuantity - returnedQuantity - claimedQuantity));
      return {
        productId: row.productId,
        invoiceItemId: row.invoiceItemId ?? null,
        productName: row.productName,
        productSku: row.productSku ?? null,
        grade: row.grade ?? null,
        size: row.size ?? null,
        soldQuantity,
        returnedQuantity,
        claimedQuantity,
        availableQuantity,
        unitPrice: round2(Number(row.unitPrice || 0)),
        boxesCount: round2(Number(row.boxesCount || 0)),
        metersPerBox: Number(row.metersPerBox) || 1.44,
        productType: row.productType ?? null,
        baseUnit: row.baseUnit ?? null,
        customUnit: row.customUnit ?? null,
        warrantyMonths: months,
        warrantyExpiresAt: expiry,
        warrantyActive: remainingDays >= 0,
        daysRemaining: remainingDays,
      };
    });
  }

  public createClaim(input: CreateWarrantyClaimInput): WarrantyClaim {
    const actor = this.require('ui.sales.after_sales.create');
    const quantity = round2(Number(input.quantityM2));
    if (!Number.isFinite(quantity) || !(quantity > 0)) throw new Error('كمية المطالبة يجب أن تكون أكبر من صفر.');
    const issue = String(input.issueDescription || '').trim();
    if (!issue) throw new Error('يجب كتابة وصف المشكلة أو العيب.');
    const claimType = input.claimType || 'WARRANTY';
    if (!CLAIM_TYPES.includes(claimType)) throw new Error('نوع المطالبة غير صحيح.');

    const invoice = this.readInvoiceHeader(input.invoiceId);
    if (!invoice) throw new Error('الفاتورة غير موجودة أو لا تنتمي إلى فرع متاح لك.');

    const months = Math.max(0, Math.trunc(Number(input.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS)));
    const productItems = this.computeEligibleItems(input.invoiceId, months)
      .filter((item) => item.productId === input.productId);
    if (input.invoiceItemId && !productItems.some((item) => item.invoiceItemId === input.invoiceItemId)) {
      throw new Error('Invoice line does not belong to the selected invoice and product.');
    }
    const availableProductItems = productItems.filter((item) => item.availableQuantity > 0);
    if (!input.invoiceItemId && availableProductItems.length > 1) {
      throw new Error('Select a specific invoice line for this warranty claim.');
    }
    const eligible = input.invoiceItemId
      ? productItems.find((item) => item.invoiceItemId === input.invoiceItemId)
      : availableProductItems[0];
    if (!eligible) throw new Error('الصنف غير موجود ضمن بنود هذه الفاتورة.');
    if (!eligible.invoiceItemId) throw new Error('A warranty claim must be linked to a valid invoice line.');
    if (quantity > eligible.availableQuantity) {
      throw new Error(`الكمية المتاحة للمطالبة ${eligible.availableQuantity} فقط.`);
    }
    if (claimType !== 'COMPLAINT' && !eligible.warrantyActive) {
      throw new Error(`انتهت مدة الضمان لهذا الصنف في ${eligible.warrantyExpiresAt}. يمكن تسجيل شكوى فقط.`);
    }

    const id = `wcl_${uuidv4()}`;
    const now = new Date().toISOString();
    let claimNumber = '';

    this.db.executeTransaction((db) => {
      const currentEligible = this.computeEligibleItems(input.invoiceId, months)
        .find((item) => item.invoiceItemId === eligible.invoiceItemId && item.productId === input.productId);
      if (!currentEligible || quantity > currentEligible.availableQuantity) {
        throw new Error(`Eligible warranty quantity changed; available quantity is ${currentEligible?.availableQuantity ?? 0}.`);
      }
      claimNumber = db.nextNumber('WCLM');
      db.run(
        `INSERT INTO customer_warranty_claims (
           id, claim_number, invoice_id, invoice_item_id, customer_id, product_id,
           branch_id, warehouse_id, claim_type, status, quantity_m2, warranty_months,
           warranty_expires_at, issue_description, created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, claimNumber, invoice.id, eligible.invoiceItemId,
          invoice.customerId, input.productId, invoice.branchId || null, invoice.warehouseId || null,
          claimType, quantity, months, eligible.warrantyExpiresAt, issue, actor.id, now, now,
        ]
      );
      db.run(
        `INSERT INTO customer_warranty_claim_events
           (id, claim_id, action, from_status, to_status, notes, created_by, created_at)
         VALUES (?, ?, 'CREATE', NULL, 'OPEN', ?, ?, ?)`,
        [`wce_${uuidv4()}`, id, issue, actor.id, now]
      );
    });

    return this.scopedClaim(id)!;
  }

  public transition(
    id: string,
    action: WarrantyClaimAction,
    notes?: string,
    resolutionType?: WarrantyResolutionType
  ): WarrantyClaim {
    const config = TRANSITIONS[action];
    if (!config) throw new Error('إجراء المطالبة غير صحيح.');
    const actor = this.require(config.permission);

    const claim = this.scopedClaim(id);
    if (!claim) throw new Error('المطالبة غير موجودة أو خارج نطاق فرعك.');
    if (!config.from.includes(claim.status)) {
      throw new Error(`لا يمكن تنفيذ هذا الإجراء على مطالبة بحالة ${claim.status}.`);
    }
    const cleanNotes = String(notes || '').trim();
    if (action === 'reject' && !cleanNotes) throw new Error('يجب كتابة سبب الرفض.');
    if (resolutionType && !RESOLUTION_TYPES.includes(resolutionType)) {
      throw new Error('نوع الحل غير صحيح.');
    }
    if (action === 'resolve' && (!resolutionType || resolutionType === 'REJECTED')) {
      throw new Error('يجب اختيار نوع حل صالح قبل إنهاء المطالبة.');
    }
    if (action === 'resolve' && (resolutionType === 'REPAIR' || resolutionType === 'OTHER') && !String(notes || '').trim()) {
      throw new Error('يجب تسجيل تفاصيل تنفيذ الحل قبل إغلاق المطالبة.');
    }

    const now = new Date().toISOString();
    const fields = ['status = ?', 'updated_at = ?'];
    const params: any[] = [config.to, now];
    if (cleanNotes) {
      fields.push('resolution_notes = ?');
      params.push(cleanNotes);
    }
    if (resolutionType) {
      fields.push('resolution_type = ?');
      params.push(resolutionType);
    } else if (action === 'reject') {
      fields.push('resolution_type = ?');
      params.push('REJECTED');
    }
    if (config.decided) {
      fields.push('decided_by = ?', 'decided_at = ?');
      params.push(actor.id, now);
    }
    if (config.closes) {
      fields.push('closed_at = ?');
      params.push(now);
    }
    params.push(id);

    this.db.executeTransaction((db) => {
      const current = this.scopedClaim(id);
      if (!current || current.status !== claim.status || !config.from.includes(current.status)) {
        throw new Error('تغيرت المطالبة منذ آخر قراءة؛ أعد تحميلها قبل المتابعة.');
      }
      if (action === 'resolve') this.executeResolution(db, current, actor.id, resolutionType as Exclude<WarrantyResolutionType, 'REJECTED'>, cleanNotes);
      db.run(`UPDATE customer_warranty_claims SET ${fields.join(', ')} WHERE id = ?`, params);
      db.run(
        `INSERT INTO customer_warranty_claim_events
           (id, claim_id, action, from_status, to_status, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`wce_${uuidv4()}`, id, action.toUpperCase(), claim.status, config.to, cleanNotes || null, actor.id, now]
      );
    });

    return this.scopedClaim(id)!;
  }

  private executeResolution(
    db: DatabaseManager,
    claim: WarrantyClaim,
    actorId: string,
    resolutionType: Exclude<WarrantyResolutionType, 'REJECTED'>,
    notes: string,
  ): void {
    if (db.query('SELECT id FROM warranty_claim_executions WHERE claim_id = ?', [claim.id]).length) {
      throw new Error('تم تنفيذ حل هذه المطالبة مسبقًا.');
    }

    let referenceType = 'WARRANTY_SERVICE';
    let referenceId: string | null = claim.id;
    let returnId: string | null = null;
    let replacementInvoiceId: string | null = null;
    let amount = 0;
    let details = notes || `تم تنفيذ حل الضمان: ${resolutionType}`;

    if (resolutionType === 'REFUND' || resolutionType === 'REPLACEMENT') {
      const sales = new SalesService();
      const invoice = db.query<any>(`SELECT id, warehouse_id AS warehouseId,
        discount_percentage AS discountPercentage, tax_percentage AS taxPercentage
        FROM sales_invoices WHERE id = ? AND invoice_status = 'COMPLETED'`, [claim.invoiceId])[0];
      if (!invoice) throw new Error('لا يمكن تنفيذ الحل لأن فاتورة البيع لم تعد مكتملة.');
      const sourceLines = db.query<any>(`SELECT id AS invoiceItemId, special_stock_id AS specialStockId,
        quantity_m2 AS quantity, boxes_count AS boxes, pieces_count AS pieces,
        unit_price AS unitPrice, unit_cost AS unitCost, discount_amount AS discountAmount
        FROM sales_invoice_items WHERE invoice_id = ? AND product_id = ?`, [claim.invoiceId, claim.productId]);
      if (!sourceLines.length) throw new Error('بند الصنف غير موجود في الفاتورة الأصلية.');
      const sourceIds = new Set(sourceLines.map((line) => line.specialStockId || 'REGULAR'));
      if (sourceIds.size > 1) throw new Error('يجب مراجعة المصدر المخزني للكمية يدويًا قبل تنفيذ المرتجع.');
      const specialStockId = sourceLines[0].specialStockId || null;
      if (sourceLines.length !== 1) throw new Error('يجب تحديد سطر الفاتورة الأصلي للمطالبة قبل تنفيذ المرتجع.');
      const returnItems = [{
        invoiceItemId: sourceLines[0].invoiceItemId,
        productId: claim.productId,
        quantityM2: claim.quantityM2,
        boxesCount: 0,
        unitPrice: 0,
        unitCost: 0,
        specialStockId,
        disposition: 'QUARANTINE' as const,
        reason: `Warranty ${claim.claimNumber}: ${claim.issueDescription}`,
      }];

      if (resolutionType === 'REFUND') {
        const returned = sales.returnSale(claim.invoiceId, returnItems, false, actorId, {
          refundMethod: 'BALANCE',
          idempotencyKey: `WARRANTY-${claim.id}`,
        });
        referenceType = 'SALES_RETURN';
        referenceId = returnId = returned.id;
        amount = round2(Number(returned.remainingToBalance || 0));
        details = notes || `Customer balance credit; returned goods quarantined. ${returned.returnNumber}`;
      } else {
        const soldQuantity = sourceLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
        if (!(soldQuantity > 0)) throw new Error('The original sold quantity is invalid for replacement.');
        const ratio = claim.quantityM2 / soldQuantity;
        const weighted = (key: 'unitPrice' | 'unitCost') => sourceLines.reduce(
          (sum, line) => sum + Number(line[key] || 0) * Number(line.quantity || 0), 0,
        ) / soldQuantity;
        const newItem = {
          productId: claim.productId,
          soldBy: 'M2',
          quantityM2: claim.quantityM2,
          boxesCount: round2(sourceLines.reduce((sum, line) => sum + Number(line.boxes || 0), 0) * ratio),
          piecesCount: Math.round(sourceLines.reduce((sum, line) => sum + Number(line.pieces || 0), 0) * ratio),
          unitPrice: round2(weighted('unitPrice')),
          unitCost: round2(weighted('unitCost')),
          discountAmount: round2(sourceLines.reduce((sum, line) => sum + Number(line.discountAmount || 0), 0) * ratio),
        };
        const exchange = sales.exchangeSale(claim.invoiceId, returnItems, [newItem], actorId, {
          discountPercentage: Number(invoice.discountPercentage || 0),
          taxPercentage: Number(invoice.taxPercentage || 0),
          notes: `Warranty replacement ${claim.claimNumber}`,
        });
        referenceType = 'SALES_EXCHANGE';
        referenceId = exchange.invoice.id;
        returnId = exchange.return.id;
        replacementInvoiceId = exchange.invoice.id;
        amount = round2(Number(exchange.return.remainingToBalance || 0));
        details = notes || `Returned goods quarantined; replacement invoice ${exchange.invoice.invoiceNumber} created.`;
      }
    }

    db.run(`INSERT INTO warranty_claim_executions (
      id, claim_id, resolution_type, status, reference_type, reference_id,
      return_id, replacement_invoice_id, amount, details, executed_by, executed_at
    ) VALUES (?, ?, ?, 'EXECUTED', ?, ?, ?, ?, ?, ?, ?, ?)`, [
      `wcex_${uuidv4()}`, claim.id, resolutionType, referenceType, referenceId,
      returnId, replacementInvoiceId, amount, details, actorId, new Date().toISOString(),
    ]);
  }

  public stats(): WarrantyClaimsStats {
    this.require('ui.sales.after_sales.view');
    const scope = this.branchAccess.sqlScope('c.branch_id', 'si.branch_id');
    const rows = this.db.query<{ status: WarrantyClaimStatus; count: number }>(
      `SELECT c.status, COUNT(*) AS count
       FROM customer_warranty_claims c
       JOIN sales_invoices si ON si.id = c.invoice_id
       WHERE ${scope.clause}
       GROUP BY c.status`,
      scope.params
    );
    const byStatus = new Map(rows.map((row) => [row.status, Number(row.count || 0)]));
    const monthStart = `${localDateString().substring(0, 7)}-01`;
    const thisMonth = Number(this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM customer_warranty_claims c
       JOIN sales_invoices si ON si.id = c.invoice_id
       WHERE ${scope.clause} AND substr(c.created_at, 1, 10) >= ?`,
      [...scope.params, monthStart]
    )[0]?.count || 0);

    const typeRows = this.db.query<{ claimType: WarrantyClaimType; count: number }>(
      `SELECT c.claim_type AS claimType, COUNT(*) AS count
       FROM customer_warranty_claims c
       JOIN sales_invoices si ON si.id = c.invoice_id
       WHERE ${scope.clause}
       GROUP BY c.claim_type`,
      scope.params
    );
    const byType: Record<WarrantyClaimType, number> = {
      WARRANTY: 0, REPAIR: 0, REPLACEMENT: 0, COMPLAINT: 0,
    };
    for (const row of typeRows) byType[row.claimType] = Number(row.count || 0);

    const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const open = byStatus.get('OPEN') || 0;
    const underReview = byStatus.get('UNDER_REVIEW') || 0;
    const approved = byStatus.get('APPROVED') || 0;

    return {
      total,
      open,
      underReview,
      approved,
      rejected: byStatus.get('REJECTED') || 0,
      resolved: byStatus.get('RESOLVED') || 0,
      cancelled: byStatus.get('CANCELLED') || 0,
      active: open + underReview + approved,
      thisMonth,
      byType,
    };
  }
}
