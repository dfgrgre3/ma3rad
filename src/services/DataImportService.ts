import * as XLSX from 'xlsx';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { CustomerService } from './CustomerService';
import { SupplierService } from './SupplierService';
import { CategoryService } from './CategoryService';
import { BrandService } from './BrandService';
import { ProductService } from './ProductService';
import { EmployeeService } from './EmployeeService';
import { localDateString } from '../utils/date';
import { OperationsService } from './OperationsService';
import { DatabaseManager } from '../database/db';
import { NotificationService } from './NotificationService';

export type ImportEntity = 'customers' | 'suppliers' | 'categories' | 'brands' | 'products' | 'employees' | 'warehouses' | 'dynamic';
type ExistingImportEntity = Exclude<ImportEntity, 'dynamic'>;
export interface ImportField { key: string; label: string; aliases: string[]; required?: boolean }
export interface ParsedImport { entity: ImportEntity; headers: string[]; rows: Record<string, unknown>[]; mapping: Record<string, string>; confidence: number }
export interface ImportIssue { row: number; messages: string[] }

export const ENTITY_META: Record<Exclude<ImportEntity, 'dynamic'>, { label: string; permission: string; fields: ImportField[] }> = {
  customers: { label: 'العملاء', permission: 'customers.create', fields: [
    { key: 'name', label: 'اسم العميل', aliases: ['name','customer','customer name','اسم العميل','العميل','الاسم'], required: true }, { key: 'code', label: 'كود العميل', aliases: ['code','customer code','كود العميل','الكود'] },
    { key: 'phone', label: 'الهاتف', aliases: ['phone','mobile','telephone','الهاتف','الموبايل','رقم الهاتف'], required: true }, { key: 'phone2', label: 'هاتف إضافي', aliases: ['phone2','secondary phone','هاتف اضافي'] },
    { key: 'nationalId', label: 'الرقم القومي', aliases: ['national id','national_id','الرقم القومي'] }, { key: 'address', label: 'العنوان', aliases: ['address','العنوان'] }, { key: 'city', label: 'المدينة', aliases: ['city','المدينة'] },
    { key: 'customerType', label: 'نوع العميل', aliases: ['customer type','type','نوع العميل'] }, { key: 'creditLimit', label: 'حد الائتمان', aliases: ['credit limit','credit_limit','حد الائتمان'] }, { key: 'initialBalance', label: 'رصيد افتتاحي', aliases: ['initial balance','opening balance','الرصيد الافتتاحي','رصيد افتتاحي'] }, { key: 'notes', label: 'ملاحظات', aliases: ['notes','ملاحظات'] },
  ] },
  suppliers: { label: 'الموردون', permission: 'suppliers.create', fields: [
    { key: 'name', label: 'اسم المورد', aliases: ['name','supplier','supplier name','اسم المورد','المورد','الاسم'], required: true }, { key: 'code', label: 'كود المورد', aliases: ['code','supplier code','كود المورد','الكود'] },
    { key: 'companyName', label: 'الشركة', aliases: ['company','company name','company_name','الشركة'] }, { key: 'phone', label: 'الهاتف', aliases: ['phone','mobile','الهاتف','الموبايل','رقم الهاتف'], required: true },
    { key: 'email', label: 'البريد الإلكتروني', aliases: ['email','البريد الالكتروني'] }, { key: 'taxNumber', label: 'الرقم الضريبي', aliases: ['tax number','tax_number','الرقم الضريبي'] }, { key: 'commercialRecord', label: 'السجل التجاري', aliases: ['commercial record','commercial_record','السجل التجاري'] },
    { key: 'address', label: 'العنوان', aliases: ['address','العنوان'] }, { key: 'paymentTermsDays', label: 'مدة السداد بالأيام', aliases: ['payment terms','payment terms days','مدة السداد'] }, { key: 'initialBalance', label: 'رصيد افتتاحي', aliases: ['initial balance','opening balance','الرصيد الافتتاحي','رصيد افتتاحي'] }, { key: 'notes', label: 'ملاحظات', aliases: ['notes','ملاحظات'] },
  ] },
  categories: { label: 'التصنيفات', permission: 'categories.create', fields: [ { key: 'name', label: 'اسم التصنيف', aliases: ['name','category','category name','اسم التصنيف','التصنيف','الاسم'], required: true }, { key: 'description', label: 'الوصف', aliases: ['description','الوصف'] } ] },
  brands: { label: 'الماركات', permission: 'brands.create', fields: [ { key: 'name', label: 'اسم الماركة', aliases: ['name','brand','brand name','اسم الماركة','الماركة','الاسم'], required: true }, { key: 'country', label: 'بلد المنشأ', aliases: ['country','بلد المنشأ','البلد'] } ] },
  products: { label: 'الأصناف والسيراميك والمنتجات', permission: 'products.create', fields: [
    { key: 'sku', label: 'الكود', aliases: ['sku','code','product code','الكود','كود الصنف','كود المنتج'], required: true }, { key: 'barcode', label: 'الباركود', aliases: ['barcode','bar code','الباركود'] }, { key: 'name', label: 'اسم الصنف', aliases: ['name','product','product name','item name','اسم الصنف','اسم المنتج','الصنف','المنتج'], required: true },
    { key: 'category', label: 'التصنيف الموجود', aliases: ['category','category name','التصنيف','الفئة'], required: true }, { key: 'brand', label: 'الماركة الموجودة', aliases: ['brand','brand name','الماركة','العلامة التجارية'], required: true }, { key: 'grade', label: 'الفرز', aliases: ['grade','الفرز','الدرجة'] }, { key: 'size', label: 'المقاس', aliases: ['size','المقاس'], required: true },
    { key: 'piecesPerBox', label: 'قطع بالكرتونة', aliases: ['pieces per box','pieces_per_box','قطع/كرتونة','عدد القطع'], required: true }, { key: 'metersPerBox', label: 'متر مربع بالكرتونة', aliases: ['meters per box','meters_per_box','م²/كرتونة','متر/كرتونة','المتر/كرتونة','المترات'], required: true },
    { key: 'costPrice', label: 'سعر التكلفة', aliases: ['cost price','cost_price','التكلفة','سعر التكلفة'], required: true }, { key: 'sellingPriceM2', label: 'سعر البيع للمتر', aliases: ['selling price','selling_price_m2','سعر المتر','سعر البيع','سعر البيع للمتر'], required: true }, { key: 'wholesalePriceM2', label: 'سعر الجملة', aliases: ['wholesale price','wholesale_price_m2','سعر الجملة'] }, { key: 'minSellingPriceM2', label: 'أقل سعر', aliases: ['min price','min_selling_price_m2','أقل سعر','الحد الأدنى للسعر'] }, { key: 'initialStockM2', label: 'رصيد افتتاحي بالمتر', aliases: ['stock','initial stock','initial_stock','المخزون','الكمية','رصيد افتتاحي بالمتر'] },
  ] },
  employees: { label: 'الموظفون', permission: 'employees.manage', fields: [
    { key: 'name', label: 'اسم الموظف', aliases: ['name','employee','employee name','اسم الموظف','الموظف','الاسم'], required: true }, { key: 'phone', label: 'الهاتف', aliases: ['phone','mobile','الهاتف','الموبايل'], required: true }, { key: 'email', label: 'البريد الإلكتروني', aliases: ['email','البريد الالكتروني'] }, { key: 'role', label: 'الوظيفة', aliases: ['role','job title','job_title','الوظيفة','المسمى الوظيفي'] }, { key: 'location', label: 'الموقع', aliases: ['location','branch','الموقع','الفرع'] }, { key: 'baseSalary', label: 'الراتب الأساسي', aliases: ['salary','base salary','base_salary','الراتب','الراتب الأساسي'] }, { key: 'salaryType', label: 'دورية الراتب', aliases: ['salary type','salary_type','دورية الراتب'] }, { key: 'joinedDate', label: 'تاريخ التعيين', aliases: ['joined date','joined_date','hire date','تاريخ التعيين'] }, { key: 'notes', label: 'ملاحظات', aliases: ['notes','ملاحظات'] },
  ] },
  warehouses: { label: 'المخازن', permission: 'warehouses.manage', fields: [ { key: 'name', label: 'اسم المخزن', aliases: ['name','warehouse','warehouse name','اسم المخزن','المخزن','الاسم'], required: true }, { key: 'location', label: 'الموقع', aliases: ['location','الموقع','العنوان'] } ] },
};

const cleanHeader = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s_\-]+/g, ' ');
const text = (value: unknown) => String(value ?? '').trim();
const number = (value: unknown) => { const n = Number(String(value ?? '').replace(/[,٬]/g, '').replace(/[٫]/g, '.')); return Number.isFinite(n) ? n : NaN; };
const truthy = (v: unknown) => ['1','true','yes','نعم','ذكر'].includes(text(v).toLowerCase());

export class DataImportService {
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
    return PermissionService.can(user, 'admin.data') || (Object.values(ENTITY_META) as Array<(typeof ENTITY_META)[Exclude<ImportEntity, 'dynamic'>]>).some(meta => PermissionService.can(user, meta.permission));
  }

  validate(data: ParsedImport): ImportIssue[] {
    if (data.entity === 'dynamic') return [];
    const meta=ENTITY_META[data.entity]; const issues: ImportIssue[]=[]; const seen=new Set<string>();
    data.rows.forEach((row,i)=>{
      const messages:string[]=[]; const val=(key:string)=>text(row[data.mapping[key]]);
      for(const f of meta.fields) if(f.required && !val(f.key)) messages.push(`${f.label} مطلوب`);
      if(data.entity==='customers'||data.entity==='suppliers') { const code=val('code'); const phone=val('phone'); if(!phone) messages.push('رقم الهاتف مطلوب'); const key=code?`code:${code}`:phone?`phone:${phone}`:''; if(key && seen.has(key)) messages.push('سجل مكرر داخل الملف'); if(key) seen.add(key); const bal=val('initialBalance'); if(bal && !Number.isFinite(number(bal))) messages.push('الرصيد الافتتاحي غير صالح'); }
      if(data.entity==='categories'||data.entity==='brands'||data.entity==='warehouses') { const name=val('name').toLocaleLowerCase(); if(name&&seen.has(name)) messages.push('اسم مكرر داخل الملف'); if(name)seen.add(name); }
      if(data.entity==='employees') { const phone=val('phone'); if(phone&&seen.has(phone))messages.push('رقم هاتف مكرر داخل الملف'); if(phone)seen.add(phone); const salary=val('baseSalary'); if(salary&&!Number.isFinite(number(salary)))messages.push('الراتب غير صالح'); }
      if(data.entity==='products') { for(const k of ['piecesPerBox','metersPerBox','sellingPriceM2']) if(!Number.isFinite(number(row[data.mapping[k]]))||number(row[data.mapping[k]])<=0)messages.push(`${meta.fields.find(f=>f.key===k)?.label} يجب أن يكون أكبر من صفر`); const sku=val('sku');if(sku&&seen.has(sku))messages.push('كود مكرر داخل الملف');if(sku)seen.add(sku); }
      if(messages.length)issues.push({row:i+2,messages});
    }); return issues;
  }

  import(data: ParsedImport, issues: ImportIssue[], options: { allowInitialBalances: boolean; allowProductStock: boolean }): { created: number; skipped: number; errors: ImportIssue[] } {
    if (data.entity === 'dynamic') throw new Error('استخدم مسار استيراد البيانات المرنة لهذا الملف.');
    const actor=AuthService.requireAuth(); PermissionService.require(actor, ENTITY_META[data.entity].permission);
    const issueMap=new Map(issues.map(x=>[x.row,x.messages])); let created=0,skipped=0; const errors:ImportIssue[]=[];
    const db=DatabaseManager.getInstance(); const customers=new CustomerService(); const suppliers=new SupplierService(); const categories=new CategoryService(); const brands=new BrandService(); const products=new ProductService(); const ops=new OperationsService();
    const categorySet=new Set(categories.getAllCategories().map(x=>x.name.trim().toLowerCase())); const brandSet=new Set(brands.getAllBrands().map(x=>x.name.trim().toLowerCase()));
    data.rows.forEach((row,i)=>{ const rowNumber=i+2; const bad=issueMap.get(rowNumber); if(bad?.length){skipped++;errors.push({row:rowNumber,messages:bad});return;} const val=(k:string)=>text(row[data.mapping[k]]); const opt=(k:string)=>val(k)||undefined; const num=(k:string, fallback=0)=>Number.isFinite(number(row[data.mapping[k]]))?number(row[data.mapping[k]]):fallback;
      try {
        switch(data.entity){
          case 'customers': { const code=opt('code'); if((code&&db.query('SELECT id FROM customers WHERE code=?',[code]).length)||db.query('SELECT id FROM customers WHERE phone=? AND phone <> \'\'',[val('phone')]).length)throw new Error('العميل موجود بالفعل حسب الكود أو الهاتف'); const newCust=customers.createCustomer({code:code||'',name:val('name'),phone:val('phone'),phone2:opt('phone2'),nationalId:opt('nationalId'),address:opt('address'),city:opt('city'),customerType:(['RETAIL','CONTRACTOR','WHOLESALE','ENGINEER'].includes(val('customerType').toUpperCase())?val('customerType').toUpperCase():'RETAIL') as any,creditLimit:num('creditLimit'),initialBalance:options.allowInitialBalances?num('initialBalance'):0,notes:opt('notes')}); { const missing=[]; if(!opt('nationalId'))missing.push('الرقم القومي'); if(!opt('address'))missing.push('العنوان'); if(!opt('city'))missing.push('المدينة'); if(!opt('phone2'))missing.push('هاتف إضافي'); if(missing.length>0)try{new NotificationService().notifyIncompleteCustomer(newCust.id,newCust.name,missing);}catch{} } break; }
          case 'suppliers': { const code=opt('code'); if((code&&db.query('SELECT id FROM suppliers WHERE code=?',[code]).length)||db.query('SELECT id FROM suppliers WHERE phone=? AND phone <> \'\'',[val('phone')]).length)throw new Error('المورد موجود بالفعل حسب الكود أو الهاتف'); suppliers.createSupplier({code:code||'',name:val('name'),companyName:opt('companyName'),phone:val('phone'),email:opt('email'),taxNumber:opt('taxNumber'),commercialRecord:opt('commercialRecord'),address:opt('address'),paymentTermsDays:num('paymentTermsDays',30),initialBalance:options.allowInitialBalances?num('initialBalance'):0,notes:opt('notes')});break; }
          case 'categories': {if(categorySet.has(val('name').toLowerCase()))throw new Error('التصنيف موجود بالفعل');categories.createCategory(val('name'),undefined,opt('description'));categorySet.add(val('name').toLowerCase());break;}
          case 'brands': {if(brandSet.has(val('name').toLowerCase()))throw new Error('الماركة موجودة بالفعل');brands.createBrand(val('name'),opt('country'));brandSet.add(val('name').toLowerCase());break;}
          case 'warehouses': {if(ops.getWarehouses().some(x=>x.name.trim().toLowerCase()===val('name').toLowerCase()))throw new Error('المخزن موجود بالفعل');ops.createWarehouse({name:val('name'),location:opt('location')});break;}
          case 'employees': {if(db.query('SELECT id FROM employees WHERE phone=? AND phone <> \'\'',[val('phone')]).length)throw new Error('الموظف موجود بالفعل بهذا الهاتف'); EmployeeService.create({name:val('name'),phone:val('phone'),email:val('email'),role:val('role')||'موظف',location:val('location'),baseSalary:num('baseSalary'),salaryType:val('salaryType').toUpperCase()==='DAILY'?'DAILY':'MONTHLY',status:'ACTIVE',joinedDate:opt('joinedDate')||localDateString(),notes:val('notes')});break;}
          case 'products': { if(!categorySet.has(val('category').toLowerCase()))throw new Error(`التصنيف غير موجود: ${val('category')}`); if(!brandSet.has(val('brand').toLowerCase()))throw new Error(`الماركة غير موجودة: ${val('brand')}`); const category=categories.getAllCategories().find(x=>x.name.trim().toLowerCase()===val('category').toLowerCase())!;const brand=brands.getAllBrands().find(x=>x.name.trim().toLowerCase()===val('brand').toLowerCase())!;const sku=val('sku'),meters=num('metersPerBox'),price=num('sellingPriceM2'),cost=num('costPrice'); const openingQty=options.allowProductStock?num('initialStockM2'):0; const warehouse=openingQty>0?ops.getWarehouses().find(w=>w.isActive):undefined; if(openingQty>0&&!warehouse)throw new Error('لا يوجد مخزن نشط لتسجيل الرصيد الافتتاحي');products.createProduct({sku,barcode:val('barcode')||sku,name:val('name'),categoryId:category.id,brandId:brand.id,grade:(['GRADE_1','GRADE_2','GRADE_3','COMMERCIAL'].includes(val('grade').toUpperCase())?val('grade').toUpperCase():'GRADE_1') as any,size:val('size'),baseUnit:'M2',sellUnit:'M2',piecesPerBox:num('piecesPerBox'),metersPerBox:meters,costPrice:cost,sellingPriceM2:price,sellingPriceBox:price*meters,wholesalePriceM2:num('wholesalePriceM2',price),minSellingPriceM2:num('minSellingPriceM2',cost),minStockLevel:0,isActive:true} as any, openingQty>0&&warehouse?{warehouseId:warehouse.id,quantityM2:openingQty,unitCost:cost}:undefined);break;}
        } created++;
      } catch(e:any){skipped++;errors.push({row:rowNumber,messages:[e?.message||'تعذر استيراد الصف']});}
    }); return {created,skipped,errors};
  }
}
