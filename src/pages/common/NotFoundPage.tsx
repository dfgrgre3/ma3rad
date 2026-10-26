import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  FileQuestion, ArrowRight, LayoutDashboard, ShoppingCart,
  Package, Users, Handshake, Settings, Search, FileSpreadsheet
} from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const quickLinks = [
    { label: 'لوحة المعلومات', to: '/dashboard', icon: LayoutDashboard, color: 'text-sky-600 bg-sky-50 hover:bg-sky-100' },
    { label: 'المبيعات', to: '/sales', icon: ShoppingCart, color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' },
    { label: 'دليل المنتجات', to: '/products', icon: Package, color: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' },
    { label: 'حسابات العملاء', to: '/customers', icon: Users, color: 'text-violet-600 bg-violet-50 hover:bg-violet-100' },
    { label: 'الموردون والمصانع', to: '/suppliers', icon: Handshake, color: 'text-amber-600 bg-amber-50 hover:bg-amber-100' },
    { label: 'مركز الاستيراد', to: '/data-import', icon: FileSpreadsheet, color: 'text-cyan-600 bg-cyan-50 hover:bg-cyan-100' },
    { label: 'إعدادات النظام', to: '/settings', icon: Settings, color: 'text-slate-600 bg-slate-100 hover:bg-slate-200' },
  ];

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-slate-100/60 text-slate-900" dir="rtl">
      <div className="w-full max-w-xl mx-auto text-center space-y-6">
        {/* Animated Badge & Visual Icon */}
        <div className="relative inline-flex items-center justify-center">
          <div className="absolute inset-0 bg-sky-500/20 blur-2xl rounded-full" />
          <div className="relative w-24 h-24 rounded-3xl bg-white border border-slate-200/80 shadow-xl shadow-slate-200/50 flex items-center justify-center text-sky-600">
            <FileQuestion className="w-12 h-12 stroke-[1.75]" />
          </div>
        </div>

        {/* 404 Tag */}
        <div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase bg-rose-50 text-rose-600 border border-rose-200 mb-2">
            خطأ 404 — الصفحة غير موجودة
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            عذراً، لم نتمكن من العثور على الصفحة المطلوبة
          </h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-md mx-auto">
            يبدو أن الرابط الذي حاولت الوصول إليه قد تم نقله أو تغييره، أو ربما تم كتابة المسار بشكل غير صحيح.
          </p>
        </div>

        {/* Requested Path Box */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm text-xs text-slate-600 max-w-full">
          <span className="text-slate-400 font-bold">المسار المطلوب:</span>
          <code className="font-mono font-bold text-rose-600 truncate max-w-xs" dir="ltr">
            {location.pathname}
          </code>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-sm transition active:scale-95"
          >
            <ArrowRight className="w-4 h-4" />
            <span>الرجوع للصفحة السابقة</span>
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm shadow-lg shadow-sky-600/25 transition active:scale-95"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>لوحة المعلومات الرئيسية</span>
          </button>
        </div>

        {/* Quick Links Section */}
        <div className="mt-8 pt-6 border-t border-slate-200/80 space-y-3">
          <span className="text-xs font-bold text-slate-400 block">
            أو يمكنك الانتقال مباشرة إلى الأقسام الأكثر استخداماً:
          </span>
          <div className="flex flex-wrap justify-center gap-2">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border border-transparent ${item.color}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
