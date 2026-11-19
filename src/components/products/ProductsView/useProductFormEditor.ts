import React, { useRef, useState } from 'react';
import type { Product, CeramicGrade } from '../../../types';
import type { ProductService } from '../../../services/domains/products/ProductService';
import type { ProductFormPreferencesService } from '../../../services/domains/products/ProductFormPreferencesService';
import type { InventoryService } from '../../../services/domains/inventory/InventoryService';
import type { CategoryService, CategoryWithCount } from '../../../services/domains/products/CategoryService';
import type { BrandService, BrandWithCount } from '../../../services/domains/products/BrandService';
import type { AttributeCategory } from '../../../services/domains/products/AttributeService';
import type { OperationalFieldService, OperationalFieldDefinition, ProductGradeOption } from '../../../services/domains/products/OperationalFieldService';
import type { ProductExtraService, ProductImage } from '../../../services/domains/products/ProductExtraService';
import { normalizeDynamicAttributeValue } from '../../../services/domains/products/dynamicAttributes';
import {
  calcMetersFromSize, emptyProductEntryForm, emptyVariant, round,
  type FormState, type OpeningStockRow, type ProductEntryFormState, type TabId, type VariantDraft,
} from '../productFormModel';
import {
  PRODUCT_FORM_DEFAULT_FIELDS, applyRememberedFormFields, isProductFormDefaultField,
} from './productFormConstants';
import type { useToast } from '../../ui/Toast';

export interface ProductFormEditorDeps {
  productService: ProductService;
  productFormPreferences: ProductFormPreferencesService;
  inventoryService: InventoryService;
  categoryService: CategoryService;
  brandService: BrandService;
  operationalFieldService: OperationalFieldService;
  extraService: ProductExtraService;
  categories: CategoryWithCount[];
  brands: BrandWithCount[];
  setCategories: React.Dispatch<React.SetStateAction<CategoryWithCount[]>>;
  setBrands: React.Dispatch<React.SetStateAction<BrandWithCount[]>>;
  attributes: AttributeCategory[];
  operationalFields: OperationalFieldDefinition[];
  gradeOptions: ProductGradeOption[];
  tracksInventory: boolean;
  toast: ReturnType<typeof useToast>;
  reload: () => void;
}

/**
 * Owns all state and handlers for the add/edit product modal: form fields,
 * variants, images, opening stock rows, remembered field preferences and tones.
 */
export function useProductFormEditor(deps: ProductFormEditorDeps) {
  const {
    productService, productFormPreferences, inventoryService, categoryService,
    brandService, extraService, operationalFieldService,
    categories, brands, setCategories, setBrands, attributes, operationalFields, gradeOptions,
    tracksInventory, toast, reload,
  } = deps;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [formData, setFormData] = useState<ProductEntryFormState>(emptyProductEntryForm());
  const [rememberedFields, setRememberedFields] = useState<Record<string, string | number>>({});
  const [toneOptions, setToneOptions] = useState<string[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});
  const [operationalFieldValues, setOperationalFieldValues] = useState<Record<string, string>>({});
  const [existingImages, setExistingImages] = useState<ProductImage[]>([]);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [editStock, setEditStock] = useState<{ warehouseName: string; quantityM2: number }[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [openingRows, setOpeningRows] = useState<OpeningStockRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);

  const regenerateProductCode = (field: 'sku' | 'barcode', currentValue: string) => {
    try {
      const value = field === 'sku'
        ? productService.generateNextSku(currentValue)
        : productService.generateNextBarcode(currentValue);
      setFormData((current) => ({ ...current, [field]: value }));
    } catch (error) {
      toast.error(`تعذر توليد ${field === 'sku' ? 'كود الصنف' : 'الباركود'}: ${error instanceof Error ? error.message : String(error)}`);
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
      toast.error(`تعذر تجهيز نموذج الصنف: ${error instanceof Error ? error.message : String(error)}`);
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

  const defaultOpeningRow = (warehouseId: string): OpeningStockRow => ({ warehouseId, boxes: 0, pieces: 0, meters: 0 });

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
      toast.error(`تعذر إضافة النوع: ${err?.message || err}`);
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
      toast.error(`تعذر إضافة الماركة: ${err?.message || err}`);
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
            toast.error(`تعذر رفع الصورة: ${err?.message || err}`);
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
    if (!formData.productType) { toast.warning('اختر نوع الصنف.'); return false; }
    if (!formData.name.trim()) { toast.warning('أدخل اسم الصنف.'); return false; }
    if (!formData.categoryId) { toast.warning('اختر نوع المنتج أو أضف نوعًا جديدًا.'); return false; }
    if (formData.productType === 'CERAMIC' && !formData.brandId) { toast.warning('اختر الماركة أو أضف ماركة جديدة.'); return false; }
    if (!formData.baseUnit || !formData.sellUnit) { toast.warning('اختر وحدة الأساس ووحدة البيع.'); return false; }
    if (formData.productType === 'CERAMIC' && (!formData.grade || !formData.surfaceLocation)) {
      toast.warning('اختر درجة الصنف والاستخدام / السطح.');
      return false;
    }
    if (!formData.barcode.trim() || !formData.sku.trim()) { toast.error('الباركود وكود الصنف مطلوبان.'); return false; }
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
      toast.error(error instanceof Error ? error.message : 'راجع قيم الخصائص الإضافية.');
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
      toast.error(`تعذر حفظ اختيارات الخانات: ${err instanceof Error ? err.message : String(err)}`);
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
      toast.error(`تعذر إضافة التون: ${error instanceof Error ? error.message : String(error)}`);
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
      toast.error(`تعذر حذف التون: ${error instanceof Error ? error.message : String(error)}`);
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
      reload();
      if (openingStockRequests > 0) {
        toast.warning(`تم إنشاء ${openingStockRequests} طلب رصيد افتتاحي، ويظهر في المخزون بعد اعتماده وترحيله.`);
      }
    } catch (err: any) {
      toast.error(`خطأ: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return {
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
  };
}
