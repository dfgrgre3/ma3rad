import React from 'react';
import type { BusinessPartner, ProfitAllocation } from '../../../services/domains/customers/PartnerService';
import { formatMoney, formatNumber, type PartnerModal, type TransactionDraft } from './partnersModel';
import { Field, ModalActions, ModalShell } from './PartnerUi';

export const ProfitsModal: React.FC<{
  partners: BusinessPartner[];
  profitTotal: string;
  profitNotes: string;
  setProfitNotes: React.Dispatch<React.SetStateAction<string>>;
  allocations: ProfitAllocation[];
  transactionDraft: TransactionDraft;
  setTransactionDraft: React.Dispatch<React.SetStateAction<TransactionDraft>>;
  saving: boolean;
  setProfitAmount: (partnerId: string, value: string) => void;
  fillAutomaticShares: (value: string) => void;
  saveProfitDistribution: (event: React.FormEvent) => void;
  setModal: React.Dispatch<React.SetStateAction<PartnerModal>>;
}> = ({
  partners, profitTotal, profitNotes, setProfitNotes, allocations,
  transactionDraft, setTransactionDraft, saving,
  setProfitAmount, fillAutomaticShares, saveProfitDistribution, setModal,
}) => {
  return (
    <ModalShell title="توزيع أرباح على الشركاء" onClose={() => setModal(null)}>
          <form onSubmit={saveProfitDistribution} className="space-y-3">
            <p className="text-xs text-slate-500">يتم اقتراح التوزيع حسب نسب الملكية، ويمكن تعديل حصة أي شريك يدويًا. يجب أن يطابق مجموع الحصص إجمالي المبلغ.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="إجمالي الأرباح المراد توزيعها" required><input type="number" min="0.01" step="0.01" required value={profitTotal} onChange={(event) => fillAutomaticShares(event.target.value)} /></Field>
              <Field label="تاريخ التوزيع" required><input type="date" required value={transactionDraft.transactionDate} onChange={(event) => setTransactionDraft({ ...transactionDraft, transactionDate: event.target.value })} /></Field>
            </div>
            <Field label="ملاحظات الدفعة (اختياري)"><input value={profitNotes} onChange={(event) => setProfitNotes(event.target.value)} placeholder="مثال: أرباح الربع الأول" /></Field>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {partners.filter((partner) => partner.isActive).map((partner) => (
                <div key={partner.id} className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  <div><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{partner.name}</p><p className="text-xs text-slate-500">{formatNumber.format(partner.ownershipPercent)}%</p></div>
                  <input aria-label={`حصة أرباح ${partner.name}`} type="number" min="0" step="0.01" value={allocations.find((allocation) => allocation.partnerId === partner.id)?.amount ?? 0} onChange={(event) => setProfitAmount(partner.id, event.target.value)} />
                </div>
              ))}
            </div>
            <p className={`text-sm font-bold ${Math.abs(allocations.reduce((sum, allocation) => sum + allocation.amount, 0) - Number(profitTotal || 0)) > 0.005 ? 'text-rose-600' : 'text-emerald-700'}`}>
              مجموع الحصص: {formatMoney(allocations.reduce((sum, allocation) => sum + allocation.amount, 0))}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">سيُرفض التوزيع إذا تجاوز رصيد الأرباح المحتجزة في الحسابات.</p>
            <ModalActions onCancel={() => setModal(null)} saving={saving} submitLabel="اعتماد التوزيع" />
          </form>
    </ModalShell>
  );
};
