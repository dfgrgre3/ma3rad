import React from 'react';
import { ReservationsDepositPage } from './ReservationsDepositPage';

/** Sales-only entry point. Inventory reservations are intentionally not loaded here. */
export const SalesOrdersDepositsPage: React.FC = () => (
  <ReservationsDepositPage mode="sales" />
);

export default SalesOrdersDepositsPage;
