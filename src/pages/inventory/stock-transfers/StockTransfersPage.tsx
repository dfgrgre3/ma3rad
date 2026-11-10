import React from 'react';
import { StockTransfersHeader } from './components/StockTransfersHeader';
import { StockTransfersTabs } from './components/StockTransfersTabs';
import { WorkflowTransfersTable } from './components/WorkflowTransfersTable';
import { TransferHistoryTable } from './components/TransferHistoryTable';
import { WarehouseSummaryGrid } from './components/WarehouseSummaryGrid';
import { CreateTransferModal } from './components/CreateTransferModal';
import { ReceiveTransferModal } from './components/ReceiveTransferModal';
import { TransferDetailsModal } from './components/TransferDetailsModal';
import { useStockTransfers } from '../../../hooks/pages/inventory/stock-transfers/useStockTransfers';

export const StockTransfersPage: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    transfers,
    workflowTransfers,
    warehouses,
    allProducts,
    warehouseSummary,
    statusFilter,
    setStatusFilter,
    loading,
    loadData,
    showCreateModal,
    setShowCreateModal,
    fromWhId,
    setFromWhId,
    toWhId,
    setToWhId,
    requestNotes,
    setRequestNotes,
    requestItems,
    setRequestItems,
    receivingTransfer,
    setReceivingTransfer,
    receivingItems,
    receiptInputs,
    setReceiptInputs,
    detailTransfer,
    setDetailTransfer,
    detailItems,
    openCreateModal,
    addRequestRow,
    handleRemoveItemRow,
    handleCreateSubmit,
    handleApprove,
    handlePrepare,
    handleDispatch,
    handleOpenReceive,
    handleReceiveSubmit,
    handleReject,
    handleViewDetails,
  } = useStockTransfers();

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <StockTransfersHeader loading={loading} onCreateTransfer={openCreateModal} onRefresh={loadData} />

      <StockTransfersTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        workflowCount={workflowTransfers.length}
        historyCount={transfers.length}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

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

        {activeTab === 'history' && <TransferHistoryTable transfers={transfers} />}

        {activeTab === 'summary' && <WarehouseSummaryGrid warehouseSummary={warehouseSummary} />}
      </div>

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
          onAddItemRow={addRequestRow}
          onRemoveItemRow={handleRemoveItemRow}
          onSubmit={handleCreateSubmit}
          onClose={() => setShowCreateModal(false)}
        />
      )}

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

      {detailTransfer && (
        <TransferDetailsModal transfer={detailTransfer} items={detailItems} onClose={() => setDetailTransfer(null)} />
      )}
    </div>
  );
};

export default StockTransfersPage;
