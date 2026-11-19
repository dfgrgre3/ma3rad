import React from 'react';
import type { PartnerTransaction } from '../../../services/domains/customers/PartnerService';
import { TRANSACTION_LABELS, formatDate, formatMoney, type PartnerModal } from './partnersModel';
import { Field, ModalActions, ModalShell } from './PartnerUi';

export const ReversalModal: React.FC<{
  reversalTarget: PartnerTransaction;
  reversalReason: string;
  setReversalReason: React.Dispatch<React.SetStateAction<string>>;
  saving: boolean;
  saveReversal: (event: React.FormEvent) => void;
  setModal: React.Dispatch<React.SetStateAction<PartnerModal>>;
}> = ({ reversalTarget, reversalReason, setReversalReason, saving, saveReversal, setModal }) => {
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
