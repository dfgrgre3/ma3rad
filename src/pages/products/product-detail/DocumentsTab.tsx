import React, { useEffect, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { ProductExtraService, ProductDocument } from '../../../services/ProductExtraService';
import { DOC_TYPES } from './constants';

interface DocumentsTabProps {
  productId: string;
  canEdit: boolean;
}

export const DocumentsTab: React.FC<DocumentsTabProps> = ({ productId, canEdit }) => {
  const service = new ProductExtraService();
  const [rows, setRows] = useState<ProductDocument[]>([]);
  const [form, setForm] = useState({ filePath: '', fileName: '', documentType: 'OTHER' });

  const load = () => { try { setRows(service.getDocuments(productId)); } catch (e) { console.error(e); } };
  useEffect(() => { load(); }, [productId]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.filePath.trim()) return;
    try {
      service.addDocument(productId, form.filePath.trim(), form.fileName.trim() || form.filePath.split(/[\\/]/).pop() || 'ملف', form.documentType);
      setForm({ filePath: '', fileName: '', documentType: 'OTHER' });
      load();
    } catch (err: any) { alert(err?.message); }
  };

  const remove = (id: string) => {
    if (!confirm('حذف هذا المستند؟')) return;
    try { service.deleteDocument(id); load(); } catch (err: any) { alert(err?.message); }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <form onSubmit={add} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-bold text-slate-700 mb-1">مسار المستند أو رابطها</label>
            <input value={form.filePath} onChange={(e) => setForm({ ...form, filePath: e.target.value })} placeholder="C:\\docs\\datasheet.pdf" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono" />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستند</label>
            <input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="ملف البيانات الفنية" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs" />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-bold text-slate-700 mb-1">النوع</label>
            <select value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold">
              {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer">
            <Upload className="w-4 h-4" /> اختيار ملف
            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setForm((prev) => ({ ...prev, filePath: (f as any).path || f.name, fileName: prev.fileName || f.name })); }} />
          </label>
          <button type="submit" className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold">إضافة</button>
        </form>
      )}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {rows.length === 0 ? <div className="text-center text-slate-500 py-12 text-sm">لا توجد مستندات لهذا المنتج</div> : (
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50"><tr>{['المستند', 'النوع', 'المسار', 'التاريخ', canEdit ? 'حذف' : ''].filter(Boolean).map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-sky-500" /> {d.fileName}</td>
                  <td className="px-4 py-3 text-slate-600">{DOC_TYPES[d.documentType] || d.documentType}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500 max-w-[260px] truncate">{d.filePath}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.createdAt ? new Date(d.createdAt).toLocaleDateString('ar-EG') : '—'}</td>
                  {canEdit && <td className="px-4 py-3"><button onClick={() => remove(d.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
