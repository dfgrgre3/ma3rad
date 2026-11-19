import React from 'react';
import { CalendarDays, Search } from 'lucide-react';
import type { PartyOption } from './types';
import { dateString, reportOptions, typeOptions } from './constants';

type Props = {
  filteredCount: number;
  anchorDate: Date;
  onAnchorDateChange: (date: Date) => void;
  search: string;
  onSearchChange: (value: string) => void;
  selectedType: string;
  onTypeChange: (value: string) => void;
  selectedStatus: string;
  onStatusChange: (value: string) => void;
  partyFilter: string;
  onPartyFilterChange: (value: string) => void;
  partyIdFilter: string;
  onPartyIdChange: (value: string) => void;
  partyOptions: PartyOption[];
  accountFilter: string;
  onAccountChange: (value: string) => void;
  accounts: string[];
  currencyFilter: string;
  onCurrencyChange: (value: string) => void;
  currencies: string[];
  amountMin: string;
  onAmountMinChange: (value: string) => void;
  amountMax: string;
  onAmountMaxChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  onClearDateRange: () => void;
  reportType: string;
  onReportTypeChange: (value: string) => void;
  canExport: boolean;
  onExportExcel: () => void;
  onExportPdf: () => void;
};

export const FilterPanel: React.FC<Props> = ({
  filteredCount,
  anchorDate,
  onAnchorDateChange,
  search,
  onSearchChange,
  selectedType,
  onTypeChange,
  selectedStatus,
  onStatusChange,
  partyFilter,
  onPartyFilterChange,
  partyIdFilter,
  onPartyIdChange,
  partyOptions,
  accountFilter,
  onAccountChange,
  accounts,
  currencyFilter,
  onCurrencyChange,
  currencies,
  amountMin,
  onAmountMinChange,
  amountMax,
  onAmountMaxChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onClearDateRange,
  reportType,
  onReportTypeChange,
  canExport,
  onExportExcel,
  onExportPdf,
}) => (
  <>
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
      <div>
        <h3 className="text-sm font-bold text-slate-800">تصفية الأحداث</h3>
        <p className="mt-0.5 text-xs text-slate-500">{filteredCount} حدث ضمن الفترة والمرشحات الحالية</p>
      </div>
      <Search className="h-4 w-4 shrink-0 text-cyan-700" aria-hidden="true" />
    </div>
    <label className="flex items-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 text-sm font-semibold text-slate-700 xl:hidden">
      <CalendarDays className="h-4 w-4 shrink-0 text-cyan-800" />
      <span className="shrink-0">انتقل إلى يوم</span>
      <input
        aria-label="اختيار تاريخ التقويم"
        type="date"
        value={dateString(anchorDate)}
        onChange={(event) => {
          if (event.target.value) onAnchorDateChange(new Date(`${event.target.value}T00:00:00`));
        }}
        className="min-w-0 flex-1 rounded-lg border border-cyan-200 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
      />
    </label>
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="relative sm:col-span-2 lg:col-span-1">
        <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="بحث بالعنوان أو الطرف أو المرجع" className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-9 pl-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
      </label>
      <select aria-label="نوع الحدث" value={selectedType} onChange={(event) => onTypeChange(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
        <option value="all">كل أنواع الأحداث</option>
        {typeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>
      <select aria-label="حالة الحدث" value={selectedStatus} onChange={(event) => onStatusChange(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
        <option value="all">كل الحالات</option>
        {['مجدول', 'مستحق اليوم', 'مدفوع', 'محصل', 'مدفوع جزئيًا', 'محصل جزئيًا', 'متأخر', 'ملغي'].map((status) => <option key={status} value={status}>{status}</option>)}
        <option value="partial">جزئيًا</option>
      </select>
      <select aria-label="نوع الطرف" value={partyFilter} onChange={(event) => onPartyFilterChange(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
        <option value="">كل الأطراف</option>
        <option value="CUSTOMER">عميل</option><option value="SUPPLIER">مورد</option><option value="EMPLOYEE">موظف</option><option value="OTHER">أخرى</option>
      </select>
      <select aria-label="العميل أو المورد" value={partyIdFilter} onChange={(event) => onPartyIdChange(event.target.value)} disabled={!partyOptions.length} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:bg-slate-100">
        <option value="">كل الأطراف المحددة</option>
        {partyOptions.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
      </select>
      <select aria-label="الحساب المالي" value={accountFilter} onChange={(event) => onAccountChange(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
        <option value="">كل الحسابات المالية</option>
        {accounts.map((account) => <option key={account} value={account}>{account}</option>)}
      </select>
      <select aria-label="العملة" value={currencyFilter} onChange={(event) => onCurrencyChange(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
        <option value="">كل العملات</option>
        {currencies.map((currency) => <option key={currency}>{currency}</option>)}
      </select>
      <div className="flex gap-2">
        <input aria-label="أقل مبلغ" type="number" min="0" value={amountMin} onChange={(event) => onAmountMinChange(event.target.value)} placeholder="من مبلغ" className="min-w-0 w-1/2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
        <input aria-label="أعلى مبلغ" type="number" min="0" value={amountMax} onChange={(event) => onAmountMaxChange(event.target.value)} placeholder="إلى مبلغ" className="min-w-0 w-1/2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
      </div>
      <div className="flex gap-2">
        <input aria-label="من تاريخ" type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} className="min-w-0 w-1/2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
        <input aria-label="إلى تاريخ" type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} className="min-w-0 w-1/2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
      </div>
      {(dateFrom || dateTo) && <button type="button" onClick={onClearDateRange} className="justify-self-start text-xs font-semibold text-cyan-800 hover:underline">إلغاء نطاق التاريخ</button>}
      <div className="flex gap-2">
        <select aria-label="التقرير المالي" value={reportType} onChange={(event) => onReportTypeChange(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
          {reportOptions.map((report) => <option key={report.value} value={report.value}>{report.label}</option>)}
        </select>
        {canExport && (
          <>
            <button type="button" onClick={onExportExcel} title="تصدير Excel" className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">Excel</button>
            <button type="button" onClick={onExportPdf} title="تصدير PDF" className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">PDF</button>
          </>
        )}
      </div>
    </div>
  </>
);

