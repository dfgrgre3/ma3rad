import { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { Product, WarehouseStock } from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { InventoryCostingService } from '../inventory/InventoryCostingService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { SettingsService } from '../config/SettingsService';
import { unscaleMoneyRow } from '../../../utils/money';

const PRODUCT_MONEY_FIELDS = ['costPrice','cost_price','sellingPriceM2','selling_price_m2','sellingPriceBox','selling_price_box','wholesalePriceM2','wholesale_price_m2','minSellingPriceM2','min_selling_price_m2'] as const;
import { localDateString } from '../../../utils/shared/date';
import { parseBusinessConfiguration } from '../../../config/businessProfiles';
import { MasterDataSyncService } from '../../../sync/MasterDataSyncService';
import { CentralUsageLimitService } from '../licensing/CentralUsageLimitService';
import { OperationApprovalGate } from '../approvals/OperationApprovalGate';

/** Deterministic JSON serialization (sorted keys) for approval payload matching. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}

/** Deterministic non-cryptographic hash (FNV-1a) safe to embed in dedupeKey strings. */
function stableHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export interface ProductQueryOptions {
  brandId?: string;
  grade?: string;
  stockStatus?: 'all' | 'in' | 'low' | 'out';
  sortBy?: 'name' | 'newest' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';
  includeInactive?: boolean;
  status?: 'all' | 'active' | 'inactive';
  productIds?: string[];
  customFieldFilters?: Record<string, string>;
  /** تصفية حسب قيم الخصائص الديناميكية (attributes) — attributeId → value. */
  attributeFilters?: Record<string, string>;
}

export interface ProductStats {
  totalProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  lowStock: number;
  outOfStock: number;
  totalStockM2: number;
  totalStockValue: number;
  totalBoxes: number;
}

export class ProductService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private sync = new MasterDataSyncService(this.db);

  private productColumns(alias = 'p'): string {
    // رؤية التكلفة: كود الحساسية المخصص finance.cost.view هو الأساس، مع
    // الإبقاء على ui.finance.overview.view كبديل ترحيل حتى لا تنقطع
    // القدرات عن الأدوار التي لم تُزرع لها الأكواد الجديدة بعد.
    const user = AuthService.getCurrentUser();
    const canViewCosts =
      PermissionService.can(user, 'finance.cost.view')
      || PermissionService.can(user, 'ui.finance.overview.view');
    return [
      `${alias}.id`, `${alias}.product_type`, `${alias}.custom_unit`, `${alias}.sku`, `${alias}.barcode`,
      `${alias}.name`, `${alias}.category_id`, `${alias}.brand_id`, `${alias}.grade`, `${alias}.size`,
      `${alias}.thickness`, `${alias}.color`, `${alias}.tone`, `${alias}.finish`, `${alias}.surface_location`,
      `${alias}.base_unit`, `${alias}.sell_unit`, `${alias}.pieces_per_box`, `${alias}.meters_per_box`,
      `${alias}.weight_per_box`, ...(canViewCosts ? [`${alias}.cost_price`] : []),
      `${alias}.selling_price_m2`, `${alias}.selling_price_box`, `${alias}.wholesale_price_m2`,
      `${alias}.min_selling_price_m2`, `${alias}.min_stock_level`, `${alias}.max_stock_level`,
      `${alias}.image_path`, `${alias}.notes`, `${alias}.is_active`, `${alias}.created_at`, `${alias}.updated_at`,
    ].join(', ');
  }

  private stockSubquery(): { sql: string; params: string[] } {
    const branchScope = this.branchAccess.warehouseBranchScope('w');
    const companyScope = this.branchAccess.companyScope('w.company_id');
    return {
      sql: `(SELECT ws.product_id, SUM(ws.quantity_m2) AS qty
             FROM warehouse_stock ws
             JOIN warehouses w ON w.id = ws.warehouse_id
             WHERE ${branchScope.clause} AND ${companyScope.clause}
             GROUP BY ws.product_id)`,
      params: [...branchScope.params, ...companyScope.params],
    };
  }

  private buildProductListQuery(search?: string, categoryId?: string, brandId?: string): { sql: string; params: any[] } {
    const scope = this.branchAccess.companyScope('p.company_id');
    let sql = `
      SELECT ${this.productColumns('p')}, c.name as categoryName, b.name as brandName
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.is_active = 1 AND ${scope.clause}
    `;
    const params: any[] = [...scope.params];

    if (search && search.trim()) {
      sql += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.size LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    if (categoryId) {
      sql += ` AND p.category_id = ?`;
      params.push(categoryId);
    }

    if (brandId) {
      sql += ` AND p.brand_id = ?`;
      params.push(brandId);
    }

    sql += ` ORDER BY p.name ASC`;
    return { sql, params };
  }

  public getAllProducts(search?: string, categoryId?: string, brandId?: string): Product[] {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.view');
    const { sql, params } = this.buildProductListQuery(search, categoryId, brandId);
    return this.db.query<Product>(sql, params).map((r) => unscaleMoneyRow(r, PRODUCT_MONEY_FIELDS));
  }

  public async getAllProductsAsync(search?: string, categoryId?: string, brandId?: string): Promise<Product[]> {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.view');
    const { sql, params } = this.buildProductListQuery(search, categoryId, brandId);
    const rows = await this.db.queryAsync<Product>(sql, params);
    return rows.map((r) => unscaleMoneyRow(r, PRODUCT_MONEY_FIELDS));
  }

  private buildProductsPageQuery(
    search: string,
    categoryId: string | undefined,
    brandId: string | undefined,
    options: ProductQueryOptions,
  ): { dataSql: string; countSql: string; params: any[]; countParams: any[] } {
    const stock = this.stockSubquery();
    const scope = this.branchAccess.companyScope('p.company_id');
    const filters: string[] = [scope.clause];
    const params: any[] = [...stock.params, ...scope.params];
    if (options.status === 'active') filters.push('p.is_active = 1');
    else if (options.status === 'inactive') filters.push('p.is_active = 0');
    else if (!options.includeInactive) filters.push('p.is_active = 1');
    if (search.trim()) {
      filters.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.size LIKE ? OR c.name LIKE ? OR b.name LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term, term);
    }
    if (categoryId) { filters.push('p.category_id = ?'); params.push(categoryId); }
    if (brandId || options.brandId) { filters.push('p.brand_id = ?'); params.push(brandId || options.brandId); }
    if (options.productIds) {
      if (options.productIds.length) {
        filters.push(`p.id IN (${options.productIds.map(() => '?').join(', ')})`);
        params.push(...options.productIds);
      } else {
        filters.push('1 = 0');
      }
    }
    if (options.grade) { filters.push('p.grade = ?'); params.push(options.grade); }
    for (const [fieldId, value] of Object.entries(options.customFieldFilters || {})) {
      if (!fieldId || !value) continue;
      filters.push(`EXISTS (
        SELECT 1 FROM operational_field_values opfv
        WHERE opfv.entity_type = 'products' AND opfv.record_id = p.id
          AND opfv.field_id = ? AND opfv.value = ?
      )`);
      params.push(fieldId, value);
    }
    for (const [attributeId, value] of Object.entries(options.attributeFilters || {})) {
      if (!attributeId || !value) continue;
      filters.push(`EXISTS (
        SELECT 1 FROM product_attribute_values pav
        WHERE pav.product_id = p.id AND pav.attribute_id = ? AND pav.value = ?
      )`);
      params.push(attributeId, value);
    }
    if (options.stockStatus === 'out') filters.push(`COALESCE(st.qty, 0) <= 0`);
    else if (options.stockStatus === 'low') filters.push(`COALESCE(st.qty, 0) > 0 AND COALESCE(st.qty, 0) <= p.min_stock_level`);
    else if (options.stockStatus === 'in') filters.push(`COALESCE(st.qty, 0) > p.min_stock_level`);
    const where = filters.length > 0 ? filters.join(' AND ') : '1 = 1';

    const orderBy = ({
      name: 'p.name ASC',
      newest: 'p.created_at DESC',
      price_asc: 'p.selling_price_m2 ASC',
      price_desc: 'p.selling_price_m2 DESC',
      stock_asc: 'COALESCE(st.qty, 0) ASC',
      stock_desc: 'COALESCE(st.qty, 0) DESC',
    } as Record<string, string>)[options.sortBy || 'name'] || 'p.name ASC';

    const fromSql = `FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN ${stock.sql} st ON st.product_id = p.id
      WHERE ${where}`;
    const countNeedsStock = ['in', 'low', 'out'].includes(options.stockStatus || '');
    const countJoins = [
      ...(search.trim() ? [
        'LEFT JOIN categories c ON p.category_id = c.id',
        'LEFT JOIN brands b ON p.brand_id = b.id',
      ] : []),
      ...(countNeedsStock ? [`LEFT JOIN ${stock.sql} st ON st.product_id = p.id`] : []),
    ];
    const countFromSql = `FROM products p ${countJoins.join(' ')} WHERE ${where}`;
    const countParams = [
      ...(countNeedsStock ? stock.params : []),
      ...params.slice(stock.params.length),
    ];

    const dataSql = `SELECT ${this.productColumns('p')}, c.name as categoryName, b.name as brandName,
            COALESCE(st.qty, 0) as totalStockM2,
            CASE
              WHEN p.product_type = 'GENERAL' AND p.base_unit = 'BOX' THEN COALESCE(st.qty, 0)
              WHEN p.product_type = 'GENERAL' AND p.base_unit <> 'M2' THEN 0
              WHEN p.meters_per_box > 0 THEN COALESCE(st.qty, 0) / p.meters_per_box
              ELSE 0
            END as totalStockBoxes,
            CASE
              WHEN p.product_type = 'GENERAL' AND p.base_unit = 'PIECE' THEN COALESCE(st.qty, 0)
              WHEN p.product_type = 'GENERAL' AND p.base_unit <> 'M2' THEN 0
              WHEN p.meters_per_box > 0 AND p.pieces_per_box > 0
                THEN (COALESCE(st.qty, 0) / p.meters_per_box) * p.pieces_per_box
              ELSE 0
            END as totalStockPieces
     ${fromSql} ORDER BY ${orderBy}`;

    return { dataSql, countSql: `SELECT COUNT(*) as total_items ${countFromSql}`, params, countParams };
  }

  private async queryProductsPageAsync(
    dataSql: string,
    countSql: string,
    params: any[],
    page: number,
    pageSize: number,
    countParams: any[],
  ) {
    const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 25, 1), 100);
    const countRows = await this.db.queryAsync<{ total_items: number }>(countSql, countParams);
    const totalItems = Number(countRows[0]?.total_items ?? (countRows[0] as any)?.totalItems ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), totalPages);
    const items = await this.db.queryAsync<Product>(
      `${dataSql} LIMIT ? OFFSET ?`,
      [...params, safePageSize, (safePage - 1) * safePageSize],
    );
    return { items, page: safePage, pageSize: safePageSize, totalItems, totalPages };
  }

  public getProductsPage(
    search = '',
    categoryId?: string,
    brandId?: string,
    page = 1,
    pageSize = 25,
    options: ProductQueryOptions = {},
  ) {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.view');
    const { dataSql, countSql, params, countParams } = this.buildProductsPageQuery(search, categoryId, brandId, options);
    const pageResult = this.db.queryPage<Product>(dataSql, countSql, params, page, pageSize, countParams);
    pageResult.items = pageResult.items.map((r) => unscaleMoneyRow(r, PRODUCT_MONEY_FIELDS));
    return pageResult;
  }

  public async getProductsPageAsync(
    search = '',
    categoryId?: string,
    brandId?: string,
    page = 1,
    pageSize = 25,
    options: ProductQueryOptions = {},
  ) {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.view');
    const { dataSql, countSql, params, countParams } = this.buildProductsPageQuery(search, categoryId, brandId, options);
    const pageResult = await this.queryProductsPageAsync(dataSql, countSql, params, page, pageSize, countParams);
    pageResult.items = pageResult.items.map((r) => unscaleMoneyRow(r, PRODUCT_MONEY_FIELDS));
    return pageResult;
  }

  private buildProductStatsQuery(actor: ReturnType<typeof AuthService.requireAuth>) {
    const stock = this.stockSubquery();
    const companyScope = this.branchAccess.companyScope('p.company_id', actor);
    const sql = `
      SELECT
        COUNT(*) as totalProducts,
        COALESCE(SUM(CASE WHEN p.is_active = 1 THEN 1 ELSE 0 END), 0) as activeProducts,
        COALESCE(SUM(CASE WHEN p.is_active = 0 THEN 1 ELSE 0 END), 0) as inactiveProducts,
        COALESCE(SUM(CASE WHEN p.is_active = 1 AND COALESCE(st.qty, 0) <= 0 THEN 1 ELSE 0 END), 0) as outOfStock,
        COALESCE(SUM(CASE WHEN p.is_active = 1 AND COALESCE(st.qty, 0) > 0 AND COALESCE(st.qty, 0) <= p.min_stock_level THEN 1 ELSE 0 END), 0) as lowStock,
        COALESCE(SUM(CASE WHEN p.is_active = 1 THEN COALESCE(st.qty, 0) ELSE 0 END), 0) as totalStockM2,
        COALESCE(SUM(CASE WHEN p.is_active = 1 THEN COALESCE(st.qty, 0) * p.cost_price ELSE 0 END), 0) / 100.0 as totalStockValue,
        COALESCE(SUM(CASE WHEN p.is_active = 1 AND p.meters_per_box > 0 THEN COALESCE(st.qty, 0) / p.meters_per_box ELSE 0 END), 0) as totalBoxes
      FROM products p
      LEFT JOIN ${stock.sql} st ON st.product_id = p.id
      WHERE ${companyScope.clause}
    `;
    return { sql, params: [...stock.params, ...companyScope.params] };
  }

  private mapProductStatsRows(rows: any[], actor: ReturnType<typeof AuthService.requireAuth>): ProductStats {
    const canViewCosts = PermissionService.can(actor, 'ui.finance.overview.view');
    const r = rows[0] || {};
    return {
      totalProducts: Number(r.totalProducts) || 0,
      activeProducts: Number(r.activeProducts) || 0,
      inactiveProducts: Number(r.inactiveProducts) || 0,
      lowStock: Number(r.lowStock) || 0,
      outOfStock: Number(r.outOfStock) || 0,
      totalStockM2: Number(Number(r.totalStockM2 || 0).toFixed(2)),
      totalStockValue: canViewCosts ? Number(Number(r.totalStockValue || 0).toFixed(2)) : 0,
      totalBoxes: Number(Number(r.totalBoxes || 0).toFixed(2)),
    };
  }

  public getProductStats(): ProductStats {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.products.catalog.view');
    const { sql, params } = this.buildProductStatsQuery(actor);
    return this.mapProductStatsRows(this.db.query<any>(sql, params), actor);
  }

  public async getProductStatsAsync(): Promise<ProductStats> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.products.catalog.view');
    const { sql, params } = this.buildProductStatsQuery(actor);
    return this.mapProductStatsRows(await this.db.queryAsync<any>(sql, params), actor);
  }

  private buildProductByIdQuery(id: string): { sql: string; params: any[] } {
    const scope = this.branchAccess.companyScope('p.company_id');
    const sql = `
      SELECT ${this.productColumns('p')}, c.name as categoryName, b.name as brandName
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.id = ? AND ${scope.clause}
    `;
    return { sql, params: [id, ...scope.params] };
  }

  public getProductById(id: string): Product | null {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.view');
    const { sql, params } = this.buildProductByIdQuery(id);
    const rows = this.db.query<Product>(sql, params);
    return rows.length > 0 ? unscaleMoneyRow(rows[0], PRODUCT_MONEY_FIELDS) : null;
  }

  public async getProductByIdAsync(id: string): Promise<Product | null> {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.view');
    const { sql, params } = this.buildProductByIdQuery(id);
    const rows = await this.db.queryAsync<Product>(sql, params);
    return rows.length > 0 ? unscaleMoneyRow(rows[0], PRODUCT_MONEY_FIELDS) : null;
  }

  public getProductByBarcode(barcode: string): Product | null {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.view');
    const scope = this.branchAccess.companyScope('p.company_id');
    const rows = this.db.query<Product>(`
      SELECT ${this.productColumns('p')}, c.name as categoryName, b.name as brandName
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE (p.barcode = ? OR p.sku = ?) AND p.is_active = 1 AND ${scope.clause}
    `, [barcode, barcode, ...scope.params]);
    return rows.length > 0 ? unscaleMoneyRow(rows[0], PRODUCT_MONEY_FIELDS) : null;
  }

  public generateNextBarcode(currentValue = ''): string {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.create');
    const rows = this.db.query<{ barcode: string; sku: string }>(
      'SELECT barcode, sku FROM products',
    );
    const usedCodes = new Set(rows.flatMap((row) => [row.barcode, row.sku]));
    if (currentValue) usedCodes.add(currentValue);
    let sequence = 1;
    while (usedCodes.has(String(sequence))) sequence += 1;
    return String(sequence);
  }

  public generateNextSku(currentValue = ''): string {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.create');
    const rows = this.db.query<{ barcode: string; sku: string }>(
      'SELECT barcode, sku FROM products',
    );
    const usedCodes = new Set(rows.flatMap((row) => [row.barcode, row.sku]));
    if (currentValue) usedCodes.add(currentValue);
    let candidate = '';
    do {
      candidate = `SKU-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    } while (usedCodes.has(candidate));
    return candidate;
  }

  public createProduct(
    product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    initialStock?: { warehouseId: string; quantityM2: number; unitCost: number },
    performedBy = 'usr_admin',
    options: { approvalId?: string } = {}
  ): Product {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.create');
    CentralUsageLimitService.assertWithin('maxProducts');
    if (initialStock && initialStock.quantityM2 > 0 && !ModuleRegistryService.isInventoryTracked()) {
      throw new Error('هذا النشاط لا يتبّع المخزون، لذلك لا يمكن تسجيل رصيد افتتاحي. اضبط كميات المخزون من إعدادات النشاط أولًا.');
    }
    const id = `prod_${uuidv4().substring(0, 8)}`;
    const trackInventory = ModuleRegistryService.isInventoryTracked();
    const profile = parseBusinessConfiguration(
      SettingsService.getValue('businessProfileConfig'),
      ModuleRegistryService.getBusinessType()
    );
    const defaultUnit = profile.units[0] || 'PIECE';
    const defaultProductType = trackInventory ? 'CERAMIC' : 'GENERAL';
    const defaultSurface = trackInventory ? 'FLOOR' : '';
    
    // Check barcode uniqueness
    const existing = this.db.query(`SELECT id FROM products WHERE barcode = ? OR sku = ?`, [product.barcode, product.sku]);
    if (existing.length > 0) {
      throw new Error(`الباركود (${product.barcode}) أو الكود (${product.sku}) مستخدم بالفعل لمنتج آخر.`);
    }
    if (product.categoryId) {
      const category = this.db.query('SELECT id FROM categories WHERE id = ?', [product.categoryId]);
      if (category.length === 0) throw new Error('التصنيف المحدد غير موجود.');
    }
    if (product.brandId) {
      const brand = this.db.query('SELECT id FROM brands WHERE id = ?', [product.brandId]);
      if (brand.length === 0) throw new Error('الماركة المحددة غير موجودة.');
    }

    // ── Approval gate: إضافة منتج قد تتطلب موافقة حسب سياسة العملية ──
    const gate = new OperationApprovalGate(this.db);
    const createMatchDetails = {
      productSku: product.sku,
      productBarcode: product.barcode,
      productName: product.name,
      productType: product.productType || defaultProductType,
      costPrice: product.costPrice ?? 0,
      sellingPriceM2: product.sellingPriceM2 ?? 0,
      sellingPriceBox: product.sellingPriceBox ?? 0,
      wholesalePriceM2: product.wholesalePriceM2 ?? 0,
      minSellingPriceM2: product.minSellingPriceM2 ?? 0,
      baseUnit: product.baseUnit || defaultUnit,
      sellUnit: product.sellUnit || defaultUnit,
    };
    const { policy: createPolicy, required: createApprovalRequired } = gate.evaluate('products.create');
    let createApprovalId: string | null = null;
    if (createApprovalRequired) {
      createApprovalId = options.approvalId
        ?? gate.findApproved('products.create', 'OTHER', createMatchDetails);
      if (options.approvalId) {
        gate.assertApproved(options.approvalId, 'products.create', createMatchDetails);
      }
      if (!createApprovalId) {
        const approvalId = gate.requestApproval({
          operationCode: 'products.create',
          requestType: 'OTHER',
          title: `إضافة منتج ${product.name}`,
          description: `الكود: ${product.sku} — الباركود: ${product.barcode}`,
          details: {
            ...createMatchDetails,
            dedupeKey: `create:product:${product.sku}`,
            policy: createPolicy,
          },
        });
        gate.throwRequested(approvalId);
      }
    }

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`
        INSERT INTO products (
          id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, grade, size,
            thickness, color, tone, finish, surface_location, base_unit, sell_unit,
          pieces_per_box, meters_per_box, weight_per_box, cost_price,
          selling_price_m2, selling_price_box, wholesale_price_m2, min_selling_price_m2,
          min_stock_level, max_stock_level, image_path, notes, is_active, company_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?, ?)
      `, [
        id, product.productType || defaultProductType, product.customUnit || '', product.sku, product.barcode, product.name, product.categoryId, product.brandId,
          product.grade || 'GRADE_1', product.size || '', product.thickness || 0, product.color || '', product.tone || '', product.finish || '',
        product.surfaceLocation || defaultSurface, product.baseUnit || defaultUnit, product.sellUnit || defaultUnit,
        product.piecesPerBox ?? 1, product.metersPerBox ?? 1, product.weightPerBox ?? 0,
        product.costPrice ?? 0, product.sellingPriceM2 ?? 0, product.sellingPriceBox ?? 0,
        product.wholesalePriceM2 ?? 0, product.minSellingPriceM2 ?? 0, product.minStockLevel ?? 10,
        product.maxStockLevel ?? 1000, product.imagePath || '', product.notes || '', 1,
        (this.branchAccess.getAccessibleCompanyIds(AuthService.requireAuth()) || ['cmp_main'])[0]
      ]);
      this.sync.capture(sqliteDb, 'product', id, 'CREATE');

      // Initialize stock record if provided
      if (initialStock && initialStock.quantityM2 > 0) {
        const stockId = `stk_${uuidv4().substring(0, 8)}`;
        sqliteDb.run(`
          INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
          VALUES (?, ?, ?, ?, 0)
        `, [stockId, initialStock.warehouseId, id, initialStock.quantityM2]);

        const txId = `tx_${uuidv4().substring(0, 8)}`;
        const txNum = `TX-OP-${Date.now().toString().slice(-6)}`;
        sqliteDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
            notes, performed_by
          ) VALUES (?, ?, 'OPENING_BALANCE', ?, ?, ?, ROUND(?*100), ROUND(?*100), 'ADJUSTMENT', 'رصيد افتتاحي عند تعريف الصنف', ?)
        `, [
          txId, txNum, id, initialStock.warehouseId,
          initialStock.quantityM2,
          product.productType === 'GENERAL'
            ? product.baseUnit === 'BOX' ? initialStock.quantityM2 : 0
            : Number((initialStock.quantityM2 / (product.metersPerBox || 1.44)).toFixed(2)),
          initialStock.unitCost || product.costPrice,
          (initialStock.quantityM2 * (initialStock.unitCost || product.costPrice)),
          performedBy
        ]);
        InventoryCostingService.addLayer(sqliteDb, {
          productId: id, warehouseId: initialStock.warehouseId, sourceTransactionId: txId,
          sourceType: 'OPENING_BALANCE', sourceId: txId, date: localDateString(),
          quantity: initialStock.quantityM2, unitCost: initialStock.unitCost || product.costPrice,
        });
      }

      // Log Audit
      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, 'المدير', 'إضافة صنف جديد', 'PRODUCTS', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, id, JSON.stringify(product)]);

      if (createApprovalId) {
        gate.consume(createApprovalId, 'PRODUCT', id, sqliteDb);
      }

      return this.getProductById(id)!;
    });
  }

  public updateProduct(
    id: string,
    updates: Partial<Product>,
    performedBy = 'usr_admin',
    options: { approvalId?: string } = {}
  ): Product {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.update');
    const existing = this.getProductById(id);
    if (!existing) throw new Error('المنتج غير موجود.');

    // ── Approval gate: تعديل بيانات المنتج وفق سياسة العملية ──
    // حقول الأسعار تُدار بواسطة بوابة products.price.update أدناه، فلا نطالب
    // باعتمادين مختلفين لنفس العملية.
    const priceFields = ['costPrice', 'sellingPriceM2', 'sellingPriceBox', 'wholesalePriceM2', 'minSellingPriceM2'] as const;
    const touchesPriceFields = priceFields.some(
      (field) => updates[field] !== undefined && updates[field] !== null
    );
    const gate = new OperationApprovalGate(this.db);
    const updateMatchDetails = {
      productId: id,
      productName: updates.name ?? existing.name,
      productSku: updates.sku ?? existing.sku,
      productBarcode: updates.barcode ?? existing.barcode,
      updatePayload: stableStringify(updates),
      costPrice: updates.costPrice ?? existing.costPrice,
      sellingPriceM2: updates.sellingPriceM2 ?? existing.sellingPriceM2,
      sellingPriceBox: updates.sellingPriceBox ?? existing.sellingPriceBox,
      wholesalePriceM2: updates.wholesalePriceM2 ?? existing.wholesalePriceM2,
      minSellingPriceM2: updates.minSellingPriceM2 ?? existing.minSellingPriceM2,
    };
    const { policy: updatePolicy, required: updateApprovalRequired } = gate.evaluate('products.update');
    let updateApprovalId: string | null = null;
    if (updateApprovalRequired && !touchesPriceFields) {
      updateApprovalId = options.approvalId
        ?? gate.findApproved('products.update', 'OTHER', updateMatchDetails);
      if (options.approvalId) {
        gate.assertApproved(options.approvalId, 'products.update', updateMatchDetails);
      }
      if (!updateApprovalId) {
        const approvalId = gate.requestApproval({
          operationCode: 'products.update',
          requestType: 'OTHER',
          title: `تعديل المنتج ${existing.name ?? id}`,
          description: `الحقول: ${Object.keys(updates).join('، ')}`,
          details: {
            ...updateMatchDetails,
            dedupeKey: `update:product:${id}:${stableHash(stableStringify(updates))}`,
            policy: updatePolicy,
          },
        });
        gate.throwRequested(approvalId);
      }
    }

    // ── Approval gate: تغيير أسعار المنتج يتطلب موافقة عند تجاوز الحد ──
    const priceChanges: Record<string, { from: number; to: number }> = {};
    let maxPriceDelta = 0;
    for (const field of priceFields) {
      const next = updates[field];
      if (next === undefined || next === null) continue;
      const from = Number((existing as any)[field] ?? 0);
      const to = Number(next);
      if (!Number.isFinite(to)) continue;
      const delta = Math.abs(to - from);
      if (delta > 0.0001) {
        priceChanges[field] = { from, to };
        maxPriceDelta = Math.max(maxPriceDelta, delta);
      }
    }
    let priceApprovalRequired = false;
    let resolvedApprovalId: string | null = null;
    let pricePolicy: unknown = null;
    if (maxPriceDelta > 0) {
      const evalResult = gate.evaluate('products.price.update', maxPriceDelta);
      pricePolicy = evalResult.policy;
      priceApprovalRequired = evalResult.required;
      if (priceApprovalRequired) {
        const priceMatchDetails = { productId: id, changes: priceChanges };
        resolvedApprovalId = options.approvalId
          ?? gate.findApproved('products.price.update', 'PRICE_CHANGE', priceMatchDetails);
        if (options.approvalId) {
          gate.assertApproved(options.approvalId, 'products.price.update', priceMatchDetails);
        }
        if (!resolvedApprovalId) {
          const productName = existing.name ?? id;
          const approvalId = gate.requestApproval({
            operationCode: 'products.price.update',
            requestType: 'PRICE_CHANGE',
            title: `تعديل أسعار ${productName}`,
            description: Object.entries(priceChanges).map(([f, c]) => `${f}: ${c.from} → ${c.to}`).join('، '),
            requestedValue: maxPriceDelta,
            currentValue: null,
            details: { productId: id, changes: priceChanges, dedupeKey: `price:${id}:${stableHash(stableStringify(priceChanges))}`, policy: pricePolicy },
          });
          gate.throwRequested(approvalId);
        }
      }
    }

    if (updates.sku && updates.sku !== existing.sku) {
      const dup = this.db.query('SELECT id FROM products WHERE sku = ? AND id != ?', [updates.sku, id]);
      if (dup.length > 0) throw new Error(`الكود (${updates.sku}) مستخدم بالفعل لمنتج آخر.`);
    }
    if (updates.barcode && updates.barcode !== existing.barcode) {
      const dup = this.db.query('SELECT id FROM products WHERE barcode = ? AND id != ?', [updates.barcode, id]);
      if (dup.length > 0) throw new Error(`الباركود (${updates.barcode}) مستخدم بالفعل لمنتج آخر.`);
    }
    if (updates.categoryId) {
      const category = this.db.query('SELECT id FROM categories WHERE id = ?', [updates.categoryId]);
      if (category.length === 0) throw new Error('التصنيف المحدد غير موجود.');
    }
    if (updates.brandId) {
      const brand = this.db.query('SELECT id FROM brands WHERE id = ?', [updates.brandId]);
      if (brand.length === 0) throw new Error('الماركة المحددة غير موجودة.');
    }

    const sql = `
      UPDATE products SET
        name = COALESCE(?, name),
        sku = COALESCE(?, sku),
        barcode = COALESCE(?, barcode),
        category_id = COALESCE(?, category_id),
        brand_id = COALESCE(?, brand_id),
        product_type = COALESCE(?, product_type),
        custom_unit = COALESCE(?, custom_unit),
        grade = COALESCE(?, grade),
        size = COALESCE(?, size),
        thickness = COALESCE(?, thickness),
        color = COALESCE(?, color),
        tone = COALESCE(?, tone),
        finish = COALESCE(?, finish),
        surface_location = COALESCE(?, surface_location),
        base_unit = COALESCE(?, base_unit),
        sell_unit = COALESCE(?, sell_unit),
        pieces_per_box = COALESCE(?, pieces_per_box),
        meters_per_box = COALESCE(?, meters_per_box),
        weight_per_box = COALESCE(?, weight_per_box),
        cost_price = COALESCE(ROUND(?*100), cost_price),
        selling_price_m2 = COALESCE(ROUND(?*100), selling_price_m2),
        selling_price_box = COALESCE(ROUND(?*100), selling_price_box),
        wholesale_price_m2 = COALESCE(ROUND(?*100), wholesale_price_m2),
        min_selling_price_m2 = COALESCE(ROUND(?*100), min_selling_price_m2),
        min_stock_level = COALESCE(?, min_stock_level),
        max_stock_level = COALESCE(?, max_stock_level),
        notes = COALESCE(?, notes),
        image_path = COALESCE(?, image_path),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(sql, [
        updates.name ?? null, updates.sku ?? null, updates.barcode ?? null, updates.categoryId ?? null, updates.brandId ?? null,
        updates.productType ?? null, updates.customUnit ?? null, updates.grade ?? null, updates.size ?? null, updates.thickness ?? null, updates.color ?? null, updates.tone ?? null, updates.finish ?? null,
        updates.surfaceLocation ?? null, updates.baseUnit ?? null, updates.sellUnit ?? null,
        updates.piecesPerBox ?? null, updates.metersPerBox ?? null, updates.weightPerBox ?? null,
        updates.costPrice ?? null, updates.sellingPriceM2 ?? null, updates.sellingPriceBox ?? null,
        updates.wholesalePriceM2 ?? null, updates.minSellingPriceM2 ?? null, updates.minStockLevel ?? null,
        updates.maxStockLevel ?? null, updates.notes ?? null, updates.imagePath ?? null, id
      ]);
      this.sync.capture(sqliteDb, 'product', id, 'UPDATE');

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
        VALUES (?, ?, 'المدير', 'تعديل بيانات صنف', 'PRODUCTS', ?, ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, id, JSON.stringify(existing), JSON.stringify(updates)]);

      if (updateApprovalId) {
        gate.consume(updateApprovalId, 'PRODUCT', id, sqliteDb);
      }
      if (resolvedApprovalId) {
        gate.consume(resolvedApprovalId, 'PRICE_CHANGE', id, sqliteDb);
      }

      return this.getProductById(id)!;
    });
  }

  public deleteProduct(
    id: string,
    performedBy = 'usr_admin',
    options: { approvalId?: string; reason?: string } = {}
  ): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.products.catalog.delete');
    const existing = this.getProductById(id);
    if (!existing) throw new Error('المنتج غير موجود.');

    // ── Approval gate: حذف بيانات يتطلب موافقة إدارية وتسجيل السبب ──
    const gate = new OperationApprovalGate(this.db);
    const { policy: deletePolicy } = gate.evaluate('products.delete');
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN';
    const deleteApprovalRequired = !isAdmin;
    if (deleteApprovalRequired && !options.reason?.trim()) {
      throw new Error('سبب حذف البيانات مطلوب عند الحاجة لموافقة.');
    }
    let resolvedApprovalId: string | null = null;
    if (deleteApprovalRequired) {
      resolvedApprovalId = options.approvalId
        ?? gate.findApproved('products.delete', 'DATA_DELETE', { productId: id });
      if (options.approvalId) {
        gate.assertApproved(options.approvalId, 'products.delete', { productId: id });
      }
      if (!resolvedApprovalId) {
        const approvalId = gate.requestApproval({
          operationCode: 'products.delete',
          requestType: 'DATA_DELETE',
          title: `حذف منتج ${existing.name ?? id}`,
          description: options.reason!.trim(),
          details: {
            productId: id, productName: existing.name ?? null,
            reason: options.reason!.trim(),
            dedupeKey: `delete:product:${id}`, policy: deletePolicy,
          },
        });
        gate.throwRequested(approvalId);
      }
    }

    this.db.executeTransaction((sqliteDb) => {
      const hasSales = sqliteDb.query(`SELECT id FROM sales_invoice_items WHERE product_id = ? LIMIT 1`, [id]);
      if (hasSales.length > 0) {
        sqliteDb.run(`UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
        this.sync.capture(sqliteDb, 'product', id, 'UPDATE');
      } else {
        this.sync.capture(sqliteDb, 'product', id, 'DELETE');
        sqliteDb.run(`DELETE FROM products WHERE id = ?`, [id]);
      }

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id)
        VALUES (?, ?, 'المدير', 'حذف/تعطيل صنف', 'PRODUCTS', ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, id]);

      if (resolvedApprovalId) {
        gate.consume(resolvedApprovalId, 'DATA_DELETE', id, sqliteDb);
      }
    });
  }

  public setProductActive(id: string, active: boolean, performedBy = 'usr_admin'): void {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.update');
    this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [active ? 1 : 0, id]);
      this.sync.capture(sqliteDb, 'product', id, 'UPDATE');
      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, 'المدير', ?, 'PRODUCTS', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, active ? 'تفعيل صنف' : 'إيقاف صنف', id, JSON.stringify({ isActive: active })]);
    });
  }

  public duplicateProduct(id: string, performedBy = 'usr_admin'): Product {
    PermissionService.require(AuthService.requireAuth(), 'ui.products.catalog.create');
    const source = this.getProductById(id);
    if (!source) throw new Error('الصنف غير موجود.');

    const baseSku = source.sku.replace(/-COPY\d*$/i, '');
    let copy = 1;
    let sku = `${baseSku}-COPY1`;
    let barcode = `${source.barcode}9`;
    while (this.db.query(`SELECT id FROM products WHERE sku = ? OR barcode = ?`, [sku, barcode]).length > 0) {
      copy += 1;
      sku = `${baseSku}-COPY${copy}`;
      barcode = `${source.barcode}${copy}`;
    }

    return this.createProduct({
      sku,
      barcode,
      name: `${source.name} (نسخة)`,
      categoryId: source.categoryId,
      brandId: source.brandId,
      productType: source.productType,
      customUnit: source.customUnit,
      grade: source.grade,
      size: source.size,
      thickness: source.thickness,
      color: source.color,
      finish: source.finish,
      surfaceLocation: source.surfaceLocation,
      baseUnit: source.baseUnit,
      sellUnit: source.sellUnit,
      piecesPerBox: source.piecesPerBox,
      metersPerBox: source.metersPerBox,
      weightPerBox: source.weightPerBox,
      costPrice: source.costPrice,
      sellingPriceM2: source.sellingPriceM2,
      sellingPriceBox: source.sellingPriceBox,
      wholesalePriceM2: source.wholesalePriceM2,
      minSellingPriceM2: source.minSellingPriceM2,
      minStockLevel: source.minStockLevel,
      maxStockLevel: source.maxStockLevel,
      imagePath: source.imagePath,
      notes: source.notes,
      isActive: true,
    }, undefined, performedBy);
  }

  private buildProductStockSummaryQuery(productId: string, actor: ReturnType<typeof AuthService.requireAuth>) {
    const scope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
    const sql = `
      SELECT ws.*, w.name as warehouseName,
             p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
             p.meters_per_box as metersPerBox,
             p.pieces_per_box as piecesPerBox
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE ws.product_id = ? AND ${scope.clause}
    `;
    return { sql, params: [productId, ...scope.params] };
  }

  private mapProductStockSummaryRows(rows: WarehouseStock[]): { totalM2: number; totalBoxes: number; totalPieces: number; byWarehouse: WarehouseStock[] } {
    let totalM2 = 0;
    let totalBoxes = 0;
    let totalPieces = 0;

    const mapped = rows.map(r => {
      const row = r as any;
      const isGeneral = row.productType === 'GENERAL';
      const metersPerBox = row.metersPerBox || 1.44;
      const piecesPerBox = row.piecesPerBox || 1;
      const boxes = isGeneral
        ? row.baseUnit === 'BOX' ? r.quantityM2 : 0
        : Number((r.quantityM2 / metersPerBox).toFixed(2));
      const pieces = isGeneral
        ? row.baseUnit === 'PIECE' ? r.quantityM2 : 0
        : Math.round(boxes * piecesPerBox);
      totalM2 += r.quantityM2;
      totalBoxes += boxes;
      totalPieces += pieces;
      return {
        ...r,
        quantityBoxes: boxes,
        quantityPieces: pieces,
        availableM2: r.quantityM2 - (r.reservedM2 || 0)
      };
    });

    return {
      totalM2: Number(totalM2.toFixed(2)),
      totalBoxes: Number(totalBoxes.toFixed(2)),
      totalPieces,
      byWarehouse: mapped
    };
  }

  public getProductStockSummary(productId: string): { totalM2: number; totalBoxes: number; totalPieces: number; byWarehouse: WarehouseStock[] } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.products.catalog.view');
    const { sql, params } = this.buildProductStockSummaryQuery(productId, actor);
    return this.mapProductStockSummaryRows(this.db.query<WarehouseStock>(sql, params));
  }

  public async getProductStockSummaryAsync(productId: string): Promise<{ totalM2: number; totalBoxes: number; totalPieces: number; byWarehouse: WarehouseStock[] }> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.products.catalog.view');
    const { sql, params } = this.buildProductStockSummaryQuery(productId, actor);
    return this.mapProductStockSummaryRows(await this.db.queryAsync<WarehouseStock>(sql, params));
  }
}



