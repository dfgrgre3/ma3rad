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
  <div className="border-t border-line-strong p-3 bg-primary/70 space-y-2">
    {/* Canned replies pill list */}
    {cannedReplies.length > 0 && (
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
        <span className="text-muted shrink-0 font-semibold">ردود جاهزة:</span>
        {cannedReplies.map((c) => (
          <button
            key={c.id}
            onClick={() => onInsertCannedReply(c.body)}
            className="shrink-0 rounded-md bg-primary hover:bg-primary border border-line-strong px-2 py-0.5 text-muted hover:text-white transition-colors"
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
          isInternal ? 'border-warning/50 focus:border-warning' : ''
        }`}
      />
    </div>

    {/* Composer controls */}
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => onIsInternalChange(e.target.checked)}
            className="rounded border-line-strong bg-primary text-warning focus:ring-warning"
          />
          <span className={isInternal ? 'text-warning font-bold' : ''}>
            رسالة داخلية فقط
          </span>
        </label>

        <input
          type="text"
          value={attachmentUrl}
          onChange={(e) => onAttachmentUrlChange(e.target.value)}
          placeholder="رابط المرفق (اختياري)"
          className="rounded border border-line-strong bg-primary px-2 py-1 text-[11px] text-muted max-w-[160px]"
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
