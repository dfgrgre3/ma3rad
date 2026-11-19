import React from "react";
import {
  Calendar,
  ChevronDown,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import type { DebtRow } from "../../../../services/domains/finance/DebtService";
import { TYPE_LABELS, fmt } from "./constants";
import type { CustomerDetail, CustomerPayment } from "./types";

type Props = {
  debt: DebtRow;
  expanded: boolean;
  detail: CustomerDetail | undefined;
  canManagePromises: boolean;
  canReversePayments: boolean;
  onToggle: () => void;
  onOpenPromise: () => void;
  onExportStatement: (format: "excel" | "pdf") => void;
  onReversePayment: (payment: CustomerPayment) => void;
  onPay: () => void;
};

export const DebtCard: React.FC<Props> = ({
  debt: d,
  expanded,
  detail,
  canManagePromises,
  canReversePayments,
  onToggle,
  onOpenPromise,
  onExportStatement,
  onReversePayment,
  onPay,
}) => {
  const typeConfig = TYPE_LABELS[d.type];
  return (
    <div
      className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <span
            className={`text-[10px] px-2.5 py-1 rounded font-bold border ${typeConfig.color}`}
          >
            {typeConfig.label}
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${d.overdue ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}
          >
            {d.overdue ? "متأخرة السداد" : "قائمة"}
          </span>
        </div>
        <h3 className="font-extrabold text-slate-900 mb-2 text-base flex items-center gap-1">
          <User className="w-4 h-4 text-slate-400" />
          {d.name}
        </h3>
        <div className="space-y-1.5 text-xs text-slate-500 mb-4">
          <div className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" />
            {d.phone || "—"}
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            آخر حركة:{" "}
            {d.updatedAt
              ? new Date(d.updatedAt).toLocaleDateString("ar-EG")
              : "—"}
          </div>
        </div>
        {d.type === "CUSTOMER_RECEIVABLE" && (
          <button
            onClick={onToggle}
            className="text-xs font-bold text-sky-700 inline-flex items-center gap-1 mb-3"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
            تفاصيل الفواتير والأصناف
          </button>
        )}
        {expanded && d.type === "CUSTOMER_RECEIVABLE" && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
            <div className="flex items-start gap-1.5 text-slate-600">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              العنوان: {detail?.address || "جارٍ التحميل..."}
            </div>
            {canManagePromises && (
              <button
                onClick={onOpenPromise}
                className="rounded-lg bg-amber-100 text-amber-800 px-2 py-1"
              >
                تسجيل وعد سداد / متابعة
              </button>
            )}
            {(detail?.promises || []).map((promise) => (
              <div
                key={promise.id}
                className="border rounded-lg p-2 text-slate-600"
              >
                وعد:{" "}
                {promise.promisedAmount != null
                  ? fmt(promise.promisedAmount)
                  : "قيمة غير محددة"}{" "}
                · الموعد {promise.promiseDate || "غير محدد"} ·
                المتابعة {promise.followupDate || "غير محددة"} ·{" "}
                {promise.status === "OPEN"
                  ? "مفتوح"
                  : promise.status}{" "}
                {promise.notes || ""}
              </div>
            ))}
            {detail && (
              <div className="flex gap-2">
                <button
                  onClick={() => onExportStatement("excel")}
                  className="rounded-lg bg-emerald-700 text-white px-2 py-1"
                >
                  تصدير كشف في جدول بيانات
                </button>
                <button
                  onClick={() => onExportStatement("pdf")}
                  className="rounded-lg bg-slate-700 text-white px-2 py-1"
                >
                  طباعة / مستند
                </button>
              </div>
            )}
            {(detail?.invoices || []).map((invoice) => (
              <div
                key={invoice.id}
                className="bg-white rounded-lg border border-slate-200 p-2.5"
              >
                <div className="flex justify-between gap-2 font-bold">
                  <span>
                    فاتورة {invoice.invoiceNumber} ·{" "}
                    {invoice.date}
                  </span>
                  <span className="text-slate-700">
                    الإجمالي {fmt(invoice.total)} · مدفوع{" "}
                    {fmt(invoice.paid)} · متبقي{" "}
                    {fmt(invoice.remaining)}
                  </span>
                </div>
                <ul className="mt-1 text-slate-500">
                  {invoice.items.map((item, index) => (
                    <li key={index}>
                      {item.name} {item.sku} · {item.grade} ·{" "}
                      {item.size} — {item.quantity} {item.unit}{" "}
                      × {fmt(item.unitPrice)} · خصم{" "}
                      {fmt(item.discount)} · مرتجع{" "}
                      {fmt(item.returned)} · صافي الصنف{" "}
                      {fmt(item.total)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {(detail?.payments || []).map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center gap-2 text-slate-600"
              >
                سند {payment.receiptNumber} · {payment.date} ·{" "}
                {fmt(payment.amount)} · {payment.paymentType}{" "}
                {payment.notes || ""}
                {canReversePayments && (
                  <button
                    onClick={() => onReversePayment(payment)}
                    className="text-rose-700 underline"
                  >
                    عكس السند
                  </button>
                )}
              </div>
            ))}
            {detail && detail.invoices.length === 0 && (
              <div className="text-slate-500">
                لا توجد فواتير مسجلة؛ قد يتضمن الرصيد حركة
                مرحّلة.
              </div>
            )}
          </div>
        )}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            المبلغ المستحق
          </span>
          <span
            className={`text-sm font-black ${d.type === "CUSTOMER_RECEIVABLE" ? "text-emerald-600" : "text-rose-600"}`}
          >
            {fmt(d.amount)}
          </span>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
        <button
          onClick={onPay}
          className={`px-3 py-1.5 text-white rounded-lg text-xs font-bold transition ${d.type === "CUSTOMER_RECEIVABLE" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
        >
          {d.type === "CUSTOMER_RECEIVABLE"
            ? "تسجيل تحصيل"
            : "سداد دفعة"}
        </button>
      </div>
    </div>
  );
};
