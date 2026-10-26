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
            <p className="text-xs text-sky-100">Ù†Ø¸Ø§Ù… Ø¥Ø¯Ø§Ø±Ø© Ù…Ø¹Ø§Ø±Ø¶ Ø§Ù„Ø³ÙŠØ±Ø§Ù…ÙŠÙƒ ÙˆÙ…ÙˆØ§Ø¯ Ø§Ù„ØªØ´Ø·ÙŠØ¨</p>
          </div>
        </div>

        <div className="relative space-y-4">
          <h2 className="text-3xl font-black leading-snug">
            ÙƒÙ„ Ù…Ø¹Ø±Ø¶Ùƒ ÙÙŠ Ù…ÙƒØ§Ù† ÙˆØ§Ø­Ø¯
            <br />
            <span className="text-sky-200">Ù…Ø¨ÙŠØ¹Ø§ØªØŒ Ù…Ø®Ø²ÙˆÙ†ØŒ Ø­Ø³Ø§Ø¨Ø§Øª ÙˆØªÙ‚Ø§Ø±ÙŠØ±</span>
          </h2>
          <ul className="space-y-3 text-sm text-sky-50">
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-300" /> ØµÙ„Ø§Ø­ÙŠØ§Øª Ø¯Ù‚ÙŠÙ‚Ø© Ù„ÙƒÙ„ Ù…ÙˆØ¸Ù ÙˆÙƒÙ„ ÙˆØ­Ø¯Ø©</li>
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-300" /> ÙŠØ¹Ù…Ù„ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ Ø¨Ø¯ÙˆÙ† Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ø¥Ù†ØªØ±Ù†Øª</li>
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-sky-300" /> Ù‚Ø§Ø¹Ø¯Ø© Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø­Ù„ÙŠØ© Ø¨Ù…Ø¹Ø§Ù…Ù„Ø§Øª Ø¢Ù…Ù†Ø© ÙˆØ³Ø¬Ù„ ØªØ¯Ù‚ÙŠÙ‚</li>
          </ul>
        </div>

        <p className="relative text-[11px] text-sky-200">CeramiSys ERP v1.0 â€” Commercial License</p>
      </div>
);
