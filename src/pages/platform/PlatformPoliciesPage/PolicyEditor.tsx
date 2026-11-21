import React, { useEffect, useMemo, useState } from 'react';
import {
  Save,
  Send,
  CheckCircle2,
  XCircle,
  History,
  Eye,
  EyeOff,
  FileWarning,
  Info,
  GitCompare,
} from 'lucide-react';
import type { PlatformPolicyDocumentDetail } from '../../../services/domains/platform/platformTypes';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { inputClass, formatDateTime, StatusBadge, EmptyState } from '../components/PlatformUI';
import { POLICY_STATUS_LABELS, POLICY_STATUS_HINTS } from './constants';

export interface PolicyEditorProps {
  detail: PlatformPolicyDocumentDetail | null;
  detailSlug: string | null;
  loading: boolean;
  /** Which mutation is in-flight, if any. */
  actionBusy: string | null;
  canUpdate: boolean;
  canApprove: boolean;
  onSaveDraft(input: { slug: string; title?: string; content: string; changeSummary?: string }): Promise<void>;
  onSubmit(slug: string): Promise<void>;
  onApprove(slug: string): Promise<void>;
  onReject(slug: string, reviewNote?: string): Promise<void>;
  onOpenHistory(): void;
}

export const PolicyEditor: React.FC<PolicyEditorProps> = ({
  detail,
  detailSlug,
  loading,
  actionBusy,
  canUpdate,
  canApprove,
  onSaveDraft,
  onSubmit,
  onApprove,
  onReject,
  onOpenHistory,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [preview, setPreview] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  // Re-sync the form whenever the loaded document's editable state changes
  // (slug switch, status transition, or a completed save bumps draftUpdatedAt).
  const syncKey = detail
    ? `${detail.id}|${detail.status}|${detail.draftUpdatedAt ?? ''}|${detail.currentVersionId ?? ''}`
    : 'empty';
  useEffect(() => {
    setTitle(detail?.title ?? '');
    setContent(detail?.draftContent ?? '');
    setChangeSummary(detail?.draftChangeSummary ?? '');
    setPreview(false);
    setRejectOpen(false);
    setRejectNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  const dirty = useMemo(() => {
    if (!detail) return false;
    return (
      title !== detail.title ||
      content !== detail.draftContent ||
      changeSummary !== (detail.draftChangeSummary ?? '')
    );
  }, [detail, title, content, changeSummary]);

  const differsFromPublished = useMemo(() => {
    if (!detail) return false;
    return detail.publishedContent == null || detail.draftContent !== detail.publishedContent;
  }, [detail]);

  if (!detailSlug) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface p-8">
        <EmptyState
          icon={<FileWarning className="h-6 w-6" />}
          title="اختر وثيقة سياسة من القائمة"
          description="حدد أي سياسة لعرض مسودتها ونسختها المنشورة وسجل إصداراتها."
        />
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-line bg-surface p-8 text-sm font-semibold text-muted">
        جارٍ تحميل الوثيقة...
      </div>
    );
  }

  const status = detail.status;
  const busy = actionBusy !== null;
  const currentUser = AuthService.getCurrentUser();
  const selfSubmitted =
    status === 'PENDING_APPROVAL' &&
    Boolean(detail.submittedBy) &&
    currentUser?.id === detail.submittedBy &&
    currentUser?.role !== 'SUPER_ADMIN';
  const canEditDraft = canUpdate && status !== 'PENDING_APPROVAL';

  const handleSave = async () => {
    await onSaveDraft({
      slug: detail.slug,
      title: title.trim() || undefined,
      content,
      changeSummary: changeSummary.trim() || undefined,
    });
  };

  const handleSubmit = async () => {
    if (dirty) await onSaveDraft({ slug: detail.slug, title: title.trim() || undefined, content, changeSummary: changeSummary.trim() || undefined });
    await onSubmit(detail.slug);
  };

  const handleReject = async () => {
    await onReject(detail.slug, rejectNote.trim() || undefined);
    setRejectOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${
          status === 'PUBLISHED'
            ? 'border-success/30 bg-success/5'
            : status === 'PENDING_APPROVAL'
            ? 'border-warning/40 bg-warning/10'
            : 'border-line bg-surface-sunken'
        }`}
      >
        <div className="flex items-center gap-3">
          <StatusBadge value={status} label={POLICY_STATUS_LABELS[status]} />
          <div className="text-[11px] leading-5 text-muted">
            <p>{POLICY_STATUS_HINTS[status]}</p>
            {status === 'PUBLISHED' && detail.publishedAt && (
              <p>آخر نشر: {formatDateTime(detail.publishedAt)} — الإصدار #{detail.currentVersion ?? '—'}</p>
            )}
            {detail.reviewNote && status === 'DRAFT' && (
              <p className="font-bold text-warning">ملاحظة المراجع: {detail.reviewNote}</p>
            )}
            {selfSubmitted && (
              <p className="font-bold text-warning">قدّمت هذه المسودة بنفسك — يتطلب الاعتماد مستخدماً آخر.</p>
            )}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onOpenHistory} leadingIcon={<History className="h-4 w-4" />}>
          سجل الإصدارات ({detail.versions.length})
        </Button>
      </div>

      {differsFromPublished && status !== 'PENDING_APPROVAL' && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] font-semibold text-primary">
          <GitCompare className="h-4 w-4" />
          المسودة الحالية تختلف عن النسخة المنشورة — ستحتاج اعتماداً ونشراً لتصبح نافذة.
        </div>
      )}

      {/* Editor card */}
      <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="block flex-1 min-w-[220px]">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink">عنوان الوثيقة</span>
            <input
              className={inputClass}
              value={title}
              disabled={!canEditDraft}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-2 pt-5">
            <Button
              size="sm"
              variant={preview ? 'primary' : 'ghost'}
              onClick={() => setPreview((v) => !v)}
              leadingIcon={preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            >
              {preview ? 'تحرير' : 'معاينة'}
            </Button>
          </div>
        </div>

        {preview ? (
          <div className="min-h-[320px] rounded-lg border border-line bg-surface-sunken p-4 text-sm leading-7 text-ink whitespace-pre-wrap">
            {content || '— لا يوجد محتوى —'}
          </div>
        ) : (
          <textarea
            rows={16}
            value={content}
            disabled={!canEditDraft}
            onChange={(e) => setContent(e.target.value)}
            className={`${inputClass} leading-relaxed font-sans`}
            placeholder="اكتب نص السياسة هنا..."
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink">ملخص التغيير (اختياري)</span>
            <input
              className={inputClass}
              value={changeSummary}
              disabled={!canEditDraft}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder="مثال: تحديث بند إتاحة الخدمة"
            />
          </label>
          <div className="flex items-end justify-between gap-2 text-[10.5px] text-muted">
            <span>{content.length.toLocaleString('ar-EG')} حرف</span>
            <span dir="ltr">{detail.slug}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {canUpdate && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSave}
                disabled={busy || !dirty}
                loading={actionBusy === 'save'}
                leadingIcon={<Save className="h-4 w-4" />}
              >
                حفظ المسودة
              </Button>
            )}
            {canUpdate && status === 'DRAFT' && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleSubmit}
                disabled={busy || !content.trim()}
                loading={actionBusy === 'submit'}
                leadingIcon={<Send className="h-4 w-4" />}
              >
                تقديم للاعتماد
              </Button>
            )}
          </div>

          {canApprove && status === 'PENDING_APPROVAL' && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={() => setRejectOpen(true)}
                disabled={busy}
                leadingIcon={<XCircle className="h-4 w-4" />}
              >
                رفض
              </Button>
              <Button
                size="sm"
                variant="success"
                onClick={() => onApprove(detail.slug)}
                disabled={busy || selfSubmitted}
                loading={actionBusy === 'approve'}
                leadingIcon={<CheckCircle2 className="h-4 w-4" />}
              >
                اعتماد ونشر
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Published snapshot reference */}
      {detail.publishedContent != null && (
        <details className="rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-xs font-bold text-muted flex items-center gap-2">
            <Info className="h-4 w-4" />
            عرض النسخة المنشورة حالياً (للقراءة فقط)
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-sunken p-3 text-xs leading-6 text-ink">
            {detail.publishedContent}
          </pre>
        </details>
      )}

      {/* Reject modal */}
      <Modal
        open={rejectOpen}
        onClose={() => !busy && setRejectOpen(false)}
        title="رفض السياسة المقدمة"
        description="سيتم إرجاع المسودة إلى حالة «مسودة» مع تسجيل ملاحظتك للمحرر."
        icon={<XCircle className="h-5 w-5" />}
        size="sm"
        busy={busy}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={busy}>إلغاء</Button>
            <Button variant="danger" onClick={handleReject} loading={actionBusy === 'reject'}>تأكيد الرفض</Button>
          </div>
        }
      >
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink">ملاحظة الرفض (اختياري)</span>
          <textarea
            rows={4}
            className={inputClass}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="اشرح سبب الرفض أو ما يجب تعديله..."
          />
        </label>
      </Modal>
    </div>
  );
};

export default PolicyEditor;
