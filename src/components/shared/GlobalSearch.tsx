import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Command, Search, ArrowDown, ArrowUp, Clock3, CornerDownLeft, Star, X, Package, Users, Receipt, LayoutDashboard, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DatabaseManager } from '../../database/repositories/databaseManager';
import { useSharedNavigationGroups } from '../../hooks/config/useNavigationGroups';
import { PermissionService } from '../../services/auth/PermissionService';
import { useBusinessTerm } from '../../hooks/config/useBusinessTerm';
import { getNavigationShortcuts, toggleNavigationFavorite, type NavigationShortcuts } from '../../router/navigationShortcuts';
import type { User } from '../../types';

type SearchResult = { label: string; meta: string; path: string; kind: 'page' | 'product' | 'customer' | 'supplier' | 'invoice' };

const ICONS = { page: LayoutDashboard, product: Package, customer: Users, supplier: Building2, invoice: Receipt };

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  currentUser: User | null;
}

export function GlobalSearch({ open, onClose, currentUser }: GlobalSearchProps) {
  const navigate = useNavigate();
  const productsLabel = useBusinessTerm('entities.products.plural');
  const customersLabel = useBusinessTerm('entities.customers.plural');
  const suppliersLabel = useBusinessTerm('entities.suppliers.plural');
  const salesInvoicesLabel = useBusinessTerm('documents.salesInvoices');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [active, setActive] = useState(0);
  const accessibleGroups = useSharedNavigationGroups();
  const accessiblePaths = useMemo(
    () => accessibleGroups.flatMap((group) => group.items.map((item) => item.to)),
    [accessibleGroups]
  );
  const [shortcuts, setShortcuts] = useState<NavigationShortcuts>({ favorites: [], recent: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShortcuts(currentUser?.id
      ? getNavigationShortcuts(currentUser.id, accessiblePaths)
      : { favorites: [], recent: [] });
  }, [accessiblePaths, currentUser?.id]);

  const { results, error } = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const pageResults: SearchResult[] = accessibleGroups.flatMap((group) =>
      group.items
        .map((item) => ({
          label: item.label,
          meta: group.label,
          path: item.to,
          kind: 'page' as const,
        }))
    );
    const matchingPages = q
      ? pageResults.filter((item) => `${item.label} ${item.meta}`.toLowerCase().includes(q))
      : pageResults;
    if (!q) return { results: matchingPages, error: false };

    try {
      const db = DatabaseManager.getInstance();
      const term = `%${deferredQuery.trim()}%`;
      const productResults = PermissionService.can(currentUser, 'ui.products.catalog.view')
        ? db.query<{ id: string; name: string; sku: string; barcode: string }>(
          'SELECT id, name, sku, barcode FROM products WHERE name LIKE ? OR sku LIKE ? OR barcode LIKE ? LIMIT 5',
          [term, term, term],
        ).map((product) => ({
          label: product.name,
          meta: `${productsLabel} · ${product.sku || product.barcode || ''}`,
          path: `/products/${product.id}`,
          kind: 'product' as const,
        }))
        : [];
      const customerResults = PermissionService.can(currentUser, 'ui.customers.list.view')
        ? db.query<{ id: string; name: string; phone: string; code: string }>(
          'SELECT id, name, phone, code FROM customers WHERE name LIKE ? OR phone LIKE ? OR code LIKE ? LIMIT 5',
          [term, term, term],
        ).map((customer) => ({
          label: customer.name,
          meta: `${customersLabel} · ${customer.phone || customer.code || ''}`,
          path: `/customers/${customer.id}`,
          kind: 'customer' as const,
        }))
        : [];
      const supplierResults = PermissionService.can(currentUser, 'ui.suppliers.suppliers.view')
        ? db.query<{ id: string; name: string; phone: string; code: string }>(
          'SELECT id, name, phone, code FROM suppliers WHERE name LIKE ? OR company_name LIKE ? OR phone LIKE ? OR code LIKE ? LIMIT 5',
          [term, term, term, term],
        ).map((supplier) => ({
          label: supplier.name,
          meta: `${suppliersLabel} · ${supplier.phone || supplier.code || ''}`,
          path: `/suppliers/${supplier.id}`,
          kind: 'supplier' as const,
        }))
        : [];
      const salesInvoiceResults = PermissionService.can(currentUser, 'ui.sales.invoices.view')
        ? db.query<{ invoice_number: string; total_amount: number; customer_name: string }>(
          `SELECT si.invoice_number, si.total_amount, c.name AS customer_name
           FROM sales_invoices si
           JOIN customers c ON c.id = si.customer_id
           WHERE si.invoice_number LIKE ? OR c.name LIKE ? LIMIT 5`,
          [term, term],
        ).map((invoice) => ({
          label: invoice.invoice_number,
          meta: `${salesInvoicesLabel} · ${invoice.customer_name} · ${invoice.total_amount}`,
          path: '/sales',
          kind: 'invoice' as const,
        }))
        : [];
      const purchaseInvoiceResults = PermissionService.can(currentUser, 'ui.purchases.invoices.view')
        ? db.query<{ invoice_number: string; supplier_invoice_number: string | null; supplier_name: string }>(
          `SELECT pi.invoice_number, pi.supplier_invoice_number, s.name AS supplier_name
           FROM purchase_invoices pi
           JOIN suppliers s ON s.id = pi.supplier_id
           WHERE pi.invoice_number LIKE ? OR pi.supplier_invoice_number LIKE ? OR s.name LIKE ? LIMIT 5`,
          [term, term, term],
        ).map((invoice) => ({
          label: invoice.invoice_number,
          meta: `فاتورة مشتريات · ${invoice.supplier_name}`,
          path: '/purchases',
          kind: 'invoice' as const,
        }))
        : [];
      return {
        results: [
          ...matchingPages,
          ...productResults,
          ...customerResults,
          ...supplierResults,
          ...salesInvoiceResults,
          ...purchaseInvoiceResults,
        ],
        error: false,
      };
    } catch (cause) {
      console.error('Global search failed:', cause);
      return { results: matchingPages, error: true };
    }
  }, [accessibleGroups, deferredQuery, currentUser, customersLabel, productsLabel, salesInvoicesLabel, suppliersLabel]);

  const pageResults = useMemo(
    () => accessibleGroups.flatMap((group) => group.items.map((item) => ({
      label: item.label,
      meta: group.label,
      path: item.to,
      kind: 'page' as const,
    }))),
    [accessibleGroups]
  );
  const shortcutMatches = (item: SearchResult) =>
    !deferredQuery.trim() || `${item.label} ${item.meta}`.toLowerCase().includes(deferredQuery.trim().toLowerCase());
  const favoriteResults = shortcuts.favorites.flatMap((path) => {
    const item = pageResults.find((page) => page.path === path);
    return item && shortcutMatches(item) ? [item] : [];
  });
  const recentResults = shortcuts.recent.flatMap((entry) => {
    const item = pageResults.find((page) => page.path === entry.path);
    return item && shortcutMatches(item) ? [item] : [];
  });

  const toggleFavorite = (path: string) => {
    if (!currentUser?.id) return;
    setShortcuts(toggleNavigationFavorite(currentUser.id, path, accessiblePaths));
  };

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
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, navigate, onClose, open, results]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-slate-950/30 p-4 pt-[12vh] backdrop-blur-sm">
      <button type="button" aria-label="إغلاق البحث" className="absolute inset-0 h-full w-full border-0 bg-transparent p-0" onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="بحث شامل" className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 ">
          <Search className="h-5 w-5 text-sky-500" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label="بحث الصفحات والسجلات"
            aria-autocomplete="list"
            aria-expanded={results.length > 0 || favoriteResults.length > 0 || recentResults.length > 0}
            aria-controls="global-search-results"
            aria-activedescendant={results[active] ? `global-search-result-${active}` : undefined}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            placeholder={`ابحث في الصفحات و${productsLabel} و${customersLabel} و${suppliersLabel} والفواتير...`}
            className="h-14 flex-1 select-text bg-transparent text-sm outline-none text-slate-900 dark:text-slate-100"
          />
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="إغلاق"><X className="h-4 w-4" /></button>
        </div>
        <div id="global-search-results" role="listbox" aria-label="نتائج البحث" className="max-h-[52vh] overflow-y-auto p-2">
          {error && <div role="alert" className="px-4 py-3 text-center text-sm text-rose-600">تعذر البحث في بيانات النظام. يمكنك متابعة التنقل بين الصفحات.</div>}
          {favoriteResults.length > 0 && (
            <section role="group" aria-label="الصفحات المفضلة" className="mb-2 border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="flex items-center gap-2 px-3 py-2 text-[11px] font-extrabold text-amber-700 dark:text-amber-400"><Star className="h-3.5 w-3.5" /> المفضلة</h3>
              {favoriteResults.map((item) => (
                <div key={`favorite-${item.path}`} className="flex items-center gap-2 rounded-lg px-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <button type="button" role="option" aria-selected="false" onClick={() => { navigate(item.path); onClose(); }} className="min-w-0 flex-1 py-2 text-right">
                    <span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-200">{item.label}</span>
                    <span className="block truncate text-xs text-slate-500">{item.meta}</span>
                  </button>
                  <button type="button" aria-label={`إزالة ${item.label} من المفضلة`} aria-pressed="true" onClick={() => toggleFavorite(item.path)} className="rounded-lg p-2 text-amber-600 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 dark:hover:bg-amber-950">
                    <Star className="h-4 w-4 fill-current" />
                  </button>
                </div>
              ))}
            </section>
          )}
          {recentResults.length > 0 && (
            <section role="group" aria-label="الصفحات التي زرتها مؤخراً" className="mb-2 border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="flex items-center gap-2 px-3 py-2 text-[11px] font-extrabold text-slate-500"><Clock3 className="h-3.5 w-3.5" /> زُرت مؤخراً</h3>
              {recentResults.map((item) => (
                <button key={`recent-${item.path}`} type="button" role="option" aria-selected="false" onClick={() => { navigate(item.path); onClose(); }} className="block w-full rounded-lg px-3 py-2 text-right hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-slate-800">
                  <span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-200">{item.label}</span>
                  <span className="block truncate text-xs text-slate-500">{item.meta}</span>
                </button>
              ))}
            </section>
          )}
          {results.length === 0 ? <div className="px-4 py-12 text-center text-sm text-slate-500">لا توجد نتائج مطابقة</div> : results.map((item, index) => {
            const Icon = ICONS[item.kind];
            return (
              <div key={`${item.kind}-${item.path}-${index}`} onMouseEnter={() => setActive(index)} className={`flex items-center rounded-xl transition ${index === active ? 'bg-sky-50 text-sky-700 dark:bg-sky-950' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                <button
                  id={`global-search-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onClick={() => { navigate(item.path); onClose(); }}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-right"
                >
                  <span className="rounded-lg bg-slate-100 p-2"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{item.label}</span><span className="block truncate text-xs text-slate-500">{item.meta}</span></span>
                  {index === active && <CornerDownLeft className="h-4 w-4 text-sky-500" aria-hidden="true" />}
                </button>
                {item.kind === 'page' && (
                  <button
                    type="button"
                    aria-label={`${shortcuts.favorites.includes(item.path) ? 'إزالة' : 'إضافة'} ${item.label} ${shortcuts.favorites.includes(item.path) ? 'من' : 'إلى'} المفضلة`}
                    aria-pressed={shortcuts.favorites.includes(item.path)}
                    onClick={() => toggleFavorite(item.path)}
                    className="rounded-lg p-2 text-slate-400 hover:text-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
                  >
                    <Star className={`h-4 w-4 ${shortcuts.favorites.includes(item.path) ? 'fill-amber-400 text-amber-500' : ''}`} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 "><span><ArrowDown className="ml-1 inline h-3 w-3" /> للتنقل</span><span><ArrowUp className="ml-1 inline h-3 w-3" /> للتنقل</span><span><CornerDownLeft className="ml-1 inline h-3 w-3" /> للفتح</span><span><Command className="ml-1 inline h-3 w-3" /> K للبحث</span></div>
      </div>
    </div>
  );
}

export default GlobalSearch;
