import React from 'react';
import { Field, ModalActions, ModalShell } from '../PartnersPage/PartnerUi';
import { CASH_ACTIONS, TRANSACTION_LABELS, formatMoney, readPartnerAttachment } from '../PartnersPage/partnersModel';
import type { PartnerPaymentType } from '../../../../services/domains/customers/PartnerService';
import type { PartnersPageVm } from '../../../../hooks/pages/customers/partners/usePartnersPage';

export const PartnerTransactionModal: React.FC<{ vm: PartnersPageVm }> = ({ vm }) => {
  const {
    selected, action, transactionDraft, setTransactionDraft,
    registers, bankAccounts, transactionAttachments, setTransactionAttachments,
    saving, saveTransaction, setModal, toast,
  } = vm;

  if (!selected) return null;

  return (
    <ModalShell title={TRANSACTION_LABELS[action]} onClose={() => setModal(null)}>
      <form onSubmit={saveTransaction} className="space-y-3">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{selected.name}</p>
        {action === 'CAPITAL_CONTRIBUTION' && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            المتبقي غير المسدد من رأس المال المتفق عليه: {formatMoney(selected.remainingCapital)}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="المبلغ" required><input type="number" min="0.01" max={action === 'CAPITAL_CONTRIBUTION' ? selected.remainingCapital : undefined} step="0.01" required value={transactionDraft.amount} onChange={(event) => setTransactionDraft({ ...transactionDraft, amount: event.target.value })} /></Field>
          <Field label="التاريخ" required><input type="date" required value={transactionDraft.transactionDate} onChange={(event) => setTransactionDraft({ ...transactionDraft, transactionDate: event.target.value })} /></Field>
        </div>
        {CASH_ACTIONS.includes(action) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="طريقة الدفع" required>
              <select value={transactionDraft.paymentType} onChange={(event) => setTransactionDraft({ ...transactionDraft, paymentType: event.target.value as PartnerPaymentType })}>
                <option value="CASH">نقدي</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="CARD">بطاقة</option><option value="CHEQUE">شيك</option>
              </select>
            </Field>
            {transactionDraft.paymentType === 'CASH' && (
              <Field label="الخزينة" required>
                <select required value={transactionDraft.registerId} onChange={(event) => setTransactionDraft({ ...transactionDraft, registerId: event.target.value })}>
                  {registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
                </select>
              </Field>
            )}
            {transactionDraft.paymentType === 'BANK_TRANSFER' && (
              <Field label="الحساب البنكي" required>
                <select required value={transactionDraft.bankAccountId} onChange={(event) => setTransactionDraft({ ...transactionDraft, bankAccountId: event.target.value })}>
                  <option value="">اختر الحساب البنكي</option>
                  {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </Field>
            )}
          </div>
        )}
        {CASH_ACTIONS.includes(action) && transactionDraft.paymentType === 'CASH' && registers.length === 0 && (
          <p role="alert" className="text-xs font-bold text-rose-600">لا توجد خزينة نشطة متاحة في الفرع الحالي؛ اختر طريقة دفع أخرى أو فعّل خزينة.</p>
        )}
        {CASH_ACTIONS.includes(action) && transactionDraft.paymentType === 'BANK_TRANSFER' && bankAccounts.length === 0 && (
          <p role="alert" className="text-xs font-bold text-rose-600">لا يوجد حساب بنكي نشط متاح للتحصيل أو الصرف.</p>
        )}
        <Field label="رقم مرجعي (اختياري)"><input value={transactionDraft.referenceNumber} onChange={(event) => setTransactionDraft({ ...transactionDraft, referenceNumber: event.target.value })} placeholder="يُنشأ مرجع فريد تلقائيًا إذا تُرك فارغًا" /></Field>
        <Field label="البيان" required><textarea required rows={3} value={transactionDraft.description} onChange={(event) => setTransactionDraft({ ...transactionDraft, description: event.target.value })} placeholder="سبب العملية أو تفاصيلها" /></Field>
        <Field label="مرفقات إثبات الدفع (PDF / JPG / PNG، حتى 3 ملفات × 2MB)">
          <input type="file" multiple accept="application/pdf,image/jpeg,image/png"
            onChange={async (event) => {
              const files = Array.from(event.target.files || []);
              if (files.length > 3) {
                toast.error('تعذر إرفاق الملفات', 'يمكن إرفاق 3 ملفات كحد أقصى.');
                event.target.value = '';
                return;
              }
              try {
                if (files.some((file) => file.size > 2 * 1024 * 1024)) {
                  throw new Error('يجب ألا يتجاوز حجم كل مرفق 2 ميجابايت.');
                }
                setTransactionAttachments(await Promise.all(files.map(readPartnerAttachment)));
              } catch (attachmentError) {
                setTransactionAttachments([]);
                toast.error('تعذر إرفاق الملفات', attachmentError instanceof Error ? attachmentError.message : String(attachmentError));
              }
            }} />
        </Field>
        {transactionAttachments.length > 0 && (
          <p className="text-xs text-slate-500">{transactionAttachments.map((file) => file.name).join('، ')}</p>
        )}
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {action === 'PARTNER_LOAN' && 'تُسجل النقدية الداخلة من الشريك كالتزام على الشركة في حسابه الجاري.'}
          {action === 'LOAN_REPAYMENT' && 'يُخصم السداد من رصيد قروض الشريك المستحقة فقط.'}
          {action === 'PERSONAL_DRAWING' && 'تُسجل المسحوبات الشخصية على الحساب الجاري للشريك.'}
          {(action === 'ADJUSTMENT_INCREASE' || action === 'ADJUSTMENT_DECREASE') && 'تسوية رقابية لا تؤثر على الخزينة، وتُرحّل على حساب تسويات أرصدة الشركاء.'}
          {!['PARTNER_LOAN', 'LOAN_REPAYMENT', 'PERSONAL_DRAWING', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE'].includes(action) && 'سيتم حفظ الحركة في سجل الشريك وترحيل قيد محاسبي متوازن.'}
        </p>
        <ModalActions onCancel={() => setModal(null)} saving={saving} submitLabel="تسجيل وترحيل" />
      </form>
    </ModalShell>
  );
};
