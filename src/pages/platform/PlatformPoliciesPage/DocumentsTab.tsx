import React, { useMemo, useState } from 'react';
import {
  FileText,
  Cookie,
  Clock,
  Handshake,
  ShieldCheck,
  FileCheck,
  Plus,
  Search,
  CircleDot,
} from 'lucide-react';
import type {
  PlatformPolicyDocumentRecord,
  PlatformPolicyDocumentStatus,
} from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { inputClass, formatDateTime, StatusBadge, EmptyState } from '../components/PlatformUI';
import { POLICY_STATUS_LABELS } from './constants';
import { PolicyEditor } from './PolicyEditor';
import type { PolicyEditorProps } from './PolicyEditor';

const SLUG_ICONS: Record<string, React.ReactNode> = {
  terms: <FileText className="h-4 w-4" />,
  privacy: <ShieldCheck className="h-4 w-4" />,
  cookies: <Cookie className="h-4 w-4" />,
  sla: <Clock className="h-4 w-4" />,
  'acceptable-use': <Handshake className="h-4 w-4" />,
  security: <ShieldCheck className="h-4 w-4" />,
};

const slugToLatin = (title: string): string =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

interface DocumentsTabProps extends PolicyEditorProps {
  documents: PlatformPolicyDocumentRecord[];
  onSelect: (slug: string) => void;
  onCreated: (slug: string) => void;
  canCreate: boolean;
  canExport: boolean;
}

export const DocumentsTab: React.FC<DocumentsTabProps> = ({
  documents,
  detailSlug,
  onSelect,
  onCreated,
  canCreate,
  ...editorProps
}) => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter(
      (doc) => doc.title.toLowerCase().includes(term) || doc.slug.toLowerCase().includes(term)
    );
  }, [documents, search]);

  const counts = useMemo(() => {
    const result: Record<PlatformPolicyDocumentStatus, number> = { PUBLISHED: 0, PENDING_APPROVAL: 0, DRAFT: 0 };
    for (const doc of documents) result[doc.status] += 1;
    return result;
  }, [documents]);

  const handleCreate = async () => {
    const slug = newSlug.trim().toLowerCase();
    const title = newTitle.trim();
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) {
      toast.warning('معرّف السياسة غير صالح — أحرف لاتينية صغيرة وأرقام وشرطات فقط.');
      return;
    }
    if (!title) {
      toast.warning('عنوان السياسة مطلوب.');
      return;
    }
    if (documents.some((doc) => doc.slug === slug)) {
      toast.warning('توجد سياسة بهذا المعرّف بالفعل.');
      return;
    }
    setCreating(true);
    try {
      await editorProps.onSaveDraft({ slug, title, content: '' });
      setIsCreateOpen(false);
      setNewSlug('');
      setNewTitle('');
      onCreated(slug);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Documents sidebar */}
      <aside className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في السياسات..."
              className={`${inputClass} pr-8`}
            />
          </div>
          {canCreate && (
            <Button size="sm" variant="primary" onClick={() => setIsCreateOpen(true)} leadingIcon={<Plus className="h-4 w-4" />}>
              إضافة
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {(['PUBLISHED', 'PENDING_APPROVAL', 'DRAFT'] as const).map((status) => (
            <div key={status} className="rounded-lg border border-line bg-surface-sunken px-2 py-2">
              <p className="text-lg font-extrabold text-ink">{counts[status]}</p>
              <p className="text-[10px] font-semibold text-muted">{POLICY_STATUS_LABELS[status]}</p>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          {filtered.length === 0 && (
            <EmptyState icon={<FileCheck className="h-5 w-5" />} title="لا توجد سياسات" description="أضف أول وثيقة سياسة للمنصة." />
          )}
          {filtered.map((doc) => {
            const active = doc.slug === detailSlug;
            return (
              <button
                key={doc.id}
                onClick={() => onSelect(doc.slug)}
                className={`w-full rounded-xl border p-3 text-right transition-colors ${
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-line bg-surface hover:border-line-strong'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-muted">{SLUG_ICONS[doc.slug] ?? <CircleDot className="h-4 w-4" />}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-ink">{doc.title}</p>
                      <p className="text-[10px] text-muted" dir="ltr">{doc.slug}</p>
                    </div>
                  </div>
                  <StatusBadge value={doc.status} label={POLICY_STATUS_LABELS[doc.status]} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
                  <span>إصدار {doc.currentVersion ?? '—'}</span>
                  <span>{doc.updatedAt ? formatDateTime(doc.updatedAt) : '—'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Editor */}
      <PolicyEditor {...editorProps} detailSlug={detailSlug} />

      {/* Create modal */}
      <Modal
        open={isCreateOpen}
        onClose={() => !creating && setIsCreateOpen(false)}
        title="إضافة وثيقة سياسة جديدة"
        description="أنشئ مسودة جديدة — ستظهر في قائمة السياسات وتحتاج اعتماداً قبل النشر."
        icon={<Plus className="h-5 w-5" />}
        size="md"
        busy={creating}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)} disabled={creating}>إلغاء</Button>
            <Button variant="primary" onClick={handleCreate} loading={creating}>إنشاء المسودة</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink">عنوان السياسة <span className="text-danger">*</span></span>
            <input
              className={inputClass}
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
                if (!newSlug) setNewSlug(slugToLatin(e.target.value));
              }}
              placeholder="مثال: سياسة استرجاع المبالغ"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink">المعرّف (slug) <span className="text-danger">*</span></span>
            <input
              className={inputClass}
              dir="ltr"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
              placeholder="refund-policy"
            />
            <span className="mt-1 block text-[10.5px] text-muted">أحرف لاتينية صغيرة وأرقام وشرطات — لا يمكن تغييره لاحقاً.</span>
          </label>
        </div>
      </Modal>
    </div>
  );
};

export default DocumentsTab;
