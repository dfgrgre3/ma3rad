import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../components/ui/DataTable';
import { Bell, Send, CheckCircle2, Clock, XCircle, Filter } from 'lucide-react';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { formatDateTime, inputClass } from './components/PlatformUI';

type NotificationStatus = 'QUEUED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

interface NotificationDelivery {
  id: string;
  notificationId: string;
  channel: 'EMAIL' | 'SMS' | 'IN_APP';
  recipient: string;
  status: NotificationStatus;
  provider: string | null;
  externalId: string | null;
  error: string | null;
  createdAt: string;
}

interface NotificationLog {
  id: string;
  notificationId: string;
  recipient: string;
  tenantName: string;
  channel: 'EMAIL' | 'SMS' | 'IN_APP';
  template: string;
  subject: string;
  status: NotificationStatus;
  sentAt: string;
}

const STATUS_LABELS: Record<NotificationStatus, string> = {
  QUEUED: 'بانتظار',
  PROCESSING: 'قيد المعالجة',
  SENT: 'مرسل',
  DELIVERED: 'تم التسليم',
  FAILED: 'فشل',
  CANCELLED: 'ملغي',
};

export const PlatformNotificationsHubPage: React.FC = () => {
  const canManageNotifications = canPlatform('notifications', 'platform.notifications.update');
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [broadcastForm, setBroadcastForm] = useState({
    channel: 'IN_APP' as 'EMAIL' | 'SMS' | 'IN_APP',
    audience: 'ALL',
    subject: '',
    message: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const notificationsResult = await centralPlatformClient.listNotifications({ limit: 100 });
      const mapped: NotificationLog[] = notificationsResult.notifications.map((notification) => ({
        id: notification.id,
        notificationId: notification.id,
        recipient: notification.tenantId ? `عميل: ${notification.tenantId}` : 'النظام العام',
        tenantName: notification.tenantId ? `عميل ${notification.tenantId}` : 'المنصة',
        channel: (notification.channel as 'EMAIL' | 'SMS' | 'IN_APP'),
        template: notification.templateId ? String(notification.templateId) : 'ADMIN_BROADCAST',
        subject: notification.subject,
        status: (notification.status as NotificationStatus),
        sentAt: notification.createdAt,
      }));
      setLogs(mapped);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل سجل الإشعارات من السيرفر المركزي.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredLogs = useMemo(
    () => logs.filter((log) => (channelFilter ? log.channel === channelFilter : true)),
    [logs, channelFilter],
  );

  const deliveredCount = useMemo(
    () => logs.filter((log) => log.status === 'SENT' || log.status === 'DELIVERED').length,
    [logs],
  );
  const failedCount = useMemo(() => logs.filter((log) => log.status === 'FAILED').length, [logs]);
  const deliveryRate = logs.length ? Math.round((deliveredCount / logs.length) * 100) : 0;

  const handleSendBroadcast = async () => {
    if (!canManageNotifications) {
      setError('لا تملك صلاحية إرسال الإشعارات.');
      return;
    }
    if (!broadcastForm.subject.trim() || !broadcastForm.message.trim()) {
      setError('الموضوع ومحتوى الرسالة مطلوبان.');
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const result = await centralPlatformClient.sendNotification({
        audience: broadcastForm.audience,
        channel: broadcastForm.channel,
        subject: broadcastForm.subject.trim(),
        message: broadcastForm.message.trim(),
      });
      await load();
      setIsSendOpen(false);
      setBroadcastForm({ channel: 'IN_APP', audience: 'ALL', subject: '', message: '' });
      setError(null);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'فشل إرسال الإشعار عبر الخدمة المركزية.';
      setSendError(message);
      setError(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="مركز الإشعارات وسجل التسليم المركزي (Notifications Hub)"
        description="إرسال التنبيهات عبر البريد الإلكتروني والرسائل النصية والإشعارات الداخلية للعملاء، ومتابعة سجلات التسليم من السيرفر المركزي."
        icon={<Bell className="h-5 w-5" />}
        actions={
          canManageNotifications ? (
            <Button size="sm" onClick={() => setIsSendOpen(true)} leadingIcon={<Send className="h-4 w-4" />}>
              إرسال إشعار مركزي جديد
            </Button>
          ) : null
        }
      />

      {error ? (
        <div role="alert" className="rounded-xl border border-danger-border bg-danger-soft p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 bg-primary/60 border border-line-strong rounded-xl">
          <p className="text-[11px] font-semibold text-muted">إجمالي الإشعارات المرسلة</p>
          <p className="text-xl font-black text-muted mt-1">{logs.length}</p>
        </div>
        <div className="p-3 bg-success/20 border border-success/20 rounded-xl">
          <p className="text-[11px] font-semibold text-success">نسبة التسليم الناجح</p>
          <p className="text-xl font-black text-success mt-1">{logs.length ? deliveryRate : 0}%</p>
        </div>
        <div className="p-3 bg-primary/20 border border-primary/20 rounded-xl">
          <p className="text-[11px] font-semibold text-primary">القنوات المستخدمة</p>
          <p className="text-xl font-black text-primary mt-1">{['EMAIL', 'SMS', 'IN_APP'].filter((c) => logs.some((l) => l.channel === c)).join(' + ') || 'لا إشعارات بعد'}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-primary/60 p-3 shadow-sm">
        <Filter className="h-4 w-4 text-muted" />
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className={`${inputClass} max-w-[200px]`}>
          <option value="">جميع القنوات</option>
          <option value="EMAIL">بريد إلكتروني (Email)</option>
          <option value="SMS">رسائل نصية (SMS)</option>
          <option value="IN_APP">داخل التطبيق (In-App)</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
        <div className="overflow-x-auto">
          <DataTable
              ariaLabel="سجل الإشعارات"
              rows={filteredLogs}
              rowKey={(log: NotificationLog) => String(log.id)}
              minWidth={850}
              dense
              tableClassName="text-xs"
              rowClassName={() => 'transition-colors hover:bg-primary/30'}
              columns={[
                {
                  key: 'channel', header: 'القناة / المستلم',
                  render: (log: NotificationLog) => (
                    <span className="block">
                      <span className="block font-bold text-muted">{STATUS_LABELS[log.status] || log.status}</span>
                      <span className="block font-mono text-[11px] text-muted">{log.channel}</span>
                    </span>
                  ),
                },
                {
                  key: 'template', header: 'القالب والموضوع',
                  render: (log: NotificationLog) => (
                    <span className="block">
                      <span className="block font-semibold text-muted">{log.subject}</span>
                      <span className="block font-mono text-[10px] text-muted">{log.template}</span>
                    </span>
                  ),
                },
                {
                  key: 'status', header: 'الحالة',
                  render: (log: NotificationLog) => log.status === 'SENT' || log.status === 'DELIVERED' ? (
                    <span className="flex items-center gap-1 font-bold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> تم التسليم</span>
                  ) : log.status === 'FAILED' ? (
                    <span className="flex items-center gap-1 font-bold text-danger"><XCircle className="h-3.5 w-3.5" /> فشل التسليم</span>
                  ) : (
                    <span className="flex items-center gap-1 font-bold text-warning"><Clock className="h-3.5 w-3.5" /> {STATUS_LABELS[log.status] || log.status}</span>
                  ),
                },
                { key: 'sent', header: 'وقت التسليم', render: (log: NotificationLog) => <span className="text-muted">{formatDateTime(log.sentAt)}</span> },
              ]}
            />
          {!loading && filteredLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted">لا توجد إشعارات مسجلة بعد.</div>
          ) : null}
        </div>
      </div>

      {/* Modal: Broadcast */}
      <Modal open={isSendOpen} onClose={() => setIsSendOpen(false)} title="إرسال إشعار مركزي جديد">
        <div className="space-y-3.5 text-right">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">القناة</label>
              <select
                value={broadcastForm.channel}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, channel: e.target.value as 'EMAIL' | 'SMS' | 'IN_APP' })}
                className={inputClass}
              >
                <option value="IN_APP">داخل التطبيق (In-App)</option>
                <option value="EMAIL">بريد إلكتروني (Email)</option>
                <option value="SMS">رسائل نصية (SMS)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">المستهدفون</label>
              <select
                value={broadcastForm.audience}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, audience: e.target.value })}
                className={inputClass}
              >
                <option value="ALL">كافة العملاء النشطين</option>
                <option value="TRIAL">المشتركون في الفترة التجريبية فقط</option>
                <option value="EXPIRED">أصحاب الاشتراكات المنتهية</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">عنوان الإشعار / الموضوع *</label>
            <input type="text" value={broadcastForm.subject} onChange={(e) => setBroadcastForm({ ...broadcastForm, subject: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">نص الرسالة *</label>
            <textarea rows={4} value={broadcastForm.message} onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })} className={inputClass} />
          </div>
          {sendError ? <div className="rounded border border-danger-border bg-danger-soft p-2 text-xs text-danger">{sendError}</div> : null}
          <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
            <Button variant="secondary" size="sm" onClick={() => setIsSendOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={() => void handleSendBroadcast()} disabled={sending || !canManageNotifications}>
              {sending ? 'جارٍ الإرسال…' : 'إرسال عبر الخدمة المركزية'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformNotificationsHubPage;
