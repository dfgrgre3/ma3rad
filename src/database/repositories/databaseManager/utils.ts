export function persistenceErrorMessage(error: unknown, fallbackCode: string): string {
  const seen = new Set<unknown>();
  let current: any = error;
  while (current && !seen.has(current)) {
    if (typeof current === 'string' && current.trim()) return current.trim();
    if (typeof current !== 'object') break;
    seen.add(current);
    const message = typeof current.message === 'string' ? current.message.trim() : '';
    const code = typeof current.code === 'string' ? current.code.trim() : '';
    const errno = typeof current.errno === 'string' || typeof current.errno === 'number' ? String(current.errno) : '';
    const syscall = typeof current.syscall === 'string' ? current.syscall.trim() : '';
    const path = typeof current.path === 'string' ? current.path.trim() : '';
    const details = [code && `[${code}]`, errno && `errno ${errno}`, syscall, path].filter(Boolean).join(' ');
    if (message || details) return [message, details].filter(Boolean).join(' — ');
    current = current.cause;
  }
  return `تعذر حفظ قاعدة البيانات (الرمز: ${fallbackCode}). راجع سجل التطبيق لمعرفة تفاصيل الخطأ.`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function toUint8Array(value: unknown): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return new Uint8Array(value);
  return null;
}
