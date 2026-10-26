import React, { useState, useEffect } from 'react';
import {
  Download, Upload, HardDrive, ShieldCheck, Clock, CheckCircle2,
  AlertTriangle, RefreshCw, FileText, Database, Lock
} from 'lucide-react';
import { BackupService } from '../../services/BackupService';
import { BackupHistoryTable } from './BackupHistoryTable';

export const BackupPage: React.FC = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const backupService = new BackupService();

  const loadHistory = () => {
    try {
      const rows = backupService.getBackupHistory();
      setHistory(rows || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleDownloadBackup = () => {
    try {
      backupService.exportBackupFile();
      setMessage({ text: 'تم تصدير وتحميل النسخة الاحتياطية لقاعدة البيانات بنجاح!' });
      loadHistory();
    } catch (err: any) {
      setMessage({ text: `فشل تصدير النسخة: ${err?.message}`, isError: true });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmRestore = window.confirm(
      'تحذير أمني شديد: استعادة قاعدة البيانات ستستبدل جميع البيانات الحالية بالملف المستورد. هل تريد المتابعة؟'
    );
    if (!confirmRestore) return;

    setIsRestoring(true);
    setMessage(null);

    try {
      await backupService.restoreBackupFromFile(file);
      setMessage({ text: 'تمت استعادة قاعدة البيانات بنجاح! سيتم تحديث الصفحة لتطبيق التغييرات.' });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setMessage({ text: `فشلت عملية الاستعادة: ${err?.message}`, isError: true });
      setIsRestoring(false);
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
              تصدير ملفات SQLite المشفرة وحفظها خارجياً واسترجاعها بأمان
            </p>
          </div>
        </div>

        <button
          onClick={handleDownloadBackup}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-sky-600/20 active:scale-95"
        >
          <Download className="w-4 h-4" />
          تصدير وتحميل نسخة فورية الآن
        </button>
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
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 mb-4">
              <HardDrive className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-1.5">تصدير قاعدة بيانات SQLite كاملة</h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              يقوم النظام بتصدير لقطة (Snapshot) فورية مطابقة تماماً لكافة بيانات المعرض: المنتجات، العملاء، فواتير المبيعات، المخازن، والقيود المالية بصيغة ملف SQLite ثنائي يمكن تشغيله على أي جهاز.
            </p>
          </div>

          <button
            onClick={handleDownloadBackup}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-xl text-xs font-bold border border-slate-300 flex items-center justify-center gap-2 transition"
          >
            <Download className="w-4 h-4 text-sky-600" />
            تحميل ملف النسخة الاحتياطية (.sqlite)
          </button>
        </div>

        {/* Restore Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 mb-4">
              <Upload className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-1.5">استرجاع قاعدة البيانات من ملف</h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              استيراد ملف قاعدة بيانات SQLite سابق لاستعادة كافة الفواتير والمخازن إلى نقطة زمنية سابقة في حال تلف الجهاز أو نقل النظام إلى حاسوب جديد.
            </p>
          </div>

          <label className="w-full py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition">
            <Upload className="w-4 h-4" />
            <span>{isRestoring ? 'جاري الاستيراد...' : 'اختيار ملف النسخة الاحتياطية (.sqlite)'}</span>
            <input
              type="file"
              accept=".sqlite,.db"
              onChange={handleFileChange}
              disabled={isRestoring}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <BackupHistoryTable history={history} formatSize={formatSize} />
    </div>
  );
};