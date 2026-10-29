import { useState, useEffect, useCallback } from 'react';
import { InventoryService } from '../../services/InventoryService';
import { ProductService } from '../../services/ProductService';
import { Warehouse } from '../../types';
import { useToast } from '../ui/Toast';
import { buildTransferSummaryFields, groupSummaryByWarehouse } from './helpers';
import type { StockTransferTab } from './types';

const inventoryService = new InventoryService();
const productService = new ProductService();

export function useStockTransfersData() {
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

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const whs = inventoryService.getAllWarehouses();
      setWarehouses(whs);
      setAllProducts(productService.getAllProducts());

      const wfList = inventoryService.getTransfersWithDetails(
        statusFilter === 'ALL' ? undefined : statusFilter,
        selectedWarehouse || undefined
      );
      setWorkflowTransfers(
        wfList.map((t) => ({ ...t, ...buildTransferSummaryFields(inventoryService.getTransferItems(t.id)) }))
      );

      setTransfers(
        inventoryService.getTransfersList(dateFrom || undefined, dateTo || undefined, selectedWarehouse || undefined)
      );
      setWarehouseSummary(groupSummaryByWarehouse(inventoryService.getTransferSummaryByWarehouse()));
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل بيانات التحويلات.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedWarehouse, dateFrom, dateTo, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    activeTab,
    setActiveTab,
    transfers,
    workflowTransfers,
    warehouses,
    allProducts,
    warehouseSummary,
    selectedWarehouse,
    setSelectedWarehouse,
    statusFilter,
    setStatusFilter,
    loading,
    loadData,
  };
}
