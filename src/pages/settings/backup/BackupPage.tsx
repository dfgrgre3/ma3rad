import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Download, Upload, HardDrive, ShieldCheck, CheckCircle2,
  AlertTriangle, RefreshCw, FileText, Lock, X, Eye, EyeOff, Key
} from 'lucide-react';
import { BackupService } from '../../../services/backup/BackupService';
import { BackupHistoryTable } from './BackupHistoryTable';
import { usePermission } from '../../../hooks/auth/usePermission';

export const BackupPage: React.FC = () => {
  const canManage = usePermission()('settings.backup');
  const [history, setHistory] = useState<any[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [offsiteBackupDir, setOffsiteBackupDir] = useState('');
  const [isSavingOffsiteDir, setIsSavingOffsiteDir] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Export Modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isRecoveryExportOpen, setIsRecoveryExportOpen] = useState(false);
  const [recoveryExportPassword, setRecoveryExportPassword] = useState('');
  const [recoveryExportPasswordConfirm, setRecoveryExportPasswordConfirm] = useState('');
  const [recoveryExportError, setRecoveryExportError] = useState<string | null>(null);
  const [isExportingRecoveryKey, setIsExportingRecoveryKey] = useState(false);

  // Restore Modal state
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [recoveryKeyFile, setRecoveryKeyFile] = useState<File | null>(null);
  const [recoveryKeyPassword, setRecoveryKeyPassword] = useState('');
  const [showRestorePassword, setShowRestorePassword] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const backupService = useMemo(() => new BackupService(), []);

  const loadHistory = useCallback(() => {
    try {
      const rows = backupService.getBackupHistory();
      setHistory(rows || []);
    } catch (e) {
      console.error(e);
    }
  }, [backupService]);

  useEffect(() => {
    loadHistory();
    void window.ceramisys?.db?.getOffsiteBackupDir?.()
      .then((result) => {
        if (result?.ok) setOffsiteBackupDir(result.path || '');
      })
      .catch((error) => {
        setMessage({ text: error instanceof Error ? error.message : String(error), isError: true });
      });
  }, [loadHistory]);

  const handleSaveOffsiteBackupDir = async () => {
    if (!canManage) return;
    const savePath = window.ceramisys?.db?.setOffsiteBackupDir;
    if (!savePath) {
      setMessage({ text: 'إعداد الوجهة الخارجية متاح من تطبيق سطح المكتب فقط.', isError: true });
      return;
    }
    setIsSavingOffsiteDir(true);
    try {
      const result = await savePath(offsiteBackupDir.trim());
      setOffsiteBackupDir(result.path || '');
      setMessage({
        text: result.path
          ? 'تم حفظ وجهة الشبكة. سيُختبر فك النسخة وقراءتها بعد كل نسخ احتياطي.'
          : 'تم تعطيل النسخ إلى الوجهة الخارجية.',
      });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), isError: true });
    } finally {
      setIsSavingOffsiteDir(false);
    }
  };

  const openExportModal = () => {
    if (!canManage) return;
    setExportPassword('');
    setExportPasswordConfirm('');
    setExportError(null);
    setIsExportModalOpen(true);
  };

  const handleConfirmRecoveryKeyExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (recoveryExportPassword.length < 12 || recoveryExportPassword.length > 255) {
      setRecoveryExportError('يجب أن تتراوح كلمة المرور بين 12 و255 حرفًا.');
      return;
    }
    if (recoveryExportPassword !== recoveryExportPasswordConfirm) {
      setRecoveryExportError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setIsExportingRecoveryKey(true);
    setRecoveryExportError(null);
    try {
      await backupService.exportRecoveryKeyFile(recoveryExportPassword);
      setIsRecoveryExportOpen(false);
      setRecoveryExportPassword('');
      setRecoveryExportPasswordConfirm('');
      setMessage({ text: 'تم تنزيل ملف استرداد المفتاح. احفظه خارج هذا الجهاز واحتفظ بكلمة مروره منفصلة.' });
    } catch (error) {
      setRecoveryExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingRecoveryKey(false);
    }
  };

  const handleConfirmExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (!exportPassword) {
      setExportError('يرجى إدخال كلمة مرور للنسخة.');
      return;
    }
    if (exportPassword.length < 12) {
      setExportError('يجب أن تتكون كلمة المرور من 12 حرفًا على الأقل.');
      return;
    }
    if (exportPassword.length > 255) {
      setExportError('كلمة المرور طويلة جدًا (الحد الأقصى 255 حرفًا).');
      return;
    }
    if (exportPassword !== exportPasswordConfirm) {
      setExportError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      await backupService.exportBackupFile(exportPassword);
      setIsExportModalOpen(false);
      setMessage({ text: 'تم تصدير وتحميل النسخة الاحتياطية لقاعدة البيانات بنجاح!' });
      loadHistory();
    } catch (err: any) {
      setExportError(err?.message || 'فشل تصدير النسخة.');
    } finally {
      setIsExporting(false);
    }
  };

  const executeRestore = async (
    file: File,
    password?: string,
    keyFile?: File,
    keyPassword?: string
  ) => {
    if (!canManage) return;
    setIsRestoring(true);
    setRestoreError(null);
    setMessage(null);

    try {
      await backupService.restoreBackupFromFile(file, password, keyFile, keyPassword);
      setIsRestoreModalOpen(false);
      setMessage({ text: 'تمت استعادة قاعدة البيانات بنجاح! سيتم تحديث الصفحة لتطبيق التغييرات.' });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      if (isRestoreModalOpen) {
        setRestoreError(err?.message || 'فشلت عملية الاستعادة.');
      } else {
        setMessage({ text: `فشلت عملية الاستعادة: ${err?.message}`, isError: true });
      }
      setIsRestoring(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManage) return;
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      const isEncrypted = await backupService.isEncryptedBackupFile(file);
      if (isEncrypted) {
        setSelectedFile(file);
        setRestorePassword('');
        setRecoveryKeyFile(null);
        setRecoveryKeyPassword('');
        setRestoreError(null);
        setIsRestoreModalOpen(true);
      } else {
        const confirmRestore = window.confirm(
          'تحذير أمني شديد: استعادة قاعدة البيانات ستستبدل جميع البيانات الحالية بالملف المستورد. هل تريد المتابعة؟'
        );
        if (!confirmRestore) return;
        executeRestore(file);
      }
    } catch (err: any) {
      setMessage({ text: `فشل فحص ملف النسخة: ${err?.message}`, isError: true });
    }
  };

  const handleConfirmRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !selectedFile) return;
    const isLocalDatabaseBackup = selectedFile.name.toLowerCase().endsWith('.sqlite.enc');
    if (!restorePassword && !isLocalDatabaseBackup) {
      setRestoreError('يرجى إدخال كلمة مرور النسخة الاحتياطية.');
      return;
    }
    if (recoveryKeyFile && !recoveryKeyPassword) {
      setRestoreError('أدخل كلمة مرور ملف الاسترداد.');
      return;
    }
    await executeRestore(selectedFile, restorePassword, recoveryKeyFile || undefined, recoveryKeyPassword);
  };

  const handleOpenBackupFolder = async () => {
    const openFolder = window.ceramisys?.app?.openFolder;
    if (!openFolder) {
      setMessage({ text: 'فتح مجلد النسخ متاح من تطبيق سطح المكتب فقط.', isError: true });
      return;
    }
    try {
      const result = await openFolder('backups');
      setMessage(result.ok
        ? { text: 'اختر نسخة الجهاز من مجلد النسخ لاستعادتها.' }
        : { text: result.error || 'تعذر فتح مجلد النسخ.', isError: true });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : String(error),
        isError: true,
      });
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 ك.ب';
    return (bytes / 1024).toFixed(1) + ' ك.ب';
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-y-auto" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">النسخ الاحتياطي واستعادة البيانات (Backup & Recovery)</h1>
            <p className="text-xs text-slate-500 font-medium">
              يعمل النظام محليًا على هذا الجهاز فقط؛ النسخ الاحتياطي لحماية بياناته وليس لمزامنتها بين الأجهزة
            </p>
          </div>
        </div>

        {canManage && (
          <button
            onClick={openExportModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-sky-600/20 active:scale-95"
          >
            <Download className="w-4 h-4" />
            تصدير وتحميل نسخة فورية الآن
          </button>
        )}
      </div>

      {message && (
        <div
          className={`mx-6 mt-4 p-3.5 rounded-xl text-xs flex items-center justify-between ${
            message.isError
              ? 'bg-rose-500/10 border border-rose-500/30 text-rose-700'
              : 'bg-emerald-500/10 border text-emerald-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.isError ? (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="font-mono text-slate-500 hover:text-slate-900">✕</button>
        </div>
      )}

      {/* Cards Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Export Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 mb-4">
              <HardDrive className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-1.5">تصدير نسخة مشفرة من قاعدة البيانات</h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              يصدر النظام نسخة كاملة بصيغة جدول بيانات ‏(.xlsx) محمية بكلمة مرور، ويمكن فتحها ببرامج الجداول أو استعادتها من التطبيق. احتفظ بكلمة المرور.
            </p>
          </div>

          {canManage && (
            <button
              onClick={openExportModal}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-xl text-xs font-bold border border-slate-300 flex items-center justify-center gap-2 transition"
            >
              <Download className="w-4 h-4 text-sky-600" />
              تحميل نسخة مشفرة بصيغة جدول بيانات (.xlsx)
            </button>
          )}
        </div>

        {/* Restore Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 mb-4">
              <Upload className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-1.5">استرجاع قاعدة البيانات من ملف</h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              استعد بيانات النظام من نسخة مشفرة أو ملف SQLite. يتضمن مجلد نسخ الجهاز نسخًا مشفرة تلقائيًا قبل تثبيت التحديثات.
            </p>
          </div>

          {canManage && (
            <div className="space-y-2">
              <label className="w-full py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition">
                <Upload className="w-4 h-4" />
                <span>{isRestoring ? 'جاري الاستيراد...' : 'اختيار ملف النسخة الاحتياطية'}</span>
                <input
                  type="file"
                  accept=".xlsx,.ceramisys-backup,.sqlite.enc,.sqlite,.db"
                  onChange={handleFileChange}
                  disabled={isRestoring}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleOpenBackupFolder()}
                className="w-full rounded-xl border border-slate-300 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                فتح مجلد نسخ الجهاز
              </button>
            </div>
          )}
        </div>

        <div className="bg-white border border-emerald-200 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 mb-4">
              <Key className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-1.5">استرداد النسخ على جهاز بديل</h2>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              نزّل ملفًا يحمي مفتاح قاعدة البيانات بكلمة مرور تختارها. احتفظ بالملف وكلمة المرور منفصلين عن الجهاز؛ يلزم كلاهما لفك نسخة الجهاز المشفرة.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setRecoveryExportPassword('');
                setRecoveryExportPasswordConfirm('');
                setRecoveryExportError(null);
                setIsRecoveryExportOpen(true);
              }}
              className="w-full py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              تنزيل ملف مفتاح الاسترداد
            </button>
          )}
        </div>
      </div>

      {canManage && (
        <section className="mx-6 mb-6 rounded-2xl border border-sky-200 bg-white p-6">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-slate-900">نسخة خارج الموقع على مشاركة شبكة</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              أدخل مسار مشاركة شبكة مستقلة مكانيًا عن هذا الجهاز (مثل مسار UNC في Windows).
              بعد كل نسخة، ينسخ النظام الملف المشفر إليها ويتحقق من SHA-256 ثم يختبر استعادته وفك تشفيره.
              احفظ ملف مفتاح الاسترداد وكلمة مروره خارج الجهاز وبشكل منفصل؛ من دونهما لا يمكن فك النسخ المشفرة على جهاز بديل.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={offsiteBackupDir}
              onChange={(event) => setOffsiteBackupDir(event.target.value)}
              placeholder="\\\\server\\share\\CeramiSys-Backups"
              disabled={isSavingOffsiteDir}
              dir="ltr"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
            />
            <button
              type="button"
              onClick={() => void handleSaveOffsiteBackupDir()}
              disabled={isSavingOffsiteDir}
              className="rounded-xl bg-sky-700 px-5 py-2 text-xs font-bold text-white transition hover:bg-sky-800 disabled:opacity-50"
            >
              {isSavingOffsiteDir ? 'جارٍ الحفظ...' : 'حفظ الوجهة'}
            </button>
          </div>
        </section>
      )}

      <BackupHistoryTable history={history} formatSize={formatSize} />

      {/* Export Password Modal */}
      {canManage && isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">تصدير نسخة مشفرة (.xlsx)</h3>
                  <p className="text-xs text-slate-500">حدد كلمة مرور قوية لحماية ملف النسخة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isExporting && setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
                disabled={isExporting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {exportError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{exportError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmExport} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  كلمة مرور النسخة (12 حرفًا على الأقل)
                </label>
                <div className="relative">
                  <input
                    type={showExportPassword ? 'text' : 'password'}
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={12}
                    maxLength={255}
                    autoFocus
                    disabled={isExporting}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 pl-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowExportPassword(!showExportPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showExportPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  تأكيد كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showExportPassword ? 'text' : 'password'}
                    value={exportPasswordConfirm}
                    onChange={(e) => setExportPasswordConfirm(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={12}
                    maxLength={255}
                    disabled={isExporting}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 pl-10"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/70 text-[11px] text-amber-800 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  تنبيه: كلمة المرور لا تُحفظ داخل التطبيق. احتفظ بها جيداً لأنه لا يمكن استرجاع بيانات النسخة بدونها.
                </span>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isExporting}
                  className="flex-1 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20 disabled:opacity-60 transition"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري التشفير والتصدير...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>تصدير وتحميل النسخة</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  disabled={isExporting}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restore Password Modal */}
      {canManage && isRestoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">فك تشفير واستعادة النسخة</h3>
                  <p className="text-xs text-slate-500">الملف محمي بكلمة مرور مشفرة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isRestoring && setIsRestoreModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
                disabled={isRestoring}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {restoreError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{restoreError}</span>
              </div>
            )}

            {selectedFile && (
              <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="font-mono truncate font-medium text-slate-700">{selectedFile.name}</span>
                </div>
                <span className="text-slate-400 text-[11px] shrink-0 font-mono">{formatSize(selectedFile.size)}</span>
              </div>
            )}

            <form onSubmit={handleConfirmRestore} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {selectedFile?.name.toLowerCase().endsWith('.sqlite.enc')
                    ? 'نسخة مشفرة بمفتاح الجهاز (لا تحتاج كلمة مرور هنا)'
                    : 'أدخل كلمة مرور ملف النسخة الاحتياطية'}
                </label>
                <div className="relative">
                  <input
                    type={showRestorePassword ? 'text' : 'password'}
                    value={restorePassword}
                    onChange={(e) => setRestorePassword(e.target.value)}
                    placeholder="••••••••••••"
                    required={!selectedFile?.name.toLowerCase().endsWith('.sqlite.enc')}
                    autoFocus={!selectedFile?.name.toLowerCase().endsWith('.sqlite.enc')}
                    disabled={isRestoring || selectedFile?.name.toLowerCase().endsWith('.sqlite.enc')}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 pl-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRestorePassword(!showRestorePassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showRestorePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  عند الاستعادة على جهاز بديل: اختر ملف مفتاح الاسترداد وكلمة مروره
                </label>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => setRecoveryKeyFile(event.target.files?.[0] || null)}
                  disabled={isRestoring}
                  className="block w-full text-xs text-slate-600"
                />
                <input
                  type="password"
                  value={recoveryKeyPassword}
                  onChange={(event) => setRecoveryKeyPassword(event.target.value)}
                  placeholder="كلمة مرور ملف الاسترداد"
                  disabled={isRestoring || !recoveryKeyFile}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
                <p className="text-[10px] leading-relaxed text-slate-600">
                  عند اختيار الملف، سيُستخدم مفتاحه لفك النسخة بدل مفتاح الجهاز الحالي. لا يُستبدل مفتاح الجهاز ولا تُحفظ كلمة المرور.
                </p>
              </div>

              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-[11px] text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  تحذير أمني شديد: استعادة قاعدة البيانات ستستبدل جميع البيانات الحالية بالملف المستورد.
                </span>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isRestoring}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20 disabled:opacity-60 transition"
                >
                  {isRestoring ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري فك التشفير والاستعادة...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>تأكيد واستعادة البيانات</span>
                    </>
                  )}

                </button>
                <button
                  type="button"
                  onClick={() => setIsRestoreModalOpen(false)}
                  disabled={isRestoring}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canManage && isRecoveryExportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" dir="rtl">
          <form onSubmit={handleConfirmRecoveryKeyExport} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">تصدير ملف مفتاح الاسترداد</h3>
              <button type="button" onClick={() => setIsRecoveryExportOpen(false)} className="p-1 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            {recoveryExportError && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{recoveryExportError}</p>}
            <p className="text-xs leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              كلمة المرور لا يمكن استعادتها من التطبيق. احفظ ملف المفتاح واحتفظ بكلمة المرور في مكان منفصل وآمن.
            </p>
            <input
              type="password"
              value={recoveryExportPassword}
              onChange={(event) => setRecoveryExportPassword(event.target.value)}
              placeholder="كلمة مرور قوية (12 حرفًا على الأقل)"
              required
              minLength={12}
              maxLength={255}
              disabled={isExportingRecoveryKey}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs"
            />
            <input
              type="password"
              value={recoveryExportPasswordConfirm}
              onChange={(event) => setRecoveryExportPasswordConfirm(event.target.value)}
              placeholder="أعد كلمة المرور"
              required
              minLength={12}
              maxLength={255}
              disabled={isExportingRecoveryKey}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={isExportingRecoveryKey} className="flex-1 rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                {isExportingRecoveryKey ? 'جارٍ التشفير والتنزيل...' : 'تشفير وتنزيل المفتاح'}
              </button>
              <button type="button" onClick={() => setIsRecoveryExportOpen(false)} disabled={isExportingRecoveryKey} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
