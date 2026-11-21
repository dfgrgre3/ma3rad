import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { DataTable } from '../../../components/ui/DataTable';

interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
  csvImporting: boolean;
  executeCsvImport: () => void;
  csvFile: File | null;
  handleCsvFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  csvPreview: string[][];
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  open,
  onClose,
  csvImporting,
  executeCsvImport,
  csvFile,
  handleCsvFileSelect,
  csvPreview,
}) => (
      <Modal
        open={open}
        onClose={onClose}
        title="استيراد عملاء من CSV"
        description="ارفع ملف CSV لإنشاء أو تحديث عملاء بشكل مجمّع. الأعمدة المطلوبة: اسم، كود (اختياري)."
        size="lg"
        busy={csvImporting}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={csvImporting}>إلغاء</Button>
            <Button variant="primary" onClick={executeCsvImport} loading={csvImporting} disabled={!csvFile || csvImporting}>
              استيراد
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface-muted p-3">
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvFileSelect}
              className="block w-full text-sm text-ink-secondary file:mr-4 file:rounded-lg file:border-0 file:bg-success-soft file:text-success hover:file:bg-success-soft"
              disabled={csvImporting}
            />
            <p className="mt-2 text-[10.5px] text-muted">تنسيق CSV مدعوم: أعمدة بالعربية أو الإنجليزية. سيستخدم الكود لتحديث العميل إن وجد، وإلا سينشئ جديد.</p>
          </div>
          {csvPreview.length > 0 && (
            <div className="rounded-lg border border-line overflow-hidden">
              <p className="px-3 py-2 text-[10.5px] font-semibold text-ink bg-surface-muted border-b">معاينة أول 5 أسطر:</p>
                            <DataTable
                ariaLabel="معاينة استيراد CSV"
                rows={csvPreview.slice(1).map((cells, index) => ({ cells, index }))}
                rowKey={(row) => `preview-${row.index}`}
                minWidth={600}
                dense
                columns={csvPreview[0].map((h, i) => ({
                  key: `col-${i}`,
                  header: h || `عمود ${i + 1}`,
                  render: (row: { cells: string[]; index: number }) => <span className="text-[10.5px]">{row.cells[i] ?? ''}</span>,
                }))}
              />
            </div>
          )}
        </div>
      </Modal>
);
