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
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import type { StockTransferTab } from '../../../types/inventory/stockTransfers';

export const StockTransfersPage: React.FC = () => {
  const actor = AuthService.getCurrentUser();
  const canCreateTransfer = PermissionService.can(actor, 'inventory.transfer');
  const canApprove = PermissionService.can(actor, 'inventory.transfer.workflow.approve');
  const canExecute = PermissionService.can(actor, 'inventory.transfer.execute');
  const canReceive = PermissionService.can(actor, 'inventory.transfer.receive');
  // ملخص أرصدة المخازن صلاحية عرض مخزون — منفصلة عن صلاحيات تنفيذ التحويلات.
  const canViewSummary = PermissionService.can(actor, 'inventory.view');
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

  const viewTab: StockTransferTab = activeTab === 'summary' && !canViewSummary ? 'history' : activeTab;

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      <StockTransfersHeader
        loading={loading}
        canCreateTransfer={canCreateTransfer}
        onCreateTransfer={openCreateModal}
        onRefresh={loadData}
      />

      <StockTransfersTabs
        activeTab={viewTab}
        onTabChange={setActiveTab}
        workflowCount={workflowTransfers.length}
        historyCount={transfers.length}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        canViewSummary={canViewSummary}
      />

      <div className="flex-1 overflow-auto p-6">
        {viewTab === 'workflow' && (
          <WorkflowTransfersTable
            transfers={workflowTransfers}
            canApprove={canApprove}
            canExecute={canExecute}
            canReceive={canReceive}
            onViewDetails={handleViewDetails}
            onApprove={handleApprove}
            onReject={handleReject}
            onPrepare={handlePrepare}
            onDispatch={handleDispatch}
            onOpenReceive={handleOpenReceive}
          />
        )}

        {viewTab === 'history' && <TransferHistoryTable transfers={transfers} />}

        {viewTab === 'summary' && <WarehouseSummaryGrid warehouseSummary={warehouseSummary} />}
      </div>

      {showCreateModal && canCreateTransfer && (
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
