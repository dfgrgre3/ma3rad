import React, { useEffect, useState } from 'react';
import { History, Eye, RotateCcw, BadgeCheck } from 'lucide-react';
import type { PlatformPolicyVersionRecord } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { formatDateTime, StatusBadge } from '../components/PlatformUI';
import { policiesGateway } from './gateway';

interface VersionHistoryModalProps {
  open: boolean;
  slug: string | null;
  /** Pre-loaded versions from the document detail (may be stale after restore). */
  versions: PlatformPolicyVersionRecord[];
  canUpdate: boolean;
  busy: boolean;
  onClose: () => void;
  onRestore: (slug: string, version: number) => Promise<void>;
  onChanged: () => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  open,
  slug,
  versions: initialVersions,
  canUpdate,
  busy,
  onClose,
  onRestore,
  onChanged,
}) => {
  const [versions, setVersions] = useState<PlatformPolicyVersionRecord[]>(initialVersions);
  const [viewing, setViewing] = useState<PlatformPolicyVersionRecord | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    if (!open || !slug) return;
    let cancelled = false;
    setLoadingVersions(true);
    policiesGateway
      .listPolicyVersions(slug)
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch(() => {
        if (!cancelled) setVersions(initialVersions);
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slug]);

  const handleRestore = async (version: number) => {
    if (!slug) return;
    await onRestore(slug, version);
    onChanged();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="سجل إصدارات السياسة"
        description="اللقطات المنشورة غير قابلة للتعديل — الاسترجاع ينسخ الإصدار إلى المسودة فقط."
        icon={<History className="h-5 w-5" />}
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>إغلاق</Button>
          </div>
        }
      >
        {loadingVersions ? (
          <p className="py-8 text-center text-xs font-semibold text-muted">جارٍ تحميل الإصدارات...</p>
        ) : versions.length === 0 ? (
          <p className="py-8 text-center text-xs font-semibold text-muted">لا توجد إصدارات منشورة بعد — ستظهر هنا بعد أول اعتماد.</p>
        ) : (
          <div className="space-y-2">
            {versions.map((version) => (
              <div
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-sunken px-3 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-extrabold text-primary" dir="ltr">
                    v{version.version}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-ink">{version.title}</p>
                      {version.isCurrent && <StatusBadge value="PUBLISHED" label="الحالية" />}
                    </div>
                    <p className="text-[10px] text-muted">
                      {formatDateTime(version.createdAt)}
                      {version.approvedByName ? ` — اعتُمدت بواسطة ${version.approvedByName}` : ''}
                      {version.changeSummary ? ` — ${version.changeSummary}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setViewing(version)} leadingIcon={<Eye className="h-3.5 w-3.5" />}>
                    عرض
                  </Button>
                  {canUpdate && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => handleRestore(version.version)}
                      leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                    >
                      استعادة كمسودة
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Version content viewer */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing ? `الإصدار #${viewing.version} — ${viewing.title}` : ''}
        description={viewing ? `${formatDateTime(viewing.createdAt)}${viewing.changeSummary ? ` — ${viewing.changeSummary}` : ''}` : undefined}
        icon={<BadgeCheck className="h-5 w-5" />}
        size="xl"
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setViewing(null)}>إغلاق</Button>
          </div>
        }
      >
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-sunken p-4 text-xs leading-6 text-ink">
          {viewing?.content ?? ''}
        </pre>
      </Modal>
    </>
  );
};

export default VersionHistoryModal;
