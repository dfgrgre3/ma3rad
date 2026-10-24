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
import { Product, CeramicGrade, UnitType, Warehouse } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
import { exportToExcel } from '../utils/export';

const UNITS: { value: UnitType; label: string }[] = [
  { value: 'M2', label: 'متر مربع (م²)' },
  { value: 'LINEAR_METER', label: 'متر طولي' },
  { value: 'KG', label: 'كيلوجرام' },
  { value: 'TON', label: 'طن' },
  { value: 'SET', label: 'طقم' },
  { value: 'BOX', label: 'Box' },
  { value: 'PIECE', label: 'Piece' },
];
const unitLabelFor = (unit: UnitType, custom = '') => custom.trim() || UNITS.find((item) => item.value === unit)?.label || unit;

const SURFACES = [
  { value: 'FLOOR', label: 'أرضيات' },
  { value: 'WALL', label: 'حوائط' },
  { value: 'OUTDOOR', label: 'خارجي / حدائق' },
  { value: 'GENERAL', label: 'عام / متعدد' },
];

const GRADES: { value: CeramicGrade; label: string }[] = [
  { value: 'GRADE_1', label: 'فرز أول' },
  { value: 'GRADE_2', label: 'فرز ثاني' },
  { value: 'GRADE_3', label: 'فرز ثالث' },
  { value: 'COMMERCIAL', label: 'تجاري' },
];

const round = (value: number, digits = 2) => Number(((Number.isFinite(value) ? value : 0)).toFixed(digits));

const gradeLabel = (grade: CeramicGrade) => GRADES.find((g) => g.value === grade)?.label || grade;

const calcMetersFromSize = (size: string, pieces: number): number | null => {
  const normalized = (size || '').replace(/[×*]/g, 'x');
  const match = normalized.match(/^\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*$/i);
  if (!match) return null;
  const width = parseFloat(match[1]);
  const height = parseFloat(match[2]);
  if (!width || !height || !pieces || pieces <= 0) return null;
  return round((width / 100) * (height / 100) * pieces, 3);
};

interface FormState {
  productType: 'CERAMIC' | 'GENERAL';
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  brandId: string;
  grade: CeramicGrade;
  size: string;
  thickness: number;
  color: string;
  tone: string;
  finish: string;
  surfaceLocation: 'FLOOR' | 'WALL' | 'OUTDOOR' | 'GENERAL';
  baseUnit: UnitType;
  sellUnit: UnitType;
  customUnit: string;
  piecesPerBox: number;
  metersPerBox: number;
  weightPerBox: number;
  costPrice: number;
  sellingPriceM2: number;
  sellingPriceBox: number;
  wholesalePriceM2: number;
  minSellingPriceM2: number;
  minStockLevel: number;
  maxStockLevel: number;
  notes: string;
}

interface OpeningStockRow {
  warehouseId: string;
  boxes: number;
  pieces: number;
  meters: number;
}

interface VariantDraft {
  id?: string;
  variantName: string;
  sku: string;
  barcode: string;
  color: string;
  size: string;
  grade: string;
  costPrice: number;
  sellingPriceM2: number;
}

type TabId = 'basic' | 'units' | 'pricing' | 'stock' | 'extras';

const emptyForm = (categoryId = '', brandId = ''): FormState => ({
  productType: 'CERAMIC',
  name: '',
  sku: '',
  barcode: '',
  categoryId,
  brandId,
  grade: 'GRADE_1',
  size: '60x60',
  thickness: 8,
  color: '',
  tone: '',
  finish: 'لامع',
  surfaceLocation: 'FLOOR',
  baseUnit: 'M2',
  sellUnit: 'M2',
  customUnit: '',
  piecesPerBox: 4,
  metersPerBox: 1.44,
  weightPerBox: 0,
  costPrice: 150,
  sellingPriceM2: 220,
  sellingPriceBox: 316.8,
  wholesalePriceM2: 190,
  minSellingPriceM2: 180,
  minStockLevel: 20,
  maxStockLevel: 1000,
  notes: '',
});

const emptyVariant = (): VariantDraft => ({
  variantName: '', sku: '', barcode: '', color: '', size: '',
  grade: 'GRADE_1', costPrice: 0, sellingPriceM2: 0,
});

const ListPagination: React.FC<{ page: number; totalPages: number; totalItems: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }> = ({ page, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs">
    <span className="text-slate-500">عرض {Math.min((page - 1) * pageSize + 1, totalItems)}–{Math.min(page * pageSize, totalItems)} من {totalItems}</span>
    <div className="flex items-center gap-2">
      <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
      <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:cursor-not-allowed disabled:opacity-40">السابق</button>
      <span className="min-w-[70px] text-center font-bold">{page} / {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:cursor-not-allowed disabled:opacity-40">التالي</button>
    </div>
  </div>
);

const Field: React.FC<{ label: string; required?: boolean; hint?: string; children: React.ReactNode }> = ({ label, required, hint, children }) => (
  <div>
    <label className="mb-1 block font-bold text-slate-700">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
    {hint && <p className="mt-1 text-[10px] text-slate-400">{hint}</p>}
  </div>
);

const StatCard: React.FC<{ label: string; value: string; hint?: string; icon: React.ReactNode; tone: string }> = ({ label, value, hint, icon, tone }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
    <div className="text-[11px] font-bold text-slate-500">{label}</div>
    <div className="mt-0.5 text-lg font-black text-slate-900">{value}</div>
    {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
  </div>
);

const pickCell = (row: Record<string, any>, keys: string[]): string => {
  for (const key of keys) {
    const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.trim().toLowerCase());
    if (found !== undefined && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') {
      return String(row[found]).trim();
    }
  }
  return '';
};

const parseGrade = (value: string): CeramicGrade => {
  const v = value.trim();
  if (v.includes('ثاني') || v.toUpperCase() === 'GRADE_2') return 'GRADE_2';
  if (v.includes('ثالث') || v.toUpperCase() === 'GRADE_3') return 'GRADE_3';
  if (v.includes('تجاري') || v.toUpperCase() === 'COMMERCIAL') return 'COMMERCIAL';
  return 'GRADE_1';
};

export const ProductsView: React.FC = () => {
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
  const [openingRows, setOpeningRows] = useState<OpeningStockRow[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});
  const [existingImages, setExistingImages] = useState<ProductImage[]>([]);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [editStock, setEditStock] = useState<{ warehouseName: string; quantityM2: number }[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockReason, setStockReason] = useState('إضافة كمية للمخزون');
  const [stockRows, setStockRows] = useState<{ warehouseId: string; warehouseName: string; currentM2: number; addBoxes: number }[]>([]);
  const [stockSaving, setStockSaving] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();

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

  const stockOf = (p: Product) => {
    const m2 = Number(p.totalStockM2 ?? 0);
    if (p.productType === 'GENERAL') return { m2, boxes: 0, pieces: m2 };
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
      ...emptyForm(categories[0]?.id || '', brands[0]?.id || ''),
      sku: `TILE-${randCode}`,
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

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { alert('أدخل اسم الصنف.'); return; }
    if (!formData.categoryId) { alert('اختر نوع المنتج أو أضف نوعًا جديدًا.'); return; }
    if (formData.productType === 'CERAMIC' && !formData.brandId) { alert('اختر الماركة أو أضف ماركة جديدة.'); return; }
    if (!formData.barcode.trim() || !formData.sku.trim()) { alert('الباركود وكود الصنف مطلوبان.'); return; }
    setIsSaving(true);
    try {
      const payload = {
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
      };

      let productId = editingProduct?.id || '';
      if (editingProduct) {
        productService.updateProduct(editingProduct.id, payload);
      } else {
        const created = productService.createProduct({ ...payload, isActive: true });
        productId = created.id;
      }

      if (productId) {
        syncVariants(productId);
        extraService.setAttributeValues(productId, attributeValues);

        removedImageIds.forEach((id) => {
          try { extraService.deleteImage(id); } catch (err) { console.error(err); }
        });
        if (!editingProduct) {
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
        }
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
      exportToExcel({
        title: 'دليل المنتجات',
        subtitle: `عدد المنتجات: ${rows.length}`,
        fileName: 'products',
        columns: [
          { key: 'barcode', label: 'الباركود' },
          { key: 'sku', label: 'الكود' },
          { key: 'name', label: 'اسم المنتج' },
          { key: 'type', label: 'النوع' },
          { key: 'brand', label: 'الماركة' },
          { key: 'size', label: 'المقاس' },
          { key: 'grade', label: 'الفرز' },
          { key: 'color', label: 'اللون' },
          { key: 'tone', label: 'التون' },
          { key: 'finish', label: 'التشطيب' },
          { key: 'piecesPerBox', label: 'قطع/كرتونة' },
          { key: 'metersPerBox', label: 'م²/كرتونة' },
          { key: 'costPrice', label: 'التكلفة' },
          { key: 'sellingPriceM2', label: 'سعر المتر' },
          { key: 'sellingPriceBox', label: 'سعر الكرتونة' },
          { key: 'wholesalePriceM2', label: 'سعر الجملة' },
          { key: 'minStockLevel', label: 'حد الطلب' },
          { key: 'stockM2', label: 'المخزون م²' },
          { key: 'stockBoxes', label: 'المخزون كرتونة' },
          { key: 'stockPieces', label: 'المخزون قطعة' },
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
          const size = pickCell(row, ['size', 'المقاس']) || '60x60';
          const piecesPerBox = Number(pickCell(row, ['piecesPerBox', 'قطع بالكرتونة', 'عدد القطع'])) || 4;
          const metersPerBox = Number(pickCell(row, ['metersPerBox', 'م² بالكرتونة', 'المترات'])) || calcMetersFromSize(size, piecesPerBox) || 1.44;
          const costPrice = Number(pickCell(row, ['costPrice', 'التكلفة', 'سعر الشراء'])) || 0;
          const sellingPriceM2 = Number(pickCell(row, ['sellingPriceM2', 'سعر المتر', 'سعر البيع'])) || round(costPrice * 1.4);

          const product = productService.createProduct({
            name,
            sku,
            barcode,
            categoryId,
            brandId,
            grade: parseGrade(pickCell(row, ['grade', 'الفرز'])),
            size,
            thickness: Number(pickCell(row, ['thickness', 'السمك'])) || 0,
            color: pickCell(row, ['color', 'اللون']),
            finish: pickCell(row, ['finish', 'التشطيب']),
            surfaceLocation: 'FLOOR',
            baseUnit: 'M2',
            sellUnit: 'M2',
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
          if (openingBoxes > 0 && warehouseId) {
            inventoryService.adjustStock(
              product.id,
              warehouseId,
              round(openingBoxes * metersPerBox, 3),
              'رصيد افتتاحي من استيراد Excel',
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

  const tabs = useMemo(() => ([
    { id: 'basic' as TabId, label: 'البيانات الأساسية', icon: <Package className="w-4 h-4" /> },
    { id: 'units' as TabId, label: 'المقاس والوحدات', icon: <Ruler className="w-4 h-4" /> },
    { id: 'pricing' as TabId, label: 'التسعير', icon: <Banknote className="w-4 h-4" /> },
    { id: 'stock' as TabId, label: 'المخزون', icon: <Boxes className="w-4 h-4" /> },
    { id: 'extras' as TabId, label: 'المتغيرات والصور', icon: <GitBranch className="w-4 h-4" /> },
  ]), []);

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">إدارة المنتجات المتكاملة</h2>
          <p className="text-xs text-slate-500">الأنواع والماركات والمقاسات والعدد والكمية والمترات والتسعير والمخزون والصور والمتغيرات</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button onClick={() => setIsImportOpen(true)} className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-2 hover:bg-slate-50 transition text-sm">
            <Upload className="w-4 h-4" />
            <span>استيراد Excel</span>
          </button>
          <button onClick={handleExport} className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-2 hover:bg-slate-50 transition text-sm">
            <Download className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>
          <button onClick={handleOpenAddModal} className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/30 transition text-sm">
            <Plus className="w-4 h-4" />
            <span>إضافة صنف جديد</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="إجمالي الأصناف" value={String(stats?.totalProducts ?? totalItems)} hint={`نشط: ${stats?.activeProducts ?? 0} | موقوف: ${stats?.inactiveProducts ?? 0}`} icon={<Package className="w-5 h-5 text-sky-600" />} tone="bg-sky-50" />
        <StatCard label="إجمالي المخزون" value={CeramicMath.formatM2(stats?.totalStockM2 ?? 0)} hint={`${stats?.totalBoxes ?? 0} كرتونة`} icon={<Boxes className="w-5 h-5 text-emerald-600" />} tone="bg-emerald-50" />
        <StatCard label="قيمة المخزون" value={CeramicMath.formatCurrency(stats?.totalStockValue ?? 0)} icon={<Banknote className="w-5 h-5 text-indigo-600" />} tone="bg-indigo-50" />
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
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <select value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); setSearchParams(e.target.value ? { category: e.target.value } : {}, { replace: true }); }} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="">جميع الأنواع</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
            <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="">جميع الماركات</option>
              {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
            <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="">جميع الفرزات</option>
              {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
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
            <select aria-label="Product status" value={productStatus} onChange={(e) => setProductStatus(e.target.value as typeof productStatus)} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <option value="active">Active products</option>
              <option value="inactive">Inactive products</option>
              <option value="all">All products</option>
            </select>
            <button onClick={() => { setSearch(''); setSelectedCategory(''); setSearchParams({}, { replace: true }); setSelectedBrand(''); setSelectedGrade(''); setStockStatus('all'); setSortBy('name'); setProductStatus('active'); }} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-500 hover:bg-slate-50">Clear filters</button>
          </div>
        )}
      </div>

      {selectedProductIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
          <div className="text-xs font-bold text-sky-900">تم تحديد {selectedProductIds.length} صنف من الصفحة الحالية</div>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100">Export selected</button>
            <button onClick={() => handleBulkStatus(true)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">تفعيل المحدد</button>
            <button onClick={() => handleBulkStatus(false)} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">إيقاف المحدد</button>
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
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5 text-center"><input aria-label="تحديد كل أصناف الصفحة" type="checkbox" checked={products.length > 0 && products.every((product) => selectedProductIds.includes(product.id))} onChange={togglePageSelection} className="rounded border-slate-300 text-sky-600" /></th>
                  <th className="p-3.5">الصنف</th>
                  <th className="p-3.5">الباركود / الكود</th>
                  <th className="p-3.5">النوع والماركة</th>
                  <th className="p-3.5">المقاس والفرز</th>
                  <th className="p-3.5">التحويل</th>
                  <th className="p-3.5">التكلفة</th>
                  <th className="p-3.5">سعر المتر</th>
                  <th className="p-3.5">سعر الكرتونة</th>
                  <th className="p-3.5 text-center">المخزون</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const stock = stockOf(p);
                  return (
                    <tr key={p.id} className={`hover:bg-slate-50 transition ${p.isActive ? '' : 'opacity-60'}`}>
                      <td className="p-3.5 text-center"><input aria-label={`تحديد ${p.name}`} type="checkbox" checked={selectedProductIds.includes(p.id)} onChange={() => toggleProductSelection(p.id)} className="rounded border-slate-300 text-sky-600" /></td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                            {p.imagePath ? <img src={p.imagePath} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><Package className="w-4 h-4" /></div>}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{p.name}</div>
                            <div className="text-[10px] text-slate-500">{p.color || '—'} | {p.finish || '—'} {!p.isActive && <span className="text-rose-500 font-bold">(موقوف)</span>}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5 font-mono">
                        <div className="font-bold text-slate-900">{p.barcode}</div>
                        <div className="text-[10px] text-slate-500">{p.sku}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-700">{p.categoryName || '—'}</div>
                        <div className="text-[10px] text-slate-500">{p.brandName || '—'}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="font-bold text-slate-700">{p.size}</span>
                        <div className="text-[10px]">
                          <span className={`font-extrabold ${p.grade === 'GRADE_1' ? 'text-sky-600' : 'text-amber-600'}`}>{gradeLabel(p.grade)}</span>
                        </div>
                      </td>
                      <td className="p-3.5 font-semibold text-slate-700">
                        {p.productType === 'GENERAL' ? <div>{p.metersPerBox} {unitLabelFor(p.baseUnit, p.customUnit)}</div> : <>
                          <div>{p.metersPerBox} {p.baseUnit === 'LINEAR_METER' ? 'م' : 'م²'} / كرتونة</div>
                          <div className="text-[10px] text-slate-500">{p.piecesPerBox} قطعة / كرتونة</div>
                        </>}
                      </td>
                      <td className="p-3.5 font-mono text-slate-600">{CeramicMath.formatCurrency(p.costPrice)}</td>
                      <td className="p-3.5 font-black text-sky-600">{CeramicMath.formatCurrency(p.sellingPriceM2)}</td>
                      <td className="p-3.5 font-bold text-slate-900">{CeramicMath.formatCurrency(p.sellingPriceBox || (p.sellingPriceM2 * p.metersPerBox))}</td>
                      <td className="p-3.5 text-center">
                        <span className={`inline-block px-2 py-1 rounded-lg font-black text-[11px] ${stockTone(p)}`}>
                          {p.productType === 'GENERAL' ? `${round(stock.m2, 3)} ${unitLabelFor(p.baseUnit, p.customUnit)}` : <>
                            {CeramicMath.formatM2(stock.m2)}
                            <span className="mx-1 text-slate-400">|</span>
                            {round(stock.boxes)} كرتونة
                            <span className="mx-1 text-slate-400">|</span>
                            {Math.round(stock.pieces)} قطعة
                          </>}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => navigate(`/products/${p.id}`)} className="p-1.5 rounded-lg text-slate-500 hover:bg-sky-50 hover:text-sky-600 transition" title="عرض التفاصيل"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => openStockModal(p)} className="p-1.5 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition" title="إضافة كمية للمخزون"><PackagePlus className="w-4 h-4" /></button>
                          <button onClick={() => handleOpenEditModal(p)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition" title="تعديل"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => handleDuplicate(p)} className="p-1.5 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition" title="نسخ الصنف"><Copy className="w-4 h-4" /></button>
                          <button onClick={() => navigate('/products/barcodes')} className="p-1.5 rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 transition" title="طباعة باركود"><Barcode className="w-4 h-4" /></button>
                          <button onClick={() => handleToggleActive(p)} className={`p-1.5 rounded-lg transition ${p.isActive ? 'text-slate-500 hover:bg-amber-50 hover:text-amber-600' : 'text-emerald-600 hover:bg-emerald-50'}`} title={p.isActive ? 'إيقاف الصنف' : 'تفعيل الصنف'}><Power className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteProduct(p.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition" title="حذف"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {products.map((p) => {
              const stock = stockOf(p);
              return (
                <div key={p.id} className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md ${p.isActive ? '' : 'opacity-60'}`}>
                  <div className="relative h-36 bg-slate-100">
                    {p.imagePath ? <img src={p.imagePath} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><Package className="h-10 w-10" /></div>}
                    <span className={`absolute right-2 top-2 rounded-lg px-2 py-1 text-[10px] font-black ${stockTone(p)}`}>{CeramicMath.formatM2(stock.m2)}</span>
                    <input aria-label={`تحديد ${p.name}`} type="checkbox" checked={selectedProductIds.includes(p.id)} onChange={() => toggleProductSelection(p.id)} className="absolute left-2 top-2 h-4 w-4 rounded border-slate-300 text-sky-600" />
                    {!p.isActive && <span className="absolute left-2 top-2 rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-black text-white">موقوف</span>}
                  </div>
                  <div className="flex-1 space-y-2 p-3.5">
                    <div>
                      <h3 className="truncate text-sm font-extrabold text-slate-900">{p.name}</h3>
                      <p className="text-[10px] text-slate-500">{p.categoryName || '—'} | {p.brandName || '—'}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">{p.size}</span>
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-700">{gradeLabel(p.grade)}</span>
                      <span className="rounded-md bg-sky-50 px-2 py-0.5 text-sky-700">{p.piecesPerBox} قطعة / {p.metersPerBox} م²</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-lg border border-slate-200 py-1.5">
                        <div className="text-[9px] font-bold text-slate-400">سعر المتر</div>
                        <div className="text-xs font-black text-sky-600">{CeramicMath.formatCurrency(p.sellingPriceM2)}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 py-1.5">
                        <div className="text-[9px] font-bold text-slate-400">سعر الكرتونة</div>
                        <div className="text-xs font-black text-slate-800">{CeramicMath.formatCurrency(p.sellingPriceBox || p.sellingPriceM2 * p.metersPerBox)}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                      <span>كراتين: {round(stock.boxes)}</span>
                      <span>قطع: {Math.round(stock.pieces)}</span>
                      <span>حد الطلب: {p.minStockLevel}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => navigate(`/products/${p.id}`)} className="p-1.5 rounded-lg text-slate-500 hover:bg-white" title="تفاصيل"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => openStockModal(p)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-white" title="إضافة كمية"><PackagePlus className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleOpenEditModal(p)} className="p-1.5 rounded-lg text-slate-500 hover:bg-white" title="تعديل"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDuplicate(p)} className="p-1.5 rounded-lg text-indigo-600 hover:bg-white" title="نسخ"><Copy className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleToggleActive(p)} className="p-1.5 rounded-lg text-amber-600 hover:bg-white" title={p.isActive ? 'إيقاف' : 'تفعيل'}><Power className="w-3.5 h-3.5" /></button>
                    </div>
                    <button onClick={() => handleDeleteProduct(p.id)} className="p-1.5 rounded-lg text-rose-500 hover:bg-white" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!isLoading && !loadError && totalItems > 0 && <ListPagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      </div>

      {/* ADD / EDIT PRODUCT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="my-6 w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Package className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{editingProduct ? 'تعديل الصنف' : 'إضافة صنف جديد'}</h3>
                  <p className="text-[11px] text-slate-500">{editingProduct ? editingProduct.name : 'أكمل بيانات النوع والعدد والكمية والمترات والتسعير والمخزون'}</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-slate-100 px-4 pt-3">
              {tabs.map((tab) => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 rounded-t-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === tab.id ? 'bg-sky-50 text-sky-700 border-b-2 border-sky-600' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-5 p-6 text-xs">
              {activeTab === 'basic' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="md:col-span-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="نوع الصنف">
                          <select value={formData.productType} onChange={(e) => setFormData({ ...formData, productType: e.target.value as FormState['productType'] })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                            <option value="CERAMIC">سيراميك / بورسلين</option>
                            <option value="GENERAL">صنف عام (مواد تشطيب وغيرها)</option>
                          </select>
                        </Field>
                        <Field label="اسم الصنف" required>
                          <input required placeholder="مثال: سيراميك رويال 60×60 رمادي" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        </Field>
                        <Field label="الباركود" required>
                          <input required value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        </Field>
                        <Field label="كود الصنف (SKU)" required>
                          <div className="flex gap-2">
                            <input required value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-sky-500" />
                            <button type="button" onClick={() => setFormData({ ...formData, sku: `TILE-${Date.now().toString().slice(-6)}` })} className="rounded-xl border border-slate-200 px-2.5 text-slate-600 hover:bg-slate-100" title="توليد كود"><Calculator className="w-4 h-4" /></button>
                          </div>
                        </Field>
                        {formData.productType === 'CERAMIC' && <Field label="الفرز والدرجة">
                          <select value={formData.grade} onChange={(e) => setFormData({ ...formData, grade: e.target.value as CeramicGrade })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                            {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                          </select>
                        </Field>}
                        <Field label="نوع المنتج (التصنيف)" required>
                          {showNewCategory ? (
                            <div className="flex gap-2">
                              <input autoFocus value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="اسم النوع الجديد" className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-sky-300 font-bold focus:outline-none" />
                              <button type="button" onClick={handleAddCategory} className="rounded-xl bg-sky-600 px-3 font-bold text-white hover:bg-sky-700">حفظ</button>
                              <button type="button" onClick={() => setShowNewCategory(false)} className="rounded-xl border border-slate-200 px-2 text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-sky-500">
                                <option value="">— اختر النوع —</option>
                                {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} ({cat.productCount})</option>)}
                              </select>
                              <button type="button" onClick={() => setShowNewCategory(true)} className="rounded-xl border border-dashed border-sky-300 px-2.5 text-sky-600 hover:bg-sky-50" title="إضافة نوع"><Plus className="w-4 h-4" /></button>
                            </div>
                          )}
                        </Field>
                        <Field label="الماركة / المصنع" required={formData.productType === 'CERAMIC'}>
                          {showNewBrand ? (
                            <div className="flex gap-2">
                              <input autoFocus value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="اسم الماركة الجديدة" className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-sky-300 font-bold focus:outline-none" />
                              <button type="button" onClick={handleAddBrand} className="rounded-xl bg-sky-600 px-3 font-bold text-white hover:bg-sky-700">حفظ</button>
                              <button type="button" onClick={() => setShowNewBrand(false)} className="rounded-xl border border-slate-200 px-2 text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <select value={formData.brandId} onChange={(e) => setFormData({ ...formData, brandId: e.target.value })} className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-sky-500">
                                <option value="">— اختر الماركة —</option>
                                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name} ({brand.productCount})</option>)}
                              </select>
                              <button type="button" onClick={() => setShowNewBrand(true)} className="rounded-xl border border-dashed border-sky-300 px-2.5 text-sky-600 hover:bg-sky-50" title="إضافة ماركة"><Plus className="w-4 h-4" /></button>
                            </div>
                          )}
                        </Field>
                        {formData.productType === 'CERAMIC' && <Field label="الاستخدام / السطح">
                          <select value={formData.surfaceLocation} onChange={(e) => setFormData({ ...formData, surfaceLocation: e.target.value as FormState['surfaceLocation'] })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                            {SURFACES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </Field>}
                      </div>
                      <Field label="ملاحظات">
                        <input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="ملاحظات إضافية عن الصنف" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                      </Field>
                    </div>
                    <div className="space-y-2">
                      <label className="block font-bold text-slate-700">صورة الصنف</label>
                      <div onClick={() => imageInputRef.current?.click()} className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-sky-400 hover:text-sky-500">
                        <ImagePlus className="w-7 h-7" />
                        <span className="text-[10px] font-bold">اضغط لإضافة صور</span>
                      </div>
                      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageFiles(e.target.files)} />
                      {(existingImages.length > 0 || pendingImages.length > 0) && (
                        <div className="grid grid-cols-3 gap-1.5">
                          {existingImages.map((img) => (
                            <div key={img.id} className="relative overflow-hidden rounded-lg border border-slate-200">
                              <img src={img.filePath} alt={img.caption || ''} className="h-14 w-full object-cover" />
                              <button type="button" onClick={() => removeExistingImage(img)} className="absolute left-0.5 top-0.5 rounded bg-rose-600 p-0.5 text-white"><X className="w-3 h-3" /></button>
                              {img.isPrimary && <span className="absolute bottom-0.5 right-0.5 rounded bg-emerald-600 px-1 text-[8px] font-bold text-white">رئيسية</span>}
                            </div>
                          ))}
                          {pendingImages.map((src, i) => (
                            <div key={`pending-${i}`} className="relative overflow-hidden rounded-lg border border-slate-200">
                              <img src={src} alt="" className="h-14 w-full object-cover" />
                              <button type="button" onClick={() => setPendingImages((prev) => prev.filter((_, idx) => idx !== i))} className="absolute left-0.5 top-0.5 rounded bg-rose-600 p-0.5 text-white"><X className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                    <SlidersHorizontal className="w-4 h-4" />
                    تابع التبويبات لإدخال المقاس والعدد والكمية والمترات والتسعير والمخزون الافتتاحي والمتغيرات.
                  </div>
                </div>
              )}

              {activeTab === 'units' && (
                <div className="space-y-4">
                  {formData.productType === 'GENERAL' ? (
                    <section className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                      <div className="flex items-center gap-1.5 text-sm font-extrabold text-sky-800"><Ruler className="w-4 h-4" /> وحدة الصنف العام</div>
                      <p className="text-xs text-slate-600">اختر الوحدة التي ستُسجل بها الكميات في المخزون والفواتير.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="وحدة المخزون والبيع">
                          <select value={formData.baseUnit} onChange={(e) => setFormData({ ...formData, baseUnit: e.target.value as UnitType, sellUnit: e.target.value as UnitType })} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold">
                            {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                            <option value="CUSTOM">أخرى (اكتب الوحدة)</option>
                          </select>
                        </Field>
                        {formData.baseUnit === ('CUSTOM' as UnitType) && <Field label="اسم الوحدة" required>
                          <input required value={formData.customUnit} onChange={(e) => setFormData({ ...formData, customUnit: e.target.value })} placeholder="جردل، شيكارة، لفة..." className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold" />
                        </Field>}
                        <Field label={`سعر البيع / ${unitLabel}`}>
                          <input type="number" min="0" step="0.01" value={formData.sellingPriceM2} onChange={(e) => setFormData({ ...formData, sellingPriceM2: parseFloat(e.target.value) || 0, sellingPriceBox: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold" />
                        </Field>
                      </div>
                    </section>
                  ) : <>
                  <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800"><Ruler className="w-4 h-4 text-sky-600" /> المقاس والمواصفات</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Field label="المقاس (سم)" hint={autoMeters !== null ? `المساحة المحسوبة: ${autoMeters} م²/كرتونة` : 'أدخل الطول والعرض بالسنتيمتر'}>
                        <div className="flex items-center gap-2">
                          <input type="number" min="0" step="any" aria-label="الطول بالسنتيمتر" value={(formData.size || '').split(/[x×*]/i)[0] || ''} onChange={(e) => updateSizeDimension(0, e.target.value)} placeholder="60" className="w-full min-w-0 px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold" />
                          <span className="text-slate-400">×</span>
                          <input type="number" min="0" step="any" aria-label="العرض بالسنتيمتر" value={(formData.size || '').split(/[x×*]/i)[1] || ''} onChange={(e) => updateSizeDimension(1, e.target.value)} placeholder="120" className="w-full min-w-0 px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold" />
                        </div>
                      </Field>
                      <Field label="السمك (مم)">
                        <input type="number" step="0.1" value={formData.thickness} onChange={(e) => setFormData({ ...formData, thickness: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold" />
                      </Field>
                      <Field label="اللون">
                        <input value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} placeholder="رمادي رخامي" className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold" />
                      </Field>
                      <Field label="التون">
                        <select value={formData.tone} onChange={(e) => setFormData({ ...formData, tone: e.target.value })} className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold">
                          <option value="">— اختر التون —</option>
                          {Array.from({ length: 20 }, (_, index) => `T${index + 1}`).map((tone) => (
                            <option key={tone} value={tone}>{tone}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="التشطيب">
                        <input value={formData.finish} onChange={(e) => setFormData({ ...formData, finish: e.target.value })} placeholder="لامع / مطفي" className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold" />
                      </Field>
                    </div>
                  </section>

                  <section className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                    <div className="flex items-center gap-1.5 text-sm font-extrabold text-sky-800"><Layers className="w-4 h-4" /> الوحدات والعدد والمترات</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Field label="وحدة الأساس">
                        <select value={formData.baseUnit} onChange={(e) => setFormData({ ...formData, baseUnit: e.target.value as UnitType })} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold">
                          {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </Field>
                      <Field label="وحدة البيع">
                        <select value={formData.sellUnit} onChange={(e) => setFormData({ ...formData, sellUnit: e.target.value as UnitType })} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold">
                          {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </Field>
                      <Field label={`المترات / ${unitLabel} بالكرتونة`}>
                        <input type="number" step="0.001" value={formData.metersPerBox} onChange={(e) => handleMetersPerBoxChange(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold" />
                      </Field>
                      <Field label="عدد القطع بالكرتونة">
                        <input type="number" min="1" step="1" value={formData.piecesPerBox} onChange={(e) => handlePiecesPerBoxChange(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold" />
                      </Field>
                      <Field label="وزن الكرتونة (كجم)">
                        <input type="number" step="0.01" value={formData.weightPerBox} onChange={(e) => setFormData({ ...formData, weightPerBox: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold" />
                      </Field>
                      <div className="md:col-span-3 grid grid-cols-3 gap-3">
                        <div className="rounded-xl border border-sky-200 bg-white px-3 py-2">
                          <div className="text-[10px] font-bold text-slate-500">مساحة القطعة</div>
                          <div className="font-black text-sky-700">{round(areaPerPiece, 4)} م²</div>
                        </div>
                        <div className="rounded-xl border border-sky-200 bg-white px-3 py-2">
                          <div className="text-[10px] font-bold text-slate-500">تكلفة القطعة</div>
                          <div className="font-black text-sky-700">{CeramicMath.formatCurrency(costPerPiece)}</div>
                        </div>
                        <div className="rounded-xl border border-sky-200 bg-white px-3 py-2">
                          <div className="text-[10px] font-bold text-slate-500">قطع / متر</div>
                          <div className="font-black text-sky-700">{areaPerPiece > 0 ? round(1 / areaPerPiece, 2) : 0}</div>
                        </div>
                      </div>
                    </div>
                  </section>
                  </>}
                </div>
              )}

              {activeTab === 'pricing' && (
                <section className="space-y-3">
                  <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800"><Banknote className="w-4 h-4 text-emerald-600" /> التسعير</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Field label="سعر الشراء / التكلفة (للمتر)">
                      <input type="number" step="0.01" value={formData.costPrice} onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                    </Field>
                    <Field label="سعر بيع المتر (قطاعي)">
                      <input type="number" step="0.01" value={formData.sellingPriceM2} onChange={(e) => { const price = parseFloat(e.target.value) || 0; setFormData({ ...formData, sellingPriceM2: price, sellingPriceBox: round(price * formData.metersPerBox) }); }} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sky-600" />
                    </Field>
                    <Field label="سعر الكرتونة">
                      <input type="number" step="0.01" value={formData.sellingPriceBox} onChange={(e) => setFormData({ ...formData, sellingPriceBox: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                    </Field>
                    <Field label="سعر الجملة (للمتر)">
                      <input type="number" step="0.01" value={formData.wholesalePriceM2} onChange={(e) => setFormData({ ...formData, wholesalePriceM2: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                    </Field>
                    <Field label="الحد الأدنى لسعر المتر">
                      <input type="number" step="0.01" value={formData.minSellingPriceM2} onChange={(e) => setFormData({ ...formData, minSellingPriceM2: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                    </Field>
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <div>
                        <div className="text-[10px] font-bold text-emerald-700">ربح المتر</div>
                        <div className="font-black text-emerald-700">{CeramicMath.formatCurrency(profitPerMeter)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-emerald-700">هامش الربح</div>
                        <div className="font-black text-emerald-700">{round(profitMargin, 1)}%</div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <Field label="حد الطلب الأدنى (للمتر)">
                      <input type="number" step="0.01" value={formData.minStockLevel} onChange={(e) => setFormData({ ...formData, minStockLevel: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                    </Field>
                    <Field label="الحد الأقصى للمخزون">
                      <input type="number" step="0.01" value={formData.maxStockLevel} onChange={(e) => setFormData({ ...formData, maxStockLevel: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                    </Field>
                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                      <div className="text-[10px] font-bold text-sky-700">قيمة المخزون الافتتاحي</div>
                      <div className="font-black text-sky-700">{CeramicMath.formatCurrency(stockValue)}</div>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'stock' && (
                <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm font-extrabold text-amber-800"><Boxes className="w-4 h-4" /> المخزون الافتتاحي (عدد / كمية / مترات)</div>
                    {!editingProduct && <button type="button" onClick={addOpeningRow} disabled={openingRows.length >= warehouses.length} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">+ مخزن آخر</button>}
                  </div>

                  {editingProduct ? (
                    <div className="space-y-2">
                      {editStock.length === 0 ? (
                        <p className="rounded-xl border border-amber-200 bg-white px-3 py-3 text-[11px] text-slate-500">لا يوجد رصيد مسجل. استخدم زر "إضافة كمية للمخزون" من قائمة الأصناف.</p>
                      ) : editStock.map((row, i) => (
                        <div key={i} className="flex items-center justify-between rounded-xl border border-amber-200 bg-white px-3 py-2 text-[11px] font-bold">
                          <span className="text-slate-600">{row.warehouseName}</span>
                          <span className="text-amber-700">{CeramicMath.formatM2(row.quantityM2)}</span>
                        </div>
                      ))}
                      <p className="text-[10px] text-amber-700">لتعديل الرصيد استخدم زر إضافة كمية (PackagePlus) بجانب الصنف في القائمة.</p>
                    </div>
                  ) : (
                    <>
                      {openingRows.map((row, index) => (
                        <div key={index} className={`grid grid-cols-2 items-end gap-2 rounded-xl border border-amber-200 bg-white p-3 ${formData.productType === 'CERAMIC' ? 'md:grid-cols-5' : 'md:grid-cols-3'}`}>
                          <Field label="المخزن">
                            <select value={row.warehouseId} onChange={(e) => setOpeningRows((rows) => rows.map((r, i) => i === index ? { ...r, warehouseId: e.target.value } : r))} className="w-full px-3 py-2 rounded-xl border border-amber-300 font-bold">
                              {warehouses.filter((w) => w.id === row.warehouseId || !openingRows.some((other, otherIndex) => otherIndex !== index && other.warehouseId === w.id)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                          </Field>
                          {formData.productType === 'CERAMIC' && <Field label="عدد الكراتين">
                            <input type="number" min="0" step="0.01" value={row.boxes} onChange={(e) => setOpeningBy(index, 'boxes', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 rounded-xl border border-amber-300 font-bold" />
                          </Field>}
                          {formData.productType === 'CERAMIC' && <Field label="عدد القطع">
                            <input type="number" min="0" step="1" value={row.pieces} onChange={(e) => setOpeningBy(index, 'pieces', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 rounded-xl border border-amber-300 font-bold" />
                          </Field>}
                          <Field label={`الكمية (${unitLabel})`}>
                            <input type="number" min="0" step="0.001" value={row.meters} onChange={(e) => formData.productType === 'CERAMIC' ? setOpeningBy(index, 'meters', parseFloat(e.target.value) || 0) : setOpeningRows((rows) => rows.map((r, i) => i === index ? { ...r, meters: Math.max(0, parseFloat(e.target.value) || 0) } : r))} className="w-full px-3 py-2 rounded-xl border border-amber-300 font-bold" />
                          </Field>
                          <button type="button" onClick={() => removeOpeningRow(index)} className="rounded-xl border border-rose-200 px-2 py-2 text-rose-500 hover:bg-rose-50" title="حذف السطر"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-[11px]">
                        <span className="font-bold text-slate-600">قيمة المخزون الافتتاحي: <span className="text-amber-700">{CeramicMath.formatCurrency(stockValue)}</span></span>
                        {formData.productType === 'CERAMIC' && <span className="font-bold text-slate-600">إجمالي الكراتين: <span className="text-amber-700">{round(openingRows.reduce((s, r) => s + r.boxes, 0), 3)}</span> · القطع: <span className="text-amber-700">{Math.round(openingRows.reduce((s, r) => s + r.pieces, 0))}</span></span>}
                        <span className="font-bold text-slate-600">إجمالي المترات: <span className="text-amber-700">{round(openingRows.reduce((s, r) => s + r.meters, 0), 3)} {unitLabel}</span></span>
                      </div>
                    </>
                  )}
                </section>
              )}

              {activeTab === 'extras' && (
                <div className="space-y-5">
                  <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sm font-extrabold text-indigo-800"><GitBranch className="w-4 h-4" /> متغيرات الصنف (ألوان / مقاسات / فرزات)</div>
                      <button type="button" onClick={addVariantDraft} className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100">+ إضافة متغير</button>
                    </div>
                    {variants.length === 0 ? (
                      <p className="rounded-xl border border-indigo-200 bg-white px-3 py-3 text-[11px] text-slate-500">لا توجد متغيرات. أضف متغيرات لتتبع الألوان والمقاسات المختلفة بنفس الصنف.</p>
                    ) : variants.map((v, index) => (
                      <div key={index} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-indigo-200 bg-white p-3 md:grid-cols-7">
                        <Field label="اسم المتغير"><input value={v.variantName} onChange={(e) => updateVariantDraft(index, { variantName: e.target.value })} placeholder="رمادي 60x60" className="w-full px-2.5 py-2 rounded-lg border border-indigo-200 font-bold" /></Field>
                        <Field label="SKU"><input value={v.sku} onChange={(e) => updateVariantDraft(index, { sku: e.target.value })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200 font-mono" /></Field>
                        <Field label="الباركود"><input value={v.barcode} onChange={(e) => updateVariantDraft(index, { barcode: e.target.value })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200 font-mono" /></Field>
                        <Field label="اللون"><input value={v.color} onChange={(e) => updateVariantDraft(index, { color: e.target.value })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200" /></Field>
                        <Field label="المقاس"><input value={v.size} onChange={(e) => updateVariantDraft(index, { size: e.target.value })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200" /></Field>
                        <Field label="الفرز">
                          <select value={v.grade} onChange={(e) => updateVariantDraft(index, { grade: e.target.value })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200 font-bold">
                            {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                          </select>
                        </Field>
                        <div className="flex items-end gap-1">
                          <Field label="سعر المتر"><input type="number" value={v.sellingPriceM2} onChange={(e) => updateVariantDraft(index, { sellingPriceM2: parseFloat(e.target.value) || 0 })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200" /></Field>
                          <button type="button" onClick={() => removeVariantDraft(index)} className="mb-0.5 rounded-lg border border-rose-200 p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                    <div className="flex items-center gap-1.5 text-sm font-extrabold text-violet-800"><SlidersHorizontal className="w-4 h-4" /> خصائص ومواصفات إضافية</div>
                    {attributes.length === 0 ? (
                      <p className="rounded-xl border border-violet-200 bg-white px-3 py-3 text-[11px] text-slate-500">لا توجد خصائص معرّفة. يمكنك إدارتها من صفحة خصائص المنتجات.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        {attributes.map((attr) => (
                          <Field key={attr.id} label={`${attr.name}${attr.unit ? ` (${attr.unit})` : ''}`}>
                            {attr.values.length > 0 ? (
                              <select value={attributeValues[attr.id] || ''} onChange={(e) => setAttributeValues((prev) => ({ ...prev, [attr.id]: e.target.value }))} className="w-full px-3 py-2 bg-white rounded-xl border border-violet-200 font-bold">
                                <option value="">— بدون —</option>
                                {attr.values.map((opt) => <option key={opt.id} value={opt.value}>{opt.label}</option>)}
                                {attributeValues[attr.id] && !attr.values.some((o) => o.value === attributeValues[attr.id]) && <option value={attributeValues[attr.id]}>{attributeValues[attr.id]}</option>}
                              </select>
                            ) : (
                              <input value={attributeValues[attr.id] || ''} onChange={(e) => setAttributeValues((prev) => ({ ...prev, [attr.id]: e.target.value }))} className="w-full px-3 py-2 bg-white rounded-xl border border-violet-200 font-bold" />
                            )}
                          </Field>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  {formData.categoryId && formData.brandId ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                  <span>{formData.categoryId && formData.brandId ? 'النوع والماركة محددان جاهزان للحفظ' : 'يجب تحديد النوع والماركة قبل الحفظ'}</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">إلغاء</button>
                  <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-black rounded-xl shadow-lg shadow-sky-600/30">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {editingProduct ? 'حفظ التعديلات' : 'حفظ الصنف'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK MODAL */}
      {stockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><PackagePlus className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">إضافة كمية للمخزون</h3>
                  <p className="text-[11px] text-slate-500">{stockProduct.name} • {stockProduct.size} • {stockProduct.metersPerBox} م²/كرتونة</p>
                </div>
              </div>
              <button onClick={() => setStockProduct(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4 p-6 text-xs">
              <div className="space-y-2">
                {stockRows.map((row, index) => (
                  <div key={row.warehouseId} className="grid grid-cols-3 items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <Field label="المخزن"><div className="px-3 py-2 font-bold text-slate-700">{row.warehouseName}</div></Field>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <div className="text-[10px] font-bold text-emerald-700">الرصيد الحالي</div>
                      <div className="font-black text-emerald-700">{CeramicMath.formatM2(row.currentM2)}</div>
                    </div>
                    <Field label="عدد الكراتين المضافة">
                      <input type="number" min="0" step="0.01" value={row.addBoxes || ''} onChange={(e) => { const value = parseFloat(e.target.value) || 0; setStockRows((prev) => prev.map((r, i) => i === index ? { ...r, addBoxes: value } : r)); }} className="w-full px-3 py-2 bg-white rounded-xl border border-emerald-300 font-bold" placeholder="0" />
                    </Field>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="القيمة المضافة (م²)">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-black text-emerald-700">
                    {round(stockRows.reduce((s, r) => s + r.addBoxes, 0) * (stockProduct.metersPerBox || 0), 3)} م²
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
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><FileSpreadsheet className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">استيراد المنتجات من Excel</h3>
                  <p className="text-[11px] text-slate-500">ارفع ملف Excel (.xlsx) لإنشاء الأصناف دفعة واحدة</p>
                </div>
              </div>
              <button onClick={() => { setIsImportOpen(false); setImportResult(null); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4 p-6 text-xs">
              <button onClick={downloadImportTemplate} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-700 hover:bg-slate-100">
                <span className="flex items-center gap-2"><Download className="w-4 h-4 text-sky-600" /> تحميل قالب Excel جاهز</span>
                <span className="text-[10px] text-slate-400">xlsx</span>
              </button>
              <div onClick={() => importInputRef.current?.click()} className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/50 px-4 py-10 text-center hover:border-sky-500">
                {isImporting ? <Loader2 className="w-8 h-8 animate-spin text-sky-600" /> : <Upload className="w-8 h-8 text-sky-500" />}
                <span className="text-sm font-bold text-slate-700">{isImporting ? 'جاري استيراد الأصناف...' : 'اضغط لاختيار ملف Excel'}</span>
                <span className="text-[10px] text-slate-500">يتم إنشاء الأنواع والماركات غير الموجودة تلقائيًا</span>
              </div>
              <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImportFile(file); e.target.value = ''; }} />
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
