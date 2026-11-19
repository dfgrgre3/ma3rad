import type {
  FinancialCalendarEvent,
  FinancialCalendarEventInput,
  FinancialCalendarEventsService,
} from '../../../../services/domains/finance/FinancialCalendarEventsService';

export type ViewMode = 'month' | 'week' | 'day';
export type PartyOption = { id: string; name: string };
export type EventOptions = {
  branchName: string;
  customers: PartyOption[];
  suppliers: PartyOption[];
  employees: PartyOption[];
  accounts: string[];
  registers: PartyOption[];
};
export type EventDetails = ReturnType<FinancialCalendarEventsService['getEventDetails']>;
export type EventFormState = FinancialCalendarEventInput & { id?: string };
export type PaymentFormState = {
  amount: string;
  paymentDate: string;
  reference: string;
  notes: string;
  paymentType: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE';
  registerId: string;
};
export type { FinancialCalendarEvent };
