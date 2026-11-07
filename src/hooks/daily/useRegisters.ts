import { useEffect, useState } from 'react';
import { CashierService } from '../../services/CashierService';
import type { CashRegister } from '../../types';

export function useRegisters() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setRegisters(new CashierService().getAllRegisters());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الخزائن');
    }
  }, []);

  return { registers, error };
}
