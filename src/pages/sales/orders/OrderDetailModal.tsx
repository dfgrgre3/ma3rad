import React from 'react';
import {
  X, Printer, MessageCircle, History, PackageCheck, ChevronLeft, Receipt, Ban,
} from 'lucide-react';
import { Order } from '../../../services/sales/OrderService';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { Modal, Info } from './ui';
import { STATUS_LABELS, fmt } from '../../../types/sales/ordersPage';
import { summarizeOrderQuantity } from './helpers';
import type { OperationalFieldDefinition } from '../../../services/products/OperationalFieldService';
import { OperationalFieldsSummary } from '../../../components/products/OperationalFieldsSummary';
import './OrderDetailModal_part01';
import './OrderDetailModal_part02';
export { OrderDetailModal } from './OrderDetailModal_part02';
