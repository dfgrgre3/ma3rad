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
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  return normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}

/** Converts Egyptian local mobile/landline numbers to the international 20 prefix. */
export function normalizeWhatsAppPhone(value: string): string {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.startsWith('0')) return `20${phone.slice(1)}`;
  if (phone.startsWith('1') && phone.length === 10) return `20${phone}`;
  return phone;
}

/** Opens a direct customer chat with its message prefilled. The user must press Send in WhatsApp. */
export function openWhatsAppChat(phone: string, message: string): boolean {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone) {
    window.alert('لا يوجد رقم هاتف صحيح لهذا العميل لفتح محادثة واتساب مباشرة.');
    return false;
  }

  const encodedMessage = encodeURIComponent(message);
  if (encodedMessage.length > 5000) {
    const opened = openExternalShare(buildWhatsAppUrl(normalizedPhone, ''), message);
    if (!opened) return false;

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(message)
        .then(() => window.alert('نص الرسالة طويل. تم نسخه؛ الصقه في محادثة واتساب المفتوحة.'))
        .catch((error) => {
          console.error('Failed to copy the long WhatsApp message:', error);
          window.prompt('نص الرسالة طويل. انسخه من هنا والصقه في محادثة واتساب:', message);
        });
    } else {
      window.prompt('نص الرسالة طويل. انسخه من هنا والصقه في محادثة واتساب:', message);
    }
    return true;
  }

  return openExternalShare(
    buildWhatsAppUrl(normalizedPhone, encodedMessage),
    message,
  );
}
