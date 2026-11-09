import type { ExpenseCategory, PaymentType } from '../../../types';

export interface Props {
  isOpen: boolean;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSubmit: (cat: string, amount: number, desc: string, recipient: string, paymentType: PaymentType) => Promise<void>;
}
