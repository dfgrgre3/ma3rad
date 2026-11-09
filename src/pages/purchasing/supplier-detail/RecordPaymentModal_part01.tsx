import React from 'react';
import { Supplier } from '../../../types';
import { RecordPaymentFormData } from '../../../types/purchasing/supplierDetailPage';

export interface RecordPaymentModalProps {
  supplier: Supplier;
  paymentData: RecordPaymentFormData;
  paymentError: string;
  onChange: (data: RecordPaymentFormData) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}
