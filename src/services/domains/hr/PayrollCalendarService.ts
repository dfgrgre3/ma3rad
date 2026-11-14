import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { FinancialCalendarEventsService } from '../finance/FinancialCalendarEventsService';
import { localDateString, addLocalDays } from '../../../utils/shared/date';
import type { User } from '../../../types/auth/identity';
import type { PayrollRun, PayrollRunItem } from './EmployeeService';

import { EmployeeService } from './EmployeeService';

const PAYROLL_EVENT_TITLE = (period: string) => `صرف رواتب موظفي شهر ${period}`;

export interface PayrollCalendarEventView {
  id: string;
  period: string;
  runId: string;
  runStatus: string;
  eventId: string | null;
  dueDate: string;
  scheduledDate: string | null;
  expectedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'SCHEDULED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  isOverdue: boolean;
  employeeCount: number;
  paidEmployeeCount: number;
  missingPayments: Array<{
    employeeId: string;
    employeeName: string;
    expectedAmount: number;
    paidAmount: number;
    difference: number;
    payoutStatus: string;
  }>;
}

export interface PayrollCalendarMonthView {
  year: number;
  month: number;
  period: string;
  events: PayrollCalendarEventView[];
  totalExpected: number;
  totalPaid: number;
  totalRemaining: number;
  overdueCount: number;
  missingPaymentsCount: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class PayrollCalendarService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private financeCalendar = new FinancialCalendarEventsService();

  private requireManage(): User {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.requireAny(actor, [
      'employees.payroll.manage', 'employees.payroll.approve', 'employees.manage',
    ]);
    return actor;
  }

  private requireView(): User {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.requireAny(actor, [
      'employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve', 'employees.view',
    ]);
    return actor;
  }

  /** إنشاء أو تحديث حدث مالي في التقويم عند اعتماد دورة رواتب */
  public ensureEventForRun(runId: string): { eventId: string; created: boolean } {
    const actor = this.requireManage();
    const run = EmployeeService.getPayrollRunById(runId);
    this.branchAccess.requireBranchAccess(run.branchId, actor);

    // التحقق من وجود حدث مالي مرتبط بهذه الدورة
    const existing = this.db.query<any>(`
      SELECT id FROM financial_calendar_events
      WHERE branch_id = ? AND reference = ? AND event_type = 'PAYROLL'
    `, [run.branchId, `PAYROLL_RUN:${runId}`])[0];

    const dueDate = localDateString(addLocalDays(new Date(`${run.period}-01`), 5)); // استحقاق بعد 5 أيام من بداية الشهر
    const expectedAmount = round2(run.items.reduce((s: number, i: PayrollRunItem) => s + i.netAmount, 0));
    const paidAmount = round2(run.items.reduce((s: number, i: PayrollRunItem) => s + Number(i.paidAmount || 0), 0));

    let eventId: string;
    let created = false;

    if (existing) {
      eventId = existing.id;
      this.financeCalendar.saveEvent({
        title: PAYROLL_EVENT_TITLE(run.period),
        eventType: 'PAYROLL',
        amount: expectedAmount,
        currency: 'EGP',
        dueDate,
        reminderAt: undefined,
        reminderDays: [7, 3, 1],
        partyType: 'EMPLOYEE',
        partyId: undefined,
        partyName: `دورة رواتب ${run.period}`,
        financialAccount: undefined,
        reference: `PAYROLL_RUN:${runId}`,
        description: `صرف رواتب موظفي الفترة ${run.period} - ${run.items.length} موظف`,
      }, eventId);
    } else {
      created = true;
      eventId = this.financeCalendar.saveEvent({
        title: PAYROLL_EVENT_TITLE(run.period),
        eventType: 'PAYROLL',
        amount: expectedAmount,
        currency: 'EGP',
        dueDate,
        reminderAt: undefined,
        reminderDays: [7, 3, 1],
        partyType: 'EMPLOYEE',
        partyId: undefined,
        partyName: `دورة رواتب ${run.period}`,
        financialAccount: undefined,
        reference: `PAYROLL_RUN:${runId}`,
        description: `صرف رواتب موظفي الفترة ${run.period} - ${run.items.length} موظف`,
      });
    }

    // تحديث المبلغ المدفوع والحالة based on run status
    this.syncEventPaidAmount(eventId, paidAmount, run.status);
    return { eventId, created };
  }

  /** مزامنة المبلغ المدفوع وحالة الحدث مع دورة الرواتب */
  private syncEventPaidAmount(eventId: string, paidAmount: number, runStatus: string): void {
    const event = this.db.query<any>(`
      SELECT id, amount, paid_amount AS paidAmount, status FROM financial_calendar_events WHERE id = ?
    `, [eventId])[0];
    if (!event) return;

    let newStatus = event.status;
    if (runStatus === 'PAID' || runStatus === 'CLOSED') {
      newStatus = 'PAID';
    } else if (paidAmount > 0 && paidAmount < Number(event.amount)) {
      newStatus = 'PARTIALLY_PAID';
    } else if (paidAmount >= Number(event.amount)) {
      newStatus = 'PAID';
    }

    if (newStatus !== event.status || Math.round((paidAmount - Number(event.paidAmount)) * 100) !== 0) {
      this.db.run(
        `UPDATE financial_calendar_events SET paid_amount = ?, status = ?, updated_at = ? WHERE id = ?`,
        [round2(paidAmount), newStatus, new Date().toISOString(), eventId]
      );
    }
  }

  /** عرض التقويم الشهري لدفعات الرواتب */
  public getCalendarMonth(year: number, month: number): PayrollCalendarMonthView {
    const actor = this.requireView();
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);

    const period = `${year}-${String(month).padStart(2, '0')}`;
    const runs = EmployeeService.getAllPayrollRuns().filter((r: PayrollRun) => r.period === period);

    const events: PayrollCalendarEventView[] = [];
    let totalExpected = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let overdueCount = 0;
    let missingPaymentsCount = 0;

    const today = localDateString();

    for (const run of runs) {
      const expectedAmount = round2(run.items.reduce((s: number, i: PayrollRunItem) => s + i.netAmount, 0));
      const paidAmount = round2(run.items.reduce((s: number, i: PayrollRunItem) => s + Number(i.paidAmount || 0), 0));
      const remainingAmount = round2(expectedAmount - paidAmount);

      // تحديد حالة الصرف
      let status: PayrollCalendarEventView['status'] = 'SCHEDULED';
      let isOverdue = false;

      if (run.status === 'PAID' || run.status === 'CLOSED') {
        status = 'PAID';
      } else if (paidAmount > 0 && paidAmount < expectedAmount) {
        status = 'PARTIALLY_PAID';
      } else if (paidAmount >= expectedAmount && expectedAmount > 0) {
        status = 'PAID';
      }

      // التحقق من التأخير (تجاوز تاريخ الاستحقاق دون دفع كامل)
      const dueDate = localDateString(addLocalDays(new Date(`${period}-01`), 5));
      if ((status === 'SCHEDULED' || status === 'PARTIALLY_PAID') && dueDate < today && remainingAmount > 0.009) {
        status = 'OVERDUE';
        isOverdue = true;
      }

      // حدث مالي مرتبط
      const finEvent = this.db.query<any>(`
        SELECT id, due_date AS dueDate, status AS finStatus, paid_amount AS paidAmount
        FROM financial_calendar_events
        WHERE branch_id = ? AND reference = ? AND event_type = 'PAYROLL'
      `, [branchId, `PAYROLL_RUN:${run.id}`])[0];

      const eventDueDate = finEvent?.dueDate || dueDate;

      // الدفعات الناقصة لكل موظف
      const missingPayments = run.items
        .filter((item: PayrollRunItem) => item.netAmount > 0 && (item.payoutStatus !== 'PAID' || Math.round((Number(item.paidAmount || 0) - item.netAmount) * 100) < 0))
        .map((item: PayrollRunItem) => ({
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          expectedAmount: item.netAmount,
          paidAmount: Number(item.paidAmount || 0),
          difference: round2(item.netAmount - Number(item.paidAmount || 0)),
          payoutStatus: item.payoutStatus,
        }));

      if (missingPayments.length > 0) missingPaymentsCount += missingPayments.length;
      if (isOverdue) overdueCount += 1;

      totalExpected += expectedAmount;
      totalPaid += paidAmount;
      totalRemaining += remainingAmount;

      events.push({
        id: run.id,
        period: run.period,
        runId: run.id,
        runStatus: run.status,
        eventId: finEvent?.id ?? null,
        dueDate: eventDueDate,
        scheduledDate: run.status === 'DRAFT' ? null : (run.createdAt?.slice(0, 10) ?? null),
        expectedAmount,
        paidAmount,
        remainingAmount,
        status,
        isOverdue,
        employeeCount: run.items.length,
        paidEmployeeCount: run.items.filter((i: PayrollRunItem) => i.payoutStatus === 'PAID').length,
        missingPayments,
      });
    }

    events.sort((a: PayrollCalendarEventView, b: PayrollCalendarEventView) => a.dueDate.localeCompare(b.dueDate));

    return {
      year, month, period,
      events,
      totalExpected: round2(totalExpected),
      totalPaid: round2(totalPaid),
      totalRemaining: round2(totalRemaining),
      overdueCount,
      missingPaymentsCount,
    };
  }

  /** الأحداث المتأخرة والدفعات الناقصة عبر جميع الفترات */
  public getOverdueAndMissing(): {
    overdueEvents: PayrollCalendarEventView[];
    missingPayments: Array<{
      period: string;
      employeeId: string;
      employeeName: string;
      expectedAmount: number;
      paidAmount: number;
      difference: number;
      dueDate: string;
      daysOverdue: number;
    }>;
    totals: { expected: number; paid: number; missing: number };
  } {
    const actor = this.requireView();
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);

    const runs = EmployeeService.getAllPayrollRuns();
    const today = localDateString();

    const overdueEvents: PayrollCalendarEventView[] = [];
    const missingPayments: Array<{
      period: string;
      employeeId: string;
      employeeName: string;
      expectedAmount: number;
      paidAmount: number;
      difference: number;
      dueDate: string;
      daysOverdue: number;
    }> = [];
    let totalExpected = 0;
    let totalPaid = 0;
    let totalMissing = 0;

    for (const run of runs) {
      if (run.status === 'PAID' || run.status === 'CLOSED') continue;

      const expectedAmount = round2(run.items.reduce((s: number, i: PayrollRunItem) => s + i.netAmount, 0));
      const paidAmount = round2(run.items.reduce((s: number, i: PayrollRunItem) => s + Number(i.paidAmount || 0), 0));
      const remainingAmount = round2(expectedAmount - paidAmount);

      const dueDate = localDateString(addLocalDays(new Date(`${run.period}-01`), 5));
      const isOverdue = dueDate < today && remainingAmount > 0.009;

      if (isOverdue || remainingAmount > 0.009) {
        const _daysOverdue = dueDate < today
          ? Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${dueDate}T00:00:00Z`).getTime()) / 86_400_000)
          : 0;

        overdueEvents.push({
          id: run.id,
          period: run.period,
          runId: run.id,
          runStatus: run.status,
          eventId: null,
          dueDate,
          scheduledDate: null,
          expectedAmount,
          paidAmount,
          remainingAmount,
          status: isOverdue ? 'OVERDUE' : 'SCHEDULED',
          isOverdue,
          employeeCount: run.items.length,
          paidEmployeeCount: run.items.filter((i: PayrollRunItem) => i.payoutStatus === 'PAID').length,
          missingPayments: [],
        });

        totalExpected += expectedAmount;
        totalPaid += paidAmount;
        totalMissing += remainingAmount;
      }

      // دفعات ناقصة لكل موظف
      for (const item of run.items) {
        if (item.netAmount > 0 && item.payoutStatus !== 'PAID') {
          const difference = round2(item.netAmount - Number(item.paidAmount || 0));
          if (difference > 0.009) {
            const dueDate = localDateString(addLocalDays(new Date(`${run.period}-01`), 5));
            const daysOverdue = dueDate < today
              ? Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${dueDate}T00:00:00Z`).getTime()) / 86_400_000)
              : 0;

            missingPayments.push({
              period: run.period,
              employeeId: item.employeeId,
              employeeName: item.employeeName,
              expectedAmount: item.netAmount,
              paidAmount: Number(item.paidAmount || 0),
              difference,
              dueDate,
              daysOverdue,
            });
            totalMissing += difference;
          }
        }
      }
    }

    overdueEvents.sort((a: PayrollCalendarEventView, b: PayrollCalendarEventView) => a.dueDate.localeCompare(b.dueDate));
    missingPayments.sort((a: typeof missingPayments[0], b: typeof missingPayments[0]) => a.daysOverdue - b.daysOverdue || a.dueDate.localeCompare(b.dueDate));

    return {
      overdueEvents,
      missingPayments,
      totals: { expected: round2(totalExpected), paid: round2(totalPaid), missing: round2(totalMissing) },
    };
  }

  /** تسجيل دفعة لحدث رواتب */
  public recordPayment(input: {
    eventId: string;
    amount: number;
    paymentDate: string;
    reference?: string;
    notes?: string;
  }): void {
    const _actor = this.requireManage();
    this.financeCalendar.recordPayment({
      eventId: input.eventId,
      amount: input.amount,
      paymentDate: input.paymentDate,
      reference: input.reference,
      notes: input.notes,
    });
  }

  /** إعادة جدولة تاريخ الاستحقاق لحدث رواتب */
  public reschedule(eventId: string, dueDate: string): void {
    const _actor = this.requireManage();
    this.financeCalendar.reschedule(eventId, dueDate);
  }

  /** جلب خيارات الصرف (خزينة، حسابات بنكية) */
  public getPayoutOptions() {
    return EmployeeService.getPayrollPayoutOptions();
  }
}