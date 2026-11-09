import { useContext } from 'react';
import { ToastContext } from './Toast_part01';
import type { ToastApi } from './Toast_part01';

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
