import React from 'react';
import {
  AlertTriangle, Banknote, Boxes, CheckCircle, GitBranch, ImagePlus,
  Layers, Loader2, Package, Plus, RefreshCw, Ruler, Save, SlidersHorizontal, Trash2, X,
} from 'lucide-react';
import type { Product, CeramicGrade, UnitType, Warehouse } from '../../types';
import type { ProductImage } from '../../services/ProductExtraService';
import type { AttributeCategory } from '../../services/AttributeService';
import type { CategoryWithCount } from '../../services/CategoryService';
import type { BrandWithCount } from '../../services/BrandService';
import type { BusinessConfiguration } from '../../config/businessProfiles';
import { CeramicMath } from '../../utils/ceramicMath';
import { Field } from './ProductUi';
import { OperationalFieldsForm } from '../OperationalFieldsForm';
import type { OperationalFieldDefinition, ProductGradeOption } from '../../services/OperationalFieldService';
import {
  SURFACES, round,
  type ProductEntryFormState, type OpeningStockRow, type TabId, type VariantDraft,
} from './productFormModel';

export interface ProductFormModalProps {
  open: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  editingProduct: Product | null;
  rememberedFields: Record<string, string | number>;
  fieldPreferenceOptions: { key: string; label: string }[];
  onSaveSelectedFields: (fieldKeys: string[]) => boolean;
  onRegenerateBarcode: () => void;
  onRegenerateSku: () => void;
  toneOptions: string[];
  onAddTone: (tone: string) => boolean;
  onDeleteTone: (tone: string) => void;
  productSingularLabel: string;
  onClose: () => void;
  tabs: { id: TabId; label: string; icon: React.ReactNode }[];
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  onSubmit: (event: React.FormEvent) => void;
  formData: ProductEntryFormState;
  setFormData: (value: ProductEntryFormState | ((previous: ProductEntryFormState) => ProductEntryFormState)) => void;
  canCreateCategory: boolean;
  showNewCategory: boolean;
  setShowNewCategory: (value: boolean) => void;
  newCategory: string;
  setNewCategory: (value: string) => void;
  onAddCategory: () => void;
  canCreateBrand: boolean;
  showNewBrand: boolean;
  setShowNewBrand: (value: boolean) => void;
  newBrand: string;
  setNewBrand: (value: string) => void;
  onAddBrand: () => void;
  imageInputRef: React.RefObject<HTMLInputElement>;
  onImageFiles: (files: FileList | null) => void;
  existingImages: ProductImage[];
  onRemoveExistingImage: (image: ProductImage) => void;
  pendingImages: string[];
  setPendingImages: React.Dispatch<React.SetStateAction<string[]>>;
  categories: CategoryWithCount[];
  brands: BrandWithCount[];
  profileUnitOptions: { value: string; label: string }[];
  businessConfig: BusinessConfiguration;
  unitLabel: string;
  autoMeters: number | null;
  onUpdateSizeDimension: (dimension: 0 | 1, value: string) => void;
  onMetersPerBoxChange: (meters: number) => void;
  onPiecesPerBoxChange: (pieces: number) => void;
  areaPerPiece: number;
  costPerPiece: number;
  canManagePricing: boolean;
  profitPerMeter: number;
  profitMargin: number;
  stockValue: number;
  onAddOpeningRow: () => void;
  openingRows: OpeningStockRow[];
  warehouses: Warehouse[];
  editStock: { warehouseName: string; quantityM2: number }[];
  setOpeningRows: React.Dispatch<React.SetStateAction<OpeningStockRow[]>>;
  onSetOpeningBy: (index: number, basis: 'boxes' | 'pieces' | 'meters', value: number) => void;
  onRemoveOpeningRow: (index: number) => void;
  variants: VariantDraft[];
  onAddVariantDraft: () => void;
  onUpdateVariantDraft: (index: number, patch: Partial<VariantDraft>) => void;
  onRemoveVariantDraft: (index: number) => void;
  attributes: AttributeCategory[];
  attributeValues: Record<string, string>;
  setAttributeValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  operationalFields: OperationalFieldDefinition[];
  operationalFieldValues: Record<string, string>;
  setOperationalFieldValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  gradeOptions: ProductGradeOption[];
  isSaving: boolean;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  open,
  canCreate,
  canUpdate,
  editingProduct,
  rememberedFields,
  fieldPreferenceOptions,
  onSaveSelectedFields,
  onRegenerateBarcode,
  onRegenerateSku,
  toneOptions,
  onAddTone,
  onDeleteTone,
  productSingularLabel,
  onClose,
  tabs,
  activeTab,
  setActiveTab,
  onSubmit,
  formData,
  setFormData,
  canCreateCategory,
  showNewCategory,
  setShowNewCategory,
  newCategory,
  setNewCategory,
  onAddCategory,
  canCreateBrand,
  showNewBrand,
  setShowNewBrand,
  newBrand,
  setNewBrand,
  onAddBrand,
  imageInputRef,
  onImageFiles,
  existingImages,
  onRemoveExistingImage,
  pendingImages,
  setPendingImages,
  categories,
  brands,
  profileUnitOptions,
  businessConfig,
  unitLabel,
  autoMeters,
  onUpdateSizeDimension,
  onMetersPerBoxChange,
  onPiecesPerBoxChange,
  areaPerPiece,
  costPerPiece,
  canManagePricing,
  profitPerMeter,
  profitMargin,
  stockValue,
  onAddOpeningRow,
  openingRows,
  warehouses,
  editStock,
  setOpeningRows,
  onSetOpeningBy,
  onRemoveOpeningRow,
  variants,
  onAddVariantDraft,
  onUpdateVariantDraft,
  onRemoveVariantDraft,
  attributes,
  attributeValues,
  setAttributeValues,
  operationalFields,
  operationalFieldValues,
  setOperationalFieldValues,
  gradeOptions,
  isSaving,
}) => {
  const [newTone, setNewTone] = React.useState('');
  const [showFieldPreferences, setShowFieldPreferences] = React.useState(false);
  const [selectedFieldKeys, setSelectedFieldKeys] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open || editingProduct) {
      setShowFieldPreferences(false);
      return;
    }
    setSelectedFieldKeys(Object.keys(rememberedFields));
  }, [open, editingProduct, rememberedFields]);

  if (!open || !(editingProduct ? canUpdate : canCreate)) return null;

  return (

        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="my-6 w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Package className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{editingProduct ? `تعديل ${productSingularLabel}` : `إضافة ${productSingularLabel} جديد`}</h3>
                  <p className="text-[11px] text-slate-500">{editingProduct ? editingProduct.name : 'أكمل بيانات النوع والعدد والكمية والمترات والتسعير والمخزون'}</p>
                  {!editingProduct && <p className="mt-0.5 text-[10px] text-sky-700">اختر الخانات التي تريد الاحتفاظ بقيمها للمنتجات التالية</p>}
                  {!editingProduct && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFieldKeys(Object.keys(rememberedFields));
                        setShowFieldPreferences(true);
                      }}
                      className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-bold text-sky-700 hover:bg-sky-100"
                    >
                      اختيار الخانات المحفوظة ({Object.keys(rememberedFields).length})
                    </button>
                  )}
                </div>
              </div>
              <button onClick={() => onClose()} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-slate-100 px-4 pt-3">
              {tabs.map((tab) => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 rounded-t-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === tab.id ? 'bg-sky-50 text-sky-700 border-b-2 border-sky-600' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={onSubmit} className="space-y-5 p-6 text-xs">
              {activeTab === 'basic' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="md:col-span-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="نوع الصنف">
                          <select required value={formData.productType} onChange={(e) => setFormData({ ...formData, productType: e.target.value as ProductEntryFormState['productType'] })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                            <option value="">— اختر نوع الصنف —</option>
                            <option value="CERAMIC">سيراميك / بورسلين</option>
                            <option value="GENERAL">صنف عام (مواد تشطيب وغيرها)</option>
                          </select>
                        </Field>
                        <Field label={`اسم ${productSingularLabel}`} required>
                          <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        </Field>
                        <Field label="الباركود" required>
                          <div className="flex gap-2">
                            <input required value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} className="min-w-0 flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-sky-500" />
                            {!editingProduct && <button type="button" onClick={onRegenerateBarcode} aria-label="توليد باركود جديد" title="توليد باركود جديد يبدأ من أول رقم غير مستخدم" className="rounded-xl border border-sky-200 px-3 text-sky-700 hover:bg-sky-50"><RefreshCw className="h-4 w-4" /></button>}
                          </div>
                        </Field>
                        <Field label="كود الصنف (SKU)" required>
                          <div className="flex gap-2">
                            <input required value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} className="min-w-0 flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-sky-500" />
                            {!editingProduct && <button type="button" onClick={onRegenerateSku} aria-label="توليد كود صنف جديد" title="توليد كود صنف جديد" className="rounded-xl border border-sky-200 px-3 text-sky-700 hover:bg-sky-50"><RefreshCw className="h-4 w-4" /></button>}
                          </div>
                        </Field>
                        {formData.productType === 'CERAMIC' && <Field label="الفرز والدرجة">
                          <select required value={formData.grade} onChange={(e) => setFormData({ ...formData, grade: e.target.value as CeramicGrade | '' })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                            <option value="">— اختر الدرجة —</option>
                            {gradeOptions.filter((option) => option.isActive || option.value === formData.grade).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                          </select>
                        </Field>}
                        <Field label="نوع المنتج (التصنيف)" required>
                          {showNewCategory ? (
                            <div className="flex gap-2">
                              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="اسم النوع الجديد" className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-sky-300 font-bold focus:outline-none" />
                              {canCreateCategory && <button type="button" onClick={onAddCategory} className="rounded-xl bg-sky-600 px-3 font-bold text-white hover:bg-sky-700">حفظ</button>}
                              <button type="button" onClick={() => setShowNewCategory(false)} className="rounded-xl border border-slate-200 px-2 text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-sky-500">
                                <option value="">— اختر النوع —</option>
                                {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} ({cat.productCount})</option>)}
                              </select>
                              {canCreateCategory && <button type="button" onClick={() => setShowNewCategory(true)} className="rounded-xl border border-dashed border-sky-300 px-2.5 text-sky-600 hover:bg-sky-50" title="إضافة نوع"><Plus className="w-4 h-4" /></button>}
                            </div>
                          )}
                        </Field>
                        <Field label="الماركة / المصنع" required={formData.productType === 'CERAMIC'}>
                          {showNewBrand ? (
                            <div className="flex gap-2">
                              <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="اسم الماركة الجديدة" className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-sky-300 font-bold focus:outline-none" />
                              {canCreateBrand && <button type="button" onClick={onAddBrand} className="rounded-xl bg-sky-600 px-3 font-bold text-white hover:bg-sky-700">حفظ</button>}
                              <button type="button" onClick={() => setShowNewBrand(false)} className="rounded-xl border border-slate-200 px-2 text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <select value={formData.brandId} onChange={(e) => setFormData({ ...formData, brandId: e.target.value })} className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-sky-500">
                                <option value="">— اختر الماركة —</option>
                                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name} ({brand.productCount})</option>)}
                              </select>
                              {canCreateBrand && <button type="button" onClick={() => setShowNewBrand(true)} className="rounded-xl border border-dashed border-sky-300 px-2.5 text-sky-600 hover:bg-sky-50" title="إضافة ماركة"><Plus className="w-4 h-4" /></button>}
                            </div>
                          )}
                        </Field>
                        {formData.productType === 'CERAMIC' && <Field label="الاستخدام / السطح">
                          <select required value={formData.surfaceLocation} onChange={(e) => setFormData({ ...formData, surfaceLocation: e.target.value as ProductEntryFormState['surfaceLocation'] })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                            <option value="">— اختر الاستخدام —</option>
                            {SURFACES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </Field>}
                      </div>
                      <Field label="ملاحظات">
                        <input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="ملاحظات إضافية عن الصنف" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                      </Field>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="product-image-upload" className="mb-1 block font-bold text-slate-700">صورة الصنف</label>
                      <button type="button" onClick={() => imageInputRef.current?.click()} className="flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-sky-400 hover:text-sky-500">
                        <ImagePlus className="w-7 h-7" />
                        <span className="text-[10px] font-bold">اضغط لإضافة صور</span>
                      </button>
                      <input id="product-image-upload" ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onImageFiles(e.target.files)} />
                      {(existingImages.length > 0 || pendingImages.length > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                          {existingImages.map((img) => (
                            <div key={img.id} className="relative overflow-hidden rounded-lg border border-slate-200">
                              <img src={img.filePath} alt={img.caption || ''} className="h-14 w-full object-cover" />
                              <button type="button" onClick={() => onRemoveExistingImage(img)} className="absolute left-0.5 top-0.5 rounded bg-rose-600 p-0.5 text-white"><X className="w-3 h-3" /></button>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="وحدة المخزون والبيع">
                          <select required value={formData.baseUnit} onChange={(e) => setFormData({ ...formData, baseUnit: e.target.value as UnitType | '', sellUnit: e.target.value as UnitType | '' })} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold">
                            <option value="">— اختر الوحدة —</option>
                            {profileUnitOptions.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                          </select>
                        </Field>
                        {formData.baseUnit === ('CUSTOM' as UnitType) && <Field label="اسم الوحدة" required>
                          <>
                            <input
                              required
                              list="business-custom-units"
                              value={formData.customUnit}
                              onChange={(e) => setFormData({ ...formData, customUnit: e.target.value })}
                              placeholder="اختر من وحدات النشاط أو اكتب وحدة جديدة"
                              className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold"
                            />
                            <datalist id="business-custom-units">
                              {businessConfig.customUnits.map((unit) => <option key={unit} value={unit} />)}
                            </datalist>
                          </>
                        </Field>}
                        <Field label={`سعر البيع / ${unitLabel}`}>
                          <input type="number" min="0" step="0.01" value={formData.sellingPriceM2 || ''} onChange={(e) => setFormData({ ...formData, sellingPriceM2: Number.parseFloat(e.target.value) || 0, sellingPriceBox: Number.parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold" />
                        </Field>
                      </div>
                    </section>
                  ) : <>
                  <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800"><Ruler className="w-4 h-4 text-sky-600" /> المقاس والمواصفات</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <Field label="المقاس (سم)" hint={autoMeters !== null ? `المساحة المحسوبة: ${autoMeters} م²/كرتونة` : 'أدخل الطول والعرض بالسنتيمتر'}>
                        <div className="flex items-center gap-2">
                          <input type="number" min="0" step="any" aria-label="الطول بالسنتيمتر" value={(formData.size || '').split(/[x×*]/i)[0] || ''} onChange={(e) => onUpdateSizeDimension(0, e.target.value)} className="w-full min-w-0 px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold" />
                          <span className="text-slate-400">×</span>
                          <input type="number" min="0" step="any" aria-label="العرض بالسنتيمتر" value={(formData.size || '').split(/[x×*]/i)[1] || ''} onChange={(e) => onUpdateSizeDimension(1, e.target.value)} className="w-full min-w-0 px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold" />
                        </div>
                      </Field>
                      <Field label="السمك (مم)">
                        <input type="number" step="0.1" value={formData.thickness || ''} onChange={(e) => setFormData({ ...formData, thickness: Number.parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold" />
                      </Field>
                      <Field label="اللون">
                        <input value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold" />
                      </Field>
                      <Field label="التون">
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <select value={formData.tone} onChange={(e) => setFormData({ ...formData, tone: e.target.value })} className="min-w-0 flex-1 px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold">
                              <option value="">— اختر التون —</option>
                              {Array.from(new Set([...toneOptions, ...(formData.tone ? [formData.tone] : [])])).map((tone) => (
                                <option key={tone} value={tone}>{tone}</option>
                              ))}
                            </select>
                            <button type="button" onClick={() => formData.tone && onDeleteTone(formData.tone)} disabled={!formData.tone || !toneOptions.includes(formData.tone)} className="rounded-xl border border-rose-200 px-2.5 font-bold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">حذف التون</button>
                          </div>
                          <div className="flex gap-2">
                            <input value={newTone} onChange={(event) => setNewTone(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (onAddTone(newTone)) setNewTone(''); } }} placeholder="أدخل تونًا جديدًا" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold" />
                            <button type="button" onClick={() => { if (onAddTone(newTone)) setNewTone(''); }} disabled={!newTone.trim()} className="rounded-xl border border-sky-200 px-2.5 font-bold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40">إضافة تون</button>
                          </div>
                        </div>
                      </Field>
                      <Field label="التشطيب">
                        <input value={formData.finish} onChange={(e) => setFormData({ ...formData, finish: e.target.value })} className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 font-bold" />
                      </Field>
                    </div>
                  </section>

                  <section className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                    <div className="flex items-center gap-1.5 text-sm font-extrabold text-sky-800"><Layers className="w-4 h-4" /> الوحدات والعدد والمترات</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <Field label="وحدة الأساس">
                        <select required value={formData.baseUnit} onChange={(e) => setFormData({ ...formData, baseUnit: e.target.value as UnitType | '' })} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold">
                          <option value="">— اختر الوحدة —</option>
                          {profileUnitOptions.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </Field>
                      <Field label="وحدة البيع">
                        <select required value={formData.sellUnit} onChange={(e) => setFormData({ ...formData, sellUnit: e.target.value as UnitType | '' })} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold">
                          <option value="">— اختر وحدة البيع —</option>
                          {profileUnitOptions.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </Field>
                      <Field label={`المترات / ${unitLabel} بالكرتونة`}>
                        <input type="number" step="0.001" value={formData.metersPerBox || ''} onChange={(e) => onMetersPerBoxChange(Number.parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold" />
                      </Field>
                      <Field label="عدد القطع بالكرتونة">
                        <input type="number" min="1" step="1" value={formData.piecesPerBox || ''} onChange={(e) => onPiecesPerBoxChange(Number.parseInt(e.target.value, 10) || 0)} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold" />
                      </Field>
                      <Field label="وزن الكرتونة (كجم)">
                        <input type="number" step="0.01" value={formData.weightPerBox || ''} onChange={(e) => setFormData({ ...formData, weightPerBox: Number.parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-white rounded-xl border border-sky-300 font-bold" />
                      </Field>
                      <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
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

              {activeTab === 'pricing' && canManagePricing && (
                <section className="space-y-3">
                  <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800"><Banknote className="w-4 h-4 text-emerald-600" /> التسعير</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <Field label={`سعر الشراء / التكلفة (${unitLabel})`}>
                      <input type="number" step="0.01" value={formData.costPrice || ''} onChange={(e) => setFormData({ ...formData, costPrice: Number.parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                    </Field>
                    <Field label={`سعر البيع (${unitLabel})`}>
                      <input type="number" step="0.01" value={formData.sellingPriceM2 || ''} onChange={(e) => { const price = Number.parseFloat(e.target.value) || 0; setFormData({ ...formData, sellingPriceM2: price, sellingPriceBox: round(price * formData.metersPerBox) }); }} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sky-600" />
                    </Field>
                    {formData.productType === 'CERAMIC' && <Field label="سعر الكرتونة">
                      <input type="number" step="0.01" value={formData.sellingPriceBox || ''} onChange={(e) => setFormData({ ...formData, sellingPriceBox: Number.parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                    </Field>}
                    <Field label={`سعر الجملة (${unitLabel})`}>
                      <input type="number" step="0.01" value={formData.wholesalePriceM2 || ''} onChange={(e) => setFormData({ ...formData, wholesalePriceM2: Number.parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                    </Field>
                    <Field label={`الحد الأدنى لسعر البيع (${unitLabel})`}>
                      <input type="number" step="0.01" value={formData.minSellingPriceM2 || ''} onChange={(e) => setFormData({ ...formData, minSellingPriceM2: Number.parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <div>
                        <div className="text-[10px] font-bold text-emerald-700">ربح الوحدة</div>
                        <div className="font-black text-emerald-700">{CeramicMath.formatCurrency(profitPerMeter)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-emerald-700">هامش الربح</div>
                        <div className="font-black text-emerald-700">{round(profitMargin, 1)}%</div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-3">
                    <Field label={`حد الطلب الأدنى (${unitLabel})`}>
                      <input type="number" step="0.01" value={formData.minStockLevel || ''} onChange={(e) => setFormData({ ...formData, minStockLevel: Number.parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
                    </Field>
                    <Field label="الحد الأقصى للمخزون">
                      <input type="number" step="0.01" value={formData.maxStockLevel || ''} onChange={(e) => setFormData({ ...formData, maxStockLevel: Number.parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold" />
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
                    {!editingProduct && <button type="button" onClick={onAddOpeningRow} disabled={openingRows.length >= warehouses.length} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">+ مخزن آخر</button>}
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
                        <div key={index} className={`grid grid-cols-1 sm:grid-cols-2 items-end gap-2 rounded-xl border border-amber-200 bg-white p-3 ${formData.productType === 'CERAMIC' ? 'md:grid-cols-5' : 'md:grid-cols-3'}`}>
                          <Field label="المخزن">
                            <select value={row.warehouseId} onChange={(e) => setOpeningRows((rows) => rows.map((r, i) => i === index ? { ...r, warehouseId: e.target.value } : r))} className="w-full px-3 py-2 rounded-xl border border-amber-300 font-bold">
                              <option value="">— اختر المخزن —</option>
                              {warehouses.filter((w) => w.id === row.warehouseId || !openingRows.some((other, otherIndex) => otherIndex !== index && other.warehouseId === w.id)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                          </Field>
                          {formData.productType === 'CERAMIC' && <Field label="عدد الكراتين">
                            <input type="number" min="0" step="0.01" value={row.boxes || ''} onChange={(e) => onSetOpeningBy(index, 'boxes', Number.parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 rounded-xl border border-amber-300 font-bold" />
                          </Field>}
                          {formData.productType === 'CERAMIC' && <Field label="عدد القطع">
                            <input type="number" min="0" step="1" value={row.pieces || ''} onChange={(e) => onSetOpeningBy(index, 'pieces', Number.parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 rounded-xl border border-amber-300 font-bold" />
                          </Field>}
                          <Field label={`الكمية (${unitLabel})`}>
                            <input type="number" min="0" step="0.001" value={row.meters || ''} onChange={(e) => formData.productType === 'CERAMIC' ? onSetOpeningBy(index, 'meters', Number.parseFloat(e.target.value) || 0) : setOpeningRows((rows) => rows.map((r, i) => i === index ? { ...r, meters: Math.max(0, Number.parseFloat(e.target.value) || 0) } : r))} className="w-full px-3 py-2 rounded-xl border border-amber-300 font-bold" />
                          </Field>
                          <button type="button" onClick={() => onRemoveOpeningRow(index)} className="rounded-xl border border-rose-200 px-2 py-2 text-rose-500 hover:bg-rose-50" title="حذف السطر"><Trash2 className="w-4 h-4" /></button>
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
                  {formData.productType === 'CERAMIC' && (
                  <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sm font-extrabold text-indigo-800"><GitBranch className="w-4 h-4" /> متغيرات الصنف (خصائص الصنف)</div>
                      <button type="button" onClick={onAddVariantDraft} className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100">+ إضافة متغير</button>
                    </div>
                    {variants.length === 0 ? (
                      <p className="rounded-xl border border-indigo-200 bg-white px-3 py-3 text-[11px] text-slate-500">لا توجد متغيرات. أضف متغيرات لتتبع الألوان والمقاسات المختلفة بنفس الصنف.</p>
                    ) : variants.map((v, index) => (
                      <div key={index} className="grid grid-cols-1 sm:grid-cols-2 items-end gap-2 rounded-xl border border-indigo-200 bg-white p-3 md:grid-cols-7">
                        <Field label="اسم المتغير"><input value={v.variantName} onChange={(e) => onUpdateVariantDraft(index, { variantName: e.target.value })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200 font-bold" /></Field>
                        <Field label="SKU"><input value={v.sku} onChange={(e) => onUpdateVariantDraft(index, { sku: e.target.value })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200 font-mono" /></Field>
                        <Field label="الباركود"><input value={v.barcode} onChange={(e) => onUpdateVariantDraft(index, { barcode: e.target.value })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200 font-mono" /></Field>
                        <Field label="اللون"><input value={v.color} onChange={(e) => onUpdateVariantDraft(index, { color: e.target.value })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200" /></Field>
                        <Field label="المقاس"><input value={v.size} onChange={(e) => onUpdateVariantDraft(index, { size: e.target.value })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200" /></Field>
                        <Field label="الفرز">
                          <select value={v.grade} onChange={(e) => onUpdateVariantDraft(index, { grade: e.target.value })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200 font-bold">
                            <option value="">— اختر الفرز —</option>
                            {gradeOptions.filter((option) => option.isActive || option.value === v.grade).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                          </select>
                        </Field>
                        <div className="flex items-end gap-1">
                          <Field label="سعر المتر"><input type="number" value={v.sellingPriceM2 || ''} onChange={(e) => onUpdateVariantDraft(index, { sellingPriceM2: Number.parseFloat(e.target.value) || 0 })} className="w-full px-2.5 py-2 rounded-lg border border-indigo-200" /></Field>
                          <button type="button" onClick={() => onRemoveVariantDraft(index)} className="mb-0.5 rounded-lg border border-rose-200 p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </section>
                  )}

                  <section className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                    <div className="flex items-center gap-1.5 text-sm font-extrabold text-violet-800"><SlidersHorizontal className="w-4 h-4" /> خصائص ومواصفات إضافية</div>
                    {attributes.filter((attribute) => !attribute.appliesToCategoryId || attribute.appliesToCategoryId === formData.categoryId).length === 0 ? (
                      <p className="rounded-xl border border-violet-200 bg-white px-3 py-3 text-[11px] text-slate-500">لا توجد خصائص معرّفة. يمكنك إدارتها من صفحة خصائص المنتجات.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-3">
                        {attributes
                          .filter((attribute) => !attribute.appliesToCategoryId || attribute.appliesToCategoryId === formData.categoryId)
                          .map((attr) => {
                            const value = attributeValues[attr.id] || '';
                            const options = attr.values;
                            const update = (next: string) => setAttributeValues((previous) => ({
                              ...previous,
                              [attr.id]: next,
                            }));
                            const commonClass = 'w-full px-3 py-2 bg-white rounded-xl border border-violet-200 font-bold';
                            let control: React.ReactNode;

                            if (attr.dataType === 'BOOLEAN') {
                              control = (
                                <select value={value} onChange={(event) => update(event.target.value)} className={commonClass}>
                                  <option value="">— بدون —</option>
                                  <option value="true">نعم</option>
                                  <option value="false">لا</option>
                                </select>
                              );
                            } else if (attr.dataType === 'MULTI_SELECT' && options.length > 0) {
                              let selected: string[] = [];
                              try {
                                const parsed: unknown = value ? JSON.parse(value) : [];
                                if (Array.isArray(parsed)) selected = parsed.filter((item): item is string => typeof item === 'string');
                              } catch {
                                selected = value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
                              }
                              control = (
                                <select
                                  multiple
                                  value={selected}
                                  onChange={(event) => update(JSON.stringify(
                                    Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                                  ))}
                                  className={`${commonClass} min-h-24`}
                                >
                                  {options.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}
                                </select>
                              );
                            } else if (attr.dataType === 'SELECT' && options.length > 0) {
                              control = (
                                <select value={value} onChange={(event) => update(event.target.value)} className={commonClass}>
                                  <option value="">— بدون —</option>
                                  {options.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}
                                </select>
                              );
                            } else {
                              const inputType = attr.dataType === 'NUMBER'
                                ? 'number'
                                : attr.dataType === 'DATE'
                                  ? 'date'
                                  : 'text';
                              control = (
                                <input
                                  type={inputType}
                                  step={inputType === 'number' ? 'any' : undefined}
                                  value={value}
                                  onChange={(event) => update(event.target.value)}
                                  className={commonClass}
                                />
                              );
                            }

                            return (
                              <Field
                                key={attr.id}
                                label={`${attr.name}${attr.isRequired ? ' *' : ''}${attr.unit ? ` (${attr.unit})` : ''}`}
                              >
                                {control}
                              </Field>
                            );
                          })}
                      </div>
                    )}
                  </section>
                  <OperationalFieldsForm
                    fields={operationalFields}
                    values={operationalFieldValues}
                    onChange={setOperationalFieldValues}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  {formData.categoryId && formData.brandId ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                  <span>{formData.categoryId && formData.brandId ? 'النوع والماركة محددان جاهزان للحفظ' : 'يجب تحديد النوع والماركة قبل الحفظ'}</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => onClose()} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">إلغاء</button>
                  <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-black rounded-xl shadow-lg shadow-sky-600/30">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {editingProduct ? 'حفظ التعديلات' : 'حفظ الصنف'}
                  </button>
                </div>
              </div>
            </form>
          </div>
          {showFieldPreferences && !editingProduct && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="product-field-preferences-title">
              <section className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <header className="border-b border-slate-100 px-5 py-4">
                  <h4 id="product-field-preferences-title" className="font-extrabold text-slate-900">اختيار الخانات المحفوظة</h4>
                  <p className="mt-1 text-xs text-slate-500">حدد الخانات التي تريد تكرار قيمها في المنتجات التالية. عند إلغاء تحديد خانة ستعود إلى وضعها الافتراضي.</p>
                </header>
                <div className="grid gap-2 overflow-y-auto p-5 sm:grid-cols-2">
                  {fieldPreferenceOptions.map((option) => (
                    <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selectedFieldKeys.includes(option.key)}
                        onChange={(event) => setSelectedFieldKeys((current) => event.target.checked
                          ? [...new Set([...current, option.key])]
                          : current.filter((key) => key !== option.key))}
                        className="h-4 w-4 accent-sky-600"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                  <span className="text-xs text-slate-500">المحدد: {selectedFieldKeys.length}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowFieldPreferences(false)} className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">رجوع</button>
                    <button type="button" onClick={() => { if (onSaveSelectedFields(selectedFieldKeys)) setShowFieldPreferences(false); }} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700">حفظ الاختيار</button>
                  </div>
                </footer>
              </section>
            </div>
          )}
        </div>
  );
};
