export interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  phone2?: string | null;
  taxNumber?: string | null;
  city?: string | null;
  managerId?: string | null;
  managerName?: string | null;
  deviceType?: string | null;
  activationCode?: string | null;
  notes?: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  companyId?: string | null;
  companyName?: string | null;
}

export interface Company {
  id: string;
  code: string;
  name: string;
  legalName?: string | null;
  taxNumber?: string | null;
  commercialRecord?: string | null;
  currency?: string | null;
  fiscalYearStartMonth?: number | null;
  timeZone?: string | null;
  locale?: string | null;
  dateFormat?: string | null;
  payrollTaxRate?: number | null;
  overtimeMultiplier?: number | null;
  workingDaysPerMonth?: number | null;
  parentCompanyId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  branchCount?: number;
}

export interface CreateCompanyDTO {
  code: string;
  name: string;
  legalName?: string;
  taxNumber?: string;
  commercialRecord?: string;
  currency?: string;
  fiscalYearStartMonth?: number;
  timeZone?: string;
  locale?: string;
  dateFormat?: string;
  payrollTaxRate?: number;
  overtimeMultiplier?: number;
  workingDaysPerMonth?: number;
  parentCompanyId?: string;
}

export interface BranchWarehouse {
  id: string;
  branchId: string;
  warehouseId: string;
  isPrimary: boolean;
  warehouseName?: string | null;
}
