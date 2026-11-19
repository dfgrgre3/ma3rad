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
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvFileSelect}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
              disabled={csvImporting}
            />
            <p className="mt-2 text-[10.5px] text-slate-500">تنسيق CSV مدعوم: أعمدة بالعربية أو الإنجليزية. سيستخدم الكود لتحديث العميل إن وجد، وإلا سينشئ جديد.</p>
          </div>
          {csvPreview.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <p className="px-3 py-2 text-[10.5px] font-semibold text-slate-700 bg-slate-50 border-b">معاينة أول 5 أسطر:</p>
                            <DataTable
                ariaLabel="معاينة استيراد CSV"
                rows={csvPreview.slice(1)}
                rowKey={(row) => row.join('¦')}
                minWidth={600}
                dense
                columns={csvPreview[0].map((h, i) => ({
                  key: `col-${i}`,
                  header: h || `عمود ${i + 1}`,
                  render: (row: string[]) => <span className="text-[10.5px]">{row[i] ?? ''}</span>,
                }))}
              />
            </div>
          )}
        </div>
      </Modal>
);
