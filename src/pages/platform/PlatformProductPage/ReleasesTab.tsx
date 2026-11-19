import React from 'react';
import { Rocket, Pencil, Users, RotateCcw, FileCheck } from 'lucide-react';
import type { PlatformRelease } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { EmptyState, StatusBadge, formatDate } from '../components/PlatformUI';
import { CHANNEL_LABELS, RELEASE_STATUS_LABELS } from './constants';

interface ReleasesTabProps {
  releases: PlatformRelease[];
  onOpenTargets: (release: PlatformRelease) => void;
  onOpenRollback: (release: PlatformRelease) => void;
  onOpenRelease: (release?: PlatformRelease) => void;
}

export const ReleasesTab: React.FC<ReleasesTabProps> = ({ releases, onOpenTargets, onOpenRollback, onOpenRelease }) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    {releases.length === 0 ? (
      <EmptyState icon={<Rocket className="h-5 w-5" />} title="لا توجد إصدارات" description="سجّل إصدارات المنتج لمتابعة النشر وحزم التحديثات." />
    ) : (
      <div className="divide-y divide-slate-100">
        {releases.map((release) => (
          <div key={release.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50/50">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <Rocket className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-slate-900" dir="ltr">
                    v{release.version}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-bold text-slate-600">
                    {CHANNEL_LABELS[release.channel]}
                  </span>
                  <StatusBadge value={release.status ?? ''} label={RELEASE_STATUS_LABELS[release.status ?? '']} />
                  {release.isMandatory && (
                    <span className="rounded bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[9.5px] font-bold text-rose-700">
                      تحديث إلزامي
                    </span>
                  )}
                  {release.stagingGroup && release.stagingGroup !== 'PRODUCTION' && (
                    <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700">
                      {release.stagingGroup}
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-[11px] text-slate-600">{release.notes || 'بدون ملاحظات'}</p>

                {/* Package and Integrity info */}
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                  {release.fileName && (
                    <span className="inline-flex items-center gap-1 font-mono text-slate-700">
                      <FileCheck className="h-3 w-3 text-sky-600" /> {release.fileName}
                      {release.fileSize && <span>({(release.fileSize / (1024 * 1024)).toFixed(2)} MB)</span>}
                    </span>
                  )}
                  {release.checksumSha256 && (
                    <span className="inline-flex items-center gap-1 font-mono text-slate-500" title={`SHA-256: ${release.checksumSha256}`}>
                      <span className="font-semibold text-slate-700">SHA256:</span> {release.checksumSha256.slice(0, 10)}...
                    </span>
                  )}
                  {release.packageSignature && (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold" title="الحزمة موقّعة رقمياً">
                      ✓ موقّع
                    </span>
                  )}
                  <span>{formatDate(release.releasedAt)}</span>
                </div>

                {/* Targets summary badges */}
                {release.targetsSummary && release.targetsSummary.total > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-600">متابعة التحديث:</span>
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-700">
                      الإجمالي: {release.targetsSummary.total}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[9.5px] font-bold">
                      نجح: {release.targetsSummary.success}
                    </span>
                    {release.targetsSummary.failed > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-50 text-rose-700 px-1.5 py-0.5 text-[9.5px] font-bold">
                        فشل: {release.targetsSummary.failed}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[9.5px] font-bold">
                      انتظار: {release.targetsSummary.pending}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<Users className="h-3.5 w-3.5 text-sky-600" />}
                onClick={() => onOpenTargets(release)}
              >
                استهداف ومتابعة العملاء
              </Button>
              {release.status !== 'DEPRECATED' && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-amber-700 hover:bg-amber-50"
                  leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={() => onOpenRollback(release)}
                >
                  تراجع طارئ
                </Button>
              )}
              <button
                type="button"
                onClick={() => onOpenRelease(release)}
                className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                title="تعديل الحزمة والبيانات"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
);
