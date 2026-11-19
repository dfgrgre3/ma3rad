import { localDateString } from '../../../../utils/shared/date';
import { csvCell } from '../../../../utils/export/csv';
import {
  type BusinessPartner,
  type PartnerDraft,
  type PartnerOverview,
  type PartnerPaymentType,
  type PartnerAttachment,
  type PartnerTransaction,
  type PartnerTransactionAction,
  type PartnerTransactionType,
} from '../../../../services/domains/customers/PartnerService';

export const formatNumber = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
export const formatMoney = (value: number) => `${formatNumber.format(value || 0)} ج.م`;
export const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('ar-EG');

export const TRANSACTION_LABELS: Record<PartnerTransactionType, string> = {
  CAPITAL_CONTRIBUTION: 'سداد مساهمة رأس المال',
  WITHDRAWAL: 'سحب من رأس المال',
  PROFIT_ALLOCATION: 'أرباح مستحقة',
  PROFIT_DISTRIBUTION: 'صرف أرباح',
  PARTNER_EXPENSE_PAID: 'مصروف دفعه الشريك للشركة',
  COMPANY_EXPENSE_FOR_PARTNER: 'مصروف دفعته الشركة للشريك',
  PARTNER_LOAN: 'قرض من الشريك',
  LOAN_REPAYMENT: 'سداد قرض الشريك',
  PERSONAL_DRAWING: 'مسحوبات شخصية',
  ADJUSTMENT_INCREASE: 'تسوية بالزيادة',
  ADJUSTMENT_DECREASE: 'تسوية بالنقص',
  REVERSAL: 'عكس حركة',
};

export type PartnerModal = 'partner' | 'transaction' | 'profits' | 'reversal' | null;
export type Tab = 'statement' | 'overview' | 'distributions';
export type InitialPaymentStatus = 'UNPAID' | 'PARTIAL' | 'FULL' | 'CUSTOM';

export const CASH_ACTIONS: PartnerTransactionAction[] = [
  'CAPITAL_CONTRIBUTION', 'WITHDRAWAL', 'PROFIT_DISTRIBUTION', 'COMPANY_EXPENSE_FOR_PARTNER',
  'PARTNER_LOAN', 'LOAN_REPAYMENT', 'PERSONAL_DRAWING',
];

export const ACTION_OPTIONS: Array<{ value: PartnerTransactionAction; label: string; group: string }> = [
  { value: 'CAPITAL_CONTRIBUTION', label: 'تسجيل سداد المساهمة', group: 'رأس المال' },
  { value: 'WITHDRAWAL', label: 'سحب من رأس المال', group: 'رأس المال' },
  { value: 'PROFIT_DISTRIBUTION', label: 'صرف أرباح مستحقة', group: 'الأرباح' },
  { value: 'PARTNER_EXPENSE_PAID', label: 'مصروف دفعه الشريك نيابة عن الشركة', group: 'المصروفات' },
  { value: 'COMPANY_EXPENSE_FOR_PARTNER', label: 'مصروف دفعته الشركة نيابة عن الشريك', group: 'المصروفات' },
  { value: 'PARTNER_LOAN', label: 'قرض من الشريك للشركة (نقدية داخلة)', group: 'القروض والسلف' },
  { value: 'LOAN_REPAYMENT', label: 'سداد قرض الشريك (نقدية خارجة)', group: 'القروض والسلف' },
  { value: 'PERSONAL_DRAWING', label: 'مسحوبات شخصية للشريك', group: 'القروض والسلف' },
  { value: 'ADJUSTMENT_INCREASE', label: 'تسوية رصيد الشريك بالزيادة', group: 'التسويات' },
  { value: 'ADJUSTMENT_DECREASE', label: 'تسوية رصيد الشريك بالنقص', group: 'التسويات' },
];

export const FILTER_TYPES: PartnerTransactionType[] = [
  'CAPITAL_CONTRIBUTION', 'WITHDRAWAL', 'PROFIT_ALLOCATION', 'PROFIT_DISTRIBUTION',
  'PARTNER_EXPENSE_PAID', 'COMPANY_EXPENSE_FOR_PARTNER', 'PARTNER_LOAN', 'LOAN_REPAYMENT',
  'PERSONAL_DRAWING', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE', 'REVERSAL',
];

export const today = () => localDateString();

export const emptyPartner: PartnerDraft = {
  name: '', phone: '', email: '', ownershipPercent: 0, capitalAmount: 0,
  ownershipMode: 'AUTO', ownershipBasis: 'AGREED_CAPITAL', ownershipEffectiveDate: today(),
  ownershipChangeReason: '', capitalEffectiveDate: today(), capitalChangeReason: '',
  initialPaidAmount: 0, initialPaymentType: 'CASH', profitShareChangeReason: '',
  notes: '', isActive: true,
};

export const emptyOverview: PartnerOverview = {
  partnersCount: 0, activePartnersCount: 0, ownershipTotal: 0, totalCapitalAgreed: 0,
  totalContributions: 0, totalWithdrawals: 0, totalProfitsDue: 0, totalProfitsDistributed: 0,
  totalExpensesPaid: 0, totalExpensesForPartner: 0, totalLoansReceived: 0, totalLoansRepaid: 0,
  totalDrawings: 0, totalAdjustments: 0, totalNetBalance: 0,
};

export function downloadCsv(fileName: string, rows: Array<Array<string | number | null | undefined>>): void {
  const csv = '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function readPartnerAttachment(file: File): Promise<PartnerAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`تعذر قراءة الملف ${file.name}.`));
        return;
      }
      resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    };
    reader.onerror = () => reject(reader.error || new Error(`تعذر قراءة الملف ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export function paymentTypeLabel(type: PartnerTransaction['paymentType']): string {
  switch (type) {
    case 'CASH': return 'نقدي';
    case 'CARD': return 'بطاقة';
    case 'BANK_TRANSFER': return 'تحويل بنكي';
    case 'CHEQUE': return 'شيك';
    default: return '—';
  }
}

export type { BusinessPartner, PartnerDraft, PartnerOverview, PartnerPaymentType, PartnerAttachment, PartnerTransaction, PartnerTransactionAction, PartnerTransactionType };

export type StatementFilters = { from: string; to: string; type: 'ALL' | PartnerTransactionType; search: string };

export type TransactionDraft = {
  amount: string;
  transactionDate: string;
  paymentType: PartnerPaymentType;
  registerId: string;
  bankAccountId: string;
  referenceNumber: string;
  description: string;
};
