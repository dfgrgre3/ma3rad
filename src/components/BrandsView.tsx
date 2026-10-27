import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Tags, Plus, Search, Edit, Trash2, 
  Globe, X, CheckCircle, AlertCircle, Package, Loader2
} from 'lucide-react';
import { BrandService, BrandWithCount } from '../services/BrandService';

// Singleton instance to prevent re-creation on every render
const brandService = new BrandService();

export const BrandsView: React.FC = () => {
  const [brands, setBrands] = useState<BrandWithCount[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandWithCount | null>(null);
  const [formData, setFormData] = useState({ name: '', country: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

  // --- Helpers ---
  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const loadBrands = useCallback(async () => {
    try {
      setIsLoading(true);
      const brs = brandService.getAllBrands();
      setBrands(brs);
    } catch (e: any) {
      console.error(e);
      showNotification('error', `فشل تحميل الماركات: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  // Smart filtering: Case insensitive + Arabic support
  const filteredBrands = useMemo(() => {
    if (!search.trim()) return brands;
    const term = search.toLowerCase().trim();
    return brands.filter(b => 
      b.name.toLowerCase().includes(term) || 
      (b.country && b.country.toLowerCase().includes(term))
    );
  }, [brands, search]);

  // --- Handlers ---
  const handleOpenAddModal = () => {
    setEditingBrand(null);
    setFormData({ name: '', country: '' });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (brand: BrandWithCount) => {
    setEditingBrand(brand);
    setFormData({ name: brand.name, country: brand.country || '' });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBrand) {
        brandService.updateBrand(editingBrand.id, {
          name: formData.name.trim(),
          country: formData.country.trim() || undefined
        });
        showNotification('success', 'تم تحديث بيانات الماركة بنجاح.');
      } else {
        brandService.createBrand(formData.name.trim(), formData.country.trim() || undefined);
        showNotification('success', 'تم إضافة الماركة الجديدة بنجاح.');
      }
      setIsModalOpen(false);
      await loadBrands();
    } catch (err: any) {
      showNotification('error', `خطأ: ${err.message || err}`);
    }
  };

  const handleDelete = async (brand: BrandWithCount) => {
    // Safety check: Prevent deletion if linked to products
    if (brand.productCount > 0) {
      showNotification('error', `لا يمكن حذف "${brand.name}" لأنها مرتبطة بـ ${brand.productCount} صنف. قم بحذف أو تعديل الأصناف أولاً.`);
      return;
    }

    // Custom confirmation logic could go here, for now we proceed with caution
    // In a real app, replace window.confirm with a custom modal
    if (!window.confirm(`هل أنت متأكد من حذف ماركة "${brand.name}"؟ هذا الإجراء لا يمكن التراجع عنه.`)) return;

    try {
      brandService.deleteBrand(brand.id);
      showNotification('success', 'تم حذف الماركة بنجاح.');
      await loadBrands();
    } catch (err: any) {
      showNotification('error', `خطأ أثناء الحذف: ${err.message || err}`);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative" dir="rtl">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-6 left-6 z-[60] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2 fade-in duration-300 ${
 notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
 }`}>
          {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-bold text-sm">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Tags className="w-6 h-6 text-sky-600" />
            الماركات والعلامات التجارية
          </h2>
          <p className="text-xs text-slate-500 mt-1">إدارة ماركات المنتجات والشركات المصنعة وتصنيفاتها</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/20 transition-all active:scale-95 text-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة ماركة جديدة</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="بحث باسم الماركة أو الدولة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-50 rounded-xl border border-transparent focus:border-sky-500 focus:bg-white text-sm font-medium outline-none transition-all"
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Brands Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin ml-2" />
          جاري التحميل...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredBrands.length === 0 ? (
            <div className="col-span-full py-20 text-center flex flex-col items-center justify-center text-slate-500">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                <Search className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-sm font-bold">لا توجد ماركات مطابقة لبحثك</p>
              <p className="text-xs mt-1">جرب كلمات بحث مختلفة أو أضف ماركة جديدة</p>
            </div>
          ) : (
            filteredBrands.map(brand => (
              <div
                key={brand.id}
                className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-sky-500/30 transition-all duration-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform">
                      {brand.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900 line-clamp-1" title={brand.name}>
                        {brand.name}
                      </div>
                      {brand.country ? (
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                          <Globe className="w-3 h-3" />
                          <span className="line-clamp-1">{brand.country}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 italic mt-0.5">غير محدد الدولة</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                    <button
                      onClick={() => handleOpenEditModal(brand)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                      title="تعديل"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(brand)}
                      disabled={brand.productCount > 0}
                      className={`p-1.5 rounded-lg transition-colors ${
 brand.productCount > 0 
 ? 'text-slate-700 cursor-not-allowed' 
 : 'text-slate-500 hover:text-red-600 hover:bg-red-50 '
 }`}
                      title={brand.productCount > 0 ? "لا يمكن الحذف: مرتبطة بمنتجات" : "حذف الماركة"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Package className="w-3.5 h-3.5" />
                    <span>الأصناف المرتبطة</span>
                  </div>
                  <span className={`text-xs font-black px-2 py-0.5 rounded-md ${
 brand.productCount > 0 
 ? 'bg-sky-50 text-sky-700 ' 
 : 'bg-slate-100 text-slate-500'
 }`}>
                    {brand.productCount}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                  <Tags className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {editingBrand ? 'تعديل الماركة' : 'إضافة ماركة جديدة'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label htmlFor="brand-name" className="font-bold text-xs text-slate-700 block mb-1.5">اسم الماركة *</label>
                <input
                  id="brand-name"
                  type="text"
                  required
                  placeholder="مثال: سيراميكا كليوباترا"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sm focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-all"
                />
              </div>

              <div>
                <label htmlFor="brand-country" className="font-bold text-xs text-slate-700 block mb-1.5">الدولة / المنشأ</label>
                <div className="relative">
                  <Globe className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="brand-country"
                    type="text"
                    placeholder="مثال: مصر"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-4 pr-10 py-3 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sm focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100 ">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-[2] px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-black rounded-xl shadow-lg shadow-sky-600/20 transition-all active:scale-[0.98]"
                >
                  {editingBrand ? 'حفظ التعديلات' : 'إضافة الماركة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
