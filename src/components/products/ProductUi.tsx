import React from 'react';

export const ListPagination: React.FC<{ page: number; totalPages: number; totalItems: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }> = ({ page, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs">
    <span className="text-slate-500">عرض {Math.min((page - 1) * pageSize + 1, totalItems)}–{Math.min(page * pageSize, totalItems)} من {totalItems}</span>
    <div className="flex items-center gap-2">
      <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
      <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:cursor-not-allowed disabled:opacity-40">السابق</button>
      <span className="min-w-[70px] text-center font-bold">{page} / {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:cursor-not-allowed disabled:opacity-40">التالي</button>
    </div>
  </div>
);

export const Field: React.FC<{ id?: string; label: string; required?: boolean; hint?: string; children: React.ReactNode }> = ({ id, label, required, hint, children }) => {
  const controlId = id || `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const fieldChildren = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ id?: string }>, {
        id: (children as React.ReactElement<{ id?: string }>).props.id || controlId,
      })
    : children;

  return (
    <div>
      <label htmlFor={controlId} className="mb-1 block font-bold text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {fieldChildren}
      {hint && <p className="mt-1 text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
};

export const StatCard: React.FC<{ label: string; value: string; hint?: string; icon: React.ReactNode; tone: string }> = ({ label, value, hint, icon, tone }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
    <div className="text-[11px] font-bold text-slate-500">{label}</div>
    <div className="mt-0.5 text-lg font-black text-slate-900">{value}</div>
    {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
  </div>
);
