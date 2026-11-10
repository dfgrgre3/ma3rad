import React, { useEffect, useMemo, useState } from 'react';
import { Edit, Plus, Save, Trash2 } from 'lucide-react';
import { OperationalFieldService, type OperationalFieldDefinition, type ProductGradeOption } from '../../../services/domains/products/OperationalFieldService';
import type { DynamicAttributeDataType } from '../../../services/domains/products/dynamicAttributes';
import { usePermission } from '../../../hooks/domains/auth/usePermission';

const TYPES: Array<{ value: DynamicAttributeDataType; label: string }> = [
  { value: 'TEXT', label: 'نص' },
  { value: 'NUMBER', label: 'رقم' },
  { value: 'BOOLEAN', label: 'نعم / لا' },
  { value: 'SELECT', label: 'قائمة اختيار' },
  { value: 'MULTI_SELECT', label: 'اختيار متعدد' },
  { value: 'DATE', label: 'تاريخ' },
];

const service = new OperationalFieldService();

export const OperationalFieldsManager: React.FC = () => {
  const canManage = usePermission()('products.attributes.manage');
  const entities = service.getEntityTypes();
  const [entityType, setEntityType] = useState('products');
  const [fields, setFields] = useState<OperationalFieldDefinition[]>([]);
  const [gradeOptions, setGradeOptions] = useState<ProductGradeOption[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingField, setEditingField] = useState<OperationalFieldDefinition | null>(null);
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState({
    name: '', code: '', dataType: 'TEXT' as DynamicAttributeDataType,
    unit: '', isRequired: false, isFilterable: true, options: '',
  });
  const [newGrade, setNewGrade] = useState('');
  const [newOption, setNewOption] = useState<Record<string, string>>({});
  const entityLabel = useMemo(() => entities.find((item) => item.value === entityType)?.label || '', [entities, entityType]);

  const load = () => {
    try {
      setFields(service.getDefinitions(entityType));
      setGradeOptions(service.getProductGradeOptions(true));
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذر تحميل الحقول.');
    }
  };
  useEffect(load, [entityType]);

  const addField = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingField) {
        service.updateDefinition(editingField.id, {
          name: draft.name, unit: draft.unit, isRequired: draft.isRequired, isFilterable: draft.isFilterable,
        });
      } else {
        service.addDefinition({
          ...draft, entityType, code: draft.code.toUpperCase(),
          options: draft.options.split(/\r?\n/),
        });
      }
      setDraft({ name: '', code: '', dataType: 'TEXT', unit: '', isRequired: false, isFilterable: true, options: '' });
      setEditingField(null);
      setFormOpen(false);
      load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذر حفظ الحقل.');
    }
  };

  const saveGrade = (option: ProductGradeOption, patch: Partial<ProductGradeOption>) => {
    try {
      service.updateProductGradeOption(option.value, patch);
      load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذر حفظ خيار الفرز.');
    }
  };

  const addGrade = () => {
    try {
      service.addProductGradeOption(newGrade);
      setNewGrade('');
      load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذر إضافة خيار الفرز.');
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm sm:p-5" dir="rtl">
      <header className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-900">حقول السجلات التشغيلية</h2>
          <p className="mt-1 text-xs text-slate-500">عرّف حقولًا إضافية حسب نوع السجل؛ تبقى القيم مرتبطة بمعرّف السجل ولا تتأثر بتغيير الاسم.</p>
        </div>
        <div className="flex gap-2">
          <select aria-label="نوع السجل" value={entityType} onChange={(event) => setEntityType(event.target.value)} className="min-w-40 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold">
            {entities.map((entity) => <option key={entity.value} value={entity.value}>{entity.label}</option>)}
          </select>
          {canManage && <button type="button" onClick={() => setFormOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700"><Plus className="h-4 w-4" /> حقل جديد</button>}
        </div>
      </header>

      {notice && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>}

      {entityType === 'products' && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-extrabold text-amber-900">خيارات فرز المنتجات</h3>
              <p className="mt-1 text-[11px] text-amber-800">تغيير الاسم أو الإيقاف لا يغير القيمة المخزنة في الأصناف السابقة.</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {gradeOptions.map((option) => (
              <GradeOptionRow key={option.value} option={option} canManage={canManage} onSave={saveGrade} />
            ))}
            {gradeOptions.length === 0 && <p className="text-xs text-slate-500">لم تُعرّف خيارات فرز بعد.</p>}
          </div>
          {canManage && <div className="mt-3 flex gap-2">
            <input aria-label="خيار فرز جديد" value={newGrade} onChange={(event) => setNewGrade(event.target.value)} placeholder="اسم خيار جديد" className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs" />
            <button type="button" onClick={addGrade} disabled={!newGrade.trim()} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">إضافة خيار</button>
          </div>}
        </section>
      )}

      {fields.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <article key={field.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-extrabold text-slate-800">{field.name}</h3>
                <p className="mt-1 font-mono text-[10px] text-slate-500">{field.code} · {TYPES.find((item) => item.value === field.dataType)?.label}{field.unit ? ` · ${field.unit}` : ''}</p>
              </div>
              {canManage && <div className="flex gap-1">
                <button type="button" aria-label={`تعديل ${field.name}`} onClick={() => {
                  setEditingField(field);
                  setDraft({
                    name: field.name, code: field.code, dataType: field.dataType, unit: field.unit || '',
                    isRequired: field.isRequired, isFilterable: field.isFilterable,
                    options: field.values.map((option) => option.label).join('\n'),
                  });
                  setFormOpen(true);
                }} className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600"><Edit className="h-4 w-4" /></button>
                <button type="button" aria-label={`حذف ${field.name}`} onClick={() => {
                  try { service.deleteDefinition(field.id); load(); }
                  catch (error) { setNotice(error instanceof Error ? error.message : 'تعذر حذف الحقل.'); }
                }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
              {field.isRequired && <span className="rounded-md bg-rose-50 px-2 py-1 font-bold text-rose-700">مطلوب</span>}
              {field.isFilterable && <span className="rounded-md bg-sky-50 px-2 py-1 font-bold text-sky-700">قابل للتصفية</span>}
              {field.values.map((option) => <div key={option.id} className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600">
                <OptionLabel option={option} canManage={canManage} onSave={(label) => {
                  try { service.updateOption(option.id, label); load(); }
                  catch (error) { setNotice(error instanceof Error ? error.message : 'تعذر تعديل الخيار.'); }
                }} />
                {canManage && <button type="button" aria-label={`حذف خيار ${option.label}`} onClick={() => {
                  try { service.removeOption(option.id); load(); }
                  catch (error) { setNotice(error instanceof Error ? error.message : 'تعذر حذف الخيار.'); }
                }} className="text-slate-400 hover:text-rose-600">×</button>}
              </div>)}
            </div>
            {canManage && ['SELECT', 'MULTI_SELECT'].includes(field.dataType) && <div className="mt-2 flex gap-1.5">
              <input aria-label={`خيار جديد لـ ${field.name}`} value={newOption[field.id] || ''} onChange={(event) => setNewOption((previous) => ({ ...previous, [field.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" />
              <button type="button" onClick={() => {
                try { service.addOption(field.id, newOption[field.id] || ''); setNewOption((previous) => ({ ...previous, [field.id]: '' })); load(); }
                catch (error) { setNotice(error instanceof Error ? error.message : 'تعذر إضافة الخيار.'); }
              }} className="rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700">إضافة</button>
            </div>}
          </article>
        ))}
      </div> : <div className="rounded-xl border border-dashed border-slate-200 py-7 text-center text-xs text-slate-500">لا توجد حقول إضافية لـ {entityLabel}.</div>}

      {formOpen && <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="operational-field-title">
        <form onSubmit={addField} className="max-h-[calc(100dvh-1rem)] w-full max-w-lg space-y-3 overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-5">
          <h3 id="operational-field-title" className="text-sm font-black text-slate-900">{editingField ? 'تعديل الحقل' : 'إضافة حقل'} — {entityLabel}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-bold text-slate-700">اسم الحقل<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2" /></label>
            <label className="space-y-1 text-xs font-bold text-slate-700">رمز ثابت<input required pattern="[A-Za-z][A-Za-z0-9_]{1,63}" disabled={Boolean(editingField)} value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono disabled:bg-slate-50" /></label>
            <label className="space-y-1 text-xs font-bold text-slate-700">نوع الحقل<select disabled={Boolean(editingField)} value={draft.dataType} onChange={(event) => setDraft({ ...draft, dataType: event.target.value as DynamicAttributeDataType })} className="w-full rounded-lg border border-slate-200 px-3 py-2 disabled:bg-slate-50">{TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            <label className="space-y-1 text-xs font-bold text-slate-700">الوحدة (اختياري)<input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2" /></label>
          </div>
          {!editingField && ['SELECT', 'MULTI_SELECT'].includes(draft.dataType) && <label className="block space-y-1 text-xs font-bold text-slate-700">الخيارات — خيار لكل سطر<textarea required rows={3} value={draft.options} onChange={(event) => setDraft({ ...draft, options: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2" /></label>}
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-700">
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isRequired} onChange={(event) => setDraft({ ...draft, isRequired: event.target.checked })} /> مطلوب</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isFilterable} onChange={(event) => setDraft({ ...draft, isFilterable: event.target.checked })} /> قابل للتصفية</label>
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white pt-3">
            <button type="button" onClick={() => { setFormOpen(false); setEditingField(null); }} className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700">إلغاء</button>
            <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white"><Save className="h-3.5 w-3.5" /> حفظ الحقل</button>
          </div>
        </form>
      </div>}
    </section>
  );
};

const OptionLabel: React.FC<{
  option: OperationalFieldDefinition['values'][number];
  canManage: boolean;
  onSave: (label: string) => void;
}> = ({ option, canManage, onSave }) => {
  const [label, setLabel] = useState(option.label);
  useEffect(() => setLabel(option.label), [option.label]);
  return canManage ? <input
    aria-label={`اسم الخيار ${option.label}`}
    value={label}
    onChange={(event) => setLabel(event.target.value)}
    onBlur={() => { if (label.trim() && label.trim() !== option.label) onSave(label); }}
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
    className="w-24 bg-transparent text-[10px] outline-none"
  /> : <span>{label}</span>;
};

const GradeOptionRow: React.FC<{
  option: ProductGradeOption;
  canManage: boolean;
  onSave: (option: ProductGradeOption, patch: Partial<ProductGradeOption>) => void;
}> = ({ option, canManage, onSave }) => {
  const [label, setLabel] = useState(option.label);
  useEffect(() => setLabel(option.label), [option.label]);
  return <div className="flex items-center gap-2">
    <span className="w-28 shrink-0 font-mono text-[10px] text-slate-500">{option.value}</span>
    <input aria-label={`اسم ${option.value}`} value={label} disabled={!canManage} onChange={(event) => setLabel(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs disabled:bg-slate-50" />
    {canManage && <button type="button" aria-label={`حفظ ${option.value}`} onClick={() => onSave(option, { label })} className="rounded-lg border border-amber-200 bg-white p-1.5 text-amber-800"><Save className="h-3.5 w-3.5" /></button>}
    {canManage && <label className="flex shrink-0 items-center gap-1 text-[10px] text-slate-600"><input type="checkbox" checked={option.isActive} onChange={(event) => onSave(option, { isActive: event.target.checked })} /> نشط</label>}
  </div>;
};
