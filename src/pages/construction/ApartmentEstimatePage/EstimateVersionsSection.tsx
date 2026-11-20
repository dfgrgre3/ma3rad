import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/ui/DataTable';
import type { ApartmentEstimateQuotationLink, ApartmentEstimateVersion } from '../../../types/projects/apartmentEstimate';
import { fieldClass, fmt } from './estimateModel';

export type VersionCompareRow = {
  id: string; name: string;
  beforeQuantity: number; afterQuantity: number;
  beforePrice: number; afterPrice: number;
  beforeLabor: number; afterLabor: number;
  beforeOtherRates: number[]; afterOtherRates: number[];
  changed: boolean;
};

export const EstimateVersionsSection: React.FC<{
  versions: ApartmentEstimateVersion[];
  versionChangeSummary: string;
  setVersionChangeSummary: React.Dispatch<React.SetStateAction<string>>;
  compareVersionIds: [string, string];
  setCompareVersionIds: React.Dispatch<React.SetStateAction<[string, string]>>;
  compareA: ApartmentEstimateVersion | undefined;
  compareB: ApartmentEstimateVersion | undefined;
  compareLines: VersionCompareRow[];
  quotationLinks: ApartmentEstimateQuotationLink[];
  canUpdateProjects: boolean;
  canApproveProject: boolean;
  submitVersionForReview: (versionId: string) => void;
  reviewEstimateVersion: (versionId: string, decision: 'APPROVED' | 'RETURNED') => void;
}> = ({
  versions, versionChangeSummary, setVersionChangeSummary,
  compareVersionIds, setCompareVersionIds,
  compareA, compareB, compareLines,
  quotationLinks, canUpdateProjects, canApproveProject,
  submitVersionForReview, reviewEstimateVersion,
}) => {
  const navigate = useNavigate();
  return (
    <section className="mb-5 rounded-2xl border border-accent-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-ink">إصدارات المقايسة واعتمادها</h2><p className="text-xs text-muted">كل حفظ ينشئ نسخة مستقلة، وتظل عروض الأسعار مرتبطة بالإصدار الذي صدرت منه.</p></div><label className="min-w-64 text-[11px] font-bold text-ink-secondary">ملخص التعديل لهذه النسخة<input value={versionChangeSummary} onChange={(event) => setVersionChangeSummary(event.target.value)} className={`${fieldClass()} mt-1`} placeholder="مثال: تحديث أسعار السيراميك والكميات" /></label></div>
        <div className="space-y-2">{versions.map((version) => <article key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-muted p-3 text-xs"><div><b>الإصدار {version.versionNumber} · {({ DRAFT: 'مسودة', PENDING: 'بانتظار المراجعة', APPROVED: 'معتمد', RETURNED: 'معاد للمراجعة' } as Record<string, string>)[version.status]}</b><div className="mt-1 text-muted">أعده {version.createdByName} · {new Date(version.createdAt).toLocaleString('ar-EG')} · {version.changeSummary}</div>{version.reviewedByName && <div className="mt-1 text-muted">راجعه {version.reviewedByName} · {version.reviewNotes || (version.status === 'APPROVED' ? 'تم الاعتماد' : '')}</div>}</div><div className="flex flex-wrap gap-1">{(version.status === 'DRAFT' || version.status === 'RETURNED') && version.id === versions[0]?.id && canUpdateProjects && <button type="button" onClick={() => submitVersionForReview(version.id)} className="rounded-lg border border-accent-border bg-surface px-2 py-1 font-bold text-primary">إرسال للمراجعة</button>}{version.status === 'PENDING' && canApproveProject && <><button type="button" disabled={version.id !== versions[0]?.id} onClick={() => reviewEstimateVersion(version.id, 'APPROVED')} className="rounded-lg bg-success px-2 py-1 font-bold text-white disabled:opacity-50">اعتماد</button><button type="button" onClick={() => reviewEstimateVersion(version.id, 'RETURNED')} className="rounded-lg border border-danger-border bg-surface px-2 py-1 font-bold text-danger">إرجاع</button></>}<label className="flex items-center gap-1">مقارنة A<select value={compareVersionIds[0]} onChange={(event) => setCompareVersionIds((current) => [event.target.value, current[1]])} className="rounded border bg-surface px-1 py-1"> <option value="">—</option>{versions.map((item) => <option key={item.id} value={item.id}>v{item.versionNumber}</option>)}</select></label><label className="flex items-center gap-1">B<select value={compareVersionIds[1]} onChange={(event) => setCompareVersionIds((current) => [current[0], event.target.value])} className="rounded border bg-surface px-1 py-1"><option value="">—</option>{versions.map((item) => <option key={item.id} value={item.id}>v{item.versionNumber}</option>)}</select></label></div></article>)}</div>
        {compareA && compareB && <div className="mt-3 overflow-x-auto rounded-xl border border-accent-border"><div className="p-3 text-xs font-bold text-primary">مقارنة الإصدار {compareA.versionNumber} مع الإصدار {compareB.versionNumber} · الإجمالي {fmt(compareA.snapshot.totalAmount)} ← {fmt(compareB.snapshot.totalAmount)} ج · المساحة {fmt(compareA.snapshot.areaM2)} ← {fmt(compareB.snapshot.areaM2)} م² · تغييرات البنود: {compareLines.length}</div><DataTable
            ariaLabel="مقارنة بنود الإصدارات"
            rows={compareLines}
            rowKey={(row) => row.id}
            dense
            minWidth={850}
            tableClassName="text-xs"
            columns={[
              { key: 'item', header: 'البند', render: (row) => <span className="font-bold">{row.name}</span> },
              { key: 'qty', header: 'الكمية قبل ← بعد', render: (row) => <span>{fmt(row.beforeQuantity)} ← {fmt(row.afterQuantity)}</span> },
              { key: 'material', header: 'المادة', render: (row) => <span>{fmt(row.beforePrice)} ← {fmt(row.afterPrice)}</span> },
              { key: 'labor', header: 'العمالة', render: (row) => <span>{fmt(row.beforeLabor)} ← {fmt(row.afterLabor)}</span> },
              { key: 'other', header: 'المعدات / المصروفات / الهالك / الخصم / الربح', render: (row) => <span>{row.beforeOtherRates.map(fmt).join(' / ')} ← {row.afterOtherRates.map(fmt).join(' / ')}</span> },
            ]}
            emptyTitle="لا توجد تغييرات في كميات البنود أو أسعارها."
          /></div>}
        {quotationLinks.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs"><b className="self-center text-ink-secondary">عروض الأسعار المرتبطة:</b>{quotationLinks.map((link) => <button key={link.quotationId} type="button" onClick={() => navigate('/quotations')} className="rounded-lg border border-accent-border bg-accent-soft px-2 py-1 font-bold text-primary">{link.quotationNumber} · الإصدار {link.versionNumber ?? '—'}</button>)}</div>}
    </section>
  );
};
