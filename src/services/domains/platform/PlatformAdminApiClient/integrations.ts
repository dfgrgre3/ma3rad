// Integration endpoints: outbound webhooks and payment/SMS provider config.
import type { PlatformAdminApiCore } from './core';
import { CentralApiError, safeJsonArray } from './core';
import type {
  CentralWebhookRow,
  CentralIntegrationProviderRow,
  CentralIntegrationProviders,
  CentralMutationResult,
} from './centralTypes';

export interface IntegrationApi {
  listWebhooks(this: PlatformAdminApiCore): Promise<Array<{
    id: string; name: string; url: string; events: string[]; secret: string;
    isActive: boolean; createdAt: string; updatedAt: string;
  }>>;
  createWebhook(this: PlatformAdminApiCore, input: { name: string; url: string; events?: string[]; secret?: string; isActive?: boolean }): Promise<CentralWebhookRow>;
  updateWebhook(this: PlatformAdminApiCore, id: string, input: { name?: string; url?: string; events?: string[]; secret?: string; isActive?: boolean }): Promise<CentralWebhookRow>;
  deleteWebhook(this: PlatformAdminApiCore, id: string): Promise<void>;
  testWebhook(this: PlatformAdminApiCore, id: string): Promise<{ webhookId: string; url: string; status: string; httpStatus?: number | null; error?: string | null; sentAt: string }>;
  listIntegrationProviders(this: PlatformAdminApiCore): Promise<CentralIntegrationProviders>;
  updateIntegrationProvider(this: PlatformAdminApiCore, input: {
    type: 'payment' | 'sms';
    providerCode: string;
    providerName?: string;
    isEnabled?: boolean;
    config?: any;
    senderId?: string;
    dailyQuota?: number;
  }): Promise<CentralIntegrationProviderRow | CentralIntegrationProviders | Record<string, any>>;
}

export function createIntegrationApi(): IntegrationApi {
  return {
    // ── Webhooks / Integrations ────────────────────────────────────────────────

    async listWebhooks(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralWebhookRow[]>({ path: '/api/v1/admin/integrations/webhooks', method: 'GET' });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const rows = Array.isArray(envelope.data) ? envelope.data : [];
      return rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        url: String(row.url),
        events: safeJsonArray(row.events),
        secret: String(row.secret || ''),
        isActive: Boolean(row.is_active),
        createdAt: String(row.created_at || row.createdAt || ''),
        updatedAt: String(row.updated_at || row.updatedAt || ''),
      }));
    },

    async createWebhook(this: PlatformAdminApiCore, input: { name: string; url: string; events?: string[]; secret?: string; isActive?: boolean }) {
      const envelope = await this.requestEnvelope<CentralWebhookRow>({
        path: '/api/v1/admin/integrations/webhooks',
        method: 'POST',
        body: { name: input.name, url: input.url, events: input.events || [], secret: input.secret || null, isActive: input.isActive !== false },
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return envelope.data as CentralWebhookRow;
    },

    async updateWebhook(this: PlatformAdminApiCore, id: string, input: { name?: string; url?: string; events?: string[]; secret?: string; isActive?: boolean }) {
      const envelope = await this.requestEnvelope<CentralWebhookRow>({
        path: `/api/v1/admin/integrations/webhooks/${encodeURIComponent(id)}`,
        method: 'PUT',
        body: { name: input.name, url: input.url, events: input.events, secret: input.secret, isActive: input.isActive },
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return envelope.data as CentralWebhookRow;
    },

    async deleteWebhook(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<CentralMutationResult>({ path: `/api/v1/admin/integrations/webhooks/${encodeURIComponent(id)}`, method: 'DELETE' });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
    },

    async testWebhook(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<{
        webhookId?: string;
        url?: string;
        status?: string;
        httpStatus?: number | null;
        error?: string | null;
        sentAt?: string;
      }>({
        path: `/api/v1/admin/integrations/webhooks/${encodeURIComponent(id)}/test`,
        method: 'POST',
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const data = envelope.data || {};
      return {
        webhookId: String(data.webhookId || id),
        url: String(data.url || ''),
        status: String(data.status || 'FAILED'),
        httpStatus: data.httpStatus ?? null,
        error: data.error ?? null,
        sentAt: String(data.sentAt || new Date().toISOString()),
      };
    },

    // ── Integration Providers ───────────────────────────────────────────────
    async listIntegrationProviders(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralIntegrationProviders>({
        path: '/api/v1/admin/integrations/providers',
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data || { payments: [], sms: [] };
    },

    async updateIntegrationProvider(this: PlatformAdminApiCore, input: {
      type: 'payment' | 'sms';
      providerCode: string;
      providerName?: string;
      isEnabled?: boolean;
      config?: any;
      senderId?: string;
      dailyQuota?: number;
    }) {
      const envelope = await this.requestEnvelope<CentralIntegrationProviderRow | CentralIntegrationProviders | Record<string, any>>({
        path: '/api/v1/admin/integrations/providers',
        method: 'PUT',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralIntegrationProviderRow | CentralIntegrationProviders | Record<string, any>;
    },
  };
}
