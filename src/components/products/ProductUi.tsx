import React from 'react';

export { FormField as Field } from '../ui/FormField';

export const ListPagination: React.FC<{ page: number; totalPages: number; totalItems: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }> = ({ page, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--win-border)] px-4 py-3 text-xs">
    <span className="text-[var(--cerami-muted)]">عرض {Math.min((page - 1) * pageSize + 1, totalItems)}–{Math.min(page * pageSize, totalItems)} من {totalItems}</span>
    <div className="flex items-center gap-2">
      <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="ui-input px-2 py-1.5"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
      <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="erp-btn erp-btn--secondary erp-btn--sm disabled:cursor-not-allowed disabled:opacity-40">السابق</button>
      <span className="min-w-[70px] text-center font-bold">{page} / {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="erp-btn erp-btn--secondary erp-btn--sm disabled:cursor-not-allowed disabled:opacity-40">التالي</button>
    </div>
  </div>
);
