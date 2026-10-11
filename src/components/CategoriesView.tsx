import React, { useState, useEffect } from 'react';
import { 
  FolderTree, Plus, Search, Edit, Trash2, 
  Package, ChevronDown, ChevronRight, X
} from 'lucide-react';
import { CategoryService, CategoryWithCount } from '../services/CategoryService';

export const CategoriesView: React.FC = () => {
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCount | null>(null);
  const [formData, setFormData] = useState({ name: '', parentId: '', description: '' });

  const categoryService = new CategoryService();

  const loadCategories = () => {
    try {
      const cats = categoryService.getAllCategories();
      setCategories(cats);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const filteredCategories = categories.filter(c =>
    c.name.includes(search) || (c.description && c.description.includes(search))
  );

  const parentCategories = categories.filter(c => !c.parentId);
  const childCategories = (parentId: string) => categories.filter(c => c.parentId === parentId);

  const handleOpenAddModal = () => {
    setEditingCategory(null);
    setFormData({ name: '', parentId: '', description: '' });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat: CategoryWithCount) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      parentId: cat.parentId || '',
      description: cat.description || ''
    });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        categoryService.updateCategory(editingCategory.id, {
          name: formData.name,
          parentId: formData.parentId || null,
          description: formData.description
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
    if (confirm('هل أنت متأكد من رغبتك في حذف هذا التصنيف؟')) {
      try {
        categoryService.deleteCategory(id);
        loadCategories();
      } catch (err: any) {
        alert(`خطأ: ${err.message || err}`);
      }
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">التصنيفات والفئات</h2>
          <p className="text-xs text-slate-500">إدارة فئات المنتجات والتصنيفات الفرعية</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/30 transition text-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة تصنيف جديد</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث في التصنيفات..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-9 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-sky-600" />
            قائمة التصنيفات ({filteredCategories.length})
          </h3>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredCategories.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              لا توجد تصنيفات مطابقة.
            </div>
          ) : (
            parentCategories.filter(c => 
              filteredCategories.some(fc => fc.id === c.id)
            ).map(parent => (
              <div key={parent.id}>
                <div className="flex items-center justify-between p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
                      <FolderTree className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">{parent.name}</div>
                      {parent.description && (
                        <div className="text-[11px] text-slate-400">{parent.description}</div>
                      )}
                    </div>
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-500">
                      {parent.productCount} صنف
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEditModal(parent)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(parent.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {childCategories(parent.id).map(child => (
                  <div key={child.id} className="flex items-center justify-between p-4 pr-12 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 border-t border-slate-50 dark:border-slate-800/50">
                    <div className="flex items-center gap-3">
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="font-semibold text-xs text-slate-700 dark:text-slate-300">{child.name}</div>
                        {child.description && (
                          <div className="text-[11px] text-slate-400">{child.description}</div>
                        )}
                      </div>
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-500">
                        {child.productCount} صنف
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditModal(child)}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(child.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {editingCategory ? 'تعديل التصنيف' : 'إضافة تصنيف جديد'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">اسم التصنيف *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: سيراميك أرضيات"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">التصنيف الأب (اختياري)</label>
                <select
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                >
                  <option value="">بدون تصنيف أب (تصنيف رئيسي)</option>
                  {categories.filter(c => !c.parentId && c.id !== editingCategory?.id).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">الوصف</label>
                <textarea
                  placeholder="وصف التصنيف..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold resize-none h-20"
                />
              </div>

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
                  حفظ التصنيف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
