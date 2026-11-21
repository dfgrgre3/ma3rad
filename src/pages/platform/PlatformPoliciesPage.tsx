import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  AlertTriangle,
  FileJson,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  Lock,
} from 'lucide-react';
import type {
  PlatformPolicyDocumentDetail,
  PlatformPolicyDocumentInput,
  PlatformPolicyDocumentRecord,
  PlatformPolicyRetentionConfig,
} from '../../services/domains/platform/platformTypes';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { downloadCsv, formatDateTime } from './components/PlatformUI';
import { policiesGateway } from './PlatformPoliciesPage/gateway';
import { DocumentsTab } from './PlatformPoliciesPage/DocumentsTab';
import { RetentionTab } from './PlatformPoliciesPage/RetentionTab';
import { VersionHistoryModal } from './PlatformPoliciesPage/VersionHistoryModal';
import type { PoliciesTab } from './PlatformPoliciesPage/constants';

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const PlatformPoliciesPage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = useState<PoliciesTab>('DOCUMENTS');

  const [documents, setDocuments] = useState<PlatformPolicyDocumentRecord[]>([]);
  const [detail, setDetail] = useState<PlatformPolicyDocumentDetail | null>(null);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [retention, setRetention] = useState<PlatformPolicyRetentionConfig | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);

  const canUpdate = canPlatform('policies', 'platform.policies.update');
  const canApprove = canPlatform('policies', 'platform.policies.approve');
  const canCreate = canPlatform('policies', 'platform.policies.create');
  const canExport = canPlatform('policies', 'platform.policies.export');

  const loadDocuments = useCallback(async (preferredSlug?: string | null) => {
    const rows = await policiesGateway.listPolicyDocuments();
    setDocuments(rows);
    const target = preferredSlug ?? detailSlug ?? rows[0]?.slug ?? null;
    if (target && rows.some((row) => row.slug === target)) {
      setDetailSlug(target);
      setDetailLoading(true);
      try {
        setDetail(await policiesGateway.getPolicyDocument(target));
      } catch (err) {
        setError(errorMessage(err, 'تعذر تحميل الوثيقة.'));
      } finally {
        setDetailLoading(false);
      }
    } else {
      setDetailSlug(null);
      setDetail(null);
    }
    return rows;
  }, [detailSlug]);

  const loadRetention = useCallback(async () => {
    setRetentionLoading(true);
    try {
      setRetention(await policiesGateway.getRetentionPolicy());
    } catch (err) {
      setError(errorMessage(err, 'تعذر تحميل قواعد الاحتفاظ.'));
    } finally {
      setRetentionLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadDocuments(), loadRetention()]);
    } catch (err) {
      setError(errorMessage(err, 'تعذر تحميل سياسات المنصة.'));
    } finally {
      setLoading(false);
    }
  }, [loadDocuments, loadRetention]);

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectDocument = useCallback(
    async (slug: string) => {
      setDetailSlug(slug);
      setDetailLoading(true);
      try {
        setDetail(await policiesGateway.getPolicyDocument(slug));
        setError(null);
      } catch (err) {
        setError(errorMessage(err, 'تعذر تحميل الوثيقة.'));
      } finally {
        setDetailLoading(false);
      }
    },
    []
  );

  const runAction = useCallback(
    async (key: string, action: () => Promise<PlatformPolicyDocumentDetail>, successMsg: string) => {
      setActionBusy(key);
      try {
        const updated = await action();
        setDetail(updated);
        setDocuments((prev) =>
          prev.map((doc) => {
            if (doc.slug !== updated.slug) return doc;
            const { versions: _versions, publishedContent: _pc, publishedTitle: _pt, ...rest } = updated;
            return { ...doc, ...rest };
          })
        );
        toast.success(successMsg);
        setError(null);
      } catch (err) {
        const message = errorMessage(err, 'تعذر تنفيذ العملية.');
        setError(message);
        toast.warning(message);
      } finally {
        setActionBusy(null);
      }
    },
    [toast]
  );

  const handleSaveDraft = useCallback(
    async (input: PlatformPolicyDocumentInput & { slug: string }) => {
      await runAction('save', () => policiesGateway.savePolicyDraft(input), 'تم حفظ المسودة.');
    },
    [runAction]
  );

  const handleSubmit = useCallback(
    async (slug: string) => {
      await runAction('submit', () => policiesGateway.submitPolicyForApproval(slug), 'تم تقديم السياسة للاعتماد.');
    },
    [runAction]
  );

  const handleApprove = useCallback(
    async (slug: string) => {
      await runAction('approve', () => policiesGateway.approvePolicyPublish(slug), 'تم اعتماد ونشر السياسة.');
    },
    [runAction]
  );

  const handleReject = useCallback(
    async (slug: string, note?: string) => {
      await runAction('reject', () => policiesGateway.rejectPolicy(slug, note), 'تم رفض السياسة وإرجاعها لمسودة.');
    },
    [runAction]
  );

  const handleRestore = useCallback(
    async (slug: string, version: number) => {
      await runAction(
        'restore',
        () => policiesGateway.restorePolicyVersion(slug, version),
        `تم استرجاع الإصدار #${version} إلى المسودة.`
      );
    },
    [runAction]
  );

  const handleSaveRetention = useCallback(
    async (input: Partial<PlatformPolicyRetentionConfig>) => {
      setRetentionSaving(true);
      try {
        const saved = await policiesGateway.saveRetentionPolicy(input);
        setRetention(saved);
        toast.success('تم حفظ قواعد الاحتفاظ بالبيانات.');
      } catch (err) {
        const message = errorMessage(err, 'تعذر حفظ قواعد الاحتفاظ.');
        toast.warning(message);
      } finally {
        setRetentionSaving(false);
      }
    },
    [toast]
  );

  const handleExportJson = useCallback(async () => {
    try {
      const bundle = await policiesGateway.exportPoliciesBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `platform-policies-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('تم تصدير حزمة السياسات (JSON).');
    } catch (err) {
      toast.warning(errorMessage(err, 'تعذر تصدير السياسات.'));
    }
  }, [toast]);

  const handleExportCsv = useCallback(async () => {
    try {
      const bundle = await policiesGateway.exportPoliciesBundle();
      downloadCsv(`platform-policies-summary-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['slug', 'title', 'status', 'currentVersion', 'publishedAt', 'draftChars'],
        ...bundle.documents.map((doc) => [
          doc.slug,
          doc.title,
          doc.status,
          doc.currentVersion ?? '',
          doc.publishedAt ? formatDateTime(doc.publishedAt) : '',
          doc.draftContent.length,
        ]),
      ]);
      toast.success('تم تصدير ملخص السياسات (CSV).');
    } catch (err) {
      toast.warning(errorMessage(err, 'تعذر تصدير السياسات.'));
    }
  }, [toast]);

  const handlePrintPublished = useCallback(async () => {
    try {
      const bundle = await policiesGateway.exportPoliciesBundle();
      const sections = bundle.documents
        .map((doc) => {
          const body = doc.publishedContent
            ? `<div class="content">${escapeHtml(doc.publishedContent).replace(/\n/g, '<br/>')}</div>`
            : '<p class="muted">لا توجد نسخة منشورة بعد.</p>';
          const meta = doc.currentVersion ? ` — الإصدار ${doc.currentVersion}` : '';
          return `<section><h2>${escapeHtml(doc.title)}${meta}</h2>${body}</section>`;
        })
        .join('\n');
      const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>سياسات المنصة المنشورة</title>
<style>
  body{font-family:'Segoe UI',Tahoma,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;color:#1f2937;line-height:1.8}
  h1{font-size:1.4rem;border-bottom:2px solid #2563eb;padding-bottom:.5rem}
  h2{font-size:1.1rem;color:#1e40af;margin-top:2rem}
  .meta{color:#6b7280;font-size:.85rem}
  .content{white-space:pre-wrap}
  .muted{color:#9ca3af;font-style:italic}
  section{page-break-inside:avoid}
  @media print{body{margin:0}}
</style></head><body>
<h1>سياسات المنصة والامتثال</h1>
<p class="meta">تاريخ التصدير: ${escapeHtml(formatDateTime(bundle.exportedAt))}${bundle.exportedBy ? ` — بواسطة: ${escapeHtml(bundle.exportedBy)}` : ''}</p>
${sections}
<script>window.onload=function(){window.print();}</script>
</body></html>`;
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const win = window.open(url, '_blank');
      if (!win) {
        toast.warning('تعذر فتح نافذة الطباعة — تحقق من مانع النوافذ.');
      }
    } catch (err) {
      toast.warning(errorMessage(err, 'تعذر تجهيز الطباعة.'));
    }
  }, [toast]);

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
      active ? 'border-primary text-primary bg-primary/10' : 'border-transparent text-muted hover:text-muted'
    }`;

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="سياسات المنصة والامتثال (Policies & Compliance)"
        description="إدارة وثائق السياسات متعددة الإصدارات مع سير اعتماد ونشر، وقواعد الاحتفاظ بالبيانات."
        icon={<FileText className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            {canExport && (
              <>
                <Button size="sm" variant="secondary" onClick={handleExportJson} leadingIcon={<FileJson className="h-4 w-4" />}>
                  تصدير JSON
                </Button>
                <Button size="sm" variant="secondary" onClick={handleExportCsv} leadingIcon={<FileSpreadsheet className="h-4 w-4" />}>
                  تصدير CSV
                </Button>
                <Button size="sm" variant="secondary" onClick={handlePrintPublished} leadingIcon={<Printer className="h-4 w-4" />}>
                  طباعة المنشور
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={refreshAll} disabled={loading} leadingIcon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}>
              تحديث
            </Button>
          </div>
        }
      />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-lg text-xs font-bold text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-line-strong overflow-x-auto">
        <button onClick={() => setTab('DOCUMENTS')} className={tabClass(tab === 'DOCUMENTS')}>
          <FileText className="h-4 w-4" />
          <span>وثائق السياسات ({documents.length})</span>
        </button>
        <button onClick={() => setTab('RETENTION')} className={tabClass(tab === 'RETENTION')}>
          <Lock className="h-4 w-4" />
          <span>الاحتفاظ بالبيانات (Retention)</span>
        </button>
      </div>

      {tab === 'DOCUMENTS' ? (
        <DocumentsTab
          documents={documents}
          detail={detail}
          detailSlug={detailSlug}
          loading={detailLoading}
          actionBusy={actionBusy}
          canUpdate={canUpdate}
          canApprove={canApprove}
          onSelect={selectDocument}
          onCreated={(slug) => void selectDocument(slug)}
          canCreate={canCreate}
          canExport={canExport}
          onSaveDraft={handleSaveDraft}
          onSubmit={handleSubmit}
          onApprove={handleApprove}
          onReject={handleReject}
          onOpenHistory={() => setHistoryOpen(true)}
        />
      ) : (
        <RetentionTab
          value={retention}
          loading={retentionLoading}
          canUpdate={canUpdate}
          saving={retentionSaving}
          onSave={handleSaveRetention}
        />
      )}

      <VersionHistoryModal
        open={historyOpen}
        slug={detailSlug}
        versions={detail?.versions ?? []}
        canUpdate={canUpdate}
        busy={actionBusy !== null}
        onClose={() => setHistoryOpen(false)}
        onRestore={handleRestore}
        onChanged={() => {
          if (detailSlug) void selectDocument(detailSlug);
        }}
      />
    </div>
  );
};

export default PlatformPoliciesPage;
