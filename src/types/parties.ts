export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  phone2?: string;
  nationalId?: string;
  address?: string;
  city?: string;
  customerType: 'RETAIL' | 'CONTRACTOR' | 'WHOLESALE' | 'ENGINEER';
  creditLimit: number;
  paymentTermsDays?: number;
  currentBalance: number; // مدين (+) أو دائن (-)
  totalPurchases: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  companyName?: string;
  phone: string;
  email?: string;
  taxNumber?: string;
  commercialRecord?: string;
  address?: string;
  isActive?: number;
  currentBalance: number; // مستحق له (+) أو لنا (-)
  totalPurchases: number;
  paymentTermsDays?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
