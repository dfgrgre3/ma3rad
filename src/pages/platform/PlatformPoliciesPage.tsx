import React, { useState, useEffect } from 'react';
import {
  FileText,
  Shield,
  Lock,
  Save,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { inputClass, formatDateTime } from './components/PlatformUI';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';

import { useToast } from '../../components/ui/Toast';
export const PlatformPoliciesPage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = useState<'TERMS' | 'PRIVACY' | 'RETENTION'>('TERMS');
  const canManagePolicies = canPlatform('policies', 'platform.policies.update');

  const [terms, setTerms] = useState(
    `شروط الاستخدام واتفاقية مستوى الخدمة (Terms of Service & SLA)
1. يعتبر استخدام المنصة ترخيصاً محدوداً غير حصري للشركات والمعارض المشتركة.
2. تخضع التراخيص للربط العتادي مع الأجهزة المسجلة ولا يسمح بنقل المفاتيح دون موافقة الإدارة.
3. تلتزم إدارة المنصة بنسبة إتاحة لا تقل عن 99.5% للخدمات السحابية.
4. يحق للمنصة تعليق الحسابات في حال التأخر عن سداد المطالبات أو انتهاك شروط الملكية الفكرية.`
  );

  const [privacy, setPrivacy] = useState(
    `سياسة الخصوصية وحماية البيانات (Privacy Policy)
1. تلتزم المنصة بتشفير كافة بيانات الفواتير والعملاء باستخدام معايير AES-256.
2. لا تتم مشاركة أي بيانات تخص مبيعات أو مخزون العملاء مع أي طرف ثالث تجاري.
3. مفاتيح التوقيع الرقمي والتراخيص يتم التحقق منها عبر خوارزميات التجزئة الآمنة (SHA-256).
4. يحق للعميل طلب تصدير كامل بياناته أو حذفها نهائياً عند إنهاء التعاقد.`
  );

  const [retention, setRetention] = useState({
    auditRetentionDays: 365,
    backupRetentionDays: 90,
    syncLogRetentionDays: 30,
    softDeleteGraceDays: 14,
  });

  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Editing is only allowed after real policies load — otherwise the hardcoded
  // placeholder text would be silently saved over stored policies.
  const [loaded, setLoaded] = useState(false);

  // Retention days must be finite integers within sane bounds.
  const clampDays = (v: string): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(36500, Math.max(0, Math.round(n))) : 0;
  };
  const setRetentionDays = (key: keyof typeof retention, raw: string) =>
    setRetention((prev) => ({ ...prev, [key]: clampDays(raw) }));

  useEffect(() => {
    const loadPolicies = async () => {
      const centralState = getCentralDataSourceState();
      try {
        const saved = centralState.active
          ? await centralPlatformClient.getPlatformPolicies()
          : platformAdminService.getPlatformPolicies();
        if (saved.terms) setTerms(saved.terms);
        if (saved.privacy) setPrivacy(saved.privacy);
        setRetention({
          auditRetentionDays: clampDays(String(saved.retention?.auditRetentionDays ?? 365)),
          backupRetentionDays: clampDays(String(saved.retention?.backupRetentionDays ?? 90)),
          syncLogRetentionDays: clampDays(String(saved.retention?.syncLogRetentionDays ?? 30)),
          softDeleteGraceDays: clampDays(String(saved.retention?.softDeleteGraceDays ?? 14)),
        });
        setLastSaved(saved.updatedAt);
        setLoaded(true);
        setError(null);
      } catch (err) {
        setLoaded(false);
        setError(err instanceof Error ? err.message : 'تعذر تحميل سياسات المنصة.');
      }
    };
    loadPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!canManagePolicies) {
      toast.warning('لا تملك صلاحية تعديل سياسات المنصة.');
      return;
    }
    if (!loaded) {
      toast.warning('تعذر تحميل السياسات الحالية — لا يمكن الحفظ حتى يتم تحميلها بنجاح.');
      setSaving(false);
      return;
    }
    setSaving(true);
    const centralState = getCentralDataSourceState();
    try {
      const saved = centralState.active
        ? await centralPlatformClient.savePlatformPolicies({ terms, privacy, retention })
        : platformAdminService.savePlatformPolicies({ terms, privacy, retention });
      setTerms(saved.terms);
      setPrivacy(saved.privacy);
      setRetention(saved.retention);
      setLastSaved(saved.updatedAt);
      setError(null);
      toast.success('تم حفظ السياسات وفترات الاحتفاظ في قاعدة البيانات.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذر حفظ السياسات.';
      setError(message);
      toast.warning(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="سياسات المنصة والاحتفاظ بالبيانات (Policies & Compliance)"
        description="إدارة شروط الاستخدام، سياسات الخصوصية، وقواعد وفترات الاحتفاظ بالبيانات وسجلات التدقيق."
        icon={<FileText className="h-5 w-5" />}
        actions={
          canManagePolicies ? (
            <Button size="sm" onClick={handleSave} disabled={saving || !loaded} leadingIcon={<Save className="h-4 w-4" />}>
              حفظ التغييرات
            </Button>
          ) : null
        }
      />

      {error && (
        <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-xs font-bold text-danger">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-line-strong text-xs font-bold text-muted gap-1">
        <button
          onClick={() => setTab('TERMS')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            tab === 'TERMS'
              ? 'border-primary text-primary bg-primary/10'
              : 'border-transparent hover:text-muted'
          }`}
        >
          <FileText className="h-4 w-4" />
          شروط الخدمة (Terms)
        </button>

        <button
          onClick={() => setTab('PRIVACY')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            tab === 'PRIVACY'
              ? 'border-success text-success bg-success/10'
              : 'border-transparent hover:text-muted'
          }`}
        >
          <Shield className="h-4 w-4" />
          سياسة الخصوصية (Privacy)
        </button>

        <button
          onClick={() => setTab('RETENTION')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors ${
            tab === 'RETENTION'
              ? 'border-primary text-primary bg-primary/10'
              : 'border-transparent hover:text-muted'
          }`}
        >
          <Lock className="h-4 w-4" />
          قواعد الاحتفاظ بالبيانات (Retention)
        </button>
      </div>

      <div className="p-4 bg-primary/70 border border-line-strong rounded-xl space-y-4 max-w-4xl">
        {tab === 'TERMS' && (
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">
              نص اتفاقية وشروط الاستخدام المعتمدة:
            </label>
            <textarea
              rows={12}
              value={terms}
              disabled={!loaded}
              onChange={(e) => setTerms(e.target.value)}
              className={`${inputClass} leading-relaxed font-sans`}
            />
          </div>
        )}

        {tab === 'PRIVACY' && (
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">
              نص سياسة الخصوصية وحماية بيانات المستأجرين:
            </label>
            <textarea
              rows={12}
              value={privacy}
              disabled={!loaded}
              onChange={(e) => setPrivacy(e.target.value)}
              className={`${inputClass} leading-relaxed font-sans`}
            />
          </div>
        )}

        {tab === 'RETENTION' && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-muted">
              فترات الاحتفاظ بالبيانات والأرشفة التلقائية:
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">
                  الاحتفاظ بسجلات العمليات والتدقيق (Audit Logs)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={retention.auditRetentionDays}
                    onChange={(e) => setRetentionDays('auditRetentionDays', e.target.value)}
                    className={inputClass}
                  />
                  <span className="text-xs text-muted">يوماً</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1">
                  الاحتفاظ بالنسخ الاحتياطية السحابية (Backups)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={retention.backupRetentionDays}
                    onChange={(e) => setRetentionDays('backupRetentionDays', e.target.value)}
                    className={inputClass}
                  />
                  <span className="text-xs text-muted">يوماً</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1">
                  الاحتفاظ بسجلات المزامنة التشغيلية (Sync Logs)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={retention.syncLogRetentionDays}
                    onChange={(e) => setRetentionDays('syncLogRetentionDays', e.target.value)}
                    className={inputClass}
                  />
                  <span className="text-xs text-muted">يوماً</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1">
                  مهلة الحذف المبدئي قبل الإتلاف النهائي (Soft Delete)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={retention.softDeleteGraceDays}
                    onChange={(e) => setRetentionDays('softDeleteGraceDays', e.target.value)}
                    className={inputClass}
                  />
                  <span className="text-xs text-muted">يوماً</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-3 border-t border-line-strong text-[11px] text-muted">
          <span>آخر تحديث واعتماد: {lastSaved ? formatDateTime(lastSaved) : 'لم تُحفظ السياسات بعد'}</span>
          {canManagePolicies && (
            <Button size="sm" onClick={handleSave} disabled={saving || !loaded} leadingIcon={<Save className="h-3.5 w-3.5" />}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlatformPoliciesPage;
