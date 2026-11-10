import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Save, RefreshCw } from 'lucide-react';
import { PayrollTaxService, PayrollTaxRule, PayrollTaxRuleInput } from '../../../services/domains/hr/PayrollTaxService';

interface BracketDraft {
  lowerLimit: string;
  upperLimit: string;
  ratePercent: string;
}

interface RuleDraft {
  id?: string;
  name: string;
  jurisdiction: string;
  taxableBasis: 'GROSS' | 'BASE';
  effectiveFrom: string;
  effectiveTo: string;
  dependentAllowance: string;
  isActive: boolean;
  notes: string;
  brackets: BracketDraft[];
}

const emptyRule = (): RuleDraft => ({
  name: '',
  jurisdiction: '',
  taxableBasis: 'GROSS',
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: '',
  dependentAllowance: '0',
  isActive: true,
  notes: '',
  brackets: [{ lowerLimit: '0', upperLimit: '5000', ratePercent: '0' }],
});

interface Props {
  open: boolean;
  onClose: () => void;
}

export const PayrollTaxRulesModal: React.FC<Props> = ({ open, onClose }) => {
  const [rules, setRules] = useState<PayrollTaxRule[]>([]);
  const [draft, setDraft] = useState<RuleDraft>(emptyRule());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setRules(PayrollTaxService.getRules());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل قواعد الضريبة.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setDraft(emptyRule());
      setEditingId(null);
      load();
    }
  }, [open, load]);

  const editRule = (rule: PayrollTaxRule) => {
    setEditingId(rule.id);
    setDraft({
      id: rule.id,
      name: rule.name,
      jurisdiction: rule.jurisdiction || '',
      taxableBasis: rule.taxableBasis,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo || '',
      dependentAllowance: String(rule.dependentAllowance),
      isActive: rule.isActive,
      notes: rule.notes || '',
      brackets: rule.brackets.map((bracket) => ({
        lowerLimit: String(bracket.lowerLimit),
        upperLimit: bracket.upperLimit == null ? '' : String(bracket.upperLimit),
        ratePercent: String(bracket.ratePercent),
      })),
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: PayrollTaxRuleInput = {
        name: draft.name,
        jurisdiction: draft.jurisdiction,
        taxableBasis: draft.taxableBasis,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo || null,
        dependentAllowance: Number(draft.dependentAllowance) || 0,
        isActive: draft.isActive,
        notes: draft.notes,
        brackets: draft.brackets.map((bracket) => ({
          lowerLimit: Number(bracket.lowerLimit) || 0,
          upperLimit: bracket.upperLimit.trim() === '' ? null : Number(bracket.upperLimit),
          ratePercent: Number(bracket.ratePercent) || 0,
        })),
      };
      PayrollTaxService.saveRule(input, editingId || undefined);
      setDraft(emptyRule());
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err?.message || 'تعذر حفظ قاعدة الضريبة.');
    } finally {
      setSaving(false);
    }
  };

  const removeRule = (id: string) => {
    if (!window.confirm('حذف قاعدة الضريبة هذه؟')) return;
    try {
      PayrollTaxService.deleteRule(id);
      load();
    } catch (e: any) {
      setError(e?.message || 'تعذر حذف قاعدة الضريبة.');
    }
  };

  const addBracket = () => {
    setDraft((prev) => ({
      ...prev,
      brackets: [...prev.brackets, { lowerLimit: '', upperLimit: '', ratePercent: '' }],
    }));
  };

  const removeBracket = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      brackets: prev.brackets.filter((_, idx) => idx !== index),
    }));
  };

  const updateBracket = (index: number, key: keyof BracketDraft, value: string) => {
    setDraft((prev) => ({
      ...prev,
      brackets: prev.brackets.map((bracket, idx) => (idx === index ? { ...bracket, [key]: value } : bracket)),
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" dir="rtl">
      <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-slate-900">قواعد ضريبة الرواتب</h2>
            <p className="mt-1 text-xs text-slate-500">شرائح وبداية سريان و exemption لكل شركة.</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200">إغلاق</button>
        </header>
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto p-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-700">القواعد المحفوظة</h3>
              <button onClick={load} className="flex items-center gap-1 text-xs font-bold text-sky-700">
                <RefreshCw className="h-3.5 w-3.5" /> تحديث
              </button>
            </div>
            {loading ? <div className="text-sm text-slate-500">جارٍ التحميل...</div> : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div key={rule.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-800">{rule.name}</div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          {rule.taxableBasis === 'BASE' ? 'أساس: الأجر الأساسي' : 'أساس: الإجمالي'} •
                          {rule.isActive ? ' نشطة' : ' غير نشطة'} • من {rule.effectiveFrom}
                          {rule.effectiveTo ? ` حتى ${rule.effectiveTo}` : ''}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          شرائح: {rule.brackets.map((b) => `${b.ratePercent}%`).join('، ')}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => editRule(rule)} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600">تعديل</button>
                        <button onClick={() => removeRule(rule.id)} className="rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-600">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!rules.length && <div className="text-xs text-slate-400">لا توجد قواعد ضريبة محفوظة.</div>}
              </div>
            )}
          </div>

          <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="text-sm font-black text-slate-700">{editingId ? 'تعديل قاعدة' : 'قاعدة جديدة'}</h3>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</div>}
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-600">اسم القاعدة</span>
              <input required value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-600">بداية السريان</span>
                <input required type="date" value={draft.effectiveFrom} onChange={(e) => setDraft((p) => ({ ...p, effectiveFrom: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-600">نهاية السريان (اختياري)</span>
                <input type="date" value={draft.effectiveTo} onChange={(e) => setDraft((p) => ({ ...p, effectiveTo: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-600">أساس الضريبة</span>
                <select value={draft.taxableBasis} onChange={(e) => setDraft((p) => ({ ...p, taxableBasis: e.target.value as 'GROSS' | 'BASE' }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
                  <option value="GROSS">الإجمالي</option>
                  <option value="BASE">الأجر الأساسي</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-600">إعفاء لكل معال</span>
                <input type="number" min={0} step="0.01" value={draft.dependentAllowance} onChange={(e) => setDraft((p) => ({ ...p, dependentAllowance: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((p) => ({ ...p, isActive: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-sky-600" />
              قاعدة نشطة
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-600">ملاحظات</span>
              <input value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-700">الشرائح</span>
                <button type="button" onClick={addBracket} className="flex items-center gap-1 text-xs font-bold text-sky-700">
                  <Plus className="h-3.5 w-3.5" /> إضافة شريحة
                </button>
              </div>
              {draft.brackets.map((bracket, index) => (
                <div key={index} className="grid grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-white p-2">
                  <input placeholder="من" type="number" min={0} step="0.01" value={bracket.lowerLimit} onChange={(e) => updateBracket(index, 'lowerLimit', e.target.value)} className="rounded border border-slate-200 px-2 py-1.5 text-xs" />
                  <input placeholder="إلى (فارغ = ∞)" type="number" min={0} step="0.01" value={bracket.upperLimit} onChange={(e) => updateBracket(index, 'upperLimit', e.target.value)} className="rounded border border-slate-200 px-2 py-1.5 text-xs" />
                  <input placeholder="%" type="number" min={0} max={100} step="0.01" value={bracket.ratePercent} onChange={(e) => updateBracket(index, 'ratePercent', e.target.value)} className="rounded border border-slate-200 px-2 py-1.5 text-xs" />
                  <button type="button" onClick={() => removeBracket(index)} className="flex items-center justify-center rounded border border-rose-200 text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> {saving ? 'جارٍ الحفظ...' : 'حفظ القاعدة'}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setDraft(emptyRule()); setEditingId(null); }} className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">
                إلغاء التعديل
              </button>
            )}
          </form>
        </div>
      </section>
    </div>
  );
};
