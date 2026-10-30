import React from 'react';
import { Link } from 'react-router-dom';
import { FileSpreadsheet, Layers, Activity, ExternalLink } from 'lucide-react';

export const SettingsView: React.FC = () => {
  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">أدوات استيراد وإدارة البيانات</h2>
        <p className="text-xs text-slate-500">
          تم دمج إعدادات المعرض والطباعة والنسخ الاحتياطي في مركز إعدادات النظام. هنا روابط سريعة لأدوات البيانات.
        </p>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="space-y-2 pt-1">
          <Link
            to="/data-import"
            className="w-full py-2.5 px-4 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold rounded-xl flex items-center justify-between text-xs border border-sky-100 transition"
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-sky-600" />
              <span>مركز استيراد الملفات (جداول البيانات وCSV)</span>
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
    </div>
  );
};

export default SettingsView;