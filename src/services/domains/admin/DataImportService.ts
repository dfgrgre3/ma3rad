import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { CustomerService } from '../customers/CustomerService';
import { SupplierService } from '../suppliers/SupplierService';
import { CategoryService } from '../products/CategoryService';
import { BrandService } from '../products/BrandService';
import { ProductService } from '../products/ProductService';
import { EmployeeService } from '../hr/EmployeeService';
import { localDateString } from '../../../utils/shared/date';
import { OperationsService } from '../operations/OperationsService';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { NotificationService } from '../notifications/NotificationService';
import { DATA_IMPORT_ACCESS_PERMISSIONS } from '../../../config/routePermissions';
import { OperationalFieldService } from '../products/OperationalFieldService';
import { v4 as uuidv4 } from 'uuid';
import type { ParsedSpreadsheetSheet } from '../../infrastructure/data/SpreadsheetImportService';

export type ImportEntity = 'customers' | 'suppliers' | 'categories' | 'brands' | 'products' | 'employees' | 'warehouses' | 'dynamic';
type ExistingImportEntity = Exclude<ImportEntity, 'dynamic'>;
export interface ImportField { key: string; label: string; aliases: string[]; required?: boolean }
export interface ParsedImport { entity: ImportEntity; headers: string[]; rows: Record<string, unknown>[]; mapping: Record<string, string>; confidence: number }
export interface ImportIssue { row: number; messages: string[] }

export const ENTITY_META: Record<Exclude<ImportEntity, 'dynamic'>, { label: string; permission: string; fields: ImportField[] }> = {
  customers: { label: 'العملاء', permission: 'customers.create', fields: [
    { key: 'name', label: 'اسم العميل', aliases: ['name','customer','customer name','اسم العميل','العميل','الاسم'], required: true }, { key: 'code', label: 'كود العميل', aliases: ['code','customer code','كود العميل','الكود'] },
    { key: 'phone', label: 'الهاتف', aliases: ['phone','mobile','telephone','الهاتف','الموبايل','رقم الهاتف'], required: true }, { key: 'phone2', label: 'هاتف إضافي', aliases: ['phone2','secondary phone','هاتف إضافي','هاتف اضافي'] },
    { key: 'nationalId', label: 'الرقم القومي', aliases: ['national id','national_id','الرقم القومي'] }, { key: 'address', label: 'العنوان', aliases: ['address','العنوان'] }, { key: 'city', label: 'المدينة', aliases: ['city','المدينة'] },
    { key: 'customerType', label: 'نوع العميل', aliases: ['customer type','type','نوع العميل'] }, { key: 'creditLimit', label: 'حد الائتمان', aliases: ['credit limit','credit_limit','حد الائتمان'] }, { key: 'initialBalance', label: 'رصيد افتتاحي', aliases: ['initial balance','opening balance','الرصيد الافتتاحي','رصيد افتتاحي'] }, { key: 'notes', label: 'ملاحظات', aliases: ['notes','ملاحظات'] },
  ] },
  suppliers: { label: 'الموردون', permission: 'suppliers.create', fields: [
    { key: 'name', label: 'اسم المورد', aliases: ['name','supplier','supplier name','اسم المورد','المورد','الاسم'], required: true }, { key: 'code', label: 'كود المورد', aliases: ['code','supplier code','كود المورد','الكود'] },
    { key: 'companyName', label: 'الشركة', aliases: ['company','company name','company_name','الشركة'] }, { key: 'phone', label: 'الهاتف', aliases: ['phone','mobile','الهاتف','الموبايل','رقم الهاتف'], required: true },
    { key: 'email', label: 'البريد الإلكتروني', aliases: ['email','البريد الإلكتروني','البريد الالكتروني'] }, { key: 'taxNumber', label: 'الرقم الضريبي', aliases: ['tax number','tax_number','الرقم الضريبي'] }, { key: 'commercialRecord', label: 'السجل التجاري', aliases: ['commercial record','commercial_record','السجل التجاري'] },
    { key: 'address', label: 'العنوان', aliases: ['address','العنوان'] }, { key: 'paymentTermsDays', label: 'مدة السداد بالأيام', aliases: ['payment terms','payment terms days','مدة السداد بالأيام','مدة السداد'] }, { key: 'initialBalance', label: 'رصيد افتتاحي', aliases: ['initial balance','opening balance','الرصيد الافتتاحي','رصيد افتتاحي'] }, { key: 'notes', label: 'ملاحظات', aliases: ['notes','ملاحظات'] },
  ] },
  categories: { label: 'التصنيفات', permission: 'categories.create', fields: [ { key: 'name', label: 'اسم التصنيف', aliases: ['name','category','category name','اسم التصنيف','التصنيف','الاسم'], required: true }, { key: 'description', label: 'الوصف', aliases: ['description','الوصف'] } ] },
  brands: { label: 'الماركات', permission: 'brands.create', fields: [ { key: 'name', label: 'اسم الماركة', aliases: ['name','brand','brand name','اسم الماركة','الماركة','الاسم'], required: true }, { key: 'country', label: 'بلد المنشأ', aliases: ['country','بلد المنشأ','البلد'] } ] },
  products: { label: 'الأصناف والسيراميك والمنتجات', permission: 'products.create', fields: [
    { key: 'sku', label: 'الكود', aliases: ['sku','code','product code','الكود','كود الصنف','كود المنتج'], required: true }, { key: 'barcode', label: 'الباركود', aliases: ['barcode','bar code','الباركود'] }, { key: 'name', label: 'اسم الصنف', aliases: ['name','product','product name','item name','اسم الصنف','اسم المنتج','الصنف','المنتج'], required: true },
    { key: 'category', label: 'التصنيف الموجود', aliases: ['category','category name','التصنيف','الفئة'], required: true }, { key: 'brand', label: 'الماركة الموجودة', aliases: ['brand','brand name','الماركة','العلامة التجارية'], required: true }, { key: 'grade', label: 'الفرز', aliases: ['grade','الفرز','الدرجة'] }, { key: 'size', label: 'المقاس', aliases: ['size','المقاس'], required: true },
    { key: 'piecesPerBox', label: 'قطع بالكرتونة', aliases: ['pieces per box','pieces_per_box','قطع بالكرتونة','قطع/كرتونة','عدد القطع'], required: true }, { key: 'metersPerBox', label: 'متر مربع بالكرتونة', aliases: ['meters per box','meters_per_box','متر مربع بالكرتونة','م²/كرتونة','متر/كرتونة','المتر/كرتونة','المترات'], required: true },
    { key: 'costPrice', label: 'سعر التكلفة', aliases: ['cost price','cost_price','التكلفة','سعر التكلفة'], required: true }, { key: 'sellingPriceM2', label: 'سعر البيع للمتر', aliases: ['selling price','selling_price_m2','سعر المتر','سعر البيع','سعر البيع للمتر'], required: true }, { key: 'wholesalePriceM2', label: 'سعر الجملة', aliases: ['wholesale price','wholesale_price_m2','سعر الجملة'] }, { key: 'minSellingPriceM2', label: 'أقل سعر', aliases: ['min price','min_selling_price_m2','أقل سعر','الحد الأدنى للسعر'] }, { key: 'initialStockM2', label: 'رصيد افتتاحي بالمتر', aliases: ['stock','initial stock','initial_stock','المخزون','الكمية','رصيد افتتاحي بالمتر'] },
  ] },
  employees: { label: 'الموظفون', permission: 'employees.manage', fields: [
    { key: 'name', label: 'اسم الموظف', aliases: ['name','employee','employee name','اسم الموظف','الموظف','الاسم'], required: true }, { key: 'phone', label: 'الهاتف', aliases: ['phone','mobile','الهاتف','الموبايل'], required: true }, { key: 'email', label: 'البريد الإلكتروني', aliases: ['email','البريد الإلكتروني','البريد الالكتروني'] }, { key: 'role', label: 'الوظيفة', aliases: ['role','job title','job_title','الوظيفة','المسمى الوظيفي'] }, { key: 'location', label: 'الموقع', aliases: ['location','branch','الموقع','الفرع'] }, { key: 'baseSalary', label: 'الراتب الأساسي', aliases: ['salary','base salary','base_salary','الراتب','الراتب الأساسي'] }, { key: 'salaryType', label: 'دورية الراتب', aliases: ['salary type','salary_type','دورية الراتب'] }, { key: 'joinedDate', label: 'تاريخ التعيين', aliases: ['joined date','joined_date','hire date','تاريخ التعيين'] }, { key: 'notes', label: 'ملاحظات', aliases: ['notes','ملاحظات'] },
  ] },
  warehouses: { label: 'المخازن', permission: 'warehouses.manage', fields: [ { key: 'name', label: 'اسم المخزن', aliases: ['name','warehouse','warehouse name','اسم المخزن','المخزن','الاسم'], required: true }, { key: 'location', label: 'الموقع', aliases: ['location','الموقع','العنوان'] } ] },
};

const cleanHeader = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, ' ');
const text = (value: unknown) => String(value ?? '').trim();
const number = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return NaN;
  const normalized = raw
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[٬,]/g, '')
    .replace(/[٫]/g, '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};
type ImportValue = (key: string) => string;
type ImportOptions = {
  allowInitialBalances: boolean;
  allowProductStock: boolean;
  openingStockWarehouseId?: string;
  sourceName?: string;
};
type ImportRowValues = {
  val: ImportValue;
  opt: (key: string) => string | undefined;
  num: (key: string, fallback?: number) => number;
};

const validateRequiredFields = (
  fields: ImportField[],
  value: ImportValue,
  messages: string[],
): void => {
  for (const field of fields) {
    if (field.required && !value(field.key)) messages.push(`${field.label} مطلوب`);
  }
};

const validateUniqueValue = (
  value: string,
  seen: Set<string>,
  message: string,
  messages: string[],
): void => {
  if (!value) return;
  if (seen.has(value)) messages.push(message);
  seen.add(value);
};

const validateNumericValue = (
  value: ImportValue,
  key: string,
  label: string,
  messages: string[],
  minimum?: number,
  exclusiveMinimum = false,
  invalidMessage?: string,
): void => {
  const raw = value(key);
  if (!raw) return;
  const parsed = number(raw);
  if (!Number.isFinite(parsed)) {
    messages.push(invalidMessage || `${label} يجب أن يكون رقمًا صالحًا`);
    return;
  }
  if (minimum !== undefined && (exclusiveMinimum ? parsed <= minimum : parsed < minimum)) {
    messages.push(`${label} يجب أن يكون ${exclusiveMinimum ? 'أكبر من' : 'على الأقل'} ${minimum}`);
  }
};

const validateCustomerOrSupplier = (
  value: ImportValue,
  seen: Set<string>,
  messages: string[],
): void => {
  const code = value('code');
  const phone = value('phone');
  if (!phone) messages.push('رقم الهاتف مطلوب');
  validateUniqueValue(code ? `code:${code.toLocaleLowerCase()}` : '', seen, 'سجل مكرر داخل الملف', messages);
  validateUniqueValue(phone ? `phone:${phone}` : '', seen, 'سجل مكرر داخل الملف', messages);
};

const validateNamedEntity = (
  value: ImportValue,
  seen: Set<string>,
  messages: string[],
): void => {
  validateUniqueValue(value('name').toLocaleLowerCase(), seen, 'اسم مكرر داخل الملف', messages);
};

const validateEmployee = (
  value: ImportValue,
  seen: Set<string>,
  messages: string[],
): void => {
  validateUniqueValue(value('phone'), seen, 'رقم هاتف مكرر داخل الملف', messages);
};

const validateNumericFields = (
  entity: ExistingImportEntity,
  value: ImportValue,
  messages: string[],
): void => {
  const validators: Record<ExistingImportEntity, Array<[string, string, number?, boolean?, string?]>> = {
    customers: [
      ['creditLimit', 'حد الائتمان', 0],
      ['initialBalance', 'الرصيد الافتتاحي', undefined, false, 'الرصيد الافتتاحي غير صالح'],
    ],
    suppliers: [
      ['paymentTermsDays', 'مدة السداد بالأيام', 0],
      ['initialBalance', 'الرصيد الافتتاحي', undefined, false, 'الرصيد الافتتاحي غير صالح'],
    ],
    categories: [],
    brands: [],
    products: [
      ['costPrice', 'سعر التكلفة', 0],
      ['wholesalePriceM2', 'سعر الجملة', 0],
      ['minSellingPriceM2', 'أقل سعر', 0],
      ['initialStockM2', 'الرصيد الافتتاحي بالمتر', 0],
    ],
    employees: [['baseSalary', 'الراتب الأساسي', 0, false, 'الراتب غير صالح']],
    warehouses: [],
  };
  for (const [key, label, minimum, exclusiveMinimum, invalidMessage] of validators[entity]) {
    validateNumericValue(value, key, label, messages, minimum, exclusiveMinimum, invalidMessage);
  }
};

const validateProduct = (
  value: ImportValue,
  seen: Set<string>,
  messages: string[],
): void => {
  for (const key of ['piecesPerBox', 'metersPerBox', 'sellingPriceM2']) {
    const amount = number(value(key));
    if (!Number.isFinite(amount) || amount <= 0) {
      const label = ENTITY_META.products.fields.find(field => field.key === key)?.label;
      messages.push(`${label} يجب أن يكون أكبر من صفر`);
    }
  }
  validateUniqueValue(value('sku'), seen, 'كود مكرر داخل الملف', messages);
};

const validateEntitySpecificFields = (
  entity: ExistingImportEntity,
  value: ImportValue,
  seen: Set<string>,
  messages: string[],
): void => {
  switch (entity) {
    case 'customers':
    case 'suppliers':
      validateCustomerOrSupplier(value, seen, messages);
      break;
    case 'categories':
    case 'brands':
    case 'warehouses':
      validateNamedEntity(value, seen, messages);
      break;
    case 'employees':
      validateEmployee(value, seen, messages);
      break;
    case 'products':
      validateProduct(value, seen, messages);
      break;
  }
};

export class DataImportService {
  parseSheets(sheets: ParsedSpreadsheetSheet[]): Array<{ sheet: ParsedSpreadsheetSheet; data: ParsedImport }> {
    if (!sheets.length) throw new Error('الملف لا يحتوي على أوراق بيانات.');
    return sheets.map(sheet => ({ sheet, data: this.parseRows(sheet.headers, sheet.rows) }));
  }

  parseRows(headers: string[], rows: Record<string, unknown>[], preferred?: ImportEntity): ParsedImport {
    if (!rows.length) throw new Error('الملف لا يحتوي على صفوف بيانات.');
    const scores = (Object.keys(ENTITY_META) as ExistingImportEntity[]).map(entity => ({ entity, score: ENTITY_META[entity].fields.reduce((n,f)=>n+(headers.some(h=>f.aliases.some(a=>cleanHeader(a)===cleanHeader(h)))?1:0),0) }));
    scores.sort((a,b)=>b.score-a.score);
    const best = scores[0];
    const requiredCount = ENTITY_META[best.entity].fields.filter(f=>f.required).length;
    const completeKnownShape = ENTITY_META[best.entity].fields.filter(f=>f.required).every(f=>headers.some(h=>f.aliases.some(a=>cleanHeader(a)===cleanHeader(h))));
    const winner: ImportEntity = preferred || (best.score >= Math.max(1, requiredCount) && completeKnownShape && best.score > (scores[1]?.score || 0) ? best.entity : 'dynamic');
    if (winner === 'dynamic') return { entity: winner, headers, rows, mapping: {}, confidence: 0 };
    const mapping: Record<string,string> = {};
    const knownWinner = winner as ExistingImportEntity;
    for (const field of ENTITY_META[knownWinner].fields) { const match = headers.find(h=>field.aliases.some(a=>cleanHeader(a)===cleanHeader(h))); if(match) mapping[field.key]=match; }
    return { entity: knownWinner, headers, rows, mapping, confidence: preferred ? 1 : scores[0].score ? scores[0].score / Math.max(1, ENTITY_META[scores[0].entity].fields.filter(f=>f.required).length) : 0 };
  }

  canOpen(user: ReturnType<typeof AuthService.getCurrentUser>): boolean {
    return PermissionService.canAny(user, DATA_IMPORT_ACCESS_PERMISSIONS);
  }

  getOpeningStockWarehouses() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'operations.view');
    return new OperationsService().getWarehouses().filter(warehouse => warehouse.isActive);
  }

  validate(data: ParsedImport): ImportIssue[] {
    if (data.entity === 'dynamic') return [];
    const entity = data.entity;
    const fields = ENTITY_META[entity].fields;
    const seen = new Set<string>();
    const mappedHeaders = Object.values(data.mapping).filter(Boolean);
    const hasDuplicateMapping = new Set(mappedHeaders).size !== mappedHeaders.length;

    return data.rows.flatMap((row, index) => {
      const messages: string[] = [];
      const value: ImportValue = key => text(row[data.mapping[key]]);
      validateRequiredFields(fields, value, messages);
      if (hasDuplicateMapping) messages.push('لا يمكن ربط العمود نفسه بأكثر من حقل');
      validateNumericFields(entity, value, messages);
      validateEntitySpecificFields(entity, value, seen, messages);
      return messages.length ? [{ row: index + 2, messages }] : [];
    });
  }

  import(data: ParsedImport, options: ImportOptions): { created: number; skipped: number; errors: ImportIssue[]; batchId?: string } {
    if (data.entity === 'dynamic') throw new Error('استخدم مسار استيراد البيانات المرنة لهذا الملف.');
    const entity = data.entity;
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, ENTITY_META[entity].permission);

    const issueMap = new Map(this.validate(data).map(issue => [issue.row, issue.messages]));
    const result = { created: 0, skipped: 0, errors: [] as ImportIssue[] };
    const db = DatabaseManager.getInstance();
    const isTrackedEntity = entity === 'customers' || entity === 'products';
    const batchId = isTrackedEntity ? `dib_${uuidv4().replace(/-/g, '').slice(0, 12)}` : undefined;
    if (batchId) {
      db.run(
        'INSERT INTO data_import_batches (id,entity_type,source_name,status,imported_count,created_by) VALUES (?,?,?,?,?,?)',
        [batchId, entity, options.sourceName || 'استيراد بيانات', 'COMPLETED', 0, actor.id],
      );
    }
    const categories = new CategoryService();
    const brands = new BrandService();
    const context = {
      db,
      customers: new CustomerService(),
      suppliers: new SupplierService(),
      categories,
      brands,
      products: new ProductService(),
      operations: new OperationsService(),
      categorySet: new Set(categories.getAllCategories().map(category => category.name.trim().toLowerCase())),
      brandSet: new Set(brands.getAllBrands().map(brand => brand.name.trim().toLowerCase())),
      options,
    };

    data.rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const rowIssues = issueMap.get(rowNumber);
      if (rowIssues?.length) {
        result.skipped++;
        result.errors.push({ row: rowNumber, messages: rowIssues });
        return;
      }

      try {
        const createdId = this.importRow(entity, this.createRowValues(row, data.mapping), context);
        if (batchId && createdId) {
          db.run('INSERT INTO data_import_batch_records (id,batch_id,entity_id) VALUES (?,?,?)', [
            `dibr_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
            batchId,
            createdId,
          ]);
        }
        result.created++;
      } catch (error) {
        result.skipped++;
        result.errors.push({ row: rowNumber, messages: [this.getErrorMessage(error)] });
      }
    });

    if (batchId) {
      db.run('UPDATE data_import_batches SET imported_count=?,status=? WHERE id=?', [
        result.created,
        result.skipped ? 'PARTIAL' : 'COMPLETED',
        batchId,
      ]);
    }
    return { ...result, batchId };
  }

  getImportBatches(entity: 'customers' | 'products'): Array<{
    id: string;
    entityType: 'customers' | 'products';
    sourceName: string;
    status: string;
    importedCount: number;
    createdAt: string;
  }> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, ENTITY_META[entity].permission);
    return DatabaseManager.getInstance().query(
      'SELECT id,entity_type,source_name,status,imported_count,created_at FROM data_import_batches WHERE entity_type=? ORDER BY created_at DESC, rowid DESC LIMIT 50',
      [entity],
    );
  }

  rollbackImportBatch(batchId: string): number {
    const actor = AuthService.requireAuth();
    const db = DatabaseManager.getInstance();
    const batch = db.query<{ id: string; entityType: 'customers' | 'products'; status: string }>(
      'SELECT id,entity_type,status FROM data_import_batches WHERE id=?',
      [batchId],
    )[0];
    if (!batch) throw new Error('دفعة الاستيراد غير موجودة.');
    if (batch.status === 'ROLLED_BACK') return 0;
    PermissionService.require(
      actor,
      batch.entityType === 'customers' ? 'ui.customers.list.delete' : 'ui.products.catalog.delete',
    );
    if (batch.entityType === 'customers') PermissionService.require(actor, 'ui.customers.list.view');

    const records = db.query<{ entityId: string }>(
      'SELECT entity_id FROM data_import_batch_records WHERE batch_id=? ORDER BY rowid DESC',
      [batchId],
    );
    for (const { entityId } of records) {
      if (batch.entityType === 'customers') {
        const customer = db.query<{ currentBalance: number }>(
          'SELECT current_balance FROM customers WHERE id=?',
          [entityId],
        )[0];
        if (customer && Math.abs(Number(customer.currentBalance || 0)) > 1e-6) {
          throw new Error('لا يمكن التراجع عن الدفعة لوجود رصيد حالي على أحد العملاء المستوردين.');
        }
      }
      const references = this.getRecordReferences(batch.entityType, entityId);
      if (references.length) {
        throw new Error(`لا يمكن التراجع عن الدفعة لوجود سجلات مرتبطة في «${references[0]}».`);
      }
    }

    for (const { entityId } of records) {
      if (batch.entityType === 'customers') new CustomerService().deleteCustomer(entityId);
      else new ProductService().deleteProduct(entityId);
    }
    db.run("UPDATE data_import_batches SET status='ROLLED_BACK',imported_count=0 WHERE id=?", [batchId]);
    return records.length;
  }

  private getRecordReferences(entityType: 'customers' | 'products', entityId: string): string[] {
    const db = DatabaseManager.getInstance();
    const tables = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    const references: string[] = [];
    for (const { name } of tables) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
      const foreignKeys = db.query<{ table: string; from: string; to: string }>(`PRAGMA foreign_key_list("${name}")`);
      for (const key of foreignKeys) {
        if (key.table !== entityType || key.to !== 'id' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key.from)) continue;
        const count = db.query<{ count: number }>(
          `SELECT COUNT(*) AS count FROM "${name}" WHERE "${key.from}"=?`,
          [entityId],
        )[0]?.count || 0;
        if (count > 0) references.push(name);
      }
    }
    return references;
  }

  private createRowValues(row: Record<string, unknown>, mapping: Record<string, string>): ImportRowValues {
    const val: ImportValue = key => text(row[mapping[key]]);
    return {
      val,
      opt: key => val(key) || undefined,
      num: (key, fallback = 0) => {
        const raw = row[mapping[key]];
        const valueText = text(raw);
        if (!valueText) return fallback;
        const parsed = number(raw);
        return Number.isFinite(parsed) ? parsed : fallback;
      },
    };
  }

  private importRow(
    entity: ExistingImportEntity,
    values: ImportRowValues,
    context: {
      db: ReturnType<typeof DatabaseManager.getInstance>;
      customers: CustomerService;
      suppliers: SupplierService;
      categories: CategoryService;
      brands: BrandService;
      products: ProductService;
      operations: OperationsService;
      categorySet: Set<string>;
      brandSet: Set<string>;
      options: ImportOptions;
    },
  ): string | undefined {
    switch (entity) {
      case 'customers':
        return this.importCustomer(values, context.db, context.customers, context.options);
      case 'suppliers':
        this.importSupplier(values, context.db, context.suppliers, context.options);
        return undefined;
      case 'categories':
        this.importCategory(values, context.categories, context.categorySet);
        return undefined;
      case 'brands':
        this.importBrand(values, context.brands, context.brandSet);
        return undefined;
      case 'warehouses':
        this.importWarehouse(values, context.operations);
        return undefined;
      case 'employees':
        this.importEmployee(values, context.db);
        return undefined;
      case 'products':
        return this.importProduct(values, context);
    }
  }

  private importCustomer(
    values: ImportRowValues,
    db: ReturnType<typeof DatabaseManager.getInstance>,
    customers: CustomerService,
    options: ImportOptions,
  ): string {
    const code = values.opt('code');
    const phone = values.val('phone');
    if ((code && db.query('SELECT id FROM customers WHERE code=?', [code]).length)
      || db.query('SELECT id FROM customers WHERE phone=? AND phone <> \'\'', [phone]).length) {
      throw new Error('العميل موجود بالفعل حسب الكود أو الهاتف');
    }

    const customer = customers.createCustomer({
      code: code || '',
      name: values.val('name'),
      phone,
      phone2: values.opt('phone2'),
      nationalId: values.opt('nationalId'),
      address: values.opt('address'),
      city: values.opt('city'),
      customerType: this.getCustomerType(values.val('customerType')) as any,
      creditLimit: values.num('creditLimit'),
      initialBalance: options.allowInitialBalances ? values.num('initialBalance') : 0,
      notes: values.opt('notes'),
    });
    this.notifyIncompleteCustomer(customer, values);
    return customer.id;
  }

  private getCustomerType(value: string): string {
    const customerType = value.toUpperCase();
    return ['RETAIL', 'CONTRACTOR', 'WHOLESALE', 'ENGINEER'].includes(customerType) ? customerType : 'RETAIL';
  }

  private notifyIncompleteCustomer(customer: { id: string; name: string }, values: ImportRowValues): void {
    const missingFields = [
      ['nationalId', 'الرقم القومي'],
      ['address', 'العنوان'],
      ['city', 'المدينة'],
      ['phone2', 'هاتف إضافي'],
    ].filter(([key]) => !values.opt(key)).map(([, label]) => label);

    if (missingFields.length) {
      try {
        new NotificationService().notifyIncompleteCustomer(customer.id, customer.name, missingFields);
      } catch (error) {
        console.error('Failed to notify about incomplete imported customer:', error);
      }
    }
  }

  private importSupplier(
    values: ImportRowValues,
    db: ReturnType<typeof DatabaseManager.getInstance>,
    suppliers: SupplierService,
    options: ImportOptions,
  ): void {
    const code = values.opt('code');
    const phone = values.val('phone');
    if ((code && db.query('SELECT id FROM suppliers WHERE code=?', [code]).length)
      || db.query('SELECT id FROM suppliers WHERE phone=? AND phone <> \'\'', [phone]).length) {
      throw new Error('المورد موجود بالفعل حسب الكود أو الهاتف');
    }

    suppliers.createSupplier({
      code: code || '',
      name: values.val('name'),
      companyName: values.opt('companyName'),
      phone,
      email: values.opt('email'),
      taxNumber: values.opt('taxNumber'),
      commercialRecord: values.opt('commercialRecord'),
      address: values.opt('address'),
      paymentTermsDays: values.num('paymentTermsDays', 30),
      initialBalance: options.allowInitialBalances ? values.num('initialBalance') : 0,
      notes: values.opt('notes'),
    });
  }

  private importCategory(values: ImportRowValues, categories: CategoryService, categorySet: Set<string>): void {
    const name = values.val('name');
    const normalizedName = name.toLowerCase();
    if (categorySet.has(normalizedName)) throw new Error('التصنيف موجود بالفعل');
    categories.createCategory(name, undefined, values.opt('description'));
    categorySet.add(normalizedName);
  }

  private importBrand(values: ImportRowValues, brands: BrandService, brandSet: Set<string>): void {
    const name = values.val('name');
    const normalizedName = name.toLowerCase();
    if (brandSet.has(normalizedName)) throw new Error('الماركة موجودة بالفعل');
    brands.createBrand(name, values.opt('country'));
    brandSet.add(normalizedName);
  }

  private importWarehouse(values: ImportRowValues, operations: OperationsService): void {
    const name = values.val('name');
    if (operations.getWarehouses().some(warehouse => warehouse.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new Error('المخزن موجود بالفعل');
    }
    operations.createWarehouse({ name, location: values.opt('location') });
  }

  private importEmployee(values: ImportRowValues, db: ReturnType<typeof DatabaseManager.getInstance>): void {
    const phone = values.val('phone');
    if (db.query('SELECT id FROM employees WHERE phone=? AND phone <> \'\'', [phone]).length) {
      throw new Error('الموظف موجود بالفعل بهذا الهاتف');
    }
    EmployeeService.create({
      name: values.val('name'),
      phone,
      email: values.val('email'),
      role: values.val('role') || 'موظف',
      location: values.val('location'),
      baseSalary: values.num('baseSalary'),
      salaryType: values.val('salaryType').toUpperCase() === 'DAILY' ? 'DAILY' : 'MONTHLY',
      status: 'ACTIVE',
      joinedDate: values.opt('joinedDate') || localDateString(),
      notes: values.val('notes'),
    });
  }

  private importProduct(
    values: ImportRowValues,
    context: {
      categories: CategoryService;
      brands: BrandService;
      products: ProductService;
      operations: OperationsService;
      categorySet: Set<string>;
      brandSet: Set<string>;
      options: ImportOptions;
    },
  ): string {
    const categoryName = values.val('category');
    const brandName = values.val('brand');
    const normalizedCategory = categoryName.toLowerCase();
    const normalizedBrand = brandName.toLowerCase();
    if (!context.categorySet.has(normalizedCategory)) throw new Error(`التصنيف غير موجود: ${categoryName}`);
    if (!context.brandSet.has(normalizedBrand)) throw new Error(`الماركة غير موجودة: ${brandName}`);

    const category = context.categories.getAllCategories()
      .find(item => item.name.trim().toLowerCase() === normalizedCategory)!;
    const brand = context.brands.getAllBrands()
      .find(item => item.name.trim().toLowerCase() === normalizedBrand)!;
    const sku = values.val('sku');
    const metersPerBox = values.num('metersPerBox');
    const sellingPriceM2 = values.num('sellingPriceM2');
    const costPrice = values.num('costPrice');
    const openingQuantity = context.options.allowProductStock ? values.num('initialStockM2') : 0;
    const warehouse = openingQuantity > 0
      ? context.operations.getWarehouses().find(item => item.id === context.options.openingStockWarehouseId && item.isActive)
      : undefined;
    if (openingQuantity > 0 && !warehouse) {
      throw new Error('اختر مخزنًا نشطًا يدويًا لتسجيل الرصيد الافتتاحي.');
    }

    const grade = values.val('grade').toUpperCase();
    const gradeOptions = new OperationalFieldService().getProductGradeOptions();
    const configuredGrade = gradeOptions.find((option) =>
      option.value.toUpperCase() === grade || option.label.trim().toUpperCase() === grade,
    )?.value;
    const created = context.products.createProduct({
      sku,
      barcode: values.val('barcode') || sku,
      name: values.val('name'),
      categoryId: category.id,
      brandId: brand.id,
      grade: (configuredGrade || gradeOptions[0]?.value || 'GRADE_1') as any,
      size: values.val('size'),
      baseUnit: 'M2',
      sellUnit: 'M2',
      piecesPerBox: values.num('piecesPerBox'),
      metersPerBox,
      costPrice,
      sellingPriceM2,
      sellingPriceBox: sellingPriceM2 * metersPerBox,
      wholesalePriceM2: values.num('wholesalePriceM2', sellingPriceM2),
      minSellingPriceM2: values.num('minSellingPriceM2', costPrice),
      minStockLevel: 0,
      isActive: true,
    } as any, openingQuantity > 0 && warehouse
      ? { warehouseId: warehouse.id, quantityM2: openingQuantity, unitCost: costPrice }
      : undefined);
    return created.id;
  }

  private getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message || 'تعذر استيراد الصف';
    }
    return 'تعذر استيراد الصف';
  }
}
