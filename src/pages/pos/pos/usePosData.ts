import { useState, useCallback, useMemo, useEffect } from 'react';
import { ProductService } from '../../../services/ProductService';
import { InventoryService } from '../../../services/InventoryService';
import { CustomerService } from '../../../services/CustomerService';
import { CategoryService } from '../../../services/CategoryService';
import { CashierService } from '../../../services/CashierService';
import { PrintService } from '../../../services/PrintService';
import type { Product, Customer, Warehouse, CashRegister, CashShift, SystemSettings } from '../../../types';
import { HELD_STORAGE_KEY, type HeldOrder } from '../../../components/pos/types';

export function usePosData() {
  const productService = useMemo(() => new ProductService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const customerService = useMemo(() => new CustomerService(), []);
  const categoryService = useMemo(() => new CategoryService(), []);
  const cashierService = useMemo(() => new CashierService(), []);
  const printService = useMemo(() => new PrintService(), []);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const loadStock = useCallback((warehouseId: string) => {
    if (!warehouseId) return;
    try {
      const rows = inventoryService.getWarehouseStock(warehouseId);
      const map: Record<string, number> = {};
      for (const r of rows) {
        map[(r as any).productId] = r.availableM2 ?? r.quantityM2 ?? 0;
      }
      setStockMap(map);
    } catch (e) { console.error(e); }
  }, [inventoryService]);

  const loadInitialData = useCallback((notify: (msg: string, type: string) => void) => {
    try {
      const allProds = productService.getAllProducts();
      const allCusts = customerService.getAllCustomers();
      const allWhs = inventoryService.getAllWarehouses();
      const allCats = categoryService.getAllCategories();
      const allRegs = cashierService.getAllRegisters();
      const sysSettings = printService.getSettings();
      const shift = cashierService.getActiveShift();
      setProducts(allProds); setCustomers(allCusts); setWarehouses(allWhs);
      setCategories(allCats); setRegisters(allRegs);
      setActiveShift(shift); setSettings(sysSettings);
      const defaultWhId = allWhs[0]?.id || '';
      if (defaultWhId) loadStock(defaultWhId);
      return {
        defaultWarehouseId: defaultWhId,
        walkInCustomer: allCusts.find((c) => c.id === 'cust_cash') || allCusts[0] || null,
        defaultRegister: allRegs.find((r) => r.isDefault) || allRegs[0],
        defaultTax: sysSettings.defaultTaxPercentage || 0,
      };
    } catch (e) {
      console.error(e);
      notify('تعذر تحميل بيانات نقطة البيع', 'error');
      return null;
    }
  }, [productService, customerService, inventoryService, categoryService, cashierService, printService, loadStock]);

  const reloadProductsAndStock = useCallback((warehouseId: string) => {
    setProducts(productService.getAllProducts());
    if (warehouseId) loadStock(warehouseId);
  }, [productService, loadStock]);

  const stockOf = useCallback((productId: string) => stockMap[productId] ?? 0, [stockMap]);

  return {
    products, setProducts, categories, customers, setCustomers, warehouses, registers,
    activeShift, setActiveShift, settings, stockOf,
    productService, customerService, categoryService, cashierService, printService,
    loadStock, loadInitialData, reloadProductsAndStock,
  };
}

export function useHeldOrders() {
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HELD_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        setHeldOrders(Array.isArray(parsed) ? (parsed as HeldOrder[]) : []);
      }
    } catch { setHeldOrders([]); }
  }, []);

  const persistHeld = useCallback((updater: HeldOrder[] | ((curr: HeldOrder[]) => HeldOrder[])) => {
    setHeldOrders((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem(HELD_STORAGE_KEY, JSON.stringify(next)); } catch { /* full */ }
      return next;
    });
  }, []);

  return { heldOrders, persistHeld };
}
