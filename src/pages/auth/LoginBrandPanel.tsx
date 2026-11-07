import React from 'react';
import { BarChart3, Database, ShieldCheck, WifiOff } from 'lucide-react';

const features = [
  { icon: ShieldCheck, title: 'صلاحيات دقيقة', description: 'لكل موظف وكل وحدة داخل النظام' },
  { icon: Database, title: 'قاعدة بيانات محلية', description: 'معاملات آمنة وسجل تدقيق كامل' },
  { icon: WifiOff, title: 'يعمل دون إنترنت', description: 'كل بيانات معرضك تبقى على جهازك' },
  { icon: BarChart3, title: 'تقارير فورية', description: 'مبيعات ومخزون وحسابات في مكان واحد' },
];

export const LoginBrandPanel: React.FC = () => (
  <aside className="win-auth-brand relative hidden w-[42%] flex-col justify-between overflow-hidden p-10 text-white lg:flex">
    <div
      aria-hidden="true"
      className="win-auth-mosaic pointer-events-none absolute inset-0"
    />

    <div className="relative flex items-center gap-3">
      <div className="win-auth-brand-mark flex h-11 w-11 items-center justify-center text-xl font-bold">
        س
      </div>
      <div>
        <h1 className="text-lg font-semibold">سيراميسيس</h1>
        <p className="text-xs text-white/80">إدارة متكاملة لمعرضك</p>
      </div>
    </div>

    <div className="relative">
      <p className="mb-3 text-xs font-semibold tracking-wide text-[#c2d8d0]">من صالة العرض إلى دفتر الحسابات</p>
      <h2 className="max-w-[440px] text-3xl font-semibold leading-[1.45]">
        كل قطعة، وكل عملية،
        <span className="block text-[#b8d5ca]">في صورة واحدة واضحة.</span>
      </h2>
      <p className="mt-3 max-w-[390px] text-sm leading-6 text-white/80">
        نظام واحد يربط المبيعات بالمخزون والحسابات، لتبقى تفاصيل معرضك في مكانها.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-x-7">
        {features.map(({ icon: Icon, title, description }, index) => (
          <li key={title} className="win-auth-feature">
            <div className="mb-2 flex items-center gap-2 text-[#c2d8d0]">
              <span className="font-mono text-[11px] tabular-nums">0{index + 1}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-white/20" />
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            </div>
            <p className="text-[13px] font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/75">{description}</p>
          </li>
        ))}
      </ul>
    </div>

    <div className="relative flex items-center justify-between border-t border-white/20 pt-4 text-xs text-white/80">
      <span>سيراميسيس <span className="mx-1 text-white/45">/</span> نظام المعرض</span>
      <span className="flex items-center gap-1">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        اتصال محلي آمن
      </span>
    </div>
  </aside>
);
