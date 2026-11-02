import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package, Plus, Search, Edit, Trash2, Layers, AlertTriangle, X, Calculator,
  Boxes, Ruler, Save, CheckCircle, Banknote, Loader2, Eye, Download, PackagePlus,
  Upload, FileSpreadsheet, Copy, Power, Barcode, ImagePlus, GitBranch,
  SlidersHorizontal, LayoutGrid, List, TrendingUp, XCircle, RefreshCw, Filter
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ProductService, ProductStats } from '../services/ProductService';
import { InventoryService } from '../services/InventoryService';
import { CategoryService, CategoryWithCount } from '../services/CategoryService';
import { BrandService, BrandWithCount } from '../services/BrandService';
import { AttributeService, AttributeCategory } from '../services/AttributeService';
import { ProductExtraService, ProductImage } from '../services/ProductExtraService';
import { normalizeDynamicAttributeValue } from '../services/dynamicAttributes';
import { Product, CeramicGrade, UnitType, Warehouse } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
import { getProductUnitLabel } from '../utils/productUnits';
import { exportToExcel } from '../utils/export';
import { SettingsService } from '../services/SettingsService';
import { getEffectiveBusinessType } from '../services/BusinessTypeService';
import { BusinessProfileService } from '../services/BusinessProfileService';
import { AuthService } from '../services/AuthService';
import { PermissionService } from '../services/PermissionService';
import { parseBusinessConfiguration } from '../config/businessProfiles';
import { useBusinessProfileMeta, useBusinessTerm } from '../hooks/useBusinessTerm';
import { CentralLimitGuard } from './ui/CentralLimitGuard';
import {
  GRADES, SURFACES, UNITS, calcMetersFromSize, emptyForm, emptyVariant, gradeLabel,
  parseGrade, pickCell, round, unitLabelFor,
  type FormState, type OpeningStockRow, type TabId, type VariantDraft,
} from './products/productFormModel';
import { Field, ListPagination, StatCard } from './products/ProductUi';
import { ProductFormModal } from './products/ProductFormModal';
import { ProductsTable } from './products/ProductsTable';
import { ProductsCards } from './products/ProductsCards';



export const ProductsView: React.FC = () => {
  const productsLabel = useBusinessTerm('entities.products.plural');
  const productSingularLabel = useBusinessTerm('entities.products.singular');
  const { label: businessProfileLabel } = useBusinessProfileMeta();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [brands, setBrands] = useState<BrandWithCount[]>([]);
  const [attributes, setAttributes] = useState<AttributeCategory[]>([]);
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
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

  const [formData, setFormData] = useState<FormState>(emptyForm());
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
    if (!options.some((unit) => unit.value === formData.baseUnit)) {
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
  const permissionUser = AuthService.getCurrentUser();
  const canCreateProduct = PermissionService.can(permissionUser, 'products.create');
  const canUpdateProduct = PermissionService.can(permissionUser, 'products.update');
  const canDeleteProduct = PermissionService.can(permissionUser, 'products.delete');
  const canExportProducts = PermissionService.can(permissionUser, 'products.export');
  const canImportProducts = PermissionService.can(permissionUser, 'products.import');
  const canAdjustInventory = PermissionService.can(permissionUser, 'inventory.adjust');
  const canCreateCategory = PermissionService.can(permissionUser, 'categories.create');
  const canCreateBrand = PermissionService.can(permissionUser, 'brands.create');
  const canViewCosts = PermissionService.can(permissionUser, 'finance.view');
  const canViewPricing = PermissionService.can(permissionUser, 'pricing.view');
  const canUpdatePricing = PermissionService.can(permissionUser, 'pricing.update');
  const canManagePricing = editingProduct ? canUpdatePricing : canCreateProduct;

  const productService = new ProductService();
  const inventoryService = new InventoryService();
  const categoryService = new CategoryService();
  const brandService = new BrandService();
  const attributeService = new AttributeService();
  const extraService = new ProductExtraService();

  const loadLookups = () => {
    try {
      setCategories(categoryService.getAllCategories());
      setBrands(brandService.getAllBrands());
      setWarehouses(inventoryService.getAllWarehouses());
      // Older installations saved a profile before attributes were materialized;
      // applying it here is idempotent and additive, and only for users who are
      // allowed to create products.
      if (PermissionService.can(AuthService.getCurrentUser(), 'products.create')) {
        BusinessProfileService.applyFromSettings();
      }
      setAttributes(attributeService.getCategories());
    } catch (e) {
      console.error(e);
    }
  };

  const loadStats = () => {
    try {
      setStats(productService.getProductStats());
    } catch (e) {
      console.error(e);
    }
  };

  const loadProducts = () => {
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
          stockStatus: stockStatus === 'all' ? undefined : stockStatus,
          sortBy,
          includeInactive: productStatus === 'all',
          status: productStatus,
        },
      );
      setProducts(result.items);
      setPage(result.page);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (e: any) {
      console.error(e);
      setLoadError(e?.message || 'تعذر تحميل الأصناف');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
    loadStats();
  }, []);

  useEffect(() => {
    loadProducts();
  }, [search, selectedCategory, selectedBrand, selectedGrade, stockStatus, sortBy, productStatus, page, pageSize]);

  useEffect(() => { setSelectedProductIds([]); }, [search, selectedCategory, selectedBrand, selectedGrade, stockStatus, sortBy, productStatus, page, pageSize]);

  useEffect(() => { setPage(1); }, [search, selectedCategory, selectedBrand, selectedGrade, stockStatus, sortBy, productStatus]);

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
      boxes: p.baseUnit === 'BOX' ? m2 : 0,
      pieces: p.baseUnit === 'PIECE' ? m2 : 0,
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

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setShowNewCategory(false);
    setShowNewBrand(false);
    setActiveTab('basic');
    setVariants([]);
    setRemovedVariantIds([]);
    setAttributeValues({});
    setExistingImages([]);
    setPendingImages([]);
    setRemovedImageIds([]);
    setEditStock([]);
    const randCode = Date.now().toString().slice(-6);
    setFormData({
      ...emptyForm(
        categories[0]?.id || '',
        brands[0]?.id || '',
        businessConfig.businessType === 'ceramics' ? 'CERAMIC' : 'GENERAL',
        { baseUnit: businessConfig.units[0] as any },
      ),
      sku: `${businessConfig.businessType === 'ceramics' ? 'TILE' : 'SKU'}-${randCode}`,
      barcode: `622${randCode}01`,
    });
    setOpeningRows([defaultOpeningRow(warehouses[0]?.id || '')]);
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
        grade: v.grade || 'GRADE_1',
        costPrice: v.costPrice || 0,
        sellingPriceM2: v.sellingPriceM2 || 0,
      })));
      setAttributeValues(extraService.getAttributeValues(product.id));
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
      { ...formData, size },
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
    const nextPieces = pieces || 1;
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

  const recalcOpeningRow = (form: FormState, metersPerBox: number, row: OpeningStockRow): OpeningStockRow => ({
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
    const used = new Set(openingRows.map((r) => r.warehouseId));
    const next = warehouses.find((w) => !used.has(w.id));
    if (!next) return;
    setOpeningRows((rows) => [...rows, defaultOpeningRow(next.id)]);
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
    setVariants((prev) => [...prev, { ...emptyVariant(), sku: `${formData.sku}-V${prev.length + 1}` }]);
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
    if (!formData.name.trim()) { alert('أدخل اسم الصنف.'); return false; }
    if (!formData.categoryId) { alert('اختر نوع المنتج أو أضف نوعًا جديدًا.'); return false; }
    if (formData.productType === 'CERAMIC' && !formData.brandId) { alert('اختر الماركة أو أضف ماركة جديدة.'); return false; }
    if (!formData.barcode.trim() || !formData.sku.trim()) { alert('الباركود وكود الصنف مطلوبان.'); return false; }
    const applicableAttributes = attributes.filter(
      (attribute) => !attribute.appliesToCategoryId || attribute.appliesToCategoryId === formData.categoryId,
    );
    try {
      for (const attribute of applicableAttributes) {
        normalizeDynamicAttributeValue(attribute, attributeValues[attribute.id]);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'راجع قيم الخصائص الإضافية.');
      return false;
    }
    return true;
  };

  const buildProductPayload = () => ({
    productType: formData.productType,
    name: formData.name.trim(),
    sku: formData.sku.trim(),
    barcode: formData.barcode.trim(),
    categoryId: formData.categoryId,
    brandId: formData.brandId,
    grade: formData.productType === 'CERAMIC' ? formData.grade : 'GRADE_1',
    size: formData.productType === 'CERAMIC' ? formData.size : '',
    thickness: formData.thickness,
    color: formData.color,
    tone: formData.tone,
    finish: formData.finish,
    surfaceLocation: formData.surfaceLocation,
    baseUnit: formData.baseUnit,
    sellUnit: formData.sellUnit,
    customUnit: formData.customUnit,
    piecesPerBox: formData.productType === 'CERAMIC' ? formData.piecesPerBox : 1,
    metersPerBox: formData.productType === 'CERAMIC' ? formData.metersPerBox : 1,
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
  });

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

  const saveOpeningStock = (productId: string) => {
    // A business that does not track inventory has no stock to open.
    if (!tracksInventory) return;
    openingRows
      .filter((row) => row.warehouseId && row.meters > 0)
      .forEach((row) => {
        try {
          inventoryService.adjustStock(
            productId,
            row.warehouseId,
            round(row.meters, 3),
            'رصيد افتتاحي عند تعريف الصنف',
          );
        } catch (err) {
          console.error(err);
        }
      });
  };

  const saveNewProductDetails = (productId: string) => {
    saveNewProductImages(productId);
    saveOpeningStock(productId);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isProductFormValid()) return;
    setIsSaving(true);
    try {
      const payload = buildProductPayload();

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

        removedImageIds.forEach((id) => {
          try { extraService.deleteImage(id); } catch (err) { console.error(err); }
        });
        if (!editingProduct) saveNewProductDetails(productId);
      }

      setIsModalOpen(false);
      loadProducts();
      loadStats();
      loadLookups();
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
      rows.forEach((row) => {
        const addMeters = metersPerBox > 0 ? row.addBoxes * metersPerBox : row.addBoxes;
        inventoryService.adjustStock(
          stockProduct.id,
          row.warehouseId,
          round(row.currentM2 + addMeters, 3),
          stockReason || 'إضافة كمية للمخزون',
        );
      });
      setStockProduct(null);
      loadProducts();
      loadStats();
    } catch (err: any) {
      alert(`تعذر إضافة الكمية: ${err?.message || err}`);
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
            stockStatus: stockStatus === 'all' ? undefined : stockStatus,
            sortBy,
            status: productStatus,
            includeInactive: productStatus === 'all',
          }).items;
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
          stockM2: stock.totalM2,
          stockBoxes: stock.totalBoxes,
          stockPieces: stock.totalPieces,
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
          ...(hasBoxUnits ? [
            { key: 'piecesPerBox', label: 'قطع/كرتونة' },
            { key: 'metersPerBox', label: 'م²/كرتونة' },
          ] : []),
          { key: 'costPrice', label: 'التكلفة' },
          { key: 'sellingPriceM2', label: 'سعر الوحدة' },
          ...(hasBoxUnits ? [{ key: 'sellingPriceBox', label: 'سعر الكرتونة' }] : []),
          { key: 'wholesalePriceM2', label: 'سعر الجملة' },
          { key: 'minStockLevel', label: 'حد الطلب' },
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
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      const categoryMap = new Map(categories.map((c) => [c.name.trim(), c.id]));
      const brandMap = new Map(brands.map((b) => [b.name.trim(), b.id]));
      const warehouseMap = new Map(warehouses.map((w) => [w.name.trim(), w.id]));

      for (let index = 0; index < rawRows.length; index += 1) {
        const row = rawRows[index];
        const name = pickCell(row, ['name', 'اسم الصنف', 'اسم المنتج', 'الاسم']);
        if (!name) continue;

        try {
          const categoryName = pickCell(row, ['category', 'النوع', 'التصنيف']) || 'عام';
          const brandName = pickCell(row, ['brand', 'الماركة', 'ماركة']) || 'عام';
          let categoryId = categoryMap.get(categoryName);
          if (!categoryId) {
            categoryId = categoryService.createCategory(categoryName).id;
            categoryMap.set(categoryName, categoryId);
          }
          let brandId = brandMap.get(brandName);
          if (!brandId) {
            brandId = brandService.createBrand(brandName).id;
            brandMap.set(brandName, brandId);
          }

          const stamp = `${Date.now().toString().slice(-5)}${String(index).padStart(3, '0')}`;
          const sku = pickCell(row, ['sku', 'الكود', 'كود الصنف']) || `IMP-${stamp}`;
          const barcode = pickCell(row, ['barcode', 'الباركود']) || `622${stamp}${String(index).padStart(2, '0')}`;
          const rowType = pickCell(row, ['productType', 'نوع الصنف', 'النوع']).toUpperCase();
          const ceramicRow = rowType.includes('CERAMIC')
            || rowType.includes('سيراميك')
            || (!rowType && businessConfig.businessType === 'ceramics');
          const importUnit = (pickCell(row, ['unit', 'الوحدة']) as any)
            || businessConfig.units[0]
            || 'PIECE';
          const size = pickCell(row, ['size', 'المقاس']) || (ceramicRow ? '60x60' : '');
          const piecesPerBox = Number(pickCell(row, ['piecesPerBox', 'قطع بالكرتونة', 'عدد القطع'])) || (ceramicRow ? 4 : 1);
          const metersPerBox = Number(pickCell(row, ['metersPerBox', 'م² بالكرتونة', 'المترات']))
            || (ceramicRow ? calcMetersFromSize(size, piecesPerBox) || 1.44 : 1);
          const costPrice = Number(pickCell(row, ['costPrice', 'التكلفة', 'سعر الشراء'])) || 0;
          const sellingPriceM2 = Number(pickCell(row, ['sellingPriceM2', 'سعر المتر', 'سعر البيع'])) || round(costPrice * 1.4);

          const product = productService.createProduct({
            name,
            sku,
            barcode,
            categoryId,
            brandId,
            productType: ceramicRow ? 'CERAMIC' : 'GENERAL',
            grade: parseGrade(pickCell(row, ['grade', 'الفرز'])),
            size,
            thickness: Number(pickCell(row, ['thickness', 'السمك'])) || 0,
            color: pickCell(row, ['color', 'اللون']),
            finish: pickCell(row, ['finish', 'التشطيب']),
            surfaceLocation: ceramicRow ? 'FLOOR' : 'GENERAL',
            baseUnit: ceramicRow ? 'M2' : importUnit,
            sellUnit: ceramicRow ? 'M2' : importUnit,
            piecesPerBox,
            metersPerBox,
            weightPerBox: Number(pickCell(row, ['weightPerBox', 'الوزن'])) || 0,
            costPrice,
            sellingPriceM2,
            sellingPriceBox: round(sellingPriceM2 * metersPerBox),
            wholesalePriceM2: Number(pickCell(row, ['wholesalePriceM2', 'سعر الجملة'])) || round(sellingPriceM2 * 0.9),
            minSellingPriceM2: Number(pickCell(row, ['minSellingPriceM2', 'أقل سعر'])) || round(sellingPriceM2 * 0.85),
            minStockLevel: Number(pickCell(row, ['minStockLevel', 'حد الطلب'])) || 10,
            maxStockLevel: 1000,
            notes: pickCell(row, ['notes', 'ملاحظات']),
            isActive: true,
          });

          const openingBoxes = Number(pickCell(row, ['openingBoxes', 'كراتين افتتاحية', 'الكمية'])) || 0;
          const warehouseName = pickCell(row, ['warehouse', 'المخزن']);
          const warehouseId = warehouseMap.get(warehouseName) || warehouses[0]?.id;
          if (tracksInventory && openingBoxes > 0 && warehouseId) {
            inventoryService.adjustStock(
              product.id,
              warehouseId,
              round(openingBoxes * metersPerBox, 3),
              'رصيد افتتاحي من استيراد جدول بيانات',
            );
          }
          created += 1;
        } catch (rowError: any) {
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
  const unitLabel = unitLabelFor(formData.baseUnit, formData.customUnit);

  const tracksInventory = businessConfig.trackInventory !== false;

  const tabs = useMemo(() => ([
    { id: 'basic' as TabId, label: 'البيانات الأساسية', icon: <Package className="w-4 h-4" /> },
    { id: 'units' as TabId, label: 'المقاس والوحدات', icon: <Ruler className="w-4 h-4" /> },
    ...(canManagePricing ? [{ id: 'pricing' as TabId, label: 'التسعير', icon: <Banknote className="w-4 h-4" /> }] : []),
    ...(tracksInventory && canAdjustInventory ? [{ id: 'stock' as TabId, label: 'المخزون', icon: <Boxes className="w-4 h-4" /> }] : []),
    { id: 'extras' as TabId, label: 'المتغيرات والصور', icon: <GitBranch className="w-4 h-4" /> },
  ]), [tracksInventory, canAdjustInventory, canManagePricing]);

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
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

      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[240px] relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="بحث بالاسم، الباركود، الكود، المقاس، النوع، الماركة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-4 pr-9 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button onClick={() => setShowFilters((v) => !v)} className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${showFilters ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            <Filter className="w-4 h-4" /> فلاتر متقدمة
          </button>
        <div className="flex items-center overflow-hidden rounded-xl border border-slate-200">
            <button onClick={() => setViewMode('table')} className={`px-2.5 py-2 ${viewMode === 'table' ? 'bg-sky-600 text-white' : 'bg-white text-slate-500'}`} title="عرض جدول"><List className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('cards')} className={`px-2.5 py-2 ${viewMode === 'cards' ? 'bg-sky-600 text-white' : 'bg-white text-slate-500'}`} title="عرض بطاقات"><LayoutGrid className="w-4 h-4" /></button>
          </div>
          <button onClick={() => { loadProducts(); loadStats(); loadLookups(); }} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" title="تحديث"><RefreshCw className="w-4 h-4" /></button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <select value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); setSearchParams(e.target.value ? { category: e.target.value } : {}, { replace: true }); }} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="">جميع الأنواع</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
            <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="">جميع الماركات</option>
              {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
            {businessConfig.businessType === 'ceramics' && (<select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="">جميع الفرزات</option>
              {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>)}
            <select value={stockStatus} onChange={(e) => setStockStatus(e.target.value as any)} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="all">حالة المخزون: الكل</option>
              <option value="in">متوفر</option>
              <option value="low">قارب على النفاذ</option>
              <option value="out">نافد</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="name">ترتيب: الاسم</option>
              <option value="newest">الأحدث إضافة</option>
              <option value="price_asc">السعر: الأقل</option>
              <option value="price_desc">السعر: الأعلى</option>
              <option value="stock_asc">المخزون: الأقل</option>
              <option value="stock_desc">المخزون: الأكثر</option>
            </select>
            <select aria-label="حالة الصنف" value={productStatus} onChange={(e) => setProductStatus(e.target.value as typeof productStatus)} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="active">الأصناف النشطة</option>
              <option value="inactive">الأصناف غير النشطة</option>
              <option value="all">كل الأصناف</option>
            </select>
            <button onClick={() => { setSearch(''); setSelectedCategory(''); setSearchParams({}, { replace: true }); setSelectedBrand(''); setSelectedGrade(''); setStockStatus('all'); setSortBy('name'); setProductStatus('active'); }} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-500 hover:bg-slate-50">مسح عوامل التصفية</button>
          </div>
        )}
      </div>

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
