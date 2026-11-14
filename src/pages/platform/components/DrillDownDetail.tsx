import React from 'react';
import { X, ExternalLink, ArrowLeft, Building2, KeyRound, CalendarClock, Wallet, CreditCard, AlertTriangle, CheckCircle2, XCircle, Clock, User, Mail, Phone, MapPin, Package, GitBranch, Cpu, Server, DollarSign, TrendingUp, BarChart2, LineChart, PieChart, Activity, Shield, Eye, Edit, Download, MoreVertical, Users, RotateCcw, ScrollText, Tag, Percent, Calculator, Wifi } from 'lucide-react';
import type { PlatformTenant, PlatformLicense, PlatformSubscription, PlatformInvoice, PlatformPayment, PlatformDevice } from '../../../services/domains/platform/platformTypes';
import { formatMoney, formatNumber, formatDate, formatDateTime, StatusBadge } from './PlatformUI';
import { Panel, MetricCard, LineChart as LineChartComp } from './Charts';
import type { PlatformTimeSeriesPoint, PlatformMetricComparison } from '../../../services/domains/platform/platformTypes';

interface DrillDownDetailProps {
  type: 'tenant' | 'license' | 'subscription' | 'invoice' | 'payment' | 'device';
  data: PlatformTenant | PlatformLicense | PlatformSubscription | PlatformInvoice | PlatformPayment | PlatformDevice;
  onClose: () => void;
  onAction?: (action: string, entityId: string) => void;
}

const typeIcons = {
  tenant: Building2,
  license: KeyRound,
  subscription: CalendarClock,
  invoice: Wallet,
  payment: CreditCard,
  device: Cpu,
};

const typeLabels = {
  tenant: 'تفاصيل العميل',
  license: 'تفاصيل الترخيص',
  subscription: 'تفاصيل الاشتراك',
  invoice: 'تفاصيل الفاتورة',
  payment: 'تفاصيل الدفعة',
  device: 'تفاصيل الجهاز',
};

const typeColors = {
  tenant: 'bg-sky-50 text-sky-600',
  license: 'bg-amber-50 text-amber-600',
  subscription: 'bg-violet-50 text-violet-600',
  invoice: 'bg-emerald-50 text-emerald-600',
  payment: 'bg-indigo-50 text-indigo-600',
  device: 'bg-slate-50 text-slate-600',
};

export const DrillDownDetail: React.FC<DrillDownDetailProps> = ({ type, data, onClose, onAction }) => {
  const Icon = typeIcons[type];
  const tenant = data as PlatformTenant;
  const license = data as PlatformLicense;
  const subscription = data as PlatformSubscription;
  const invoice = data as PlatformInvoice;
  const payment = data as PlatformPayment;
  const device = data as PlatformDevice;

  const renderTenantDetail = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="اسم العميل" value={tenant.name} icon={<Building2 className="h-4 w-4" />} />
        <MetricCard label="كود العميل" value={tenant.code} icon={<KeyRound className="h-4 w-4" />} />
        <MetricCard label="الحالة" value={<StatusBadge value={tenant.status} />} icon={<Shield className="h-4 w-4" />} />
        <MetricCard label="الخطة" value={tenant.planName || '—'} icon={<Package className="h-4 w-4" />} />
        <MetricCard label="جهة الاتصال" value={tenant.contactName || '—'} icon={<User className="h-4 w-4" />} />
        <MetricCard label="البريد الإلكتروني" value={tenant.email || '—'} icon={<Mail className="h-4 w-4" />} />
        <MetricCard label="الهاتف" value={tenant.phone || '—'} icon={<Phone className="h-4 w-4" />} />
        <MetricCard label="العنوان" value={`${tenant.city || ''} ${tenant.country || ''}`.trim() || '—'} icon={<MapPin className="h-4 w-4" />} />
        <MetricCard label="نوع النشاط" value={tenant.businessType || '—'} icon={<Package className="h-4 w-4" />} />
        <MetricCard label="تاريخ الإنشاء" value={formatDate(tenant.createdAt)} icon={<CalendarClock className="h-4 w-4" />} />
        <MetricCard label="الحد الأقصى للمستخدمين" value={formatNumber(tenant.seatsLimit)} icon={<Users className="h-4 w-4" />} />
        <MetricCard label="الحد الأقصى للفروع" value={formatNumber(tenant.branchesLimit)} icon={<GitBranch className="h-4 w-4" />} />
        <MetricCard label="الحد الأقصى للأجهزة" value={formatNumber(tenant.devicesLimit)} icon={<Cpu className="h-4 w-4" />} />
        <MetricCard label="التراخيص النشطة" value={formatNumber(tenant.activeLicenses ?? 0)} icon={<KeyRound className="h-4 w-4" />} />
        <MetricCard label="إجمالي التراخيص" value={formatNumber(tenant.licensesTotal ?? 0)} icon={<KeyRound className="h-4 w-4" />} />
        <MetricCard label="الأجهزة المستخدمة" value={formatNumber(tenant.devicesUsed ?? 0)} icon={<Cpu className="h-4 w-4" />} />
        <MetricCard label="المستحقات" value={formatMoney(tenant.outstanding ?? 0)} icon={<DollarSign className="h-4 w-4" />} />
      </div>

      <div className="flex gap-2">
        <button onClick={() => onAction?.('view', tenant.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-700 hover:bg-emerald-100">
          <Eye className="h-3.5 w-3.5" /> عرض في لوحة التحكم
        </button>
        <button onClick={() => onAction?.('edit', tenant.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
          <Edit className="h-3.5 w-3.5" /> تعديل
        </button>
        <button onClick={() => onAction?.('activate', tenant.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
          <KeyRound className="h-3.5 w-3.5" /> إصدار ترخيص
        </button>
        <button onClick={() => onAction?.('invoice', tenant.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
          <Wallet className="h-3.5 w-3.5" /> إنشاء فاتورة
        </button>
      </div>
    </div>
  );

  const renderLicenseDetail = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="مفتاح الترخيص" value={license.licenseKey} icon={<KeyRound className="h-4 w-4" />} />
        <MetricCard label="الحالة" value={<StatusBadge value={license.status} />} icon={<Shield className="h-4 w-4" />} />
        <MetricCard label="العميل" value={license.tenantName || '—'} icon={<Building2 className="h-4 w-4" />} />
        <MetricCard label="الخطة" value={license.planName || '—'} icon={<Package className="h-4 w-4" />} />
        <MetricCard label="تاريخ الإصدار" value={formatDate(license.issuedAt)} icon={<CalendarClock className="h-4 w-4" />} />
        <MetricCard label="تاريخ التفعيل" value={formatDate(license.activatedAt)} icon={<CheckCircle2 className="h-4 w-4" />} />
        <MetricCard label="تاريخ الانتهاء" value={formatDate(license.expiresAt)} icon={<Clock className="h-4 w-4" />} />
        <MetricCard label="المقاعد" value={formatNumber(license.seats)} icon={<Users className="h-4 w-4" />} />
        <MetricCard label="حد الأجهزة" value={formatNumber(license.deviceLimit)} icon={<Cpu className="h-4 w-4" />} />
        <MetricCard label="معرف الجهاز" value={license.hardwareId || 'غير مربوط'} icon={<Server className="h-4 w-4" />} />
        <MetricCard label="كود التفعيل" value={license.activationCode || '—'} icon={<KeyRound className="h-4 w-4" />} />
        <MetricCard label="الوحدات" value={license.modules?.join(', ') || '—'} icon={<Package className="h-4 w-4" />} />
        <MetricCard label="المميزات" value={license.features?.join(', ') || '—'} icon={<Activity className="h-4 w-4" />} />
        <MetricCard label="عدد النقلات" value={formatNumber(license.transferCount ?? 0)} icon={<RotateCcw className="h-4 w-4" />} />
        <MetricCard label="تاريخ الإنشاء" value={formatDate(license.createdAt)} icon={<CalendarClock className="h-4 w-4" />} />
      </div>

      <div className="flex gap-2">
        <button onClick={() => onAction?.('view', license.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-700 hover:bg-emerald-100">
          <Eye className="h-3.5 w-3.5" /> عرض في لوحة التحكم
        </button>
        <button onClick={() => onAction?.('renew', license.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
          <RotateCcw className="h-3.5 w-3.5" /> تجديد
        </button>
        <button onClick={() => onAction?.('activate', license.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
          <Cpu className="h-3.5 w-3.5" /> ربط جهاز
        </button>
        <button onClick={() => onAction?.('deactivate', license.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-100">
          <XCircle className="h-3.5 w-3.5" /> إلغاء التفعيل
        </button>
      </div>
    </div>
  );

  const renderSubscriptionDetail = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="الحالة" value={<StatusBadge value={subscription.status} />} icon={<Shield className="h-4 w-4" />} />
        <MetricCard label="العميل" value={subscription.tenantName || '—'} icon={<Building2 className="h-4 w-4" />} />
        <MetricCard label="الخطة" value={subscription.planName || '—'} icon={<Package className="h-4 w-4" />} />
        <MetricCard label="تاريخ البداية" value={formatDate(subscription.startDate)} icon={<CalendarClock className="h-4 w-4" />} />
        <MetricCard label="تاريخ النهاية" value={formatDate(subscription.endDate)} icon={<Clock className="h-4 w-4" />} />
        <MetricCard label="المقاعد" value={formatNumber(subscription.seats)} icon={<Users className="h-4 w-4" />} />
        <MetricCard label="السعر" value={formatMoney(subscription.price)} icon={<DollarSign className="h-4 w-4" />} />
        <MetricCard label="دورة الفوترة" value={subscription.billingCycle} icon={<RotateCcw className="h-4 w-4" />} />
        <MetricCard label="التجديد التلقائي" value={subscription.autoRenew ? 'نعم' : 'لا'} icon={subscription.autoRenew ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} />
        <MetricCard label="تاريخ الإنشاء" value={formatDate(subscription.createdAt || '')} icon={<CalendarClock className="h-4 w-4" />} />
      </div>

      <div className="flex gap-2">
        <button onClick={() => onAction?.('view', subscription.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-700 hover:bg-emerald-100">
          <Eye className="h-3.5 w-3.5" /> عرض في لوحة التحكم
        </button>
        <button onClick={() => onAction?.('renew', subscription.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
          <RotateCcw className="h-3.5 w-3.5" /> تجديد
        </button>
        <button onClick={() => onAction?.('cancel', subscription.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-100">
          <XCircle className="h-3.5 w-3.5" /> إلغاء
        </button>
        <button onClick={() => onAction?.('change-plan', subscription.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
          <Package className="h-3.5 w-3.5" /> تغيير الباقة
        </button>
      </div>
    </div>
  );

  const renderInvoiceDetail = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="رقم الفاتورة" value={invoice.number} icon={<Wallet className="h-4 w-4" />} />
        <MetricCard label="الحالة" value={<StatusBadge value={invoice.status} />} icon={<Shield className="h-4 w-4" />} />
        <MetricCard label="العميل" value={invoice.tenantName || '—'} icon={<Building2 className="h-4 w-4" />} />
        <MetricCard label="تاريخ الإصدار" value={formatDate(invoice.issueDate)} icon={<CalendarClock className="h-4 w-4" />} />
        <MetricCard label="تاريخ الاستحقاق" value={formatDate(invoice.dueDate)} icon={<Clock className="h-4 w-4" />} />
        <MetricCard label="العملة" value={invoice.currency} icon={<DollarSign className="h-4 w-4" />} />
        <MetricCard label="المجموع الفرعي" value={formatMoney(invoice.subtotal)} icon={<Calculator className="h-4 w-4" />} />
        <MetricCard label="الخصم" value={formatMoney(invoice.discount)} icon={<Tag className="h-4 w-4" />} />
        <MetricCard label="الضريبة" value={formatMoney(invoice.tax)} icon={<Percent className="h-4 w-4" />} />
        <MetricCard label="الإجمالي" value={formatMoney(invoice.total)} icon={<DollarSign className="h-4 w-4" />} />
        <MetricCard label="المدفوع" value={formatMoney(invoice.paidAmount)} icon={<CheckCircle2 className="h-4 w-4" />} />
        <MetricCard label="المتبقي" value={formatMoney(invoice.total - invoice.paidAmount)} icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCard label="تاريخ الإنشاء" value={formatDate(invoice.createdAt)} icon={<CalendarClock className="h-4 w-4" />} />
      </div>

      {invoice.items && invoice.items.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-bold text-slate-700">بنود الفاتورة</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="text-[10.5px] text-slate-500">
                  <th className="px-4 py-2 font-semibold">الوصف</th>
                  <th className="px-4 py-2 font-semibold">الكمية</th>
                  <th className="px-4 py-2 font-semibold">سعر الوحدة</th>
                  <th className="px-4 py-2 font-semibold">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-[12px] font-semibold text-slate-700">{item.description}</td>
                    <td className="px-4 py-2 text-[11px] text-slate-500">{formatNumber(item.quantity)}</td>
                    <td className="px-4 py-2 text-[11px] text-slate-500">{formatMoney(item.unitPrice)}</td>
                    <td className="px-4 py-2 text-[11px] font-bold text-slate-700">{formatMoney(item.total ?? item.quantity * item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => onAction?.('view', invoice.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-700 hover:bg-emerald-100">
          <Eye className="h-3.5 w-3.5" /> عرض في لوحة التحكم
        </button>
        <button onClick={() => onAction?.('pay', invoice.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-600 px-3 py-2 text-[11.5px] font-semibold text-white hover:bg-emerald-700">
          <CreditCard className="h-3.5 w-3.5" /> تسجيل دفعة
        </button>
        <button onClick={() => onAction?.('void', invoice.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-100">
          <XCircle className="h-3.5 w-3.5" /> إلغاء الفاتورة
        </button>
        <button onClick={() => onAction?.('export', invoice.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
          <Download className="h-3.5 w-3.5" /> تصدير
        </button>
      </div>
    </div>
  );

  const renderPaymentDetail = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="المبلغ" value={formatMoney(payment.amount)} icon={<DollarSign className="h-4 w-4" />} />
        <MetricCard label="طريقة الدفع" value={payment.method} icon={<CreditCard className="h-4 w-4" />} />
        <MetricCard label="العميل" value={payment.tenantName || '—'} icon={<Building2 className="h-4 w-4" />} />
        <MetricCard label="رقم الفاتورة" value={payment.invoiceNumber || '—'} icon={<Wallet className="h-4 w-4" />} />
        <MetricCard label="تاريخ الدفع" value={formatDateTime(payment.paidAt)} icon={<CalendarClock className="h-4 w-4" />} />
        <MetricCard label="المرجع" value={payment.reference || '—'} icon={<KeyRound className="h-4 w-4" />} />
        <MetricCard label="ملاحظات" value={payment.notes || '—'} icon={<ScrollText className="h-4 w-4" />} />
      </div>

      <div className="flex gap-2">
        <button onClick={() => onAction?.('view', payment.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-700 hover:bg-emerald-100">
          <Eye className="h-3.5 w-3.5" /> عرض في لوحة التحكم
        </button>
        <button onClick={() => onAction?.('void', payment.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-100">
          <XCircle className="h-3.5 w-3.5" /> إلغاء الدفعة
        </button>
      </div>
    </div>
  );

  const renderDeviceDetail = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="اسم الجهاز" value={device.name || '—'} icon={<Server className="h-4 w-4" />} />
        <MetricCard label="معرف الجهاز" value={device.hardwareId} icon={<KeyRound className="h-4 w-4" />} />
        <MetricCard label="الحالة" value={<StatusBadge value={device.status} />} icon={<Shield className="h-4 w-4" />} />
        <MetricCard label="العميل" value={device.tenantId} icon={<Building2 className="h-4 w-4" />} />
        <MetricCard label="الترخيص" value={device.licenseId || '—'} icon={<KeyRound className="h-4 w-4" />} />
        <MetricCard label="نظام التشغيل" value={device.os || '—'} icon={<Cpu className="h-4 w-4" />} />
        <MetricCard label="إصدار التطبيق" value={device.appVersion || '—'} icon={<Package className="h-4 w-4" />} />
        <MetricCard label="عنوان IP" value={device.ipAddress || '—'} icon={<Wifi className="h-4 w-4" />} />
        <MetricCard label="أول تفعيل" value={formatDate(device.firstActivatedAt)} icon={<CalendarClock className="h-4 w-4" />} />
        <MetricCard label="آخر ظهور" value={formatDateTime(device.lastSeenAt)} icon={<Clock className="h-4 w-4" />} />
        <MetricCard label="اشتباه استنساخ" value={device.cloneSuspected ? 'نعم ⚠️' : 'لا'} icon={device.cloneSuspected ? <AlertTriangle className="h-4 w-4 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
        <MetricCard label="تاريخ الإنشاء" value={formatDate(device.createdAt)} icon={<CalendarClock className="h-4 w-4" />} />
      </div>

      <div className="flex gap-2">
        <button onClick={() => onAction?.('view', device.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-700 hover:bg-emerald-100">
          <Eye className="h-3.5 w-3.5" /> عرض في لوحة التحكم
        </button>
        <button onClick={() => onAction?.('suspend', device.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-700 hover:bg-amber-100">
          <XCircle className="h-3.5 w-3.5" /> إيقاف
        </button>
        <button onClick={() => onAction?.('activate', device.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-700 hover:bg-emerald-100">
          <CheckCircle2 className="h-3.5 w-3.5" /> تفعيل
        </button>
        <button onClick={() => onAction?.('reassign', device.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
          <RotateCcw className="h-3.5 w-3.5" /> إعادة تخصيص
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (type) {
      case 'tenant': return renderTenantDetail();
      case 'license': return renderLicenseDetail();
      case 'subscription': return renderSubscriptionDetail();
      case 'invoice': return renderInvoiceDetail();
      case 'payment': return renderPaymentDetail();
      case 'device': return renderDeviceDetail();
      default: return <div>نوع غير معروف</div>;
    }
  };

  const getHeaderValue = (type: string, data: PlatformTenant | PlatformLicense | PlatformSubscription | PlatformInvoice | PlatformPayment | PlatformDevice): string => {
    switch (type) {
      case 'tenant': return (data as PlatformTenant).name;
      case 'license': return (data as PlatformLicense).licenseKey;
      case 'subscription': return (data as PlatformSubscription).planName || '—';
      case 'invoice': return (data as PlatformInvoice).number;
      case 'payment': return formatMoney((data as PlatformPayment).amount);
      case 'device': return (data as PlatformDevice).hardwareId;
      default: return '—';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-t-2xl border-b border-slate-100 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${typeColors[type]}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{typeLabels[type]}</h2>
              <p className="text-sm text-slate-500">{getHeaderValue(type, data)}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="p-4">{renderContent()}</div>
      </div>
    </div>
  );
};

export default DrillDownDetail;