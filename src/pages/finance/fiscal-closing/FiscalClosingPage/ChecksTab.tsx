import { Link } from 'react-router-dom';
import type { FC } from 'react';
import type { FiscalCloseCheck } from '../../../../services/domains/finance/FinancePeriodCloseService';
import type { FiscalPeriod } from '../../../../types/finance';
import { checkStatusStyle } from '../utils';

interface ChecksTabProps {
  checks: FiscalCloseCheck[];
  canManage: boolean;
  selectedPeriod: FiscalPeriod | undefined;
  onLegacyReconcile: (partyType: 'CUSTOMER' | 'SUPPLIER') => void;
}

/** Automated closing checks list with optional legacy-reconcile action. */
export const ChecksTab: FC<ChecksTabProps> = ({ checks, canManage, selectedPeriod, onLegacyReconcile }) => (
  <div className="space-y-2">
    {checks.length === 0 && <p className="text-sm text-slate-500">لا توجد فحوص متاحة.</p>}
    {checks.map((check) => {
      const style = checkStatusStyle(check.status);
      const Icon = style.icon;
      return (
        <article key={check.id} className={`rounded-xl border p-3 text-sm ${style.className}`}>
          <div className="flex flex-wrap items-center gap-2 font-bold">
            <Icon className="h-4 w-4 shrink-0" />
            <span>{check.label}</span>
            <span className="mr-auto text-xs font-semibold">{style.label}{check.issueCount ? ` · ${check.issueCount} ملاحظة` : ''}</span>
          </div>
          {check.details.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {check.details.map((detail, index) => (
                <li key={`${check.id}-${index}`} className="flex flex-wrap items-center gap-2">
                  <span>• {detail.message}</span>
                  {detail.route && (
                    <Link to={detail.route} className="font-bold underline underline-offset-2">فتح المستند</Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && selectedPeriod && check.status === 'FAIL'
            && (check.id.includes('customer_subledger') || check.id.includes('supplier_subledger'))
            && check.details.some((detail) => detail.message.includes('قبل تاريخ تغطية') || detail.message.includes('المطابقة اليدوية المسجلة'))
            && (
              <button
                type="button"
                onClick={() => {
                  const partyType = check.id.includes('customer_subledger') ? 'CUSTOMER' : 'SUPPLIER';
                  onLegacyReconcile(partyType);
                }}
                className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
              >
                تسجيل مطابقة يدوية موثقة
              </button>
            )}
        </article>
      );
    })}
  </div>
);
