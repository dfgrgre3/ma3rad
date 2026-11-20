import React from "react";
import { Search } from "lucide-react";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  onSubmit: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
};

export const SearchToolbar: React.FC<Props> = ({
  search,
  onSearchChange,
  onSubmit,
  onExportExcel,
  onExportPdf,
}) => (
  <div className="p-4 bg-surface border-b border-line">
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="relative"
    >
      <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="بحث باسم الحساب ثم اضغط إدخال..."
        className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-danger"
      />
    </form>
    <div className="mt-2 flex justify-end gap-2">
      <button
        onClick={onExportExcel}
        className="px-3 py-2 rounded-lg bg-success text-white text-xs"
      >
        تقرير المتأخرات بصيغة جدول بيانات
      </button>
      <button
        onClick={onExportPdf}
        className="px-3 py-2 rounded-lg bg-primary text-white text-xs"
      >
        طباعة التقرير
      </button>
    </div>
  </div>
);
