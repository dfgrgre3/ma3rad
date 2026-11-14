import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package, Plus, Search, Layers, AlertTriangle, X,
  Boxes, Ruler, CheckCircle, Banknote, Loader2, Download, PackagePlus,
  Upload, FileSpreadsheet, GitBranch,
  LayoutGrid, List, XCircle, RefreshCw, Filter
} from 'lucide-react';
import { ProductService, ProductStats } from '../../services/domains/products/ProductService';
import { ProductFormPreferencesService } from '../../services/domains/products/ProductFormPreferencesService';
import { InventoryService } from '../../services/domains/inventory/InventoryService';
import { CategoryService, CategoryWithCount } from '../../services/domains/products/CategoryService';
import { BrandService, BrandWithCount } from '../../services/domains/products/BrandService';
import { AttributeService, AttributeCategory } from '../../services/domains/products/AttributeService';
import { OperationalFieldService, type OperationalFieldDefinition, type ProductGradeOption } from '../../services/domains/products/OperationalFieldService';
import { ProductExtraService, ProductImage } from '../../services/domains/products/ProductExtraService';
import { normalizeDynamicAttributeValue } from '../../services/domains/products/dynamicAttributes';
import { Product, CeramicGrade, Warehouse } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { getProductUnitLabel } from '../../utils/products/productUnits';
import { exportToExcel } from '../../utils/export/export';
import { SettingsService } from '../../services/domains/config/SettingsService';
import { getEffectiveBusinessType } from '../../services/domains/config/BusinessTypeService';
import { BusinessProfileService } from '../../services/domains/config/BusinessProfileService';
import { parseSpreadsheetBuffer } from '../../services/infrastructure/data/SpreadsheetImportService';
import { DatabaseManager } from '../../database/repositories/databaseManager';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { parseBusinessConfiguration } from '../../config/businessProfiles';
import { useBusinessProfileMeta, useBusinessTerm } from '../../hooks/domains/config/useBusinessTerm';
import { useToast } from '../ui/Toast';
import { CentralLimitGuard } from '../ui/CentralLimitGuard';
import { FilterToolbar } from '../ui/FilterToolbar';
import { FormField } from '../ui/FormField';
import {
  GRADES, SURFACES, UNITS, calcMetersFromSize, emptyProductEntryForm, emptyVariant,
  parseGrade, pickCell, round, unitLabelFor, setConfiguredGradeLabels,
  type FormState, type OpeningStockRow, type ProductEntryFormState, type TabId, type VariantDraft,
} from './productFormModel';
import { Field, ListPagination, StatCard } from './ProductUi';
import { ProductFormModal } from './ProductFormModal';
import { ProductsTable } from './ProductsTable';
import { ProductsCards } from './ProductsCards';

const PRODUCT_FORM_DEFAULT_FIELDS: readonly (keyof ProductEntryFormState)[] = [
  'productType', 'name', 'categoryId', 'brandId', 'grade', 'size', 'thickness',
  'color', 'tone', 'finish', 'surfaceLocation', 'baseUnit', 'sellUnit',
  'customUnit', 'piecesPerBox', 'metersPerBox', 'weightPerBox', 'costPrice',
  'sellingPriceM2', 'sellingPriceBox', 'wholesalePriceM2', 'minSellingPriceM2',
  'minStockLevel', 'maxStockLevel', 'notes',
];
const PRODUCT_FORM_FIELD_LABELS: Record<keyof FormState, string> = {
  productType: 'نوع الصنف',
  name: 'اسم الصنف',
  sku: 'كود الصنف',
  barcode: 'الباركود',
  categoryId: 'نوع المنتج (التصنيف)',
  brandId: 'الماركة / المصنع',
  grade: 'الفرز والدرجة',
  size: 'المقاس',
  thickness: 'السمك',
  color: 'اللون',
  tone: 'التون',
  finish: 'التشطيب',
  surfaceLocation: 'الاستخدام / السطح',
  baseUnit: 'وحدة الأساس',
  sellUnit: 'وحدة البيع',
  customUnit: 'اسم الوحدة',
  piecesPerBox: 'عدد القطع بالكرتونة',
  metersPerBox: 'المترات بالكرتونة',
  weightPerBox: 'وزن الكرتونة',
  costPrice: 'سعر الشراء / التكلفة',
  sellingPriceM2: 'سعر البيع',
  sellingPriceBox: 'سعر الكرتونة',
  wholesalePriceM2: 'سعر الجملة',
  minSellingPriceM2: 'الحد الأدنى لسعر البيع',
  minStockLevel: 'حد الطلب الأدنى',
  maxStockLevel: 'الحد الأقصى للمخزون',
  notes: 'ملاحظات',
};
const isProductFormDefaultField = (field: string): field is keyof ProductEntryFormState =>
  PRODUCT_FORM_DEFAULT_FIELDS.some((candidate) => candidate === field);

const applyRememberedFormFields = (
  form: ProductEntryFormState,
  preferences: Record<string, string | number>,
  categories: CategoryWithCount[],
  brands: BrandWithCount[],
): ProductEntryFormState => {
  const next = { ...form };
  for (const field of PRODUCT_FORM_DEFAULT_FIELDS) {
    const value = preferences[field];
    if (value === undefined || typeof value !== typeof next[field]) continue;
    if (field === 'categoryId' && !categories.some((category) => category.id === value)) continue;
    if (field === 'brandId' && value !== '' && !brands.some((brand) => brand.id === value)) continue;
    if (field === 'productType' && value !== 'CERAMIC' && value !== 'GENERAL') continue;
    if (field === 'grade' && typeof value !== 'string') continue;
    if (field === 'surfaceLocation' && !SURFACES.some((surface) => surface.value === value)) continue;
    if ((field === 'baseUnit' || field === 'sellUnit')
      && !UNITS.some((unit) => unit.value === value)
      && !(value === 'CUSTOM')) continue;
    Object.assign(next, { [field]: value });
  }
  return next;
};

const _normalizeImportNumber = (value: string): number =>
  Number(
    value
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
      .replace(/[٬,]/g, '')
      .replace(/[٫]/g, '.')
      .trim(),
  );

/**
 * يقرأ خلية رقمية بشكل صارم: أي قيمة فارغة أو غير رقمية أو غير منتهية
 * أو أقل من الحد الأدنى أو غير صحيحة (إن طُلب) تُفشل الصف بخطأ.
 * لا توجد أي قيمة افتراضية — كل قيمة يجب أن تكون حقيقية من الملف.
 */
const readImportNumber = (
row: Record<string, unknown>, keys: string[], label: string, p0: number, options: { min?: number; max?: number; integer?: boolean; } = {},
): number => {
  const raw = pickCell(row, keys);

  // لا fallback: القيمة الفارغة أو المفقودة = خطأ
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    throw new Error(`قيمة «${label}» مطلوبة ولم يتم العثور عليها في الصف`);
  }

  const text = String(raw).trim();

  // رفض أي شيء ليس رقمًا عشريًا/صحيحًا صريحًا (يمنع 0x10 و 1e5 الغريبة إن أردت)
  // لو عايز تسمح بالأس العلمي (1e5) شيل هذا الشرط
  const cleaned = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٬,]/g, '')
    .replace(/[٫]/g, '.');

  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(cleaned)) {
    throw new Error(`قيمة «${label}» غير صالحة: ${text}`);
  }

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) {
    throw new Error(`قيمة «${label}» غير صالحة: ${text}`);
  }
  if (options.min !== undefined && parsed < options.min) {
    throw new Error(`قيمة «${label}» أقل من الحد الأدنى (${options.min}): ${text}`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw new Error(`قيمة «${label}» أكبر من الحد الأقصى (${options.max}): ${text}`);
  }
  if (options.integer && !Number.isInteger(parsed)) {
    throw new Error(`قيمة «${label}» يجب أن تكون عددًا صحيحًا: ${text}`);
  }

  return parsed;
};
export const ProductsView: React.FC = () => {
  const productsLabel = useBusinessTerm('entities.products.plural');
  const productSingularLabel = useBusinessTerm('entities.products.singular');
  const { label: businessProfileLabel } = useBusinessProfileMeta();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [brands, setBrands] = useState<BrandWithCount[]>([]);
  const [attributes, setAttributes] = useState<AttributeCategory[]>([]);
  const [operationalFields, setOperationalFields] = useState<OperationalFieldDefinition[]>([]);
  const [operationalFieldValues, setOperationalFieldValues] = useState<Record<string, string>>({});
  const [gradeOptions, setGradeOptions] = useState<ProductGradeOption[]>([]);
  const [operationalValuesByProduct, setOperationalValuesByProduct] = useState<Record<string, Record<string, string>>>({});
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedCustomField, setSelectedCustomField] = useState('');
  const [selectedCustomFieldValue, setSelectedCustomFieldValue] = useState('');
  const [stockStatus, setStockStatus] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'newest' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc'>('name');
  const [productStatus, setProductStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => localStorage.getItem('products_view_mode') === 'cards' ? 'cards' : 'table');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [toneOptions, setToneOptions] = useState<string[]>([]);
  const [rememberedFields, setRememberedFields] = useState<Record<string, string | number>>({});

  const [formData, setFormData] = useState<ProductEntryFormState>(emptyProductEntryForm());
  const [businessConfig] = useState(() => {
    const type = getEffectiveBusinessType();
    return parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), type);
  });
  const [openingRows, setOpeningRows] = useState<OpeningStockRow[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});
  const [existingImages, setExistingImages] = useState<ProductImage[]>([]);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [editStock, setEditStock] = useState<{ warehouseName: string; quantityM2: number }[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const profileUnitOptions = useMemo(() => {
    const options = UNITS.filter((unit) => businessConfig.units.includes(unit.value));
    if (businessConfig.customUnits.length > 0) options.push({ value: 'CUSTOM', label: 'وحدة مخصصة' });
    if (formData.baseUnit && !options.some((unit) => unit.value === formData.baseUnit)) {
      const existing = UNITS.find((unit) => unit.value === formData.baseUnit);
      options.push(existing || { value: formData.baseUnit, label: unitLabelFor(formData.baseUnit, formData.customUnit) });
    }
    return options;
  }, [businessConfig, formData.baseUnit, formData.customUnit]);

  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockReason, setStockReason] = useState('إضافة كمية للمخزون');
  const [stockRows, setStockRows] = useState<{ warehouseId: string; warehouseName: string; currentM2: number; addBoxes: number }[]>([]);
  const [stockSaving, setStockSaving] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();
  const toast = useToast();
  const permissionUser = AuthService.getCurrentUser();
  // صلاحيات دقيقة لكل زر، مع توافق خلفي تلقائي مع products.* القديمة.
  const canCreateProduct = PermissionService.can(permissionUser, 'ui.products.catalog.create');
  const canUpdateProduct = PermissionService.can(permissionUser, 'ui.products.catalog.update');
  const canDeleteProduct = PermissionService.can(permissionUser, 'ui.products.catalog.delete');
  const canExportProducts = PermissionService.can(permissionUser, 'ui.products.catalog.export');
  const canImportProducts = PermissionService.can(permissionUser, 'ui.products.catalog.import');
  const canAdjustInventory = PermissionService.can(permissionUser, 'inventory.adjust');
  const canCreateCategory = PermissionService.can(permissionUser, 'ui.categories.categories.create');
  const canCreateBrand = PermissionService.can(permissionUser, 'ui.brands.brands.create');
  const canViewCosts = PermissionService.can(permissionUser, 'ui.finance.overview.view');
  const canViewPricing = PermissionService.can(permissionUser, 'ui.pricing.pricing.view');
  const canUpdatePricing = PermissionService.can(permissionUser, 'ui.pricing.pricing.update');
  const canManagePricing = editingProduct ? canUpdatePricing : canCreateProduct;

  const productService = useMemo(() => new ProductService(), []);
  const productFormPreferences = useMemo(() => new ProductFormPreferencesService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const categoryService = useMemo(() => new CategoryService(), []);
  const brandService = useMemo(() => new BrandService(), []);
  const attributeService = useMemo(() => new AttributeService(), []);
  const operationalFieldService = useMemo(() => new OperationalFieldService(), []);
  const extraService = useMemo(() => new ProductExtraService(), []);

  const loadLookups = useCallback(() => {
    try {
      setCategories(categoryService.getAllCategories());
      setBrands(brandService.getAllBrands());
      setWarehouses(inventoryService.getAllWarehouses());
      // Older installations saved a profile before attributes were materialized;
      // applying it here is idempotent and additive, and only for users who are
      // allowed to create products.
      if (PermissionService.can(AuthService.getCurrentUser(), 'ui.products.catalog.create')) {
        BusinessProfileService.applyFromSettings();
      }
      setAttributes(attributeService.getCategories());
      setOperationalFields(operationalFieldService.getDefinitions('products'));
      const configuredGrades = operationalFieldService.getProductGradeOptions(true);
      setGradeOptions(configuredGrades.length ? configuredGrades : GRADES.map((item, index) => ({
        ...item, isActive: true, sortOrder: index,
      })));
      setConfiguredGradeLabels(configuredGrades);
    } catch (e) {
      console.error(e);
    }
  }, [attributeService, brandService, categoryService, inventoryService, operationalFieldService]);

  const loadStats = useCallback(() => {
    try {
      setStats(productService.getProductStats());
    } catch (e) {
      console.error(e);
    }
  }, [productService]);

  const loadProducts = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = productService.getProductsPage(
        search,
        selectedCategory || undefined,
        selectedBrand || undefined,
        page,
        pageSize,
        {
          grade: selectedGrade || undefined,
          customFieldFilters: selectedCustomField && selectedCustomFieldValue
            ? { [selectedCustomField]: selectedCustomFieldValue }
            : undefined,
          stockStatus: stockStatus === 'all' ? undefined : stockStatus,
          sortBy,
          includeInactive: productStatus === 'all',
          status: productStatus,
        },
      );
      setProducts(result.items);
      setOperationalValuesByProduct(operationalFieldService.getRecordValuesForExport(
        'products', result.items.map((product) => product.id),
      ));
      setPage(result.page);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (e: any) {
      console.error(e);
      setLoadError(e?.message || 'تعذر تحميل الأصناف');
    } finally {
      setIsLoading(false);
    }
  }, [search, selectedCategory, selectedBrand, page, pageSize, selectedGrade, selectedCustomField, selectedCustomFieldValue, stockStatus, sortBy, productStatus, operationalFieldService, productService]);

  useEffect(() => {
    loadLookups();
    loadStats();
  }, [loadLookups, loadStats]);

  useEffect(() => {
    loadProducts();
  }, [search, selectedCategory, selectedBrand, selectedGrade, selectedCustomField, selectedCustomFieldValue, stockStatus, sortBy, productStatus, page, pageSize, loadProducts]);

  useEffect(() => { setSelectedProductIds([]); }, [search, selectedCategory, selectedBrand, selectedGrade, selectedCustomField, selectedCustomFieldValue, stockStatus, sortBy, productStatus, page, pageSize]);

  useEffect(() => { setPage(1); }, [search, selectedCategory, selectedBrand, selectedGrade, selectedCustomField, selectedCustomFieldValue, stockStatus, sortBy, productStatus]);

  useEffect(() => { localStorage.setItem('products_view_mode', viewMode); }, [viewMode]);

  useEffect(() => {
    const category = searchParams.get('category') || '';
    setSelectedCategory((prev) => (prev === category ? prev : category));
  }, [searchParams]);

  // Dimensions/grade columns only make sense for a ceramic catalogue.
  const hasCeramicRows = products.some((p) => p.productType !== 'GENERAL');

  const stockOf = (p: Product) => {
    const m2 = Number(p.totalStockM2 ?? 0);
    if (p.productType === 'GENERAL') return {
      m2,
      boxes: Number(p.totalStockBoxes ?? (p.baseUnit === 'BOX' ? m2 : 0)),
      pieces: Number(p.totalStockPieces ?? (p.baseUnit === 'PIECE' ? m2 : 0)),
    };
    const metersPerBox = p.metersPerBox || 0;
    const boxes = metersPerBox > 0 ? m2 / metersPerBox : 0;
    const pieces = metersPerBox > 0 ? boxes * (p.piecesPerBox || 0) : 0;
    return { m2, boxes, pieces };
  };

  const stockTone = (p: Product) => {
    const { m2 } = stockOf(p);
    if (m2 <= 0) return 'bg-rose-500/10 text-rose-600';
    if (m2 <= p.minStockLevel) return 'bg-amber-500/10 text-amber-600';
    return 'bg-emerald-500/10 text-emerald-600';
  };

  const defaultOpeningRow = (warehouseId: string): OpeningStockRow => ({ warehouseId, boxes: 0, pieces: 0, meters: 0 });

  const regenerateProductCode = (field: 'sku' | 'barcode', currentValue: string) => {
    try {
      const value = field === 'sku'
        ? productService.generateNextSku(currentValue)
        : productService.generateNextBarcode(currentValue);
      setFormData((current) => ({ ...current, [field]: value }));
    } catch (error) {
      alert(`تعذر توليد ${field === 'sku' ? 'كود الصنف' : 'الباركود'}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleOpenAddModal = () => {
    let preferences: Record<string, string | number>;
    let tones: string[];
    let generatedCodes: { sku: string; barcode: string };
    try {
      preferences = productFormPreferences.getPreferences();
      tones = productFormPreferences.getTones();
      generatedCodes = {
        sku: productService.generateNextSku(),
        barcode: productService.generateNextBarcode(),
      };
    } catch (error) {
      console.error('تعذر تحميل بيانات نموذج الصنف المحفوظة:', error);
      alert(`تعذر تجهيز نموذج الصنف: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    setEditingProduct(null);
    setShowNewCategory(false);
    setShowNewBrand(false);
    setRememberedFields(preferences);
    setToneOptions(tones);
    setActiveTab('basic');
    setVariants([]);
    setRemovedVariantIds([]);
    setAttributeValues({});
    setOperationalFieldValues({});
    setExistingImages([]);
    setPendingImages([]);
    setRemovedImageIds([]);
    setEditStock([]);
    const initialForm = applyRememberedFormFields({
      ...emptyProductEntryForm(),
      ...generatedCodes,
    }, preferences, categories, brands);
    if (!initialForm.grade || !gradeOptions.some((option) => option.value === initialForm.grade && option.isActive)) {
      initialForm.grade = gradeOptions.find((option) => option.isActive)?.value || '';
    }
    const initialAttributes: Record<string, string> = {};
    Object.entries(preferences).forEach(([key, value]) => {
      if (key.startsWith('attribute:') && typeof value === 'string') {
        initialAttributes[key.slice('attribute:'.length)] = value;
      }
    });
    setFormData(initialForm);
    setAttributeValues(initialAttributes);
    setOpeningRows([defaultOpeningRow('')]);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setShowNewCategory(false);
    setShowNewBrand(false);
    setActiveTab('basic');
    setRemovedVariantIds([]);
    setRemovedImageIds([]);
    setPendingImages([]);
    setFormData({
      productType: product.productType || 'CERAMIC',
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      categoryId: product.categoryId,
      brandId: product.brandId || '',
      grade: product.grade,
      size: product.size,
      thickness: product.thickness || 0,
      color: product.color || '',
      tone: product.tone || '',
      finish: product.finish || '',
      surfaceLocation: (product.surfaceLocation || 'FLOOR') as FormState['surfaceLocation'],
      baseUnit: product.baseUnit || 'M2',
      sellUnit: product.sellUnit || 'M2',
      customUnit: product.customUnit || '',
      piecesPerBox: product.piecesPerBox || 1,
      metersPerBox: product.metersPerBox || 0,
      weightPerBox: product.weightPerBox || 0,
      costPrice: product.costPrice || 0,
      sellingPriceM2: product.sellingPriceM2 || 0,
      sellingPriceBox: product.sellingPriceBox || 0,
      wholesalePriceM2: product.wholesalePriceM2 || 0,
      minSellingPriceM2: product.minSellingPriceM2 || 0,
      minStockLevel: product.minStockLevel || 0,
      maxStockLevel: product.maxStockLevel || 0,
      notes: product.notes || '',
    });
    setOpeningRows([]);
    try {
      setVariants(extraService.getVariants(product.id).map((v) => ({
        id: v.id,
        variantName: v.variantName,
        sku: v.sku,
        barcode: v.barcode || '',
        color: v.color || '',
        size: v.size || '',
        grade: v.grade || '',
        costPrice: v.costPrice || 0,
        sellingPriceM2: v.sellingPriceM2 || 0,
      })));
      setAttributeValues(extraService.getAttributeValues(product.id));
      setOperationalFieldValues(operationalFieldService.getRecordValues('products', product.id));
      setExistingImages(extraService.getImages(product.id));
      const summary = productService.getProductStockSummary(product.id);
      setEditStock(summary.byWarehouse.map((w) => ({ warehouseName: w.warehouseName || 'مخزن', quantityM2: w.quantityM2 })));
    } catch (e) {
      console.error(e);
    }
    setIsModalOpen(true);
  };

  const handleSizeChange = (size: string) => {
    const autoMeters = calcMetersFromSize(size, formData.piecesPerBox);
    setFormData((form) => {
      if (autoMeters === null) return { ...form, size };
      return {
        ...form,
        size,
        metersPerBox: autoMeters,
        sellingPriceBox: round(form.sellingPriceM2 * autoMeters),
      };
    });
    setOpeningRows((rows) => rows.map((row) => recalcOpeningRow(
      { piecesPerBox: formData.piecesPerBox },
      autoMeters ?? formData.metersPerBox,
      row,
    )));
  };

  const updateSizeDimension = (dimension: 0 | 1, value: string) => {
    const [width = '', height = ''] = (formData.size || '').split(/[x×*]/i);
    const dimensions = dimension === 0 ? [value, height] : [width, value];
    const size = dimensions[0] && dimensions[1]
      ? `${dimensions[0]}x${dimensions[1]}`
      : dimensions[0] || dimensions[1];
    handleSizeChange(size);
  };

  const handlePiecesPerBoxChange = (pieces: number) => {
    const nextPieces = pieces;
    const autoMeters = calcMetersFromSize(formData.size, nextPieces);
    setFormData((form) => ({
      ...form,
      piecesPerBox: nextPieces,
      metersPerBox: autoMeters ?? form.metersPerBox,
      sellingPriceBox: round(form.sellingPriceM2 * (autoMeters ?? form.metersPerBox)),
    }));
    setOpeningRows((rows) => rows.map((row) => recalcOpeningRow(
      { ...formData, piecesPerBox: nextPieces },
      autoMeters ?? formData.metersPerBox,
      row,
    )));
  };

  const handleMetersPerBoxChange = (meters: number) => {
    setFormData((form) => ({ ...form, metersPerBox: meters, sellingPriceBox: round(form.sellingPriceM2 * meters) }));
  };

  const recalcOpeningRow = (form: Pick<ProductEntryFormState, 'piecesPerBox'>, metersPerBox: number, row: OpeningStockRow): OpeningStockRow => ({
    ...row,
    pieces: Math.round(row.boxes * (form.piecesPerBox || 0)),
    meters: round(row.boxes * (metersPerBox || 0), 3),
  });

  const setOpeningBy = (index: number, basis: 'boxes' | 'pieces' | 'meters', value: number) => {
    setOpeningRows((rows) => rows.map((row, i) => {
      if (i !== index) return row;
      const metersPerBox = formData.metersPerBox || 0;
      const piecesPerBox = formData.piecesPerBox || 0;
      let boxes = row.boxes;
      if (basis === 'boxes') boxes = value;
      else if (basis === 'pieces') boxes = piecesPerBox > 0 ? value / piecesPerBox : 0;
      else boxes = metersPerBox > 0 ? value / metersPerBox : 0;
      const safeBoxes = Math.max(0, round(boxes, 3));
      return recalcOpeningRow(formData, metersPerBox, { ...row, boxes: safeBoxes });
    }));
  };

  const addOpeningRow = () => {
    setOpeningRows((rows) => [...rows, defaultOpeningRow('')]);
  };

  const removeOpeningRow = (index: number) => {
    setOpeningRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)));
  };

  const handleAddCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    try {
      const created = categoryService.createCategory(name);
      setCategories(categoryService.getAllCategories());
      setFormData((form) => ({ ...form, categoryId: created.id }));
      setNewCategory('');
      setShowNewCategory(false);
    } catch (err: any) {
      alert(`تعذر إضافة النوع: ${err?.message || err}`);
    }
  };

  const handleAddBrand = () => {
    const name = newBrand.trim();
    if (!name) return;
    try {
      const created = brandService.createBrand(name);
      setBrands(brandService.getAllBrands());
      setFormData((form) => ({ ...form, brandId: created.id }));
      setNewBrand('');
      setShowNewBrand(false);
    } catch (err: any) {
      alert(`تعذر إضافة الماركة: ${err?.message || err}`);
    }
  };

  const handleImageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!dataUrl) return;
        if (editingProduct) {
          try {
            const img = extraService.addImage(editingProduct.id, dataUrl, file.name);
            setExistingImages(extraService.getImages(editingProduct.id));
            if (img.isPrimary) {
              productService.updateProduct(editingProduct.id, { imagePath: dataUrl });
            }
          } catch (err: any) {
            alert(`تعذر رفع الصورة: ${err?.message || err}`);
          }
        } else {
          setPendingImages((prev) => [...prev, dataUrl]);
        }
      };
      reader.readAsDataURL(file);
    });
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const removeExistingImage = (image: ProductImage) => {
    setExistingImages((prev) => prev.filter((i) => i.id !== image.id));
    setRemovedImageIds((prev) => [...prev, image.id]);
  };

  const addVariantDraft = () => {
    setVariants((prev) => [...prev, emptyVariant()]);
  };

  const updateVariantDraft = (index: number, patch: Partial<VariantDraft>) => {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const removeVariantDraft = (index: number) => {
    setVariants((prev) => {
      const target = prev[index];
      if (target?.id) setRemovedVariantIds((ids) => [...ids, target.id!]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const syncVariants = (productId: string) => {
    variants.forEach((v) => {
      if (!v.variantName.trim()) return;
      const base = {
        variantName: v.variantName.trim(),
        color: v.color || undefined,
        size: v.size || undefined,
        grade: v.grade || undefined,
        costPrice: v.costPrice || 0,
        sellingPriceM2: v.sellingPriceM2 || 0,
        isActive: true,
      };
      if (v.id) {
        extraService.updateVariant(v.id, base as any);
      } else {
        extraService.createVariant(productId, {
          ...base,
          sku: v.sku || `${formData.sku}-V${Date.now().toString().slice(-4)}`,
          barcode: v.barcode || undefined,
        } as any);
      }
    });
    removedVariantIds.forEach((id) => extraService.deleteVariant(id));
  };

  const isProductFormValid = () => {
    if (!formData.productType) { alert('اختر نوع الصنف.'); return false; }
    if (!formData.name.trim()) { alert('أدخل اسم الصنف.'); return false; }
    if (!formData.categoryId) { alert('اختر نوع المنتج أو أضف نوعًا جديدًا.'); return false; }
    if (formData.productType === 'CERAMIC' && !formData.brandId) { alert('اختر الماركة أو أضف ماركة جديدة.'); return false; }
    if (!formData.baseUnit || !formData.sellUnit) { alert('اختر وحدة الأساس ووحدة البيع.'); return false; }
    if (formData.productType === 'CERAMIC' && (!formData.grade || !formData.surfaceLocation)) {
      alert('اختر درجة الصنف والاستخدام / السطح.');
      return false;
    }
    if (!formData.barcode.trim() || !formData.sku.trim()) { alert('الباركود وكود الصنف مطلوبان.'); return false; }
    const applicableAttributes = attributes.filter(
      (attribute) => !attribute.appliesToCategoryId || attribute.appliesToCategoryId === formData.categoryId,
    );
    try {
      for (const attribute of applicableAttributes) {
        normalizeDynamicAttributeValue(attribute, attributeValues[attribute.id]);
      }
      for (const field of operationalFields) {
        normalizeDynamicAttributeValue(field, operationalFieldValues[field.id]);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'راجع قيم الخصائص الإضافية.');
      return false;
    }
    return true;
  };

  const buildProductPayload = () => {
    const productType = formData.productType;
    const baseUnit = formData.baseUnit;
    const sellUnit = formData.sellUnit;
    if (!productType || !baseUnit || !sellUnit) {
      throw new Error('يجب اختيار نوع الصنف ووحدات القياس قبل الحفظ.');
    }
    let grade: CeramicGrade = 'GRADE_1';
    if (productType === 'CERAMIC') {
      if (!formData.grade) throw new Error('يجب اختيار درجة الصنف قبل الحفظ.');
      grade = formData.grade;
    }
    const surfaceLocation = formData.surfaceLocation || undefined;
    if (productType === 'CERAMIC' && !surfaceLocation) {
      throw new Error('يجب اختيار درجة الصنف والاستخدام / السطح قبل الحفظ.');
    }
    return {
      productType,
      name: formData.name.trim(),
      sku: formData.sku.trim(),
      barcode: formData.barcode.trim(),
      categoryId: formData.categoryId,
      brandId: formData.brandId,
      grade,
      size: productType === 'CERAMIC' ? formData.size : '',
      thickness: formData.thickness,
      color: formData.color,
      tone: formData.tone,
      finish: formData.finish,
      surfaceLocation,
      baseUnit,
      sellUnit,
      customUnit: formData.customUnit,
      piecesPerBox: formData.piecesPerBox,
      metersPerBox: formData.metersPerBox,
      weightPerBox: formData.weightPerBox,
      costPrice: formData.costPrice,
      sellingPriceM2: formData.sellingPriceM2,
      sellingPriceBox: formData.sellingPriceBox,
      wholesalePriceM2: formData.wholesalePriceM2,
      minSellingPriceM2: formData.minSellingPriceM2,
      minStockLevel: formData.minStockLevel,
      maxStockLevel: formData.maxStockLevel,
      notes: formData.notes,
      imagePath: existingImages.find((i) => i.isPrimary)?.filePath || '',
    };
  };

  const saveNewProductImages = (productId: string) => {
    pendingImages.forEach((dataUrl, index) => {
      try {
        extraService.addImage(productId, dataUrl, `صورة ${index + 1}`);
      } catch (err) {
        console.error(err);
      }
    });
    if (pendingImages.length > 0) {
      try {
        productService.updateProduct(productId, { imagePath: pendingImages[0] });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const saveOpeningStock = (productId: string): number => {
    // A business that does not track inventory has no stock to open.
    if (!tracksInventory) return 0;
    const rows = openingRows.filter((row) => row.warehouseId && row.meters > 0);
    rows.forEach((row) => inventoryService.createAdjustment({
      productId,
      warehouseId: row.warehouseId,
      type: 'OPENING_BALANCE',
      quantity: round(row.meters, 3),
      reason: 'رصيد افتتاحي عند تعريف الصنف',
    }));
    return rows.length;
  };

  const saveNewProductDetails = (productId: string): number => {
    saveNewProductImages(productId);
    return saveOpeningStock(productId);
  };

  const handleSaveSelectedProductFields = (fieldKeys: string[]): boolean => {
    try {
      const options = new Set<string>([
        ...PRODUCT_FORM_DEFAULT_FIELDS.map((field) => String(field)),
        ...attributes.map((attribute) => `attribute:${attribute.id}`),
      ]);
      if (fieldKeys.some((key) => !options.has(key))) {
        throw new Error('توجد خانة غير صالحة ضمن الاختيارات.');
      }

      const nextPreferences: Record<string, string | number> = {};
      fieldKeys.forEach((field) => {
        if (field.startsWith('attribute:')) {
          const attributeId = field.slice('attribute:'.length);
          const value = attributeValues[attributeId];
          if (value !== undefined) nextPreferences[field] = value;
        } else if (isProductFormDefaultField(field)) {
          nextPreferences[field] = formData[field];
        }
      });

      productFormPreferences.replacePreferences(nextPreferences);
      setRememberedFields(nextPreferences);
      return true;
    } catch (err) {
      alert(`تعذر حفظ اختيارات الخانات: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  };

  const handleAddTone = (tone: string): boolean => {
    const value = tone.trim();
    if (!value) return false;
    try {
      const savedTone = productFormPreferences.addTone(value);
      const nextOptions = [...toneOptions, savedTone].sort((a, b) => a.localeCompare(b, 'ar'));
      setToneOptions(nextOptions);
      setFormData((current) => ({ ...current, tone: savedTone }));
      return true;
    } catch (error) {
      alert(`تعذر إضافة التون: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const handleDeleteTone = (tone: string) => {
    if (!toneOptions.includes(tone)) return;
    if (!confirm(`حذف التون «${tone}» من قائمة الاختيارات؟ لن تتغير بيانات الأصناف المحفوظة به.`)) return;
    try {
      productFormPreferences.deleteTone(tone);
      setToneOptions((current) => current.filter((item) => item !== tone));
      setRememberedFields((current) => {
        if (current.tone !== tone) return current;
        const next = { ...current };
        delete next.tone;
        return next;
      });
      setFormData((current) => current.tone === tone ? { ...current, tone: '' } : current);
    } catch (error) {
      alert(`تعذر حذف التون: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isProductFormValid()) return;
    setIsSaving(true);
    try {
      const payload = buildProductPayload();
      let openingStockRequests = 0;

      let productId = editingProduct?.id || '';
      if (editingProduct) {
        productService.updateProduct(editingProduct.id, payload);
      } else {
        const created = productService.createProduct({ ...payload, isActive: true });
        productId = created.id;
      }

      if (productId) {
        syncVariants(productId);
        const applicableAttributeIds = new Set(
          attributes
            .filter((attribute) => !attribute.appliesToCategoryId || attribute.appliesToCategoryId === formData.categoryId)
            .map((attribute) => attribute.id),
        );
        extraService.setAttributeValues(productId, Object.fromEntries(
          Object.entries(attributeValues).filter(([attributeId]) => applicableAttributeIds.has(attributeId)),
        ));
        operationalFieldService.setRecordValues(
          'products', productId, operationalFieldValues, editingProduct ? 'update' : 'create',
        );

        removedImageIds.forEach((id) => {
          try { extraService.deleteImage(id); } catch (err) { console.error(err); }
        });
        if (!editingProduct) openingStockRequests = saveNewProductDetails(productId);
      }

      setIsModalOpen(false);
      loadProducts();
      loadStats();
      loadLookups();
      if (openingStockRequests > 0) {
        alert(`تم إنشاء ${openingStockRequests} طلب رصيد افتتاحي، ويظهر في المخزون بعد اعتماده وترحيله.`);
      }
    } catch (err: any) {
      alert(`خطأ: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = (id: string) => {
    if (confirm('هل أنت متأكد من حذف/تعطيل هذا الصنف؟')) {
      try {
        productService.deleteProduct(id);
        loadProducts();
        loadStats();
        loadLookups();
      } catch (err: any) {
        alert(`تعذر الحذف: ${err?.message || err}`);
      }
    }
  };

  const handleDuplicate = (product: Product) => {
    try {
      productService.duplicateProduct(product.id);
      loadProducts();
      loadStats();
      loadLookups();
    } catch (err: any) {
      alert(`تعذر نسخ الصنف: ${err?.message || err}`);
    }
  };

  const handleToggleActive = (product: Product) => {
    try {
      productService.setProductActive(product.id, !product.isActive);
      loadProducts();
      loadStats();
    } catch (err: any) {
      alert(`تعذر تغيير حالة الصنف: ${err?.message || err}`);
    }
  };

  const toggleProductSelection = (id: string) => {
    setSelectedProductIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const togglePageSelection = () => {
    const pageIds = products.map((product) => product.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedProductIds.includes(id));
    setSelectedProductIds((current) => allSelected
      ? current.filter((id) => !pageIds.includes(id))
      : [...new Set([...current, ...pageIds])]);
  };

  const handleBulkStatus = (active: boolean) => {
    const label = active ? 'تفعيل' : 'إيقاف';
    if (selectedProductIds.length === 0 || !confirm(`${label} ${selectedProductIds.length} صنف؟`)) return;
    try {
      selectedProductIds.forEach((id) => productService.setProductActive(id, active));
      setSelectedProductIds([]);
      loadProducts();
      loadStats();
    } catch (err: any) {
      alert(`تعذر ${label} الأصناف المحددة: ${err?.message || err}`);
      loadProducts();
      loadStats();
    }
  };

  const openStockModal = (product: Product) => {
    setStockProduct(product);
    setStockReason('إضافة كمية للمخزون');
    setStockRows(warehouses.map((w) => {
      const stock = inventoryService.getProductStock(product.id, w.id);
      return { warehouseId: w.id, warehouseName: w.name, currentM2: stock?.quantityM2 || 0, addBoxes: 0 };
    }));
  };

  const handleSaveStock = () => {
    if (!stockProduct) return;
    const rows = stockRows.filter((r) => r.addBoxes > 0);
    if (rows.length === 0) {
      alert('أدخل كمية أكبر من صفر في أحد المخازن.');
      return;
    }
    setStockSaving(true);
    try {
      const metersPerBox = stockProduct.metersPerBox || 0;
      const adjustmentIds = rows.map((row) => {
        const quantity = stockProduct.productType === 'GENERAL'
          ? row.addBoxes
          : metersPerBox > 0 ? row.addBoxes * metersPerBox : row.addBoxes;
        return inventoryService.createAdjustment({
          productId: stockProduct.id,
          warehouseId: row.warehouseId,
          type: 'ADD',
          quantity: round(quantity, 3),
          reason: stockReason || 'إضافة كمية للمخزون',
        });
      });
      setStockProduct(null);
      loadProducts();
      loadStats();
      toast.success(`تم إنشاء ${rows.length} طلب إضافة`, 'لن يتغير الرصيد حتى الاعتماد والترحيل.');
      navigate(`/inventory/adjustments?adjustmentId=${encodeURIComponent(adjustmentIds[0])}`);
    } catch (err: any) {
      toast.error('تعذر إضافة الكمية', err?.message || String(err));
    } finally {
      setStockSaving(false);
    }
  };

  const handleExport = () => {
    try {
      const all = selectedProductIds.length
        ? selectedProductIds.map((id) => productService.getProductById(id)).filter((p): p is Product => Boolean(p))
        : productService.getProductsPage(search, selectedCategory || undefined, selectedBrand || undefined, 1, 100000, {
            grade: selectedGrade || undefined,
            customFieldFilters: selectedCustomField && selectedCustomFieldValue
              ? { [selectedCustomField]: selectedCustomFieldValue }
              : undefined,
            stockStatus: stockStatus === 'all' ? undefined : stockStatus,
            sortBy,
            status: productStatus,
            includeInactive: productStatus === 'all',
          }).items;
      const exportedFieldValues = operationalFieldService.getRecordValuesForExport(
        'products', all.map((product) => product.id),
      );
      const rows = all.map((p) => {
        const stock = productService.getProductStockSummary(p.id);
        return {
          barcode: p.barcode,
          sku: p.sku,
          name: p.name,
          type: p.categoryName || '',
          brand: p.brandName || '',
          unit: getProductUnitLabel(p),
          size: p.size,
          grade: p.grade,
          color: p.color || '',
          tone: p.tone || '',
          finish: p.finish || '',
          piecesPerBox: p.piecesPerBox,
          metersPerBox: p.metersPerBox,
          costPrice: p.costPrice,
          sellingPriceM2: p.sellingPriceM2,
          sellingPriceBox: p.sellingPriceBox,
          wholesalePriceM2: p.wholesalePriceM2,
          minStockLevel: p.minStockLevel,
          warehouse: stock.byWarehouse.find((entry) => entry.quantityM2 > 0 && entry.warehouseName)?.warehouseName || '',
          openingBoxes: p.productType === 'GENERAL'
            ? (p.baseUnit === 'BOX' ? stock.totalBoxes : stock.totalPieces)
            : stock.totalBoxes,
          stockM2: stock.totalM2,
          stockBoxes: stock.totalBoxes,
          stockPieces: stock.totalPieces,
          ...exportedFieldValues[p.id],
        };
      });
      // Box/piece breakdowns only make sense when the selection contains
      // packaged products; a pure general-goods catalogue exports unit columns.
      const hasBoxUnits = all.some((p) => p.productType !== 'GENERAL');
      exportToExcel({
        title: 'دليل المنتجات',
        subtitle: `عدد المنتجات: ${rows.length}`,
        fileName: 'products',
        permission: 'products.export',
        columns: [
          { key: 'barcode', label: 'الباركود' },
          { key: 'sku', label: 'الكود' },
          { key: 'name', label: 'اسم المنتج' },
          { key: 'type', label: 'النوع' },
          { key: 'brand', label: 'الماركة' },
          { key: 'unit', label: 'وحدة الصنف' },
          { key: 'size', label: 'المقاس' },
          { key: 'grade', label: 'الفرز' },
          { key: 'color', label: 'اللون' },
          { key: 'tone', label: 'التون' },
          { key: 'finish', label: 'التشطيب' },
          ...operationalFields.map((field) => ({ key: field.name, label: field.name })),
          ...(hasBoxUnits ? [
            { key: 'piecesPerBox', label: 'قطع/كرتونة' },
            { key: 'metersPerBox', label: 'م²/كرتونة' },
          ] : []),
          { key: 'costPrice', label: 'التكلفة' },
          { key: 'sellingPriceM2', label: 'سعر الوحدة' },
          ...(hasBoxUnits ? [{ key: 'sellingPriceBox', label: 'سعر الكرتونة' }] : []),
          { key: 'wholesalePriceM2', label: 'سعر الجملة' },
          { key: 'minStockLevel', label: 'حد الطلب' },
          { key: 'warehouse', label: 'المخزن' },
          { key: 'openingBoxes', label: 'كراتين افتتاحية' },
          { key: 'stockM2', label: 'المخزون بوحدة الصنف' },
          ...(hasBoxUnits ? [
            { key: 'stockBoxes', label: 'المخزون كرتونة' },
            { key: 'stockPieces', label: 'المخزون قطعة' },
          ] : []),
        ],
        rows,
      });
    } catch (err: any) {
      alert(`تعذر التصدير: ${err?.message || err}`);
    }
  };

  const downloadImportTemplate = () => {
    exportToExcel({
      title: 'قالب استيراد المنتجات',
      subtitle: 'املأ الصفوف التالية ثم استخدم زر الاستيراد',
      fileName: 'products-import-template',
      permission: 'products.import',
      columns: [
        { key: 'name', label: 'اسم الصنف' },
        { key: 'category', label: 'النوع' },
        { key: 'brand', label: 'الماركة' },
        { key: 'barcode', label: 'الباركود' },
        { key: 'sku', label: 'الكود' },
          { key: 'grade', label: 'الفرز' },
          { key: 'size', label: 'المقاس' },
        { key: 'color', label: 'اللون' },
        { key: 'finish', label: 'التشطيب' },
        { key: 'piecesPerBox', label: 'قطع بالكرتونة' },
        { key: 'metersPerBox', label: 'م² بالكرتونة' },
        { key: 'costPrice', label: 'التكلفة' },
        { key: 'sellingPriceM2', label: 'سعر المتر' },
        { key: 'wholesalePriceM2', label: 'سعر الجملة' },
        { key: 'minStockLevel', label: 'حد الطلب' },
        { key: 'warehouse', label: 'المخزن' },
        { key: 'openingBoxes', label: 'كراتين افتتاحية' },
      ],
      rows: [],
    });
  };

  const handleImportFile = async (file: File) => {
    setIsImporting(true);
    setImportResult(null);
    const errors: string[] = [];
    let created = 0;
    try {
      // Use the shared parser so file size, row, column, cell and sheet limits
      // (and header validation) are identical to every other import path.
      const parsed = parseSpreadsheetBuffer(await file.arrayBuffer(), file.name);
      const rawRows = parsed.sheets[0]?.rows ?? [];
      const categoryMap = new Map(categories.map((c) => [c.name.trim(), c.id]));
      const brandMap = new Map(brands.map((b) => [b.name.trim(), b.id]));
      const warehouseMap = new Map(warehouses.map((w) => [w.name.trim(), w.id]));
      const db = DatabaseManager.getInstance();

      for (let index = 0; index < rawRows.length; index += 1) {
        const row = rawRows[index];
        const name = String(pickCell(row, ['name', 'اسم الصنف', 'اسم المنتج', 'الاسم']) || '').trim();
        if (!name) continue;

        let createdCategoryName: string | null = null;
        let createdBrandName: string | null = null;
        try {
          const categoryName = String(pickCell(row, ['category', 'categoryName', 'النوع', 'التصنيف']) || 'عام').trim();
          const brandName = String(pickCell(row, ['brand', 'brandName', 'الماركة', 'ماركة']) || 'عام').trim();

          const stamp = `${Date.now().toString().slice(-5)}${String(index).padStart(3, '0')}`;
          const sku = pickCell(row, ['sku', 'الكود', 'كود الصنف']) || `IMP-${stamp}`;
          const barcode = pickCell(row, ['barcode', 'الباركود']) || `622${stamp}${String(index).padStart(2, '0')}`;
          const rowType = String(pickCell(row, ['productType', 'نوع الصنف', 'النوع']) || '').toUpperCase();
          const ceramicRow = rowType.includes('CERAMIC')
            || rowType.includes('سيراميك')
            || (!rowType && businessConfig.businessType === 'ceramics');
          const importUnit = (pickCell(row, ['unit', 'الوحدة']) as any)
            || businessConfig.units[0]
            || 'PIECE';
          const size = pickCell(row, ['size', 'المقاس']) || (ceramicRow ? '60x60' : '');

          const piecesPerBox = readImportNumber(
            row, ['piecesPerBox', 'قطع/كرتونة', 'قطع بالكرتونة', 'عدد القطع'], 'قطع بالكرتونة',
            ceramicRow ? 4 : 1, { min: 1, integer: true },
          );
          const metersPerBox = readImportNumber(
            row, ['metersPerBox', 'م²/كرتونة', 'م² بالكرتونة', 'متر/كرتونة', 'المترات'], 'المترات بالكرتونة',
            ceramicRow ? (calcMetersFromSize(size, piecesPerBox) || 1.44) : 1, { min: 0.000001 },
          );
          const costPrice = readImportNumber(row, ['costPrice', 'التكلفة', 'سعر الشراء'], 'التكلفة', 0, { min: 0 });
          const sellingPriceM2 = readImportNumber(
            row, ['sellingPriceM2', 'سعر الوحدة', 'سعر المتر', 'سعر البيع'], 'سعر البيع', round(costPrice * 1.4), { min: 0 },
          );
          const wholesalePriceM2 = readImportNumber(
            row, ['wholesalePriceM2', 'سعر الجملة'], 'سعر الجملة', round(sellingPriceM2 * 0.9), { min: 0 },
          );
          const minSellingPriceM2 = readImportNumber(
            row, ['minSellingPriceM2', 'أقل سعر'], 'أقل سعر', round(sellingPriceM2 * 0.85), { min: 0 },
          );
          const minStockLevel = readImportNumber(row, ['minStockLevel', 'حد الطلب'], 'حد الطلب', 10, { min: 0 });
          const thickness = readImportNumber(row, ['thickness', 'السمك'], 'السمك', 0, { min: 0 });
          const weightPerBox = readImportNumber(row, ['weightPerBox', 'الوزن'], 'الوزن', 0, { min: 0 });

          const explicitOpening = readImportNumber(
            row, ['openingBoxes', 'كراتين افتتاحية'], 'الكراتين الافتتاحية', 0, { min: 0 },
          );
          const exportedBoxes = readImportNumber(row, ['stockBoxes', 'المخزون كرتونة'], 'المخزون كرتونة', 0, { min: 0 });
          const exportedPieces = readImportNumber(row, ['stockPieces', 'المخزون قطعة'], 'المخزون قطعة', 0, { min: 0 });
          const openingBoxes = explicitOpening > 0
            ? explicitOpening
            : (ceramicRow ? exportedBoxes : (exportedPieces || exportedBoxes));

          const warehouseName = String(pickCell(row, ['warehouse', 'warehouseName', 'المخزن']) || '').trim();
          let warehouseId: string | undefined;
          if (warehouseName) {
            warehouseId = warehouseMap.get(warehouseName);
            if (!warehouseId) throw new Error(`المخزن «${warehouseName}» غير موجود أو غير نشط.`);
          }
          if (tracksInventory && openingBoxes > 0 && !warehouseId) {
            throw new Error('حدد اسم مخزن صالحًا في عمود «المخزن» لاستيراد الرصيد الافتتاحي.');
          }

          // One atomic unit per row: category, brand, product and opening
          // balance all commit together or none of them do.
          db.executeTransaction(() => {
            let categoryId = categoryMap.get(categoryName);
            if (!categoryId) {
              categoryId = categoryService.createCategory(categoryName).id;
              categoryMap.set(categoryName, categoryId);
              createdCategoryName = categoryName;
            }
            let brandId = brandMap.get(brandName);
            if (!brandId) {
              brandId = brandService.createBrand(brandName).id;
              brandMap.set(brandName, brandId);
              createdBrandName = brandName;
            }

            const product = productService.createProduct({
              name,
              sku,
              barcode,
              categoryId,
              brandId,
              productType: ceramicRow ? 'CERAMIC' : 'GENERAL',
              grade: gradeOptions.find((option) => option.value === pickCell(row, ['grade', 'الفرز'])
                || option.label === pickCell(row, ['grade', 'الفرز']))?.value
                || parseGrade(pickCell(row, ['grade', 'الفرز']), gradeOptions.filter((option) => option.isActive)),
              size,
              thickness,
              color: pickCell(row, ['color', 'اللون']),
              tone: pickCell(row, ['tone', 'التون']),
              finish: pickCell(row, ['finish', 'التشطيب']),
              surfaceLocation: ceramicRow ? 'FLOOR' : 'GENERAL',
              baseUnit: ceramicRow ? 'M2' : importUnit,
              sellUnit: ceramicRow ? 'M2' : importUnit,
              piecesPerBox,
              metersPerBox,
              weightPerBox,
              costPrice,
              sellingPriceM2,
              sellingPriceBox: round(sellingPriceM2 * metersPerBox),
              wholesalePriceM2,
              minSellingPriceM2,
              minStockLevel,
              maxStockLevel: 1000,
              notes: pickCell(row, ['notes', 'ملاحظات']),
              isActive: true,
            });

            if (tracksInventory && openingBoxes > 0 && warehouseId) {
              const quantity = product.productType === 'GENERAL' ? openingBoxes : openingBoxes * metersPerBox;
              inventoryService.createAdjustment({
                productId: product.id,
                warehouseId,
                type: 'OPENING_BALANCE',
                quantity: round(quantity, 3),
                reason: 'رصيد افتتاحي من استيراد جدول بيانات',
              });
            }
          });
          created += 1;
        } catch (rowError: any) {
          // The transaction rolled back, so drop lookup entries created for
          // this row to avoid reusing ids that no longer exist.
          if (createdCategoryName) categoryMap.delete(createdCategoryName);
          if (createdBrandName) brandMap.delete(createdBrandName);
          errors.push(`صف ${index + 2}: ${rowError?.message || rowError}`);
        }
      }

      setImportResult({ created, errors });
      loadLookups();
      loadProducts();
      loadStats();
    } catch (err: any) {
      setImportResult({ created, errors: [...errors, `تعذر قراءة الملف: ${err?.message || err}`] });
    } finally {
      setIsImporting(false);
    }
  };

  const autoMeters = calcMetersFromSize(formData.size, formData.piecesPerBox);
  const areaPerPiece = formData.piecesPerBox > 0 ? formData.metersPerBox / formData.piecesPerBox : 0;
  const costPerPiece = formData.piecesPerBox > 0 ? (formData.costPrice * formData.metersPerBox) / formData.piecesPerBox : 0;
  const profitPerMeter = formData.sellingPriceM2 - formData.costPrice;
  const profitMargin = formData.sellingPriceM2 > 0 ? (profitPerMeter / formData.sellingPriceM2) * 100 : 0;
  const stockValue = formData.costPrice * openingRows.reduce((sum, row) => sum + row.meters, 0);
  const unitLabel = formData.baseUnit ? unitLabelFor(formData.baseUnit, formData.customUnit) : '';

  const tracksInventory = businessConfig.trackInventory !== false;

  const tabs = useMemo(() => ([
    { id: 'basic' as TabId, label: 'البيانات الأساسية', icon: <Package className="w-4 h-4" /> },
    { id: 'units' as TabId, label: 'المقاس والوحدات', icon: <Ruler className="w-4 h-4" /> },
    ...(canManagePricing ? [{ id: 'pricing' as TabId, label: 'التسعير', icon: <Banknote className="w-4 h-4" /> }] : []),
    ...(tracksInventory && canAdjustInventory ? [{ id: 'stock' as TabId, label: 'المخزون', icon: <Boxes className="w-4 h-4" /> }] : []),
    { id: 'extras' as TabId, label: 'المتغيرات والصور', icon: <GitBranch className="w-4 h-4" /> },
  ]), [tracksInventory, canAdjustInventory, canManagePricing]);

  return (
    <div className="erp-page" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">
            إدارة {productsLabel} المتكاملة
            <span className="ml-2 text-sm font-bold text-sky-700">· {businessProfileLabel}</span>
          </h2>
          <p className="text-xs text-slate-500">الأنواع والماركات والمقاسات والعدد والكمية والمترات والتسعير والمخزون والصور والمتغيرات</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {canImportProducts && <button onClick={() => setIsImportOpen(true)} className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-2 hover:bg-slate-50 transition text-sm">
            <Upload className="w-4 h-4" />
            <span>استيراد جدول بيانات</span>
          </button>}
          {canExportProducts && <button onClick={handleExport} className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-2 hover:bg-slate-50 transition text-sm">
            <Download className="w-4 h-4" />
            <span>تصدير جدول بيانات</span>
          </button>}
          {canCreateProduct && <CentralLimitGuard metric="maxProducts"><button onClick={handleOpenAddModal} className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/30 transition text-sm">
            <Plus className="w-4 h-4" />
            <span>إضافة {productSingularLabel} جديد</span>
          </button></CentralLimitGuard>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="إجمالي الأصناف" value={String(stats?.totalProducts ?? totalItems)} hint={`نشط: ${stats?.activeProducts ?? 0} | موقوف: ${stats?.inactiveProducts ?? 0}`} icon={<Package className="w-5 h-5 text-sky-600" />} tone="bg-sky-50" />
        <StatCard label="إجمالي الكميات" value={String(stats?.totalStockM2 ?? 0)} icon={<Boxes className="w-5 h-5 text-emerald-600" />} tone="bg-emerald-50" />
        {canViewCosts && <StatCard label="قيمة المخزون" value={CeramicMath.formatCurrency(stats?.totalStockValue ?? 0)} icon={<Banknote className="w-5 h-5 text-indigo-600" />} tone="bg-indigo-50" />}
        <StatCard label="أصناف قاربت على النفاذ" value={String(stats?.lowStock ?? 0)} icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} tone="bg-amber-50" />
        <StatCard label="أصناف نافدة" value={String(stats?.outOfStock ?? 0)} icon={<XCircle className="w-5 h-5 text-rose-600" />} tone="bg-rose-50" />
        <StatCard label="الأنواع / الماركات" value={`${categories.length} / ${brands.length}`} hint={`${attributes.length} خصائص`} icon={<Layers className="w-5 h-5 text-violet-600" />} tone="bg-violet-50" />
      </div>

      <FilterToolbar ariaLabel="بحث وتصفية الأصناف" className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[240px] relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              aria-label="بحث الأصناف"
              placeholder="بحث بالاسم، الباركود، الكود، المقاس، النوع، الماركة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-4 pr-9 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} aria-controls="product-advanced-filters" className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${showFilters ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            <Filter className="w-4 h-4" /> فلاتر متقدمة
          </button>
        <div className="flex items-center overflow-hidden rounded-xl border border-slate-200">
            <button onClick={() => setViewMode('table')} className={`px-2.5 py-2 ${viewMode === 'table' ? 'bg-sky-600 text-white' : 'bg-white text-slate-500'}`} title="عرض جدول"><List className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('cards')} className={`px-2.5 py-2 ${viewMode === 'cards' ? 'bg-sky-600 text-white' : 'bg-white text-slate-500'}`} title="عرض بطاقات"><LayoutGrid className="w-4 h-4" /></button>
          </div>
          <button onClick={() => { loadProducts(); loadStats(); loadLookups(); }} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" title="تحديث"><RefreshCw className="w-4 h-4" /></button>
        </div>

        {showFilters && (
          <div id="product-advanced-filters" className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <FormField label="نوع المنتج" visuallyHidden>
            <select value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); setSearchParams(e.target.value ? { category: e.target.value } : {}, { replace: true }); }} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="">جميع الأنواع</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
            </FormField>
            <FormField label="الماركة" visuallyHidden>
            <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="">جميع الماركات</option>
              {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
            </FormField>
            {businessConfig.businessType === 'ceramics' && (<FormField label="الفرز" visuallyHidden><select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="">جميع الفرزات</option>
              {gradeOptions.filter((option) => option.isActive).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select></FormField>)}
            {operationalFields.filter((field) => field.isFilterable).map((field) => (
              <FormField key={field.id} label={field.name} visuallyHidden>
                {['SELECT', 'BOOLEAN'].includes(field.dataType) ? (
                  <select value={selectedCustomField === field.id ? selectedCustomFieldValue : ''} onChange={(event) => {
                    setSelectedCustomField(field.id);
                    setSelectedCustomFieldValue(event.target.value);
                  }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                    <option value="">كل القيم — {field.name}</option>
                    {field.dataType === 'BOOLEAN'
                      ? <><option value="true">نعم</option><option value="false">لا</option></>
                      : field.values.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <input value={selectedCustomField === field.id ? selectedCustomFieldValue : ''} onChange={(event) => {
                    setSelectedCustomField(field.id);
                    setSelectedCustomFieldValue(event.target.value);
                  }} placeholder={`تصفية حسب ${field.name}`} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700" />
                )}
              </FormField>
            ))}
            <FormField label="حالة المخزون" visuallyHidden>
            <select value={stockStatus} onChange={(e) => setStockStatus(e.target.value as any)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="all">حالة المخزون: الكل</option>
              <option value="in">متوفر</option>
              <option value="low">قارب على النفاذ</option>
              <option value="out">نافد</option>
            </select>
            </FormField>
            <FormField label="ترتيب الأصناف" visuallyHidden>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="name">ترتيب: الاسم</option>
              <option value="newest">الأحدث إضافة</option>
              <option value="price_asc">السعر: الأقل</option>
              <option value="price_desc">السعر: الأعلى</option>
              <option value="stock_asc">المخزون: الأقل</option>
              <option value="stock_desc">المخزون: الأكثر</option>
            </select>
            </FormField>
            <FormField label="حالة الصنف" visuallyHidden>
            <select aria-label="حالة الصنف" value={productStatus} onChange={(e) => setProductStatus(e.target.value as typeof productStatus)} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="active">الأصناف النشطة</option>
              <option value="inactive">الأصناف غير النشطة</option>
              <option value="all">كل الأصناف</option>
            </select>
            </FormField>
            <button onClick={() => { setSearch(''); setSelectedCategory(''); setSearchParams({}, { replace: true }); setSelectedBrand(''); setSelectedGrade(''); setSelectedCustomField(''); setSelectedCustomFieldValue(''); setStockStatus('all'); setSortBy('name'); setProductStatus('active'); }} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-500 hover:bg-slate-50">مسح عوامل التصفية</button>
          </div>
        )}
      </FilterToolbar>

      {selectedProductIds.length > 0 && (canExportProducts || canDeleteProduct) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
          <div className="text-xs font-bold text-sky-900">تم تحديد {selectedProductIds.length} صنف من الصفحة الحالية</div>
          <div className="flex items-center gap-2">
            {canExportProducts && <button onClick={handleExport} className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100">تصدير المحدد</button>}
            {canDeleteProduct && <button onClick={() => handleBulkStatus(true)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">تفعيل المحدد</button>}
            {canDeleteProduct && <button onClick={() => handleBulkStatus(false)} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">إيقاف المحدد</button>}
            <button onClick={() => setSelectedProductIds([])} className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">مسح التحديد</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-slate-500"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /><span className="text-sm">جاري تحميل دليل الأصناف...</span></div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center"><AlertTriangle className="h-8 w-8 text-amber-500" /><p className="text-sm font-bold text-slate-700">تعذر تحميل البيانات</p><p className="text-xs text-slate-500">{loadError}</p><button onClick={loadProducts} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700">إعادة المحاولة</button></div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center"><Package className="h-9 w-9 text-slate-300" /><p className="text-sm font-bold text-slate-700">لا توجد أصناف مطابقة</p><p className="text-xs text-slate-500">جرّب تعديل البحث أو أضف صنفًا جديدًا إلى الدليل.</p></div>
        ) : viewMode === 'table' ? (
          <ProductsTable
            products={products}
            operationalFields={operationalFields}
            operationalFieldValues={operationalValuesByProduct}
            selectedProductIds={selectedProductIds}
            hasCeramicRows={hasCeramicRows}
            canViewCosts={canViewCosts}
            canViewPricing={canViewPricing}
            canExportProducts={canExportProducts}
            canDeleteProduct={canDeleteProduct}
            canUpdateProduct={canUpdateProduct}
            canCreateProduct={canCreateProduct}
            canAdjustInventory={canAdjustInventory}
            stockOf={stockOf}
            stockTone={stockTone}
            onTogglePageSelection={togglePageSelection}
            onToggleProductSelection={toggleProductSelection}
            onOpenDetails={(product) => navigate(`/products/${product.id}`)}
            onOpenStock={openStockModal}
            onOpenEdit={handleOpenEditModal}
            onDuplicate={handleDuplicate}
            onOpenBarcodes={() => navigate('/products/barcodes')}
            onToggleActive={handleToggleActive}
            onDelete={handleDeleteProduct}
          />
        ) : (
          <ProductsCards
            products={products}
            operationalFields={operationalFields}
            operationalFieldValues={operationalValuesByProduct}
            selectedProductIds={selectedProductIds}
            canViewCosts={canViewCosts}
            canViewPricing={canViewPricing}
            canExportProducts={canExportProducts}
            canDeleteProduct={canDeleteProduct}
            canUpdateProduct={canUpdateProduct}
            canCreateProduct={canCreateProduct}
            canAdjustInventory={canAdjustInventory}
            stockOf={stockOf}
            stockTone={stockTone}
            onToggleProductSelection={toggleProductSelection}
            onOpenDetails={(product) => navigate(`/products/${product.id}`)}
            onOpenStock={openStockModal}
            onOpenEdit={handleOpenEditModal}
            onDuplicate={handleDuplicate}
            onToggleActive={handleToggleActive}
            onDelete={handleDeleteProduct}
          />
        )}
        {!isLoading && !loadError && totalItems > 0 && <ListPagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      </div>

      {/* ADD / EDIT PRODUCT MODAL */}
      <ProductFormModal
        open={isModalOpen}
        canCreate={canCreateProduct}
        canUpdate={canUpdateProduct}
        editingProduct={editingProduct}
        rememberedFields={rememberedFields}
        fieldPreferenceOptions={[
          ...PRODUCT_FORM_DEFAULT_FIELDS.map((key) => ({ key, label: PRODUCT_FORM_FIELD_LABELS[key] })),
          ...attributes.map((attribute) => ({
            key: `attribute:${attribute.id}`,
            label: `خاصية: ${attribute.name}`,
          })),
        ]}
        onSaveSelectedFields={handleSaveSelectedProductFields}
        onRegenerateBarcode={() => regenerateProductCode('barcode', formData.barcode)}
        onRegenerateSku={() => regenerateProductCode('sku', formData.sku)}
        toneOptions={toneOptions}
        onAddTone={handleAddTone}
        onDeleteTone={handleDeleteTone}
        productSingularLabel={productSingularLabel}
        onClose={() => setIsModalOpen(false)}
        tabs={tabs}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSubmit={handleSaveProduct}
        formData={formData}
        setFormData={setFormData}
        canCreateCategory={canCreateCategory}
        showNewCategory={showNewCategory}
        setShowNewCategory={setShowNewCategory}
        newCategory={newCategory}
        setNewCategory={setNewCategory}
        onAddCategory={handleAddCategory}
        canCreateBrand={canCreateBrand}
        showNewBrand={showNewBrand}
        setShowNewBrand={setShowNewBrand}
        newBrand={newBrand}
        setNewBrand={setNewBrand}
        onAddBrand={handleAddBrand}
        imageInputRef={imageInputRef}
        onImageFiles={handleImageFiles}
        existingImages={existingImages}
        onRemoveExistingImage={removeExistingImage}
        pendingImages={pendingImages}
        setPendingImages={setPendingImages}
        categories={categories}
        brands={brands}
        profileUnitOptions={profileUnitOptions}
        businessConfig={businessConfig}
        unitLabel={unitLabel}
        autoMeters={autoMeters}
        onUpdateSizeDimension={updateSizeDimension}
        onMetersPerBoxChange={handleMetersPerBoxChange}
        onPiecesPerBoxChange={handlePiecesPerBoxChange}
        areaPerPiece={areaPerPiece}
        costPerPiece={costPerPiece}
        canManagePricing={canManagePricing}
        profitPerMeter={profitPerMeter}
        profitMargin={profitMargin}
        stockValue={stockValue}
        onAddOpeningRow={addOpeningRow}
        openingRows={openingRows}
        warehouses={warehouses}
        editStock={editStock}
        setOpeningRows={setOpeningRows}
        onSetOpeningBy={setOpeningBy}
        onRemoveOpeningRow={removeOpeningRow}
        variants={variants}
        onAddVariantDraft={addVariantDraft}
        onUpdateVariantDraft={updateVariantDraft}
        onRemoveVariantDraft={removeVariantDraft}
        attributes={attributes}
        attributeValues={attributeValues}
        setAttributeValues={setAttributeValues}
        operationalFields={operationalFields}
        operationalFieldValues={operationalFieldValues}
        setOperationalFieldValues={setOperationalFieldValues}
        gradeOptions={gradeOptions}
        isSaving={isSaving}
      />

      {/* STOCK MODAL */}
      {stockProduct && canAdjustInventory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><PackagePlus className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">إضافة كمية للمخزون</h3>
                  <p className="text-[11px] text-slate-500">{stockProduct.name}{stockProduct.productType === 'GENERAL' ? ` • الوحدة: ${getProductUnitLabel(stockProduct)}` : ` • ${stockProduct.metersPerBox} م²/كرتونة`}</p>
                </div>
              </div>
              <button onClick={() => setStockProduct(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4 p-6 text-xs">
              <div className="space-y-2">
                {stockRows.map((row, index) => (
                  <div key={row.warehouseId} className="grid grid-cols-1 sm:grid-cols-3 items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <Field label="المخزن"><div className="px-3 py-2 font-bold text-slate-700">{row.warehouseName}</div></Field>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <div className="text-[10px] font-bold text-emerald-700">الرصيد الحالي</div>
                      <div className="font-black text-emerald-700">{stockProduct.productType === 'GENERAL' ? `${round(row.currentM2, 3)} ${getProductUnitLabel(stockProduct)}` : CeramicMath.formatM2(row.currentM2)}</div>
                    </div>
                    <Field label={stockProduct.productType === 'GENERAL' ? `الكمية المضافة (${getProductUnitLabel(stockProduct)})` : 'عدد الكراتين المضافة'}>
                      <input type="number" min="0" step="0.01" value={row.addBoxes || ''} onChange={(e) => { const value = Number.parseFloat(e.target.value) || 0; setStockRows((prev) => prev.map((r, i) => i === index ? { ...r, addBoxes: value } : r)); }} className="w-full px-3 py-2 bg-white rounded-xl border border-emerald-300 font-bold" placeholder="0" />
                    </Field>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={stockProduct.productType === 'GENERAL' ? `القيمة المضافة (${getProductUnitLabel(stockProduct)})` : 'القيمة المضافة (م²)'}>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-black text-emerald-700">
                    {round(stockRows.reduce((s, r) => s + r.addBoxes, 0) * (stockProduct.productType === 'GENERAL' ? 1 : (stockProduct.metersPerBox || 0)), 3)} {getProductUnitLabel(stockProduct)}
                  </div>
                </Field>
                <Field label="سبب الإضافة / ملاحظة">
                  <input value={stockReason} onChange={(e) => setStockReason(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                </Field>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setStockProduct(null)} className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200">إلغاء</button>
                <button type="button" onClick={handleSaveStock} disabled={stockSaving} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2 font-black text-white hover:bg-emerald-700 disabled:opacity-60">
                  {stockSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackagePlus className="w-4 h-4" />}
                  إضافة للمخزون
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL */}
      {isImportOpen && canImportProducts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><FileSpreadsheet className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">استيراد الأصناف من جدول بيانات</h3>
                  <p className="text-[11px] text-slate-500">ارفع ملف جدول بيانات (.xlsx) لإضافة الأصناف دفعة واحدة</p>
                </div>
              </div>
              <button onClick={() => { setIsImportOpen(false); setImportResult(null); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4 p-6 text-xs">
              <button onClick={downloadImportTemplate} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-700 hover:bg-slate-100">
                <span className="flex items-center gap-2"><Download className="w-4 h-4 text-sky-600" /> تحميل قالب جدول بيانات جاهز</span>
                <span className="text-[10px] text-slate-400">xlsx</span>
              </button>
              <button type="button" onClick={() => importInputRef.current?.click()} className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/50 px-4 py-10 text-center hover:border-sky-500">
                {isImporting ? <Loader2 className="w-8 h-8 animate-spin text-sky-600" /> : <Upload className="w-8 h-8 text-sky-500" />}
                <span className="text-sm font-bold text-slate-700">{isImporting ? 'جارٍ استيراد الأصناف...' : 'اضغط لاختيار ملف جدول بيانات'}</span>
                <span className="text-[10px] text-slate-500">يتم إنشاء الأنواع والماركات غير الموجودة تلقائيًا</span>
              </button>
              <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleImportFile(file); e.target.value = ''; }} />
              {importResult && (
                <div className={`rounded-xl border p-3 ${importResult.errors.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <div className="flex items-center gap-2 font-black">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    تم إنشاء {importResult.created} صنفًا
                  </div>
                  {importResult.errors.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pr-5 text-[10px] text-amber-700">
                      {importResult.errors.slice(0, 8).map((err, i) => <li key={i}>{err}</li>)}
                      {importResult.errors.length > 8 && <li>... و{importResult.errors.length - 8} أخطاء أخرى</li>}
                    </ul>
                  )}
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={() => { setIsImportOpen(false); setImportResult(null); }} className="rounded-xl bg-slate-100 px-5 py-2 font-bold text-slate-700 hover:bg-slate-200">إغلاق</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
