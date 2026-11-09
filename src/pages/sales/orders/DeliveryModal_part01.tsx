import React from 'react';
import { Order, OrderItem } from '../../../services/sales/OrderService';

export interface DeliveryModalProps {
  target: Order;
  lines: Record<string, number>;
  setLines: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  note: string;
  setNote: (value: string) => void;
  saving: boolean;
  batchSummaryItems?: OrderItem[];
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}
