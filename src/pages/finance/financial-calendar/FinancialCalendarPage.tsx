import React from 'react';
import { LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import FinancialEventsCalendar from './FinancialEventsCalendar';

export const FinancialCalendarPage: React.FC = () => {
  const canViewFinance = PermissionService.can(AuthService.getCurrentUser(), 'ui.finance.calendar.view');

  return (
    <div className="min-h-full space-y-4 bg-surface-muted p-4 text-ink sm:p-6">
      {canViewFinance && (
        <nav aria-label="صفحات التقويم المالي" className="flex justify-start">
          <Link
            to="/finance/fiscal-closing"
            className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm font-bold text-ink transition hover:border-accent-border hover:bg-accent-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LockKeyhole className="h-4 w-4 text-primary" />
            إدارة السنة المالية والإقفال
          </Link>
        </nav>
      )}
      <FinancialEventsCalendar />
    </div>
  );
};

export default FinancialCalendarPage;
