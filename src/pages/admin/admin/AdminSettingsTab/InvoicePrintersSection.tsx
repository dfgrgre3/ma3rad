import React from 'react';
import { Printer, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { SystemSettings } from '../../../../types';
import type { InvoiceTemplateId } from '../../../../services/shared/PrintService';
import type { PrintService } from '../../../../services/shared/PrintService';
import { inputCls, labelCls } from '../AdminSettingsFields';
import type { SettingsSetter } from './types';

interface InvoicePrintersSectionProps {
  settings: SystemSettings;
  set: SettingsSetter;
  printService: PrintService;
  systemPrinters: string[];
  isScanningPrinters: boolean;
  scanPrinters: (notify?: boolean) => void;
}

export const InvoicePrintersSection: React.FC<InvoicePrintersSectionProps> = ({
  settings,
  set,
  printService,
  systemPrinters,
  isScanningPrinters,
  scanPrinters,
}) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-sky-600" />
        <div>
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
            طابعة كل مقاس من مكان واحد (Unified Printers Hub)
          </h4>
          <p className="text-[11px] text-slate-500">
            اضبط الطابعة المخصصة لكل حجم (A4، A5، إيصالات كاشير، باركود) بسهولة مع إمكانية تجربة الطباعة فوراً
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => scanPrinters(true)}
          className="text-[11px] font-bold text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${isScanningPrinters ? 'animate-spin' : ''}`} />
          تحديث طابعات ويندوز
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* A4 Printer */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5 text-sky-600" />
            طابعة مقاس A4 (فواتير كاملة)
          </label>
          <button
            type="button"
            onClick={() => printService.printTestPage('a4', (settings.defaultInvoiceTemplate as InvoiceTemplateId) || 'table')}
            className="text-[11px] font-bold text-sky-600 hover:underline"
          >
            تجربة طباعة A4
          </button>
        </div>

        {systemPrinters.length > 0 ? (
          <div className="flex gap-2">
            <select
              value={settings.a4PrinterName || ''}
              onChange={(e) => set('a4PrinterName', e.target.value)}
              className={inputCls}
            >
              <option value="">-- اختر طابعة من النظام --</option>
              {systemPrinters.map((p) => (
                <option key={p} value={p}>{p} {p === settings.a4PrinterName ? '✓' : ''}</option>
              ))}
            </select>
            <input
              value={settings.a4PrinterName || ''}
              onChange={(e) => set('a4PrinterName', e.target.value)}
              placeholder="أو اكتب الاسم يدوياً"
              className={`${inputCls} max-w-[140px]`}
              title="كتابة الاسم يدوياً"
            />
          </div>
        ) : (
          <input
            value={settings.a4PrinterName || ''}
            onChange={(e) => set('a4PrinterName', e.target.value)}
            placeholder="مثال: HP LaserJet Pro M404"
            className={inputCls}
          />
        )}
        <p className="text-[10px] text-slate-400">تُستخدم لطباعة الفواتير، عروض الأسعار، وسندات المرتجع بمقاس A4.</p>
      </div>

      {/* A5 Printer */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5 text-sky-600" />
            طابعة مقاس A5 (نصف صفحة)
          </label>
          <button
            type="button"
            onClick={() => printService.printTestPage('a5', (settings.defaultInvoiceTemplate as InvoiceTemplateId) || 'table')}
            className="text-[11px] font-bold text-sky-600 hover:underline"
          >
            تجربة طباعة A5
          </button>
        </div>

        {systemPrinters.length > 0 ? (
          <div className="flex gap-2">
            <select
              value={settings.a5PrinterName || ''}
              onChange={(e) => set('a5PrinterName', e.target.value)}
              className={inputCls}
            >
              <option value="">-- اختر طابعة من النظام --</option>
              {systemPrinters.map((p) => (
                <option key={p} value={p}>{p} {p === settings.a5PrinterName ? '✓' : ''}</option>
              ))}
            </select>
            <input
              value={settings.a5PrinterName || ''}
              onChange={(e) => set('a5PrinterName', e.target.value)}
              placeholder="أو اكتب الاسم يدوياً"
              className={`${inputCls} max-w-[140px]`}
              title="كتابة الاسم يدوياً"
            />
          </div>
        ) : (
          <input
            value={settings.a5PrinterName || ''}
            onChange={(e) => set('a5PrinterName', e.target.value)}
            placeholder="مثال: Epson L3150 (A5)"
            className={inputCls}
          />
        )}
        <p className="text-[10px] text-slate-400">تُستخدم للطباعة على دفاتر أو ورق A5 الاقتصادي نصف الحجم.</p>
      </div>

      {/* Thermal Printer */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 space-y-2.5 md:col-span-2">
        <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5 text-amber-600" />
            طابعة الإيصالات الحرارية (كاشير ونقاط البيع POS Thermal)
          </label>
          <button
            type="button"
            onClick={() => printService.printTestPage('thermal')}
            className="text-[11px] font-bold text-amber-600 hover:underline"
          >
            تجربة طباعة إيصال حراري
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>اسم طابعة الإيصالات</label>
            {systemPrinters.length > 0 ? (
              <div className="flex gap-2">
                <select
                  value={settings.thermalPrinterName || ''}
                  onChange={(e) => set('thermalPrinterName', e.target.value)}
                  className={inputCls}
                >
                  <option value="">-- اختر طابعة من النظام --</option>
                  {systemPrinters.map((p) => (
                    <option key={p} value={p}>{p} {p === settings.thermalPrinterName ? '✓' : ''}</option>
                  ))}
                </select>
                <input
                  value={settings.thermalPrinterName || ''}
                  onChange={(e) => set('thermalPrinterName', e.target.value)}
                  placeholder="يدوي"
                  className={`${inputCls} max-w-[120px]`}
                />
              </div>
            ) : (
              <input
                value={settings.thermalPrinterName || ''}
                onChange={(e) => set('thermalPrinterName', e.target.value)}
                placeholder="مثال: Xprinter XP-N160I أو POS-80"
                className={inputCls}
              />
            )}
          </div>

          <div>
            <label className={labelCls}>عرض ورق الإيصال</label>
            <select
              value={settings.thermalPaperWidth || '80'}
              onChange={(e) => set('thermalPaperWidth', e.target.value as '58' | '80')}
              className={inputCls}
            >
              <option value="80">80 مم (الأكثر شيوعاً - 48 حرفاً)</option>
              <option value="58">58 مم (شريط ضيق - 32 حرفاً)</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>كود ترميز الأحرف (Codepage)</label>
            <select
              value={settings.thermalCodepage ?? 54}
              onChange={(e) => set('thermalCodepage', Number(e.target.value))}
              className={inputCls}
            >
              <option value={54}>54 — عربي ويندوز-1256 (الأغلب)</option>
              <option value={32}>32 — عربي (بعض الأجهزة)</option>
              <option value={16}>16 — WPC1256 (أجهزة أخرى)</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>طريقة التوصيل</label>
            <select
              value={settings.thermalTransport || 'system'}
              onChange={(e) => set('thermalTransport', e.target.value as 'system' | 'network')}
              className={inputCls}
            >
              <option value="system">طابعة مثبتة في النظام (USB)</option>
              <option value="network">طابعة شبكية مباشرة (TCP 9100)</option>
            </select>
          </div>

          {settings.thermalTransport === 'network' && (
            <>
              <div className="sm:col-span-2">
                <label className={labelCls}>عنوان IPv4 الخاص بالطابعة الشبكية</label>
                <input
                  value={settings.thermalHost || ''}
                  onChange={(e) => set('thermalHost', e.target.value)}
                  placeholder="مثال: 192.168.1.150"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>منفذ الطباعة (Port)</label>
                <input value="9100" readOnly className={`${inputCls} bg-slate-100 dark:bg-slate-700/50`} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Barcode / Labels Printer */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 space-y-2 md:col-span-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5 text-indigo-600" />
            طابعة ملصقات الباركود والأصناف (Barcode Labels Printer)
          </label>
        </div>

        {systemPrinters.length > 0 ? (
          <div className="flex gap-2">
            <select
              value={settings.barcodePrinterName || ''}
              onChange={(e) => set('barcodePrinterName', e.target.value)}
              className={inputCls}
            >
              <option value="">-- اختر طابعة ملصقات من النظام --</option>
              {systemPrinters.map((p) => (
                <option key={p} value={p}>{p} {p === settings.barcodePrinterName ? '✓' : ''}</option>
              ))}
            </select>
            <input
              value={settings.barcodePrinterName || ''}
              onChange={(e) => set('barcodePrinterName', e.target.value)}
              placeholder="أو اكتب الاسم يدوياً"
              className={`${inputCls} max-w-[160px]`}
            />
          </div>
        ) : (
          <input
            value={settings.barcodePrinterName || ''}
            onChange={(e) => set('barcodePrinterName', e.target.value)}
            placeholder="مثال: Xprinter XP-365B أو Zebra ZD220"
            className={inputCls}
          />
        )}
        <p className="text-[10px] text-slate-400">تُستخدم لطباعة ملصقات الباركود، كود التخزين، وأسعار البضائع على الرفوف.</p>
      </div>
    </div>
  </div>
);
