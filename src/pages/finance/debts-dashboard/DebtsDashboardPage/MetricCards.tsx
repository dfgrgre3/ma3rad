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
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2 p-4 bg-surface-muted border-b border-line">
    <button
      onClick={onResetSearch}
      className="text-right rounded-xl border bg-surface p-3 hover:border-success"
    >
      <div className="text-[10px] text-muted">عملاء بأرصدة مدينة</div>
      <strong className="text-lg">{summary.openCustomers}</strong>
    </button>
    <button
      onClick={onResetSearch}
      className="text-right rounded-xl border bg-surface p-3 hover:border-warning"
    >
      <div className="text-[10px] text-muted">
        فواتير غير مسددة بالكامل
      </div>
      <strong className="text-lg">{summary.openInvoices}</strong>
    </button>
    <button
      onClick={() => {
        onResetSearch();
      }}
      title="الفواتير ذات تاريخ استحقاق مسجل ومضى موعده"
      className="text-right rounded-xl border bg-surface p-3 hover:border-danger"
    >
      <div className="text-[10px] text-muted">
        مبالغ الفواتير المتأخرة · {summary.overdueInvoiceCount} فاتورة
      </div>
      <strong className="text-lg text-danger">
        {fmt(summary.overdueInvoices)}
      </strong>
    </button>
    <button
      onClick={() => onNavigate("/purchases/incoming")}
      className="text-right rounded-xl border bg-surface p-3 hover:border-accent-border"
    >
      <div className="text-[10px] text-muted">
        قيمة البضائع المنتظرة
      </div>
      <strong className="text-lg">{fmt(summary.pendingGoodsValue)}</strong>
    </button>
    <button
      onClick={() => onNavigate("/purchases/incoming")}
      className="text-right rounded-xl border bg-surface p-3 hover:border-danger"
    >
      <div className="text-[10px] text-muted">توريدات متأخرة</div>
      <strong className="text-lg text-danger">
        {summary.overdueOrders}
      </strong>
    </button>
    <button
      onClick={() => onNavigate("/finance/other-receivables")}
      className="text-right rounded-xl border bg-surface p-3 hover:border-accent-border"
    >
      <div className="text-[10px] text-muted">مستحقات أخرى مفتوحة</div>
      <strong className="text-lg">{summary.otherReceivables}</strong>
    </button>
  </div>
);
