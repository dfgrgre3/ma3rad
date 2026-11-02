import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UpdateNotificationPreferencesDTO } from '../../types';
import { 
  Bell, BellOff, Check, CheckCheck, Trash2, 
  AlertTriangle, Package, DollarSign, Clock, Settings, UserRoundX, ExternalLink
} from 'lucide-react';
import { NotificationService, Notification, NotificationType } from '../../services/NotificationService';
import { NotificationPreferencesService } from '../../services/NotificationPreferencesService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferences, setPreferences] = useState<UpdateNotificationPreferencesDTO>({});
  const [preferencesSaved, setPreferencesSaved] = useState(false);

  const notificationService = new NotificationService();
  const canManageNotifications = PermissionService.can(AuthService.getCurrentUser(), 'notifications.manage');
  const preferencesService = new NotificationPreferencesService();
  const preferenceOptions: Array<{ key: keyof UpdateNotificationPreferencesDTO; label: string }> = [
    { key: 'lowStockAlerts', label: 'تنبيهات المخزون المنخفض والنافد' },
    { key: 'paymentDueAlerts', label: 'تنبيهات الدفعات المستحقة' },
    { key: 'systemAlerts', label: 'التنبيهات العامة وأحداث النظام' },
    { key: 'emailEnabled', label: 'تفضيل قناة البريد الإلكتروني' },
    { key: 'pushEnabled', label: 'تفضيل إشعارات Push' },
  ];

  const loadData = () => {
    try {
      const userId = AuthService.requireAuth().id;
      const notifs = notificationService.getNotifications(userId, filter === 'unread');
      const count = notificationService.getUnreadCount(userId);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

  useEffect(() => {
    try {
      setPreferences({ ...preferencesService.getDefaultPreferences(), ...preferencesService.getPreferences() });
    } catch (error) {
      console.error(error);
    }
  }, []);

  const savePreferences = () => {
    try {
      setPreferences(preferencesService.updatePreferences(preferences));
      setPreferencesSaved(true);
      window.setTimeout(() => setPreferencesSaved(false), 2500);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleMarkAsRead = (id: string) => {
    notificationService.markAsRead(id);
    loadData();
  };

  const handleMarkAllAsRead = () => {
    notificationService.markAllAsRead();
    loadData();
  };

  const handleDelete = (id: string) => {
    notificationService.deleteNotification(id);
    loadData();
  };

  const handleDeleteAll = () => {
    if (confirm('هل أنت متأكد من حذف جميع الإشعارات؟')) {
      notificationService.deleteAllNotifications();
      loadData();
    }
  };

  const handleCheckLowStock = () => {
    notificationService.checkLowStockAlerts();
    loadData();
  };

  const handleNavigateToCustomer = (notif: Notification) => {
    if (!notif.isRead) notificationService.markAsRead(notif.id);
    navigate(`/customers/${notif.referenceId}`);
  };

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case 'LOW_STOCK':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'STOCK_ALERT':
        return <Package className="w-4 h-4 text-red-500" />;
      case 'PAYMENT_DUE':
        return <DollarSign className="w-4 h-4 text-purple-500" />;
      case 'SHIFT_REMINDER':
        return <Clock className="w-4 h-4 text-sky-500" />;
      case 'INVOICE_CREATED':
        return <Check className="w-4 h-4 text-emerald-500" />;
      case 'EXPENSE_RECORDED':
        return <DollarSign className="w-4 h-4 text-rose-500" />;
      case 'INCOMPLETE_CUSTOMER':
        return <UserRoundX className="w-4 h-4 text-orange-500" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  const getTypeColor = (type: NotificationType) => {
    switch (type) {
      case 'LOW_STOCK':
        return 'border-r-amber-500 bg-amber-50/50';
      case 'STOCK_ALERT':
        return 'border-r-red-500 bg-red-50/50';
      case 'PAYMENT_DUE':
        return 'border-r-purple-500 bg-purple-50/50';
      case 'SHIFT_REMINDER':
        return 'border-r-sky-500 bg-sky-50/50';
      case 'INVOICE_CREATED':
        return 'border-r-emerald-500 bg-emerald-50/50';
      case 'EXPENSE_RECORDED':
        return 'border-r-rose-500 bg-rose-50/50';
      case 'INCOMPLETE_CUSTOMER':
        return 'border-r-orange-500 bg-orange-50/50';
      default:
        return 'border-r-slate-500 bg-slate-100';
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-3">
            الإشعارات والتنبيهات
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 bg-red-500 text-white text-xs font-black rounded-full">
                {unreadCount}
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500">تنبيهات المخزون المنخفض والمستحقات والأحداث المهمة</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCheckLowStock}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl flex items-center gap-2 text-sm transition"
          >
            <AlertTriangle className="w-4 h-4" />
            فحص المخزون
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2 text-sm transition"
            >
              <CheckCheck className="w-4 h-4" />
              قراءة الكل
            </button>
          )}
          <button
            type="button"
            onClick={() => setPreferencesOpen((open) => !open)}
            className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl flex items-center gap-2 text-sm transition"
            aria-expanded={preferencesOpen}
          >
            <Settings className="w-4 h-4" /> تفضيلات الإشعارات
          </button>
        </div>
      </div>

      {preferencesOpen && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="تفضيلات الإشعارات الشخصية">
          <div className="mb-4">
            <h3 className="text-sm font-black text-slate-900">تفضيلات حسابك</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">تتحكم أنواع التنبيهات في ظهورها داخل التطبيق. خيارات البريد وPush محفوظة كتفضيلات، لكن قنوات الإرسال غير مفعلة حاليًا.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {preferenceOptions.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(preferences[key])}
                  onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))}
                  className="h-4 w-4 accent-sky-600"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            {preferencesSaved && <span className="text-xs font-bold text-emerald-700">تم حفظ التفضيلات</span>}
            <button type="button" onClick={savePreferences} className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-black text-white hover:bg-sky-700">حفظ التفضيلات</button>
          </div>
        </section>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            filter === 'all'
              ? 'bg-white text-sky-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          جميع الإشعارات
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            filter === 'unread'
              ? 'bg-white text-sky-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          غير مقروءة
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full">{unreadCount}</span>
          )}
        </button>
      </div>

      {/* Notifications List */}
      <div className="space-y-2">
        {notifications.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center">
            <BellOff className="w-12 h-12 text-slate-700 mx-auto mb-3" />
            <div className="text-sm font-bold text-slate-500">لا توجد إشعارات</div>
            <div className="text-xs text-slate-500 mt-1">
              {filter === 'unread' ? 'جميع الإشعارات مقروءة' : 'لم يتم تسجيل أي إشعارات بعد'}
            </div>
          </div>
        ) : (
          notifications.map(notif => (
            <div
              key={notif.id}
              className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden border-r-4 ${
                notif.isRead ? 'border-r-slate-200' : getTypeColor(notif.type)
              }`}
            >
              <div className="p-4 flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  !notif.isRead ? 'bg-slate-100' : 'bg-slate-50'
                }`}>
                  {getTypeIcon(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm font-bold ${!notif.isRead ? 'text-slate-900' : 'text-slate-600'}`}>
                      {notif.title}
                    </h4>
                    {!notif.isRead && (
                      <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0"></span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{notif.message}</p>
                  <div className="text-[10px] text-slate-500 mt-2">{notif.createdAt}</div>
                  {notif.type === 'INCOMPLETE_CUSTOMER' && notif.referenceId && (
                    <button
                      onClick={() => handleNavigateToCustomer(notif)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 px-3 py-1.5 text-[11px] font-black text-white transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                      إكمال بيانات العميل
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!notif.isRead && (
                    <button
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition"
                      title="تحديد كمقروء"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  {canManageNotifications && (
                    <button
                      onClick={() => handleDelete(notif.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {notifications.length > 0 && canManageNotifications && (
        <div className="flex justify-end">
          <button
            onClick={handleDeleteAll}
            className="px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition"
          >
            حذف جميع الإشعارات
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
