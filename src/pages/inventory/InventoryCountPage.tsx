import React, { useState, useEffect } from 'react';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { branchAccess } from './inventory-count/branchAccess';
import { loadBranchCountSessions, loadCountProducts, loadCountSessionItems, loadCountWarehouses } from './inventory-count/countSessionData';
import { postCountSession, saveCountDraft, startCountSession } from './inventory-count/countSessionService';
import { countCountedItems, countVarianceItems, filterCountSessions, getVisibleCountItems } from './inventory-count/helpers';
import { InventoryCountHeader } from './inventory-count/InventoryCountHeader';
import { CountSessionsToolbar } from './inventory-count/CountSessionsToolbar';
import { CountSessionsTable } from './inventory-count/CountSessionsTable';
import { StartCountSessionModal } from './inventory-count/StartCountSessionModal';
import { SessionCountModal } from './inventory-count/SessionCountModal';
import type { CountItem, CountProductOption, CountSession, CountType, WarehouseOption } from './inventory-count/types';

export { loadBranchCountSessions } from './inventory-count/countSessionData';

export const InventoryCountPage: React.FC = () => {
  const [sessions, setSessions] = useState<CountSession[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [activeSession, setActiveSession] = useState<CountSession | null>(null);
  const [sessionItems, setSessionItems] = useState<CountItem[]>([]);

  // Form states
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [countType, setCountType] = useState<CountType>('FULL');
  const [isBlindCount, setIsBlindCount] = useState(false);
  const [products, setProducts] = useState<CountProductOption[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    loadSessions();
    loadWarehouses();
  }, []);

  const loadSessions = () => {
    setLoading(true);
    try {
      setSessions(loadBranchCountSessions());
    } catch (e) {
      console.error('Error loading sessions:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadWarehouses = () => {
    try {
      const rows = loadCountWarehouses();
      setWarehouses(rows);
      if (rows.length > 0) setSelectedWarehouseId(rows[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  const loadProducts = (warehouseId = selectedWarehouseId) => {
    if (!warehouseId) return;
    try {
      setProducts(loadCountProducts(warehouseId));
    } catch (e) {
      console.error('Error loading products for count:', e);
    }
  };

  const handleStartSession = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      PermissionService.require(AuthService.requireAuth(), 'inventory.count');
    } catch (error: any) {
      setErrorMsg(error?.message || 'ليس لديك صلاحية بدء جلسة جرد.');
      return;
    }

    if (!selectedWarehouseId) {
      setErrorMsg('الرجاء اختيار مستودع الجرد.');
      return;
    }

    try {
      branchAccess.requireWarehouseAccess(selectedWarehouseId);
    } catch (error: any) {
      setErrorMsg(error?.message || 'ليس لديك صلاحية الوصول إلى المخزن المحدد.');
      return;
    }

    if (countType !== 'FULL' && selectedProductIds.length === 0) {
      setErrorMsg('اختر صنفًا واحدًا على الأقل للجرد الجزئي أو المفاجئ.');
      return;
    }

    try {
      startCountSession({
        warehouseId: selectedWarehouseId,
        countType,
        selectedProductIds,
        isBlindCount,
        notes,
      });

      setShowCreateModal(false);
      setNotes('');
      loadSessions();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('حدث خطأ أثناء بدء جلسة الجرد: ' + err.message);
    }
  };

  const handleOpenSession = (session: CountSession) => {
    try {
      const items = loadCountSessionItems(session);
      setActiveSession(session);
      setSessionItems(items);
      setItemSearch('');
      setShowSessionModal(true);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'تعذر فتح جلسة الجرد.');
    }
  };

  const handleItemCountChange = (index: number, valStr: string) => {
    const next = [...sessionItems];
    const val = valStr === '' ? null : parseFloat(valStr);
    next[index].countedQuantityM2 = val;

    if (val !== null) {
      const variance = Number((val - next[index].systemQuantityM2).toFixed(3));
      next[index].varianceM2 = variance;
      next[index].varianceValue = Number((variance * next[index].unitCost).toFixed(2));
    } else {
      next[index].varianceM2 = 0;
      next[index].varianceValue = 0;
    }

    setSessionItems(next);
  };

  const handleItemNoteChange = (index: number, value: string) => {
    const next = [...sessionItems];
    next[index] = { ...next[index], notes: value };
    setSessionItems(next);
  };

  const handleItemDiscrepancyReasonChange = (index: number, value: string) => {
    const next = [...sessionItems];
    next[index] = { ...next[index], discrepancyReason: value };
    setSessionItems(next);
  };

  const handleSaveDraft = () => {
    if (!activeSession) return;
    try {
      saveCountDraft(activeSession, sessionItems);
      alert('تم حفظ المسودة بنجاح.');
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? `فشل حفظ المسودة: ${e.message}` : 'فشل حفظ المسودة.');
    }
  };

  const handlePostSession = () => {
    if (!activeSession) return;
    try {
      if (!postCountSession(activeSession, sessionItems)) return;
      setShowSessionModal(false);
      loadSessions();
    } catch (e: any) {
      console.error(e);
      alert('فشل ترحيل الجرد: ' + e.message);
    }
  };

  const handleWarehouseChange = (warehouseId: string) => {
    setSelectedWarehouseId(warehouseId);
    setSelectedProductIds([]);
    loadProducts(warehouseId);
  };

  const handleToggleProduct = (productId: string) => {
    setSelectedProductIds(current => current.includes(productId)
      ? current.filter(id => id !== productId)
      : [...current, productId]);
  };

  const filtered = filterCountSessions(sessions, statusFilter, search);
  const visibleSessionItems = getVisibleCountItems(sessionItems, itemSearch);
  const countedItems = countCountedItems(sessionItems);
  const varianceItems = countVarianceItems(sessionItems);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <InventoryCountHeader
        onCreateSession={() => { setErrorMsg(''); setSelectedProductIds([]); setProductSearch(''); loadProducts(); setShowCreateModal(true); }}
      />

      {/* Toolbar */}
      <CountSessionsToolbar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {/* Table Content */}
      <div className="flex-1 overflow-auto p-6">
        <CountSessionsTable
          loading={loading}
          sessions={filtered}
          onOpenSession={handleOpenSession}
        />
      </div>

      {/* Start Session Modal */}
      {showCreateModal && (
        <StartCountSessionModal
          errorMsg={errorMsg}
          warehouses={warehouses}
          selectedWarehouseId={selectedWarehouseId}
          onWarehouseChange={handleWarehouseChange}
          notes={notes}
          onNotesChange={setNotes}
          countType={countType}
          onCountTypeChange={setCountType}
          isBlindCount={isBlindCount}
          onBlindCountChange={setIsBlindCount}
          products={products}
          productSearch={productSearch}
          onProductSearchChange={setProductSearch}
          selectedProductIds={selectedProductIds}
          onToggleProduct={handleToggleProduct}
          onSubmit={handleStartSession}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Session Counting & View Modal */}
      {showSessionModal && activeSession && (
        <SessionCountModal
          session={activeSession}
          items={sessionItems}
          visibleItems={visibleSessionItems}
          itemSearch={itemSearch}
          onItemSearchChange={setItemSearch}
          countedItems={countedItems}
          varianceItems={varianceItems}
          onCountChange={handleItemCountChange}
          onDiscrepancyReasonChange={handleItemDiscrepancyReasonChange}
          onNoteChange={handleItemNoteChange}
          onSaveDraft={handleSaveDraft}
          onPost={handlePostSession}
          onClose={() => setShowSessionModal(false)}
        />
      )}
    </div>
  );
};
