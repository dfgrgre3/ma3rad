import React from 'react';
import { Lock, Paperclip } from 'lucide-react';
import type { PlatformSupportMessage } from '../../../services/domains/platform/platformTypes';
import { formatDateTime } from '../components/PlatformUI';

interface ChatTimelineProps {
  messages: PlatformSupportMessage[];
}

export const ChatTimeline: React.FC<ChatTimelineProps> = ({ messages }) => (
  <div className="flex-1 overflow-y-auto p-4 space-y-3.5 max-h-[380px]">
    {messages.length === 0 ? (
      <div className="py-12 text-center text-xs text-slate-500">
        لا توجد رسائل بعد. ابدأ المحادثة مع العميل من نافذة المحادثة.
      </div>
    ) : (
      messages.map((msg) => {
        const isInternalMsg = Boolean(msg.isInternal);
        const isSystem = msg.authorRole === 'SYSTEM';
        const isSupport = msg.authorRole === 'SUPPORT';

        if (isSystem) {
          return (
            <div key={msg.id} className="flex justify-center my-2">
              <span className="rounded-full bg-slate-800/80 px-3 py-1 text-[11px] text-slate-400 border border-slate-700/50">
                {msg.body} • {formatDateTime(msg.createdAt)}
              </span>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${
              isInternalMsg
                ? 'items-center'
                : isSupport
                ? 'items-start'
                : 'items-end'
            }`}
          >
            <div
              className={`max-w-[85%] rounded-xl p-3 text-xs shadow-sm ${
                isInternalMsg
                  ? 'border border-amber-500/40 bg-amber-950/30 text-amber-200 w-full'
                  : isSupport
                  ? 'border border-slate-700 bg-slate-800 text-slate-100'
                  : 'border border-emerald-800/60 bg-emerald-950/40 text-emerald-100'
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-[10.5px] mb-1.5 opacity-80">
                <span className="font-bold flex items-center gap-1">
                  {isInternalMsg && <Lock className="h-3 w-3 text-amber-400" />}
                  {msg.authorName} {isInternalMsg && '(رسالة داخلية — لا تظهر للعميل)'}
                </span>
                <span>{formatDateTime(msg.createdAt)}</span>
              </div>

              <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>

              {msg.attachmentUrl && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <a
                    href={msg.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:underline"
                  >
                    <Paperclip className="h-3 w-3" />
                    {msg.attachmentName || 'مرفق'}
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })
    )}
  </div>
);
