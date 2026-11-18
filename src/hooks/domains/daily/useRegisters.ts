import { useEffect, useState } from 'react';
import { CashierService } from '../../../services/domains/finance/CashierService';
import type { CashRegister } from '../../../types';

export function useRegisters() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    new CashierService().getAllRegistersAsync()
      .then((rows) => { if (!cancelled) setRegisters(rows); })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'تعذر تحميل الخزائن');
      });
    return () => { cancelled = true; };
  }, []);

  return { registers, error };
}
