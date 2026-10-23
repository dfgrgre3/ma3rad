import { DatabaseManager } from '../database/db';
import type { Brand } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';

export interface BrandWithCount extends Brand {
  productCount: number;
}

export class BrandService {
  private db = DatabaseManager.getInstance();

  public getAllBrands(): BrandWithCount[] {
    const rows = this.db.query<any>(`
      SELECT 
        b.*,
        COALESCE(pc.product_count, 0) as productCount
      FROM brands b
      LEFT JOIN (
        SELECT brand_id, COUNT(*) as product_count
        FROM products WHERE is_active = 1
        GROUP BY brand_id
      ) pc ON b.id = pc.brand_id
      ORDER BY b.name ASC
    `);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      country: r.country,
      createdAt: r.createdAt,
      productCount: r.productCount || 0
    }));
  }

  public getBrandById(id: string): Brand | null {
    const rows = this.db.query<Brand>('SELECT * FROM brands WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public createBrand(name: string, country?: string): Brand {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'brands.create');

    const existing = this.db.query('SELECT id FROM brands WHERE name = ?', [name]);
    if (existing.length > 0) {
      throw new Error('اسم الماركة مسجل مسبقاً.');
    }

    const id = `br_${uuidv4().substring(0, 8)}`;
    this.db.run(
      'INSERT INTO brands (id, name, country) VALUES (?, ?, ?)',
      [id, name, country || null]
    );

    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, 'إضافة ماركة جديدة', 'PRODUCTS', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ name, country })]
    );

    return { id, name, country, createdAt: new Date().toISOString() };
  }

  public updateBrand(id: string, updates: { name?: string; country?: string }): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'brands.update');

    const old = this.getBrandById(id);
    if (!old) throw new Error('الماركة غير موجودة.');

    if (updates.name && updates.name !== old.name) {
      const dup = this.db.query('SELECT id FROM brands WHERE name = ? AND id != ?', [updates.name, id]);
      if (dup.length > 0) throw new Error('اسم الماركة مسجل مسبقاً.');
    }

    this.db.run(
      `UPDATE brands SET 
        name = COALESCE(?, name),
        country = COALESCE(?, country)
       WHERE id = ?`,
      [updates.name || null, updates.country !== undefined ? updates.country : old.country, id]
    );

    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
       VALUES (?, ?, ?, 'تعديل ماركة', 'PRODUCTS', ?, ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(old), JSON.stringify(updates)]
    );
  }

  public deleteBrand(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'brands.delete');

    const brand = this.getBrandById(id);
    if (!brand) throw new Error('الماركة غير موجودة.');

    const productCount = this.db.query('SELECT COUNT(*) as cnt FROM products WHERE brand_id = ?', [id])[0] as any;
    if (productCount && productCount.cnt > 0) {
      throw new Error('لا يمكن حذف ماركة مرتبط بمنتجات. قم بتعديل أو حذف المنتجات أولاً.');
    }

    this.db.run('DELETE FROM brands WHERE id = ?', [id]);

    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values)
       VALUES (?, ?, ?, 'حذف ماركة', 'PRODUCTS', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(brand)]
    );
  }
}

