import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ClipboardCheck, Plus, Search, X, Loader2, Trash2, Eye, RefreshCw, Truck, Send, Ban, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useActivityPageCopy } from '../../../hooks/domains/config/useBusinessTerm';
import { PurchaseOrderService, PurchaseOrderRow, PurchaseOrderStatus } from '../../../services/domains/purchases/PurchaseOrderService';
import { SupplierService } from '../../../services/domains/suppliers/SupplierService';
import { OperationsService } from '../../../services/domains/operations/OperationsService';
import { ProductService } from '../../../services/domains/products/ProductService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import type { Product, Supplier } from '../../../types';
import { DataTable } from '../../../components/ui/DataTable';
import { useToast } from '../../../components/ui/Toast';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/products/productUnits';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsForm } from '../../../components/products/OperationalFieldsForm';
import { OperationalFieldsSummary } from '../../../components/products/OperationalFieldsSummary';
import { OperationalFieldsRecordEditor } from '../../../components/products/OperationalFieldsRecordEditor';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../../../components/products/OperationalFieldsFilter';
import { ProductPicker } from '../../../components/products/ProductPicker';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';

const STATUS: Record<PurchaseOrderStatus, { label: string; color: string }> = {
  DRAFT: { label: 'مسودة', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  SENT: { label: 'مرسل للمورد', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  CONFIRMED: { label: 'مؤكد', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  PARTIAL: { label: 'استلام جزئي', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  RECEIVED: { label: 'مستلم', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'ملغي', color: 'bg-rose-50 text-rose-600 border-rose-200' },
};

type Line = { productId: string; quantityM2: number; unitCost: number; boxesCount: number };

export const PurchaseOrdersPage: React.FC = () => {
  const pageCopy = useActivityPageCopy('purchaseOrders');
  const service = useMemo(() => new PurchaseOrderService(), []);
  const fieldService = useMemo(() => new OperationalFieldService(), []);
  const toast = useToast();
  const currentUser = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(currentUser, 'ui.purchases.orders.create');
  const canUpdate = PermissionService.can(currentUser, 'ui.purchases.orders.update');

  const [rows, setRows] = useState<PurchaseOrderRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PurchaseOrderStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantityM2: 0, unitCost: 0, boxesCount: 0 }]);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<OperationalFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [valuesByOrder, setValuesByOrder] = useState<Record<string, Record<string, string>>>({});
  const [fieldFilters, setFieldFilters] = useState<OperationalFieldFilters>({});

  const load = useCallback(() => {
    setLoading(true);
    (async () => {
      try {
        const currentRows = await service.getAllOrdersAsync(search, statusFilter);
        setFields(fieldService.getDefinitions('purchase_orders'));
        const fieldValues = fieldService.getRecordValuesForRecords('purchase_orders', currentRows.map((row) => row.id));
        setValuesByOrder(fieldValues);
        setRows(currentRows.filter((row) => matchesOperationalFieldFilters(row.id, fieldValues, fieldFilters)));
      }
      catch (e: any) { toast.error(e?.message || 'تعذر تحميل أوامر الشراء.'); }
      finally { setLoading(false); }
    })();
  }, [service, fieldService, search, statusFilter, setLoading, setFields, setValuesByOrder, setRows, fieldFilters, toast]);

  useEffect(() => { load();   }, [statusFilter, fieldFilters, load]);

  const openDetails = (row: PurchaseOrderRow) => {
    if (expanded === row.id) { setExpanded(null); setDetails(null); return; }
    service.getOrderByIdAsync(row.id).then((det) => { setDetails(det); setExpanded(row.id); })
      .catch((e: any) => toast.error(e?.message));
  };

  const openModal = () => {
    try {
      setSuppliers(new SupplierService().getAllSuppliers());
      setWarehouses(new OperationsService().getWarehouses().map((w) => ({ id: w.id, name: w.name })));
      setProducts(new ProductService().getAllProducts());
      setSupplierId(''); setWarehouseId(''); setExpectedDate(''); setNotes('');
      setLines([{ productId: '', quantityM2: 0, unitCost: 0, boxesCount: 0 }]);
      setValues({});
      setModalOpen(true);
    } catch (e: any) { toast.error(e?.message); }
  };

  const setLine = (idx: number, patch: Partial<Line>) => setLines((prev) => prev.map((line, i) => i === idx ? { ...line, ...patch } : line));

  const pickProduct = (idx: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    setLine(idx, { productId, unitCost: product?.costPrice || 0 });
  };

  const subtotal = lines.reduce((sum, line) => sum + (Number(line.quantityM2) || 0) * (Number(line.unitCost) || 0), 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) return toast.error('اختر المورد.');
    if (!warehouseId) return toast.error('اختر المخزن.');
    const items = lines.filter((line) => line.productId && Number(line.quantityM2) > 0);
    if (items.length === 0) return toast.error('أضف صنفًا واحدًا على الأقل.');
    setSaving(true);
    try {
      fieldService.validateRecordValues('purchase_orders', values, 'create');
      const created = service.createOrder({
        supplierId, warehouseId, expectedDate: expectedDate || undefined, notes: notes || undefined,
        items: items.map((line) => ({
          productId: line.productId,
          quantityM2: Number(line.quantityM2),
          boxesCount: line.boxesCount || undefined,
          unitCost: Number(line.unitCost),
        })),
      });
      fieldService.setRecordValues('purchase_orders', created.id, values, 'create');
      setValues({});
      toast.success('تم إنشاء أمر الشراء كمسودة.');
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إنشاء أمر الشراء.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = (row: PurchaseOrderRow, status: PurchaseOrderStatus) => {
    try { service.updateStatus(row.id, status); load(); toast.success('تم تحديث حالة أمر الشراء.'); }
    catch (e: any) { toast.error(e?.message); }
  };

  const receive = (row: PurchaseOrderRow) => {
    if (!confirm(`سيتم استلام أمر الشراء ${row.orderNumber} وترحيل فاتورة توريد بقيمة ${fmt(row.totalAmount)} على حساب المورد. متابعة؟`)) return;
    try {
      const invoice = service.receiveOrder(row.id);
      toast.success(`تم الاستلام وترحيل الفاتورة ${invoice.invoiceNumber}.`);
      load();
    } catch (e: any) { toast.error(e?.message); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      <div className="bg-white px-6 pt-4">
        <PageHeader
          icon={<ClipboardCheck className="w-5 h-5" />}
          title={pageCopy?.title || 'أوامر الشراء'}
          description={pageCopy?.description || 'من أمر الشراء إلى فاتورة التوريد واستلام المخزون'}
          actions={<>
            <button onClick={load} className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100" title="تحديث">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canCreate && (
              <button onClick={openModal} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold">
                <Plus className="w-4 h-4" /> أمر شراء جديد
              </button>
            )}
          </>}
        />
      </div>

      <div className="p-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم الأمر أو المورد..." className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400" />
        </form>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
          <option value="ALL">كل الحالات</option>
          {Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
        <OperationalFieldsFilter fields={fields} values={fieldFilters} onChange={setFieldFilters} />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <>
                        <DataTable
                          ariaLabel="أوامر الشراء"
                          rows={rows}
                          rowKey={(row) => row.id}
                          columns={[
                            { key: 'num', header: 'رقم الأمر', render: (row) => <span className="font-mono font-bold text-orange-600">{row.orderNumber}</span> },
                            { key: 'date', header: 'التاريخ', render: (row) => <span className="text-slate-500">{row.date}</span> },
                            { key: 'supplier', header: 'المورد', render: (row) => <span className="font-semibold">{row.supplierName || '—'}</span> },
                            { key: 'warehouse', header: 'المخزن', render: (row) => <span className="text-slate-600">{row.warehouseName || '—'}</span> },
                            { key: 'expected', header: 'التوريد المتوقع', render: (row) => <span className="text-slate-500">{row.expectedDate || '—'}</span> },
                            { key: 'items', header: 'الأصناف', render: (row) => row.itemsCount || 0 },
                            { key: 'total', header: 'الإجمالي', render: (row) => <span className="font-mono font-bold">{fmt(row.totalAmount)}</span> },
                            { key: 'status', header: 'الحالة', render: (row) => <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${STATUS[row.status].color}`}>{STATUS[row.status].label}</span> },
                            {
                              key: 'actions', header: 'إجراءات',
                              render: (row) => (
                                <div className="flex flex-wrap items-center gap-1">
                                  <button onClick={() => openDetails(row)} className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600" title="تفاصيل"><Eye className="w-3.5 h-3.5" /></button>
                                  {canUpdate && row.status === 'DRAFT' && <button onClick={() => changeStatus(row, 'SENT')} className="p-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-600" title="إرسال للمورد"><Send className="w-3.5 h-3.5" /></button>}
                                  {canUpdate && row.status === 'SENT' && <button onClick={() => changeStatus(row, 'CONFIRMED')} className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600" title="تأكيد"><CheckCircle2 className="w-3.5 h-3.5" /></button>}
                                  {canCreate && !['RECEIVED', 'CANCELLED'].includes(row.status) && <button onClick={() => receive(row)} className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600" title="استلام وترحيل فاتورة"><Truck className="w-3.5 h-3.5" /></button>}
                                  {canUpdate && !['RECEIVED', 'CANCELLED'].includes(row.status) && <button onClick={() => { if (confirm('إلغاء أمر الشراء؟')) changeStatus(row, 'CANCELLED'); }} className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600" title="إلغاء"><Ban className="w-3.5 h-3.5" /></button>}
                                </div>
                              ),
                            },
                          ]}
                          emptyTitle="لا توجد أوامر شراء"
                        />
                        {expanded && details && (() => {
                          const row = rows.find((r) => r.id === expanded);
                          if (!row) return null;
                          return (
                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                              <DataTable
                                ariaLabel="بنود أمر الشراء"
                                rows={details.items}
                                rowKey={(item: any) => item.id}
                                dense
                                columns={[
                                  { key: 'product', header: 'الصنف', render: (item: any) => <span className="font-semibold">{item.productName}</span> },
                                  { key: 'qty', header: 'الكمية بوحدة الصنف', render: (item: any) => <span className="font-mono">{formatProductQuantity(item.quantityM2, item)}</span> },
                                  { key: 'boxes', header: 'الكراتين', render: (item: any) => <span className="font-mono">{item.productType === 'GENERAL' ? '—' : item.boxesCount}</span> },
                                  { key: 'received', header: 'المستلم', render: (item: any) => <span className="font-mono">{formatProductQuantity(item.receivedM2, item)}</span> },
                                  { key: 'cost', header: 'تكلفة الوحدة', render: (item: any) => <span className="font-mono">{fmt(item.unitCost)}</span> },
                                  { key: 'total', header: 'الإجمالي', render: (item: any) => <span className="font-mono font-bold">{fmt(item.totalCost)}</span> },
                                ]}
                              />
                              {details.notes && <div className="mt-2 text-[11px] text-slate-500">ملاحظات: {details.notes}</div>}
                              <OperationalFieldsSummary fields={fields} values={valuesByOrder[row.id] || {}} />
                              <OperationalFieldsRecordEditor recordLabel={row.orderNumber} fields={fields} initialValues={valuesByOrder[row.id] || {}} canEdit={canUpdate} onSave={(next) => {
                                fieldService.setRecordValues('purchase_orders', row.id, next, 'update');
                                setValuesByOrder((previous) => ({ ...previous, [row.id]: next }));
                              }} />
                            </div>
                          );
                        })()}
                      </>

          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold">أمر شراء جديد</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المورد *</label>
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="">— اختر المورد —</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المخزن *</label>
                  <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                    <option value="">— اختر المخزن —</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">تاريخ التوريد المتوقع</label>
                  <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <DataTable
                                  ariaLabel="أصناف أمر الشراء"
                                  rows={lines.map((line, i) => ({ ...line, _i: i }))}
                                  rowKey={(line) => String(line._i)}
                                  dense
                                  columns={[
                                    {
                                      key: 'product', header: 'الصنف',
                                      render: (line) => (
                                        <ProductPicker
                                          value={line.productId}
                                          selectedLabel={products.find((product) => product.id === line.productId)?.name}
                                          ariaLabel={`استعراض أصناف أمر الشراء للسطر ${line._i + 1}`}
                                          onChange={(productId) => pickProduct(line._i, productId)}
                                        />
                                      ),
                                    },
                                    { key: 'qty', header: 'الكمية / الوحدة', render: (line) => <input type="number" min={0} step="0.01" value={line.quantityM2 || ''} onChange={(e) => setLine(line._i, { quantityM2: Number(e.target.value) || 0 })} placeholder={products.find((product) => product.id === line.productId) ? getProductUnitLabel(products.find((product) => product.id === line.productId)!) : 'الوحدة'} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" /> },
                                    { key: 'cost', header: 'تكلفة الوحدة', render: (line) => <input type="number" min={0} step="0.01" value={line.unitCost || ''} onChange={(e) => setLine(line._i, { unitCost: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" /> },
                                    { key: 'boxes', header: 'الكراتين', render: (line) => <input type="number" min={0} step="0.01" disabled={products.find((product) => product.id === line.productId)?.productType === 'GENERAL'} value={line.boxesCount || ''} onChange={(e) => setLine(line._i, { boxesCount: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono disabled:bg-slate-100" /> },
                                    { key: 'total', header: 'الإجمالي', render: (line) => <span className="font-bold">{fmt((Number(line.quantityM2) || 0) * (Number(line.unitCost) || 0))}</span> },
                                    { key: 'actions', header: '', render: (line) => <button type="button" onClick={() => setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== line._i) : prev)} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button> },
                                  ]}
                                />

                <div className="p-2 border-t border-slate-100">
                  <button type="button" onClick={() => setLines((prev) => [...prev, { productId: '', quantityM2: 0, unitCost: 0, boxesCount: 0 }])} className="text-[11px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة صنف</button>
                </div>
              </div>

              <div><label className="font-bold text-slate-700 block mb-1">ملاحظات</label><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" /></div>
              <OperationalFieldsForm fields={fields} values={values} onChange={setValues} title="بيانات إضافية لأمر الشراء" />

              <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-orange-700">إجمالي أمر الشراء</span>
                <span className="text-lg font-black text-orange-700">{fmt(subtotal)}</span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ الأمر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
