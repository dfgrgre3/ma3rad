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
      <div className="bg-surface rounded-2xl border border-line p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div>
            <h3 className="text-base font-extrabold text-ink">
              كشف حساب المورد: {supplierName}
            </h3>
            <p className="text-xs text-muted">
              حركات الشراء وسندات الصرف ورصيد الحساب التراكمي
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <label className="font-bold text-ink-secondary">من:</label>
              <input
                type="date"
                value={statementFrom}
                onChange={(e) => onFromChange(e.target.value)}
                className="px-2.5 py-1.5 border border-line rounded-lg text-xs"
              />
              <label className="font-bold text-ink-secondary">إلى:</label>
              <input
                type="date"
                value={statementTo}
                onChange={(e) => onToChange(e.target.value)}
                className="px-2.5 py-1.5 border border-line rounded-lg text-xs"
              />
              {(statementFrom || statementTo) && (
                <button
                  onClick={onClearFilters}
                  className="text-xs text-danger font-bold hover:underline"
                >
                  إلغاء التصفية
                </button>
              )}
            </div>

            {canExport && <button
              onClick={onExportCsv}
              className="px-3 py-1.5 bg-surface border border-line hover:bg-surface-muted text-ink font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير CSV</span>
            </button>}

            {canExport && <button
              onClick={onPrint}
              className="px-3 py-1.5 bg-primary hover:bg-primary text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة كشف الحساب</span>
            </button>}
          </div>
        </div>

        {/* Statement Balances Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-surface-muted p-4 rounded-xl">
          <div>
            <span className="text-xs text-muted font-bold">رصيد أول المدة:</span>
            <div className="text-lg font-black text-ink">
              {CeramicMath.formatCurrency(statement.openingBalance)}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted font-bold">إجمالي الحركات في الفترة:</span>
            <div className="text-lg font-bold text-ink">
              {statement.transactions.length} حركة
            </div>
          </div>
          <div>
            <span className="text-xs text-muted font-bold">الرصيد الختامي المستحق:</span>
            <div
              className={`text-lg font-black ${
                statement.closingBalance > 0
                  ? 'text-danger'
                  : statement.closingBalance < 0
                  ? 'text-success'
                  : 'text-ink'
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
            rowClassName={() => 'transition hover:bg-surface-muted'}
            columns={[
              { key: 'date', header: 'التاريخ', render: (tx: any) => <span className="font-mono text-ink-secondary">{tx.date}</span> },
              {
                key: 'type', header: 'النوع',
                render: (tx: any) => (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tx.type === 'PURCHASE' ? 'bg-accent-soft text-primary' : 'bg-success-soft text-success'}`}>
                    {tx.type === 'PURCHASE' ? 'فاتورة شراء' : 'سداد دفعة'}
                  </span>
                ),
              },
              { key: 'doc', header: 'رقم المستند', render: (tx: any) => <span className="font-mono font-bold text-ink">{tx.docNumber}</span> },
              { key: 'desc', header: 'البيان والتفاصيل', render: (tx: any) => <span className="text-ink">{tx.description}</span> },
              { key: 'debit', header: 'مدين (سداد)', headerClassName: 'text-success', render: (tx: any) => <span className="font-black text-success">{tx.debit > 0 ? CeramicMath.formatCurrency(tx.debit) : '—'}</span> },
              { key: 'credit', header: 'دائن (توريد)', headerClassName: 'text-danger', render: (tx: any) => <span className="font-black text-danger">{tx.credit > 0 ? CeramicMath.formatCurrency(tx.credit) : '—'}</span> },
              { key: 'bal', header: 'الرصيد بعد الحركة', render: (tx: any) => <span className="font-mono font-black text-ink">{CeramicMath.formatCurrency(tx.balanceAfter)}</span> },
            ]}
            emptyTitle="لا توجد حركات في الفترة المحددة."
          />
        </div>
      </div>
    </div>
  );
};
