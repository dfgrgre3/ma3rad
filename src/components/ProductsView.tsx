import React, { useState, useEffect } from 'react';
import { 
  Package, Plus, Search, Filter, Edit, Trash2, 
  Layers, CheckCircle, AlertTriangle, Eye, ArrowUpDown
} from 'lucide-react';
import { ProductService } from '../services/ProductService';
import { InventoryService } from '../services/InventoryService';
import { Product, CeramicGrade, UnitType, Warehouse } from '../types';
import { CeramicMath } from '../utils/ceramicMath';

export const ProductsView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    categoryId: 'cat_floor',
    brandId: 'br_cleo',
    grade: 'GRADE_1' as CeramicGrade,
    size: '60x60',
    thickness: 8,
    color: 'رمادي رخامي',
    finish: 'لامع',
    surfaceLocation: 'FLOOR' as any,
    baseUnit: 'M2' as UnitType,
    sellUnit: 'M2' as UnitType,
    piecesPerBox: 4,
    metersPerBox: 1.44,
    costPrice: 180,
    sellingPriceM2: 240,
    sellingPriceBox: 345.6,
    wholesalePriceM2: 210,
    minSellingPriceM2: 200,
    minStockLevel: 20,
    initialWarehouseId: 'wh_main',
    initialQuantityM2: 100,
    notes: ''
  });

  const productService = new ProductService();
  const inventoryService = new InventoryService();

  const loadProducts = () => {
    try {
      const prods = productService.getAllProducts(search, selectedCategory || undefined);
      const whs = inventoryService.getAllWarehouses();
      setProducts(prods);
      setWarehouses(whs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [search, selectedCategory]);

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    const randCode = Date.now().toString().slice(-5);
    setFormData({
      name: '',
      sku: `TILE-${randCode}`,
      barcode: `622${randCode}01`,
      categoryId: 'cat_floor',
      brandId: 'br_cleo',
      grade: 'GRADE_1',
      size: '60x60',
      thickness: 8,
      color: '',
      finish: 'لامع',
      surfaceLocation: 'FLOOR',
      baseUnit: 'M2',
      sellUnit: 'M2',
      piecesPerBox: 4,
      metersPerBox: 1.44,
      costPrice: 150,
      sellingPriceM2: 220,
      sellingPriceBox: 316.8,
      wholesalePriceM2: 190,
      minSellingPriceM2: 180,
      minStockLevel: 20,
      initialWarehouseId: warehouses[0]?.id || 'wh_main',
      initialQuantityM2: 50,
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        productService.updateProduct(editingProduct.id, {
          name: formData.name,
          sku: formData.sku,
          barcode: formData.barcode,
          categoryId: formData.categoryId,
          brandId: formData.brandId,
          grade: formData.grade,
          size: formData.size,
          thickness: formData.thickness,
          color: formData.color,
          finish: formData.finish,
          piecesPerBox: formData.piecesPerBox,
          metersPerBox: formData.metersPerBox,
          costPrice: formData.costPrice,
          sellingPriceM2: formData.sellingPriceM2,
          sellingPriceBox: formData.sellingPriceBox,
          wholesalePriceM2: formData.wholesalePriceM2,
          minSellingPriceM2: formData.minSellingPriceM2,
          minStockLevel: formData.minStockLevel,
          notes: formData.notes
        });
      } else {
        productService.createProduct({
          name: formData.name,
          sku: formData.sku,
          barcode: formData.barcode,
          categoryId: formData.categoryId,
          brandId: formData.brandId,
          grade: formData.grade,
          size: formData.size,
          thickness: formData.thickness,
          color: formData.color,
          finish: formData.finish,
          surfaceLocation: formData.surfaceLocation,
          baseUnit: formData.baseUnit,
          sellUnit: formData.sellUnit,
          piecesPerBox: formData.piecesPerBox,
          metersPerBox: formData.metersPerBox,
          costPrice: formData.costPrice,
          sellingPriceM2: formData.sellingPriceM2,
          sellingPriceBox: formData.sellingPriceBox,
          wholesalePriceM2: formData.wholesalePriceM2,
          minSellingPriceM2: formData.minSellingPriceM2,
          minStockLevel: formData.minStockLevel,
          notes: formData.notes,
          isActive: true
        }, {
          warehouseId: formData.initialWarehouseId,
          quantityM2: formData.initialQuantityM2,
          unitCost: formData.costPrice
        });
      }

      setIsModalOpen(false);
      loadProducts();
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  const handleDeleteProduct = (id: string) => {
    if (confirm('هل أنت متأكد من رغبتك في حذف/تعطيل هذا الصنف؟')) {
      productService.deleteProduct(id);
      loadProducts();
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">دليل أصناف السيراميك والتشطيبات</h2>
          <p className="text-xs text-slate-500">إدارة المقاسات، الفرز، نسب التحويل، والتسعير</p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/30 transition text-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة صنف سيراميك جديد</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث باسم الصنف، الباركود، الكود، المقاس..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-9 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
        >
          <option value="">جميع الأقسام</option>
          <option value="cat_floor">سيراميك أرضيات</option>
          <option value="cat_wall">سيراميك حوائط</option>
          <option value="cat_porcelain">بورسلين</option>
          <option value="cat_adhesives">مواد لصق وتشطيب</option>
        </select>
      </div>

      {/* Products Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">الباركود / الكود</th>
                <th className="p-3.5">اسم الصنف والمواصفات</th>
                <th className="p-3.5">المقاس والفرز</th>
                <th className="p-3.5">متر / كرتونة</th>
                <th className="p-3.5">سعر التكلفة</th>
                <th className="p-3.5">سعر بيع المتر</th>
                <th className="p-3.5">سعر الكرتونة</th>
                <th className="p-3.5 text-center">إجمالي المخزون</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    لا توجد أصناف مطابقة.<br />
                    اضغط على "إضافة صنف سيراميك جديد" لإضافة أول منتج.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const stockSummary = productService.getProductStockSummary(p.id);
                  const isLow = stockSummary.totalM2 <= p.minStockLevel;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                      <td className="p-3.5 font-mono">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{p.barcode}</div>
                        <div className="text-[10px] text-slate-400">{p.sku}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{p.name}</div>
                        <div className="text-[10px] text-slate-400">{p.categoryName || 'سيراميك'} | {p.brandName || 'محلي'}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="font-bold text-slate-700 dark:text-slate-300">{p.size}</span>
                        <div className="text-[10px]">
                          <span className={`font-extrabold ${p.grade === 'GRADE_1' ? 'text-sky-600' : 'text-amber-600'}`}>
                            {p.grade === 'GRADE_1' ? 'فرز أول' : (p.grade === 'GRADE_2' ? 'فرز ثاني' : 'فرز تجاري')}
                          </span>
                        </div>
                      </td>
                      <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">
                        {p.metersPerBox} م² <span className="text-[10px] text-slate-400">({p.piecesPerBox} ق)</span>
                      </td>
                      <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">
                        {CeramicMath.formatCurrency(p.costPrice)}
                      </td>
                      <td className="p-3.5 font-black text-sky-600 dark:text-sky-400">
                        {CeramicMath.formatCurrency(p.sellingPriceM2)}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        {CeramicMath.formatCurrency(p.sellingPriceBox || (p.sellingPriceM2 * p.metersPerBox))}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2 py-1 rounded-lg font-black text-xs ${
                          isLow ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'
                        }`}>
                          {CeramicMath.formatM2(stockSummary.totalM2)} ({stockSummary.totalBoxes} كرتونة)
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingProduct(p);
                              setFormData({
                                ...formData,
                                name: p.name,
                                sku: p.sku,
                                barcode: p.barcode,
                                categoryId: p.categoryId,
                                brandId: p.brandId,
                                grade: p.grade,
                                size: p.size,
                                thickness: p.thickness || 8,
                                color: p.color || '',
                                finish: p.finish || '',
                                piecesPerBox: p.piecesPerBox,
                                metersPerBox: p.metersPerBox,
                                costPrice: p.costPrice,
                                sellingPriceM2: p.sellingPriceM2,
                                sellingPriceBox: p.sellingPriceBox,
                                wholesalePriceM2: p.wholesalePriceM2,
                                minSellingPriceM2: p.minSellingPriceM2,
                                minStockLevel: p.minStockLevel,
                                notes: p.notes || ''
                              });
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
              {editingProduct ? 'تعديل صنف السيراميك' : 'إضافة صنف سيراميك / مادة تشطيب جديدة'}
            </h3>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">اسم الصنف *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: سيراميك رويال رويال 60×60 رمادي"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">الباركود الدولي *</label>
                  <input
                    type="text"
                    required
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">المقاس</label>
                  <input
                    type="text"
                    placeholder="60x60"
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">الفرز والدرجة</label>
                  <select
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value as CeramicGrade })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                  >
                    <option value="GRADE_1">فرز أول</option>
                    <option value="GRADE_2">فرز ثاني</option>
                    <option value="GRADE_3">فرز ثالث</option>
                    <option value="COMMERCIAL">تجاري</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">الماركة / المصنع</label>
                  <select
                    value={formData.brandId}
                    onChange={(e) => setFormData({ ...formData, brandId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                  >
                    <option value="br_cleo">سيراميكا كليوباترا</option>
                    <option value="br_glam">رويال سيراميك</option>
                    <option value="br_alf">سيراميكا ألفا</option>
                    <option value="br_prima">سيراميكا بريما</option>
                    <option value="br_sika">سيكا للكيماويات</option>
                  </select>
                </div>
              </div>

              {/* Box to Meter Conversion Rules */}
              <div className="bg-sky-50 dark:bg-sky-950/40 p-3.5 rounded-2xl border border-sky-200 dark:border-sky-800 space-y-2">
                <div className="font-extrabold text-sky-800 dark:text-sky-300 text-xs flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  <span>معادلات تحويل الكرتونة والمتر المربع</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">مساحة الكرتونة بالمتر المربع (م²)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.metersPerBox}
                      onChange={(e) => {
                        const m = parseFloat(e.target.value) || 0;
                        setFormData({
                          ...formData,
                          metersPerBox: m,
                          sellingPriceBox: Number((formData.sellingPriceM2 * m).toFixed(2))
                        });
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-sky-300 dark:border-sky-700 font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">عدد البلاطات / القطع بالكرتونة</label>
                    <input
                      type="number"
                      value={formData.piecesPerBox}
                      onChange={(e) => setFormData({ ...formData, piecesPerBox: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-sky-300 dark:border-sky-700 font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing Matrix */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">سعر الشراء والتكلفة (م²)</label>
                  <input
                    type="number"
                    value={formData.costPrice}
                    onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">سعر بيع المتر (قطاعي)</label>
                  <input
                    type="number"
                    value={formData.sellingPriceM2}
                    onChange={(e) => {
                      const sp = parseFloat(e.target.value) || 0;
                      setFormData({
                        ...formData,
                        sellingPriceM2: sp,
                        sellingPriceBox: Number((sp * formData.metersPerBox).toFixed(2))
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-sky-600"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">سعر الكرتونة الكاملة</label>
                  <input
                    type="number"
                    value={formData.sellingPriceBox}
                    onChange={(e) => setFormData({ ...formData, sellingPriceBox: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                  />
                </div>
              </div>

              {/* Initial Stock (Only for new products) */}
              {!editingProduct && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">مخزن الرصيد الافتتاحي</label>
                    <select
                      value={formData.initialWarehouseId}
                      onChange={(e) => setFormData({ ...formData, initialWarehouseId: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                    >
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">الكمية الافتتاحية بالمتر (م²)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.initialQuantityM2}
                      onChange={(e) => setFormData({ ...formData, initialQuantityM2: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-black rounded-xl shadow-lg shadow-sky-600/30"
                >
                  حفظ الصنف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
