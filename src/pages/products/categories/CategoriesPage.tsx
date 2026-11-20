import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderTree, Plus, Search, Edit, Trash2, Package, ChevronRight, X, Layers
} from 'lucide-react';
import { CategoryService, CategoryWithCount } from '../../../services/domains/products/CategoryService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';

import { useToast } from '../../../components/ui/Toast';
export const CategoriesPage: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const canCreate = can('categories.create');
  const canUpdate = can('categories.update');
  const canDelete = can('categories.delete');
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCount | null>(null);
  const [formData, setFormData] = useState({ name: '', parentId: '', description: '' });
  const navigate = useNavigate();

  const categoryService = useMemo(() => new CategoryService(), []);

  const loadCategories = useCallback(() => {
    try {
      setCategories(categoryService.getAllCategories());
    } catch (e) {
      console.error(e);
    }
  }, [categoryService]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

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
      toast.error(`خطأ: ${err.message || err}`);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا النوع؟ لا يمكن الحذف إذا كان مرتبطًا بمنتجات.')) {
      try {
        categoryService.deleteCategory(id);
        loadCategories();
      } catch (err: any) {
        toast.error(`خطأ: ${err.message || err}`);
      }
    }
  };

  const renderActions = (cat: CategoryWithCount) => (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => navigate(`/products?category=${cat.id}`)}
        className="flex items-center gap-1 rounded-lg bg-accent-soft px-2 py-1.5 text-[11px] font-bold text-primary hover:bg-accent-soft"
        title="عرض منتجات هذا النوع"
      >
        <Package className="w-3.5 h-3.5" /> المنتجات ({cat.productCount})
      </button>
      {canCreate && !cat.parentId && (
        <button
          onClick={() => handleOpenAddModal(cat.id)}
          className="p-1.5 rounded-lg text-muted hover:bg-success-soft hover:text-success transition"
          title="إضافة نوع فرعي"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
      {canUpdate && (
        <button onClick={() => handleOpenEditModal(cat)} className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken transition" title="تعديل">
          <Edit className="w-4 h-4" />
        </button>
      )}
      {canDelete && (
        <button onClick={() => handleDelete(cat.id)} className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger-soft transition" title="حذف">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="erp-page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-ink">أنواع المنتجات</h2>
          <p className="text-xs text-muted">إدارة تصنيفات المنتجات والأنواع الفرعية</p>
        </div>
        {canCreate && (
          <button
            onClick={() => handleOpenAddModal()}
            className="px-4 py-2.5 bg-primary hover:bg-primary text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-primary/30 transition text-sm self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة نوع جديد</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted"><FolderTree className="w-4 h-4 text-primary" /> إجمالي الأنواع</div>
          <div className="mt-1 text-2xl font-black text-ink">{totalCategories}</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted"><Layers className="w-4 h-4 text-success" /> الأنواع الرئيسية</div>
          <div className="mt-1 text-2xl font-black text-ink">{parents.length}</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted"><Package className="w-4 h-4 text-primary" /> المنتجات</div>
          <div className="mt-1 text-2xl font-black text-ink">{totalProducts}</div>
        </div>
      </div>

      <div className="bg-surface p-3.5 rounded-2xl border border-line shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="بحث في الأنواع والأنواع الفرعية..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-9 py-2 bg-surface-muted rounded-xl border border-line text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
        <div className="p-4 border-b border-line">
          <h3 className="font-extrabold text-sm text-ink flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-primary" />
            شجرة الأنواع ({visibleParents.length})
          </h3>
        </div>

        <div className="divide-y divide-line-strong">
          {visibleParents.length === 0 ? (
            <div className="py-12 text-center text-muted text-xs">لا توجد أنواع مطابقة.</div>
          ) : (
            visibleParents.map(({ parent, children, totalProducts: parentTotal }) => (
              <div key={parent.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-surface-muted">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <FolderTree className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-ink">{parent.name}</div>
                      {parent.description && <div className="text-[11px] text-muted">{parent.description}</div>}
                    </div>
                    <span className="px-2 py-0.5 bg-surface-sunken rounded-lg text-[10px] font-bold text-muted">
                      {parentTotal} منتج
                    </span>
                  </div>
                  {renderActions(parent)}
                </div>
                {children.map((child) => (
                  <div key={child.id} className="flex flex-wrap items-center justify-between gap-3 p-4 pr-12 hover:bg-surface-muted border-t border-line">
                    <div className="flex items-center gap-3">
                      <ChevronRight className="w-4 h-4 text-muted" />
                      <div>
                        <div className="font-semibold text-xs text-ink">{child.name}</div>
                        {child.description && <div className="text-[11px] text-muted">{child.description}</div>}
                      </div>
                      <span className="px-2 py-0.5 bg-surface-sunken rounded-lg text-[10px] font-bold text-muted">
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
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-ink">
                {editingCategory ? 'تعديل النوع' : 'إضافة نوع جديد'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg hover:bg-surface-sunken">
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label htmlFor="category-name" className="font-bold text-ink block mb-1">اسم النوع *</label>
                <input
                  id="category-name"
                  type="text"
                  required
                  placeholder="مثال: سيراميك أرضيات"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold"
                />
              </div>

              <div>
                <label htmlFor="category-parent" className="font-bold text-ink block mb-1">النوع الأب (اختياري)</label>
                <select
                  id="category-parent"
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold"
                >
                  <option value="">بدون نوع أب (نوع رئيسي)</option>
                  {parents.filter((c) => c.id !== editingCategory?.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="category-description" className="font-bold text-ink block mb-1">الوصف</label>
                <textarea
                  id="category-description"
                  placeholder="وصف النوع..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-bold resize-none h-20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-line">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl">إلغاء</button>
                <button type="submit" className="px-6 py-2 bg-primary hover:bg-primary text-white font-black rounded-xl shadow-lg shadow-primary/30">حفظ النوع</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesPage;
