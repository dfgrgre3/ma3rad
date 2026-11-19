import React from 'react';
import type { InvoiceSectionId, InvoiceTableColumnId, SystemSettings } from '../../../../types';
import type { PrintService } from '../../../../services/shared/PrintService';
import type { InvoiceSizeId, InvoiceTemplateId } from '../../../../services/shared/PrintService';
import type { useToast } from '../../../../components/ui/Toast';
import type { SettingsSetter } from './types';
import { InvoiceHeaderBar } from './InvoiceHeaderBar';
import { InvoiceTemplateApproval } from './InvoiceTemplateApproval';
import { InvoiceDetailsSection } from './InvoiceDetailsSection';
import { InvoiceTableSection } from './InvoiceTableSection';
import { InvoicePrintersSection } from './InvoicePrintersSection';
import { InvoiceHeaderFooterSection } from './InvoiceHeaderFooterSection';
import { InvoicePreviewModal } from './InvoicePreviewModal';

type ToastApi = ReturnType<typeof useToast>;

interface InvoiceTabProps {
  settings: SystemSettings;
  set: SettingsSetter;
  readOnly: boolean;
  toast: ToastApi;
  printService: PrintService;
  systemPrinters: string[];
  isScanningPrinters: boolean;
  scannedPrintersCount: number | null;
  scanPrinters: (notify?: boolean) => void;
  previewModalOpen: boolean;
  setPreviewModalOpen: (value: boolean) => void;
  previewTemplate: InvoiceTemplateId;
  setPreviewTemplate: (value: InvoiceTemplateId) => void;
  previewSize: InvoiceSizeId;
  setPreviewSize: (value: InvoiceSizeId) => void;
  onLogo: (file: File | undefined) => void;
  invoiceTableColumns: InvoiceTableColumnId[];
  invoiceSectionOrder: InvoiceSectionId[];
  setInvoiceTableColumn: (column: InvoiceTableColumnId, checked: boolean) => void;
  setInvoiceTableColumnGroup: (columns: InvoiceTableColumnId[], checked: boolean) => void;
  moveInvoiceTableColumn: (column: InvoiceTableColumnId, direction: -1 | 1) => void;
  moveInvoiceSection: (section: InvoiceSectionId, direction: -1 | 1) => void;
}

export const InvoiceTab: React.FC<InvoiceTabProps> = ({
  settings,
  set,
  readOnly,
  toast,
  printService,
  systemPrinters,
  isScanningPrinters,
  scannedPrintersCount,
  scanPrinters,
  previewModalOpen,
  setPreviewModalOpen,
  previewTemplate,
  setPreviewTemplate,
  previewSize,
  setPreviewSize,
  onLogo,
  invoiceTableColumns,
  invoiceSectionOrder,
  setInvoiceTableColumn,
  setInvoiceTableColumnGroup,
  moveInvoiceTableColumn,
  moveInvoiceSection,
}) => (
  <div className="space-y-6">
    {/* Action Bar Header */}
    <InvoiceHeaderBar
      isScanningPrinters={isScanningPrinters}
      scannedPrintersCount={scannedPrintersCount}
      scanPrinters={scanPrinters}
      onOpenPreview={() => {
        setPreviewTemplate((settings.defaultInvoiceTemplate as InvoiceTemplateId) || 'table');
        setPreviewSize((settings.defaultInvoiceSize as InvoiceSizeId) || 'a4');
        setPreviewModalOpen(true);
      }}
    />

    {/* Section 1: Template Approval & Favorite Size */}
    <InvoiceTemplateApproval
      settings={settings}
      set={set}
      readOnly={readOnly}
      toast={toast}
      setPreviewTemplate={setPreviewTemplate}
      setPreviewSize={setPreviewSize}
      setPreviewModalOpen={setPreviewModalOpen}
    />

    {/* Section: Invoice Details & Appearance */}
    <InvoiceDetailsSection
      settings={settings}
      set={set}
      readOnly={readOnly}
      onLogo={onLogo}
      invoiceSectionOrder={invoiceSectionOrder}
      moveInvoiceSection={moveInvoiceSection}
    />

    {/* Section: Invoice Items Table Customization Design */}
    <InvoiceTableSection
      settings={settings}
      set={set}
      readOnly={readOnly}
      invoiceTableColumns={invoiceTableColumns}
      setInvoiceTableColumn={setInvoiceTableColumn}
      setInvoiceTableColumnGroup={setInvoiceTableColumnGroup}
      moveInvoiceTableColumn={moveInvoiceTableColumn}
    />

    {/* Section 2: Unified Printer Setup For Each Size (All in one place) */}
    <InvoicePrintersSection
      settings={settings}
      set={set}
      printService={printService}
      systemPrinters={systemPrinters}
      isScanningPrinters={isScanningPrinters}
      scanPrinters={scanPrinters}
    />

    {/* Section 3: Header & Footer Text */}
    <InvoiceHeaderFooterSection settings={settings} set={set} />

    {/* Live Form Preview Modal */}
    {previewModalOpen && (
      <InvoicePreviewModal
        settings={settings}
        set={set}
        readOnly={readOnly}
        toast={toast}
        printService={printService}
        previewTemplate={previewTemplate}
        setPreviewTemplate={setPreviewTemplate}
        previewSize={previewSize}
        setPreviewSize={setPreviewSize}
        setPreviewModalOpen={setPreviewModalOpen}
      />
    )}
  </div>
);
