import type { NotificationType } from '../../../types/notifications';

/**
 * Lightweight in-process bus that lets every notification write — regardless
 * of which service/module produced it — reach the UI instantly instead of
 * waiting for the next polling cycle.
 *
 * `created` carries the full payload so the toast layer can render it
 * immediately; `changed` is a coarse "the notifications table changed" signal
 * used to refresh the unread badge after reads/deletes/bulk updates.
 */
export interface NotificationCreatedPayload {
  id: string;
  userId?: string | null;
  type: NotificationType | string;
  title: string;
  message: string;
  referenceType?: string | null;
  referenceId?: string | null;
  createdAt?: string;
}

type CreatedListener = (payload: NotificationCreatedPayload) => void;
type ChangedListener = () => void;

const createdListeners = new Set<CreatedListener>();
const changedListeners = new Set<ChangedListener>();

function notifyCreated(payload: NotificationCreatedPayload): void {
  for (const listener of [...createdListeners]) {
    try { listener(payload); } catch { /* listener errors must not break writers */ }
  }
  for (const listener of [...changedListeners]) {
    try { listener(); } catch { /* ignore */ }
  }
}

function notifyChanged(): void {
  for (const listener of [...changedListeners]) {
    try { listener(); } catch { /* ignore */ }
  }
}

export const notificationBus = {
  emitCreated(payload: NotificationCreatedPayload): void {
    notifyCreated(payload);
  },
  emitChanged(): void {
    notifyChanged();
  },
  onCreated(listener: CreatedListener): () => void {
    createdListeners.add(listener);
    return () => { createdListeners.delete(listener); };
  },
  onChanged(listener: ChangedListener): () => void {
    changedListeners.add(listener);
    return () => { changedListeners.delete(listener); };
  },
};
