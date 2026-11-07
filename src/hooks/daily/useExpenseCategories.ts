import { useEffect, useState } from 'react';
import { CashierService } from '../../services/CashierService';
import type { ExpenseCategory } from '../../types';

export function useExpenseCategories() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setCategories(new CashierService().getExpenseCategories());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل تصنيفات المصروفات');
    }
  }, []);

  return { categories, error };
}
