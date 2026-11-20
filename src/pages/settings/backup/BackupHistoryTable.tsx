import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Clock } from 'lucide-react';

interface BackupHistoryTableProps {
  history: any[];
  formatSize: (bytes: number) => string;
}

export const BackupHistoryTable: React.FC<BackupHistoryTableProps> = ({ history, formatSize }) => (
<>
      {/* Backup History Table */}
      <div className="px-6 pb-6">
        <div className="bg-surface border border-line rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 border-b border-line pb-3">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted" />
              سجل النسخ الاحتياطية السابقة
            </h3>
            <span className="text-xs text-muted">{history.length} عمليات مسجلة</span>
          </div>

          {history.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">
              لم يتم تسجيل أي عمليات نسخ سابقة بعد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <DataTable
              ariaLabel="سجل النسخ الاحتياطي"
              rows={history}
              rowKey={(row: any) => String(row.file_name)}
              dense
              tableClassName="text-xs"
              rowClassName={() => 'transition hover:bg-surface-sunken'}
              columns={[
                { key: 'name', header: 'اسم الملف', render: (row: any) => <span className="font-mono font-bold text-ink">{row.file_name}</span> },
                { key: 'size', header: 'حجم الملف', render: (row: any) => <span className="font-mono text-muted">{formatSize(row.file_size_bytes)}</span> },
                { key: 'type', header: 'نوع النسخ', render: (row: any) => <span className="text-muted">{row.backup_type}</span> },
                { key: 'status', header: 'الحالة', render: (row: any) => <span className="rounded bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">{row.status}</span> },
                { key: 'date', header: 'التاريخ والوقت', render: (row: any) => <span className="font-mono text-muted">{row.created_at}</span> },
              ]}
            />
            </div>
          )}
        </div>
      </div>
</>
);
