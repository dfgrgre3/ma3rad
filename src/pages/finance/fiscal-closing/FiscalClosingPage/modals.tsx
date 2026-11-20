import { FileCheck2, Lock, ShieldCheck, Unlock, X } from 'lucide-react';
import type { Dispatch, FC, FormEvent, SetStateAction } from 'react';
import type { FiscalCloseCheck } from '../../../../services/domains/finance/FinancePeriodCloseService';
import type { FiscalPeriod, FiscalYear } from '../../../../types/finance';
import {
  adjustmentTypeLabel,
  checkStatusStyle,
  formatDate,
  priorityLabel,
  type AdjustmentFormState,
  type LegacyReconcileFormState,
  type LegacyReconcileTarget,
  type TaskFormState,
  type YearFormState,
} from './utils';

const modalShell = 'fixed inset-0 z-50 flex items-center justify-center bg-primary/50 p-4';
const closeButton = 'rounded-lg p-2 text-muted hover:bg-surface-sunken';
const inputClass = 'mt-1.5 w-full rounded-xl border border-line-strong px-3 py-2.5';
const labelClass = 'block text-sm font-semibold text-ink';
const cancelButton = 'rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-secondary hover:bg-surface-sunken';

interface CreateYearModalProps {
  years: FiscalYear[];
  yearForm: YearFormState;
  setYearForm: Dispatch<SetStateAction<YearFormState>>;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  busy: boolean;
}

export const CreateYearModal: FC<CreateYearModalProps> = ({ years, yearForm, setYearForm, onSubmit, onClose, busy }) => (
  <div className={modalShell}>
    <section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-black text-ink">إنشاء سنة مالية</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق" className={closeButton}><X className="h-4 w-4" /></button>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>رمز السنة<input required value={yearForm.yearCode} onChange={(event) => setYearForm({ ...yearForm, yearCode: event.target.value })} className={inputClass} /></label>
          <label className={labelClass}>اسم السنة<input required value={yearForm.name} onChange={(event) => setYearForm({ ...yearForm, name: event.target.value })} className={inputClass} /></label>
          <label className={labelClass}>تاريخ البداية<input type="date" required value={yearForm.startDate} onChange={(event) => setYearForm({ ...yearForm, startDate: event.target.value })} className={inputClass} /></label>
          <label className={labelClass}>تاريخ النهاية<input type="date" required min={yearForm.startDate} value={yearForm.endDate} onChange={(event) => setYearForm({ ...yearForm, endDate: event.target.value })} className={inputClass} /></label>
          <label className={labelClass}>الشركة<input value={yearForm.companyId} onChange={(event) => setYearForm({ ...yearForm, companyId: event.target.value })} className={inputClass} /></label>
          <label className={labelClass}>العملة<input value={yearForm.currency} onChange={(event) => setYearForm({ ...yearForm, currency: event.target.value })} className={inputClass} /></label>
          <label className={labelClass}>نوع السنة
            <select value={yearForm.yearType} onChange={(event) => setYearForm({ ...yearForm, yearType: event.target.value })} className={inputClass}>
              <option value="STANDARD">قياسية (12 شهرًا)</option>
              <option value="CUSTOM">مخصصة</option>
              <option value="SHORT">سنة قصيرة</option>
              <option value="TRANSITION">فترة انتقالية</option>
            </select>
          </label>
          <label className={labelClass}>السنة السابقة
            <select value={yearForm.previousYearId} onChange={(event) => setYearForm({ ...yearForm, previousYearId: event.target.value })} className={inputClass}>
              <option value="">غير مرتبطة</option>
              {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </label>
        </div>
        <p className="rounded-xl bg-surface-muted p-3 text-xs leading-5 text-muted">
          سيتم منع إنشاء سنة متداخلة لنفس الشركة، وتوليد فترة شهرية لكل شهر داخل النطاق. يمكن إضافة فترات تسوية إضافية من طبقة الخدمة.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={cancelButton}>إلغاء</button>
          <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary disabled:opacity-50">{busy ? 'جارٍ الحفظ...' : 'إنشاء السنة والفترات'}</button>
        </div>
      </form>
    </section>
  </div>
);

interface ClosePeriodModalProps {
  period: FiscalPeriod;
  checks: FiscalCloseCheck[];
  notes: string;
  setNotes: (value: string) => void;
  canConfirm: boolean;
  onConfirm: () => void;
  onClose: () => void;
  busy: boolean;
}

export const ClosePeriodModal: FC<ClosePeriodModalProps> = ({ period, checks, notes, setNotes, canConfirm, onConfirm, onClose, busy }) => (
  <div className={modalShell}>
    <section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-accent-soft p-2.5 text-primary"><FileCheck2 className="h-5 w-5" /></div>
          <div>
            <h2 className="font-black text-ink">فحص وإقفال الفترة</h2>
            <p className="mt-1 text-sm text-muted">{period.name} · {formatDate(period.startDate)} إلى {formatDate(period.endDate)}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className={closeButton}><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-5 space-y-2">
        {checks.map((check) => {
          const style = checkStatusStyle(check.status);
          const Icon = style.icon;
          return (
            <article key={check.id} className={`rounded-xl border p-3 text-sm ${style.className}`}>
              <div className="flex items-center gap-2 font-bold">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{check.label}</span>
                <span className="mr-auto text-xs font-semibold">{style.label}{check.issueCount ? ` · ${check.issueCount}` : ''}</span>
              </div>
              {check.details.length > 0 && (
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                  {check.details.slice(0, 5).map((detail, index) => <li key={`${check.id}-${index}`}>{detail.message}</li>)}
                </ul>
              )}
            </article>
          );
        })}
      </div>

      <label className="mt-4 block text-sm font-semibold text-ink">
        ملاحظات الإقفال أو رقم محضر المطابقة
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="أضف ملاحظات أو مرجع محضر الإقفال..." className="mt-1.5 min-h-20 w-full rounded-xl border border-line-strong p-3 text-sm font-normal" />
      </label>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className={cancelButton}>إلغاء</button>
        <button type="button" onClick={onConfirm} disabled={busy || !canConfirm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40">
          <ShieldCheck className="h-4 w-4" />
          {busy ? 'جارٍ الإقفال...' : 'تأكيد إقفال الفترة'}
        </button>
      </div>
    </section>
  </div>
);

interface ReopenPeriodModalProps {
  period: FiscalPeriod;
  reason: string;
  setReason: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  busy: boolean;
}

export const ReopenPeriodModal: FC<ReopenPeriodModalProps> = ({ period, reason, setReason, onConfirm, onClose, busy }) => (
  <div className={modalShell}>
    <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-surface p-5 shadow-2xl sm:p-6">
      <div className="flex items-center gap-2">
        <Unlock className="h-5 w-5 text-warning" />
        <h2 className="font-black text-ink">إعادة فتح {period.name}</h2>
      </div>
      <p className="mt-2 text-sm text-muted">إعادة الفتح إجراء منفصل يتطلب سببًا ويسجل في سجل التدقيق.</p>
      <label className="mt-4 block text-sm font-semibold text-ink">
        سبب إعادة الفتح
        <textarea required value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 min-h-24 w-full rounded-xl border border-line-strong p-3 text-sm font-normal" />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={cancelButton}>إلغاء</button>
        <button type="button" onClick={onConfirm} disabled={busy || !reason.trim()} className="rounded-xl bg-warning px-4 py-2.5 text-sm font-bold text-white hover:bg-warning disabled:opacity-50">{busy ? 'جارٍ التنفيذ...' : 'تأكيد إعادة الفتح'}</button>
      </div>
    </section>
  </div>
);

interface CloseYearModalProps {
  year: FiscalYear;
  readiness: FiscalCloseCheck[];
  retainedEarningsAccount: string;
  setRetainedEarningsAccount: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  busy: boolean;
}

export const CloseYearModal: FC<CloseYearModalProps> = ({ year, readiness, retainedEarningsAccount, setRetainedEarningsAccount, onConfirm, onClose, busy }) => (
  <div className={modalShell}>
    <section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl sm:p-6">
      <div className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-danger" />
        <h2 className="font-black text-ink">إقفال {year.name}</h2>
      </div>
      <p className="mt-2 text-sm text-muted">سيتم تصفير الإيرادات والمصروفات، وترحيل صافي النتيجة إلى الأرباح المرحلة، ثم إنشاء أرصدة افتتاحية للسنة التالية إن وُجدت.</p>
      <div className="mt-4 space-y-2">
        {readiness.map((check) => {
          const style = checkStatusStyle(check.status);
          const Icon = style.icon;
          return (
            <article key={check.id} className={`rounded-xl border p-3 text-sm ${style.className}`}>
              <div className="flex items-center gap-2 font-bold">
                <Icon className="h-4 w-4" />
                <span>{check.label}</span>
                <span className="mr-auto text-xs">{style.label}</span>
              </div>
              {check.details.length > 0 && <p className="mt-1 text-xs">{check.details[0].message}</p>}
            </article>
          );
        })}
      </div>
      <label className="mt-4 block text-sm font-semibold text-ink">
        رمز حساب الأرباح المرحلة (يجب أن يكون حساب حقوق ملكية نشطًا)
        <input required value={retainedEarningsAccount} onChange={(event) => setRetainedEarningsAccount(event.target.value)} className={inputClass} />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={cancelButton}>إلغاء</button>
        <button type="button" onClick={onConfirm} disabled={busy || !retainedEarningsAccount.trim() || readiness.some((check) => check.status === 'FAIL')} className="rounded-xl bg-danger px-4 py-2.5 text-sm font-bold text-white hover:bg-danger disabled:opacity-50">{busy ? 'جارٍ الإقفال...' : 'تأكيد الإقفال السنوي'}</button>
      </div>
    </section>
  </div>
);

interface TaskModalProps {
  taskForm: TaskFormState;
  setTaskForm: Dispatch<SetStateAction<TaskFormState>>;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  busy: boolean;
}

export const TaskModal: FC<TaskModalProps> = ({ taskForm, setTaskForm, onSubmit, onClose, busy }) => (
  <div className={modalShell}>
    <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-surface p-5 shadow-2xl sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-black text-ink">إضافة مهمة إقفال</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق" className={closeButton}><X className="h-4 w-4" /></button>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className={labelClass}>عنوان المهمة<input required value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} className={inputClass} /></label>
        <label className={labelClass}>الوصف<textarea value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} className="mt-1.5 min-h-16 w-full rounded-xl border border-line-strong p-3 text-sm font-normal" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>القسم<input value={taskForm.department} onChange={(event) => setTaskForm({ ...taskForm, department: event.target.value })} className={inputClass} /></label>
          <label className={labelClass}>المسؤول (معرف المستخدم)<input value={taskForm.assigneeUserId} onChange={(event) => setTaskForm({ ...taskForm, assigneeUserId: event.target.value })} className={inputClass} /></label>
          <label className={labelClass}>تاريخ الاستحقاق<input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })} className={inputClass} /></label>
          <label className={labelClass}>الأولوية
            <select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value as any })} className={inputClass}>
              {Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={cancelButton}>إلغاء</button>
          <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary disabled:opacity-50">حفظ المهمة</button>
        </div>
      </form>
    </section>
  </div>
);

interface AdjustmentModalProps {
  adjustmentForm: AdjustmentFormState;
  setAdjustmentForm: Dispatch<SetStateAction<AdjustmentFormState>>;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  busy: boolean;
}

export const AdjustmentModal: FC<AdjustmentModalProps> = ({ adjustmentForm, setAdjustmentForm, onSubmit, onClose, busy }) => (
  <div className={modalShell}>
    <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-surface p-5 shadow-2xl sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-black text-ink">إنشاء تسوية شهرية</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق" className={closeButton}><X className="h-4 w-4" /></button>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className={labelClass}>نوع التسوية
          <select value={adjustmentForm.adjustmentType} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, adjustmentType: event.target.value })} className={inputClass}>
            {Object.entries(adjustmentTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className={labelClass}>الوصف<input required value={adjustmentForm.description} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, description: event.target.value })} className={inputClass} /></label>
        <label className={labelClass}>المبلغ<input required type="number" min="0.01" step="0.01" value={adjustmentForm.amount} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, amount: event.target.value })} className={inputClass} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>الحساب المدين<input required placeholder="مثال: 5201" value={adjustmentForm.debitAccountCode} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, debitAccountCode: event.target.value })} className={inputClass} /></label>
          <label className={labelClass}>الحساب الدائن<input required placeholder="مثال: 2101" value={adjustmentForm.creditAccountCode} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, creditAccountCode: event.target.value })} className={inputClass} /></label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={cancelButton}>إلغاء</button>
          <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary disabled:opacity-50">حفظ المسودة</button>
        </div>
      </form>
    </section>
  </div>
);

interface LegacyReconcileModalProps {
  target: LegacyReconcileTarget;
  form: LegacyReconcileFormState;
  setForm: Dispatch<SetStateAction<LegacyReconcileFormState>>;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  busy: boolean;
}

export const LegacyReconcileModal: FC<LegacyReconcileModalProps> = ({ target, form, setForm, onSubmit, onClose, busy }) => (
  <div className={modalShell}>
    <form onSubmit={onSubmit} className="w-full max-w-lg space-y-4 rounded-2xl bg-surface p-5 shadow-xl">
      <div>
        <h2 className="text-lg font-black text-ink">مطابقة تاريخية — {target.label}</h2>
        <p className="mt-1 text-sm leading-6 text-ink-secondary">
          أدخل رصيد دفتر الأطراف بعد مراجعته مقابل الأستاذ العام، وسجّل مرجع التقرير أو المستند المؤيد. لن تُقبل المطابقة إذا لم يتساوَ الرصيدان.
        </p>
      </div>
      <label className="block space-y-1 text-sm font-bold text-ink">
        رصيد دفتر الأطراف في نهاية الفترة
        <input
          type="number"
          step="0.01"
          required
          value={form.balance}
          onChange={(event) => setForm((current) => ({ ...current, balance: event.target.value }))}
          className="w-full rounded-lg border border-line-strong px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm font-bold text-ink">
        مرجع مستند المطابقة
        <input
          required
          value={form.evidenceReference}
          onChange={(event) => setForm((current) => ({ ...current, evidenceReference: event.target.value }))}
          className="w-full rounded-lg border border-line-strong px-3 py-2"
          placeholder="رقم تقرير أو ملف أو مستند"
        />
      </label>
      <label className="block space-y-1 text-sm font-bold text-ink">
        ملاحظات
        <textarea
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          className="w-full rounded-lg border border-line-strong px-3 py-2"
          rows={3}
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-line-strong px-4 py-2 text-sm font-bold text-ink">
          إلغاء
        </button>
        <button type="submit" disabled={busy} className="rounded-lg bg-warning px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          حفظ المطابقة
        </button>
      </div>
    </form>
  </div>
);
