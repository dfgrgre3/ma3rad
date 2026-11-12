import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { localDateString } from '../../../utils/shared/date';
import { BrandService } from '../products/BrandService';
import { CategoryService } from '../products/CategoryService';
import { OperationalFieldService } from '../products/OperationalFieldService';
import { ProductService } from '../products/ProductService';
import { CustomerService } from '../customers/CustomerService';
import { SupplierService } from '../suppliers/SupplierService';
import { EmployeeService } from '../hr/EmployeeService';
import { OperationsService } from '../operations/OperationsService';
import { NotificationService } from '../notifications/NotificationService';
import type { ExistingImportEntity, ImportOptions, ImportRowValues } from './dataImportTypes';

type ImportContext = {
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
};

export class DataImportEntityWriter {
  createContext(options: ImportOptions): ImportContext {
    const categories = new CategoryService();
    const brands = new BrandService();
    return {
      db: DatabaseManager.getInstance(),
      customers: new CustomerService(),
      suppliers: new SupplierService(),
      categories,
      brands,
      products: new ProductService(),
      operations: new OperationsService(),
      categorySet: new Set(categories.getAllCategories().map((category) => category.name.trim().toLowerCase())),
      brandSet: new Set(brands.getAllBrands().map((brand) => brand.name.trim().toLowerCase())),
      options,
    };
  }

  importRow(entity: ExistingImportEntity, values: ImportRowValues, context: ImportContext): string | undefined {
    switch (entity) {
      case 'customers':
        return this.importCustomer(values, context);
      case 'suppliers':
        this.importSupplier(values, context);
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

  getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message || 'تعذر استيراد الصف';
    }
    return 'تعذر استيراد الصف';
  }

  private importCustomer(values: ImportRowValues, context: ImportContext): string {
    const code = values.opt('code');
    const phone = values.val('phone');
    if ((code && context.db.query('SELECT id FROM customers WHERE code=?', [code]).length)
      || context.db.query('SELECT id FROM customers WHERE phone=? AND phone <> \'\'', [phone]).length) {
      throw new Error('العميل موجود بالفعل حسب الكود أو الهاتف');
    }

    const customer = context.customers.createCustomer({
      code: code || '',
      name: values.val('name'),
      phone,
      phone2: values.opt('phone2'),
      nationalId: values.opt('nationalId'),
      address: values.opt('address'),
      city: values.opt('city'),
      customerType: this.getCustomerType(values.val('customerType')) as any,
      creditLimit: values.num('creditLimit'),
      initialBalance: context.options.allowInitialBalances ? values.num('initialBalance') : 0,
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

  private importSupplier(values: ImportRowValues, context: ImportContext): void {
    const code = values.opt('code');
    const phone = values.val('phone');
    if ((code && context.db.query('SELECT id FROM suppliers WHERE code=?', [code]).length)
      || context.db.query('SELECT id FROM suppliers WHERE phone=? AND phone <> \'\'', [phone]).length) {
      throw new Error('المورد موجود بالفعل حسب الكود أو الهاتف');
    }

    context.suppliers.createSupplier({
      code: code || '',
      name: values.val('name'),
      companyName: values.opt('companyName'),
      phone,
      email: values.opt('email'),
      taxNumber: values.opt('taxNumber'),
      commercialRecord: values.opt('commercialRecord'),
      address: values.opt('address'),
      paymentTermsDays: values.num('paymentTermsDays', 30),
      initialBalance: context.options.allowInitialBalances ? values.num('initialBalance') : 0,
      notes: values.opt('notes'),
    });
  }

  private importCategory(
    values: ImportRowValues,
    categories: CategoryService,
    categorySet: Set<string>,
  ): void {
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
    if (operations.getWarehouses().some((warehouse) => warehouse.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new Error('المخزن موجود بالفعل');
    }
    operations.createWarehouse({ name, location: values.opt('location') });
  }

  private importEmployee(values: ImportRowValues, db: ImportContext['db']): void {
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

  private importProduct(values: ImportRowValues, context: ImportContext): string {
    const categoryName = values.val('category');
    const brandName = values.val('brand');
    const normalizedCategory = categoryName.toLowerCase();
    const normalizedBrand = brandName.toLowerCase();
    if (!context.categorySet.has(normalizedCategory)) throw new Error(`التصنيف غير موجود: ${categoryName}`);
    if (!context.brandSet.has(normalizedBrand)) throw new Error(`الماركة غير موجودة: ${brandName}`);

    const category = context.categories.getAllCategories()
      .find((item) => item.name.trim().toLowerCase() === normalizedCategory)!;
    const brand = context.brands.getAllBrands()
      .find((item) => item.name.trim().toLowerCase() === normalizedBrand)!;
    const sku = values.val('sku');
    const metersPerBox = values.num('metersPerBox');
    const sellingPriceM2 = values.num('sellingPriceM2');
    const costPrice = values.num('costPrice');
    const openingQuantity = context.options.allowProductStock ? values.num('initialStockM2') : 0;
    const warehouse = openingQuantity > 0
      ? context.operations.getWarehouses().find(
        (item) => item.id === context.options.openingStockWarehouseId && item.isActive,
      )
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
}
