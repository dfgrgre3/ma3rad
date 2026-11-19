import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Download, Printer } from 'lucide-react';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { SupplierStatement } from '../../../types/purchasing/supplierDetailPage';

export interface StatementTabProps {
  supplierName: string;
  statement: SupplierStatement;
  statementFrom: string;
  statementTo: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onClearFilters: () => void;
  canExport: boolean;
  onExportCsv: () => void;
  onPrint: () => void;
}

export const StatementTab: React.FC<StatementTabProps> = ({
  supplierName,
  statement,
  statementFrom,
  statementTo,
  onFromChange,
  onToChange,
  onClearFilters,
  canExport,
  onExportCsv,
  onPrint,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              كشف حساب المورد: {supplierName}
            </h3>
            <p className="text-xs text-slate-500">
              حركات الشراء وسندات الصرف ورصيد الحساب التراكمي
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <label className="font-bold text-slate-600">من:</label>
              <input
                type="date"
                value={statementFrom}
                onChange={(e) => onFromChange(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
              />
              <label className="font-bold text-slate-600">إلى:</label>
              <input
                type="date"
                value={statementTo}
                onChange={(e) => onToChange(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
              />
              {(statementFrom || statementTo) && (
                <button
                  onClick={onClearFilters}
                  className="text-xs text-rose-600 font-bold hover:underline"
                >
                  إلغاء التصفية
                </button>
              )}
            </div>

            {canExport && <button
              onClick={onExportCsv}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير CSV</span>
            </button>}

            {canExport && <button
              onClick={onPrint}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة كشف الحساب</span>
            </button>}
          </div>
        </div>

        {/* Statement Balances Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl">
          <div>
            <span className="text-xs text-slate-500 font-bold">رصيد أول المدة:</span>
            <div className="text-lg font-black text-slate-800">
              {CeramicMath.formatCurrency(statement.openingBalance)}
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-500 font-bold">إجمالي الحركات في الفترة:</span>
            <div className="text-lg font-bold text-slate-700">
              {statement.transactions.length} حركة
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-500 font-bold">الرصيد الختامي المستحق:</span>
            <div
              className={`text-lg font-black ${
                statement.closingBalance > 0
                  ? 'text-rose-600'
                  : statement.closingBalance < 0
                  ? 'text-emerald-600'
                  : 'text-slate-800'
              }`}
            >
              {CeramicMath.formatCurrency(statement.closingBalance)}
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <DataTable
            ariaLabel="كشف حساب المورد"
            rows={statement.transactions}
            rowKey={(tx: any) => String(tx.id)}
            minWidth={700}
            dense
            tableClassName="text-xs"
            rowClassName={() => 'transition hover:bg-slate-50'}
            columns={[
              { key: 'date', header: 'التاريخ', render: (tx: any) => <span className="font-mono text-slate-600">{tx.date}</span> },
              {
                key: 'type', header: 'النوع',
                render: (tx: any) => (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tx.type === 'PURCHASE' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {tx.type === 'PURCHASE' ? 'فاتورة شراء' : 'سداد دفعة'}
                  </span>
                ),
              },
              { key: 'doc', header: 'رقم المستند', render: (tx: any) => <span className="font-mono font-bold text-slate-900">{tx.docNumber}</span> },
              { key: 'desc', header: 'البيان والتفاصيل', render: (tx: any) => <span className="text-slate-700">{tx.description}</span> },
              { key: 'debit', header: 'مدين (سداد)', headerClassName: 'text-emerald-700', render: (tx: any) => <span className="font-black text-emerald-700">{tx.debit > 0 ? CeramicMath.formatCurrency(tx.debit) : '—'}</span> },
              { key: 'credit', header: 'دائن (توريد)', headerClassName: 'text-rose-700', render: (tx: any) => <span className="font-black text-rose-700">{tx.credit > 0 ? CeramicMath.formatCurrency(tx.credit) : '—'}</span> },
              { key: 'bal', header: 'الرصيد بعد الحركة', render: (tx: any) => <span className="font-mono font-black text-slate-900">{CeramicMath.formatCurrency(tx.balanceAfter)}</span> },
            ]}
            emptyTitle="لا توجد حركات في الفترة المحددة."
          />
        </div>
      </div>
    </div>
  );
};
