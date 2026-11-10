import type { Customer } from '../../../../types';

export const CUSTOMER_TYPE_LABELS: Record<Customer['customerType'], string> = {
  RETAIL: 'قطاعي',
  CONTRACTOR: 'مقاول',
  WHOLESALE: 'جملة',
  ENGINEER: 'مهندس',
};
