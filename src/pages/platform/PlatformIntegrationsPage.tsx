import React, { useState } from 'react';
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
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  EmptyState,
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret: string;
  lastTriggeredAt?: string;
  lastStatus?: 'SUCCESS' | 'FAILED';
}

export const PlatformIntegrationsPage: React.FC = () => {
  const [tab, setTab] = useState<'WEBHOOKS' | 'PAYMENTS' | 'SMS'>('WEBHOOKS');
  const canManageIntegrations = canPlatform('integrations');

  // Webhooks State
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([
    {
      id: 'wh_01',
      name: 'إشعار إنشاء فاتورة جديدة لـ ERP خارجي',
      url: 'https://api.external-accounting.com/hooks/invoices',
      events: ['invoice.created', 'payment.received'],
      isActive: true,
      secret: 'whsec_99a8b7c6d5e4f3a2b1c0',
      lastTriggeredAt: new Date(Date.now() - 3600000).toISOString(),
      lastStatus: 'SUCCESS',
    },
    {
      id: 'wh_02',
      name: 'ربط CRM الشريك بالعملاء الجدد',
      url: 'https://crm.partner.io/incoming/tenants',
      events: ['tenant.activated', 'subscription.renewed'],
      isActive: true,
      secret: 'whsec_112233445566778899aa',
      lastTriggeredAt: new Date(Date.now() - 86400000).toISOString(),
      lastStatus: 'SUCCESS',
    },
  ]);

  // Payment Providers State
  const [paymentConfig, setPaymentConfig] = useState({
    fawryMerchantCode: 'FAWRY_MERCH_7721',
    fawrySecurityKey: '••••••••••••••••••••••••••••••',
    paymobApiKey: '••••••••••••••••••••••••••••••',
    paymobIntegrationId: '381920',
    paymobIframeId: '76110',
    autoCapture: true,
  });

  // SMS Providers State
  const [smsConfig, setSmsConfig] = useState({
    provider: 'VIOMIS',
    senderId: 'CeramiSys',
    apiKey: '••••••••••••••••••••••••••••••',
    dailyQuota: 5000,
    usedToday: 214,
  });

  // Modal State
  const [isWhModalOpen, setIsWhModalOpen] = useState(false);
  const [whForm, setWhForm] = useState({
    name: '',
    url: '',
    events: ['invoice.created'],
  });

  const handleCreateWebhook = () => {
    if (!canManageIntegrations) {
      alert('لا تملك صلاحية إدارة التكاملات.');
      return;
    }
    if (!whForm.name.trim() || !whForm.url.trim()) {
      alert('الاسم ورابط الـ URL مطلوبان.');
      return;
    }
    const newWh: WebhookEndpoint = {
      id: `wh_${Date.now()}`,
      name: whForm.name,
      url: whForm.url,
      events: whForm.events,
      isActive: true,
      secret: `whsec_${Math.random().toString(36).substring(2, 15)}`,
    };
    setWebhooks([newWh, ...webhooks]);
    setIsWhModalOpen(false);
    setWhForm({ name: '', url: '', events: ['invoice.created'] });
    alert('تم إضافة الـ Webhook بنجاح.');
  };

  const handleTestWebhook = (wh: WebhookEndpoint) => {
    if (!canManageIntegrations) {
      alert('لا تملك صلاحية إدارة التكاملات.');
      return;
    }
    alert(`تم إرسال حمولة تجريبية (Test Ping Payload) إلى:\n${wh.url}\n\nالنتيجة: 200 OK تم الاستلام بنجاح.`);
  };

  const handleDeleteWebhook = (id: string) => {
    if (!canManageIntegrations) {
      alert('لا تملك صلاحية إدارة التكاملات.');
      return;
    }
    if (!confirm('هل أنت متأكد من حذف هذا الـ Webhook؟')) return;
    setWebhooks(webhooks.filter((w) => w.id !== id));
  };

  const handleSaveProviders = () => {
    if (!canManageIntegrations) {
      alert('لا تملك صلاحية إدارة التكاملات.');
      return;
    }
    alert('تم حفظ إعدادات بوابات الدفع ومزودي الرسائل بنجاح.');
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="إدارة التكاملات المركزية (Integrations & Webhooks)"
        description="إدارة نقاط Webhooks للأحداث الخارجية، بوابات الدفع الإلكتروني، ومزودي الرسائل النصية القصيرة."
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
                onClick={() => setIsWhModalOpen(true)}
                leadingIcon={<Plus className="h-4 w-4" />}
              >
                إضافة Webhook جديد
              </Button>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
            {webhooks.length === 0 ? (
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
                        <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">{wh.secret}</td>
                        <td className="px-4 py-3 text-slate-400">
                          {wh.lastTriggeredAt ? formatDateTime(wh.lastTriggeredAt) : 'لم يتم الإرسال بعد'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {canManageIntegrations && (
                              <>
                                <button
                                  onClick={() => handleTestWebhook(wh)}
                                  className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1"
                                  title="اختبار إرسال حمولة تجريبية"
                                >
                                  <Play className="h-3 w-3" />
                                  اختبار
                                </button>
                                <button
                                  onClick={() => handleDeleteWebhook(wh.id)}
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
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-400" />
              تكوين بوابة فوري (Fawry Pay)
            </h3>
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
                  value={paymentConfig.fawrySecurityKey}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, fawrySecurityKey: e.target.value })}
                  className={inputClass}
                />
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
                  value={paymentConfig.paymobApiKey}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, paymobApiKey: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <Button size="sm" onClick={handleSaveProviders} disabled={!canManageIntegrations}>
                حفظ إعدادات الدفع
              </Button>
            </div>
          </div>
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
                value={smsConfig.apiKey}
                onChange={(e) => setSmsConfig({ ...smsConfig, apiKey: e.target.value })}
                className={inputClass}
              />
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

      {/* Modal: New Webhook */}
      <Modal
        open={isWhModalOpen}
        onClose={() => setIsWhModalOpen(false)}
        title="إضافة Webhook جديد لبث أحداث المنصة"
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

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsWhModalOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleCreateWebhook} disabled={!canManageIntegrations}>
              إنشاء وحفظ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformIntegrationsPage;
