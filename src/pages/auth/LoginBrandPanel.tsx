import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const LoginBrandPanel: React.FC = () => (
<div className="hidden lg:flex flex-col justify-between w-[44%] bg-gradient-to-br from-sky-600 via-sky-700 to-indigo-800 text-white p-10 relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-white/10" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-white/5" />

        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center font-black text-2xl">
            C
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wide">CeramiSys ERP</h1>
            <p className="text-xs text-sky-100">نظام إدارة معارض السيراميك ومواد التشطيب</p>
          </div>
        </div>

        <div className="relative space-y-4">
          <h2 className="text-3xl font-black leading-snug">
            كل معرضك في مكان واحد
            <br />
            <span className="text-sky-200">مبيعات، مخزون، حسابات وتقارير</span>
          </h2>
          <ul className="space-y-3 text-sm text-sky-50">
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-300" /> صلاحيات دقيقة لكل موظف وكل وحدة</li>
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-300" /> يعمل بالكامل دون اتصال بالإنترنت</li>
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-300" /> قاعدة بيانات محلية بمعاملات آمنة وسجل تدقيق</li>
          </ul>
        </div>

        <p className="relative text-[11px] text-sky-200">CeramiSys ERP v1.0 â€” Commercial License</p>
      </div>
);
