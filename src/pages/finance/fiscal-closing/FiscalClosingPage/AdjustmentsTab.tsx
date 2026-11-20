import { Plus } from 'lucide-react';
import type { FC } from 'react';
import type { FinanceEnterpriseService } from '../../../../services/domains/finance/FinanceEnterpriseService';
import type { PeriodAdjustment } from '../../../../services/domains/finance/FinancePeriodCloseService';
import { adjustmentTypeLabel, formatMoney } from './utils';

type RunAction = (action: () => void, successMessage: string, closeModal?: () => void) => void;

interface AdjustmentsTabProps {
  adjustments: PeriodAdjustment[];
  canManage: boolean;
  canClose: boolean;
  service: FinanceEnterpriseService;
  runAction: RunAction;
  onNewAdjustment: () => void;
}

/** Period adjustments list with submit/approve/post workflow buttons. */
export const AdjustmentsTab: FC<AdjustmentsTabProps> = ({
  adjustments,
  canManage,
  canClose,
  service,
  runAction,
  onNewAdjustment,
}) => (
  <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {canManage && (
        <button type="button" onClick={onNewAdjustment} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary">
          <Plus className="h-4 w-4" /> تسوية جديدة
        </button>
      )}
      <span className="text-xs text-muted">تُنشأ التسويات كمسودة، ثم تُرسل للاعتماد، ثم تُرحّل كقيد محاسبي متوازن.</span>
    </div>
    {adjustments.length === 0 && <p className="text-sm text-muted">لا توجد تسويات لهذه الفترة.</p>}
    <div className="space-y-2">
      {adjustments.map((adjustment) => (
        <article key={adjustment.id} className="rounded-xl border border-line p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-bold text-ink">{adjustmentTypeLabel[adjustment.adjustmentType] || adjustment.adjustmentType}: {adjustment.description}</p>
              <p className="mt-1 text-xs text-muted">مدين {adjustment.debitAccountCode} / دائن {adjustment.creditAccountCode} · {formatMoney(adjustment.amount)}</p>
              {adjustment.journalEntryId && <p className="mt-1 text-xs text-success">قيد الترحيل: {adjustment.journalEntryId}</p>}
              {adjustment.rejectionReason && <p className="mt-1 text-xs text-danger">سبب الرفض: {adjustment.rejectionReason}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-line bg-surface-muted px-2 py-1 text-[11px] font-bold text-ink">{adjustment.status}</span>
              {canManage && adjustment.status === 'DRAFT' && (
                <button type="button" onClick={() => runAction(() => service.submitPeriodAdjustment(adjustment.id), 'تم إرسال التسوية للاعتماد.')} className="rounded-lg bg-accent-soft px-2 py-1 text-xs font-bold text-primary">إرسال</button>
              )}
              {canManage && adjustment.status === 'PENDING_APPROVAL' && (
                <button type="button" onClick={() => runAction(() => service.approvePeriodAdjustment(adjustment.id), 'تم اعتماد التسوية.')} className="rounded-lg bg-success-soft px-2 py-1 text-xs font-bold text-success">اعتماد</button>
              )}
              {canClose && adjustment.status === 'APPROVED' && (
                <button type="button" onClick={() => runAction(() => service.postPeriodAdjustment(adjustment.id), 'تم ترحيل التسوية.')} className="rounded-lg bg-accent-soft px-2 py-1 text-xs font-bold text-primary">ترحيل</button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  </div>
);
