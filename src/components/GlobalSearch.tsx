import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Command, Search, ArrowDown, ArrowUp, CornerDownLeft, X, Package, Users, Receipt, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DatabaseManager } from '../database/db';

type SearchResult = { label: string; meta: string; path: string; kind: 'page' | 'product' | 'customer' | 'invoice' };

const PAGES: SearchResult[] = [
  { label: 'لوحة المعلومات', meta: 'الرئيسية', path: '/dashboard', kind: 'page' },
  { label: 'نقطة البيع السريع', meta: 'المبيعات', path: '/pos', kind: 'page' },
  { label: 'فواتير المبيعات', meta: 'المبيعات', path: '/sales', kind: 'page' },
  { label: 'دليل الأصناف', meta: 'المنتجات', path: '/products', kind: 'page' },
  { label: 'المخزون', meta: 'المخازن', path: '/inventory', kind: 'page' },
  { label: 'العملاء', meta: 'CRM', path: '/customers', kind: 'page' },
  { label: 'الموردون', meta: 'المشتريات', path: '/suppliers', kind: 'page' },
  { label: 'التقارير', meta: 'التحليلات', path: '/reports', kind: 'page' },
  { label: 'الإشعارات', meta: 'النظام', path: '/notifications', kind: 'page' },
];

const ICONS = { page: LayoutDashboard, product: Package, customer: Users, invoice: Receipt };

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const pageResults = q ? PAGES.filter((item) => `${item.label} ${item.meta}`.toLowerCase().includes(q)) : PAGES;
    if (!q) return pageResults;
    try {
      const db = DatabaseManager.getInstance();
      const products = db.query<any>('SELECT id, name, sku, barcode FROM products WHERE name LIKE ? OR sku LIKE ? OR barcode LIKE ? LIMIT 5', [`%${deferredQuery}%`, `%${deferredQuery}%`, `%${deferredQuery}%`]);
      const customers = db.query<any>('SELECT id, name, phone, code FROM customers WHERE name LIKE ? OR phone LIKE ? OR code LIKE ? LIMIT 5', [`%${deferredQuery}%`, `%${deferredQuery}%`, `%${deferredQuery}%`]);
      const invoices = db.query<any>('SELECT id, invoice_number, total_amount FROM sales_invoices WHERE invoice_number LIKE ? LIMIT 5', [`%${deferredQuery}%`]);
      return [
        ...pageResults,
        ...products.map((p) => ({ label: p.name, meta: `صنف · ${p.sku || p.barcode || ''}`, path: `/products/${p.id}`, kind: 'product' as const })),
        ...customers.map((c) => ({ label: c.name, meta: `عميل · ${c.phone || c.code || ''}`, path: `/customers/${c.id}`, kind: 'customer' as const })),
        ...invoices.map((i) => ({ label: i.invoiceNumber, meta: `فاتورة مبيعات · ${i.totalAmount ?? ''}`, path: '/sales', kind: 'invoice' as const })),
      ];
    } catch {
      return pageResults;
    }
  }, [deferredQuery]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0))); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
      if (event.key === 'Enter' && results[active]) { navigate(results[active].path); onClose(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, navigate, onClose, open, results]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-700">
          <Search className="h-5 w-5 text-sky-500" />
          <input ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} placeholder="ابحث في الصفحات والأصناف والعملاء والفواتير..." className="h-14 flex-1 bg-transparent text-sm outline-none dark:text-white" />
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="إغلاق"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? <div className="px-4 py-12 text-center text-sm text-slate-400">لا توجد نتائج مطابقة</div> : results.map((item, index) => {
            const Icon = ICONS[item.kind];
            return <button key={`${item.kind}-${item.path}-${index}`} onMouseEnter={() => setActive(index)} onClick={() => { navigate(item.path); onClose(); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right transition ${index === active ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}><span className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{item.label}</span><span className="block truncate text-xs text-slate-400">{item.meta}</span></span>{index === active && <CornerDownLeft className="h-4 w-4 text-sky-500" />}</button>;
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-700"><span><ArrowDown className="ml-1 inline h-3 w-3" /> للتنقل</span><span><ArrowUp className="ml-1 inline h-3 w-3" /> للتنقل</span><span><CornerDownLeft className="ml-1 inline h-3 w-3" /> للفتح</span><span><Command className="ml-1 inline h-3 w-3" /> K للبحث</span></div>
      </div>
    </div>
  );
}

export default GlobalSearch;
