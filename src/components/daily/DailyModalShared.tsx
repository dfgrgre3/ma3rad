import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CustomerService } from '../../services/CustomerService';
import { ProductService } from '../../services/ProductService';
import { OperationsService } from '../../services/OperationsService';
import { CashierService } from '../../services/CashierService';
import { DatabaseManager } from '../../database/db';
import type { Customer, Product, CashRegister, ExpenseCategory, Supplier } from '../../types';
import type { WarehouseRow } from '../../services/OperationsService';

export const input = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500';
export const label = 'block text-[11px] font-semibold text-slate-600 mb-1';
export const fmt = (value: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0);

export const ModalShell: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  busy?: boolean;
}> = ({ title, subtitle, onClose, children, wide, busy = false }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      dir="rtl"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busyRef.current) closeRef.current();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-modal-title"
        tabIndex={-1}
        className={`bg-white rounded-2xl border border-slate-200 shadow-2xl w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[92vh] flex flex-col outline-none`}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <h3 id="daily-modal-title" className="text-sm font-black text-slate-900">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
};

export const useLists = () => {
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
};

export const useCashierLists = () => {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const service = new CashierService();
      setRegisters(service.getAllRegisters());
      setCategories(service.getExpenseCategories());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات الخزائن والمصروفات');
    }
  }, []);

  return { registers, categories, error };
};

export const useSuppliers = () => {
  const [suppliers, setSuppliers] = useState<Pick<Supplier, 'id' | 'name' | 'phone'>[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setSuppliers(DatabaseManager.getInstance().query<Pick<Supplier, 'id' | 'name' | 'phone'>>(
        'SELECT id, name, phone FROM suppliers WHERE is_active = 1 ORDER BY name'
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل قائمة الموردين');
    }
  }, []);

  return { suppliers, error };
};

export const LoadErrorNotice: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
    تعذر تحميل البيانات اللازمة: {message}
  </div>
);
