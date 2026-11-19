import type { FC } from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { STATUS_LABELS, money } from './constants';
import type { OperationsShiftsState } from './useOperationsShifts';

interface ReportsTabProps {
  state: OperationsShiftsState;
}

/** Reports tab: date range picker and the shift report DataTable. */
export const ReportsTab: FC<ReportsTabProps> = ({ state }) => {
  const {
    report, reportFrom, setReportFrom, reportTo, setReportTo,
    setReport, service, notify,
  } = state;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-xs font-bold text-slate-600">من
          <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)}
            className="block mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-bold text-slate-600">إلى
          <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)}
            className="block mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <button type="button"
          onClick={() => {
            try { setReport(service.getShiftReport(reportFrom, reportTo)); }
            catch (e: any) { notify(e.message || 'تعذر تحميل التقرير.', true); }
          }}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold">تشغيل التقرير</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <DataTable
          ariaLabel="تقرير الورديات"
          rows={report}
          rowKey={(row: any) => String(row.shiftId)}
          dense
          tableClassName="whitespace-nowrap text-xs"
          rowClassName={() => 'border-t border-slate-100'}
          columns={[
            { key: 'shift', header: 'الوردية', render: (row: any) => <span className="font-bold text-slate-700">{row.definitionName}</span> },
            { key: 'date', header: 'التاريخ', render: (row: any) => <span>{row.businessDate}</span> },
            { key: 'status', header: 'الحالة', render: (row: any) => <span>{STATUS_LABELS[row.status as keyof typeof STATUS_LABELS] || row.status}</span> },
            { key: 'supervisor', header: 'المشرف', render: (row: any) => <span>{row.supervisorName || '—'}</span> },
            { key: 'staff', header: 'الموظفون', render: (row: any) => <span>{row.staffCount}</span> },
            { key: 'expected', header: 'المتوقع', render: (row: any) => <span>{money(row.expectedCash)}</span> },
            { key: 'actual', header: 'الفعلي', render: (row: any) => <span>{money(row.actualCash)}</span> },
            { key: 'diff', header: 'الفرق', render: (row: any) => <span>{money(row.cashDifference)}</span> },
            { key: 'delivered', header: 'المسلّم', render: (row: any) => <span>{money(row.cashDelivered)}</span> },
            { key: 'produced', header: 'إنتاج جيد', render: (row: any) => <span>{row.producedQty}</span> },
            { key: 'scrap', header: 'هالك', render: (row: any) => <span>{row.scrapQty}</span> },
            { key: 'downtime', header: 'توقف', render: (row: any) => <span>{row.downtimeMinutes}</span> },
            { key: 'incidents', header: 'ملاحظات', render: (row: any) => <span>{row.incidents}</span> },
            { key: 'labor', header: 'تكلفة العمالة', render: (row: any) => <span>{money(row.laborCost)}</span> },
            { key: 'overtime', header: 'إضافي معتمد (د)', render: (row: any) => <span>{row.approvedOvertimeMinutes}</span> },
            { key: 'prodHour', header: 'إنتاج/ساعة عمل', render: (row: any) => <span>{row.productivityPerLaborHour.toFixed(2)}</span> },
            { key: 'costUnit', header: 'تكلفة/وحدة', render: (row: any) => <span>{money(row.costPerGoodUnit)}</span> },
          ]}
          emptyTitle="لا توجد بيانات."
        />
      </div>
    </div>
  );
};
