import React from 'react';
import { Field, ModalActions, ModalShell } from '../PartnersPage/PartnerUi';
import { TRANSACTION_LABELS, formatDate, formatMoney } from '../PartnersPage/partnersModel';
import type { PartnersPageVm } from '../../../../hooks/pages/customers/partners/usePartnersPage';

export const PartnerReversalModal: React.FC<{ vm: PartnersPageVm }> = ({ vm }) => {
  const { reversalTarget, reversalReason, setReversalReason, saving, saveReversal, setModal } = vm;

  if (!reversalTarget) return null;

  return (
    <ModalShell title="عكس حركة شريك" onClose={() => setModal(null)}>
      <form onSubmit={saveReversal} className="space-y-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
          <p className="font-bold text-slate-800 dark:text-slate-100">{TRANSACTION_LABELS[reversalTarget.transactionType]} — {formatMoney(reversalTarget.amount)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(reversalTarget.transactionDate)} · {reversalTarget.description}</p>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-300">
          لن تُحذف الحركة الأصلية. سيُسجَّل قيد عكسي متوازن ويُربط بها في سجل التدقيق.
        </p>
        <Field label="سبب العكس" required><textarea required rows={3} value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="مثال: تسجيل مبلغ خاطئ أو حركة مكررة" /></Field>
        <ModalActions onCancel={() => setModal(null)} saving={saving} submitLabel="تأكيد العكس" />
      </form>
    </ModalShell>
  );
};
