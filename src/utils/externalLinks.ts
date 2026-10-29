/**
 * Helpers for optional online features (WhatsApp sharing).
 *
 * CeramiSys ERP runs fully offline on a single machine. Sharing a document via
 * WhatsApp is the only action that needs the Internet, so it must never fail
 * silently when the machine is disconnected: the message is copied to the
 * clipboard and the user is told why the browser did not open.
 */

const OFFLINE_MESSAGE =
  'مشاركة واتساب تحتاج اتصالاً بالإنترنت. التطبيق نفسه يعمل بالكامل بدون إنترنت، ' +
  'وقد تم نسخ نص الرسالة إلى الحافظة للاستخدام لاحقاً.';

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Opens an external URL in the OS browser. Returns false (and leaves the
 * message on the clipboard) when the machine has no connection.
 */
export function openExternalShare(url: string, offlineText?: string): boolean {
  if (!isOnline()) {
    if (offlineText && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(offlineText).catch(() => undefined);
    }
    window.alert(OFFLINE_MESSAGE);
    return false;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/** Builds a wa.me link; `phone` may be empty to let WhatsApp pick a contact. */
export function buildWhatsAppUrl(phone: string, encodedText: string): string {
  return phone ? `https://wa.me/${phone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
}
