import { Order } from '../../../services/sales/OrderService';
import type { OperationalFieldDefinition } from '../../../services/products/OperationalFieldService';

export interface OrderDetailModalProps {
  order: Order;
  canUpdate: boolean;
  canApprove: boolean;
  onClose: () => void;
  onPrint: (order: Order) => void;
  onShareOnWhatsApp: (order: Order) => void;
  onOpenTimeline: (order: Order) => void;
  onOpenDelivery: (order: Order) => void;
  onAdvance: (order: Order) => void;
  onOpenConvert: (order: Order) => void;
  onCancel: (order: Order) => void;
  operationalFields: OperationalFieldDefinition[];
  operationalFieldValues: Record<string, string>;
}
