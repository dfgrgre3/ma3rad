import type { DebtRow } from "../../../../services/domains/finance/DebtService";

export const TYPE_LABELS: Record<DebtRow["type"], { label: string; color: string }> = {
  CUSTOMER_RECEIVABLE: {
    label: "ذمم مدينة (لنا)",
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  SUPPLIER_PAYABLE: {
    label: "مستحقات للموردين (علينا)",
    color: "text-rose-600 bg-rose-50 border-rose-200",
  },
};

export const fmt = (n: number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(n) + " ج";
