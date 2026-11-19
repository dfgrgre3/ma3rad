import React from 'react';
import { Banknote, Paperclip } from 'lucide-react';
import { Modal } from './Modal';
import { amountText, auditLabel, eventStatus, fullDate, isIncome, typeOptions } from './constants';
import type { EventDetails } from './types';

type Props = {
  details: EventDetails;
  canManage: boolean;
  canPay: boolean;
  onClose: () => void;
  onPay: () => void;
  onReschedule: () => void;
  onAttach: () => void;
  onEdit: () => void;
  onCancel: () => void;
};

export const EventDetailsModal: React.FC<Props> = ({
  details,
  canManage,
  canPay,
  onClose,
  onPay,
  onReschedule,
  onAttach,
  onEdit,
  onCancel,
}) => (
  <Modal title="تفاصيل الحدث المالي" onClose={onClose}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900">{details.event.title}</h3>
          <p className="mt-1 text-sm text-slate-500">رقم الحدث: {details.event.id} · {details.event.reference ? `المرجع: ${details.event.reference} · ` : ''}{typeOptions.find((item) => item.value === details.event.eventType)?.label} · {details.event.branchName}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${eventStatus(details.event).color}`}>{eventStatus(details.event).label}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ['المبلغ الإجمالي', amountText(details.event.amount, details.event.currency)],
          [isIncome(details.event) ? 'المبلغ المحصل' : 'المبلغ المدفوع', amountText(details.event.paidAmount, details.event.currency)],
          ['الرصيد المتبقي', amountText(Math.max(0, details.event.amount - details.event.paidAmount), details.event.currency)],
          ['تاريخ الإنشاء', fullDate(details.event.createdAt.slice(0, 10))],
          ['تاريخ الاستحقاق', fullDate(details.event.dueDate)],
          ['الطرف المرتبط', details.event.partyName || '—'],
          ['الحساب المالي', details.event.financialAccount || '—'],
          ['الفرع / النشاط', details.event.branchName],
          ['أنشئ بواسطة', details.event.createdBy],
        ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value}</p></div>)}
      </div>
      {details.event.description && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{details.event.description}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold"><Banknote className="h-4 w-4" /> الدفعات والتحصيلات</h4>
          {details.payments.length ? details.payments.map((payment) => (
            <div key={payment.id} className="mb-1 rounded-lg border border-slate-100 p-2 text-xs">
              <span className="font-bold">{amountText(payment.amount, details.event.currency)}</span> · {payment.paymentDate} · {payment.reference || 'دون مرجع'}
              {payment.performedBy && <span className="block text-slate-500">{payment.performedBy}</span>}
            </div>
          )) : <p className="text-xs text-slate-500">لا توجد دفعات مسجلة.</p>}
        </div>
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold"><Paperclip className="h-4 w-4" /> المستندات المرفقة</h4>
          {details.attachments.length ? details.attachments.map((attachment) => (
            <a key={attachment.id} href={attachment.dataUrl} download={attachment.fileName} className="mb-1 flex items-center gap-2 rounded-lg border border-slate-100 p-2 text-xs text-cyan-800 hover:bg-cyan-50">
              <Paperclip className="h-3.5 w-3.5" />{attachment.fileName}
            </a>
          )) : <p className="text-xs text-slate-500">لا توجد مستندات مرفقة.</p>}
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-bold">سجل التعديلات والإجراءات</h4>
        <div className="max-h-32 space-y-1 overflow-y-auto">
          {details.audit.map((entry, index) => <p key={`${entry.createdAt}-${index}`} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{entry.createdAt} · {auditLabel(entry.action)} · {entry.performedBy}{entry.details ? ` · ${entry.details}` : ''}</p>)}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
        {details.event.status !== 'CANCELLED' && details.event.paidAmount < details.event.amount && canPay && (
          <>
            {canPay && <button type="button" onClick={onPay} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">{isIncome(details.event) ? 'تسجيل تحصيل' : 'تسجيل دفعة'}</button>}
            {!details.event.sourceType && canManage && <button type="button" onClick={onReschedule} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-50">تأجيل الاستحقاق</button>}
          </>
        )}
        {details.event.status !== 'CANCELLED' && canManage && !details.event.sourceType && (
          <>
            <button type="button" onClick={onAttach} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-50">إرفاق مستند</button>
            <button type="button" onClick={onEdit} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-50">تعديل</button>
            <button type="button" onClick={onCancel} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">إلغاء الحدث</button>
          </>
        )}
      </div>
    </div>
  </Modal>
);
