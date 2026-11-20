import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import type { Product } from '../../../types';
import { round2 } from '../finance/financials';
import { BatchService } from '../inventory/BatchService';
import { QuotationService } from '../sales/QuotationService';
import { OperationalFieldService } from '../products/OperationalFieldService';
import type { ProductBatch } from '../../../types';

export type CeramicQuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';

export interface CeramicDesignVariant {
  product: Product;
  showroomM2: number;
  storeM2: number;
  totalM2: number;
}

export interface CeramicDesign {
  key: string;
  name: string;
  brandName: string;
  variants: CeramicDesignVariant[];
  showroomM2: number;
  storeM2: number;
  totalM2: number;
}

export interface CeramicStockRow {
  productId: string;
  name: string;
  sku: string;
  brandName: string | null;
  grade: string;
  size: string;
  finish: string | null;
  color: string | null;
  tone: string | null;
  surfaceLocation: string | null;
  metersPerBox: number;
  piecesPerBox: number;
  sellingPriceM2: number;
  sellingPriceBox: number;
  wholesalePriceM2: number;
  showroomM2: number;
  storeM2: number;
  totalM2: number;
  showroomBoxes: number;
  storeBoxes: number;
}

export interface CeramicAreaQuote {
  id: string;
  branchId: string | null;
  quoteNumber: string;
  customerId: string | null;
  customerName: string | null;
  productId: string | null;
  productName: string | null;
  areaM2: number;
  wastePercent: number;
  requiredM2: number;
  boxesNeeded: number;
  metersPerBox: number | null;
  piecesPerBox: number | null;
  unitPriceM2: number;
  totalAmount: number;
  status: CeramicQuoteStatus;
  notes: string | null;
  quotationId: string | null;
  quotationNumber: string | null;
  createdAt: string;
}

export interface CeramicAreaCalculation {
  areaM2: number;
  wastePercent: number;
  requiredM2: number;
  boxesNeeded: number;
  piecesNeeded: number | null;
  coveredM2: number;
  leftoverM2: number;
  pricePerBox: number;
  totalByMeter: number;
  totalByBox: number;
}

export interface CeramicSampleRow {
  id: string;
  specialNumber: string;
  warehouseName: string;
  productId: string;
  productName: string;
  sku: string;
  grade: string;
  size: string;
  quantityM2: number;
  boxesCount: number;
  status: string;
  createdAt: string;
}

export interface CeramicTopDesign {
  name: string;
  brandName: string;
  totalM2: number;
  totalAmount: number;
  invoices: number;
}

export type CeramicServiceType = 'CUTTING' | 'INSTALLATION' | 'DELIVERY' | 'CUTTING_INSTALLATION';
export type CeramicServiceStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface CeramicServiceOrder {
  id: string;
  branchId: string | null;
  orderNumber: string;
  customerId: string | null;
  customerName: string | null;
  siteAddress: string | null;
  serviceType: CeramicServiceType;
  status: CeramicServiceStatus;
  areaM2: number;
  boxesCount: number;
  unitPrice: number;
  totalAmount: number;
  scheduledDate: string | null;
  notes: string | null;
  invoiceId: string | null;
  createdAt: string;
}

export type CeramicCommissionStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export interface CeramicCommission {
  id: string;
  branchId: string | null;
  commissionNumber: string;
  partnerName: string;
  partnerPhone: string | null;
  customerId: string | null;
  customerName: string | null;
  saleReference: string | null;
  baseAmount: number;
  percent: number | null;
  amount: number;
  status: CeramicCommissionStatus;
  notes: string | null;
  paidAt: string | null;
  createdAt: string;
}

const GRADE_ORDER = ['GRADE_1', 'GRADE_2', 'GRADE_3', 'COMMERCIAL'];

export class CeramicsService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private currentBranchId(): string {
    try { return this.branchAccess.getCurrentBranchId(); } catch { return ''; }
  }

  private requireView() {
    ModuleRegistryService.assertModuleEnabled('sales');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.view');
    return actor;
  }

  private requireManage() {
    ModuleRegistryService.assertModuleEnabled('sales');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    return actor;
  }

  // ── Stock & designs ─────────────────────────────────────────────────────

  /** Stock per product split between SHOWROOM warehouses and the rest. */
  public getStockRows(search?: string): CeramicStockRow[] {
    this.requireView();
    const scope = this.branchAccess.sqlScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id AND bw.is_primary = 1)'
    );
    const company = this.branchAccess.companyScope('w.company_id');
    const params: unknown[] = [...scope.params, ...company.params];
    let searchClause = '';
    if (search && search.trim()) {
      searchClause = ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.size LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    const rows = this.db.query<any>(
      `SELECT p.id AS productId, p.name, p.sku, b.name AS brandName,
              p.grade, p.size, p.finish, p.color, p.tone, p.surface_location AS surfaceLocation,
              COALESCE(p.meters_per_box, 1.44) AS metersPerBox,
              COALESCE(p.pieces_per_box, 4) AS piecesPerBox,
              p.selling_price_m2 / 100.0 AS sellingPriceM2,
              p.selling_price_box / 100.0 AS sellingPriceBox,
              p.wholesale_price_m2 / 100.0 AS wholesalePriceM2,
              COALESCE(SUM(CASE WHEN w.warehouse_type = 'SHOWROOM' THEN ws.quantity_m2 ELSE 0 END), 0) AS showroomM2,
              COALESCE(SUM(CASE WHEN w.warehouse_type != 'SHOWROOM' THEN ws.quantity_m2 ELSE 0 END), 0) AS storeM2,
              COALESCE(SUM(ws.quantity_m2), 0) AS totalM2
       FROM products p
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
       LEFT JOIN warehouses w ON w.id = ws.warehouse_id
       WHERE p.is_active = 1 AND ${scope.clause} AND ${company.clause}
       ${searchClause}
       GROUP BY p.id
       ORDER BY b.name, p.name, p.grade, p.size`,
      params
    );
    return rows.map((r) => ({
      ...r,
      metersPerBox: round2(r.metersPerBox),
      piecesPerBox: Number(r.piecesPerBox),
      sellingPriceM2: round2(r.sellingPriceM2),
      sellingPriceBox: round2(r.sellingPriceBox),
      wholesalePriceM2: round2(r.wholesalePriceM2),
      showroomM2: round2(r.showroomM2),
      storeM2: round2(r.storeM2),
      totalM2: round2(r.totalM2),
      showroomBoxes: r.metersPerBox > 0 ? round2(r.showroomM2 / r.metersPerBox) : 0,
      storeBoxes: r.metersPerBox > 0 ? round2(r.storeM2 / r.metersPerBox) : 0,
    }));
  }

  /** Products grouped into showroom "designs" (same name + brand = variants). */
  public getDesigns(search?: string): CeramicDesign[] {
    const rows = this.getStockRows(search);
    const gradeRank = (grade: string) => {
      const idx = GRADE_ORDER.indexOf(grade);
      return idx === -1 ? GRADE_ORDER.length : idx;
    };
    const groups = new Map<string, CeramicDesign>();
    for (const r of rows) {
      const key = `${r.brandName || ''}|${r.name}`;
      let design = groups.get(key);
      if (!design) {
        design = { key, name: r.name, brandName: r.brandName || '', variants: [], showroomM2: 0, storeM2: 0, totalM2: 0 };
        groups.set(key, design);
      }
      const product = {
        id: r.productId, sku: r.sku, name: r.name, grade: r.grade, size: r.size,
        finish: r.finish ?? undefined, color: r.color ?? undefined, tone: r.tone ?? undefined,
        surfaceLocation: (r.surfaceLocation as Product['surfaceLocation']) ?? undefined,
        metersPerBox: r.metersPerBox, piecesPerBox: r.piecesPerBox,
        sellingPriceM2: r.sellingPriceM2, sellingPriceBox: r.sellingPriceBox,
        wholesalePriceM2: r.wholesalePriceM2,
      } as Product;
      design.variants.push({ product, showroomM2: r.showroomM2, storeM2: r.storeM2, totalM2: r.totalM2 });
      design.showroomM2 = round2(design.showroomM2 + r.showroomM2);
      design.storeM2 = round2(design.storeM2 + r.storeM2);
      design.totalM2 = round2(design.totalM2 + r.totalM2);
    }
    for (const design of groups.values()) {
      design.variants.sort((a, b) =>
        gradeRank(a.product.grade) - gradeRank(b.product.grade)
        || a.product.size.localeCompare(b.product.size)
      );
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  // ── Area calculator ─────────────────────────────────────────────────────

  public calculateArea(input: {
    areaM2: number;
    wastePercent?: number;
    metersPerBox: number;
    piecesPerBox?: number;
    pricePerM2?: number;
    pricePerBox?: number;
  }): CeramicAreaCalculation {
    const areaM2 = round2(input.areaM2);
    const wastePercent = Math.max(0, input.wastePercent ?? 10);
    const requiredM2 = round2(areaM2 * (1 + wastePercent / 100));
    const metersPerBox = input.metersPerBox > 0 ? input.metersPerBox : 0;
    const boxesNeeded = metersPerBox > 0 ? Math.ceil(requiredM2 / metersPerBox) : 0;
    const coveredM2 = metersPerBox > 0 ? round2(boxesNeeded * metersPerBox) : 0;
    const pricePerM2 = input.pricePerM2 ?? 0;
    const pricePerBox = input.pricePerBox ?? (metersPerBox > 0 ? round2(pricePerM2 * metersPerBox) : 0);
    return {
      areaM2,
      wastePercent,
      requiredM2,
      boxesNeeded,
      piecesNeeded: input.piecesPerBox ? boxesNeeded * input.piecesPerBox : null,
      coveredM2,
      leftoverM2: round2(Math.max(0, coveredM2 - requiredM2)),
      pricePerBox,
      totalByMeter: round2(requiredM2 * pricePerM2),
      totalByBox: round2(boxesNeeded * pricePerBox),
    };
  }

  // ── Area quotes (مقاييسات المساحات) ─────────────────────────────────────

  public getAreaQuotes(filters?: { status?: CeramicQuoteStatus; customerId?: string }): CeramicAreaQuote[] {
    this.requireView();
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters?.status) { where.push('q.status = ?'); params.push(filters.status); }
    if (filters?.customerId) { where.push('q.customer_id = ?'); params.push(filters.customerId); }
    return this.db.query<any>(
      `SELECT q.id, q.branch_id AS branchId, q.quote_number AS quoteNumber,
              q.customer_id AS customerId, q.customer_name AS customerName,
              q.product_id AS productId, q.product_name AS productName,
              q.area_m2 AS areaM2, q.waste_percent AS wastePercent, q.required_m2 AS requiredM2,
              q.boxes_needed AS boxesNeeded, q.meters_per_box AS metersPerBox,
              q.pieces_per_box AS piecesPerBox, q.unit_price_m2 AS unitPriceM2,
              q.total_amount AS totalAmount, q.status, q.notes,
              q.quotation_id AS quotationId, q.quotation_number AS quotationNumber,
              q.created_at AS createdAt
       FROM ceramic_area_quotes q
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY q.created_at DESC`,
      params
    ).map((r) => ({
      ...r,
      areaM2: round2(r.areaM2), wastePercent: round2(r.wastePercent), requiredM2: round2(r.requiredM2),
      boxesNeeded: round2(r.boxesNeeded), metersPerBox: r.metersPerBox == null ? null : round2(r.metersPerBox),
      unitPriceM2: round2(r.unitPriceM2), totalAmount: round2(r.totalAmount),
    }));
  }

  public saveAreaQuote(input: {
    id?: string;
    customerId?: string;
    customerName?: string;
    productId?: string;
    productName?: string;
    areaM2: number;
    wastePercent?: number;
    requiredM2: number;
    boxesNeeded: number;
    metersPerBox?: number;
    piecesPerBox?: number;
    unitPriceM2?: number;
    totalAmount: number;
    notes?: string;
  }): CeramicAreaQuote {
    this.requireManage();
    const actor = AuthService.requireAuth();
    if (input.areaM2 <= 0) throw new Error('المساحة يجب أن تكون أكبر من صفر.');
    const id = input.id || uuidv4();
    if (input.id) {
      this.db.run(
        `UPDATE ceramic_area_quotes SET customer_id=?, customer_name=?, product_id=?, product_name=?,
           area_m2=?, waste_percent=?, required_m2=?, boxes_needed=?, meters_per_box=?, pieces_per_box=?,
           unit_price_m2=?, total_amount=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [input.customerId ?? null, input.customerName ?? null, input.productId ?? null, input.productName ?? null,
         input.areaM2, input.wastePercent ?? 10, input.requiredM2, input.boxesNeeded,
         input.metersPerBox ?? null, input.piecesPerBox ?? null,
         input.unitPriceM2 ?? 0, input.totalAmount, input.notes ?? null, id]
      );
    } else {
      const quoteNumber = `CAQ-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      this.db.run(
        `INSERT INTO ceramic_area_quotes
           (id, branch_id, quote_number, customer_id, customer_name, product_id, product_name,
            area_m2, waste_percent, required_m2, boxes_needed, meters_per_box, pieces_per_box,
            unit_price_m2, total_amount, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, this.currentBranchId(), quoteNumber, input.customerId ?? null, input.customerName ?? null,
         input.productId ?? null, input.productName ?? null, input.areaM2, input.wastePercent ?? 10,
         input.requiredM2, input.boxesNeeded, input.metersPerBox ?? null, input.piecesPerBox ?? null,
         input.unitPriceM2 ?? 0, input.totalAmount, input.notes ?? null, actor.id]
      );
    }
    return this.getAreaQuotes().find((q) => q.id === id)!;
  }

  public updateAreaQuoteStatus(id: string, status: CeramicQuoteStatus): void {
    this.requireManage();
    this.db.run(`UPDATE ceramic_area_quotes SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [status, id]);
  }

  public deleteAreaQuote(id: string): void {
    this.requireManage();
    this.db.run(`DELETE FROM ceramic_area_quotes WHERE id=?`, [id]);
  }

  // ── Batches, samples & best sellers ─────────────────────────────────────

  /** دفعات الصنف: نغمة اللون، العيار، الفرز والرصيد المتبقي. */
  public getProductBatches(productId: string): ProductBatch[] {
    this.requireView();
    return new BatchService().getBatchesForProduct(productId);
  }

  /** قطع المعرض المسجلة كعينات عرض (DISPLAY_SAMPLE) وغير متصرفة فيها. */
  public getDisplaySamples(): CeramicSampleRow[] {
    this.requireView();
    const scope = this.branchAccess.sqlScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id AND bw.is_primary = 1)'
    );
    const company = this.branchAccess.companyScope('w.company_id');
    return this.db.query<any>(
      `SELECT iss.id, iss.special_number AS specialNumber, w.name AS warehouseName,
              p.id AS productId, p.name AS productName, p.sku, p.grade, p.size,
              iss.quantity_m2 AS quantityM2, iss.boxes_count AS boxesCount,
              iss.status, iss.created_at AS createdAt
       FROM inventory_special_stocks iss
       JOIN warehouses w ON w.id = iss.warehouse_id
       JOIN products p ON p.id = iss.product_id
       WHERE iss.category = 'DISPLAY_SAMPLE' AND iss.status != 'WRITTEN_OFF'
         AND ${scope.clause} AND ${company.clause}
       ORDER BY iss.created_at DESC`,
      [...scope.params, ...company.params]
    ).map((r) => ({
      ...r,
      quantityM2: round2(r.quantityM2), boxesCount: round2(r.boxesCount),
    }));
  }

  /** أكثر التصميمات مبيعًا خلال آخر `days` يومًا (فواتير مكتملة). */
  public getTopSellingDesigns(days = 30, limit = 5): CeramicTopDesign[] {
    this.requireView();
    const scope = this.branchAccess.sqlScope(
      'w.branch_id',
      '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id AND bw.is_primary = 1)'
    );
    const company = this.branchAccess.companyScope('w.company_id');
    return this.db.query<any>(
      `SELECT p.name, COALESCE(b.name, '') AS brandName,
              ROUND(SUM(sii.quantity_m2), 2) AS totalM2,
              ROUND(SUM(sii.total_price) / 100.0, 2) AS totalAmount,
              COUNT(DISTINCT sii.invoice_id) AS invoices
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.invoice_id
       JOIN warehouses w ON w.id = si.warehouse_id
       JOIN products p ON p.id = sii.product_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE si.invoice_status = 'COMPLETED' AND si.date >= date('now', ?)
         AND ${scope.clause} AND ${company.clause}
       GROUP BY p.name, b.name
       ORDER BY totalM2 DESC
       LIMIT ?`,
      [`-${Math.max(1, days)} days`, ...scope.params, ...company.params, limit]
    ).map((r) => ({
      name: r.name, brandName: r.brandName,
      totalM2: round2(r.totalM2), totalAmount: round2(r.totalAmount),
      invoices: Number(r.invoices),
    }));
  }

  // ── Takeoff → quotation ─────────────────────────────────────────────────

  /**
   * تحويل مقاييسة مساحة محفوظة إلى عرض سعر واحد يجمع كل بنودها.
   * كل بنود نفس حفظة المقاييسة تشترك في رقم `quoteNumber` الواحد.
   */
  public convertTakeoffToQuotation(quoteNumber: string) {
    ModuleRegistryService.assertModuleEnabled('sales');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.create');

    const rows = this.db.query<any>(
      `SELECT * FROM ceramic_area_quotes WHERE quote_number = ? ORDER BY created_at`,
      [quoteNumber]
    );
    if (rows.length === 0) throw new Error('المقايسة غير موجودة.');
    const converted = rows.find((r) => r.quotation_id);
    if (converted) {
      throw new Error(`هذه المقاييسة محوّلة بالفعل إلى عرض السعر ${converted.quotation_number || ''}.`);
    }
    const customerId = rows.find((r) => r.customer_id)?.customer_id;
    if (!customerId) {
      throw new Error('لا يمكن التحويل بدون عميل — عدّل المقاييسات وأضف اسم عميل أولًا.');
    }

    const items = rows.map((r) => ({
      productId: r.product_id as string,
      quantityM2: round2(r.required_m2),
      uom: 'M2',
      quantity: round2(r.required_m2),
      unitPrice: round2(r.unit_price_m2),
    }));
    const firstNotes = rows.find((r) => r.notes)?.notes;
    const notes = `مقايسة مساحة ${quoteNumber}${firstNotes ? ` — ${firstNotes}` : ''}`;

    const quotation = new QuotationService().createQuotation({ customerId, items, notes });
    // Carry the takeoff's total area onto the quotation's operational fields so
    // it survives conversion to order/invoice and prints on the documents.
    const totalArea = round2(rows.reduce((sum, r) => sum + Number(r.required_m2 || 0), 0));
    try {
      const fieldService = new OperationalFieldService();
      const areaField = fieldService.getDefinitions('quotations')
        .find((definition) => definition.code === 'TILE_AREA_M2');
      if (areaField && totalArea > 0) {
        fieldService.setRecordValues('quotations', quotation.id, { [areaField.id]: String(totalArea) }, 'create');
      }
    } catch {
      // Operational fields are auxiliary — never block the conversion itself.
    }
    this.db.run(
      `UPDATE ceramic_area_quotes
       SET status='ACCEPTED', quotation_id=?, quotation_number=?, updated_at=CURRENT_TIMESTAMP
       WHERE quote_number=?`,
      [quotation.id, quotation.quotationNumber, quoteNumber]
    );
    return quotation;
  }

  // ── Service orders (قص / تركيب / توصيل) ─────────────────────────────────

  public getServiceOrders(filters?: { status?: CeramicServiceStatus; customerId?: string }): CeramicServiceOrder[] {
    this.requireView();
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters?.status) { where.push('o.status = ?'); params.push(filters.status); }
    if (filters?.customerId) { where.push('o.customer_id = ?'); params.push(filters.customerId); }
    return this.db.query<any>(
      `SELECT o.id, o.branch_id AS branchId, o.order_number AS orderNumber,
              o.customer_id AS customerId, o.customer_name AS customerName,
              o.site_address AS siteAddress, o.service_type AS serviceType, o.status,
              o.area_m2 AS areaM2, o.boxes_count AS boxesCount, o.unit_price AS unitPrice,
              o.total_amount AS totalAmount, o.scheduled_date AS scheduledDate,
              o.notes, o.invoice_id AS invoiceId, o.created_at AS createdAt
       FROM ceramic_service_orders o
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY o.created_at DESC`,
      params
    ).map((r) => ({
      ...r,
      areaM2: round2(r.areaM2), boxesCount: round2(r.boxesCount),
      unitPrice: round2(r.unitPrice), totalAmount: round2(r.totalAmount),
    }));
  }

  public saveServiceOrder(input: {
    id?: string;
    customerId?: string;
    customerName?: string;
    siteAddress?: string;
    serviceType: CeramicServiceType;
    areaM2?: number;
    boxesCount?: number;
    unitPrice?: number;
    totalAmount?: number;
    scheduledDate?: string;
    notes?: string;
    invoiceId?: string;
  }): CeramicServiceOrder {
    this.requireManage();
    const actor = AuthService.requireAuth();
    const id = input.id || uuidv4();
    const areaM2 = round2(input.areaM2 ?? 0);
    const boxesCount = round2(input.boxesCount ?? 0);
    const unitPrice = round2(input.unitPrice ?? 0);
    const totalAmount = round2(input.totalAmount ?? unitPrice);
    if (input.id) {
      this.db.run(
        `UPDATE ceramic_service_orders SET customer_id=?, customer_name=?, site_address=?,
           service_type=?, area_m2=?, boxes_count=?, unit_price=?, total_amount=?,
           scheduled_date=?, notes=?, invoice_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [input.customerId ?? null, input.customerName ?? null, input.siteAddress ?? null,
         input.serviceType, areaM2, boxesCount, unitPrice, totalAmount,
         input.scheduledDate ?? null, input.notes ?? null, input.invoiceId ?? null, id]
      );
    } else {
      const orderNumber = `CSO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      this.db.run(
        `INSERT INTO ceramic_service_orders
           (id, branch_id, order_number, customer_id, customer_name, site_address,
            service_type, area_m2, boxes_count, unit_price, total_amount,
            scheduled_date, notes, invoice_id, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, this.currentBranchId(), orderNumber, input.customerId ?? null, input.customerName ?? null,
         input.siteAddress ?? null, input.serviceType, areaM2, boxesCount, unitPrice, totalAmount,
         input.scheduledDate ?? null, input.notes ?? null, input.invoiceId ?? null, actor.id]
      );
    }
    return this.getServiceOrders().find((o) => o.id === id)!;
  }

  public updateServiceOrderStatus(id: string, status: CeramicServiceStatus): void {
    this.requireManage();
    this.db.run(`UPDATE ceramic_service_orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [status, id]);
  }

  public deleteServiceOrder(id: string): void {
    this.requireManage();
    this.db.run(`DELETE FROM ceramic_service_orders WHERE id=?`, [id]);
  }

  // ── Commissions (عمولات المهندسين والمصممين) ─────────────────────────────

  public getCommissions(filters?: { status?: CeramicCommissionStatus; customerId?: string }): CeramicCommission[] {
    this.requireView();
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters?.status) { where.push('cm.status = ?'); params.push(filters.status); }
    if (filters?.customerId) { where.push('cm.customer_id = ?'); params.push(filters.customerId); }
    return this.db.query<any>(
      `SELECT cm.id, cm.branch_id AS branchId, cm.commission_number AS commissionNumber,
              cm.partner_name AS partnerName, cm.partner_phone AS partnerPhone,
              cm.customer_id AS customerId, cm.customer_name AS customerName,
              cm.sale_reference AS saleReference, cm.base_amount AS baseAmount,
              cm.percent, cm.amount, cm.status, cm.notes, cm.paid_at AS paidAt,
              cm.created_at AS createdAt
       FROM ceramic_commissions cm
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY cm.created_at DESC`,
      params
    ).map((r) => ({
      ...r,
      baseAmount: round2(r.baseAmount), percent: r.percent == null ? null : round2(r.percent),
      amount: round2(r.amount),
    }));
  }

  public saveCommission(input: {
    id?: string;
    partnerName: string;
    partnerPhone?: string;
    customerId?: string;
    customerName?: string;
    saleReference?: string;
    baseAmount?: number;
    percent?: number;
    amount?: number;
    notes?: string;
  }): CeramicCommission {
    this.requireManage();
    const actor = AuthService.requireAuth();
    if (!input.partnerName?.trim()) throw new Error('اسم المهندس / الشريك مطلوب.');
    const id = input.id || uuidv4();
    const baseAmount = round2(input.baseAmount ?? 0);
    const percent = input.percent != null && input.percent > 0 ? round2(input.percent) : null;
    const amount = round2(input.amount ?? (percent != null ? baseAmount * percent / 100 : baseAmount));
    if (input.id) {
      this.db.run(
        `UPDATE ceramic_commissions SET partner_name=?, partner_phone=?, customer_id=?, customer_name=?,
           sale_reference=?, base_amount=?, percent=?, amount=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [input.partnerName.trim(), input.partnerPhone ?? null, input.customerId ?? null,
         input.customerName ?? null, input.saleReference ?? null, baseAmount, percent, amount,
         input.notes ?? null, id]
      );
    } else {
      const commissionNumber = `CCM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      this.db.run(
        `INSERT INTO ceramic_commissions
           (id, branch_id, commission_number, partner_name, partner_phone, customer_id, customer_name,
            sale_reference, base_amount, percent, amount, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, this.currentBranchId(), commissionNumber, input.partnerName.trim(), input.partnerPhone ?? null,
         input.customerId ?? null, input.customerName ?? null, input.saleReference ?? null,
         baseAmount, percent, amount, input.notes ?? null, actor.id]
      );
    }
    return this.getCommissions().find((c) => c.id === id)!;
  }

  public updateCommissionStatus(id: string, status: CeramicCommissionStatus): void {
    this.requireManage();
    const paidAt = status === 'PAID' ? 'CURRENT_TIMESTAMP' : 'NULL';
    this.db.run(
      `UPDATE ceramic_commissions SET status=?, paid_at=${paidAt}, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [status, id]
    );
  }

  public deleteCommission(id: string): void {
    this.requireManage();
    this.db.run(`DELETE FROM ceramic_commissions WHERE id=?`, [id]);
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  public getDashboardStats() {
    this.requireView();
    const designs = this.db.query<any>(
      `SELECT COUNT(DISTINCT p.name || '|' || COALESCE(b.name,'')) AS c
       FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.is_active = 1`
    )[0];
    const skus = this.db.query<any>(`SELECT COUNT(*) c FROM products WHERE is_active = 1`)[0];
    const lowStock = this.db.query<any>(
      `SELECT COUNT(*) c FROM products p
       WHERE p.is_active = 1 AND COALESCE(p.min_stock_level,0) > 0
         AND COALESCE((SELECT SUM(ws.quantity_m2) FROM warehouse_stock ws WHERE ws.product_id = p.id),0) < p.min_stock_level`
    )[0];
    const quotes = this.db.query<any>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('DRAFT','SENT') THEN 1 ELSE 0 END) AS open,
              COALESCE(SUM(CASE WHEN status IN ('DRAFT','SENT') THEN total_amount ELSE 0 END),0) AS openAmount
       FROM ceramic_area_quotes`
    )[0];
    const showroom = this.db.query<any>(
      `SELECT COALESCE(SUM(ws.quantity_m2),0) AS m2
       FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
       WHERE w.warehouse_type = 'SHOWROOM'`
    )[0];
    const serviceOrders = this.db.query<any>(
      `SELECT COUNT(*) AS open, COALESCE(SUM(total_amount),0) AS openAmount
       FROM ceramic_service_orders WHERE status IN ('PENDING','IN_PROGRESS')`
    )[0];
    const commissions = this.db.query<any>(
      `SELECT COUNT(*) AS pending, COALESCE(SUM(amount),0) AS pendingAmount
       FROM ceramic_commissions WHERE status = 'PENDING'`
    )[0];
    return {
      designsCount: Number(designs?.c ?? 0),
      skusCount: Number(skus?.c ?? 0),
      lowStockCount: Number(lowStock?.c ?? 0),
      openQuotes: Number(quotes?.open ?? 0),
      openQuotesAmount: round2(quotes?.openAmount ?? 0),
      showroomM2: round2(showroom?.m2 ?? 0),
      openServiceOrders: Number(serviceOrders?.open ?? 0),
      openServiceOrdersAmount: round2(serviceOrders?.openAmount ?? 0),
      pendingCommissions: Number(commissions?.pending ?? 0),
      pendingCommissionsAmount: round2(commissions?.pendingAmount ?? 0),
    };
  }
}

