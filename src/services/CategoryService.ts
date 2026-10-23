import { DatabaseManager } from '../database/db';
import type { Category } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';

export interface CategoryWithCount extends Category {
  productCount: number;
  children?: CategoryWithCount[];
}

export class CategoryService {
  private db = DatabaseManager.getInstance();

  public getAllCategories(): CategoryWithCount[] {
    const rows = this.db.query<any>(`
      SELECT 
        c.*,
        COALESCE(pc.product_count, 0) as productCount
      FROM categories c
      LEFT JOIN (
        SELECT category_id, COUNT(*) as product_count
        FROM products WHERE is_active = 1
        GROUP BY category_id
      ) pc ON c.id = pc.category_id
      ORDER BY c.name ASC
    `);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId,
      description: r.description,
      createdAt: r.createdAt,
      productCount: r.productCount || 0
    }));
  }

  public getCategoryById(id: string): Category | null {
    const rows = this.db.query<Category>('SELECT * FROM categories WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public createCategory(name: string, parentId?: string, description?: string): Category {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'categories.create');

    const existing = this.db.query('SELECT id FROM categories WHERE name = ?', [name]);
    if (existing.length > 0) {
      throw new Error('اسم التصنيف مسجل مسبقاً.');
    }

    const id = `cat_${uuidv4().substring(0, 8)}`;
    this.db.run(
      'INSERT INTO categories (id, name, parent_id, description) VALUES (?, ?, ?, ?)',
      [id, name, parentId || null, description || null]
    );

    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, 'إضافة تصنيف جديد', 'PRODUCTS', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ name, parentId, description })]
    );

    return { id, name, parentId: parentId || null, description, createdAt: new Date().toISOString() };
  }

  public updateCategory(id: string, updates: { name?: string; parentId?: string | null; description?: string }): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'categories.update');

    const old = this.getCategoryById(id);
    if (!old) throw new Error('التصنيف غير موجود.');

    if (updates.name && updates.name !== old.name) {
      const dup = this.db.query('SELECT id FROM categories WHERE name = ? AND id != ?', [updates.name, id]);
      if (dup.length > 0) throw new Error('اسم التصنيف مسجل مسبقاً.');
    }

    this.db.run(
      `UPDATE categories SET 
        name = COALESCE(?, name),
        parent_id = ?,
        description = COALESCE(?, description)
       WHERE id = ?`,
      [updates.name || null, updates.parentId !== undefined ? updates.parentId : old.parentId, updates.description !== undefined ? updates.description : old.description, id]
    );

    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
       VALUES (?, ?, ?, 'تعديل تصنيف', 'PRODUCTS', ?, ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(old), JSON.stringify(updates)]
    );
  }

  public deleteCategory(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'categories.delete');

    const category = this.getCategoryById(id);
    if (!category) throw new Error('التصنيف غير موجود.');

    const childCount = this.db.query('SELECT COUNT(*) as cnt FROM categories WHERE parent_id = ?', [id])[0] as any;
    if (childCount && childCount.cnt > 0) {
      throw new Error('لا يمكن حذف تصنيف يحتوي على تصنيفات فرعية.');
    }

    const productCount = this.db.query('SELECT COUNT(*) as cnt FROM products WHERE category_id = ?', [id])[0] as any;
    if (productCount && productCount.cnt > 0) {
      throw new Error('لا يمكن حذف تصنيف مرتبط بمنتجات. قم بتعديل أو حذف المنتجات أولاً.');
    }

    this.db.run('DELETE FROM categories WHERE id = ?', [id]);

    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values)
       VALUES (?, ?, ?, 'حذف تصنيف', 'PRODUCTS', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(category)]
    );
  }
}

