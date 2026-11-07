import React from 'react';
import { LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import FinancialEventsCalendar from './FinancialEventsCalendar';

export const FinancialCalendarPage: React.FC = () => {
  const canViewFinance = PermissionService.can(AuthService.getCurrentUser(), 'ui.finance.calendar.view');

  return (
    <div className="min-h-full space-y-4 bg-slate-50 p-4 text-slate-900 sm:p-6" dir="rtl">
      {canViewFinance && (
        <nav aria-label="صفحات التقويم المالي" className="flex justify-start">
          <Link
            to="/finance/fiscal-closing"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
          >
            <LockKeyhole className="h-4 w-4 text-cyan-700" />
            إدارة السنة المالية والإقفال
          </Link>
        </nav>
      )}
      <FinancialEventsCalendar />
    </div>
  );
};

export default FinancialCalendarPage;
