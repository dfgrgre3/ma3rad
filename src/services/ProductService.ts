import { DatabaseManager } from '../database/db';
import type { Product, WarehouseStock, InventoryTransaction } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { BranchAccessService } from './BranchAccessService';
import { PermissionService } from './PermissionService';
import { InventoryCostingService } from './InventoryCostingService';
import { ModuleRegistryService } from './ModuleRegistryService';
import { SettingsService } from './SettingsService';
import { parseBusinessConfiguration } from '../config/businessProfiles';
import { MasterDataSyncService } from '../sync/MasterDataSyncService';

export interface ProductQueryOptions {
  brandId?: string;
  grade?: string;
  stockStatus?: 'all' | 'in' | 'low' | 'out';
  sortBy?: 'name' | 'newest' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';
  includeInactive?: boolean;
  status?: 'all' | 'active' | 'inactive';
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

const STOCK_SUBQUERY = `(SELECT product_id, SUM(quantity_m2) AS qty FROM warehouse_stock GROUP BY product_id)`;

export class ProductService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private sync = new MasterDataSyncService(this.db);

  public getAllProducts(search?: string, categoryId?: string, brandId?: string): Product[] {
    const scope = this.branchAccess.companyScope('p.company_id');
    let sql = `
      SELECT p.*, c.name as categoryName, b.name as brandName
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
    return this.db.query<Product>(sql, params);
  }

  public getProductsPage(
    search = '',
    categoryId?: string,
    brandId?: string,
    page = 1,
    pageSize = 25,
    options: ProductQueryOptions = {},
  ) {
    const scope = this.branchAccess.companyScope('p.company_id');
    const filters: string[] = [scope.clause];
    const params: any[] = [...scope.params];
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
    if (options.grade) { filters.push('p.grade = ?'); params.push(options.grade); }
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
      LEFT JOIN ${STOCK_SUBQUERY} st ON st.product_id = p.id
      WHERE ${where}`;

    return this.db.queryPage<Product>(
      `SELECT p.*, c.name as categoryName, b.name as brandName,
              COALESCE(st.qty, 0) as totalStockM2,
              CASE WHEN p.meters_per_box > 0 THEN COALESCE(st.qty, 0) / p.meters_per_box ELSE 0 END as totalStockBoxes,
              CASE WHEN p.meters_per_box > 0 AND p.pieces_per_box > 0
                   THEN (COALESCE(st.qty, 0) / p.meters_per_box) * p.pieces_per_box ELSE 0 END as totalStockPieces
       ${fromSql} ORDER BY ${orderBy}`,
      `SELECT COUNT(*) as total_items ${fromSql}`,
      params, page, pageSize,
    );
  }

  public getProductStats(): ProductStats {
    const rows = this.db.query<any>(`
      SELECT
        COUNT(*) as totalProducts,
        COALESCE(SUM(CASE WHEN p.is_active = 1 THEN 1 ELSE 0 END), 0) as activeProducts,
        COALESCE(SUM(CASE WHEN p.is_active = 0 THEN 1 ELSE 0 END), 0) as inactiveProducts,
        COALESCE(SUM(CASE WHEN p.is_active = 1 AND COALESCE(st.qty, 0) <= 0 THEN 1 ELSE 0 END), 0) as outOfStock,
        COALESCE(SUM(CASE WHEN p.is_active = 1 AND COALESCE(st.qty, 0) > 0 AND COALESCE(st.qty, 0) <= p.min_stock_level THEN 1 ELSE 0 END), 0) as lowStock,
        COALESCE(SUM(CASE WHEN p.is_active = 1 THEN COALESCE(st.qty, 0) ELSE 0 END), 0) as totalStockM2,
        COALESCE(SUM(CASE WHEN p.is_active = 1 THEN COALESCE(st.qty, 0) * p.cost_price ELSE 0 END), 0) as totalStockValue,
        COALESCE(SUM(CASE WHEN p.is_active = 1 AND p.meters_per_box > 0 THEN COALESCE(st.qty, 0) / p.meters_per_box ELSE 0 END), 0) as totalBoxes
      FROM products p
      LEFT JOIN ${STOCK_SUBQUERY} st ON st.product_id = p.id
    `);
    const r = rows[0] || {};
    return {
      totalProducts: Number(r.totalProducts) || 0,
      activeProducts: Number(r.activeProducts) || 0,
      inactiveProducts: Number(r.inactiveProducts) || 0,
      lowStock: Number(r.lowStock) || 0,
      outOfStock: Number(r.outOfStock) || 0,
      totalStockM2: Number(Number(r.totalStockM2 || 0).toFixed(2)),
      totalStockValue: Number(Number(r.totalStockValue || 0).toFixed(2)),
      totalBoxes: Number(Number(r.totalBoxes || 0).toFixed(2)),
    };
  }

  public getProductById(id: string): Product | null {
    const scope = this.branchAccess.companyScope('p.company_id');
    const rows = this.db.query<Product>(`
      SELECT p.*, c.name as categoryName, b.name as brandName
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.id = ? AND ${scope.clause}
    `, [id, ...scope.params]);
    return rows.length > 0 ? rows[0] : null;
  }

  public getProductByBarcode(barcode: string): Product | null {
    const scope = this.branchAccess.companyScope('p.company_id');
    const rows = this.db.query<Product>(`
      SELECT p.*, c.name as categoryName, b.name as brandName
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE (p.barcode = ? OR p.sku = ?) AND p.is_active = 1 AND ${scope.clause}
    `, [barcode, barcode, ...scope.params]);
    return rows.length > 0 ? rows[0] : null;
  }

  public createProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>, initialStock?: { warehouseId: string; quantityM2: number; unitCost: number }, performedBy = 'usr_admin'): Product {
    PermissionService.require(AuthService.requireAuth(), 'products.create');
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

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`
        INSERT INTO products (
          id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, grade, size,
            thickness, color, tone, finish, surface_location, base_unit, sell_unit,
          pieces_per_box, meters_per_box, weight_per_box, cost_price,
          selling_price_m2, selling_price_box, wholesale_price_m2, min_selling_price_m2,
          min_stock_level, max_stock_level, image_path, notes, is_active, company_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, product.productType || defaultProductType, product.customUnit || '', product.sku, product.barcode, product.name, product.categoryId, product.brandId,
          product.grade || 'GRADE_1', product.size || '', product.thickness || 0, product.color || '', product.tone || '', product.finish || '',
        product.surfaceLocation || defaultSurface, product.baseUnit || defaultUnit, product.sellUnit || defaultUnit,
        product.piecesPerBox || 1, product.metersPerBox || 1, product.weightPerBox || 0,
        product.costPrice || 0, product.sellingPriceM2 || 0, product.sellingPriceBox || 0,
        product.wholesalePriceM2 || 0, product.minSellingPriceM2 || 0, product.minStockLevel || 10,
        product.maxStockLevel || 1000, product.imagePath || '', product.notes || '', 1,
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
          ) VALUES (?, ?, 'OPENING_BALANCE', ?, ?, ?, ?, ?, ?, 'ADJUSTMENT', 'رصيد افتتاحي عند تعريف الصنف', ?)
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
          sourceType: 'OPENING_BALANCE', sourceId: txId, date: new Date().toISOString().slice(0, 10),
          quantity: initialStock.quantityM2, unitCost: initialStock.unitCost || product.costPrice,
        });
      }

      // Log Audit
      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, 'المدير', 'إضافة صنف جديد', 'PRODUCTS', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, id, JSON.stringify(product)]);

      return this.getProductById(id)!;
    });
  }

  public updateProduct(id: string, updates: Partial<Product>, performedBy = 'usr_admin'): Product {
    PermissionService.require(AuthService.requireAuth(), 'products.update');
    const existing = this.getProductById(id);
    if (!existing) throw new Error('المنتج غير موجود.');

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
        cost_price = COALESCE(?, cost_price),
        selling_price_m2 = COALESCE(?, selling_price_m2),
        selling_price_box = COALESCE(?, selling_price_box),
        wholesale_price_m2 = COALESCE(?, wholesale_price_m2),
        min_selling_price_m2 = COALESCE(?, min_selling_price_m2),
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

      return this.getProductById(id)!;
    });
  }

  public deleteProduct(id: string, performedBy = 'usr_admin'): void {
    PermissionService.require(AuthService.requireAuth(), 'products.delete');
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
    });
  }

  public setProductActive(id: string, active: boolean, performedBy = 'usr_admin'): void {
    PermissionService.require(AuthService.requireAuth(), 'products.update');
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
    PermissionService.require(AuthService.requireAuth(), 'products.create');
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

  public getProductStockSummary(productId: string): { totalM2: number; totalBoxes: number; totalPieces: number; byWarehouse: WarehouseStock[] } {
    const rows = this.db.query<WarehouseStock>(`
      SELECT ws.*, w.name as warehouseName,
             p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
             p.meters_per_box as metersPerBox,
             p.pieces_per_box as piecesPerBox
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE ws.product_id = ?
    `, [productId]);

    let totalM2 = 0;
    let totalBoxes = 0;
    let totalPieces = 0;

    const mapped = rows.map(r => {
      const isGeneral = (r as any).productType === 'GENERAL';
      const metersPerBox = (r as any).metersPerBox || 1.44;
      const piecesPerBox = (r as any).piecesPerBox || 1;
      const boxes = isGeneral
        ? (r as any).baseUnit === 'BOX' ? r.quantityM2 : 0
        : Number((r.quantityM2 / metersPerBox).toFixed(2));
      const pieces = isGeneral
        ? (r as any).baseUnit === 'PIECE' ? r.quantityM2 : 0
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
}
