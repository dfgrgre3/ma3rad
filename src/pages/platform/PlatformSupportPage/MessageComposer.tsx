import React from 'react';
import { Send } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { PlatformCannedReply } from '../../../services/domains/platform/platformTypes';
import { inputClass } from '../components/PlatformUI';

interface MessageComposerProps {
  cannedReplies: PlatformCannedReply[];
  onInsertCannedReply: (body: string) => void;
  messageBody: string;
  onMessageBodyChange: (v: string) => void;
  isInternal: boolean;
  onIsInternalChange: (v: boolean) => void;
  attachmentUrl: string;
  onAttachmentUrlChange: (v: string) => void;
  sendingMessage: boolean;
  onSend: () => void;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  cannedReplies,
  onInsertCannedReply,
  messageBody,
  onMessageBodyChange,
  isInternal,
  onIsInternalChange,
  attachmentUrl,
  onAttachmentUrlChange,
  sendingMessage,
  onSend,
}) => (
  <div className="border-t border-slate-800 p-3 bg-slate-950/70 space-y-2">
    {/* Canned replies pill list */}
    {cannedReplies.length > 0 && (
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
        <span className="text-slate-500 shrink-0 font-semibold">ردود جاهزة:</span>
        {cannedReplies.map((c) => (
          <button
            key={c.id}
            onClick={() => onInsertCannedReply(c.body)}
            className="shrink-0 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-0.5 text-slate-300 hover:text-white transition-colors"
          >
            {c.title}
          </button>
        ))}
      </div>
    )}

    {/* Textarea */}
    <div className="relative">
      <textarea
        rows={3}
        value={messageBody}
        onChange={(e) => onMessageBodyChange(e.target.value)}
        placeholder={
          isInternal
            ? 'اكتب ملاحظة داخلية لفريق الدعم فقط (لا تظهر للعميل)...'
            : 'اكتب ردًا للعميل...'
        }
        className={`${inputClass} text-xs resize-none ${
          isInternal ? 'border-amber-500/50 focus:border-amber-500' : ''
        }`}
      />
    </div>

    {/* Composer controls */}
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => onIsInternalChange(e.target.checked)}
            className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500"
          />
          <span className={isInternal ? 'text-amber-400 font-bold' : ''}>
            رسالة داخلية فقط
          </span>
        </label>

        <input
          type="text"
          value={attachmentUrl}
          onChange={(e) => onAttachmentUrlChange(e.target.value)}
          placeholder="رابط المرفق (اختياري)"
          className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 max-w-[160px]"
        />
      </div>

      <Button
        size="sm"
        onClick={onSend}
        disabled={sendingMessage || !messageBody.trim()}
        variant={isInternal ? 'secondary' : 'primary'}
        leadingIcon={<Send className="h-3.5 w-3.5" />}
      >
        {isInternal ? 'إرسال داخلي' : 'إرسال للعميل'}
      </Button>
    </div>
  </div>
);
