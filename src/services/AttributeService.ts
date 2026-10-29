import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import type { DynamicAttributeDataType } from './dynamicAttributes';

export interface AttributeCategory {
  id: string;
  code: string;
  name: string;
  dataType: DynamicAttributeDataType;
  unit?: string | null;
  isRequired: boolean;
  isFilterable: boolean;
  appliesToCategoryId?: string | null;
  values: Array<{ id: string; value: string; label: string }>;
}

export class AttributeService {
  private db = DatabaseManager.getInstance();

  public getCategories(): AttributeCategory[] {
    const attrs = this.db.query<any>(`SELECT * FROM attributes ORDER BY sort_order, name`);
    const options = this.db.query<any>(`SELECT * FROM attribute_options ORDER BY sort_order, label`);
    return attrs.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      dataType: a.dataType,
      unit: a.unit,
      isRequired: Boolean(a.isRequired),
      isFilterable: Boolean(a.isFilterable),
      appliesToCategoryId: a.appliesToCategoryId || null,
      values: options
        .filter((o) => o.attributeId === a.id)
        .map((o) => ({ id: o.id, value: o.value, label: o.label })),
    }));
  }

  public addValue(attributeId: string, label: string): void {
    PermissionService.require(AuthService.requireAuth(), 'products.update');
    const clean = label.trim();
    if (!clean) throw new Error('القيمة مطلوبة.');
    const dup = this.db.query(
      `SELECT id FROM attribute_options WHERE attribute_id = ? AND (value = ? OR label = ?)`,
      [attributeId, clean, clean]
    )[0];
    if (dup) throw new Error('هذه القيمة موجودة بالفعل.');
    this.db.run(
      `INSERT INTO attribute_options (id, attribute_id, value, label, sort_order)
       VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM attribute_options WHERE attribute_id = ?))`,
      [`attr_opt_${uuidv4().substring(0, 8)}`, attributeId, clean, clean, attributeId]
    );
  }

  public removeValue(optionId: string): void {
    PermissionService.require(AuthService.requireAuth(), 'products.update');
    const option = this.db.query<{ attributeId: string; value: string }>(
      `SELECT attribute_id AS attributeId, value FROM attribute_options WHERE id = ?`, [optionId]
    )[0];
    if (!option) return;
    const used = this.db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM product_attribute_values WHERE attribute_id = ? AND value = ?`,
      [option.attributeId, option.value]
    )[0]?.c || 0;
    if (used > 0) throw new Error('لا يمكن حذف قيمة مستخدمة في منتجات مسجلة.');
    this.db.run(`DELETE FROM attribute_options WHERE id = ?`, [optionId]);
  }

  public addCategory(input: {
    name: string;
    code: string;
    dataType?: DynamicAttributeDataType;
    unit?: string;
    isRequired?: boolean;
    isFilterable?: boolean;
    options?: string[];
  }): void {
    PermissionService.require(AuthService.requireAuth(), 'products.create');
    const name = input.name.trim();
    const code = input.code.trim();
    if (!name || !code) throw new Error('اسم ورمز الخاصية مطلوبان.');
    const dataType = input.dataType || 'SELECT';
    const validDataTypes = new Set<DynamicAttributeDataType>([
      'TEXT', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'DATE',
    ]);
    if (!validDataTypes.has(dataType)) throw new Error('نوع بيانات الخاصية غير مدعوم.');
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) throw new Error('رمز الخاصية يجب أن يحتوي أحرفًا إنجليزية كبيرة وأرقامًا وشرطة سفلية فقط.');
    const options = [...new Set((input.options || []).map((value) => value.trim()).filter(Boolean))];
    if (options.length > 0 && !['SELECT', 'MULTI_SELECT'].includes(dataType)) {
      throw new Error('القيم الاختيارية متاحة فقط لحقول الاختيار.');
    }
    const dup = this.db.query(`SELECT id FROM attributes WHERE code = ?`, [input.code.trim()])[0];
    if (dup) throw new Error('رمز الخاصية مستخدم بالفعل.');
    const id = `attr_${uuidv4().substring(0, 8)}`;
    this.db.executeTransaction((tx) => {
      tx.run(
        `INSERT INTO attributes
          (id, code, name, data_type, unit, is_required, is_filterable, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM attributes))`,
        [id, code, name, dataType, input.unit?.trim() || null, input.isRequired ? 1 : 0, input.isFilterable === false ? 0 : 1]
      );
      options.forEach((value, index) => {
        tx.run(
          `INSERT INTO attribute_options (id, attribute_id, value, label, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [`attr_opt_${uuidv4().substring(0, 8)}`, id, value, value, index]
        );
      });
    });
  }
}
