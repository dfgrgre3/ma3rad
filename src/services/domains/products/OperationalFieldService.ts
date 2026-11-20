import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { MasterDataSyncService } from '../../../sync/MasterDataSyncService';
import {
  normalizeDynamicAttributeValue,
  type DynamicAttributeDataType,
  type DynamicAttributeDefinition,
} from './dynamicAttributes';

export interface OperationalEntityType {
  value: string;
  label: string;
  permission: string;
}

export interface OperationalFieldOption {
  id: string;
  value: string;
  label: string;
}

export interface OperationalFieldDefinition extends DynamicAttributeDefinition {
  entityType: string;
  code: string;
  sortOrder: number;
  values: OperationalFieldOption[];
}

export interface ProductGradeOption {
  value: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
}

export const OPERATIONAL_ENTITY_TYPES: OperationalEntityType[] = [
  { value: 'products', label: 'الأصناف', permission: 'products.update' },
  { value: 'customers', label: 'العملاء', permission: 'customers.update' },
  { value: 'suppliers', label: 'الموردون', permission: 'suppliers.update' },
  { value: 'sales_invoices', label: 'فواتير البيع', permission: 'sales.update' },
  { value: 'sales_returns', label: 'مرتجعات البيع', permission: 'returns.create' },
  { value: 'quotations', label: 'عروض الأسعار', permission: 'quotations.update' },
  { value: 'orders', label: 'طلبات العملاء', permission: 'orders.update' },
  { value: 'purchase_invoices', label: 'فواتير الشراء', permission: 'purchases.update' },
  { value: 'purchase_orders', label: 'أوامر الشراء', permission: 'purchases.update' },
  { value: 'purchase_returns', label: 'مرتجعات الشراء', permission: 'purchases.return' },
  { value: 'projects', label: 'المشروعات', permission: 'projects.update' },
  { value: 'leads', label: 'الفرص والعملاء المحتملون', permission: 'crm.leads.update' },
  { value: 'employees', label: 'الموظفون', permission: 'employees.manage' },
  { value: 'vehicles', label: 'المركبات', permission: 'vehicles.update' },
  { value: 'warehouses', label: 'المخازن', permission: 'warehouses.manage' },
  { value: 'branches', label: 'الفروع', permission: 'branches.manage' },
];

const FIELD_TYPES = new Set<DynamicAttributeDataType>([
  'TEXT', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'DATE',
]);

export class OperationalFieldService {
  private readonly db = DatabaseManager.getInstance();
  private readonly sync = new MasterDataSyncService(this.db);
  private readonly branchAccess = new BranchAccessService();

  private getEntity(entityType: string): OperationalEntityType {
    const entity = OPERATIONAL_ENTITY_TYPES.find((item) => item.value === entityType);
    if (!entity) throw new Error('نوع السجل غير مدعوم للحقول الإضافية.');
    return entity;
  }

  // operational_field_values is polymorphic; entityType is already
  // validated against OPERATIONAL_ENTITY_TYPES (real table names).
  private resolveRecordBranchId(entityType: string, recordId: string): string | null {
    if (!/^[a-z_]+$/.test(entityType)) return null;
    const hasBranch = this.db.query<{ name: string }>(
      `SELECT name FROM pragma_table_info('${entityType}') WHERE name = 'branch_id'`,
    ).length > 0;
    if (!hasBranch) return null;
    return this.db.query<{ branchId: string | null }>(
      `SELECT branch_id AS branchId FROM "${entityType}" WHERE id = ?`,
      [recordId],
    )[0]?.branchId ?? null;
  }

  private requireDefinitionManagement(): void {
    PermissionService.require(AuthService.requireAuth(), 'products.attributes.manage');
  }

  public getEntityTypes(): OperationalEntityType[] {
    return OPERATIONAL_ENTITY_TYPES.slice();
  }

  public getDefinitions(entityType: string): OperationalFieldDefinition[] {
    this.getEntity(entityType);
    const definitions = this.db.query<any>(
      `SELECT id, entity_type AS entityType, code, name, data_type AS dataType,
              unit, is_required AS isRequired, is_filterable AS isFilterable, sort_order AS sortOrder
       FROM operational_field_definitions
       WHERE entity_type = ?
       ORDER BY sort_order, name`,
      [entityType],
    );
    const options = this.db.query<any>(
      `SELECT id, field_id AS fieldId, value, label
       FROM operational_field_options ORDER BY sort_order, label`,
    );
    return definitions.map((definition) => ({
      ...definition,
      isRequired: Boolean(definition.isRequired),
      isFilterable: Boolean(definition.isFilterable),
      values: options.filter((option) => option.fieldId === definition.id)
        .map(({ id, value, label }: OperationalFieldOption) => ({ id, value, label })),
    }));
  }

  public addDefinition(input: {
    entityType: string;
    code: string;
    name: string;
    dataType: DynamicAttributeDataType;
    unit?: string;
    isRequired?: boolean;
    isFilterable?: boolean;
    options?: string[];
  }): string {
    this.requireDefinitionManagement();
    this.getEntity(input.entityType);
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!name || !/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) {
      throw new Error('أدخل اسمًا ورمزًا ثابتًا صالحًا للحقل.');
    }
    if (!FIELD_TYPES.has(input.dataType)) throw new Error('نوع بيانات الحقل غير مدعوم.');
    const options = [...new Set((input.options || []).map((value) => value.trim()).filter(Boolean))];
    if (options.length && !['SELECT', 'MULTI_SELECT'].includes(input.dataType)) {
      throw new Error('خيارات الحقل متاحة فقط لحقول الاختيار.');
    }
    if (['SELECT', 'MULTI_SELECT'].includes(input.dataType) && options.length === 0) {
      throw new Error('أدخل خيارًا واحدًا على الأقل لحقول الاختيار.');
    }
    const duplicate = this.db.query(
      'SELECT id FROM operational_field_definitions WHERE entity_type = ? AND code = ?',
      [input.entityType, code],
    )[0];
    if (duplicate) throw new Error('رمز الحقل مستخدم بالفعل لهذا النوع من السجلات.');
    const id = `op_field_${uuidv4().slice(0, 12)}`;
    this.db.executeTransaction((tx) => {
      tx.run(
        `INSERT INTO operational_field_definitions
         (id, entity_type, code, name, data_type, unit, is_required, is_filterable, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1
           FROM operational_field_definitions WHERE entity_type = ?))`,
        [id, input.entityType, code, name, input.dataType, input.unit?.trim() || null,
          input.isRequired ? 1 : 0, input.isFilterable === false ? 0 : 1, input.entityType],
      );
      options.forEach((value, index) => tx.run(
        `INSERT INTO operational_field_options(id, field_id, value, label, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [`op_opt_${uuidv4().slice(0, 12)}`, id, value, value, index],
      ));
      this.sync.capture(tx, 'operational_field', id, 'CREATE');
      tx.query<{ id: string }>(
        'SELECT id FROM operational_field_options WHERE field_id = ? ORDER BY sort_order', [id],
      ).forEach((option) => this.sync.capture(tx, 'operational_field_option', option.id, 'CREATE'));
    });
    return id;
  }

  /**
   * Idempotently seeds field definitions declared by business activity
   * profiles. Unlike addDefinition this is a system-level operation: it does
   * not require the field-management permission and never overwrites fields
   * the tenant already created (matched by entity_type + code).
   */
  public ensureSeedDefinitions(
    definitions: Array<{
      entityType: string;
      code: string;
      name: string;
      dataType: DynamicAttributeDataType;
      unit?: string;
      isRequired?: boolean;
      isFilterable?: boolean;
      options?: string[];
    }>,
  ): { created: string[]; existing: string[] } {
    const created: string[] = [];
    const existing: string[] = [];
    this.db.executeTransaction((tx) => {
      for (const input of definitions) {
        this.getEntity(input.entityType);
        const code = input.code.trim().toUpperCase();
        const name = input.name.trim();
        if (!name || !/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) continue;
        if (!FIELD_TYPES.has(input.dataType)) continue;
        const options = [...new Set((input.options || []).map((value) => value.trim()).filter(Boolean))];
        if (options.length && !['SELECT', 'MULTI_SELECT'].includes(input.dataType)) continue;
        if (['SELECT', 'MULTI_SELECT'].includes(input.dataType) && options.length === 0) continue;
        const duplicate = tx.query(
          'SELECT id FROM operational_field_definitions WHERE entity_type = ? AND code = ?',
          [input.entityType, code],
        )[0];
        if (duplicate) {
          existing.push(code);
          continue;
        }
        const id = `op_field_${uuidv4().slice(0, 12)}`;
        tx.run(
          `INSERT INTO operational_field_definitions
           (id, entity_type, code, name, data_type, unit, is_required, is_filterable, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1
             FROM operational_field_definitions WHERE entity_type = ?))`,
          [id, input.entityType, code, name, input.dataType, input.unit?.trim() || null,
            input.isRequired ? 1 : 0, input.isFilterable === false ? 0 : 1, input.entityType],
        );
        options.forEach((value, index) => tx.run(
          `INSERT INTO operational_field_options(id, field_id, value, label, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [`op_opt_${uuidv4().slice(0, 12)}`, id, value, value, index],
        ));
        this.sync.capture(tx, 'operational_field', id, 'CREATE');
        tx.query<{ id: string }>(
          'SELECT id FROM operational_field_options WHERE field_id = ? ORDER BY sort_order', [id],
        ).forEach((option) => this.sync.capture(tx, 'operational_field_option', option.id, 'CREATE'));
        created.push(code);
      }
    });
    return { created, existing };
  }

  public updateDefinition(id: string, updates: {
    name?: string;
    unit?: string | null;
    isRequired?: boolean;
    isFilterable?: boolean;
  }): void {
    this.requireDefinitionManagement();
    const existing = this.db.query<any>(
      'SELECT id, unit FROM operational_field_definitions WHERE id = ?', [id],
    )[0];
    if (!existing) throw new Error('الحقل غير موجود.');
    if (updates.name !== undefined && !updates.name.trim()) throw new Error('اسم الحقل مطلوب.');
    this.db.executeTransaction((tx) => {
      tx.run(
        `UPDATE operational_field_definitions
         SET name = COALESCE(?, name), unit = ?, is_required = COALESCE(?, is_required),
             is_filterable = COALESCE(?, is_filterable)
         WHERE id = ?`,
        [updates.name?.trim() || null, updates.unit === undefined ? existing.unit : updates.unit?.trim() || null,
          updates.isRequired === undefined ? null : Number(updates.isRequired),
          updates.isFilterable === undefined ? null : Number(updates.isFilterable), id],
      );
      this.sync.capture(tx, 'operational_field', id, 'UPDATE');
    });
  }

  public deleteDefinition(id: string): void {
    this.requireDefinitionManagement();
    const used = this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM operational_field_values WHERE field_id = ?', [id],
    )[0]?.count || 0;
    if (used > 0) throw new Error('لا يمكن حذف حقل يحتوي على قيم محفوظة؛ عطّله بدلًا من حذف بيانات السجلات.');
    this.db.executeTransaction((tx) => {
      tx.query<{ id: string }>('SELECT id FROM operational_field_options WHERE field_id = ?', [id])
        .forEach((option) => this.sync.capture(tx, 'operational_field_option', option.id, 'DELETE'));
      tx.run('DELETE FROM operational_field_options WHERE field_id = ?', [id]);
      tx.run('DELETE FROM operational_field_definitions WHERE id = ?', [id]);
      this.sync.capture(tx, 'operational_field', id, 'DELETE');
    });
  }

  public addOption(fieldId: string, label: string): void {
    this.requireDefinitionManagement();
    const field = this.db.query<{ dataType: string }>(
      'SELECT data_type AS dataType FROM operational_field_definitions WHERE id = ?', [fieldId],
    )[0];
    if (!field || !['SELECT', 'MULTI_SELECT'].includes(field.dataType)) {
      throw new Error('هذا الحقل لا يقبل خيارات.');
    }
    const value = label.trim();
    if (!value) throw new Error('القيمة مطلوبة.');
    if (this.db.query('SELECT id FROM operational_field_options WHERE field_id = ? AND value = ?', [fieldId, value]).length) {
      throw new Error('هذه القيمة موجودة بالفعل.');
    }
    const optionId = `op_opt_${uuidv4().slice(0, 12)}`;
    this.db.executeTransaction((tx) => {
      tx.run(
        `INSERT INTO operational_field_options(id, field_id, value, label, sort_order)
         VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1
           FROM operational_field_options WHERE field_id = ?))`,
        [optionId, fieldId, value, value, fieldId],
      );
      this.sync.capture(tx, 'operational_field_option', optionId, 'CREATE');
    });
  }

  public updateOption(optionId: string, label: string): void {
    this.requireDefinitionManagement();
    const clean = label.trim();
    if (!clean) throw new Error('اسم الخيار مطلوب.');
    const option = this.db.query<{ fieldId: string; value: string }>(
      'SELECT field_id AS fieldId, value FROM operational_field_options WHERE id = ?', [optionId],
    )[0];
    if (!option) throw new Error('الخيار غير موجود.');
    if (this.db.query(
      'SELECT id FROM operational_field_options WHERE field_id = ? AND label = ? AND id != ?',
      [option.fieldId, clean, optionId],
    ).length) throw new Error('يوجد خيار بهذا الاسم بالفعل.');
    this.db.executeTransaction((tx) => {
      tx.run('UPDATE operational_field_options SET label = ? WHERE id = ?', [clean, optionId]);
      this.sync.capture(tx, 'operational_field_option', optionId, 'UPDATE');
    });
  }

  public removeOption(optionId: string): void {
    this.requireDefinitionManagement();
    const option = this.db.query<{ fieldId: string; value: string }>(
      'SELECT field_id AS fieldId, value FROM operational_field_options WHERE id = ?', [optionId],
    )[0];
    if (!option) return;
    const storedValues = this.db.query<{ value: string }>(
      'SELECT value FROM operational_field_values WHERE field_id = ?', [option.fieldId],
    );
    const used = storedValues.some(({ value }) => {
      if (value === option.value) return true;
      try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) && parsed.includes(option.value);
      } catch {
        return false;
      }
    });
    if (used) throw new Error('لا يمكن حذف خيار مستخدم في سجلات؛ غيّر اسمه لإبقاء القيم التاريخية واضحة.');
    this.db.executeTransaction((tx) => {
      this.sync.capture(tx, 'operational_field_option', optionId, 'DELETE');
      tx.run('DELETE FROM operational_field_options WHERE id = ?', [optionId]);
    });
  }

  public getRecordValues(entityType: string, recordId: string): Record<string, string> {
    this.getEntity(entityType);
    const rows = this.db.query<{ fieldId: string; value: string }>(
      `SELECT field_id AS fieldId, value FROM operational_field_values
       WHERE entity_type = ? AND record_id = ?`,
      [entityType, recordId],
    );
    return Object.fromEntries(rows.map((row) => [row.fieldId, row.value]));
  }

  /**
   * Copies operational field values from one record onto another record of a
   * different entity type, matched by field code — e.g. quotation → order or
   * order → invoice during sales conversion, so site/delivery/cutting details
   * survive the whole document chain. Values that fail target-side validation
   * are skipped instead of aborting the surrounding transaction.
   */
  public copyRecordFieldValues(
    fromEntityType: string,
    fromRecordId: string,
    toEntityType: string,
    toRecordId: string,
  ): void {
    if (!fromRecordId || !toRecordId) return;
    const sourceValues = this.getRecordValues(fromEntityType, fromRecordId);
    if (!Object.keys(sourceValues).length) return;
    const sourceDefs = this.getDefinitions(fromEntityType);
    const targetDefsByCode = new Map(
      this.getDefinitions(toEntityType).map((definition) => [definition.code, definition]),
    );
    if (!targetDefsByCode.size) return;
    const actor = AuthService.getCurrentUser();
    const targetBranchId = this.resolveRecordBranchId(toEntityType, toRecordId)
      ?? (actor ? this.branchAccess.getCurrentBranchId(actor) : null);
    this.db.executeTransaction((tx) => {
      for (const source of sourceDefs) {
        const raw = sourceValues[source.id];
        if (raw === undefined || raw === '') continue;
        const target = targetDefsByCode.get(source.code);
        if (!target) continue;
        let value: string | null;
        try {
          value = normalizeDynamicAttributeValue(target, raw);
        } catch {
          continue;
        }
        if (value === null) continue;
        tx.run(
          `INSERT INTO operational_field_values(id, entity_type, record_id, field_id, value, branch_id)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(entity_type, record_id, field_id)
           DO UPDATE SET value = excluded.value, branch_id = excluded.branch_id`,
          [`op_val_${uuidv4().slice(0, 12)}`, toEntityType, toRecordId, target.id, value, targetBranchId],
        );
        const row = tx.query<{ id: string }>(
          'SELECT id FROM operational_field_values WHERE entity_type = ? AND record_id = ? AND field_id = ?',
          [toEntityType, toRecordId, target.id],
        )[0];
        if (row) this.sync.capture(tx, 'operational_field_value', row.id, 'UPSERT');
      }
    });
  }

  public setRecordValues(
    entityType: string,
    recordId: string,
    values: Record<string, unknown>,
    operation: 'create' | 'update' = 'update',
  ): void {
    const entity = this.getEntity(entityType);
    const actor = AuthService.requireAuth();
    const permission = operation === 'create'
      ? entity.permission.replace(/\.update$/, '.create')
      : entity.permission;
    PermissionService.require(actor, permission);
    if (!recordId.trim()) throw new Error('معرّف السجل مطلوب.');
    const branchId = this.resolveRecordBranchId(entityType, recordId)
      ?? this.branchAccess.getCurrentBranchId(actor);
    this.validateRecordValues(entityType, values, operation, recordId);
    const definitions = this.getDefinitions(entityType);
    const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
    const normalized = new Map<string, string>();
    const cleared = new Set<string>();
    const effectiveValues = operation === 'update' ? this.getRecordValues(entityType, recordId) : {};
    for (const [fieldId, rawValue] of Object.entries(values || {})) {
      const definition = definitionsById.get(fieldId);
      if (!definition) {
        if (rawValue !== null && rawValue !== undefined && String(rawValue).trim()) {
          throw new Error('تتضمن البيانات حقلًا غير متاح لهذا النوع من السجلات.');
        }

        continue;
      }
      const value = normalizeDynamicAttributeValue(definition, rawValue);
      if (value !== null) {
        normalized.set(fieldId, value);
        effectiveValues[fieldId] = value;
      } else {
        cleared.add(fieldId);
        delete effectiveValues[fieldId];
      }
    }
    for (const definition of definitions) {
      if (definition.isRequired && !effectiveValues[definition.id]) {
        throw new Error(`الحقل «${definition.name}» مطلوب.`);
      }
    }
    this.db.executeTransaction((tx) => {
      cleared.forEach((fieldId) => {
        const previous = tx.query<{ id: string }>(
          'SELECT id FROM operational_field_values WHERE entity_type = ? AND record_id = ? AND field_id = ?',
          [entityType, recordId, fieldId],
        )[0];
        if (previous) {
          this.sync.capture(tx, 'operational_field_value', previous.id, 'DELETE');
          tx.run(
            'DELETE FROM operational_field_values WHERE entity_type = ? AND record_id = ? AND field_id = ?',
            [entityType, recordId, fieldId],
          );
        }
      });
      normalized.forEach((value, fieldId) => tx.run(
        `INSERT INTO operational_field_values(id, entity_type, record_id, field_id, value, branch_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(entity_type, record_id, field_id) DO UPDATE SET value = excluded.value, branch_id = excluded.branch_id`,
        [`op_val_${uuidv4().slice(0, 12)}`, entityType, recordId, fieldId, value, branchId],
      ));
      normalized.forEach((_value, fieldId) => {
        const row = tx.query<{ id: string }>(
          'SELECT id FROM operational_field_values WHERE entity_type = ? AND record_id = ? AND field_id = ?',
          [entityType, recordId, fieldId],
        )[0];
        if (row) this.sync.capture(tx, 'operational_field_value', row.id, 'UPSERT');
      });
    });
  }

  public validateRecordValues(
    entityType: string,
    values: Record<string, unknown>,
    operation: 'create' | 'update' = 'create',
    recordId?: string,
  ): void {
    const definitions = this.getDefinitions(entityType);
    const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
    const effectiveValues: Record<string, string> = operation === 'update' && recordId
      ? this.getRecordValues(entityType, recordId)
      : {};
    for (const [fieldId, rawValue] of Object.entries(values || {})) {
      const definition = definitionsById.get(fieldId);
      if (!definition) {
        if (rawValue !== null && rawValue !== undefined && String(rawValue).trim()) {
          throw new Error('تتضمن البيانات حقلًا غير متاح لهذا النوع من السجلات.');
        }
        continue;
      }
      const normalized = normalizeDynamicAttributeValue(definition, rawValue);
      if (normalized === null) delete effectiveValues[fieldId];
      else effectiveValues[fieldId] = normalized;
    }
    for (const definition of definitions) {
      if (definition.isRequired && !effectiveValues[definition.id]) {
        throw new Error(`الحقل «${definition.name}» مطلوب.`);
      }
    }
  }

  public getFilterableDefinitions(entityType: string): OperationalFieldDefinition[] {
    return this.getDefinitions(entityType).filter((definition) => definition.isFilterable);
  }

  public getRecordValuesForExport(entityType: string, recordIds: string[]): Record<string, Record<string, string>> {
    this.getEntity(entityType);
    if (!recordIds.length) return {};
    const placeholders = recordIds.map(() => '?').join(', ');
    const rows = this.db.query<any>(
      `SELECT v.record_id AS recordId, v.field_id AS fieldId, v.value, d.name
       FROM operational_field_values v
       JOIN operational_field_definitions d ON d.id = v.field_id
       WHERE v.entity_type = ? AND v.record_id IN (${placeholders})`,
      [entityType, ...recordIds],
    );
    const labels = new Map(this.getDefinitions(entityType).flatMap((definition) =>
      definition.values.map((option) => [`${definition.id}\u0000${option.value}`, option.label] as const),
    ));
    const result: Record<string, Record<string, string>> = {};
    rows.forEach((row) => {
      const value = labels.get(`${row.fieldId}\u0000${row.value}`) || row.value;
      (result[row.recordId] ||= {})[row.name] = value;
    });
    return result;
  }

  public getRecordValuesForRecords(entityType: string, recordIds: string[]): Record<string, Record<string, string>> {
    this.getEntity(entityType);
    if (!recordIds.length) return {};
    const placeholders = recordIds.map(() => '?').join(', ');
    const rows = this.db.query<{ recordId: string; fieldId: string; value: string }>(
      `SELECT record_id AS recordId, field_id AS fieldId, value
       FROM operational_field_values
       WHERE entity_type = ? AND record_id IN (${placeholders})`,
      [entityType, ...recordIds],
    );
    const result: Record<string, Record<string, string>> = {};
    rows.forEach(({ recordId, fieldId, value }) => {
      (result[recordId] ||= {})[fieldId] = value;
    });
    return result;
  }

  public getProductGradeOptions(includeInactive = false): ProductGradeOption[] {
    return this.db.query<any>(
      `SELECT value, label, is_active AS isActive, sort_order AS sortOrder
       FROM product_grade_options ${includeInactive ? '' : 'WHERE is_active = 1'}
       ORDER BY sort_order, value`,
    ).map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
  }

  public updateProductGradeOption(value: string, updates: {
    label?: string;
    isActive?: boolean;
    sortOrder?: number;
  }): void {
    PermissionService.require(AuthService.requireAuth(), 'products.attributes.manage');
    const existing = this.db.query('SELECT value FROM product_grade_options WHERE value = ?', [value])[0];
    if (!existing) throw new Error('خيار الفرز غير موجود.');
    if (updates.label !== undefined && !updates.label.trim()) throw new Error('اسم خيار الفرز مطلوب.');
    if (updates.isActive === false) {
      const activeCount = Number(this.db.query<{ count: number }>(
        'SELECT COUNT(*) AS count FROM product_grade_options WHERE is_active = 1',
      )[0]?.count || 0);
      if (activeCount <= 1 && this.db.query(
        'SELECT value FROM product_grade_options WHERE value = ? AND is_active = 1', [value],
      ).length) throw new Error('يجب إبقاء خيار فرز نشط واحد على الأقل.');
    }
    this.db.executeTransaction((tx) => {
      tx.run(
        `UPDATE product_grade_options SET label = COALESCE(?, label),
         is_active = COALESCE(?, is_active), sort_order = COALESCE(?, sort_order),
         updated_at = CURRENT_TIMESTAMP WHERE value = ?`,
        [updates.label?.trim() || null, updates.isActive === undefined ? null : Number(updates.isActive),
          updates.sortOrder ?? null, value],
      );
      this.sync.capture(tx, 'product_grade_option', value, 'UPDATE');
    });
  }

  public addProductGradeOption(label: string): string {
    PermissionService.require(AuthService.requireAuth(), 'products.attributes.manage');
    const clean = label.trim();
    if (!clean) throw new Error('اسم خيار الفرز مطلوب.');
    const value = clean.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
    const key = value || `GRADE_${uuidv4().slice(0, 8).toUpperCase()}`;
    if (this.db.query('SELECT value FROM product_grade_options WHERE value = ?', [key]).length) {
      throw new Error('يوجد خيار بهذا الاسم بالفعل.');
    }
    this.db.executeTransaction((tx) => {
      tx.run(
        `INSERT INTO product_grade_options(id, value, label, sort_order)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM product_grade_options))`,
        [key, key, clean],
      );
      this.sync.capture(tx, 'product_grade_option', key, 'CREATE');
    });
    return key;
  }
}
