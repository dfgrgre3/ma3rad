import React, { useState } from 'react';
import {
  Building2,
  Lock,
  Mail,
  Receipt,
  CalendarClock,
  KeyRound,
  Download,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  LogOut,
  CreditCard,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { formatMoney, formatDate, inputClass } from './components/PlatformUI';

export const PlatformCustomerPortalSimulatorPage: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginForm, setLoginForm] = useState({
    tenantCode: 'TC-2026-001',
    password: '••••••••',
  });

  // Simulated Tenant Data in portal view
  const tenantData = {
    name: 'معرض الأهرام للسيراميك والبورسلين',
    code: 'TC-2026-001',
    planName: 'باقة المعارض المتكاملة (Professional)',
    status: 'ACTIVE',
    subscriptionExpiresAt: '2027-11-30',
    deviceLimit: 5,
    devicesUsed: 3,
    licenseKey: 'CS-LIC-9921-X812-7711-PRO',
    invoices: [
      { id: 'inv_101', number: 'INV-2026-081', amount: 14500, status: 'PAID', dueDate: '2026-11-01' },
      { id: 'inv_102', number: 'INV-2026-012', amount: 12000, status: 'PAID', dueDate: '2025-11-01' },
    ],
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggedIn(true);
  };

  return (
    <div className="space-y-4 text-right">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 mb-4">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <span className="font-bold">تنبيه هندسي:</span> هذه الصفحة ل simulator بوداعة العملاء، وليست بوابة عملاء إنتاجية. البيانات والمنطق المعروض في الواجهة ليست بواجهة مستخدم حقيقية قادرة على تسجيل الدخول والتفاعل مع البوابة الإنتاجية للمستخدم. لا تعتمد عليها في مراحل الإعداد البري أو في الإنتاج.
        </p>
      </div>

      <PageHeader
        title="بوابة العملاء المركزية (Customer Portal Experience)"
        description="الواجهة المخصصة للعميل النهائي للاطلاع على تفاصيل اشتراكه، تحميل فواتيره، والتحقق من التراخيص."
        icon={<Building2 className="h-5 w-5 text-sky-400" />}
      />

      {!isLoggedIn ? (
        <div className="max-w-md mx-auto my-12 p-6 bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl space-y-4">
          <div className="text-center space-y-1">
            <div className="h-12 w-12 bg-sky-500/20 text-sky-400 rounded-xl flex items-center justify-center mx-auto mb-2">
              <Building2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-100">تسجيل الدخول لبوابة العميل</h3>
            <p className="text-xs text-slate-400">تابع اشتراكاتك وفواتيرك وتراخيص أجهزتك</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">كود المنشأة / العميل (Tenant Code)</label>
              <input
                type="text"
                value={loginForm.tenantCode}
                onChange={(e) => setLoginForm({ ...loginForm, tenantCode: e.target.value })}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">كلمة المرور</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className={inputClass}
                required
              />
            </div>

            <Button type="submit" className="w-full mt-2" size="sm">
              الدخول للحساب
            </Button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tenant Portal Top Bar */}
          <div className="flex flex-wrap justify-between items-center bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>{tenantData.name}</span>
                <span className="text-xs font-mono bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded">
                  {tenantData.code}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">الباقة المفعلة: {tenantData.planName}</p>
            </div>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsLoggedIn(false)}
              leadingIcon={<LogOut className="h-3.5 w-3.5" />}
            >
              تسجيل خروج العميل
            </Button>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-emerald-400" />
                حالة الاشتراك
              </span>
              <p className="text-lg font-black text-emerald-400">ساري ونشط</p>
              <p className="text-[11px] text-slate-400">ينتهي في: {formatDate(tenantData.subscriptionExpiresAt)}</p>
            </div>

            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <KeyRound className="h-4 w-4 text-sky-400" />
                تراخيص الأجهزة المسجلة
              </span>
              <p className="text-lg font-black text-slate-100">
                {tenantData.devicesUsed} / {tenantData.deviceLimit} جهاز
              </p>
              <p className="text-[11px] text-slate-400">متبقي جهازين متاحين للربط</p>
            </div>

            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-purple-400" />
                الرصيد والمستحقات
              </span>
              <p className="text-lg font-black text-slate-100">0.00 ج.م</p>
              <p className="text-[11px] text-emerald-400 font-semibold">لا توجد فواتير متأخرة</p>
            </div>
          </div>

          {/* Invoices List */}
          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-emerald-400" />
              سجل الفواتير والمدفوعات
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="border-b border-slate-800 text-[11px] font-bold text-slate-400">
                  <tr>
                    <th className="py-2.5 px-3">رقم الفاتورة</th>
                    <th className="py-2.5 px-3">القيمة</th>
                    <th className="py-2.5 px-3">تاريخ الاستحقاق</th>
                    <th className="py-2.5 px-3">الحالة</th>
                    <th className="py-2.5 px-3 text-center">الإيصال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tenantData.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-200">{inv.number}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-100">{formatMoney(inv.amount)}</td>
                      <td className="py-2.5 px-3 text-slate-400">{formatDate(inv.dueDate)}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-[10px]">
                          مدفوعة بالكامل
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => alert(`تحميل نسخة PDF من الفاتورة ${inv.number}`)}
                          className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1 mx-auto"
                        >
                          <Download className="h-3 w-3" />
                          تحميل PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformCustomerPortalSimulatorPage;
