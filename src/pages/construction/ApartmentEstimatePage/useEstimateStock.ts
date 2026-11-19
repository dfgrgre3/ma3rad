import { useEffect } from 'react';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import type { ApartmentEstimateState } from './useApartmentEstimateState';

export const useEstimateStock = (s: ApartmentEstimateState) => {
  const { warehouseId, setStock, setStockError } = s;

  useEffect(() => {
    if (!warehouseId) { setStock([]); setStockError(''); return; }
    try {
      setStock(new InventoryService().getWarehouseStock(warehouseId));
      setStockError('');
    } catch (error) {
      setStock([]);
      setStockError(error instanceof Error ? error.message : 'تعذر تحميل أرصدة المستودع.');
    }
  }, [warehouseId]);
};
