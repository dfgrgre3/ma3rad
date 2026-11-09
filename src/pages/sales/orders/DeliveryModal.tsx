import React from 'react';
import { X, PackageCheck, Loader2 } from 'lucide-react';
import { Order, OrderItem } from '../../../services/sales/OrderService';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { Modal } from './ui';
import { summarizeOrderQuantity } from './helpers';
import './DeliveryModal_part01';
import './DeliveryModal_part02';
export { DeliveryModal } from './DeliveryModal_part02';
