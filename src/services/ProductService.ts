import { DatabaseManager } from '../database/db';
import type { Product, WarehouseStock, InventoryTransaction } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class ProductService {
  private db = DatabaseManager.getInstance();

  public getAllProducts(search?: string, categoryId?: string, brandId?: string): Product[] {
    let sql = `
      SELECT p.*, c.name as categoryName, b.name as brandName
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.is_active = 1
    `;
    const params: any[] = [];

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

  public getProductById(id: string): Product | null {
    const rows = this.db.query<Product>(`
      SELECT p.*, c.name as categoryName, b.name as brandName
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.id = ?
    `, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public getProductByBarcode(barcode: string): Product | null {
    const rows = this.db.query<Product>(`
      SELECT p.*, c.name as categoryName, b.name as brandName
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE (p.barcode = ? OR p.sku = ?) AND p.is_active = 1
    `, [barcode, barcode]);
    return rows.length > 0 ? rows[0] : null;
  }

  public createProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>, initialStock?: { warehouseId: string; quantityM2: number; unitCost: number }, performedBy = 'usr_admin'): Product {
    const id = `prod_${uuidv4().substring(0, 8)}`;
    
    // Check barcode uniqueness
    const existing = this.db.query(`SELECT id FROM products WHERE barcode = ? OR sku = ?`, [product.barcode, product.sku]);
    if (existing.length > 0) {
      throw new Error(`الباركود (${product.barcode}) أو الكود (${product.sku}) مستخدم بالفعل لمنتج آخر.`);
    }

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`
        INSERT INTO products (
          id, sku, barcode, name, category_id, brand_id, grade, size,
          thickness, color, finish, surface_location, base_unit, sell_unit,
          pieces_per_box, meters_per_box, weight_per_box, cost_price,
          selling_price_m2, selling_price_box, wholesale_price_m2, min_selling_price_m2,
          min_stock_level, max_stock_level, image_path, notes, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, product.sku, product.barcode, product.name, product.categoryId, product.brandId,
        product.grade, product.size, product.thickness || 0, product.color || '', product.finish || '',
        product.surfaceLocation || 'FLOOR', product.baseUnit || 'M2', product.sellUnit || 'M2',
        product.piecesPerBox || 4, product.metersPerBox || 1.44, product.weightPerBox || 0,
        product.costPrice || 0, product.sellingPriceM2 || 0, product.sellingPriceBox || 0,
        product.wholesalePriceM2 || 0, product.minSellingPriceM2 || 0, product.minStockLevel || 10,
        product.maxStockLevel || 1000, product.imagePath || '', product.notes || '', 1
      ]);

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
          Number((initialStock.quantityM2 / (product.metersPerBox || 1.44)).toFixed(2)),
          initialStock.unitCost || product.costPrice,
          (initialStock.quantityM2 * (initialStock.unitCost || product.costPrice)),
          performedBy
        ]);
      }

      // Log Audit
      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, 'المدير', 'إضافة صنف سيراميك جديد', 'PRODUCTS', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, id, JSON.stringify(product)]);

      return this.getProductById(id)!;
    });
  }

  public updateProduct(id: string, updates: Partial<Product>, performedBy = 'usr_admin'): Product {
    const existing = this.getProductById(id);
    if (!existing) throw new Error('المنتج غير موجود.');

    const sql = `
      UPDATE products SET
        name = COALESCE(?, name),
        sku = COALESCE(?, sku),
        barcode = COALESCE(?, barcode),
        category_id = COALESCE(?, category_id),
        brand_id = COALESCE(?, brand_id),
        grade = COALESCE(?, grade),
        size = COALESCE(?, size),
        thickness = COALESCE(?, thickness),
        color = COALESCE(?, color),
        finish = COALESCE(?, finish),
        surface_location = COALESCE(?, surface_location),
        pieces_per_box = COALESCE(?, pieces_per_box),
        meters_per_box = COALESCE(?, meters_per_box),
        cost_price = COALESCE(?, cost_price),
        selling_price_m2 = COALESCE(?, selling_price_m2),
        selling_price_box = COALESCE(?, selling_price_box),
        wholesale_price_m2 = COALESCE(?, wholesale_price_m2),
        min_selling_price_m2 = COALESCE(?, min_selling_price_m2),
        min_stock_level = COALESCE(?, min_stock_level),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    return this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(sql, [
        updates.name ?? null, updates.sku ?? null, updates.barcode ?? null, updates.categoryId ?? null, updates.brandId ?? null,
        updates.grade ?? null, updates.size ?? null, updates.thickness ?? null, updates.color ?? null, updates.finish ?? null,
        updates.surfaceLocation ?? null, updates.piecesPerBox ?? null, updates.metersPerBox ?? null,
        updates.costPrice ?? null, updates.sellingPriceM2 ?? null, updates.sellingPriceBox ?? null,
        updates.wholesalePriceM2 ?? null, updates.minSellingPriceM2 ?? null, updates.minStockLevel ?? null,
        updates.notes ?? null, id
      ]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
        VALUES (?, ?, 'المدير', 'تعديل بيانات صنف', 'PRODUCTS', ?, ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, id, JSON.stringify(existing), JSON.stringify(updates)]);

      return this.getProductById(id)!;
    });
  }

  public deleteProduct(id: string, performedBy = 'usr_admin'): void {
    // Soft delete product & check relations
    const hasSales = this.db.query(`SELECT id FROM sales_invoice_items WHERE product_id = ? LIMIT 1`, [id]);
    if (hasSales.length > 0) {
      // Deactivate only to preserve accounting history
      this.db.run(`UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    } else {
      this.db.run(`DELETE FROM products WHERE id = ?`, [id]);
    }

    this.db.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id)
      VALUES (?, ?, 'المدير', 'حذف/تعطيل صنف', 'PRODUCTS', ?)
    `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, id]);
  }

  public getProductStockSummary(productId: string): { totalM2: number; totalBoxes: number; byWarehouse: WarehouseStock[] } {
    const rows = this.db.query<WarehouseStock>(`
      SELECT ws.*, w.name as warehouseName, p.meters_per_box as metersPerBox
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE ws.product_id = ?
    `, [productId]);

    let totalM2 = 0;
    let totalBoxes = 0;

    const mapped = rows.map(r => {
      const metersPerBox = (r as any).metersPerBox || 1.44;
      const boxes = Number((r.quantityM2 / metersPerBox).toFixed(2));
      totalM2 += r.quantityM2;
      totalBoxes += boxes;
      return {
        ...r,
        quantityBoxes: boxes,
        availableM2: r.quantityM2 - (r.reservedM2 || 0)
      };
    });

    return {
      totalM2: Number(totalM2.toFixed(2)),
      totalBoxes: Number(totalBoxes.toFixed(2)),
      byWarehouse: mapped
    };
  }
}
