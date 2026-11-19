import React from 'react';
import { ArrowRight, Calculator, Save } from 'lucide-react';
import { DataTable } from '../../../components/ui/DataTable';
import type { EstimatePayment } from '../../../types/projects/apartmentEstimate';
import { getRoomMeasures, type RoomMeasures } from '../estimateCalculations';
import { fieldClass, fmt, makeId, type Room } from './estimateModel';
import { Metric, NumberInput } from './EstimateUi';

type PaymentDraft = { date: string; amount: number; method: string; reference: string; notes: string };

export const EstimateSummarySection: React.FC<{
  rooms: Room[];
  roomTotals: { room: Room; measures: RoomMeasures; total: number }[];
  documentTerms: string;
  setDocumentTerms: React.Dispatch<React.SetStateAction<string>>;
  saving: boolean;
  contingencyPercent: number;
  setContingencyPercent: React.Dispatch<React.SetStateAction<number>>;
  taxPercent: number;
  setTaxPercent: React.Dispatch<React.SetStateAction<number>>;
  paidAmount: number;
  setPaidAmount: React.Dispatch<React.SetStateAction<number>>;
  payments: EstimatePayment[];
  setPayments: React.Dispatch<React.SetStateAction<EstimatePayment[]>>;
  paymentDraft: PaymentDraft;
  setPaymentDraft: React.Dispatch<React.SetStateAction<PaymentDraft>>;
  estimateTotal: number;
  totalCost: number;
  grossProfit: number;
  totalArea: number;
  contingencyAmount: number;
  taxAmount: number;
  grandTotal: number;
  totalPaid: number;
  remainingAmount: number;
  createQuotation: () => void;
  setDataError: React.Dispatch<React.SetStateAction<string>>;
}> = ({
  rooms, roomTotals, documentTerms, setDocumentTerms, saving,
  contingencyPercent, setContingencyPercent, taxPercent, setTaxPercent,
  paidAmount, setPaidAmount, payments, setPayments, paymentDraft, setPaymentDraft,
  estimateTotal, totalCost, grossProfit, totalArea,
  contingencyAmount, taxAmount, grandTotal, totalPaid, remainingAmount,
  createQuotation, setDataError,
}) => {
  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><Calculator className="h-5 w-5 text-emerald-700" /><h2 className="font-black text-slate-900">المقايسة النهائية حسب الغرفة</h2></div>
        <div className="overflow-x-auto">
          <DataTable
            ariaLabel="إجماليات الغرف"
            rows={roomTotals}
            rowKey={(row) => row.room.id}
            columns={[
              { key: 'room', header: 'الغرفة', render: (row) => <span className="font-bold">{row.room.name}</span> },
              { key: 'area', header: 'المساحة', render: (row) => <span>{fmt(row.measures.floor)} م²</span> },
              { key: 'walls', header: 'مساحة الحوائط', render: (row) => <span>{fmt(row.measures.walls)} م²</span> },
              { key: 'total', header: 'إجمالي الغرفة', render: (row) => <span className="font-black text-emerald-700">{fmt(row.total)} ج</span> },
            ]}
          />
          <div className="mt-2 flex justify-between rounded-lg border-t-2 border-slate-200 bg-slate-50 px-3 py-3 text-sm font-black">
            <span>إجمالي الشقة</span>
            <span>{fmt(totalArea)} م²</span>
            <span>{fmt(rooms.reduce((sum, room) => sum + getRoomMeasures(room).walls, 0))} م²</span>
            <span className="text-lg text-emerald-700">{fmt(estimateTotal)} ج</span>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-emerald-100 bg-white p-3 text-sm sm:grid-cols-3"><Metric label="تكلفة التنفيذ" value={`${fmt(totalCost)} ج`} /><Metric label="سعر البيع قبل الإضافات" value={`${fmt(estimateTotal)} ج`} /><Metric label="الربح الإجمالي وهامشه" value={`${fmt(grossProfit)} ج · ${fmt(estimateTotal ? grossProfit / estimateTotal * 100 : 0)}%`} /></div>
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl bg-emerald-700 px-4 py-3 text-white md:grid-cols-2 xl:grid-cols-5">
          <span className="font-bold">إجمالي المقايسة شامل البنود والتسعير</span>
          <span className="text-xl font-black">{fmt(estimateTotal)} ج</span>
          <NumberInput label="احتياطي / طوارئ %" value={contingencyPercent} min={0} step={0.1} onChange={setContingencyPercent} />
          <NumberInput label="ضريبة %" value={taxPercent} min={0} step={0.1} onChange={setTaxPercent} />
          <NumberInput label="مدفوع مقدمًا (ج)" value={paidAmount} min={0} step={1} onChange={setPaidAmount} />
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <label className="mb-3 block text-xs font-bold text-slate-600">الشروط والملاحظات الظاهرة للعميل<textarea value={documentTerms} onChange={(event) => setDocumentTerms(event.target.value)} rows={3} className={`${fieldClass()} mt-1 resize-y`} placeholder="اكتب مدة صلاحية العرض وشروط التنفيذ والضمان والاستثناءات" /></label>
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5"><NumberInput label="دفعة جديدة (ج)" value={paymentDraft.amount} min={0} max={remainingAmount} step={1} onChange={(amount) => setPaymentDraft((current) => ({ ...current, amount }))} /><label className="text-[10px] font-bold text-slate-500">تاريخ الدفعة<input type="date" value={paymentDraft.date} onChange={(event) => setPaymentDraft((current) => ({ ...current, date: event.target.value }))} className={`${fieldClass()} mt-1`} /></label><label className="text-[10px] font-bold text-slate-500">طريقة الدفع<input value={paymentDraft.method} onChange={(event) => setPaymentDraft((current) => ({ ...current, method: event.target.value }))} className={`${fieldClass()} mt-1`} /></label><label className="text-[10px] font-bold text-slate-500">المرجع / ملاحظة<input value={paymentDraft.reference} onChange={(event) => setPaymentDraft((current) => ({ ...current, reference: event.target.value }))} className={`${fieldClass()} mt-1`} /></label><button type="button" disabled={paymentDraft.amount <= 0 || paymentDraft.amount > remainingAmount || !paymentDraft.date || !paymentDraft.method.trim()} onClick={() => { if (paymentDraft.amount > remainingAmount) { setDataError('قيمة الدفعة تتجاوز الرصيد المتبقي.'); return; } setPayments((current) => [...current, { ...paymentDraft, id: makeId() }]); setPaymentDraft((current) => ({ ...current, amount: 0, reference: '' })); }} className="self-end rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">تسجيل الدفعة</button></div>
          <div className="space-y-1">{payments.map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><span>{payment.date} · {payment.method} · {payment.reference || 'بدون مرجع'}</span><b>{fmt(payment.amount)} ج</b><button type="button" onClick={() => setPayments((current) => current.filter((item) => item.id !== payment.id))} className="font-bold text-rose-700">حذف</button></div>)}</div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label="قيمة الاحتياطي" value={`${fmt(contingencyAmount)} ج`} />
          <Metric label="قيمة الضريبة" value={`${fmt(taxAmount)} ج`} />
          <Metric label="الإجمالي النهائي" value={`${fmt(grandTotal)} ج`} />
          <Metric label="إجمالي الدفعات المسجلة" value={`${fmt(totalPaid)} ج`} />
          <Metric label="المتبقي بعد المدفوع" value={`${fmt(remainingAmount)} ج`} />
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={createQuotation} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-emerald-800 disabled:opacity-60"><Save className="h-4 w-4" /> اعتماد كعرض سعر <ArrowRight className="h-4 w-4" /></button>
        </div>
    </section>
  );
};
