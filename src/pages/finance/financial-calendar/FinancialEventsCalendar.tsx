import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Banknote,
  CalendarDays,
  Clock3,
  FileText,
  Landmark,
  Paperclip,
  Plus,
  RefreshCw,
  ReceiptText,
  Search,
  Users,
  X,
} from 'lucide-react';
import { AuthService } from '../../../services/auth/AuthService';
import { FinancialCalendarEventsService, type FinancialCalendarEvent, type FinancialCalendarEventInput, type FinancialEventType, type FinancialPartyType } from '../../../services/finance/FinancialCalendarEventsService';
import { PermissionService } from '../../../services/auth/PermissionService';
import { useToast } from '../../../components/ui/Toast';
import { exportToExcel, exportToPdf } from '../../../utils/export/export';

type ViewMode = 'month' | 'week' | 'day';
type PartyOption = { id: string; name: string };
type EventOptions = {
  branchName: string;
  customers: PartyOption[];
  suppliers: PartyOption[];
  employees: PartyOption[];
  accounts: string[];
  registers: PartyOption[];
};
type EventDetails = ReturnType<FinancialCalendarEventsService['getEventDetails']>;
type EventFormState = FinancialCalendarEventInput & { id?: string };

const typeOptions: Array<{
  value: FinancialEventType;
  label: string;
  icon: typeof ArrowDown;
  color: string;
}> = [
  { value: 'INCOME', label: 'إيراد', icon: ArrowDown, color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { value: 'EXPENSE', label: 'مصروف', icon: ArrowUp, color: 'bg-rose-50 text-rose-800 border-rose-200' },
  { value: 'CUSTOMER_INVOICE', label: 'فاتورة عميل', icon: ReceiptText, color: 'bg-sky-50 text-sky-800 border-sky-200' },
  { value: 'SUPPLIER_INVOICE', label: 'فاتورة مورد', icon: FileText, color: 'bg-orange-50 text-orange-800 border-orange-200' },
  { value: 'PAYROLL', label: 'رواتب', icon: Users, color: 'bg-violet-50 text-violet-800 border-violet-200' },
  { value: 'INSTALLMENT', label: 'قسط', icon: Landmark, color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  { value: 'TAX', label: 'ضريبة', icon: FileText, color: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'CHEQUE', label: 'شيك', icon: Banknote, color: 'bg-teal-50 text-teal-800 border-teal-200' },
  { value: 'SUBSCRIPTION', label: 'اشتراك', icon: RefreshCw, color: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200' },
];

const reportOptions = [
  { value: 'all', label: 'كل الأحداث والتدفقات' },
  { value: 'income', label: 'الإيرادات المتوقعة والمحصلة' },
  { value: 'expenses', label: 'المصروفات المتوقعة والمدفوعة' },
  { value: 'upcoming', label: 'الالتزامات القادمة' },
  { value: 'overdue', label: 'الفواتير المتأخرة' },
  { value: 'customers', label: 'المستحقات على العملاء' },
  { value: 'suppliers', label: 'المستحقات للموردين' },
];

const dateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfWeek = (date: Date) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 1) % 7));
  return result;
};

const addDays = (date: Date, count: number) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + count);
  return result;
};

const monthName = (date: Date) => new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(date);
const fullDate = (value: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
const amountText = (amount: number, currency = 'EGP') => new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency,
  maximumFractionDigits: 2,
}).format(amount);

const totalsByCurrency = (events: FinancialCalendarEvent[], amount: (event: FinancialCalendarEvent) => number) => {
  const totals = new Map<string, number>();
  events.forEach((event) => totals.set(event.currency, (totals.get(event.currency) || 0) + amount(event)));
  return totals.size
    ? [...totals].map(([currency, value]) => amountText(value, currency)).join(' · ')
    : amountText(0);
};

function isIncome(event: Pick<FinancialCalendarEvent, 'eventType'>) {
  return event.eventType === 'INCOME' || event.eventType === 'CUSTOMER_INVOICE';
}

function eventStatus(event: FinancialCalendarEvent): { label: string; color: string } {
  if (event.status === 'CANCELLED') return { label: 'ملغي', color: 'bg-slate-100 text-slate-600' };
  if (event.paidAmount >= event.amount) return { label: isIncome(event) ? 'محصل' : 'مدفوع', color: 'bg-emerald-100 text-emerald-800' };
  if (event.paidAmount > 0) return { label: isIncome(event) ? 'محصل جزئيًا' : 'مدفوع جزئيًا', color: 'bg-sky-100 text-sky-800' };
  const today = dateString(new Date());
  if (event.dueDate < today) return { label: 'متأخر', color: 'bg-rose-100 text-rose-800' };
  if (event.dueDate === today) return { label: 'مستحق اليوم', color: 'bg-amber-100 text-amber-900' };
  return { label: 'مجدول', color: 'bg-slate-100 text-slate-700' };
}

const emptyForm = (date: string): EventFormState => ({
  title: '',
  eventType: 'INCOME',
  amount: 0,
  currency: 'EGP',
  dueDate: date,
  reminderAt: '',
  reminderDays: [],
  partyType: 'OTHER',
  partyId: '',
  partyName: '',
  financialAccount: '',
  reference: '',
  description: '',
});

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
  const [paymentForm, setPaymentForm] = useState({
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
    const timer = window.setInterval(notifyDueEvents, 60_000);
    return () => window.clearInterval(timer);
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

  const renderEvent = (event: FinancialCalendarEvent, compact = false) => {
    const type = typeOptions.find((item) => item.value === event.eventType) || typeOptions[0];
    const status = eventStatus(event);
    const Icon = type.icon;
    return (
      <button
        key={event.id}
        type="button"
        onClick={() => openDetails(event)}
        className={`w-full rounded-lg border p-2 text-right transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-1 ${type.color} ${compact ? 'mb-1' : ''}`}
      >
        <span className="flex items-start gap-1.5">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold">{event.title}</span>
            <span className="mt-0.5 block truncate text-[11px] opacity-80">{amountText(event.amount, event.currency)}</span>
            {!compact && <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] ${status.color}`}>{status.label}</span>}
          </span>
        </span>
      </button>
    );
  };

  const selectedPartyOptions = form?.partyType === 'CUSTOMER'
    ? options?.customers || []
    : form?.partyType === 'SUPPLIER'
      ? options?.suppliers || []
      : form?.partyType === 'EMPLOYEE'
        ? options?.employees || []
        : [];
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
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-100/70 p-4 text-slate-900 sm:p-6" dir="rtl">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm lg:flex-row lg:items-center lg:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-2.5 text-cyan-300"><CalendarDays className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-black">التقويم المالي</h1>
            <p className="mt-1 text-sm text-slate-300">{options?.branchName || 'مواعيد الاستحقاق والتحصيل والسداد'} · أحداثك المالية في عرض واحد</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button type="button" onClick={() => openNewEvent()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-cyan-800">
              <Plus className="h-4 w-4" /> حدث مالي جديد
            </button>
          )}
          <button type="button" onClick={loadEvents} disabled={loading} aria-label="تحديث الأحداث" className="rounded-xl border border-slate-600 bg-slate-800 p-2.5 text-slate-200 transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-xl border p-4 shadow-sm ${overdueCount ? 'border-rose-200 border-r-4 border-r-rose-500 bg-rose-50/70' : 'border-slate-200 border-r-4 border-r-emerald-500 bg-white'}`}>
          <p className="text-xs font-semibold text-slate-600">أحداث متأخرة غير مسددة</p>
          <p className={`mt-1 text-2xl font-black tabular-nums ${overdueCount ? 'text-rose-800' : 'text-emerald-800'}`}>{overdueCount}</p>
          <p className="mt-1 text-xs text-slate-600">{overdueCount ? 'تحتاج إلى متابعة' : 'لا توجد مستحقات متأخرة'}</p>
        </div>
        <div className="rounded-xl border border-amber-200 border-r-4 border-r-amber-500 bg-amber-50/70 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-600">استحقاقات خلال ٧ أيام</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-amber-800">{upcomingCount}</p>
          <p className="mt-1 text-xs text-slate-600">أحداث غير مسددة أو محصلة</p>
        </div>
        {[
          { label: 'الإيرادات المتوقعة', value: totalsByCurrency(filteredEvents.filter(isIncome), (event) => event.amount) },
          { label: 'المصروفات المتوقعة', value: totalsByCurrency(filteredEvents.filter((event) => !isIncome(event)), (event) => event.amount) },
          { label: 'إجمالي المحصل', value: totalsByCurrency(filteredEvents.filter(isIncome), (event) => event.paidAmount) },
          { label: 'إجمالي المدفوع', value: totalsByCurrency(filteredEvents.filter((event) => !isIncome(event)), (event) => event.paidAmount) },
        ].map((item, index) => (
          <div key={item.label} className={`min-w-0 rounded-xl border border-slate-200 border-r-4 bg-white p-4 shadow-sm ${index === 0 || index === 2 ? 'border-r-emerald-500' : 'border-r-rose-500'}`}>
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className={`mt-1 break-words text-lg font-black tabular-nums ${index === 0 || index === 2 ? 'text-emerald-700' : 'text-rose-700'}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <section aria-label="عرض التقويم المالي" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => goToAdjacentPeriod(-1)} aria-label="الفترة السابقة" className="rounded-lg border border-slate-300 p-2 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><ArrowRight className="h-4 w-4" /></button>
            <button type="button" onClick={() => setAnchorDate(new Date())} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">اليوم</button>
            <button type="button" onClick={() => goToAdjacentPeriod(1)} aria-label="الفترة التالية" className="rounded-lg border border-slate-300 p-2 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><ArrowLeft className="h-4 w-4" /></button>
            <h2 className="mr-1 min-w-36 text-lg font-black">{mode === 'day' ? fullDate(dateString(anchorDate)) : monthName(anchorDate)}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="طريقة عرض التقويم">
              {([['month', 'شهري'], ['week', 'أسبوعي'], ['day', 'يومي']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value} className={`rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${mode === value ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
              ))}
            </div>
            {mode === 'month' && (
              <>
                <select aria-label="الشهر" value={anchorDate.getMonth()} onChange={(event) => setAnchorDate(new Date(anchorDate.getFullYear(), Number(event.target.value), 1))} className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
                  {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{new Intl.DateTimeFormat('ar-EG', { month: 'long' }).format(new Date(2024, index, 1))}</option>)}
                </select>
                <select aria-label="السنة" value={anchorDate.getFullYear()} onChange={(event) => setAnchorDate(new Date(Number(event.target.value), anchorDate.getMonth(), 1))} className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
                  {Array.from({ length: 11 }, (_, index) => anchorDate.getFullYear() - 5 + index).map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800">تصفية الأحداث</h3>
            <p className="mt-0.5 text-xs text-slate-500">{filteredEvents.length} حدث ضمن الفترة والمرشحات الحالية</p>
          </div>
          <Search className="h-4 w-4 shrink-0 text-cyan-700" aria-hidden="true" />
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 text-sm font-semibold text-slate-700 xl:hidden">
          <CalendarDays className="h-4 w-4 shrink-0 text-cyan-800" />
          <span className="shrink-0">انتقل إلى يوم</span>
          <input
            aria-label="اختيار تاريخ التقويم"
            type="date"
            value={dateString(anchorDate)}
            onChange={(event) => {
              if (event.target.value) setAnchorDate(new Date(`${event.target.value}T00:00:00`));
            }}
            className="min-w-0 flex-1 rounded-lg border border-cyan-200 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
          />
        </label>
        <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالعنوان أو الطرف أو المرجع" className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-9 pl-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
          </label>
          <select aria-label="نوع الحدث" value={selectedType} onChange={(event) => setSelectedType(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
            <option value="all">كل أنواع الأحداث</option>
            {typeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <select aria-label="حالة الحدث" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
            <option value="all">كل الحالات</option>
            {['مجدول', 'مستحق اليوم', 'مدفوع', 'محصل', 'مدفوع جزئيًا', 'محصل جزئيًا', 'متأخر', 'ملغي'].map((status) => <option key={status} value={status}>{status}</option>)}
            <option value="partial">جزئيًا</option>
          </select>
          <select aria-label="نوع الطرف" value={partyFilter} onChange={(event) => { setPartyFilter(event.target.value); setPartyIdFilter(''); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
            <option value="">كل الأطراف</option>
            <option value="CUSTOMER">عميل</option><option value="SUPPLIER">مورد</option><option value="EMPLOYEE">موظف</option><option value="OTHER">أخرى</option>
          </select>
          <select aria-label="العميل أو المورد" value={partyIdFilter} onChange={(event) => setPartyIdFilter(event.target.value)} disabled={!filterPartyOptions.length} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:bg-slate-100">
            <option value="">كل الأطراف المحددة</option>
            {filterPartyOptions.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
          </select>
          <select aria-label="الحساب المالي" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
            <option value="">كل الحسابات المالية</option>
            {options?.accounts.map((account) => <option key={account} value={account}>{account}</option>)}
          </select>
          <select aria-label="العملة" value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
            <option value="">كل العملات</option>
            {Array.from(new Set(events.map((event) => event.currency))).sort().map((currency) => <option key={currency}>{currency}</option>)}
          </select>
          <div className="flex gap-2">
            <input aria-label="أقل مبلغ" type="number" min="0" value={amountMin} onChange={(event) => setAmountMin(event.target.value)} placeholder="من مبلغ" className="min-w-0 w-1/2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
            <input aria-label="أعلى مبلغ" type="number" min="0" value={amountMax} onChange={(event) => setAmountMax(event.target.value)} placeholder="إلى مبلغ" className="min-w-0 w-1/2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
          </div>
          <div className="flex gap-2">
            <input aria-label="من تاريخ" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="min-w-0 w-1/2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
            <input aria-label="إلى تاريخ" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="min-w-0 w-1/2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
          </div>
          {(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} className="justify-self-start text-xs font-semibold text-cyan-800 hover:underline">إلغاء نطاق التاريخ</button>}
          <div className="flex gap-2">
            <select aria-label="التقرير المالي" value={reportType} onChange={(event) => setReportType(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
              {reportOptions.map((report) => <option key={report.value} value={report.value}>{report.label}</option>)}
            </select>
            {canExport && (
              <>
                <button type="button" onClick={() => exportReport('excel')} title="تصدير Excel" className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">Excel</button>
                <button type="button" onClick={() => exportReport('pdf')} title="تصدير PDF" className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">PDF</button>
              </>
            )}
          </div>
        </div>

        {loadError && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-4 w-4" />{loadError}</div>}
        {mode !== 'day' ? (
          <>
            <div className="space-y-2 xl:hidden">
              {mobileAgendaDays.map((day) => {
                const key = dateString(day);
                const dayEvents = filteredEvents.filter((event) => event.dueDate === key);
                const isToday = key === today;
                return (
                  <section key={key} className={`overflow-hidden rounded-xl border ${isToday ? 'border-cyan-300 bg-cyan-50/40' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
                      <button type="button" onClick={() => { setAnchorDate(day); setMode('day'); }} className="text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
                        <span className="block text-sm font-bold text-slate-800">{fullDate(key)}{isToday ? ' · اليوم' : ''}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{dayEvents.length} أحداث</span>
                      </button>
                      {canManage && <button type="button" onClick={() => openNewEvent(key)} aria-label={`إضافة حدث بتاريخ ${key}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-200 bg-white text-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><Plus className="h-4 w-4" /></button>}
                    </div>
                    <div className="space-y-1.5 p-2.5">
                      {dayEvents.length ? dayEvents.map((event) => renderEvent(event, false)) : <p className="px-1 py-2 text-xs text-slate-500">لا توجد أحداث في هذا اليوم.</p>}
                    </div>
                  </section>
                );
              })}
              {!mobileAgendaDays.length && <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{loading ? 'جارٍ تحميل الأحداث...' : 'لا توجد أحداث مالية مطابقة للفلاتر في هذه الفترة.'}</div>}
            </div>
            <div className="hidden xl:block">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
              {(mode === 'month' ? ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'] : []).map((day) => (
                <div key={day} className="bg-slate-50 px-2 py-2 text-center text-xs font-bold text-slate-600">{day}</div>
              ))}
              {calendarDays.map((day) => {
                const key = dateString(day);
                const dayEvents = filteredEvents.filter((event) => event.dueDate === key);
                const outsideMonth = mode === 'month' && day.getMonth() !== anchorDate.getMonth();
                const isToday = key === dateString(new Date());
                const isSelectedDay = key === dateString(anchorDate);
                return (
                  <div key={key} className={`min-h-28 bg-white p-2 transition-colors hover:bg-slate-50 ${isToday ? 'bg-cyan-50/60' : ''} ${outsideMonth ? 'opacity-60' : ''}`}>
                    <div className="mb-1 flex items-center justify-between">
                      {mode === 'week' && <span className="text-[11px] font-semibold text-slate-500">{new Intl.DateTimeFormat('ar-EG', { weekday: 'short' }).format(day)}</span>}
                      <button type="button" onClick={() => { setAnchorDate(day); setMode('day'); }} aria-current={isToday ? 'date' : undefined} className={`rounded-full px-2 py-0.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${isToday ? 'bg-cyan-700 text-white' : isSelectedDay ? 'bg-cyan-100 text-cyan-900 ring-1 ring-cyan-300' : 'text-slate-600 hover:bg-slate-100'}`}>{new Intl.DateTimeFormat('ar-EG', { day: 'numeric' }).format(day)}</button>
                      {canManage && <button type="button" onClick={() => openNewEvent(key)} aria-label={`إضافة حدث بتاريخ ${key}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-cyan-50 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><Plus className="h-4 w-4" /></button>}
                    </div>
                    {dayEvents.slice(0, mode === 'week' ? 8 : 3).map((item) => renderEvent(item, mode === 'month'))}
                    {dayEvents.length > (mode === 'week' ? 8 : 3) && <button type="button" onClick={() => { setAnchorDate(day); setMode('day'); }} className="text-xs font-semibold text-cyan-700">+{dayEvents.length - (mode === 'week' ? 8 : 3)} أحداث أخرى</button>}
                  </div>
                );
              })}
            </div>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {filteredEvents.map((event) => (
              <div key={event.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-lg bg-cyan-50 p-2 text-cyan-700"><Clock3 className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <button type="button" onClick={() => openDetails(event)} className="block truncate text-right font-bold text-slate-800 hover:text-cyan-800">{event.title}</button>
                    <p className="mt-0.5 text-xs text-slate-500">{typeOptions.find((item) => item.value === event.eventType)?.label} · {event.partyName || 'دون طرف مرتبط'} · {event.reference || 'بدون مرجع'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${eventStatus(event).color}`}>{eventStatus(event).label}</span>
                  <span className="text-sm font-bold">{amountText(event.amount, event.currency)}</span>
                  <span className="text-xs text-slate-500">{event.dueDate}</span>
                </div>
              </div>
            ))}
            {!filteredEvents.length && <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">{loading ? 'جارٍ تحميل الأحداث...' : 'لا توجد أحداث مالية في هذه الفترة.'}</div>}
          </div>
        )}
        {mode !== 'day' && filteredEvents.length === 0 && <p className="hidden text-center text-sm text-slate-500 xl:block">{loading ? 'جارٍ تحميل الأحداث...' : 'لا توجد أحداث مالية مطابقة للفلاتر في هذه الفترة.'}</p>}
      </section>

      {form && (
        <Modal title={form.id ? 'تعديل حدث مالي' : 'إضافة حدث مالي'} onClose={() => setForm(null)}>
          <form onSubmit={submitEvent} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">عنوان الحدث
                <input required maxLength={150} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-semibold text-slate-700">نوع الحدث
                <select required value={form.eventType} onChange={(event) => {
                  const eventType = event.target.value as FinancialEventType;
                  const partyType = eventType === 'CUSTOMER_INVOICE' ? 'CUSTOMER'
                    : eventType === 'SUPPLIER_INVOICE' ? 'SUPPLIER'
                      : eventType === 'PAYROLL' ? 'EMPLOYEE' : form.partyType;
                  setForm({ ...form, eventType, partyType, partyId: '', partyName: '' });
                }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                  {typeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">المبلغ المالي
                <input required type="number" min="0.01" step="0.01" value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-semibold text-slate-700">العملة
                <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                  {['EGP', 'SAR', 'AED', 'USD', 'EUR', 'KWD', 'QAR'].map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">تاريخ الاستحقاق
                <input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-semibold text-slate-700">موعد التذكير
                <input type="datetime-local" value={form.reminderAt || ''} onChange={(event) => setForm({ ...form, reminderAt: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-semibold text-slate-700">تذكير قبل الاستحقاق</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {[7, 3, 1].map((days) => (
                    <label key={days} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${form.reminderDays.includes(days) ? 'border-cyan-300 bg-cyan-50 text-cyan-800' : 'border-slate-200'}`}>
                      <input type="checkbox" checked={form.reminderDays.includes(days)} onChange={(event) => setForm({ ...form, reminderDays: event.target.checked ? [...form.reminderDays, days] : form.reminderDays.filter((item) => item !== days) })} />
                      قبلها بـ {days} {days === 1 ? 'يوم' : 'أيام'}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="text-sm font-semibold text-slate-700">نوع الطرف
                <select value={form.partyType || 'OTHER'} onChange={(event) => setForm({ ...form, partyType: event.target.value as FinancialPartyType, partyId: '', partyName: '' })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                  <option value="CUSTOMER">عميل</option><option value="SUPPLIER">مورد</option><option value="EMPLOYEE">موظف</option><option value="OTHER">أخرى</option>
                </select>
              </label>
              {form.partyType !== 'OTHER' ? (
                <label className="text-sm font-semibold text-slate-700">الطرف المرتبط
                  <select value={form.partyId || ''} onChange={(event) => {
                    const selected = selectedPartyOptions.find((item) => item.id === event.target.value);
                    setForm({ ...form, partyId: selected?.id || '', partyName: selected?.name || '' });
                  }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                    <option value="">اختر الطرف</option>
                    {selectedPartyOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              ) : (
                <label className="text-sm font-semibold text-slate-700">اسم الطرف
                  <input value={form.partyName || ''} onChange={(event) => setForm({ ...form, partyName: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
                </label>
              )}
              <label className="text-sm font-semibold text-slate-700">الحساب المالي
                <input list="financial-calendar-accounts" value={form.financialAccount || ''} onChange={(event) => setForm({ ...form, financialAccount: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
                <datalist id="financial-calendar-accounts">{(options?.accounts || []).map((account) => <option key={account} value={account} />)}</datalist>
              </label>
              <label className="text-sm font-semibold text-slate-700">رقم الفاتورة أو المرجع
                <input maxLength={100} value={form.reference || ''} onChange={(event) => setForm({ ...form, reference: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">وصف الحدث
                <textarea rows={3} value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">سيُربط الحدث تلقائيًا بالنشاط/الفرع النشط: {options?.branchName || '—'}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setForm(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">إلغاء</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-800 disabled:opacity-50">{busy ? 'جارٍ الحفظ...' : 'حفظ الحدث'}</button>
            </div>
          </form>
        </Modal>
      )}

      {details && (
        <Modal title="تفاصيل الحدث المالي" onClose={() => setDetails(null)}>
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
              {details.event.status !== 'CANCELLED' && details.event.paidAmount < details.event.amount && canPayEvent(details.event) && (
                <>
                  {canPayEvent(details.event) && <button type="button" onClick={() => {
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
                  }} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">{isIncome(details.event) ? 'تسجيل تحصيل' : 'تسجيل دفعة'}</button>}
                  {!details.event.sourceType && canManage && <button type="button" onClick={() => { setRescheduleTarget(details.event); setRescheduleDate(details.event.dueDate); setDetails(null); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-50">تأجيل الاستحقاق</button>}
                </>
              )}
              {details.event.status !== 'CANCELLED' && canManage && !details.event.sourceType && (
                <>
                  <button type="button" onClick={() => setAttachmentTarget(details.event)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-50">إرفاق مستند</button>
                  <button type="button" onClick={() => openEditEvent(details.event)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-50">تعديل</button>
                  <button type="button" onClick={() => cancelEvent(details.event)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">إلغاء الحدث</button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {paymentTarget && (
        <Modal title={isIncome(paymentTarget) ? 'تسجيل تحصيل' : 'تسجيل دفعة'} onClose={() => setPaymentTarget(null)}>
          <form onSubmit={submitPayment} className="space-y-3">
            <p className="rounded-lg bg-slate-50 p-3 text-sm">الرصيد المتبقي: <strong>{amountText(paymentTarget.amount - paymentTarget.paidAmount, paymentTarget.currency)}</strong></p>
            <label className="block text-sm font-semibold">المبلغ
              <input required type="number" min="0.01" max={paymentTarget.amount - paymentTarget.paidAmount} step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            {paymentTarget.sourceType && (
              <>
                <label className="block text-sm font-semibold">طريقة الدفع
                  <select value={paymentForm.paymentType} onChange={(event) => setPaymentForm({ ...paymentForm, paymentType: event.target.value as typeof paymentForm.paymentType })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                    <option value="CASH">نقدًا</option>
                    {paymentTarget.sourceType !== 'INSTALLMENT' && <><option value="CARD">بطاقة</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="CHEQUE">شيك</option></>}
                  </select>
                </label>
                <label className="block text-sm font-semibold">الخزينة
                  <select required value={paymentForm.registerId} onChange={(event) => setPaymentForm({ ...paymentForm, registerId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                    {options?.registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
                  </select>
                </label>
              </>
            )}
            <label className="block text-sm font-semibold">تاريخ العملية
              <input required type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm({ ...paymentForm, paymentDate: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="block text-sm font-semibold">مرجع العملية
              <input value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="block text-sm font-semibold">ملاحظات
              <textarea rows={2} value={paymentForm.notes} onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPaymentTarget(null)} className="rounded-lg px-4 py-2 text-sm">إلغاء</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'جارٍ التسجيل...' : 'تأكيد العملية'}</button>
            </div>
          </form>
        </Modal>
      )}

      {rescheduleTarget && (
        <Modal title="تأجيل تاريخ الاستحقاق" onClose={() => setRescheduleTarget(null)}>
          <form onSubmit={submitReschedule} className="space-y-3">
            <label className="block text-sm font-semibold">تاريخ الاستحقاق الجديد
              <input required type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRescheduleTarget(null)} className="rounded-lg px-4 py-2 text-sm">إلغاء</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">حفظ الموعد</button>
            </div>
          </form>
        </Modal>
      )}

      {attachmentTarget && (
        <Modal title="إرفاق مستند" onClose={() => setAttachmentTarget(null)}>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 hover:border-cyan-500">
            <Paperclip className="h-6 w-6 text-cyan-700" />
            اختر صورة أو مستند (PDF، Excel، Word)، بحد أقصى 5 ميجابايت
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={submitAttachment} disabled={busy} className="sr-only" />
          </label>
        </Modal>
      )}
    </section>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      {children}
    </section>
  </div>
);

function auditLabel(action: string): string {
  const labels: Record<string, string> = {
    CREATE: 'إنشاء الحدث',
    UPDATE: 'تعديل الحدث',
    PAYMENT: 'تسجيل دفعة أو تحصيل',
    RESCHEDULE: 'تأجيل الاستحقاق',
    CANCEL: 'إلغاء الحدث',
    ATTACHMENT: 'إرفاق مستند',
  };
  return labels[action] || action;
}

export default FinancialEventsCalendar;
