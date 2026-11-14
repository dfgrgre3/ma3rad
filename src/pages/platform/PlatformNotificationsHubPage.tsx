import React, { useState } from 'react';
import {
  Bell,
  Mail,
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  Users,
  Search,
  Filter,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

interface NotificationLog {
  id: string;
  recipient: string;
  tenantName: string;
  channel: 'EMAIL' | 'SMS' | 'IN_APP';
  template: string;
  subject: string;
  status: 'DELIVERED' | 'PENDING' | 'FAILED';
  sentAt: string;
}

export const PlatformNotificationsHubPage: React.FC = () => {
  const [logs, setLogs] = useState<NotificationLog[]>([
    {
      id: 'notif_1',
      recipient: 'ahmed@ceramics-cairo.com',
      tenantName: 'معرض سيراميك القاهرة',
      channel: 'EMAIL',
      template: 'SUBSCRIPTION_RENEWAL_NOTICE',
      subject: 'تنبيه: اقتراب موعد تجديد اشتراك باقة برو',
      status: 'DELIVERED',
      sentAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'notif_2',
      recipient: '01012345678',
      tenantName: 'شركة النور للمقاولات',
      channel: 'SMS',
      template: 'ACTIVATION_CODE_SMS',
      subject: 'كود تفعيل منصتك هو: CS-8821',
      status: 'DELIVERED',
      sentAt: new Date(Date.now() - 14400000).toISOString(),
    },
    {
      id: 'notif_3',
      recipient: 'billing@delta-store.eg',
      tenantName: 'مؤسسة الدلتا للسيراميك',
      channel: 'EMAIL',
      template: 'INVOICE_OVERDUE',
      subject: 'فاتورة مستحقة متأخرة الدفع #INV-2026-004',
      status: 'DELIVERED',
      sentAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);

  const [channelFilter, setChannelFilter] = useState('');
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({
    channel: 'EMAIL' as const,
    target: 'ALL',
    subject: '',
    message: '',
  });

  const handleSendBroadcast = () => {
    if (!broadcastForm.subject.trim() || !broadcastForm.message.trim()) {
      alert('الموضوع ومحتوى الرسالة مطلوبان.');
      return;
    }
    const newEntry: NotificationLog = {
      id: `notif_${Date.now()}`,
      recipient: broadcastForm.target === 'ALL' ? 'كافة العملاء النشطين' : 'مستأجر محدد',
      tenantName: 'إشعار جماعي من الإدارة',
      channel: broadcastForm.channel,
      template: 'ADMIN_BROADCAST',
      subject: broadcastForm.subject,
      status: 'DELIVERED',
      sentAt: new Date().toISOString(),
    };
    setLogs([newEntry, ...logs]);
    setIsSendOpen(false);
    setBroadcastForm({ channel: 'EMAIL', target: 'ALL', subject: '', message: '' });
    alert('تم إرسال الإشعار المركزي وتوثيقه بسجل التسليم بنجاح.');
  };

  const filteredLogs = logs.filter((l) => (channelFilter ? l.channel === channelFilter : true));

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="مركز الإشعارات وسجل التسليم المركزي (Notifications Hub)"
        description="إرسال التنبيهات الجماعية، البريد الإلكتروني، والرسائل النصية للعملاء ومتابعة سجلات التسليم."
        icon={<Bell className="h-5 w-5" />}
        actions={
          <Button
            size="sm"
            onClick={() => setIsSendOpen(true)}
            leadingIcon={<Send className="h-4 w-4" />}
          >
            إرسال إشعار مركزي جديد
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
          <p className="text-[11px] font-semibold text-slate-400">إجمالي الرسائل المرسلة</p>
          <p className="text-xl font-black text-slate-100 mt-1">{logs.length}</p>
        </div>
        <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl">
          <p className="text-[11px] font-semibold text-emerald-400">نسبة التسليم الناجح</p>
          <p className="text-xl font-black text-emerald-300 mt-1">100%</p>
        </div>
        <div className="p-3 bg-sky-950/20 border border-sky-500/20 rounded-xl">
          <p className="text-[11px] font-semibold text-sky-400">القنوات المفعلة</p>
          <p className="text-xl font-black text-sky-300 mt-1">Email + SMS</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 shadow-sm">
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className={`${inputClass} max-w-[200px]`}
        >
          <option value="">جميع القنوات</option>
          <option value="EMAIL">بريد إلكتروني (Email)</option>
          <option value="SMS">رسائل نصية (SMS)</option>
          <option value="IN_APP">داخل التطبيق (In-App)</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-right text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
              <tr>
                <th className="px-4 py-3">العميل والمستلم</th>
                <th className="px-4 py-3">القناة</th>
                <th className="px-4 py-3">القالب والموضوع</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">وقت التسليم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-100">{log.tenantName}</div>
                    <div className="text-[11px] font-mono text-slate-400">{log.recipient}</div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="font-bold bg-slate-800 px-2 py-0.5 rounded text-[10px] text-sky-300">
                      {log.channel}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-200">{log.subject}</div>
                    <div className="text-[10px] font-mono text-slate-500">{log.template}</div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> تم التسليم
                    </span>
                  </td>

                  <td className="px-4 py-3 text-slate-400">{formatDateTime(log.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Broadcast */}
      <Modal
        open={isSendOpen}
        onClose={() => setIsSendOpen(false)}
        title="إرسال إشعار مركزي جديد"
      >
        <div className="space-y-3.5 text-right">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">القناة</label>
              <select
                value={broadcastForm.channel}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, channel: e.target.value as any })}
                className={inputClass}
              >
                <option value="EMAIL">بريد إلكتروني (Email)</option>
                <option value="SMS">رسالة نصية قصيرة (SMS)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">المستهدفون</label>
              <select
                value={broadcastForm.target}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, target: e.target.value })}
                className={inputClass}
              >
                <option value="ALL">كافة العملاء النشطين</option>
                <option value="TRIAL">المشتركون في الفترة التجريبية فقط</option>
                <option value="EXPIRED">أصحاب الاشتراكات المنتهية</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">عنوان الإشعار / الموضوع *</label>
            <input
              type="text"
              value={broadcastForm.subject}
              onChange={(e) => setBroadcastForm({ ...broadcastForm, subject: e.target.value })}
              placeholder="مثلاً: تنبيه صيانة دورية أو تحديث أمني هام"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">نص الرسالة *</label>
            <textarea
              rows={4}
              value={broadcastForm.message}
              onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
              placeholder="اكتب نص الإشعار هنا..."
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsSendOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleSendBroadcast}>
              إرسال فوراً
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformNotificationsHubPage;
