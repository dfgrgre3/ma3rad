import React, { useState, useCallback, useEffect } from 'react';
import {
  Webhook,
  CreditCard,
  MessageSquare,
  Globe,
  Radio,
  Plus,
  Trash2,
  Play,
  CheckCircle2,
  XCircle,
  Copy,
  Settings,
  Lock,
  ArrowRightLeft,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { platformAdminApiClient } from '../../services/domains/platform/PlatformAdminApiClient';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  EmptyState,
  formatDateTime,
  inputClass,
} from './components/PlatformUI';
import { useToast } from '../../components/ui/Toast';

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  lastTriggeredAt?: string;
  lastStatus?: 'SUCCESS' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

interface ProviderConfig {
  fawryMerchantCode: string;
  fawrySecurityKey: string;
  paymobApiKey: string;
  paymobIntegrationId: string;
  paymobIframeId: string;
  autoCapture: boolean;
}

interface SmsConfig {
  provider: string;
  senderId: string;
  apiKey: string;
  dailyQuota: number;
  usedToday: number;
}

export const PlatformIntegrationsPage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = useState<'WEBHOOKS' | 'PAYMENTS' | 'SMS'>('WEBHOOKS');
  const canManageIntegrations = canPlatform('integrations');

  // ── Webhooks State ─────────────────────────────────────────────────────────
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [webhooksError, setWebhooksError] = useState<string | null>(null);

  const loadWebhooks = useCallback(async () => {
    setWebhooksLoading(true);
    setWebhooksError(null);
    try {
      const rows = await platformAdminApiClient.listWebhooks();
      setWebhooks(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر تحميل نقاط الربط';
      setWebhooksError(msg);
      toast.error('تعذر تحميل نقاط الويب هوك', msg);
    } finally {
      setWebhooksLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void loadWebhooks();
  }, [loadWebhooks]);

  // Modal State
  const [isWhModalOpen, setIsWhModalOpen] = useState(false);
  const [whForm, setWhForm] = useState({
    name: '',
    url: '',
    events: ['invoice.created'],
    secret: '',
    isActive: true,
  });
  const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null);
  const [savingWebhook, setSavingWebhook] = useState(false);

  const handleCreateWebhook = async () => {
    if (!canManageIntegrations) {
      toast.error('لا تملك صلاحية إدارة التكاملات.');
      return;
    }
    if (!whForm.name.trim() || !whForm.url.trim()) {
      toast.error('الاسم ورابط الـ URL مطلوبان.');
      return;
    }
    setSavingWebhook(true);
    try {
      if (editingWebhookId) {
        await platformAdminApiClient.updateWebhook(editingWebhookId, {
          name: whForm.name.trim(),
          url: whForm.url.trim(),
          events: whForm.events,
          secret: whForm.secret.trim() || undefined,
          isActive: whForm.isActive,
        });
        toast.success('تم تعديل نقطة الربط');
      } else {
        await platformAdminApiClient.createWebhook({
          name: whForm.name.trim(),
          url: whForm.url.trim(),
          events: whForm.events,
          secret: whForm.secret.trim() || undefined,
          isActive: whForm.isActive,
        });
        toast.success('تم إضافة نقطة الربط بنجاح');
      }
      setIsWhModalOpen(false);
      setWhForm({ name: '', url: '', events: ['invoice.created'], secret: '', isActive: true });
      setEditingWebhookId(null);
      void loadWebhooks();
    } catch (err) {
      toast.error('تعذر حفظ نقطة الربط', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleTestWebhook = async (wh: WebhookEndpoint) => {
    if (!canManageIntegrations) {
      toast.error('لا تملك صلاحية إدارة التكاملات.');
      return;
    }
    try {
      const result = await platformAdminApiClient.testWebhook(wh.id);
      if (result.status === 'SENT') {
        toast.success('تم إرسال رسالة الاختبار بنجاح', `الحالة: HTTP ${result.httpStatus ?? '—'}`);
      } else {
        toast.error('فشل اختبار نقطة الربط', result.error || 'خطأ غير معروف');
      }
      void loadWebhooks();
    } catch (err) {
      toast.error('تعذر إجراء الاختبار', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!canManageIntegrations) {
      toast.error('لا تملك صلاحية إدارة التكاملات.');
      return;
    }
    if (!window.confirm('هل أنت متأكد من حذف هذه نقطة الربط؟')) return;
    try {
      await platformAdminApiClient.deleteWebhook(id);
      toast.success('تم حذف نقطة الربط');
      void loadWebhooks();
    } catch (err) {
      toast.error('تعذر حذف نقطة الربط', err instanceof Error ? err.message : undefined);
    }
  };

  // ── Payment Providers State ────────────────────────────────────────────────
  const [paymentConfig, setPaymentConfig] = useState<ProviderConfig>({
    fawryMerchantCode: '',
    fawrySecurityKey: '',
    paymobApiKey: '',
    paymobIntegrationId: '',
    paymobIframeId: '',
    autoCapture: true,
  });
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  const loadPaymentConfig = useCallback(async () => {
    const centralState = getCentralDataSourceState();
    setPaymentsLoading(true);
    setPaymentsError(null);
    try {
      if (centralState.active) {
        const providers = await centralPlatformClient.listIntegrationProviders();
        const fawry = providers.payments.find((p: any) => p.provider_code === 'FAWRY');
        const paymob = providers.payments.find((p: any) => p.provider_code === 'PAYMOB');
        const sms = providers.sms[0];
        if (fawry?.config) {
          const cfg = typeof fawry.config === 'string' ? JSON.parse(fawry.config) : fawry.config;
          setPaymentConfig(prev => ({
            ...prev,
            fawryMerchantCode: cfg.merchantCode || '',
            fawrySecurityKey: cfg.securityKey ? '••••••••' + String(cfg.securityKey).slice(-4) : '',
            paymobApiKey: cfg.apiKey ? '••••••••' + String(cfg.apiKey).slice(-4) : '',
            paymobIntegrationId: cfg.integrationId || '',
            paymobIframeId: cfg.iframeId || '',
          }));
        }
        if (sms) {
          setSmsConfig(prev => ({
            ...prev,
            provider: sms.provider_code || 'VIOMIS',
            senderId: sms.sender_id || 'CeramiSys',
            apiKey: sms.config?.apiKey ? '••••••••' + String(sms.config.apiKey).slice(-4) : '',
            dailyQuota: sms.daily_quota || 5000,
          }));
        }
      }
    } catch (err) {
      setPaymentsError(err instanceof Error ? err.message : 'تعذر تحميل إعدادات التكاملات');
    } finally {
      setPaymentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'PAYMENTS' || tab === 'SMS') {
      void loadPaymentConfig();
    }
  }, [tab, loadPaymentConfig]);

  // Note: full payment provider credentials are managed on the central server
  // (platform_settings) and are never returned in full to the renderer. The UI
  // shows only masked placeholders; actual values are set via secure backend
  // configuration and used only at payment time.

  const handleSaveProviders = async () => {
    if (!canManageIntegrations) {
      toast.error('لا تملك صلاحية إدارة التكاملات.');
      return;
    }
    const centralState = getCentralDataSourceState();
    if (!centralState.active) {
      toast.info(
        'غير متاح في الوضع المحلي',
        'إعدادات التكاملات متاحة فقط في الوضع المركزي.',
      );
      return;
    }
    setPaymentsLoading(true);
    try {
      // Save Fawry
      await centralPlatformClient.updateIntegrationProvider({
        type: 'payment',
        providerCode: 'FAWRY',
        providerName: 'Fawry',
        isEnabled: true,
        config: {
          merchantCode: paymentConfig.fawryMerchantCode,
          securityKey: paymentConfig.fawrySecurityKey.startsWith('••••') ? undefined : paymentConfig.fawrySecurityKey,
        },
      });
      // Save Paymob
      await centralPlatformClient.updateIntegrationProvider({
        type: 'payment',
        providerCode: 'PAYMOB',
        providerName: 'Paymob',
        isEnabled: true,
        config: {
          apiKey: paymentConfig.paymobApiKey.startsWith('••••') ? undefined : paymentConfig.paymobApiKey,
          integrationId: paymentConfig.paymobIntegrationId,
          iframeId: paymentConfig.paymobIframeId,
        },
      });
      // Save SMS
      await centralPlatformClient.updateIntegrationProvider({
        type: 'sms',
        providerCode: smsConfig.provider,
        providerName: smsConfig.provider,
        isEnabled: true,
        senderId: smsConfig.senderId,
        dailyQuota: smsConfig.dailyQuota,
        config: {
          apiKey: smsConfig.apiKey.startsWith('••••') ? undefined : smsConfig.apiKey,
        },
      });
      toast.success('تم حفظ إعدادات التكاملات');
      void loadPaymentConfig();
    } catch (err) {
      toast.error('تعذر حفظ إعدادات التكاملات', err instanceof Error ? err.message : undefined);
    } finally {
      setPaymentsLoading(false);
    }
  };

  // ── SMS Providers State ────────────────────────────────────────────────────
  const [smsConfig, setSmsConfig] = useState<SmsConfig>({
    provider: 'VIOMIS',
    senderId: 'CeramiSys',
    apiKey: '',
    dailyQuota: 5000,
    usedToday: 0,
  });

  const maskSecret = (value: string): string => {
    if (!value) return '';
    if (value.length <= 8) return '••••••••';
    return `••••••••${value.slice(-4)}`;
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="إدارة التكاملات المركزية (Integrations & Webhooks)"
        description="إدارة نقاط Webhooks للأحداث الخارجية، بوابات الدفع الإلكتروني، ومزودي الرسائل النصية القصيرة. جميع الأسرار تُخزّن على السيرفر المركزي ولا تُعرض كاملة في واجهة المتصفح."
        icon={<Webhook className="h-5 w-5" />}
      />

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 text-xs font-bold text-slate-400 gap-1">
        <button
          onClick={() => setTab('WEBHOOKS')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            tab === 'WEBHOOKS'
              ? 'border-sky-500 text-sky-400 bg-sky-500/10'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <Webhook className="h-4 w-4" />
          نقاط الـ Webhooks ({webhooks.length})
        </button>

        <button
          onClick={() => setTab('PAYMENTS')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            tab === 'PAYMENTS'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          بوابات الدفع الإلكتروني
        </button>

        <button
          onClick={() => setTab('SMS')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            tab === 'SMS'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          مزود الرسائل النصية (SMS Gateway)
        </button>
      </div>

      {/* TAB 1: WEBHOOKS */}
      {tab === 'WEBHOOKS' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-400">
              إرسال إشعارات فورية لخدمات الطرف الثالث عند وقوع أحداث بالمنصة (فواتير، تفعيل اشتراكات، ترقيات).
            </p>
            {canManageIntegrations && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingWebhookId(null);
                  setWhForm({ name: '', url: '', events: ['invoice.created'], secret: '', isActive: true });
                  setIsWhModalOpen(true);
                }}
                leadingIcon={<Plus className="h-4 w-4" />}
              >
                إضافة Webhook جديد
              </Button>
            )}
          </div>

          {webhooksError && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
              {webhooksError}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
            {webhooksLoading ? (
              <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل نقاط الربط…</div>
            ) : webhooks.length === 0 ? (
              <EmptyState
                icon={<Webhook className="h-6 w-6 text-slate-500" />}
                title="لا توجد نقاط Webhook مضافة"
                description="أضف نقطة ربط لبث أحداث المنصة لخدماتك الخارجية."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-right text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                    <tr>
                      <th className="px-4 py-3">اسم نقطة الربط</th>
                      <th className="px-4 py-3">الرابط الهدف (Target URL)</th>
                      <th className="px-4 py-3">الأحداث المشترك بها</th>
                      <th className="px-4 py-3">المفتاح السري (Signing Secret)</th>
                      <th className="px-4 py-3">آخر تسليم</th>
                      <th className="px-4 py-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {webhooks.map((wh) => (
                      <tr key={wh.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-100">{wh.name}</td>
                        <td className="px-4 py-3 font-mono text-slate-300 text-[11px]">{wh.url}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {wh.events.map((ev) => (
                              <span
                                key={ev}
                                className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono text-sky-400"
                              >
                                {ev}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                          {maskSecret(wh.secret)}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(wh.secret);
                              toast.success('تم نسخ المفتاح السري');
                            }}
                            className="ml-2 text-sky-400 hover:text-sky-300 text-xs"
                            title="نسخ المفتاح السري"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {wh.lastTriggeredAt ? formatDateTime(wh.lastTriggeredAt) : 'لم يتم الإرسال بعد'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {canManageIntegrations && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingWebhookId(wh.id);
                                    setWhForm({
                                      name: wh.name,
                                      url: wh.url,
                                      events: wh.events,
                                      secret: '',
                                      isActive: wh.isActive,
                                    });
                                    setIsWhModalOpen(true);
                                  }}
                                  className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1"
                                  title="تعديل"
                                >
                                  <Settings className="h-3 w-3" />
                                  تعديل
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleTestWebhook(wh);
                                  }}
                                  className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1"
                                  title="اختبار إرسال حمولة تجريبية"
                                >
                                  <Play className="h-3 w-3" />
                                  اختبار
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDeleteWebhook(wh.id);
                                  }}
                                  className="text-rose-400 hover:text-rose-300 text-xs"
                                  title="حذف"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PAYMENTS */}
      {tab === 'PAYMENTS' && (
        <div className="space-y-4 max-w-3xl">
          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-4">
            <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-400" />
              تكوين بوابة فوري (Fawry Pay)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">كود التاجر (Merchant Code)</label>
                <input
                  type="text"
                  value={paymentConfig.fawryMerchantCode}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, fawryMerchantCode: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">المفتاح الأمني (Security Key)</label>
                <input
                  type="password"
                  value={maskSecret(paymentConfig.fawrySecurityKey)}
                  readOnly
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, fawrySecurityKey: e.target.value })}
                  className={inputClass}
                />
                <p className="text-[10px] text-slate-500 mt-1">يتم تخزين المفتاح على السيرفر المركزي فقط. يُعرض جزء أخير للتأكيد.</p>
              </div>
            </div>

            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2 pt-3 border-t border-slate-800">
              <CreditCard className="h-4 w-4 text-sky-400" />
              تكوين بوابة بيموب (Paymob / Accept)
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Integration ID</label>
                <input
                  type="text"
                  value={paymentConfig.paymobIntegrationId}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, paymobIntegrationId: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Iframe ID</label>
                <input
                  type="text"
                  value={paymentConfig.paymobIframeId}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, paymobIframeId: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">API Key</label>
                <input
                  type="password"
                  value={maskSecret(paymentConfig.paymobApiKey)}
                  readOnly
                  className={inputClass}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <Button size="sm" onClick={handleSaveProviders} disabled={paymentsLoading || !canManageIntegrations}>
                {paymentsLoading ? 'جارٍ الحفظ…' : ' حفظ إعدادات الدفع'}
              </Button>
            </div>
          </div>
          {paymentsError && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
              {paymentsError}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SMS */}
      {tab === 'SMS' && (
        <div className="space-y-4 max-w-2xl">
          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-4">
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-purple-400" />
              إعدادات موفر الرسائل النصية القصيرة (SMS Gateway)
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">المزود (SMS Provider)</label>
                <select
                  value={smsConfig.provider}
                  onChange={(e) => setSmsConfig({ ...smsConfig, provider: e.target.value })}
                  className={inputClass}
                >
                  <option value="VIOMIS">فايوميس (Viomis SMS Egypt)</option>
                  <option value="TWILIO">تويليو (Twilio)</option>
                  <option value="INFOBIP">إنفوبيب (Infobip)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">اسم المرسل المعتمد (Sender ID)</label>
                <input
                  type="text"
                  value={smsConfig.senderId}
                  onChange={(e) => setSmsConfig({ ...smsConfig, senderId: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">SMS API Token</label>
              <input
                type="password"
                value={maskSecret(smsConfig.apiKey)}
                readOnly
                className={inputClass}
              />
              <p className="text-[10px] text-slate-500 mt-1">يتم تخزين الرمز على السيرفر المركزي فقط ولا يُعاد عرضه كاملاً.</p>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-xs flex justify-between items-center text-slate-300">
              <span>الرصيد اليومي المستهلك:</span>
              <span className="font-bold text-sky-400">{smsConfig.usedToday} / {smsConfig.dailyQuota} رسالة</span>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <Button size="sm" onClick={handleSaveProviders} disabled={!canManageIntegrations}>
                حفظ إعدادات الرسائل
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New / Edit Webhook */}
      <Modal
        open={isWhModalOpen}
        onClose={() => {
          setIsWhModalOpen(false);
          setEditingWebhookId(null);
          setWhForm({ name: '', url: '', events: ['invoice.created'], secret: '', isActive: true });
        }}
        title={editingWebhookId ? 'تعديل نقطة الربط' : 'إضافة Webhook جديد لبث أحداث المنصة'}
      >
        <div className="space-y-3.5 text-right">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">اسم النقطة / الوصف *</label>
            <input
              type="text"
              value={whForm.name}
              onChange={(e) => setWhForm({ ...whForm, name: e.target.value })}
              placeholder="مثلاً: المزامنة الفورية مع السيرفر الفرعي"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">رابط الاستلام (Endpoint URL) *</label>
            <input
              type="url"
              value={whForm.url}
              onChange={(e) => setWhForm({ ...whForm, url: e.target.value })}
              placeholder="https://api.domain.com/webhooks"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">المفتاح السري (اختياري — يُولّد تلقائياً إذا تُرك فارغاً)</label>
            <input
              type="password"
              value={whForm.secret}
              onChange={(e) => setWhForm({ ...whForm, secret: e.target.value })}
              placeholder="يُترك فارغاً لتوليد مفتاح تلقائياً"
              className={inputClass}
            />
            <p className="text-[10px] text-slate-500 mt-1">يُستخدم المفتاح لتوقيع رسائل الويب هوك والتحقق من صحتها عند الاستلام.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">الأحداث المشترك بها</label>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 mt-1">
              {[
                { id: 'invoice.created', label: 'إنشاء فاتورة جديدة' },
                { id: 'payment.received', label: 'استلام دفعة مالية' },
                { id: 'tenant.activated', label: 'تفعيل حساب عميل' },
                { id: 'subscription.renewed', label: 'تجديد اشتراك' },
                { id: 'security.incident', label: 'رصد حادث أمني' },
              ].map((ev) => {
                const checked = whForm.events.includes(ev.id);
                return (
                  <label key={ev.id} className="flex items-center gap-2 cursor-pointer bg-slate-950/40 p-2 rounded border border-slate-800">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setWhForm({ ...whForm, events: [...whForm.events, ev.id] });
                        } else {
                          setWhForm({ ...whForm, events: whForm.events.filter((x) => x !== ev.id) });
                        }
                      }}
                      className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                    />
                    <span>{ev.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={whForm.isActive}
                onChange={(e) => setWhForm({ ...whForm, isActive: e.target.checked })}
                className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
              />
                          نشط
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => {
              setIsWhModalOpen(false);
              setEditingWebhookId(null);
              setWhForm({ name: '', url: '', events: ['invoice.created'], secret: '', isActive: true });
            }}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleCreateWebhook} disabled={savingWebhook || !canManageIntegrations}>
              {savingWebhook ? 'جارٍ الحفظ…' : editingWebhookId ? 'تعديل وحفظ' : 'إنشاء وحفظ'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformIntegrationsPage;
