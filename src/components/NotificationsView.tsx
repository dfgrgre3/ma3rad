import React, { useState, useEffect } from 'react';
import { 
  Bell, BellOff, Check, CheckCheck, Trash2, 
  AlertTriangle, Package, DollarSign, Clock, Settings
} from 'lucide-react';
import { NotificationService, Notification, NotificationType } from '../services/NotificationService';

export const NotificationsView: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const notificationService = new NotificationService();

  const loadData = () => {
    try {
      const notifs = notificationService.getNotifications(undefined, filter === 'unread');
      const count = notificationService.getUnreadCount();
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

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
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  const getTypeColor = (type: NotificationType) => {
    switch (type) {
      case 'LOW_STOCK':
        return 'border-r-amber-500 bg-amber-50/50 dark:bg-amber-950/20';
      case 'STOCK_ALERT':
        return 'border-r-red-500 bg-red-50/50 dark:bg-red-950/20';
      case 'PAYMENT_DUE':
        return 'border-r-purple-500 bg-purple-50/50 dark:bg-purple-950/20';
      case 'SHIFT_REMINDER':
        return 'border-r-sky-500 bg-sky-50/50 dark:bg-sky-950/20';
      case 'INVOICE_CREATED':
        return 'border-r-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20';
      case 'EXPENSE_RECORDED':
        return 'border-r-rose-500 bg-rose-50/50 dark:bg-rose-950/20';
      default:
        return 'border-r-slate-500 bg-slate-50/50 dark:bg-slate-950/20';
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
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
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
            filter === 'all'
              ? 'bg-white dark:bg-slate-900 text-sky-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          جميع الإشعارات
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            filter === 'unread'
              ? 'bg-white dark:bg-slate-900 text-sky-600 shadow-sm'
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
          <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
            <BellOff className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <div className="text-sm font-bold text-slate-400">لا توجد إشعارات</div>
            <div className="text-xs text-slate-400 mt-1">
              {filter === 'unread' ? 'جميع الإشعارات مقروءة' : 'لم يتم تسجيل أي إشعارات بعد'}
            </div>
          </div>
        ) : (
          notifications.map(notif => (
            <div
              key={notif.id}
              className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden border-r-4 ${
                !notif.isRead ? getTypeColor(notif.type) : 'border-r-slate-200 dark:border-r-slate-700'
              }`}
            >
              <div className="p-4 flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  !notif.isRead ? 'bg-slate-100 dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-800/50'
                }`}>
                  {getTypeIcon(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm font-bold ${!notif.isRead ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                      {notif.title}
                    </h4>
                    {!notif.isRead && (
                      <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0"></span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{notif.message}</p>
                  <div className="text-[10px] text-slate-400 mt-2">{notif.createdAt}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!notif.isRead && (
                    <button
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 transition"
                      title="تحديد كمقروء"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(notif.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {notifications.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleDeleteAll}
            className="px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition"
          >
            حذف جميع الإشعارات
          </button>
        </div>
      )}
    </div>
  );
};
