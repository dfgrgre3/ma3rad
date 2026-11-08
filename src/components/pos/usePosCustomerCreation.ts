import type { Dispatch, SetStateAction } from 'react';
import type { Customer } from '../../types';
import type { CustomerService } from '../../services/CustomerService';
import type { Toast } from './types';

interface UsePosCustomerCreationOptions {
  can: (permission: string) => boolean;
  notify: (message: string, type?: Toast['type']) => void;
  customerService: CustomerService;
  setCustomers: Dispatch<SetStateAction<Customer[]>>;
  applyCustomerPricing: (customer: Customer | null) => void;
  setSelectedCustomer: Dispatch<SetStateAction<Customer | null>>;
  setRedeemPoints: Dispatch<SetStateAction<number>>;
  setLoyaltyDiscount: Dispatch<SetStateAction<number>>;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  phone: string;
  setPhone: Dispatch<SetStateAction<string>>;
  customerType: Customer['customerType'];
  setCustomerType: Dispatch<SetStateAction<Customer['customerType']>>;
  creditLimit: number;
  setCreditLimit: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string>>;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

export const usePosCustomerCreation = ({
  can,
  notify,
  customerService,
  setCustomers,
  applyCustomerPricing,
  setSelectedCustomer,
  setRedeemPoints,
  setLoyaltyDiscount,
  name,
  setName,
  phone,
  setPhone,
  customerType,
  setCustomerType,
  creditLimit,
  setCreditLimit,
  setError,
  setIsOpen,
}: UsePosCustomerCreationOptions) => {
  const handleCreateCustomer = () => {
    if (!can('customers.create')) {
      notify('لا تملك صلاحية إضافة عميل', 'error');
      return;
    }
    if (!name.trim() || !phone.trim()) {
      notify('يرجى إدخال اسم العميل ورقم الهاتف', 'error');
      return;
    }
    try {
        if (customerService.getCustomerByPhone(phone)) {
          setError('رقم الهاتف مرتبط بعميل موجود. ابحث عنه واختره بدلاً من إنشاء سجل مكرر.');
          return;
        }
      const created = customerService.createCustomer({
        code: '',
        name: name.trim(),
        phone: phone.trim(),
        customerType,
        creditLimit: creditLimit || 0,
        currentBalance: 0,
        totalPurchases: 0
      } as any);
      setCustomers([created]);
      setSelectedCustomer(created);
      setRedeemPoints(0);
      setLoyaltyDiscount(0);
      applyCustomerPricing(created);
      setIsOpen(false);
      setError('');
      setName('');
      setPhone('');
      setCreditLimit(0);
      setCustomerType('RETAIL');
      notify(`تم إنشاء العميل: ${created.name}`, 'success');
    } catch (error: any) {
      notify(error.message || 'تعذر إنشاء العميل', 'error');
    }
  };

  return { handleCreateCustomer };
};
