import type { FormEvent } from 'react';
import type { Warehouse } from '../../types';

export type StockTransferTab = 'workflow' | 'history' | 'summary';

export type TransferQuantityKey = 'quantityM2' | 'shippedM2' | 'receivedM2' | 'lostM2';

export interface TransferRequestItem {
  productId: string;
  quantityM2: number;
  notes: string;
}

export interface ReceiptInput {
  receivedM2: number;
  lostM2: number;
  damagedM2: number;
  notes: string;
}

export interface WarehouseSummaryRow {
  warehouseId: string;
  warehouseName: string;
  unitLabel: string;
  totalIn: number;
  totalOut: number;
}

export interface WarehouseSummaryGroup {
  warehouseId: string;
  warehouseName: string;
  unitTotals: WarehouseSummaryRow[];
}

export interface StockTransfersHeaderProps {
  loading: boolean;
  onCreateTransfer: () => void;
  onRefresh: () => void;
}

export interface StockTransfersTabsProps {
  activeTab: StockTransferTab;
  onTabChange: (tab: StockTransferTab) => void;
  workflowCount: number;
  historyCount: number;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
}

export interface WorkflowTransfersTableProps {
  transfers: any[];
  onViewDetails: (trf: any) => void;
  onApprove: (trfId: string) => void;
  onReject: (trfId: string) => void;
  onPrepare: (trfId: string) => void;
  onDispatch: (trfId: string) => void;
  onOpenReceive: (trf: any) => void;
}

export interface TransferHistoryTableProps {
  transfers: any[];
}

export interface WarehouseSummaryGridProps {
  warehouseSummary: any[];
}

export interface CreateTransferModalProps {
  warehouses: Warehouse[];
  allProducts: any[];
  fromWhId: string;
  toWhId: string;
  onFromWhChange: (value: string) => void;
  onToWhChange: (value: string) => void;
  requestNotes: string;
  onRequestNotesChange: (value: string) => void;
  requestItems: TransferRequestItem[];
  onRequestItemsChange: (items: TransferRequestItem[]) => void;
  onAddItemRow: () => void;
  onRemoveItemRow: (idx: number) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export interface ReceiveTransferModalProps {
  transfer: any;
  items: any[];
  receiptInputs: Record<string, ReceiptInput>;
  onReceiptInputsChange: (inputs: Record<string, ReceiptInput>) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export interface TransferDetailsModalProps {
  transfer: any;
  items: any[];
  onClose: () => void;
}
