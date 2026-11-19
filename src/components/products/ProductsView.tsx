import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package, Plus, AlertTriangle,
  Boxes, Ruler, Banknote, Loader2, Download,
  Upload, GitBranch, Layers, XCircle,
} from 'lucide-react';
import { ProductService, ProductStats } from '../../services/domains/products/ProductService';
import { ProductFormPreferencesService } from '../../services/domains/products/ProductFormPreferencesService';
import { InventoryService } from '../../services/domains/inventory/InventoryService';
import { CategoryService, CategoryWithCount } from '../../services/domains/products/CategoryService';
import { BrandService, BrandWithCount } from '../../services/domains/products/BrandService';
import { AttributeService, AttributeCategory } from '../../services/domains/products/AttributeService';
import { OperationalFieldService, type OperationalFieldDefinition, type ProductGradeOption } from '../../services/domains/products/OperationalFieldService';
import { ProductExtraService } from '../../services/domains/products/ProductExtraService';
import { Product, Warehouse } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { SettingsService } from '../../services/domains/config/SettingsService';
import { getEffectiveBusinessType } from '../../services/domains/config/BusinessTypeService';
import { BusinessProfileService } from '../../services/domains/config/BusinessProfileService';
import { parseSpreadsheetBuffer } from '../../services/infrastructure/data/SpreadsheetImportService';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { parseBusinessConfiguration } from '../../config/businessProfiles';
import { useBusinessProfileMeta, useBusinessTerm } from '../../hooks/domains/config/useBusinessTerm';
import { useToast } from '../ui/Toast';
import { CentralLimitGuard } from '../ui/CentralLimitGuard';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { StatCard as ErpStatCard } from '../ui/Card';
import { ProductFormModal } from './ProductFormModal';
import { ProductsTable } from './ProductsTable';
import { ProductsCards } from './ProductsCards';
import { ListPagination } from './ProductUi';
import {
  GRADES, UNITS, calcMetersFromSize, round, unitLabelFor, setConfiguredGradeLabels,
  type TabId,
} from './productFormModel';
import { PRODUCT_FORM_DEFAULT_FIELDS, PRODUCT_FORM_FIELD_LABELS } from './ProductsView/productFormConstants';
import { exportProductsToExcel, downloadProductImportTemplate, importProductsFromRows } from './ProductsView/productImportExport';
import { useProductFormEditor } from './ProductsView/useProductFormEditor';
import { ProductsViewFilters } from './ProductsView/ProductsViewFilters';
import { ProductStockModal, ProductImportModal, type StockRow, type ProductImportResult } from './ProductsView/ProductsViewModals';

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
  const [operationalValuesByProduct, setOperationalValuesByProduct] = useState<Record<string, Record<string, string>>>({});
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedCustomField, setSelectedCustomField] = useState('');
  const [selectedCustomFieldValue, setSelectedCustomFieldValue] = useState('');
  const [selectedAttribute, setSelectedAttribute] = useState('');
  const [selectedAttributeValue, setSelectedAttributeValue] = useState('');
  const [stockStatus, setStockStatus] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'newest' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc'>('name');
  const [productStatus, setProductStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => localStorage.getItem('products_view_mode') === 'cards' ? 'cards' : 'table');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [gradeOptions, setGradeOptions] = useState<ProductGradeOption[]>([]);

  const [businessConfig] = useState(() => {
    const type = getEffectiveBusinessType();
    return parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), type);
  });

  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockReason, setStockReason] = useState('إضافة كمية للمخزون');
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [stockSaving, setStockSaving] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ProductImportResult | null>(null);
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

  const productService = useMemo(() => new ProductService(), []);
  const productFormPreferences = useMemo(() => new ProductFormPreferencesService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const categoryService = useMemo(() => new CategoryService(), []);
  const brandService = useMemo(() => new BrandService(), []);
  const attributeService = useMemo(() => new AttributeService(), []);
  const operationalFieldService = useMemo(() => new OperationalFieldService(), []);
  const extraService = useMemo(() => new ProductExtraService(), []);

  const tracksInventory = businessConfig.trackInventory !== false;

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

  const loadStats = useCallback(async () => {
    try {
      setStats(await productService.getProductStatsAsync());
    } catch (e) {
      console.error(e);
    }
  }, [productService]);

  const productsLoadSeq = useRef(0);

  const loadProducts = useCallback(async () => {
    const seq = ++productsLoadSeq.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await productService.getProductsPageAsync(
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
          attributeFilters: selectedAttribute && selectedAttributeValue
            ? { [selectedAttribute]: selectedAttributeValue }
            : undefined,
          stockStatus: stockStatus === 'all' ? undefined : stockStatus,
          sortBy,
          includeInactive: productStatus === 'all',
          status: productStatus,
        },
      );
      if (seq !== productsLoadSeq.current) return;
      setProducts(result.items);
      setOperationalValuesByProduct(operationalFieldService.getRecordValuesForExport(
        'products', result.items.map((product) => product.id),
      ));
      setPage(result.page);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (e: any) {
      if (seq !== productsLoadSeq.current) return;
      console.error(e);
      setLoadError(e?.message || 'تعذر تحميل الأصناف');
    } finally {
      if (seq === productsLoadSeq.current) setIsLoading(false);
    }
  }, [search, selectedCategory, selectedBrand, page, pageSize, selectedGrade, selectedCustomField, selectedCustomFieldValue, selectedAttribute, selectedAttributeValue, stockStatus, sortBy, productStatus, operationalFieldService, productService]);

  const reloadAll = () => {
    loadProducts();
    loadStats();
    loadLookups();
  };

  const formEditor = useProductFormEditor({
    productService,
    productFormPreferences,
    inventoryService,
    categoryService,
    brandService,
    operationalFieldService,
    extraService,
    categories,
    brands,
    setCategories,
    setBrands,
    attributes,
    operationalFields,
    gradeOptions,
    tracksInventory,
    toast,
    reload: reloadAll,
  });

  const {
    isModalOpen, setIsModalOpen,
    editingProduct,
    activeTab, setActiveTab,
    formData, setFormData,
    rememberedFields,
    toneOptions,
    variants,
    attributeValues, setAttributeValues,
    operationalFieldValues, setOperationalFieldValues,
    existingImages,
    pendingImages, setPendingImages,
    editStock,
    openingRows, setOpeningRows,
    isSaving,
    newCategory, setNewCategory,
    newBrand, setNewBrand,
    showNewCategory, setShowNewCategory,
    showNewBrand, setShowNewBrand,
    imageInputRef,
    regenerateProductCode,
    handleOpenAddModal,
    handleOpenEditModal,
    updateSizeDimension,
    handlePiecesPerBoxChange,
    handleMetersPerBoxChange,
    setOpeningBy,
    addOpeningRow,
    removeOpeningRow,
    handleAddCategory,
    handleAddBrand,
    handleImageFiles,
    removeExistingImage,
    addVariantDraft,
    updateVariantDraft,
    removeVariantDraft,
    handleSaveSelectedProductFields,
    handleAddTone,
    handleDeleteTone,
    handleSaveProduct,
  } = formEditor;

  const canManagePricing = editingProduct ? canUpdatePricing : canCreateProduct;

  useEffect(() => {
    loadLookups();
    loadStats();
  }, [loadLookups, loadStats]);

  useEffect(() => {
    loadProducts();
  }, [search, selectedCategory, selectedBrand, selectedGrade, selectedCustomField, selectedCustomFieldValue, selectedAttribute, selectedAttributeValue, stockStatus, sortBy, productStatus, page, pageSize, loadProducts]);

  useEffect(() => { setSelectedProductIds([]); }, [search, selectedCategory, selectedBrand, selectedGrade, selectedCustomField, selectedCustomFieldValue, selectedAttribute, selectedAttributeValue, stockStatus, sortBy, productStatus, page, pageSize]);

  useEffect(() => { setPage(1); }, [search, selectedCategory, selectedBrand, selectedGrade, selectedCustomField, selectedCustomFieldValue, selectedAttribute, selectedAttributeValue, stockStatus, sortBy, productStatus]);

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
    if (m2 <= 0) return 'erp-badge--danger';
    if (m2 <= p.minStockLevel) return 'erp-badge--warning';
    return 'erp-badge--success';
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
      toast.error(`تعذر ${label} الأصناف المحددة: ${err?.message || err}`);
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
      toast.warning('أدخل كمية أكبر من صفر في أحد المخازن.');
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

  const handleDeleteProduct = (id: string) => {
    if (confirm('هل أنت متأكد من حذف/تعطيل هذا الصنف؟')) {
      try {
        productService.deleteProduct(id);
        loadProducts();
        loadStats();
        loadLookups();
      } catch (err: any) {
        toast.error(`تعذر الحذف: ${err?.message || err}`);
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
      toast.error(`تعذر نسخ الصنف: ${err?.message || err}`);
    }
  };

  const handleToggleActive = (product: Product) => {
    try {
      productService.setProductActive(product.id, !product.isActive);
      loadProducts();
      loadStats();
    } catch (err: any) {
      toast.error(`تعذر تغيير حالة الصنف: ${err?.message || err}`);
    }
  };

  const handleExport = () => {
    try {
      exportProductsToExcel({
        productService,
        operationalFieldService,
        operationalFields,
        selectedProductIds,
        search,
        selectedCategory,
        selectedBrand,
        selectedGrade,
        selectedCustomField,
        selectedCustomFieldValue,
        selectedAttribute,
        selectedAttributeValue,
        stockStatus,
        sortBy,
        productStatus,
      });
    } catch (err: any) {
      toast.error(`تعذر التصدير: ${err?.message || err}`);
    }
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
      const result = importProductsFromRows(rawRows, {
        categories,
        brands,
        warehouses,
        businessConfig,
        gradeOptions,
        tracksInventory,
        categoryService,
        brandService,
        productService,
        inventoryService,
      });
      created = result.created;
      errors.push(...result.errors);

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

  const profileUnitOptions = useMemo(() => {
    const options = UNITS.filter((unit) => businessConfig.units.includes(unit.value));
    if (businessConfig.customUnits.length > 0) options.push({ value: 'CUSTOM', label: 'وحدة مخصصة' });
    if (formData.baseUnit && !options.some((unit) => unit.value === formData.baseUnit)) {
      const existing = UNITS.find((unit) => unit.value === formData.baseUnit);
      options.push(existing || { value: formData.baseUnit, label: unitLabelFor(formData.baseUnit, formData.customUnit) });
    }
    return options;
  }, [businessConfig, formData.baseUnit, formData.customUnit]);

  const tabs = useMemo(() => ([
    { id: 'basic' as TabId, label: 'البيانات الأساسية', icon: <Package className="w-4 h-4" /> },
    { id: 'units' as TabId, label: 'المقاس والوحدات', icon: <Ruler className="w-4 h-4" /> },
    ...(canManagePricing ? [{ id: 'pricing' as TabId, label: 'التسعير', icon: <Banknote className="w-4 h-4" /> }] : []),
    ...(tracksInventory && canAdjustInventory ? [{ id: 'stock' as TabId, label: 'المخزون', icon: <Boxes className="w-4 h-4" /> }] : []),
    { id: 'extras' as TabId, label: 'المتغيرات والصور', icon: <GitBranch className="w-4 h-4" /> },
  ]), [tracksInventory, canAdjustInventory, canManagePricing]);

  return (
    <div className="erp-page">
      <PageHeader
        title={`إدارة ${productsLabel} المتكاملة`}
        description={`الأنواع والماركات والمقاسات والعدد والكمية والمترات والتسعير والمخزون والصور والمتغيرات · ${businessProfileLabel}`}
        icon={<Package className="h-5 w-5" />}
        actions={
          <>
            {canImportProducts && <Button variant="secondary" size="sm" leadingIcon={<Upload className="h-4 w-4" />} onClick={() => setIsImportOpen(true)}>استيراد جدول بيانات</Button>}
            {canExportProducts && <Button variant="secondary" size="sm" leadingIcon={<Download className="h-4 w-4" />} onClick={handleExport}>تصدير جدول بيانات</Button>}
            {canCreateProduct && <CentralLimitGuard metric="maxProducts"><Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={handleOpenAddModal}>إضافة {productSingularLabel} جديد</Button></CentralLimitGuard>}
          </>
        }
      />

      <div className="erp-stat-grid">
        <ErpStatCard label="إجمالي الأصناف" value={String(stats?.totalProducts ?? totalItems)} hint={`نشط: ${stats?.activeProducts ?? 0} | موقوف: ${stats?.inactiveProducts ?? 0}`} icon={<Package className="h-4 w-4" />} />
        <ErpStatCard label="إجمالي الكميات" value={String(stats?.totalStockM2 ?? 0)} icon={<Boxes className="h-4 w-4" />} />
        {canViewCosts && <ErpStatCard label="قيمة المخزون" value={CeramicMath.formatCurrency(stats?.totalStockValue ?? 0)} icon={<Banknote className="h-4 w-4" />} />}
        <ErpStatCard label="أصناف قاربت على النفاذ" value={String(stats?.lowStock ?? 0)} icon={<AlertTriangle className="h-4 w-4" />} tone="warning" />
        <ErpStatCard label="أصناف نافدة" value={String(stats?.outOfStock ?? 0)} icon={<XCircle className="h-4 w-4" />} tone="danger" />
        <ErpStatCard label="الأنواع / الماركات" value={`${categories.length} / ${brands.length}`} hint={`${attributes.length} خصائص`} icon={<Layers className="h-4 w-4" />} />
      </div>

      <ProductsViewFilters
        search={search}
        setSearch={setSearch}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onRefresh={reloadAll}
        onCategoryFilterChange={(value) => { setSelectedCategory(value); setSearchParams(value ? { category: value } : {}, { replace: true }); }}
        onClearFilters={() => { setSearch(''); setSelectedCategory(''); setSearchParams({}, { replace: true }); setSelectedBrand(''); setSelectedGrade(''); setSelectedCustomField(''); setSelectedCustomFieldValue(''); setSelectedAttribute(''); setSelectedAttributeValue(''); setStockStatus('all'); setSortBy('name'); setProductStatus('active'); }}
        categories={categories}
        brands={brands}
        businessConfig={businessConfig}
        gradeOptions={gradeOptions}
        operationalFields={operationalFields}
        attributes={attributes}
        selectedCategory={selectedCategory}
        selectedBrand={selectedBrand}
        setSelectedBrand={setSelectedBrand}
        selectedGrade={selectedGrade}
        setSelectedGrade={setSelectedGrade}
        selectedCustomField={selectedCustomField}
        setSelectedCustomField={setSelectedCustomField}
        selectedCustomFieldValue={selectedCustomFieldValue}
        setSelectedCustomFieldValue={setSelectedCustomFieldValue}
        selectedAttribute={selectedAttribute}
        setSelectedAttribute={setSelectedAttribute}
        selectedAttributeValue={selectedAttributeValue}
        setSelectedAttributeValue={setSelectedAttributeValue}
        stockStatus={stockStatus}
        setStockStatus={setStockStatus}
        sortBy={sortBy}
        setSortBy={setSortBy}
        productStatus={productStatus}
        setProductStatus={setProductStatus}
      />

      {selectedProductIds.length > 0 && (canExportProducts || canDeleteProduct) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ui-radius-md)] border border-[var(--win-accent-border)] bg-[var(--win-accent-soft)] px-4 py-3">
          <div className="text-xs font-bold text-[var(--win-accent-soft-text)]">تم تحديد {selectedProductIds.length} صنف من الصفحة الحالية</div>
          <div className="flex items-center gap-2">
            {canExportProducts && <button onClick={handleExport} className="erp-btn erp-btn--secondary erp-btn--sm">تصدير المحدد</button>}
            {canDeleteProduct && <button onClick={() => handleBulkStatus(true)} className="erp-btn erp-btn--success erp-btn--sm">تفعيل المحدد</button>}
            {canDeleteProduct && <button onClick={() => handleBulkStatus(false)} className="erp-btn erp-btn--secondary erp-btn--sm">إيقاف المحدد</button>}
            <button onClick={() => setSelectedProductIds([])} className="erp-btn erp-btn--secondary erp-btn--sm">مسح التحديد</button>
          </div>
        </div>
      )}

      <div>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-[var(--cerami-muted)]"><Loader2 className="h-8 w-8 animate-spin text-[var(--cerami-primary-readable)]" /><span className="text-sm">جاري تحميل دليل الأصناف...</span></div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center"><AlertTriangle className="h-8 w-8 text-[var(--win-warning)]" /><p className="text-sm font-bold text-[var(--win-text)]">تعذر تحميل البيانات</p><p className="text-xs text-[var(--cerami-muted)]">{loadError}</p><button onClick={loadProducts} className="erp-btn erp-btn--primary erp-btn--sm">إعادة المحاولة</button></div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center"><Package className="h-9 w-9 text-[var(--cerami-muted)] opacity-40" /><p className="text-sm font-bold text-[var(--win-text)]">لا توجد أصناف مطابقة</p><p className="text-xs text-[var(--cerami-muted)]">جرّب تعديل البحث أو أضف صنفًا جديدًا إلى الدليل.</p></div>
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
      <ProductStockModal
        open={stockProduct !== null && canAdjustInventory}
        onClose={() => setStockProduct(null)}
        stockProduct={stockProduct}
        stockRows={stockRows}
        setStockRows={setStockRows}
        stockReason={stockReason}
        setStockReason={setStockReason}
        stockSaving={stockSaving}
        onSave={handleSaveStock}
      />

      {/* IMPORT MODAL */}
      <ProductImportModal
        open={isImportOpen && canImportProducts}
        onClose={() => { setIsImportOpen(false); setImportResult(null); }}
        isImporting={isImporting}
        importResult={importResult}
        onDownloadTemplate={downloadProductImportTemplate}
        onImportFile={(file) => void handleImportFile(file)}
        importInputRef={importInputRef}
      />
    </div>
  );
};
