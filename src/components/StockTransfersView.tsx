import React, { useState, useEffect } from 'react';
import { InventoryService } from '../services/InventoryService';
import { ProductService } from '../services/ProductService';
import { Warehouse } from '../types';
import { useToast } from './ui/Toast';
import { StockTransfersHeader } from './stock-transfers/StockTransfersHeader';
import { StockTransfersTabs } from './stock-transfers/StockTransfersTabs';
import { WorkflowTransfersTable } from './stock-transfers/WorkflowTransfersTable';
import { TransferHistoryTable } from './stock-transfers/TransferHistoryTable';
import { WarehouseSummaryGrid } from './stock-transfers/WarehouseSummaryGrid';
import { CreateTransferModal } from './stock-transfers/CreateTransferModal';
import { ReceiveTransferModal } from './stock-transfers/ReceiveTransferModal';
import { TransferDetailsModal } from './stock-transfers/TransferDetailsModal';
import { buildTransferSummaryFields, groupSummaryByWarehouse } from './stock-transfers/helpers';
import type {
  ReceiptInput,
  StockTransferTab,
  TransferRequestItem,
} from './stock-transfers/types';

export const StockTransfersView: React.FC = () => {
  const inventoryService = new InventoryService();
  const productService = new ProductService();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<StockTransferTab>('workflow');
  const [transfers, setTransfers] = useState<any[]>([]);
  const [workflowTransfers, setWorkflowTransfers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [warehouseSummary, setWarehouseSummary] = useState<any[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  // New Transfer Request Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fromWhId, setFromWhId] = useState('');
  const [toWhId, setToWhId] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestItems, setRequestItems] = useState<TransferRequestItem[]>([]);

  // Receiving Modal
  const [receivingTransfer, setReceivingTransfer] = useState<any | null>(null);
  const [receivingItems, setReceivingItems] = useState<any[]>([]);
  const [receiptInputs, setReceiptInputs] = useState<Record<string, ReceiptInput>>({});

  // View Details Modal
  const [detailTransfer, setDetailTransfer] = useState<any | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);

  const loadData = () => {
    setLoading(true);
    try {
      const whs = inventoryService.getAllWarehouses();
      setWarehouses(whs);
      if (whs.length > 1 && !fromWhId) {
        setFromWhId(whs[0].id);
        setToWhId(whs[1].id);
      }
      setAllProducts(productService.getAllProducts());

      // 1. Workflow transfers
      const wfList = inventoryService.getTransfersWithDetails(
        statusFilter === 'ALL' ? undefined : statusFilter,
        selectedWarehouse || undefined
      );
      setWorkflowTransfers(wfList.map((transfer) => {
        const items = inventoryService.getTransferItems(transfer.id);
        return {
          ...transfer,
          ...buildTransferSummaryFields(items),
        };
      }));

      // 2. Historical ledger movements
      const txList = inventoryService.getTransfersList(
        dateFrom || undefined,
        dateTo || undefined,
        selectedWarehouse || undefined
      );
      setTransfers(txList);

      // 3. Summary
      const summaryRows = inventoryService.getTransferSummaryByWarehouse();
      setWarehouseSummary(groupSummaryByWarehouse(summaryRows));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل بيانات التحويلات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedWarehouse, statusFilter, dateFrom, dateTo]);

  const handleOpenCreate = () => {
    setRequestItems([{ productId: allProducts[0]?.id || '', quantityM2: 10, notes: '' }]);
    setShowCreateModal(true);
  };

  const handleAddItemRow = () => {
    setRequestItems([...requestItems, { productId: allProducts[0]?.id || '', quantityM2: 10, notes: '' }]);
  };

  const handleRemoveItemRow = (idx: number) => {
    setRequestItems(requestItems.filter((_, i) => i !== idx));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromWhId === toWhId) {
      toast.error('لا يمكن التحويل لنفس المخزن.');
      return;
    }
    if (requestItems.length === 0) {
      toast.error('أضف صنفاً واحداً على الأقل.');
      return;
    }
    try {
      inventoryService.createTransferRequest({
        fromWarehouseId: fromWhId,
        toWarehouseId: toWhId,
        items: requestItems,
        notes: requestNotes
      });
      toast.success('تم إنشاء طلب التحويل المخزني بنجاح وبانتظار الاعتماد.');
      setShowCreateModal(false);
      setRequestNotes('');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'فشلت العملية.');
    }
  };

  const handleApprove = (trfId: string) => {
    if (!confirm('هل تريد اعتماد أمر التحويل؟')) return;
    try {
      inventoryService.approveTransfer(trfId);
      toast.success('تم اعتماد التحويل.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر الاعتماد.');
    }
  };

  const handlePrepare = (trfId: string) => {
    try {
      inventoryService.prepareTransfer(trfId);
      toast.success('تم بدء تجهيز البضاعة بالمخزن المصدر.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر التحديث.');
    }
  };

  const handleDispatch = (trfId: string) => {
    if (!confirm('هل تأكدت من تحميل البضاعة وخروجها؟ سيتم خصم الكميات من المخزن المصدر.')) return;
    try {
      inventoryService.dispatchTransfer(trfId);
      toast.success('تم إرسال الشحنة وخصمها من رصيد المصدر، وهي قيد النقل الآن.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر الإرسال.');
    }
  };

  const handleOpenReceive = (trf: any) => {
    setReceivingTransfer(trf);
    try {
      const items = inventoryService.getTransferItems(trf.id);
      setReceivingItems(items);
      const initialMap: Record<string, any> = {};
      items.forEach(i => {
        initialMap[i.id] = {
          receivedM2: i.shippedM2 || i.quantityM2,
          lostM2: 0,
          damagedM2: 0,
          notes: ''
        };
      });
      setReceiptInputs(initialMap);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل أصناف التحويل.');
    }
  };

  const handleReceiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingTransfer) return;
    try {
      const receipts = Object.entries(receiptInputs).map(([itemId, val]) => ({
        itemId,
        receivedM2: Number(val.receivedM2 || 0),
        lostM2: Number(val.lostM2 || 0),
        damagedM2: Number(val.damagedM2 || 0),
        notes: val.notes
      }));

      inventoryService.receiveTransfer(receivingTransfer.id, receipts);
      toast.success('تم تأكيد استلام الشحنة وإضافتها لمخزن الوجهة.');
      setReceivingTransfer(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'فشل تأكيد الاستلام.');
    }
  };

  const handleReject = (trfId: string) => {
    const reason = prompt('أدخل سبب رفض أو إلغاء التحويل:');
    if (!reason || !reason.trim()) return;
    try {
      inventoryService.rejectTransfer(trfId, reason.trim());
      toast.success('تم رفض التحويل وإعادة البضاعة للمخزن المصدر إن كانت قد خرجت.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر الرفض.');
    }
  };

  const handleViewDetails = (trf: any) => {
    setDetailTransfer(trf);
    try {
      const items = inventoryService.getTransferItems(trf.id);
      setDetailItems(items);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر جلب تفاصيل التحويل.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <StockTransfersHeader
        loading={loading}
        onCreateTransfer={handleOpenCreate}
        onRefresh={loadData}
      />

      {/* Tabs */}
      <StockTransfersTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        workflowCount={workflowTransfers.length}
        historyCount={transfers.length}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'workflow' && (
          <WorkflowTransfersTable
            transfers={workflowTransfers}
            onViewDetails={handleViewDetails}
            onApprove={handleApprove}
            onReject={handleReject}
            onPrepare={handlePrepare}
            onDispatch={handleDispatch}
            onOpenReceive={handleOpenReceive}
          />
        )}

        {activeTab === 'history' && (
          <TransferHistoryTable transfers={transfers} />
        )}

        {activeTab === 'summary' && (
          <WarehouseSummaryGrid warehouseSummary={warehouseSummary} />
        )}
      </div>

      {/* Create Transfer Request Modal */}
      {showCreateModal && (
        <CreateTransferModal
          warehouses={warehouses}
          allProducts={allProducts}
          fromWhId={fromWhId}
          toWhId={toWhId}
          onFromWhChange={setFromWhId}
          onToWhChange={setToWhId}
          requestNotes={requestNotes}
          onRequestNotesChange={setRequestNotes}
          requestItems={requestItems}
          onRequestItemsChange={setRequestItems}
          onAddItemRow={handleAddItemRow}
          onRemoveItemRow={handleRemoveItemRow}
          onSubmit={handleCreateSubmit}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Receiving Modal */}
      {receivingTransfer && (
        <ReceiveTransferModal
          transfer={receivingTransfer}
          items={receivingItems}
          receiptInputs={receiptInputs}
          onReceiptInputsChange={setReceiptInputs}
          onSubmit={handleReceiveSubmit}
          onClose={() => setReceivingTransfer(null)}
        />
      )}

      {/* Details Modal */}
      {detailTransfer && (
        <TransferDetailsModal
          transfer={detailTransfer}
          items={detailItems}
          onClose={() => setDetailTransfer(null)}
        />
      )}
    </div>
  );
};
