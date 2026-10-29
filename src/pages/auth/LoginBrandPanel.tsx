import React from 'react';
import { BarChart3, Database, ShieldCheck, WifiOff } from 'lucide-react';

const features = [
  { icon: ShieldCheck, title: 'صلاحيات دقيقة', description: 'لكل موظف وكل وحدة داخل النظام' },
  { icon: Database, title: 'قاعدة بيانات محلية', description: 'معاملات آمنة وسجل تدقيق كامل' },
  { icon: WifiOff, title: 'يعمل دون إنترنت', description: 'كل بيانات معرضك تبقى على جهازك' },
  { icon: BarChart3, title: 'تقارير فورية', description: 'مبيعات ومخزون وحسابات في مكان واحد' },
];

export const LoginBrandPanel: React.FC = () => (
  <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-[#0078d4] p-10 text-white lg:flex">
    {/* Decorative grid keeps the flat Windows look without gradients. */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-[0.07]"
      style={{
        backgroundImage:
          'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }}
    />

    <div className="relative flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center border border-white/40 bg-white/10 text-xl font-bold">
        س
      </div>
      <div>
        <h1 className="text-lg font-semibold tracking-wide">سيراميسيس</h1>
        <p className="text-[11px] text-white/80">نظام إدارة معارض السيراميك ومواد التشطيب</p>
      </div>
    </div>

    <div className="relative">
      <h2 className="text-2xl font-semibold leading-snug">
        كل معرضك في مكان واحد
      </h2>
      <p className="mt-1 text-[12.5px] text-white/85">مبيعات، مخزون، حسابات وتقارير — بسرعة وأمان.</p>

      <ul className="mt-6 grid grid-cols-1 gap-2.5">
        {features.map(({ icon: Icon, title, description }) => (
          <li
            key={title}
            className="flex items-start gap-3 border border-white/15 bg-white/[0.06] px-3 py-2.5"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-white/90" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-semibold leading-tight">{title}</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-white/75">{description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>

    <div className="relative flex items-center justify-between border-t border-white/20 pt-4 text-[10px] text-white/70">
      <span>سيراميسيس · ترخيص تجاري</span>
      <span className="flex items-center gap-1">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        اتصال محلي آمن
      </span>
    </div>
  </aside>
);
