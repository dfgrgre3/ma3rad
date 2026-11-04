import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';

const PRODUCT_FORM_FIELDS = new Set([
  'productType', 'name', 'categoryId', 'brandId', 'grade', 'size', 'thickness',
  'color', 'tone', 'finish', 'surfaceLocation', 'baseUnit', 'sellUnit',
  'customUnit', 'piecesPerBox', 'metersPerBox', 'weightPerBox', 'costPrice',
  'sellingPriceM2', 'sellingPriceBox', 'wholesalePriceM2', 'minSellingPriceM2',
  'minStockLevel', 'maxStockLevel', 'notes',
]);

const isAllowedField = (field: string) =>
  PRODUCT_FORM_FIELDS.has(field) || /^attribute:[A-Za-z0-9_-]+$/.test(field);

export class ProductFormPreferencesService {
  private readonly db = DatabaseManager.getInstance();

  public getPreferences(): Record<string, string | number> {
    const user = AuthService.requireAuth();
    const rows = this.db.query<{ fieldKey: string; valueJson: string }>(
      'SELECT field_key, value_json FROM product_form_field_preferences WHERE user_id = ?',
      [user.id],
    );
    const preferences: Record<string, string | number> = {};
    for (const row of rows) {
      if (!isAllowedField(row.fieldKey)) continue;
      try {
        const value: unknown = JSON.parse(row.valueJson);
        if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
          preferences[row.fieldKey] = value;
        }
      } catch (error) {
        console.error(`تعذر قراءة القيمة المحفوظة للخانة ${row.fieldKey}:`, error);
      }
    }
    return preferences;
  }

  public saveField(field: string, value: string | number): void {
    if (!isAllowedField(field)) throw new Error('هذه الخانة لا تدعم حفظ قيمة افتراضية.');
    if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error('قيمة الخانة غير صالحة للحفظ.');
    }
    const user = AuthService.requireAuth();
    this.db.run(`
      INSERT INTO product_form_field_preferences (user_id, field_key, value_json, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, field_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = CURRENT_TIMESTAMP
    `, [user.id, field, JSON.stringify(value)]);
  }

  public clearField(field: string): void {
    if (!isAllowedField(field)) throw new Error('هذه الخانة لا تدعم حفظ قيمة افتراضية.');
    const user = AuthService.requireAuth();
    this.db.run(
      'DELETE FROM product_form_field_preferences WHERE user_id = ? AND field_key = ?',
      [user.id, field],
    );
  }

  public replacePreferences(preferences: Record<string, string | number>): void {
    const user = AuthService.requireAuth();
    for (const [field, value] of Object.entries(preferences)) {
      if (!isAllowedField(field)) throw new Error(`الخانة ${field} لا تدعم حفظ قيمة افتراضية.`);
      if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error(`قيمة الخانة ${field} غير صالحة للحفظ.`);
      }
    }

    this.db.executeTransaction((db) => {
      db.run('DELETE FROM product_form_field_preferences WHERE user_id = ?', [user.id]);
      for (const [field, value] of Object.entries(preferences)) {
        db.run(`
          INSERT INTO product_form_field_preferences (user_id, field_key, value_json, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `, [user.id, field, JSON.stringify(value)]);
      }
    });
  }

  public getTones(): string[] {
    AuthService.requireAuth();
    return this.db.query<{ tone: string }>(
      'SELECT tone FROM product_tone_options ORDER BY tone COLLATE NOCASE',
    ).map(({ tone }) => tone);
  }

  public addTone(tone: string): string {
    const value = tone.trim();
    if (!value) throw new Error('أدخل اسم التون.');
    if (value.length > 80) throw new Error('يجب ألا يتجاوز اسم التون 80 حرفًا.');
    AuthService.requireAuth();
    const existing = this.db.query<{ tone: string }>(
      'SELECT tone FROM product_tone_options WHERE tone = ? COLLATE NOCASE',
      [value],
    )[0];
    if (existing) throw new Error('هذا التون موجود بالفعل.');
    this.db.run('INSERT INTO product_tone_options (tone) VALUES (?)', [value]);
    return value;
  }

  public deleteTone(tone: string): void {
    AuthService.requireAuth();
    this.db.executeTransaction((db) => {
      db.run('DELETE FROM product_tone_options WHERE tone = ? COLLATE NOCASE', [tone]);
      db.run(`
        DELETE FROM product_form_field_preferences
        WHERE field_key = 'tone' AND value_json = ?
      `, [JSON.stringify(tone)]);
    });
  }
}
