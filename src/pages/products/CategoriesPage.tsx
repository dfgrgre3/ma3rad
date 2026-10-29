import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderTree, Plus, Search, Edit, Trash2, Package, ChevronRight, X, Layers
} from 'lucide-react';
import { CategoryService, CategoryWithCount } from '../../services/CategoryService';

export const CategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCount | null>(null);
  const [formData, setFormData] = useState({ name: '', parentId: '', description: '' });
  const navigate = useNavigate();

  const categoryService = new CategoryService();

  const loadCategories = () => {
    try {
      setCategories(categoryService.getAllCategories());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadCategories(); }, []);

  const term = search.trim();
  const matches = (c: CategoryWithCount) =>
    !term || c.name.includes(term) || (c.description || '').includes(term);

  const parents = categories.filter((c) => !c.parentId);
  const childrenOf = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const visibleParents = parents
    .map((parent) => {
      const children = childrenOf(parent.id);
      const matchedChildren = children.filter((child) => matches(child) || matches(parent));
      const show = matches(parent) || matchedChildren.length > 0;
      const totalProducts = parent.productCount + children.reduce((sum, child) => sum + child.productCount, 0);
      return { parent, children: matchedChildren, show, totalProducts };
    })
    .filter((row) => row.show);

  const totalCategories = categories.length;
  const totalProducts = categories.reduce((sum, c) => sum + c.productCount, 0);

  const handleOpenAddModal = (parentId = '') => {
    setEditingCategory(null);
    setFormData({ name: '', parentId, description: '' });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat: CategoryWithCount) => {
    setEditingCategory(cat);
    setFormData({ name: cat.name, parentId: cat.parentId || '', description: cat.description || '' });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        categoryService.updateCategory(editingCategory.id, {
          name: formData.name,
          parentId: formData.parentId || null,
          description: formData.description,
        });
      } else {
        categoryService.createCategory(formData.name, formData.parentId || undefined, formData.description);
      }
      setIsModalOpen(false);
      loadCategories();
    } catch (err: any) {
      alert(`خطأ: ${err.message || err}`);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا النوع؟ لا يمكن الحذف إذا كان مرتبطًا بمنتجات.')) {
      try {
        categoryService.deleteCategory(id);
        loadCategories();
      } catch (err: any) {
        alert(`خطأ: ${err.message || err}`);
      }
    }
  };

  const renderActions = (cat: CategoryWithCount) => (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => navigate(`/products?category=${cat.id}`)}
        className="flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1.5 text-[11px] font-bold text-sky-700 hover:bg-sky-100"
        title="عرض منتجات هذا النوع"
      >
        <Package className="w-3.5 h-3.5" /> المنتجات ({cat.productCount})
      </button>
      {!cat.parentId && (
        <button
          onClick={() => handleOpenAddModal(cat.id)}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition"
          title="إضافة نوع فرعي"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
      <button onClick={() => handleOpenEditModal(cat)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition" title="تعديل">
        <Edit className="w-4 h-4" />
      </button>
      <button onClick={() => handleDelete(cat.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition" title="حذف">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">أنواع المنتجات</h2>
          <p className="text-xs text-slate-500">إدارة تصنيفات المنتجات والأنواع الفرعية</p>
        </div>
        <button
          onClick={() => handleOpenAddModal()}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/30 transition text-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة نوع جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><FolderTree className="w-4 h-4 text-sky-600" /> إجمالي الأنواع</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{totalCategories}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Layers className="w-4 h-4 text-emerald-600" /> الأنواع الرئيسية</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{parents.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Package className="w-4 h-4 text-violet-600" /> المنتجات</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{totalProducts}</div>
        </div>
      </div>

      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث في الأنواع والأنواع الفرعية..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-9 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-sky-600" />
            شجرة الأنواع ({visibleParents.length})
          </h3>
        </div>

        <div className="divide-y divide-slate-100">
          {visibleParents.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">لا توجد أنواع مطابقة.</div>
          ) : (
            visibleParents.map(({ parent, children, totalProducts: parentTotal }) => (
              <div key={parent.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
                      <FolderTree className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900">{parent.name}</div>
                      {parent.description && <div className="text-[11px] text-slate-500">{parent.description}</div>}
                    </div>
                    <span className="px-2 py-0.5 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-500">
                      {parentTotal} منتج
                    </span>
                  </div>
                  {renderActions(parent)}
                </div>
                {children.map((child) => (
                  <div key={child.id} className="flex flex-wrap items-center justify-between gap-3 p-4 pr-12 hover:bg-slate-50 border-t border-slate-50">
                    <div className="flex items-center gap-3">
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="font-semibold text-xs text-slate-700">{child.name}</div>
                        {child.description && <div className="text-[11px] text-slate-500">{child.description}</div>}
                      </div>
                      <span className="px-2 py-0.5 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-500">
                        {child.productCount} منتج
                      </span>
                    </div>
                    {renderActions(child)}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">
                {editingCategory ? 'تعديل النوع' : 'إضافة نوع جديد'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label htmlFor="category-name" className="font-bold text-slate-700 block mb-1">اسم النوع *</label>
                <input
                  id="category-name"
                  type="text"
                  required
                  placeholder="مثال: سيراميك أرضيات"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                />
              </div>

              <div>
                <label htmlFor="category-parent" className="font-bold text-slate-700 block mb-1">النوع الأب (اختياري)</label>
                <select
                  id="category-parent"
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                >
                  <option value="">بدون نوع أب (نوع رئيسي)</option>
                  {parents.filter((c) => c.id !== editingCategory?.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="category-description" className="font-bold text-slate-700 block mb-1">الوصف</label>
                <textarea
                  id="category-description"
                  placeholder="وصف النوع..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold resize-none h-20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-black rounded-xl shadow-lg shadow-sky-600/30">حفظ النوع</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesPage;
