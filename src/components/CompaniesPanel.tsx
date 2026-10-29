import React, { useEffect, useState } from 'react';
import { Building2, Plus, Save, Ban, RefreshCw } from 'lucide-react';
import { CompanyService } from '../services/CompanyService';
import { usePermission } from '../hooks/usePermission';
import { useToast } from './ui/Toast';
import type { Company } from '../types';

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/30';

/**
 * Legal-entity management. Every operation is executed by CompanyService, so
 * permissions and company scope are enforced outside the UI too.
 */
export const CompaniesPanel: React.FC = () => {
  const toast = useToast();
  const can = usePermission();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ code: '', name: '', currency: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: '', legalName: '', taxNumber: '', currency: '' });

  const load = () => {
    try {
      setCompanies(new CompanyService().getAllCompanies());
      setError('');
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الشركات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (can('companies.view')) load();
    else setLoading(false);
  }, [can]);

  if (!can('companies.view')) return null;

  const create = () => {
    try {
      const created = new CompanyService().createCompany({
        code: draft.code,
        name: draft.name,
        currency: draft.currency || undefined,
      });
      setDraft({ code: '', name: '', currency: '' });
      setCreating(false);
      load();
      toast.success('تم إضافة الشركة', created.name);
    } catch (e: any) {
      toast.error('تعذر إضافة الشركة', e?.message || String(e));
    }
  };

  const startEdit = (company: Company) => {
    setEditing(company.id);
    setEditDraft({
      name: company.name,
      legalName: company.legalName || '',
      taxNumber: company.taxNumber || '',
      currency: company.currency || '',
    });
  };

  const saveEdit = (company: Company) => {
    try {
      new CompanyService().updateCompany(company.id, {
        name: editDraft.name,
        legalName: editDraft.legalName,
        taxNumber: editDraft.taxNumber,
        currency: editDraft.currency,
      });
      setEditing(null);
      load();
      toast.success('تم تحديث بيانات الشركة');
    } catch (e: any) {
      toast.error('تعذر تحديث الشركة', e?.message || String(e));
    }
  };

  const deactivate = (company: Company) => {
    if (!window.confirm(`تعطيل الشركة «${company.name}»؟ لن تُحذف أي بيانات تاريخية.`)) return;
    try {
      new CompanyService().deactivateCompany(company.id);
      load();
      toast.success('تم تعطيل الشركة');
    } catch (e: any) {
      toast.error('تعذر تعطيل الشركة', e?.message || String(e));
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
          <Building2 className="h-4 w-4" /> الشركات والكيانات القانونية
        </h4>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 dark:border-slate-700" title="تحديث">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {can('companies.create') && (
            <button
              type="button"
              onClick={() => setCreating((value) => !value)}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-sky-700"
            >
              <Plus className="h-3.5 w-3.5" /> شركة جديدة
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}
      {loading && <p className="text-xs text-slate-500">جارٍ التحميل…</p>}

      {creating && (
        <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-4 dark:border-slate-700">
          <input className={inputCls} placeholder="الكود (مثال: BRANCH2)" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          <input className={inputCls} placeholder="اسم الشركة" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className={inputCls} placeholder="العملة (EGP)" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} />
          <button type="button" onClick={create} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">حفظ</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">الكود</th>
              <th className="px-3 py-2">الاسم</th>
              <th className="px-3 py-2">القانوني</th>
              <th className="px-3 py-2">الرقم الضريبي</th>
              <th className="px-3 py-2">العملة</th>
              <th className="px-3 py-2">الفروع</th>
              <th className="px-3 py-2">الحالة</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const isEditing = editing === company.id;
              return (
                <tr key={company.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 font-mono">{company.code}</td>
                  <td className="px-3 py-2">
                    {isEditing ? <input className={inputCls} value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /> : company.name}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? <input className={inputCls} value={editDraft.legalName} onChange={(e) => setEditDraft({ ...editDraft, legalName: e.target.value })} /> : company.legalName || '—'}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? <input className={inputCls} value={editDraft.taxNumber} onChange={(e) => setEditDraft({ ...editDraft, taxNumber: e.target.value })} /> : company.taxNumber || '—'}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? <input className={inputCls} value={editDraft.currency} onChange={(e) => setEditDraft({ ...editDraft, currency: e.target.value })} /> : company.currency || '—'}
                  </td>
                  <td className="px-3 py-2">{company.branchCount ?? 0}</td>
                  <td className="px-3 py-2">
                    <span className={company.isActive ? 'text-emerald-600' : 'text-slate-400'}>
                      {company.isActive ? 'نشطة' : 'معطلة'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {isEditing ? (
                        <button type="button" onClick={() => saveEdit(company)} className="rounded-md bg-emerald-600 p-1.5 text-white" title="حفظ">
                          <Save className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        can('companies.update') && (
                          <button type="button" onClick={() => startEdit(company)} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 dark:border-slate-700 dark:text-slate-300">
                            تعديل
                          </button>
                        )
                      )}
                      {company.isActive && can('companies.delete') && !isEditing && (
                        <button type="button" onClick={() => deactivate(company)} className="rounded-md border border-rose-200 p-1.5 text-rose-600 dark:border-rose-500/30" title="تعطيل">
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && companies.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">لا توجد شركات ضمن نطاق صلاحيتك.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        تعطيل الشركة لا يحذف أي سجل تاريخي. يجب نقل أو تعطيل فروعها أولًا.
      </p>
    </div>
  );
};
