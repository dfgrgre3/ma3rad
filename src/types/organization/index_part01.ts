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
  englishName?: string | null;
  legalName?: string | null;
  logoPath?: string | null;
  taxNumber?: string | null;
  commercialRecord?: string | null;
  address?: string | null;
  country?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  currency?: string | null;
  fiscalYearStartMonth?: number | null;
  fiscalYearStartDate?: string | null;
  fiscalYearEndDate?: string | null;
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
  englishName?: string;
  legalName?: string;
  logoPath?: string;
  taxNumber?: string;
  commercialRecord?: string;
  address?: string;
  country?: string;
  city?: string;
  phone?: string;
  email?: string;
  currency?: string;
  fiscalYearStartMonth?: number;
  fiscalYearStartDate?: string;
  fiscalYearEndDate?: string;
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
