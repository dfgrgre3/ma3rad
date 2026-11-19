// Billing endpoints: subscriptions, invoices and payments.
import type { PlatformAdminApiCore } from './core';
import { CentralApiError, mapCentralInvoice, mapCentralPayment, toNumber } from './core';
import type {
  PlatformSubscription,
  PlatformInvoice,
  PlatformInvoiceInput,
  PlatformInvoiceStatus,
  PlatformPayment,
  PlatformPaymentInput,
} from '../platformTypes';

export interface BillingApi {
  listSubscriptions(this: PlatformAdminApiCore, filters?: { status?: string; planId?: string; search?: string }): Promise<PlatformSubscription[]>;
  renewSubscription(this: PlatformAdminApiCore, tenantId: string, months: number): Promise<any>;
  cancelSubscription(this: PlatformAdminApiCore, tenantId: string, reason?: string): Promise<any>;
  changeSubscriptionPlan(this: PlatformAdminApiCore, tenantId: string, planId: string, options?: { months?: number; seats?: number; reason?: string }): Promise<any>;
  listInvoices(this: PlatformAdminApiCore, filters?: { search?: string; status?: string; tenantId?: string }): Promise<PlatformInvoice[]>;
  getInvoice(this: PlatformAdminApiCore, id: string): Promise<PlatformInvoice | null>;
  createInvoice(this: PlatformAdminApiCore, input: PlatformInvoiceInput, number?: string): Promise<PlatformInvoice>;
  setInvoiceStatus(this: PlatformAdminApiCore, id: string, status: PlatformInvoiceStatus): Promise<PlatformInvoice>;
  voidInvoice(this: PlatformAdminApiCore, id: string): Promise<PlatformInvoice>;
  listPayments(this: PlatformAdminApiCore, filters?: { tenantId?: string; invoiceId?: string; limit?: number }): Promise<PlatformPayment[]>;
  addPayment(this: PlatformAdminApiCore, input: PlatformPaymentInput): Promise<PlatformPayment>;
  voidPayment(this: PlatformAdminApiCore, id: string): Promise<void>;
  createPayment(this: PlatformAdminApiCore, input: { tenantId: string; invoiceId?: string; amount: number; method?: string; reference?: string; notes?: string }): Promise<any>;
}

export function createBillingApi(): BillingApi {
  return {
    // ── Subscriptions ──────────────────────────────────────────────────────────

    async listSubscriptions(this: PlatformAdminApiCore, filters: { status?: string; planId?: string; search?: string } = {}) {
      const params: Record<string, string> = {};
      if (filters.status) params.status = filters.status;
      if (filters.planId) params.planId = filters.planId;
      if (filters.search) params.search = filters.search;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({ path: `/api/v1/admin/subscriptions${qs ? `?${qs}` : ''}`, method: 'GET' });
      return (Array.isArray(rows) ? rows : []).map((row: any) => ({
        id: String(row.id),
        tenantId: String(row.tenantId ?? row.tenant_id),
        tenantName: row.tenantName ?? row.tenant_name ?? null,
        planId: String(row.planId ?? row.plan_id),
        planName: row.planName ?? row.plan_name ?? null,
        status: String(row.status) as PlatformSubscription['status'],
        startDate: String(row.startDate ?? row.start_date),
        endDate: row.endDate ?? row.end_date ?? null,
        seats: toNumber(row.seats, 1),
        price: toNumber(row.price, 0) / 100,
        discount: toNumber(row.discount, 0) / 100,
        billingCycle: String(row.billingCycle ?? row.billing_cycle) as PlatformSubscription['billingCycle'],
        autoRenew: Boolean(row.autoRenew ?? row.auto_renew),
        branchesLimit: toNumber(row.branchesLimit ?? row.branches_limit, 1),
        createdAt: String(row.createdAt ?? row.created_at ?? ''),
        updatedAt: String(row.updatedAt ?? row.updated_at ?? ''),
      }));
    },

    async renewSubscription(this: PlatformAdminApiCore, tenantId: string, months: number) {
      return this.request<any>({
        path: `/api/v1/admin/subscriptions/${encodeURIComponent(tenantId)}/renew`,
        method: 'POST',
        body: { months },
      });
    },

    async cancelSubscription(this: PlatformAdminApiCore, tenantId: string, reason?: string) {
      return this.request<any>({
        path: `/api/v1/admin/subscriptions/${encodeURIComponent(tenantId)}/cancel`,
        method: 'POST',
        body: { reason },
      });
    },

    async changeSubscriptionPlan(
      this: PlatformAdminApiCore,
      tenantId: string,
      planId: string,
      options: { months?: number; seats?: number; reason?: string } = {}
    ) {
      return this.request<any>({
        path: `/api/v1/admin/subscriptions/${encodeURIComponent(tenantId)}/change-plan`,
        method: 'POST',
        body: { planId, months: options.months, seats: options.seats, reason: options.reason },
      });
    },

    // ── Billing: invoices & payments ──────────────────────────────────────────

    async listInvoices(this: PlatformAdminApiCore, filters: { search?: string; status?: string; tenantId?: string } = {}) {
      const params: Record<string, string> = {};
      if (filters.search) params.search = filters.search;
      if (filters.status) params.status = filters.status;
      if (filters.tenantId) params.tenantId = filters.tenantId;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({
        path: `/api/v1/admin/billing/invoices${qs ? `?${qs}` : ''}`,
        method: 'GET',
      });
      return (Array.isArray(rows) ? rows : []).map(mapCentralInvoice);
    },

    async getInvoice(this: PlatformAdminApiCore, id: string) {
      const row = await this.request<any>({
        path: `/api/v1/admin/billing/invoices/${encodeURIComponent(id)}`,
        method: 'GET',
      });
      return row ? mapCentralInvoice(row) : null;
    },

    async createInvoice(this: PlatformAdminApiCore, input: PlatformInvoiceInput, number?: string) {
      const payload = {
        tenantId: input.tenantId,
        number: number || `INV-${Date.now()}`,
        subscriptionId: input.subscriptionId ?? null,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        status: input.status ?? 'DRAFT',
        discount: input.discount ?? 0,
        tax: input.tax ?? 0,
        notes: input.notes ?? null,
        items: input.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      };
      const row = await this.request<any>({
        path: '/api/v1/admin/billing/invoices',
        method: 'POST',
        body: payload,
      });
      return mapCentralInvoice(row);
    },

    async setInvoiceStatus(this: PlatformAdminApiCore, id: string, status: PlatformInvoiceStatus) {
      const row = await this.request<any>({
        path: `/api/v1/admin/billing/invoices/${encodeURIComponent(id)}/status`,
        method: 'POST',
        body: { status },
      });
      return mapCentralInvoice(row);
    },

    async voidInvoice(this: PlatformAdminApiCore, id: string) {
      const row = await this.request<any>({
        path: `/api/v1/admin/billing/invoices/${encodeURIComponent(id)}/void`,
        method: 'POST',
        body: {},
      });
      return mapCentralInvoice(row);
    },

    async listPayments(this: PlatformAdminApiCore, filters: { tenantId?: string; invoiceId?: string; limit?: number } = {}) {
      const params: Record<string, string> = {};
      if (filters.tenantId) params.tenantId = filters.tenantId;
      if (filters.invoiceId) params.invoiceId = filters.invoiceId;
      if (filters.limit) params.limit = String(filters.limit);
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({
        path: `/api/v1/admin/billing/payments${qs ? `?${qs}` : ''}`,
        method: 'GET',
      });
      return (Array.isArray(rows) ? rows : []).map(mapCentralPayment);
    },

    async addPayment(this: PlatformAdminApiCore, input: PlatformPaymentInput) {
      const row = await this.request<any>({
        path: '/api/v1/admin/billing/payments',
        method: 'POST',
        body: {
          tenantId: input.tenantId,
          invoiceId: input.invoiceId ?? null,
          amount: input.amount,
          method: input.method ?? 'CASH',
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          paidAt: input.paidAt ?? null,
        },
      });
      return mapCentralPayment(row);
    },

    async voidPayment(this: PlatformAdminApiCore, id: string) {
      await this.request<any>({
        path: `/api/v1/admin/billing/payments/${encodeURIComponent(id)}`,
        method: 'DELETE',
      });
    },

    async createPayment(this: PlatformAdminApiCore, input: { tenantId: string; invoiceId?: string; amount: number; method?: string; reference?: string; notes?: string }) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/billing/payments', method: 'POST', body: input });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },
  };
}
