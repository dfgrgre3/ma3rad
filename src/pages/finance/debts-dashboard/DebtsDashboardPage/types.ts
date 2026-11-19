export type PromiseRow = {
  id: string;
  promisedAmount: number | null;
  promiseDate: string | null;
  followupDate: string | null;
  status: string;
  notes: string | null;
};

export type InvoiceItem = {
  name: string;
  sku: string;
  grade: string;
  size: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  total: number;
  returned: number;
};

export type CustomerInvoice = {
  id: string;
  invoiceNumber: string;
  date: string;
  total: number;
  paid: number;
  remaining: number;
  items: InvoiceItem[];
};

export type CustomerPayment = {
  id: string;
  invoiceId: string | null;
  paymentGroupId: string | null;
  receiptNumber: string;
  date: string;
  amount: number;
  paymentType: string;
  notes: string | null;
};

export type CustomerDetail = {
  address: string;
  invoices: CustomerInvoice[];
  payments: CustomerPayment[];
  promises: PromiseRow[];
};

export type CustomerDetails = Record<string, CustomerDetail>;

export type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  remaining: number;
};

export type SummaryState = {
  openCustomers: number;
  openInvoices: number;
  overdueInvoices: number;
  overdueInvoiceCount: number;
  pendingGoodsValue: number;
  overdueOrders: number;
  otherReceivables: number;
};

export type PromiseFormState = {
  amount: string;
  promiseDate: string;
  followupDate: string;
  notes: string;
};

export const emptyPromiseForm = (): PromiseFormState => ({
  amount: "",
  promiseDate: "",
  followupDate: "",
  notes: "",
});
