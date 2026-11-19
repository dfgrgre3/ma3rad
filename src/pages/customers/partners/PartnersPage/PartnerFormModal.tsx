import React from 'react';
import type {
  BusinessPartner, PartnerBankAccount, PartnerDraft, PartnerPaymentType,
} from '../../../services/domains/customers/PartnerService';
import {
  formatMoney, formatNumber, today,
  type InitialPaymentStatus, type PartnerModal,
} from './partnersModel';
import { Field, ModalActions, ModalShell } from './PartnerUi';

export const PartnerFormModal: React.FC<{
  editingPartner: BusinessPartner | null;
  partnerDraft: PartnerDraft;
  setPartnerDraft: React.Dispatch<React.SetStateAction<PartnerDraft>>;
  initialPaymentStatus: InitialPaymentStatus;
  setInitialPaymentStatus: React.Dispatch<React.SetStateAction<InitialPaymentStatus>>;
  canTransact: boolean;
  registers: Array<{ id: string; name: string }>;
  bankAccounts: PartnerBankAccount[];
  saving: boolean;
  activeOwnership: number;
  ownershipPreview: number;
  savePartner: (event: React.FormEvent) => void;
  setModal: React.Dispatch<React.SetStateAction<PartnerModal>>;
}> = ({
  editingPartner, partnerDraft, setPartnerDraft,
  initialPaymentStatus, setInitialPaymentStatus,
  canTransact, registers, bankAccounts, saving,
  activeOwnership, ownershipPreview, savePartner, setModal,
}) => {
  return (
    <ModalShell title={editingPartner ? 'تعديل بيانات الشريك' : 'إضافة شريك جديد'} onClose={() => setModal(null)}>
          <form onSubmit={savePartner} className="space-y-3">
            <Field label="اسم الشريك" required><input required value={partnerDraft.name} onChange={(event) => setPartnerDraft({ ...partnerDraft, name: event.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="رقم الهاتف"><input value={partnerDraft.phone || ''} onChange={(event) => setPartnerDraft({ ...partnerDraft, phone: event.target.value })} /></Field>
              <Field label="البريد الإلكتروني"><input type="email" value={partnerDraft.email || ''} onChange={(event) => setPartnerDraft({ ...partnerDraft, email: event.target.value })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="أساس حساب الملكية">
                <select value={partnerDraft.ownershipBasis || 'AGREED_CAPITAL'} onChange={(event) => setPartnerDraft({
                  ...partnerDraft, ownershipBasis: event.target.value as PartnerDraft['ownershipBasis'],
                })}>
                  <option value="AGREED_CAPITAL">رأس المال المتفق عليه</option>
                  <option value="PAID_CONTRIBUTIONS">المساهمات الفعلية المسددة</option>
                </select>
              </Field>
              <Field label="طريقة تحديد الملكية">
                <select value={partnerDraft.ownershipMode || 'AUTO'} onChange={(event) => setPartnerDraft({
                  ...partnerDraft, ownershipMode: event.target.value as PartnerDraft['ownershipMode'],
                })}>
                  <option value="AUTO">حساب تلقائي وإعادة توزيع النسب</option>
                  <option value="MANUAL">إدخال يدوي</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="رأس المال المتفق عليه">
                <input type="number" min="0" step="0.01" value={partnerDraft.capitalAmount}
                  onChange={(event) => {
                    const capitalAmount = Number(event.target.value);
                    const paymentStatus = (initialPaymentStatus === 'PARTIAL' && capitalAmount < 0.02)
                      || ((initialPaymentStatus === 'FULL' || initialPaymentStatus === 'CUSTOM') && capitalAmount <= 0)
                      ? 'UNPAID'
                      : initialPaymentStatus;
                    const maxPaidAmount = initialPaymentStatus === 'PARTIAL'
                      ? Math.max(0, capitalAmount - 0.01)
                      : capitalAmount;
                    setInitialPaymentStatus(paymentStatus);
                    setPartnerDraft({
                      ...partnerDraft,
                      capitalAmount,
                      initialPaidAmount: paymentStatus === 'FULL'
                        ? capitalAmount
                        : Math.min(Number(partnerDraft.initialPaidAmount || 0), maxPaidAmount),
                    });
                  }} />
              </Field>
              <Field label="نسبة الملكية (%)" required>
                <input type="number" min="0" max="100" step="0.01" required
                  disabled={partnerDraft.ownershipMode !== 'MANUAL'}
                  value={partnerDraft.ownershipMode === 'AUTO' ? ownershipPreview : partnerDraft.ownershipPercent}
                  onChange={(event) => setPartnerDraft({ ...partnerDraft, ownershipPercent: Number(event.target.value) })} />
              </Field>
            </div>
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
              {partnerDraft.ownershipMode === 'AUTO'
                ? `النسبة المتوقعة لهذا الشريك ${formatNumber.format(ownershipPreview)}%. عند الحفظ تُعاد موازنة نسب الشركاء النشطين وتُحفظ التغييرات بتاريخ وسبب.`
                : 'النسب اليدوية لا تتجاوز 100% إجمالًا، وتُحفظ تغييراتها في سجل تاريخي.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نسبة المشاركة في الأرباح (%)">
                <input type="number" min="0" max="100" step="0.01"
                  value={partnerDraft.profitSharePercent ?? ownershipPreview}
                  onChange={(event) => setPartnerDraft({ ...partnerDraft, profitSharePercent: Number(event.target.value) })} />
              </Field>
              <Field label="تاريخ سريان التغيير" required>
                <input type="date" required value={partnerDraft.ownershipEffectiveDate || today()}
                  onChange={(event) => setPartnerDraft({
                    ...partnerDraft, ownershipEffectiveDate: event.target.value,
                    capitalEffectiveDate: event.target.value,
                  })} />
              </Field>
            </div>
            {!editingPartner && canTransact && (
              <>
                <Field label="حالة سداد رأس المال">
                  <select value={initialPaymentStatus} onChange={(event) => {
                    const status = event.target.value as InitialPaymentStatus;
                    const capitalAmount = Number(partnerDraft.capitalAmount || 0);
                    setInitialPaymentStatus(status);
                    setPartnerDraft({
                      ...partnerDraft,
                      initialPaidAmount: status === 'UNPAID'
                        ? 0
                        : status === 'FULL'
                          ? capitalAmount
                          : status === 'PARTIAL'
                            ? Math.max(0, Math.min(Math.round(capitalAmount * 50) / 100, capitalAmount - 0.01))
                            : 0,
                    });
                  }}>
                    <option value="UNPAID">لم يسدد شيئًا</option>
                    <option value="PARTIAL" disabled={Number(partnerDraft.capitalAmount) < 0.02}>سدد جزءًا من المبلغ</option>
                    <option value="FULL" disabled={Number(partnerDraft.capitalAmount) <= 0}>سدد كامل المبلغ</option>
                    <option value="CUSTOM" disabled={Number(partnerDraft.capitalAmount) <= 0}>تحديد مبلغ آخر</option>
                  </select>
                </Field>
                {(initialPaymentStatus === 'PARTIAL' || initialPaymentStatus === 'CUSTOM') && (
                  <Field label={initialPaymentStatus === 'PARTIAL' ? 'قيمة الجزء المسدد' : 'المبلغ المسدد'} required>
                    <input type="number" min="0.01"
                      max={initialPaymentStatus === 'PARTIAL'
                        ? Math.max(0, Number(partnerDraft.capitalAmount) - 0.01)
                        : partnerDraft.capitalAmount}
                      step="0.01" required
                      value={partnerDraft.initialPaidAmount || ''}
                      onChange={(event) => setPartnerDraft({
                        ...partnerDraft, initialPaidAmount: Number(event.target.value),
                      })} />
                  </Field>
                )}
                {Number(partnerDraft.initialPaidAmount || 0) > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="طريقة استلام المساهمة" required>
                      <select value={partnerDraft.initialPaymentType || 'CASH'}
                        onChange={(event) => setPartnerDraft({
                          ...partnerDraft, initialPaymentType: event.target.value as PartnerPaymentType,
                        })}>
                        <option value="CASH">نقدي</option><option value="BANK_TRANSFER">تحويل بنكي</option>
                        <option value="CARD">بطاقة</option><option value="CHEQUE">شيك</option>
                      </select>
                    </Field>
                    {partnerDraft.initialPaymentType === 'CASH' ? (
                      <Field label="الخزينة المستلمة" required>
                        <select required value={partnerDraft.initialRegisterId || ''} onChange={(event) => setPartnerDraft({ ...partnerDraft, initialRegisterId: event.target.value })}>
                          <option value="">اختر الخزينة</option>
                          {registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
                        </select>
                      </Field>
                    ) : partnerDraft.initialPaymentType === 'BANK_TRANSFER' ? (
                      <Field label="الحساب البنكي المستلم" required>
                        <select required value={partnerDraft.initialBankAccountId || ''} onChange={(event) => setPartnerDraft({ ...partnerDraft, initialBankAccountId: event.target.value })}>
                          <option value="">اختر الحساب البنكي</option>
                          {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                        </select>
                      </Field>
                    ) : <span className="self-center text-xs text-slate-500">سيُسجل المبلغ دون تعديل رصيد الخزينة.</span>}
                  </div>
                )}
                {Number(partnerDraft.initialPaidAmount || 0) > 0
                  && partnerDraft.initialPaymentType === 'BANK_TRANSFER' && bankAccounts.length === 0 && (
                    <p role="alert" className="text-xs font-bold text-rose-600">لا يوجد حساب بنكي نشط متاح للتحصيل.</p>
                  )}
              </>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="سبب التغيير" required>
                <input required value={partnerDraft.ownershipChangeReason || ''} onChange={(event) => setPartnerDraft({
                  ...partnerDraft, ownershipChangeReason: event.target.value,
                  profitShareChangeReason: event.target.value, capitalChangeReason: event.target.value,
                })} placeholder="مثال: إضافة شريك وتعديل نسب الملكية" />
              </Field>
              <Field label="ملاحظات"><input value={partnerDraft.notes || ''} onChange={(event) => setPartnerDraft({ ...partnerDraft, notes: event.target.value })} /></Field>
            </div>
            {editingPartner && (
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={partnerDraft.isActive !== false} onChange={(event) => setPartnerDraft({ ...partnerDraft, isActive: event.target.checked })} />
                شريك نشط
              </label>
            )}
            <p className="text-xs text-slate-500">
              مجموع نسب الشركاء النشطين حاليًا: {formatNumber.format(activeOwnership)}% (الحد الأقصى 100%).
              {' '}المدفوع من هذا الشريك: {formatMoney(editingPartner?.capitalContributions || 0)}.
              {editingPartner && Math.abs(editingPartner.netBalance) > 0.005 && ' لا يمكن إيقاف الشريك قبل تسوية رصيده.'}
            </p>
            <ModalActions onCancel={() => setModal(null)} saving={saving} submitLabel={editingPartner ? 'حفظ التعديلات' : 'إضافة الشريك'} />
          </form>
    </ModalShell>
  );
};
