import type { ReservationTab } from '../../../types/sales/reservationsPage';

export interface ReservationsToolbarProps {
  mode?: 'orders' | 'reservations';
  activeTab: ReservationTab;
  onTabChange: (tab: ReservationTab) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  onRefresh: () => void;
  loading: boolean;
  ordersCount: number;
  reservationsCount: number;
}
