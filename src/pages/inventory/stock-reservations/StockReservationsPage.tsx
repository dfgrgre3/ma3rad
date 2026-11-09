import React from 'react';
import { ReservationsDepositPage } from '../../sales/reservations/ReservationsDepositPage';

/** Inventory-only entry point. Sales orders and customer data are intentionally not loaded here. */
export const StockReservationsPage: React.FC = () => (
  <ReservationsDepositPage mode="inventory" />
);

export default StockReservationsPage;
