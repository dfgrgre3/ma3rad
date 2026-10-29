import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import {
  normalizeDynamicAttributeValue,
  type DynamicAttributeDefinition,
} from './dynamicAttributes';

export interface ProductVariant {
  id: string;
  parentProductId: string;
  sku: string;
  barcode?: string;
  variantName: string;
  color?: string;
  size?: string;
  grade?: string;
  costPrice: number;
  sellingPriceM2: number;
  isActive: boolean;
  createdAt: string;
}

export interface ProductImage {
  id: string;
  productId: string;
  filePath: string;
  caption?: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface ProductDocument {
  id: string;
  productId: string;
  filePath: string;
  fileName: string;
  documentType: string;
  uploadedBy?: string;
  createdAt: string;
}

export class ProductExtraService {
  private db = DatabaseManager.getInstance();

  private requireWrite(): void {
    PermissionService.require(AuthService.requireAuth(), 'products.update');
  }

  public getVariants(productId: string): ProductVariant[] {
    return this.db.query<ProductVariant>(
      `SELECT * FROM product_variants WHERE parent_product_id = ? ORDER BY created_at DESC`,
      [productId]
    );
  }

  public createVariant(productId: string, data: Omit<ProductVariant, 'id' | 'parentProductId' | 'createdAt' | 'costPrice' | 'sellingPriceM2'> & {
    costPrice?: number;
    sellingPriceM2?: number;
  }): ProductVariant {
    this.requireWrite();
    if (data.costPrice !== undefined || data.sellingPriceM2 !== undefined) {
      PermissionService.require(AuthService.requireAuth(), 'pricing.update');
    }
    const duplicate = this.db.query(
      `SELECT id FROM product_variants WHERE sku = ? OR (barcode IS NOT NULL AND barcode = ?)`,
      [data.sku, data.barcode || '']
    );
    if (duplicate.length > 0) throw new Error('كود أو باركود المتغير مستخدم بالفعل.');

    const id = `var_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO product_variants
       (id, parent_product_id, sku, barcode, variant_name, color, size, grade, cost_price, selling_price_m2, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, productId, data.sku, data.barcode || null, data.variantName,
        data.color || null, data.size || null, data.grade || null,
        data.costPrice || 0, data.sellingPriceM2 || 0, data.isActive ? 1 : 0,
      ]
    );
    return this.getVariants(productId).find((v) => v.id === id)!;
  }

  public updateVariant(id: string, updates: Partial<ProductVariant>): void {
    this.requireWrite();
    if (updates.costPrice !== undefined || updates.sellingPriceM2 !== undefined) {
      PermissionService.require(AuthService.requireAuth(), 'pricing.update');
    }
    this.db.run(
      `UPDATE product_variants SET
        variant_name = COALESCE(?, variant_name),
        color = COALESCE(?, color),
        size = COALESCE(?, size),
        grade = COALESCE(?, grade),
        cost_price = COALESCE(?, cost_price),
        selling_price_m2 = COALESCE(?, selling_price_m2),
        is_active = COALESCE(?, is_active)
      WHERE id = ?`,
      [
        updates.variantName ?? null, updates.color ?? null, updates.size ?? null,
        updates.grade ?? null, updates.costPrice ?? null, updates.sellingPriceM2 ?? null,
        updates.isActive === undefined ? null : (updates.isActive ? 1 : 0), id,
      ]
    );
  }

  public deleteVariant(id: string): void {
    this.requireWrite();
    this.db.run(`DELETE FROM product_variants WHERE id = ?`, [id]);
  }

  public getImages(productId: string): ProductImage[] {
    return this.db.query<ProductImage>(
      `SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC, created_at DESC`,
      [productId]
    );
  }

  public addImage(productId: string, filePath: string, caption?: string): ProductImage {
    this.requireWrite();
    const existing = this.db.query(`SELECT id FROM product_images WHERE product_id = ?`, [productId]);
    const id = `img_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO product_images (id, product_id, file_path, caption, is_primary, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, productId, filePath, caption || null, existing.length === 0 ? 1 : 0, existing.length]
    );
    return this.getImages(productId).find((i) => i.id === id)!;
  }

  public setPrimaryImage(productId: string, id: string): void {
    this.requireWrite();
    this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`UPDATE product_images SET is_primary = 0 WHERE product_id = ?`, [productId]);
      sqliteDb.run(`UPDATE product_images SET is_primary = 1 WHERE id = ? AND product_id = ?`, [id, productId]);
    });
  }

  public deleteImage(id: string): void {
    this.requireWrite();
    this.db.run(`DELETE FROM product_images WHERE id = ?`, [id]);
  }

  public getAttributeValues(productId: string): Record<string, string> {
    const rows = this.db.query<{ attributeId: string; value: string }>(
      `SELECT attribute_id as attributeId, value FROM product_attribute_values WHERE product_id = ?`,
      [productId]
    );
    return rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.attributeId] = row.value;
      return acc;
    }, {});
  }

  public setAttributeValues(productId: string, values: Record<string, string>): void {
    this.requireWrite();
    const definitions = this.db.query<DynamicAttributeDefinition>(
      `SELECT a.id, a.name, a.data_type AS dataType, a.unit,
              a.is_required AS isRequired, a.is_filterable AS isFilterable,
              a.applies_to_category_id AS appliesToCategoryId
       FROM attributes a
       WHERE a.applies_to_category_id IS NULL
          OR a.applies_to_category_id = (
            SELECT category_id FROM products WHERE id = ?
          )`,
      [productId]
    ).map((definition) => ({
      ...definition,
      isRequired: Boolean(definition.isRequired),
      isFilterable: Boolean(definition.isFilterable),
      values: this.db.query<{ value: string; label: string }>(
        `SELECT value, label FROM attribute_options WHERE attribute_id = ? ORDER BY sort_order, label`,
        [definition.id]
      ),
    }));
    const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
    const normalized = new Map<string, string>();
    for (const [attributeId, rawValue] of Object.entries(values || {})) {
      const definition = definitionsById.get(attributeId);
      if (!definition) {
        if (rawValue?.trim()) throw new Error('تتضمن قيم الخصائص حقلًا غير متاح لهذا الصنف.');
        continue;
      }
      const value = normalizeDynamicAttributeValue(definition, rawValue);
      if (value !== null) normalized.set(attributeId, value);
    }
    for (const definition of definitions) {
      if (definition.isRequired && !normalized.has(definition.id)) {
        throw new Error(`الخاصية «${definition.name}» مطلوبة.`);
      }
    }

    this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run(`DELETE FROM product_attribute_values WHERE product_id = ?`, [productId]);
      normalized.forEach((value, attributeId) => {
        sqliteDb.run(
          `INSERT INTO product_attribute_values (id, product_id, attribute_id, value) VALUES (?, ?, ?, ?)`,
          [`pav_${uuidv4().substring(0, 8)}`, productId, attributeId, value]
        );
      });
    });
  }

  public getDocuments(productId: string): ProductDocument[] {
    return this.db.query<ProductDocument>(
      `SELECT * FROM product_documents WHERE product_id = ? ORDER BY created_at DESC`,
      [productId]
    );
  }

  public addDocument(
    productId: string,
    filePath: string,
    fileName: string,
    documentType: string
  ): ProductDocument {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'documents.create');
    const id = `doc_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO product_documents (id, product_id, file_path, file_name, document_type, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, productId, filePath, fileName, documentType || 'OTHER', actor.id]
    );
    return this.getDocuments(productId).find((d) => d.id === id)!;
  }

  public deleteDocument(id: string): void {
    PermissionService.require(AuthService.requireAuth(), 'documents.archive');
    this.db.run(`DELETE FROM product_documents WHERE id = ?`, [id]);
  }
}
