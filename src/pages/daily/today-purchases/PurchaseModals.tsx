import React from 'react';
import {
  DetailsModal, PaymentModal, QuickPurchaseModal, VoidModal, type PaymentTarget,
} from '../../../components/daily/DailyModals';
import type { PurchaseDetailsTarget, PurchaseVoidTarget } from './types';

export interface PurchaseModalsProps {
  quickOpen: boolean;
  onCloseQuickOpen: () => void;
  paymentTarget: PaymentTarget | null;
  onClosePayment: () => void;
  detailsTarget: PurchaseDetailsTarget | null;
  onCloseDetails: () => void;
  voidTarget: PurchaseVoidTarget | null;
  onCloseVoid: () => void;
  onSaved: () => void;
}

export const PurchaseModals: React.FC<PurchaseModalsProps> = ({
  quickOpen, onCloseQuickOpen,
  paymentTarget, onClosePayment,
  detailsTarget, onCloseDetails,
  voidTarget, onCloseVoid, onSaved,
}) => (
  <>
    {quickOpen && <QuickPurchaseModal onClose={onCloseQuickOpen} onSaved={onSaved} />}
    {paymentTarget && <PaymentModal target={paymentTarget} onClose={onClosePayment} onSaved={onSaved} />}
    {detailsTarget && <DetailsModal kind="purchase" id={detailsTarget.id} onClose={onCloseDetails} onChanged={onSaved} />}
    {voidTarget && <VoidModal target={voidTarget} onClose={onCloseVoid} onDeleted={onSaved} />}
  </>
);
