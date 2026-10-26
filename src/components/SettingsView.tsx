import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Settings as SettingsIcon, Database, Download, Upload, 
  Printer, Shield, Save, CheckCircle2, AlertTriangle, RefreshCw,
  FileSpreadsheet, Layers, ExternalLink, Activity
} from 'lucide-react';
import { BackupService } from '../services/BackupService';
import { SettingsService } from '../services/SettingsService';
import { SystemSettings } from '../types';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings>({
    showroomName: '',
    tagline: '',
    phone: '',
    phone2: '',
    address: '',
    taxNumber: '',
    commercialRecord: '',
    currency: 'EGP',
    currencySymbol: 'ج.م',
    defaultTaxPercentage: 0,
    isTaxInclusive: false,
    enableNegativeStock: false,
    costingMethod: 'AVERAGE_COST',
    receiptHeader: '',
    receiptFooter: '',
    autoBackupIntervalHours: 24
  });

  const [backupHistory, setBackupHistory] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const backupService = new BackupService();

  const loadData = () => {
    try {
      setSettings(SettingsService.getSettings());
    } catch (e) {
      console.error(e);
    }
    try {
      setBackupHistory(backupService.getBackupHistory());
    } catch {
      setBackupHistory([]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      SettingsService.update(settings as any);
      alert('تم حفظ إعدادات المعرض والطباعة بنجاح.');
    } catch (err: any) {
      alert(`خطأ في الحفظ: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      await backupService.exportBackupFile();
      loadData();
      alert('تم تنزيل نسخة احتياطية من قاعدة البيانات. الملف غير مشفر؛ احفظه في موقع آمن.');
    } catch (e: any) {
      alert(`خطأ في التصدير: ${e.message || e}`);
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (confirm('تنبيه هام جداً: استعادة نسخة احتياطية سيقوم باستبدال قاعدة البيانات الحالية بالكامل بالبيانات المستوردة. هل تريد الاستمرار؟')) {
      backupService.restoreBackupFromFile(file).then(() => {
        alert('تمت استعادة قاعدة البيانات بنجاح! سيتم إعادة تحميل النظام.');
        window.location.reload();
      }).catch(err => {
        alert(`خطأ في استعادة النسخة: ${err.message || err}`);
      });
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">إعدادات النظام والنسخ الاحتياطي</h2>
        <p className="text-xs text-slate-500">تخصيص بيانات المعرض، الفواتير، والنسخ الاحتياطي المحلي لقاعدة البيانات SQLite</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Settings Form */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-sky-600" />
            <span>بيانات المعرض والطباعة</span>
          </h3>

          <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم المعرض الرئيسي *</label>
                <input
                  type="text"
                  required
                  value={settings.showroomName}
                  onChange={(e) => setSettings({ ...settings, showroomName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">الشعار النصي / الوصف</label>
                <input
                  type="text"
                  value={settings.tagline}
                  onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 "
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">رقم الهاتف الأساسي *</label>
                <input
                  type="text"
                  required
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">رقم هاتف إضافي</label>
                <input
                  type="text"
                  value={settings.phone2}
                  onChange={(e) => setSettings({ ...settings, phone2: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">عنوان المعرض *</label>
              <input
                type="text"
                required
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 "
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">الرقم الضريبي</label>
                <input
                  type="text"
                  value={settings.taxNumber}
                  onChange={(e) => setSettings({ ...settings, taxNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">السجل التجاري</label>
                <input
                  type="text"
                  value={settings.commercialRecord}
                  onChange={(e) => setSettings({ ...settings, commercialRecord: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">تذييل الفاتورة وشروط الاسترجاع</label>
              <textarea
                rows={3}
                value={settings.receiptFooter}
                onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 leading-relaxed"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg shadow-sky-600/30 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>حفظ التعديلات</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Tools & Backup */}
        <div className="space-y-6 flex flex-col justify-between">
          {/* Data Tools Box */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-sky-600" />
              <span>أدوات استيراد وإدارة البيانات</span>
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              استيراد سجلات العملاء والموردين والمنتجات من ملفات Excel، وإدارة أنواع البيانات المرنة المخصصة.
            </p>

            <div className="space-y-2 pt-1">
              <Link
                to="/data-import"
                className="w-full py-2.5 px-4 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold rounded-xl flex items-center justify-between text-xs border border-sky-100 transition"
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                  <span>مركز استيراد الملفات (Excel / CSV)</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-sky-500" />
              </Link>

              <Link
                to="/data-import/types"
                className="w-full py-2.5 px-4 bg-violet-50 hover:bg-violet-100 text-violet-900 font-bold rounded-xl flex items-center justify-between text-xs border border-violet-100 transition"
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-600" />
                  <span>إدارة أنواع البيانات المرنة والسجلات</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-violet-500" />
              </Link>

              <Link
                to="/system-health"
                className="w-full py-2.5 px-4 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl flex items-center justify-between text-xs border border-slate-200 transition"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-500" />
                  <span>فحص صحة النظام ومؤشرات الأداء</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </Link>
            </div>
          </div>

          {/* Database Backup & Restore Box */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="space-y-4">
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>النسخ الاحتياطي المحلي والأمان</span>
              </h3>

              <p className="text-xs text-slate-500 leading-relaxed">
                يتم حفظ قاعدة البيانات SQLite محلياً. يُنصح بتحميل نسخة احتياطية دورياً وحفظها على قرص خارجي (Flash Drive / Cloud Storage) لحماية بيانات المعرض.
              </p>

              <div className="space-y-2 pt-2">
                <button
                  onClick={handleExportBackup}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 text-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>تنزيل نسخة احتياطية (SQLite Backup)</span>
                </button>

                <label className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 text-xs cursor-pointer border border-dashed border-slate-300">
                  <Upload className="w-4 h-4" />
                  <span>استعادة قاعدة البيانات من ملف</span>
                  <input
                    type="file"
                    accept=".sqlite,.db"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>الاستعادة تقوم باستبدال كافة البيانات الحالية. احرص على أخذ نسخة قبل الاستعادة.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
