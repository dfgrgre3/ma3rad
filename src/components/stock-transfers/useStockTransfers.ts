import { useStockTransfersData } from './useStockTransfersData';
import { useTransferActions } from './useTransferActions';

export function useStockTransfers() {
  const data = useStockTransfersData();
  const actions = useTransferActions(data.loadData);

  return {
    ...data,
    ...actions,
    openCreateModal: () => actions.handleOpenCreate(data.allProducts[0]?.id || ''),
    addRequestRow: () => actions.handleAddItemRow(data.allProducts[0]?.id || ''),
  };
}
