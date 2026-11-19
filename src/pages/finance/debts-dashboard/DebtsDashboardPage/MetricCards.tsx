import React from "react";
import { fmt } from "./constants";
import type { SummaryState } from "./types";

type Props = {
  summary: SummaryState;
  onResetSearch: () => void;
  onNavigate: (path: string) => void;
};

export const MetricCards: React.FC<Props> = ({
  summary,
  onResetSearch,
  onNavigate,
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2 p-4 bg-slate-50 border-b border-slate-200">
    <button
      onClick={onResetSearch}
      className="text-right rounded-xl border bg-white p-3 hover:border-emerald-300"
    >
      <div className="text-[10px] text-slate-500">عملاء بأرصدة مدينة</div>
      <strong className="text-lg">{summary.openCustomers}</strong>
    </button>
    <button
      onClick={onResetSearch}
      className="text-right rounded-xl border bg-white p-3 hover:border-amber-300"
    >
      <div className="text-[10px] text-slate-500">
        فواتير غير مسددة بالكامل
      </div>
      <strong className="text-lg">{summary.openInvoices}</strong>
    </button>
    <button
      onClick={() => {
        onResetSearch();
      }}
      title="الفواتير ذات تاريخ استحقاق مسجل ومضى موعده"
      className="text-right rounded-xl border bg-white p-3 hover:border-rose-300"
    >
      <div className="text-[10px] text-slate-500">
        مبالغ الفواتير المتأخرة · {summary.overdueInvoiceCount} فاتورة
      </div>
      <strong className="text-lg text-rose-700">
        {fmt(summary.overdueInvoices)}
      </strong>
    </button>
    <button
      onClick={() => onNavigate("/purchases/incoming")}
      className="text-right rounded-xl border bg-white p-3 hover:border-sky-300"
    >
      <div className="text-[10px] text-slate-500">
        قيمة البضائع المنتظرة
      </div>
      <strong className="text-lg">{fmt(summary.pendingGoodsValue)}</strong>
    </button>
    <button
      onClick={() => onNavigate("/purchases/incoming")}
      className="text-right rounded-xl border bg-white p-3 hover:border-rose-300"
    >
      <div className="text-[10px] text-slate-500">توريدات متأخرة</div>
      <strong className="text-lg text-rose-700">
        {summary.overdueOrders}
      </strong>
    </button>
    <button
      onClick={() => onNavigate("/finance/other-receivables")}
      className="text-right rounded-xl border bg-white p-3 hover:border-violet-300"
    >
      <div className="text-[10px] text-slate-500">مستحقات أخرى مفتوحة</div>
      <strong className="text-lg">{summary.otherReceivables}</strong>
    </button>
  </div>
);
