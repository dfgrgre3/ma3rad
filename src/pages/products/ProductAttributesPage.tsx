import React, { useState } from 'react';
import { Ruler, Plus, Search, Check, Layers, Sparkles, Tag, Shield, Compass } from 'lucide-react';

interface AttributeCategory {
  id: string;
  name: string;
  code: string;
  icon: string;
  description: string;
  values: string[];
}

const INITIAL_ATTRIBUTES: AttributeCategory[] = [
  {
    id: 'sizes',
    name: 'مقاسات وأبعاد السيراميك والبورسلين',
    code: 'TILE_SIZES',
    icon: 'Ruler',
    description: 'المقاسات المعتمدة للبلاطات بالسنتيمتر',
    values: ['60x60', '60x120', '20x120 (باركيه)', '30x60', '80x80', '100x100', '120x120', '120x240 (سلابات)', '30x30'],
  },
  {
    id: 'finishes',
    name: 'الملمس ونوع التشطيب السطحي',
    code: 'TILE_FINISH',
    icon: 'Sparkles',
    description: 'درجة لمعان وملمس سطح البلاطة',
    values: ['لامع (Glossy / Polished)', 'مطفي (Matt)', 'خشن مانع للانزلاق (R10 / R11)', 'ساتان شبه لامع (Semi-Polished)', 'حجري خشن (Rustic / Rock)', 'بارز ديكوري (Relief)'],
  },
  {
    id: 'usage',
    name: 'أماكن الاستخدام والتطبيق',
    code: 'TILE_APPLICATION',
    icon: 'Compass',
    description: 'الموقع الهندسي الموصى به لتركيب البلاطة',
    values: ['أرضيات داخلية (صالات وغرف)', 'حوائط حمامات ومطابخ', 'أرضيات حمامات ومطابخ', 'واجهات خارجية (Outdoor)', 'مداخل وممرات كثيفة الحركة', 'مسابح وحدائق'],
  },
  {
    id: 'grades',
    name: 'تصنيفات الفرز والجودة',
    code: 'TILE_GRADES',
    icon: 'Shield',
    description: 'معايير الفرز الهندسي والعيوب السطحية',
    values: ['فرز أول ممتاز (Grade 1)', 'فرز ثاني (Grade 2)', 'فرز ثالث (Grade 3)', 'فرز تجاري / مشروعات (Commercial)'],
  },
  {
    id: 'edges',
    name: 'نوع الحواف والقص',
    code: 'TILE_EDGES',
    icon: 'Layers',
    description: 'معالجة أطراف البلاطة لتركيب الفواصل',
    values: ['ليزر مقطوع مستقيم (Rectified / Laser Cut)', 'حواف عادية مستديرة (Standard / Pressed)', 'شفرة مشطوفة (Beveled)'],
  },
];

export const ProductAttributesPage: React.FC = () => {
  const [categories, setCategories] = useState<AttributeCategory[]>(INITIAL_ATTRIBUTES);
  const [selectedCatId, setSelectedCatId] = useState<string>('sizes');
  const [newValue, setNewValue] = useState('');
  const [search, setSearch] = useState('');

  const activeCategory = categories.find(c => c.id === selectedCatId) || categories[0];

  const handleAddValue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue.trim()) return;

    setCategories(prev =>
      prev.map(cat => {
        if (cat.id === activeCategory.id) {
          if (cat.values.includes(newValue.trim())) return cat;
          return { ...cat, values: [...cat.values, newValue.trim()] };
        }
        return cat;
      })
    );
    setNewValue('');
  };

  const handleRemoveValue = (valToRemove: string) => {
    setCategories(prev =>
      prev.map(cat => {
        if (cat.id === activeCategory.id) {
          return { ...cat, values: cat.values.filter(v => v !== valToRemove) };
        }
        return cat;
      })
    );
  };

  const filteredValues = activeCategory.values.filter(v =>
    v.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
            <Ruler className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">الخصائص والمواصفات الديناميكية (Tile Attributes)</h1>
            <p className="text-xs text-slate-400 font-medium">
              إدارة المقاسات، التشطيبات السطحية، تصنيفات الفرز، ومواصفات التحمل الهندسي
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 overflow-hidden p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Categories List (1 col) */}
        <div className="space-y-3 overflow-y-auto">
          <span className="text-xs font-bold text-slate-400 block px-1">مجموعات الخصائص والمواصفات</span>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCatId(cat.id)}
              className={`w-full text-right p-4 rounded-2xl border transition flex flex-col gap-1 ${
                selectedCatId === cat.id
                  ? 'bg-teal-500/15 border-teal-500/40 text-teal-300 font-bold shadow-md'
                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{cat.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-950 font-mono text-slate-400">
                  {cat.values.length} قيم
                </span>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-1">{cat.description}</p>
            </button>
          ))}
        </div>

        {/* Values Management (2 cols) */}
        <div className="md:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between overflow-hidden">
          <div className="space-y-5 flex-1 overflow-y-auto">
            <div className="border-b border-slate-800 pb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-white">{activeCategory.name}</h2>
                <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                  {activeCategory.code}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{activeCategory.description}</p>
            </div>

            {/* Add New Value Input */}
            <form onSubmit={handleAddValue} className="flex gap-2">
              <input
                type="text"
                placeholder={`أدخل قيمة جديدة في ${activeCategory.name}...`}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-teal-500 font-medium"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                إضافة القيمة
              </button>
            </form>

            {/* Search Values */}
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="تصفية القيم..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-3 pr-9 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* Values Pills */}
            <div className="flex flex-wrap gap-2.5 pt-2">
              {filteredValues.map(val => (
                <div
                  key={val}
                  className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-2 group hover:border-slate-700 transition"
                >
                  <span>{val}</span>
                  <button
                    onClick={() => handleRemoveValue(val)}
                    className="text-slate-500 hover:text-rose-400 text-xs font-mono ml-0.5 p-0.5 transition"
                    title="حذف"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 text-xs text-slate-500 flex items-center justify-between">
            <span>تظهر هذه القيم تلقائياً في شاشات تعريف الأصناف والبحث وفلاتر الـ POS</span>
            <span className="font-mono text-teal-400 font-bold">{filteredValues.length} مواصفات نشطة</span>
          </div>
        </div>
      </div>
    </div>
  );
};