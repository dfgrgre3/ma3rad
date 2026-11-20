import React from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { fmt } from "./constants";

type Totals = { receivable: number; payable: number; net: number };

export const DebtSummaryCards: React.FC<{ totals: Totals }> = ({ totals }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-surface border-b border-line">
    <div className="rounded-xl border border-success-border bg-success-soft px-4 py-3">
      <div className="text-[10px] font-bold text-success flex items-center gap-1">
        <ArrowDownLeft className="w-3 h-3" /> ذمم مدينة (لنا)
      </div>
      <div className="text-lg font-black text-success mt-1">
        {fmt(totals.receivable)}
      </div>
    </div>
    <div className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3">
      <div className="text-[10px] font-bold text-danger flex items-center gap-1">
        <ArrowUpRight className="w-3 h-3" /> مستحقات للموردين
      </div>
      <div className="text-lg font-black text-danger mt-1">
        {fmt(totals.payable)}
      </div>
    </div>
    <div className="rounded-xl border border-line bg-surface-muted px-4 py-3">
      <div className="text-[10px] font-bold text-muted">
        صافي المركز
      </div>
      <div
        className={`text-lg font-black mt-1 ${totals.net >= 0 ? "text-success" : "text-danger"}`}
      >
        {fmt(totals.net)}
      </div>
    </div>
  </div>
);
