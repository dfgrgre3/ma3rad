import { useState } from 'react';
import { InventoryService } from '../../services/InventoryService';
import { useToast } from '../ui/Toast';
import type { ReceiptInput, TransferRequestItem } from './types';

const inventoryService = new InventoryService();

export function useTransferActions(onSuccess: () => void) {
  const toast = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fromWhId, setFromWhId] = useState('');
  const [toWhId, setToWhId] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestItems, setRequestItems] = useState<TransferRequestItem[]>([]);
  const [receivingTransfer, setReceivingTransfer] = useState<any | null>(null);
  const [receivingItems, setReceivingItems] = useState<any[]>([]);
  const [receiptInputs, setReceiptInputs] = useState<Record<string, ReceiptInput>>({});
  const [detailTransfer, setDetailTransfer] = useState<any | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);

  const handleOpenCreate = (defId: string) => {
    setRequestItems([{ productId: defId, quantityM2: 10, notes: '' }]);
    setShowCreateModal(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromWhId === toWhId) return toast.error('لا يمكن التحويل لنفس المخزن.');
    if (!requestItems.length) return toast.error('أضف صنفاً واحداً على الأقل.');
    try {
      inventoryService.createTransferRequest({
        fromWarehouseId: fromWhId,
        toWarehouseId: toWhId,
        items: requestItems,
        notes: requestNotes,
      });
      toast.success('تم إنشاء طلب التحويل المخزني بنجاح وبانتظار الاعتماد.');
      setShowCreateModal(false);
      setRequestNotes('');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'فشلت العملية.');
    }
  };

  const runAction = (promptMsg: string | null, fn: () => void, successMsg: string) => {
    if (promptMsg && !confirm(promptMsg)) return;
    try {
      fn();
      toast.success(successMsg);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'فشلت العملية.');
    }
  };

  const handleOpenReceive = (trf: any) => {
    setReceivingTransfer(trf);
    try {
      const items = inventoryService.getTransferItems(trf.id);
      setReceivingItems(items);
      const initialMap: Record<string, any> = {};
      items.forEach((i) => {
        initialMap[i.id] = { receivedM2: i.shippedM2 || i.quantityM2, lostM2: 0, damagedM2: 0, notes: '' };
      });
      setReceiptInputs(initialMap);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل الأصناف.');
    }
  };

  const handleReceiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingTransfer) return;
    try {
      const receipts = Object.entries(receiptInputs).map(([itemId, val]) => ({
        itemId,
        receivedM2: Number(val.receivedM2 || 0),
        lostM2: Number(val.lostM2 || 0),
        damagedM2: Number(val.damagedM2 || 0),
        notes: val.notes,
      }));
      inventoryService.receiveTransfer(receivingTransfer.id, receipts);
      toast.success('تم تأكيد استلام الشحنة وإضافتها لمخزن الوجهة.');
      setReceivingTransfer(null);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'فشل تأكيد الاستلام.');
    }
  };

  const handleReject = (id: string) => {
    const reason = prompt('أدخل سبب رفض أو إلغاء التحويل:');
    if (!reason?.trim()) return;
    runAction(null, () => inventoryService.rejectTransfer(id, reason.trim()), 'تم رفض التحويل.');
  };

  return {
    showCreateModal, setShowCreateModal, fromWhId, setFromWhId, toWhId, setToWhId,
    requestNotes, setRequestNotes, requestItems, setRequestItems,
    receivingTransfer, setReceivingTransfer, receivingItems, receiptInputs, setReceiptInputs,
    detailTransfer, setDetailTransfer, detailItems,
    handleOpenCreate,
    handleAddItemRow: (id: string) => setRequestItems((p) => [...p, { productId: id, quantityM2: 10, notes: '' }]),
    handleRemoveItemRow: (idx: number) => setRequestItems((p) => p.filter((_, i) => i !== idx)),
    handleCreateSubmit,
    handleApprove: (id: string) => runAction('هل تريد اعتماد أمر التحويل؟', () => inventoryService.approveTransfer(id), 'تم اعتماد التحويل.'),
    handlePrepare: (id: string) => runAction(null, () => inventoryService.prepareTransfer(id), 'تم بدء تجهيز البضاعة.'),
    handleDispatch: (id: string) => runAction('هل تأكدت من خروج الشحنة؟', () => inventoryService.dispatchTransfer(id), 'تم إرسال الشحنة.'),
    handleOpenReceive, handleReceiveSubmit, handleReject,
    handleViewDetails: (trf: any) => {
      setDetailTransfer(trf);
      try { setDetailItems(inventoryService.getTransferItems(trf.id)); } catch (e: any) { toast.error(e?.message); }
    },
  };
}
