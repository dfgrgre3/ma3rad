import {
  SlidersHorizontal,
  Sparkles,
  Rocket,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export const TABS = [
  { id: 'modules', label: 'الوحدات', icon: SlidersHorizontal },
  { id: 'features', label: 'المزايا والرايات (Feature Flags)', icon: Sparkles },
  { id: 'releases', label: 'الإصدارات وحزم التحديث', icon: Rocket },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export const RELEASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  DEPRECATED: 'متوقف',
};

export const CHANNEL_LABELS: Record<string, string> = {
  STABLE: 'مستقر',
  BETA: 'تجريبي',
  NIGHTLY: 'ليلي',
};

export const TARGET_STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: 'قيد الانتظار', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  SUCCESS: { label: 'تم بنجاح', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  FAILED: { label: 'فشل التحديث', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
  SKIPPED: { label: 'تم التخطي', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock },
};

export const emptyFeature = {
  id: undefined as string | undefined,
  code: '',
  name: '',
  description: '',
  category: '',
  isEnabled: true,
  rolloutPercent: 100,
  isStagingOnly: false,
  minPlanTier: '',
};

export type FeatureFormState = typeof emptyFeature;

export const emptyRelease = {
  id: undefined as string | undefined,
  version: '',
  channel: 'STABLE' as string,
  status: 'PUBLISHED' as string,
  targetsSummary: null as Record<string, number> | null,
  notes: '',
  rollbackVersion: '',
  isMandatory: false,
  minVersion: '',
  rolloutGroup: 'ALL',
  stagingGroup: 'PRODUCTION',
  fileUrl: '',
  fileName: '',
  fileSize: '' as string,
  checksumSha256: '',
  packageSignature: '',
  changelog: '',
  releasedAt: new Date().toISOString().slice(0, 10),
};

export type ReleaseFormState = typeof emptyRelease;
