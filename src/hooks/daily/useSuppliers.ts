import { useEffect, useState } from 'react';
import { DatabaseManager } from '../../database/repositories/databaseManager';
import type { Supplier } from '../../types';

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Pick<Supplier, 'id' | 'name' | 'phone'>[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setSuppliers(DatabaseManager.getInstance().query<Pick<Supplier, 'id' | 'name' | 'phone'>>(
        'SELECT id, name, phone FROM suppliers WHERE is_active = 1 ORDER BY name'
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل قائمة الموردين');
    }
  }, []);

  return { suppliers, error };
}
