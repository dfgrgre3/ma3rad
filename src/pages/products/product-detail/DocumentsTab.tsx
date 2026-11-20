import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { FileText, Trash2, Upload } from 'lucide-react';
import { ProductExtraService, ProductDocument } from '../../../services/domains/products/ProductExtraService';
import { DOC_TYPES } from './constants';

import { useToast } from '../../../components/ui/Toast';
interface DocumentsTabProps {
  productId: string;
  canCreate: boolean;
  canArchive: boolean;
}

export const DocumentsTab: React.FC<DocumentsTabProps> = ({ productId, canCreate, canArchive }) => {
  const toast = useToast();
  const service = useMemo(() => new ProductExtraService(), []);
  const [rows, setRows] = useState<ProductDocument[]>([]);
  const [form, setForm] = useState({ filePath: '', fileName: '', documentType: 'OTHER' });

  const load = useCallback(() => { try { setRows(service.getDocuments(productId)); } catch (e) { console.error(e); } }, [productId, service]);
  useEffect(() => { load(); }, [load]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.filePath.trim()) return;
    try {
      service.addDocument(productId, form.filePath.trim(), form.fileName.trim() || form.filePath.split(/[\\/]/).pop() || 'ملف', form.documentType);
      setForm({ filePath: '', fileName: '', documentType: 'OTHER' });
      load();
    } catch (err: any) { toast.error(err?.message); }
  };

  const remove = (id: string) => {
    if (!confirm('حذف هذا المستند؟')) return;
    try { service.deleteDocument(id); load(); } catch (err: any) { toast.error(err?.message); }
  };

  return (
    <div className="space-y-4">
      {canCreate && (
        <form onSubmit={add} className="bg-surface rounded-xl border border-line p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-bold text-ink mb-1">مسار المستند أو رابطها</label>
            <input value={form.filePath} onChange={(e) => setForm({ ...form, filePath: e.target.value })} placeholder="C:\\docs\\datasheet.pdf" className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line text-xs font-mono" />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-bold text-ink mb-1">اسم المستند</label>
            <input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="ملف البيانات الفنية" className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line text-xs" />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-bold text-ink mb-1">النوع</label>
            <select value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line text-xs font-bold">
              {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 px-3 py-2 bg-surface-muted rounded-xl border border-line text-xs font-bold text-ink-secondary cursor-pointer">
            <Upload className="w-4 h-4" /> اختيار ملف
            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setForm((prev) => ({ ...prev, filePath: (f as any).path || f.name, fileName: prev.fileName || f.name })); }} />
          </label>
          <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-xs font-bold">إضافة</button>
        </form>
      )}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        {rows.length === 0 ? <div className="text-center text-muted py-12 text-sm">لا توجد مستندات لهذا المنتج</div> : (
          <DataTable
            ariaLabel="مستندات المنتج"
            rows={rows}
            rowKey={(d: any) => String(d.id)}
            tableClassName="text-sm"
            rowClassName={() => 'transition hover:bg-surface-muted/70'}
            columns={[
              { key: 'doc', header: 'المستند', render: (d: any) => <span className="flex items-center gap-2 font-bold text-ink"><FileText className="h-4 w-4 text-primary" /> {d.fileName}</span> },
              { key: 'type', header: 'النوع', render: (d: any) => <span className="text-ink-secondary">{DOC_TYPES[d.documentType as keyof typeof DOC_TYPES] || d.documentType}</span> },
              { key: 'path', header: 'المسار', render: (d: any) => <span className="block max-w-[260px] truncate font-mono text-xs text-muted">{d.filePath}</span> },
              { key: 'date', header: 'التاريخ', render: (d: any) => <span className="text-xs text-muted">{d.createdAt ? new Date(d.createdAt).toLocaleDateString('ar-EG') : '—'}</span> },
              ...(canArchive ? [{ key: 'del', header: 'حذف', render: (d: any) => <button onClick={() => remove(d.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button> }] : []),
            ]}
          />
        )}
      </div>
    </div>
  );
};
