import React, { useState, useEffect } from 'react';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { branchAccess } from '../../services/inventory-count/branchAccess';
import { loadBranchCountSessions, loadCountProducts, loadCountSessionItems, loadCountWarehouses } from '../../services/inventory-count/countSessionData';
import { approveCountSession, cancelCountSession, rejectCountSession, saveCountDraft, startCountSession, submitCountSession } from '../../services/inventory-count/countSessionService';
import { countCountedItems, countVarianceItems, filterCountSessions, getVisibleCountItems } from './inventory-count/helpers';
import { InventoryCountHeader } from './inventory-count/InventoryCountHeader';
import { CountSessionsToolbar } from './inventory-count/CountSessionsToolbar';
import { CountSessionsTable } from './inventory-count/CountSessionsTable';
import { StartCountSessionModal } from './inventory-count/StartCountSessionModal';
import { SessionCountModal } from './inventory-count/SessionCountModal';
import type { CountItem, CountProductOption, CountSession, CountType, WarehouseOption } from '../../services/inventory-count/types';

export { loadBranchCountSessions } from '../../services/inventory-count/countSessionData';

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
      setErrorMsg(error?.message || 'Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ ØµÙ„Ø§Ø­ÙŠØ© Ø¨Ø¯Ø¡ Ø¬Ù„Ø³Ø© Ø¬Ø±Ø¯.');
      return;
    }

    if (!selectedWarehouseId) {
      setErrorMsg('Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø§Ø®ØªÙŠØ§Ø± Ù…Ø³ØªÙˆØ¯Ø¹ Ø§Ù„Ø¬Ø±Ø¯.');
      return;
    }

    try {
      branchAccess.requireWarehouseAccess(selectedWarehouseId);
    } catch (error: any) {
      setErrorMsg(error?.message || 'Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ ØµÙ„Ø§Ø­ÙŠØ© Ø§Ù„ÙˆØµÙˆÙ„ Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø®Ø²Ù† Ø§Ù„Ù…Ø­Ø¯Ø¯.');
      return;
    }

    if (countType !== 'FULL' && selectedProductIds.length === 0) {
      setErrorMsg('Ø§Ø®ØªØ± ØµÙ†ÙÙ‹Ø§ ÙˆØ§Ø­Ø¯Ù‹Ø§ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù„Ù„Ø¬Ø±Ø¯ Ø§Ù„Ø¬Ø²Ø¦ÙŠ Ø£Ùˆ Ø§Ù„Ù…ÙØ§Ø¬Ø¦.');
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
      setErrorMsg('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø¨Ø¯Ø¡ Ø¬Ù„Ø³Ø© Ø§Ù„Ø¬Ø±Ø¯: ' + err.message);
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
      alert(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± ÙØªØ­ Ø¬Ù„Ø³Ø© Ø§Ù„Ø¬Ø±Ø¯.');
    }
  };

  const handleItemCountChange = (index: number, valStr: string) => {
    const next = [...sessionItems];
    const val = valStr === '' ? null : Number.parseFloat(valStr);
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
      alert('ØªÙ… Ø­ÙØ¸ Ø§Ù„Ù…Ø³ÙˆØ¯Ø© Ø¨Ù†Ø¬Ø§Ø­.');
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? `ÙØ´Ù„ Ø­ÙØ¸ Ø§Ù„Ù…Ø³ÙˆØ¯Ø©: ${e.message}` : 'ÙØ´Ù„ Ø­ÙØ¸ Ø§Ù„Ù…Ø³ÙˆØ¯Ø©.');
    }
  };

  const handlePostSession = () => {
    if (!activeSession) return;
    try {
      submitCountSession(activeSession, sessionItems);
      setShowSessionModal(false);
      loadSessions();
    } catch (e: any) {
      console.error(e);
      alert('ÙØ´Ù„ ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ø¬Ø±Ø¯: ' + e.message);
    }
  };

  const handleApproveSession = () => {
    if (!activeSession) return;
    try {
      approveCountSession(activeSession);
      setShowSessionModal(false);
      loadSessions();
    } catch (error: any) { alert(error?.message || 'ØªØ¹Ø°Ø± Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø¬Ø±Ø¯.'); }
  };

  const handleRejectSession = () => {
    if (!activeSession) return;
    const reason = prompt('Ø§ÙƒØªØ¨ Ø³Ø¨Ø¨ Ø±ÙØ¶ Ø§Ù„Ø¬Ø±Ø¯ ÙˆØ¥Ø¹Ø§Ø¯ØªÙ‡ Ù„Ù„Ø¹Ø¯:');
    if (!reason) return;
    try {
      rejectCountSession(activeSession, reason);
      setShowSessionModal(false);
      loadSessions();
    } catch (error: any) { alert(error?.message || 'ØªØ¹Ø°Ø± Ø±ÙØ¶ Ø§Ù„Ø¬Ø±Ø¯.'); }
  };

  const handleCancelSession = () => {
    if (!activeSession || !confirm('Ù‡Ù„ ØªØ±ÙŠØ¯ Ø¥Ù„ØºØ§Ø¡ Ø¬Ù„Ø³Ø© Ø§Ù„Ø¬Ø±Ø¯ØŸ Ù„Ù† ÙŠØªÙ… ØªØ¹Ø¯ÙŠÙ„ Ø£Ø±ØµØ¯Ø© Ø§Ù„Ù…Ø®Ø²ÙˆÙ†.')) return;
    try {
      cancelCountSession(activeSession);
      setShowSessionModal(false);
      loadSessions();
    } catch (error: any) {
      alert(error?.message || 'ØªØ¹Ø°Ø± Ø¥Ù„ØºØ§Ø¡ Ø¬Ù„Ø³Ø© Ø§Ù„Ø¬Ø±Ø¯.');
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
          canApprove={PermissionService.can(AuthService.getCurrentUser(), 'inventory.count.approve')}
          onApprove={handleApproveSession}
          onReject={handleRejectSession}
          onCancelSession={handleCancelSession}
          onClose={() => setShowSessionModal(false)}
        />
      )}
    </div>
  );
};
