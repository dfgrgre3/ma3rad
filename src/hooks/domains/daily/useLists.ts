import { useEffect, useState } from 'react';
import { CustomerService } from '../../../services/domains/customers/CustomerService';
import { OperationsService } from '../../../services/domains/operations/OperationsService';
import { ProductService } from '../../../services/domains/products/ProductService';
import type { Customer, Product } from '../../../types';
import type { WarehouseRow } from '../../../services/domains/operations/OperationsService';

export function useLists() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setCustomers(new CustomerService().getAllCustomers());
      setProducts(new ProductService().getAllProducts());
      setWarehouses(new OperationsService().getWarehouses());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات القوائم');
    }
  }, []);

  return { customers, products, warehouses, error };
}
