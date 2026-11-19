import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Plus, RefreshCw } from 'lucide-react';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { FinancialCalendarEventsService, type FinancialCalendarEvent } from '../../../services/domains/finance/FinancialCalendarEventsService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { useToast } from '../../../components/ui/Toast';
import { exportToExcel, exportToPdf } from '../../../utils/export/export';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatsCards } from './FinancialEventsCalendar/StatsCards';
import { FilterPanel } from './FinancialEventsCalendar/FilterPanel';
import { CalendarView } from './FinancialEventsCalendar/CalendarView';
import { EventFormModal } from './FinancialEventsCalendar/EventFormModal';
import { EventDetailsModal } from './FinancialEventsCalendar/EventDetailsModal';
import { PaymentModal } from './FinancialEventsCalendar/PaymentModal';
import { RescheduleModal } from './FinancialEventsCalendar/RescheduleModal';
import { AttachmentModal } from './FinancialEventsCalendar/AttachmentModal';
import {
  addDays,
  amountText,
  dateString,
  emptyForm,
  eventStatus,
  fullDate,
  isIncome,
  reportOptions,
  startOfWeek,
  typeOptions,
} from './FinancialEventsCalendar/constants';
import type {
  EventDetails,
  EventFormState,
  EventOptions,
  PaymentFormState,
  ViewMode,
} from './FinancialEventsCalendar/types';

export const FinancialEventsCalendar: React.FC = () => {
  const service = useMemo(() => new FinancialCalendarEventsService(), []);
  const toast = useToast();
  const actor = AuthService.getCurrentUser();
  const canView = Boolean(actor && PermissionService.can(actor, 'ui.finance.calendar.view'));
  const canManage = Boolean(actor && PermissionService.can(actor, 'ui.finance.calendar.approve'));
  const canExport = Boolean(actor && PermissionService.can(actor, 'ui.finance.calendar.export'));

  const [mode, setMode] = useState<ViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [events, setEvents] = useState<FinancialCalendarEvent[]>([]);
  const [reminderEvents, setReminderEvents] = useState<FinancialCalendarEvent[]>([]);
  const [options, setOptions] = useState<EventOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [partyFilter, setPartyFilter] = useState('');
  const [partyIdFilter, setPartyIdFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [search, setSearch] = useState('');
  const [reportType, setReportType] = useState('all');

  const [form, setForm] = useState<EventFormState | null>(null);
  const [details, setDetails] = useState<EventDetails | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<FinancialCalendarEvent | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>({
    amount: '',
    paymentDate: dateString(new Date()),
    reference: '',
    notes: '',
    paymentType: 'CASH' as 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE',
    registerId: '',
  });
  const [rescheduleTarget, setRescheduleTarget] = useState<FinancialCalendarEvent | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [attachmentTarget, setAttachmentTarget] = useState<FinancialCalendarEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const notifiedReminders = useRef(new Set<string>());

  const visibleRange = useMemo(() => {
    if (mode === 'day') {
      const day = dateString(anchorDate);
      return { start: day, end: day };
    }
    if (mode === 'week') {
      const start = startOfWeek(anchorDate);
      return { start: dateString(start), end: dateString(addDays(start, 6)) };
    }
    const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const start = startOfWeek(first);
    return { start: dateString(start), end: dateString(addDays(start, 41)) };
  }, [anchorDate, mode]);

  const queryRange = useMemo(() => ({
    start: dateFrom || visibleRange.start,
    end: dateTo || visibleRange.end,
  }), [dateFrom, dateTo, visibleRange.end, visibleRange.start]);

  const loadEvents = useCallback(() => {
    if (!canView) return;
    setLoading(true);
    setLoadError('');
    if (queryRange.start > queryRange.end) {
      setEvents([]);
      setLoadError('يجب أن يكون تاريخ البداية قبل تاريخ النهاية.');
      setLoading(false);
      return;
    }
    try {
      setEvents(service.getEvents(queryRange.start, queryRange.end));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تحميل الأحداث المالية.';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [canView, queryRange.end, queryRange.start, service, toast]);

  useEffect(() => {
    if (!canView) return;
    try {
      setOptions(service.getOptions());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل بيانات النموذج.');
    }
  }, [canView, service, toast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!canView) return;
    const today = new Date();
    try {
      setReminderEvents(service.getEvents(dateString(today), dateString(addDays(today, 7))));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل التذكيرات المالية.');
    }
  }, [canView, events, service, toast]);

  useEffect(() => {
    if (!canView) return undefined;
    const notifyDueEvents = () => {
      const now = new Date();
      const today = dateString(now);
      const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      const dueReminders = reminderEvents.filter((event) => {
        if (event.status === 'CANCELLED' || event.paidAmount >= event.amount) return false;
        const dueDay = Math.round((Date.parse(`${event.dueDate}T00:00:00.000Z`) - todayUtc) / 86_400_000);
        const atTime = event.reminderAt ? new Date(event.reminderAt).getTime() : Number.POSITIVE_INFINITY;
        return dueDay === 0 || event.reminderDays.includes(dueDay) || (Number.isFinite(atTime) && atTime <= now.getTime());
      });
      dueReminders.slice(0, 3).forEach((event) => {
        const key = `${event.id}:${event.dueDate}:${today}:${event.reminderAt}`;
        if (notifiedReminders.current.has(key)) return;
        notifiedReminders.current.add(key);
        const remainingDays = Math.round((Date.parse(`${event.dueDate}T00:00:00.000Z`) - todayUtc) / 86_400_000);
        toast.warning(remainingDays === 0
          ? `مستحق اليوم: ${event.title}`
          : `تذكير مالي: ${event.title} — الاستحقاق بعد ${remainingDays} يوم`);
      });
      if (dueReminders.length > 3) {
        const overflowKey = `overflow:${today}:${dueReminders.length}`;
        if (!notifiedReminders.current.has(overflowKey)) {
          notifiedReminders.current.add(overflowKey);
          toast.info(`لديك ${dueReminders.length - 3} أحداث مالية أخرى ضمن التذكيرات الحالية.`);
        }
      }
    };
    notifyDueEvents();
    // Use requestIdleCallback for non-urgent event notification if available
    const idleCallback = typeof window.requestIdleCallback !== 'undefined'
      ? window.requestIdleCallback
      : null;

    if (idleCallback) {
      const idleTimer = idleCallback(notifyDueEvents, { timeout: 60000 }); // 60 seconds
      return () => window.cancelIdleCallback(idleTimer);
    } else {
      const timer = window.setInterval(notifyDueEvents, 60_000);
      return () => window.clearInterval(timer);
    }
  }, [canView, reminderEvents, toast]);

  const filteredEvents = useMemo(() => events.filter((event) => {
    const status = eventStatus(event);
    const normalized = search.trim().toLocaleLowerCase('ar');
    const matchesSearch = !normalized || [event.title, event.partyName, event.reference, event.description]
      .some((value) => value?.toLocaleLowerCase('ar').includes(normalized));
    const matchesAmount = (!amountMin || event.amount >= Number(amountMin))
      && (!amountMax || event.amount <= Number(amountMax));
    const matchesParty = !partyFilter || event.partyType === partyFilter;
    const matchesPartyId = !partyIdFilter || event.partyId === partyIdFilter;
    const matchesStatus = selectedStatus === 'all'
      || (selectedStatus === 'partial' ? ['محصل جزئيًا', 'مدفوع جزئيًا'].includes(status.label) : status.label === selectedStatus);
    return matchesSearch
      && matchesAmount
      && matchesParty
      && matchesPartyId
      && matchesStatus
      && (!currencyFilter || event.currency === currencyFilter)
      && (!accountFilter || event.financialAccount === accountFilter)
      && (selectedType === 'all' || event.eventType === selectedType);
  }), [accountFilter, amountMax, amountMin, currencyFilter, events, partyFilter, partyIdFilter, search, selectedStatus, selectedType]);

  const reportEvents = useMemo(() => filteredEvents.filter((event) => {
    const status = eventStatus(event);
    const remaining = Math.max(0, event.amount - event.paidAmount);
    if (reportType === 'income') return isIncome(event) && event.status !== 'CANCELLED';
    if (reportType === 'expenses') return !isIncome(event) && event.status !== 'CANCELLED';
    if (reportType === 'upcoming') return event.dueDate >= dateString(new Date()) && remaining > 0 && event.status !== 'CANCELLED';
    if (reportType === 'overdue') return event.dueDate < dateString(new Date()) && remaining > 0 && event.status !== 'CANCELLED';
    if (reportType === 'customers') return event.eventType === 'CUSTOMER_INVOICE' && remaining > 0 && event.status !== 'CANCELLED';
    if (reportType === 'suppliers') return event.eventType === 'SUPPLIER_INVOICE' && remaining > 0 && event.status !== 'CANCELLED';
    return status.label !== 'ملغي' || reportType === 'all';
  }), [filteredEvents, reportType]);

  const today = dateString(new Date());
  const nextSevenDays = dateString(addDays(new Date(), 7));
  const outstandingEvents = filteredEvents.filter((event) => event.status !== 'CANCELLED' && event.amount > event.paidAmount);
  const overdueCount = outstandingEvents.filter((event) => event.dueDate < today).length;
  const upcomingCount = outstandingEvents.filter((event) => event.dueDate >= today && event.dueDate <= nextSevenDays).length;

  const calendarDays = useMemo(() => {
    if (mode === 'day') return [anchorDate];
    if (mode === 'week') {
      const first = startOfWeek(anchorDate);
      return Array.from({ length: 7 }, (_, index) => addDays(first, index));
    }
    const first = startOfWeek(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
    return Array.from({ length: 42 }, (_, index) => addDays(first, index));
  }, [anchorDate, mode]);

  const mobileAgendaDays = useMemo(() => calendarDays.filter((day) => {
    const key = dateString(day);
    const inCurrentMonth = mode !== 'month' || day.getMonth() === anchorDate.getMonth();
    return inCurrentMonth && (key === dateString(anchorDate) || filteredEvents.some((event) => event.dueDate === key));
  }), [anchorDate, calendarDays, filteredEvents, mode]);

  const goToAdjacentPeriod = (direction: number) => {
    const next = new Date(anchorDate);
    if (mode === 'month') next.setMonth(next.getMonth() + direction);
    else if (mode === 'week') next.setDate(next.getDate() + (7 * direction));
    else next.setDate(next.getDate() + direction);
    setAnchorDate(next);
  };

  const openNewEvent = (date = dateString(anchorDate)) => {
    if (!canManage) return;
    setForm(emptyForm(date));
  };

  const openEditEvent = (event: FinancialCalendarEvent) => {
    if (!canManage || event.status === 'CANCELLED') return;
    setDetails(null);
    setForm({
      id: event.id,
      title: event.title,
      eventType: event.eventType,
      amount: event.amount,
      currency: event.currency,
      dueDate: event.dueDate,
      reminderAt: event.reminderAt,
      reminderDays: event.reminderDays,
      partyType: event.partyType || 'OTHER',
      partyId: event.partyId || '',
      partyName: event.partyName || '',
      financialAccount: event.financialAccount || '',
      reference: event.reference || '',
      description: event.description || '',
    });
  };

  const openDetails = (event: FinancialCalendarEvent) => {
    try {
      setDetails(service.getEventDetails(event.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل تفاصيل الحدث.');
    }
  };

  const submitEvent = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const { id, ...input } = form;
      const savedId = service.saveEvent(input, id);
      toast.success(id ? 'تم تحديث الحدث المالي.' : 'تمت إضافة الحدث المالي.');
      setForm(null);
      loadEvents();
      setDetails(service.getEventDetails(savedId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ الحدث المالي.');
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentTarget) return;
    setBusy(true);
    try {
      service.recordPayment({
        eventId: paymentTarget.id,
        amount: Number(paymentForm.amount),
        paymentDate: paymentForm.paymentDate,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
        paymentType: paymentForm.paymentType,
        registerId: paymentForm.registerId,
      });
      toast.success(isIncome(paymentTarget) ? 'تم تسجيل التحصيل.' : 'تم تسجيل السداد.');
      setPaymentTarget(null);
      loadEvents();
      setDetails(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل العملية المالية.');
    } finally {
      setBusy(false);
    }
  };

  const submitReschedule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!rescheduleTarget) return;
    setBusy(true);
    try {
      service.reschedule(rescheduleTarget.id, rescheduleDate);
      toast.success('تم تأجيل تاريخ الاستحقاق.');
      setRescheduleTarget(null);
      setDetails(service.getEventDetails(rescheduleTarget.id));
      loadEvents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تأجيل الاستحقاق.');
    } finally {
      setBusy(false);
    }
  };

  const submitAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !attachmentTarget) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الملف يتجاوز الحد المسموح (5 ميجابايت).');
      event.target.value = '';
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('تعذر قراءة الملف.'));
        reader.onerror = () => reject(reader.error || new Error('تعذر قراءة الملف.'));
        reader.readAsDataURL(file);
      });
      service.addAttachment(attachmentTarget.id, { fileName: file.name, mimeType: file.type, dataUrl });
      toast.success('تم إرفاق المستند.');
      setDetails(service.getEventDetails(attachmentTarget.id));
      setAttachmentTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إرفاق المستند.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const cancelEvent = (event: FinancialCalendarEvent) => {
    if (!window.confirm(`هل تريد إلغاء الحدث «${event.title}»؟`)) return;
    try {
      service.cancelEvent(event.id);
      toast.success('تم إلغاء الحدث المالي.');
      setDetails(service.getEventDetails(event.id));
      loadEvents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إلغاء الحدث.');
    }
  };

  const exportReport = (format: 'excel' | 'pdf') => {
    if (!canExport) {
      toast.error('لا تملك صلاحية تصدير التقارير المالية.');
      return;
    }
    const reportTitle = reportOptions.find((item) => item.value === reportType)?.label || 'التقرير المالي';
    const exportOptions = {
      title: `التقويم المالي - ${reportTitle}`,
      subtitle: `${fullDate(queryRange.start)} - ${fullDate(queryRange.end)} · ${options?.branchName || ''}`,
      columns: [
        { key: 'title', label: 'الحدث' },
        { key: 'type', label: 'النوع' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'paid', label: 'المدفوع / المحصل', type: 'currency' },
        { key: 'remaining', label: 'المتبقي', type: 'currency' },
        { key: 'dueDate', label: 'الاستحقاق' },
        { key: 'party', label: 'الطرف المرتبط' },
        { key: 'status', label: 'الحالة' },
      ],
      rows: reportEvents.map((item) => ({
        title: item.title,
        type: typeOptions.find((type) => type.value === item.eventType)?.label || item.eventType,
        amount: amountText(item.amount, item.currency),
        paid: amountText(item.paidAmount, item.currency),
        remaining: amountText(Math.max(0, item.amount - item.paidAmount), item.currency),
        dueDate: item.dueDate,
        party: item.partyName || '—',
        status: eventStatus(item).label,
      })),
      fileName: `financial-calendar-${reportType}`,
      permission: 'finance.export',
    };
    try {
      if (format === 'excel') exportToExcel(exportOptions);
      else exportToPdf(exportOptions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تصدير التقرير.');
    }
  };

  if (!canView) return null;

  const filterPartyOptions = partyFilter === 'CUSTOMER'
    ? options?.customers || []
    : partyFilter === 'SUPPLIER'
      ? options?.suppliers || []
      : partyFilter === 'EMPLOYEE'
        ? options?.employees || []
        : [];
  const canPayEvent = (event: FinancialCalendarEvent) => event.sourceType === 'SALES_INVOICE'
    ? Boolean(actor && PermissionService.can(actor, 'customers.payment'))
    : event.sourceType === 'PURCHASE_INVOICE'
      ? Boolean(actor && PermissionService.can(actor, 'suppliers.payment'))
      : event.sourceType === 'INSTALLMENT'
        ? Boolean(actor && PermissionService.can(actor, 'finance.installments.manage'))
        : canManage;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-100/70 p-4 text-slate-900 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <PageHeader
          icon={<CalendarDays className="h-5 w-5" />}
          title="التقويم المالي"
          description={`${options?.branchName || 'مواعيد الاستحقاق والتحصيل والسداد'} · أحداثك المالية في عرض واحد`}
          actions={<>
            {canManage && (
              <button type="button" onClick={() => openNewEvent()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-cyan-800">
                <Plus className="h-4 w-4" /> حدث مالي جديد
              </button>
            )}
            <button type="button" onClick={loadEvents} disabled={loading} aria-label="تحديث الأحداث" className="rounded-xl border border-slate-300 bg-white p-2.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>}
        />
      </div>

      <StatsCards
        overdueCount={overdueCount}
        upcomingCount={upcomingCount}
        filteredEvents={filteredEvents}
      />

      <CalendarView
        mode={mode}
        anchorDate={anchorDate}
        onAnchorDateChange={setAnchorDate}
        onModeChange={setMode}
        onPrev={() => goToAdjacentPeriod(-1)}
        onNext={() => goToAdjacentPeriod(1)}
        onToday={() => setAnchorDate(new Date())}
        onSelectDay={(day) => { setAnchorDate(day); setMode('day'); }}
        calendarDays={calendarDays}
        mobileAgendaDays={mobileAgendaDays}
        filteredEvents={filteredEvents}
        todayKey={today}
        loading={loading}
        loadError={loadError}
        canManage={canManage}
        onNewEvent={openNewEvent}
        onOpenDetails={openDetails}
        filters={
          <FilterPanel
            filteredCount={filteredEvents.length}
            anchorDate={anchorDate}
            onAnchorDateChange={setAnchorDate}
            search={search}
            onSearchChange={setSearch}
            selectedType={selectedType}
            onTypeChange={setSelectedType}
            selectedStatus={selectedStatus}
            onStatusChange={setSelectedStatus}
            partyFilter={partyFilter}
            onPartyFilterChange={(value) => { setPartyFilter(value); setPartyIdFilter(''); }}
            partyIdFilter={partyIdFilter}
            onPartyIdChange={setPartyIdFilter}
            partyOptions={filterPartyOptions}
            accountFilter={accountFilter}
            onAccountChange={setAccountFilter}
            accounts={options?.accounts || []}
            currencyFilter={currencyFilter}
            onCurrencyChange={setCurrencyFilter}
            currencies={Array.from(new Set(events.map((event) => event.currency))).sort()}
            amountMin={amountMin}
            onAmountMinChange={setAmountMin}
            amountMax={amountMax}
            onAmountMaxChange={setAmountMax}
            dateFrom={dateFrom}
            onDateFromChange={setDateFrom}
            dateTo={dateTo}
            onDateToChange={setDateTo}
            onClearDateRange={() => { setDateFrom(''); setDateTo(''); }}
            reportType={reportType}
            onReportTypeChange={setReportType}
            canExport={canExport}
            onExportExcel={() => exportReport('excel')}
            onExportPdf={() => exportReport('pdf')}
          />
        }
      />

      {form && (
        <EventFormModal
          form={form}
          onChange={setForm}
          options={options}
          busy={busy}
          onSubmit={submitEvent}
          onClose={() => setForm(null)}
        />
      )}

      {details && (
        <EventDetailsModal
          details={details}
          canManage={canManage}
          canPay={canPayEvent(details.event)}
          onClose={() => setDetails(null)}
          onPay={() => {
            setPaymentTarget(details.event);
            setPaymentForm({
              amount: String(Math.max(0, details.event.amount - details.event.paidAmount)),
              paymentDate: dateString(new Date()),
              reference: '',
              notes: '',
              paymentType: 'CASH',
              registerId: options?.registers[0]?.id || '',
            });
            setDetails(null);
          }}
          onReschedule={() => { setRescheduleTarget(details.event); setRescheduleDate(details.event.dueDate); setDetails(null); }}
          onAttach={() => setAttachmentTarget(details.event)}
          onEdit={() => openEditEvent(details.event)}
          onCancel={() => cancelEvent(details.event)}
        />
      )}

      {paymentTarget && (
        <PaymentModal
          target={paymentTarget}
          form={paymentForm}
          options={options}
          busy={busy}
          onChange={setPaymentForm}
          onSubmit={submitPayment}
          onClose={() => setPaymentTarget(null)}
        />
      )}

      {rescheduleTarget && (
        <RescheduleModal
          date={rescheduleDate}
          busy={busy}
          onDateChange={setRescheduleDate}
          onSubmit={submitReschedule}
          onClose={() => setRescheduleTarget(null)}
        />
      )}

      {attachmentTarget && (
        <AttachmentModal
          busy={busy}
          onFileChange={submitAttachment}
          onClose={() => setAttachmentTarget(null)}
        />
      )}
    </section>
  );
};

export default FinancialEventsCalendar;
