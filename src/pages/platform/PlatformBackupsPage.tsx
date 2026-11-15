import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive,
  Database,
  Download,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  HardDrive,
  AlertTriangle,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type { PlatformCentralBackup } from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import {
  EmptyState,
  formatDateTime,
  formatNumber,
} from './components/PlatformUI';

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export const PlatformBackupsPage: React.FC = () => {
  const [backups, setBackups] = useState<PlatformCentralBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const list = platformAdminService.listCentralBackups();
      setBackups(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل النسخ الاحتياطية.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canManageBackups = canPlatform('backups');

  const handleTriggerBackup = async () => {
    if (!canManageBackups) {
      alert('لا تملك صلاحية تنفيذ النسخ الاحتياطي.');
      return;
    }
    if (!confirm('هل ترغب في أخذ نسخة احتياطية مشفرة فورية لقاعدة بيانات المنصة؟')) return;
    setRunning(true);
    try {
      const created = await platformAdminService.triggerCentralBackup();
      alert(
        created.integrityCheckPassed
          ? `تم إنشاء النسخة الاحتياطية والتحقق منها: ${created.filename}`
          : `تم إنشاء نسخة احتياطية محلية مشفرة: ${created.filename}\nلم يتم التحقق من نسخة خارج الموقع، لذا لا تصنف كنسخة موثقة (VERIFIED).`
      );
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشل أخذ النسخة الاحتياطية.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="إدارة النسخ الاحتياطي المركزي للعملاء (Central Backups & Vault)"
        description="إدارة النسخ الاحتياطي السحابي المشفر، والتحقق الدوري من سلامة التخزين، والاستعادة عند الكوارث."
        icon={<Database className="h-5 w-5" />}
        actions={
          <Button
            size="sm"
            onClick={handleTriggerBackup}
            disabled={running || !canManageBackups}
            leadingIcon={<Play className="h-4 w-4" />}
          >
            {running ? 'جارٍ الحفظ...' : 'أخذ نسخة احتياطية فورية الآن'}
          </Button>
        }
      />

      {/* Vault Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <p className="text-xs font-semibold text-slate-400">إجمالي النسخ السحابية المحفوظة</p>
          <p className="text-2xl font-black text-slate-100 mt-1">{backups.length} أرشيف</p>
          <p className="text-[11px] text-slate-500 mt-1">تشفير AES-256 مشدد مع بصمة SHA-256</p>
        </div>

        <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl">
          <p className="text-xs font-semibold text-emerald-400">التحقق من السلامة (Integrity Check)</p>
          <p className="text-2xl font-black text-emerald-300 mt-1">
            {backups.filter((b) => b.integrityCheckPassed).length} / {backups.length}
          </p>
          <p className="text-[11px] text-emerald-500/80 mt-1">
            النسخ التي اجتازت التحقق من نسخة خارج الموقع فقط
          </p>
        </div>

        <div className="p-4 bg-sky-950/20 border border-sky-500/20 rounded-xl">
          <p className="text-xs font-semibold text-sky-400">حجم التخزين التقديري المستخدم</p>
          <p className="text-2xl font-black text-sky-300 mt-1">
            {formatBytes(backups.reduce((sum, b) => sum + (b.sizeBytes || 0), 0))}
          </p>
          <p className="text-[11px] text-sky-500/80 mt-1">حجم الأرشيفات المشفرة المسجلة فعلياً</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-bold text-rose-300">
          {error}
        </div>
      )}

      {/* Backups Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ فحص النسخ الاحتياطية...</div>
        ) : backups.length === 0 ? (
          <EmptyState
            icon={<Archive className="h-6 w-6 text-slate-500" />}
            title="لا توجد نسخ احتياطية مسجلة"
            description="أنشئ أول نسخة احتياطية لحماية بيانات المنصة والعملاء."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-right text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                <tr>
                  <th className="px-4 py-3">اسم ملف الأرشيف</th>
                  <th className="px-4 py-3">الحجم</th>
                  <th className="px-4 py-3">مسار التخزين</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">فحص السلامة</th>
                  <th className="px-4 py-3">تاريخ الإنشاء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {backups.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-100">
                      {b.filename}
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-300">
                      {formatBytes(b.sizeBytes)}
                    </td>

                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                      {b.storageLocation}
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px]">
                        {b.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {b.integrityCheckPassed ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-bold text-[11px]">
                          <CheckCircle2 className="h-3.5 w-3.5" /> سليم ومطابق
                        </span>
                      ) : (
                        <span className="text-rose-400 flex items-center gap-1 font-bold text-[11px]">
                          <AlertTriangle className="h-3.5 w-3.5" /> تالف
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-400">{formatDateTime(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformBackupsPage;
