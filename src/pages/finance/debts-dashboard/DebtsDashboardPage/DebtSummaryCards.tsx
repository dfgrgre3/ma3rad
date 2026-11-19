import React from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { fmt } from "./constants";

type Totals = { receivable: number; payable: number; net: number };

export const DebtSummaryCards: React.FC<{ totals: Totals }> = ({ totals }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-white border-b border-slate-200">
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <div className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
        <ArrowDownLeft className="w-3 h-3" /> ذمم مدينة (لنا)
      </div>
      <div className="text-lg font-black text-emerald-700 mt-1">
        {fmt(totals.receivable)}
      </div>
    </div>
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
      <div className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
        <ArrowUpRight className="w-3 h-3" /> مستحقات للموردين
      </div>
      <div className="text-lg font-black text-rose-700 mt-1">
        {fmt(totals.payable)}
      </div>
    </div>
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[10px] font-bold text-slate-500">
        صافي المركز
      </div>
      <div
        className={`text-lg font-black mt-1 ${totals.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}
      >
        {fmt(totals.net)}
      </div>
    </div>
  </div>
);
