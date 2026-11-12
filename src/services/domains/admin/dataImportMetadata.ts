import type { ImportEntity, ImportField } from './dataImportTypes';

export const ENTITY_META: Record<Exclude<ImportEntity, 'dynamic'>, {
  label: string;
  permission: string;
  fields: ImportField[];
}> = {
  customers: {
    label: 'العملاء',
    permission: 'customers.create',
    fields: [
      { key: 'name', label: 'اسم العميل', aliases: ['name', 'customer', 'customer name', 'اسم العميل', 'العميل', 'الاسم'], required: true },
      { key: 'code', label: 'كود العميل', aliases: ['code', 'customer code', 'كود العميل', 'الكود'] },
      { key: 'phone', label: 'الهاتف', aliases: ['phone', 'mobile', 'telephone', 'الهاتف', 'الموبايل', 'رقم الهاتف'], required: true },
      { key: 'phone2', label: 'هاتف إضافي', aliases: ['phone2', 'secondary phone', 'هاتف إضافي', 'هاتف اضافي'] },
      { key: 'nationalId', label: 'الرقم القومي', aliases: ['national id', 'national_id', 'الرقم القومي'] },
      { key: 'address', label: 'العنوان', aliases: ['address', 'العنوان'] },
      { key: 'city', label: 'المدينة', aliases: ['city', 'المدينة'] },
      { key: 'customerType', label: 'نوع العميل', aliases: ['customer type', 'type', 'نوع العميل'] },
      { key: 'creditLimit', label: 'حد الائتمان', aliases: ['credit limit', 'credit_limit', 'حد الائتمان'] },
      { key: 'initialBalance', label: 'رصيد افتتاحي', aliases: ['initial balance', 'opening balance', 'الرصيد الافتتاحي', 'رصيد افتتاحي'] },
      { key: 'notes', label: 'ملاحظات', aliases: ['notes', 'ملاحظات'] },
    ],
  },
  suppliers: {
    label: 'الموردون',
    permission: 'suppliers.create',
    fields: [
      { key: 'name', label: 'اسم المورد', aliases: ['name', 'supplier', 'supplier name', 'اسم المورد', 'المورد', 'الاسم'], required: true },
      { key: 'code', label: 'كود المورد', aliases: ['code', 'supplier code', 'كود المورد', 'الكود'] },
      { key: 'companyName', label: 'الشركة', aliases: ['company', 'company name', 'company_name', 'الشركة'] },
      { key: 'phone', label: 'الهاتف', aliases: ['phone', 'mobile', 'الهاتف', 'الموبايل', 'رقم الهاتف'], required: true },
      { key: 'email', label: 'البريد الإلكتروني', aliases: ['email', 'البريد الإلكتروني', 'البريد الالكتروني'] },
      { key: 'taxNumber', label: 'الرقم الضريبي', aliases: ['tax number', 'tax_number', 'الرقم الضريبي'] },
      { key: 'commercialRecord', label: 'السجل التجاري', aliases: ['commercial record', 'commercial_record', 'السجل التجاري'] },
      { key: 'address', label: 'العنوان', aliases: ['address', 'العنوان'] },
      { key: 'paymentTermsDays', label: 'مدة السداد بالأيام', aliases: ['payment terms', 'payment terms days', 'مدة السداد بالأيام', 'مدة السداد'] },
      { key: 'initialBalance', label: 'رصيد افتتاحي', aliases: ['initial balance', 'opening balance', 'الرصيد الافتتاحي', 'رصيد افتتاحي'] },
      { key: 'notes', label: 'ملاحظات', aliases: ['notes', 'ملاحظات'] },
    ],
  },
  categories: {
    label: 'التصنيفات',
    permission: 'categories.create',
    fields: [
      { key: 'name', label: 'اسم التصنيف', aliases: ['name', 'category', 'category name', 'اسم التصنيف', 'التصنيف', 'الاسم'], required: true },
      { key: 'description', label: 'الوصف', aliases: ['description', 'الوصف'] },
    ],
  },
  brands: {
    label: 'الماركات',
    permission: 'brands.create',
    fields: [
      { key: 'name', label: 'اسم الماركة', aliases: ['name', 'brand', 'brand name', 'اسم الماركة', 'الماركة', 'الاسم'], required: true },
      { key: 'country', label: 'بلد المنشأ', aliases: ['country', 'بلد المنشأ', 'البلد'] },
    ],
  },
  products: {
    label: 'الأصناف والسيراميك والمنتجات',
    permission: 'products.create',
    fields: [
      { key: 'sku', label: 'الكود', aliases: ['sku', 'code', 'product code', 'الكود', 'كود الصنف', 'كود المنتج'], required: true },
      { key: 'barcode', label: 'الباركود', aliases: ['barcode', 'bar code', 'الباركود'] },
      { key: 'name', label: 'اسم الصنف', aliases: ['name', 'product', 'product name', 'item name', 'اسم الصنف', 'اسم المنتج', 'الصنف', 'المنتج'], required: true },
      { key: 'category', label: 'التصنيف الموجود', aliases: ['category', 'category name', 'التصنيف', 'الفئة'], required: true },
      { key: 'brand', label: 'الماركة الموجودة', aliases: ['brand', 'brand name', 'الماركة', 'العلامة التجارية'], required: true },
      { key: 'grade', label: 'الفرز', aliases: ['grade', 'الفرز', 'الدرجة'] },
      { key: 'size', label: 'المقاس', aliases: ['size', 'المقاس'], required: true },
      { key: 'piecesPerBox', label: 'قطع بالكرتونة', aliases: ['pieces per box', 'pieces_per_box', 'قطع بالكرتونة', 'قطع/كرتونة', 'عدد القطع'], required: true },
      { key: 'metersPerBox', label: 'متر مربع بالكرتونة', aliases: ['meters per box', 'meters_per_box', 'متر مربع بالكرتونة', 'م²/كرتونة', 'متر/كرتونة', 'المتر/كرتونة', 'المترات'], required: true },
      { key: 'costPrice', label: 'سعر التكلفة', aliases: ['cost price', 'cost_price', 'التكلفة', 'سعر التكلفة'], required: true },
      { key: 'sellingPriceM2', label: 'سعر البيع للمتر', aliases: ['selling price', 'selling_price_m2', 'سعر المتر', 'سعر البيع', 'سعر البيع للمتر'], required: true },
      { key: 'wholesalePriceM2', label: 'سعر الجملة', aliases: ['wholesale price', 'wholesale_price_m2', 'سعر الجملة'] },
      { key: 'minSellingPriceM2', label: 'أقل سعر', aliases: ['min price', 'min_selling_price_m2', 'أقل سعر', 'الحد الأدنى للسعر'] },
      { key: 'initialStockM2', label: 'رصيد افتتاحي بالمتر', aliases: ['stock', 'initial stock', 'initial_stock', 'المخزون', 'الكمية', 'رصيد افتتاحي بالمتر'] },
    ],
  },
  employees: {
    label: 'الموظفون',
    permission: 'employees.manage',
    fields: [
      { key: 'name', label: 'اسم الموظف', aliases: ['name', 'employee', 'employee name', 'اسم الموظف', 'الموظف', 'الاسم'], required: true },
      { key: 'phone', label: 'الهاتف', aliases: ['phone', 'mobile', 'الهاتف', 'الموبايل'], required: true },
      { key: 'email', label: 'البريد الإلكتروني', aliases: ['email', 'البريد الإلكتروني', 'البريد الالكتروني'] },
      { key: 'role', label: 'الوظيفة', aliases: ['role', 'job title', 'job_title', 'الوظيفة', 'المسمى الوظيفي'] },
      { key: 'location', label: 'الموقع', aliases: ['location', 'branch', 'الموقع', 'الفرع'] },
      { key: 'baseSalary', label: 'الراتب الأساسي', aliases: ['salary', 'base salary', 'base_salary', 'الراتب', 'الراتب الأساسي'] },
      { key: 'salaryType', label: 'دورية الراتب', aliases: ['salary type', 'salary_type', 'دورية الراتب'] },
      { key: 'joinedDate', label: 'تاريخ التعيين', aliases: ['joined date', 'joined_date', 'hire date', 'تاريخ التعيين'] },
      { key: 'notes', label: 'ملاحظات', aliases: ['notes', 'ملاحظات'] },
    ],
  },
  warehouses: {
    label: 'المخازن',
    permission: 'warehouses.manage',
    fields: [
      { key: 'name', label: 'اسم المخزن', aliases: ['name', 'warehouse', 'warehouse name', 'اسم المخزن', 'المخزن', 'الاسم'], required: true },
      { key: 'location', label: 'الموقع', aliases: ['location', 'الموقع', 'العنوان'] },
    ],
  },
};
