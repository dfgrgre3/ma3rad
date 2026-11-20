import React from "react";
import { Loader2, X } from "lucide-react";
import type { DebtRow } from "../../../../services/domains/finance/DebtService";
import { fmt } from "./constants";
import type { InvoiceOption } from "./types";

type PaymentType = "CASH" | "CARD" | "BANK_TRANSFER";

export type PaymentFormState = {
  amount: string;
  invoiceOptions: InvoiceOption[];
  allocationAmounts: Record<string, string>;
  paymentType: PaymentType;
  paymentDate: string;
  paymentReference: string;
  saving: boolean;
};

type Props = {
  target: DebtRow;
  form: PaymentFormState;
  onAmountChange: (value: string) => void;
  onAllocationChange: (invoiceId: string, value: string) => void;
  onPaymentTypeChange: (value: PaymentType) => void;
  onPaymentDateChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
};

export const PaymentModal: React.FC<Props> = ({
  target,
  form,
  onAmountChange,
  onAllocationChange,
  onPaymentTypeChange,
  onPaymentDateChange,
  onPaymentReferenceChange,
  onClose,
  onSubmit,
}) => {
  const {
    amount,
    invoiceOptions,
    allocationAmounts,
    paymentType,
    paymentDate,
    paymentReference,
    saving,
  } = form;
  return (
    <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl border border-line shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-extrabold text-ink">
            {target.type === "CUSTOMER_RECEIVABLE"
              ? "تسجيل تحصيل"
              : "سداد دفعة"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:bg-surface-sunken"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mb-3 text-xs text-muted">
          الحساب:{" "}
          <span className="font-bold text-ink">{target.name}</span>
          <br />
          المستحق:{" "}
          <span className="font-black text-danger">
            {fmt(target.amount)}
          </span>
        </div>
        <form onSubmit={onSubmit} className="space-y-3 text-xs">
          {target.type === "CUSTOMER_RECEIVABLE" &&
            invoiceOptions.length > 0 && (
              <div className="space-y-2">
                <label className="font-bold text-ink block">
                  توزيع الدفعة على الفواتير المفتوحة
                </label>
                {invoiceOptions.map((invoice) => (
                  <label
                    key={invoice.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-2"
                  >
                    <span>
                      فاتورة {invoice.invoiceNumber} · متبقي{" "}
                      {fmt(invoice.remaining)}
                    </span>
                    <input
                      aria-label={`المبلغ من الفاتورة ${invoice.invoiceNumber}`}
                      type="number"
                      min="0"
                      max={invoice.remaining}
                      step="0.01"
                      value={allocationAmounts[invoice.id] || ""}
                      onChange={(e) =>
                        onAllocationChange(invoice.id, e.target.value)
                      }
                      className="w-32 px-2 py-1 border rounded-lg"
                    />
                  </label>
                ))}
              </div>
            )}
          {(!invoiceOptions.length ||
            target.type !== "CUSTOMER_RECEIVABLE") && (
            <div>
              <label className="font-bold text-ink block mb-1">
                المبلغ *
              </label>
              <input
                required
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="w-full px-3 py-2 bg-surface-muted rounded-xl border border-line font-mono font-bold"
              />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="font-bold">
              طريقة الدفع
              <select
                value={paymentType}
                onChange={(e) =>
                  onPaymentTypeChange(
                    e.target.value as "CASH" | "CARD" | "BANK_TRANSFER",
                  )
                }
                className="mt-1 w-full p-2 border rounded-lg"
              >
                <option value="CASH">نقدي</option>
                <option value="CARD">بطاقة</option>
                <option value="BANK_TRANSFER">تحويل بنكي</option>
              </select>
            </label>
            {target.type === "CUSTOMER_RECEIVABLE" && (
              <label className="font-bold">
                تاريخ الدفع
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => onPaymentDateChange(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-lg"
                />
              </label>
            )}
          </div>
          {target.type === "CUSTOMER_RECEIVABLE" &&
            invoiceOptions.length > 0 && (
              <label className="font-bold block">
                المرجع / الملاحظات
                <input
                  value={paymentReference}
                  onChange={(e) => onPaymentReferenceChange(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-lg"
                />
              </label>
            )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-sunken text-ink font-bold rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-success hover:bg-success text-white font-bold rounded-xl flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}
              تأكيد
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
