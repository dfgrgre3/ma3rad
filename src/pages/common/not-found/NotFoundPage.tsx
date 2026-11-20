import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  FileQuestion, ArrowRight, LayoutDashboard, ShoppingCart,
  Package, Users, Handshake, Settings, FileSpreadsheet
} from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const quickLinks = [
    { label: 'لوحة المعلومات', to: '/dashboard', icon: LayoutDashboard, color: 'text-primary bg-accent-soft hover:bg-accent-soft' },
    { label: 'المبيعات', to: '/sales', icon: ShoppingCart, color: 'text-success bg-success-soft hover:bg-success-soft' },
    { label: 'دليل المنتجات', to: '/products', icon: Package, color: 'text-primary bg-accent-soft hover:bg-accent-soft' },
    { label: 'حسابات العملاء', to: '/customers', icon: Users, color: 'text-primary bg-accent-soft hover:bg-accent-soft' },
    { label: 'الموردون والمصانع', to: '/suppliers', icon: Handshake, color: 'text-warning bg-warning-soft hover:bg-warning-soft' },
    { label: 'مركز الاستيراد', to: '/data-import', icon: FileSpreadsheet, color: 'text-primary bg-accent-soft hover:bg-accent-soft' },
    { label: 'إعدادات النظام', to: '/settings', icon: Settings, color: 'text-ink-secondary bg-surface-sunken hover:bg-surface-sunken' },
  ];

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-line to-line/60 text-ink">
      <div className="w-full max-w-xl mx-auto text-center space-y-6">
        {/* Animated Badge & Visual Icon */}
        <div className="relative inline-flex items-center justify-center">
          <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
          <div className="relative w-24 h-24 rounded-3xl bg-surface border border-line/80 shadow-xl shadow-ink/50 flex items-center justify-center text-primary">
            <FileQuestion className="w-12 h-12 stroke-[1.75]" />
          </div>
        </div>

        {/* 404 Tag */}
        <div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase bg-danger-soft text-danger border border-danger-border mb-2">
            خطأ 404 — الصفحة غير موجودة
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
            عذراً، لم نتمكن من العثور على الصفحة المطلوبة
          </h1>
          <p className="mt-2 text-sm text-muted leading-relaxed max-w-md mx-auto">
            يبدو أن الرابط الذي حاولت الوصول إليه قد تم نقله أو تغييره، أو ربما تم كتابة المسار بشكل غير صحيح.
          </p>
        </div>

        {/* Requested Path Box */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-surface rounded-xl border border-line shadow-sm text-xs text-ink-secondary max-w-full">
          <span className="text-muted font-bold">المسار المطلوب:</span>
          <code className="font-mono font-bold text-danger truncate max-w-xs" dir="ltr">
            {location.pathname}
          </code>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-line hover:bg-surface-muted text-ink font-bold text-sm shadow-sm transition active:scale-95"
          >
            <ArrowRight className="w-4 h-4" />
            <span>الرجوع للصفحة السابقة</span>
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary text-white font-bold text-sm shadow-lg shadow-primary/25 transition active:scale-95"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>لوحة المعلومات الرئيسية</span>
          </button>
        </div>

        {/* Quick Links Section */}
        <div className="mt-8 pt-6 border-t border-line/80 space-y-3">
          <span className="text-xs font-bold text-muted block">
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
