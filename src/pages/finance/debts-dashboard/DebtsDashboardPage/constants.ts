import type { DebtRow } from "../../../../services/domains/finance/DebtService";

export const TYPE_LABELS: Record<DebtRow["type"], { label: string; color: string }> = {
  CUSTOMER_RECEIVABLE: {
    label: "ذمم مدينة (لنا)",
    color: "text-success bg-success-soft border-success-border",
  },
  SUPPLIER_PAYABLE: {
    label: "مستحقات للموردين (علينا)",
    color: "text-danger bg-danger-soft border-danger-border",
  },
};

export const fmt = (n: number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(n) + " ج";
