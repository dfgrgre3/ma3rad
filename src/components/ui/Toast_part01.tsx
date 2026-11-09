import React, { createContext } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

export interface ToastApi {
  show: (kind: ToastKind, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export const STYLES: Record<ToastKind, string> = {
  success: 'border-[var(--cerami-border)] border-r-[3px] border-r-[var(--cerami-success)] bg-[var(--cerami-surface)] text-[var(--cerami-text)]',
  error: 'border-[var(--cerami-border)] border-r-[3px] border-r-[var(--cerami-danger)] bg-[var(--cerami-surface)] text-[var(--cerami-text)]',
  warning: 'border-[var(--cerami-border)] border-r-[3px] border-r-[var(--cerami-warning)] bg-[var(--cerami-surface)] text-[var(--cerami-text)]',
  info: 'border-[var(--cerami-border)] border-r-[3px] border-r-[var(--cerami-primary)] bg-[var(--cerami-surface)] text-[var(--cerami-text)]',
};

export const ICON_TONES: Record<ToastKind, string> = {
  success: 'text-[var(--cerami-success)]',
  error: 'text-[var(--cerami-danger)]',
  warning: 'text-[var(--cerami-warning)]',
  info: 'text-[var(--cerami-primary)]',
};

export const ICONS: Record<ToastKind, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};
