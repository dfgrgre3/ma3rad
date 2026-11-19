import { useEffect } from 'react';
import { CustomerService } from '../../../services/domains/customers/CustomerService';
import { ProductService } from '../../../services/domains/products/ProductService';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { ProjectService } from '../../../services/domains/projects/ProjectService';
import type { ApartmentEstimateState } from './useApartmentEstimateState';

export const useEstimateInitialLoad = (s: ApartmentEstimateState) => {
  const {
    canViewProjects, setCustomers, setDataError, setProjects, setProducts,
    setProductError, setWarehouses, setWarehouseId, setStockError,
  } = s;

  useEffect(() => {
    try { setCustomers(new CustomerService().getAllCustomers()); }
    catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تحميل العملاء.'); }
    if (canViewProjects) {
      try { setProjects(new ProjectService().getProjects()); }
      catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تحميل المشروعات.'); }
    }
    try { setProducts(new ProductService().getAllProducts()); }
    catch (error) { setProductError(error instanceof Error ? error.message : 'تعذر تحميل أصناف المخزون.'); }
    try {
      const availableWarehouses = new InventoryService().getAllWarehouses();
      setWarehouses(availableWarehouses);
      const defaultWarehouse = availableWarehouses[0];
      if (defaultWarehouse) setWarehouseId(defaultWarehouse.id);
    } catch (error) {
      setStockError(error instanceof Error ? error.message : 'تعذر تحميل المستودعات.');
    }
  }, [canViewProjects]);
};
