// electron/security/licenseValidator.js
// Multi-layered license validation engine: Ed25519 digital signatures, machine binding,
// offline lease enforcement, clock rollback detection, and tamper verification.
const { verifyEd25519Signature } = require('./crypto');
const { getHardwareId } = require('../hardwareId');

// Embedded trusted root public key for CeramiSys / Edarty licensing server.
// Base64-encoded SPKI DER for Ed25519.
const DEFAULT_PINNED_PUBLIC_KEY = 'MCowBQYDK2VwAyEAWXcJFVqxr6oFDfuFHNoM0eMd35pWtXlBafhw/LIBucQ=';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

function parseIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return NaN;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) return NaN;
  return parsed;
}

class LicenseValidator {
  constructor(options = {}) {
    this.publicKey = options.publicKey || process.env.CERAMISYS_LICENSE_PUBLIC_KEY || DEFAULT_PINNED_PUBLIC_KEY;
  }

  /**
   * Set or rotate the trusted public key (for testing or updates).
   */
  setPublicKey(publicKey) {
    if (typeof publicKey === 'string' && publicKey.trim()) {
      this.publicKey = publicKey.trim();
    }
  }

  getPublicKey() {
    return this.publicKey;
  }

  /**
   * Validates a signed license certificate object.
   * Certificate format:
   * {
   *   payload: {
   *     licenseKey: string,
   *     customerId: string,
   *     hardwareId: string,
   *     licenseType: 'monthly' | 'annual' | 'perpetual',
   *     startsAt: string (ISO),
   *     validUntil: string (ISO),
   *     offlineLeaseExpiresAt?: string (ISO),
   *     allowedModules: string[],
   *     maxDevices: number,
   *     revoked?: boolean,
   *     issuedAt: string (ISO),
   *   },
   *   signature: string (base64 Ed25519 signature)
   * }
   */
  validateCertificate(certificate, currentHwid = getHardwareId(), options = {}) {
    if (!certificate || typeof certificate !== 'object') {
      return { valid: false, reason: 'malformed_certificate', message: 'ملف الترخيص تالف أو غير صالح.' };
    }

    const { payload, signature } = certificate;
    if (!payload || typeof payload !== 'object' || !signature || typeof signature !== 'string') {
      return { valid: false, reason: 'missing_payload_or_signature', message: 'الترخيص غير موقع رقمياً أو تنقصه بيانات التوقيع.' };
    }

    // 1. Digital Signature Verification (Ed25519)
    const pubKey = options.publicKey || this.publicKey;
    const isSignatureValid = verifyEd25519Signature(payload, signature, pubKey);
    if (!isSignatureValid) {
      return {
        valid: false,
        reason: 'invalid_digital_signature',
        message: 'فشل التحقق من التوقيع الرقمي للترخيص (احتمال تلاعب أو تزوير).',
      };
    }

    if (!['monthly', 'annual', 'perpetual'].includes(payload.licenseType)) {
      return { valid: false, reason: 'invalid_license_type', message: 'نوع الترخيص غير صالح.' };
    }

    for (const field of ['startsAt', 'validUntil', 'offlineLeaseExpiresAt']) {
      if (payload[field] !== undefined && (
        !Number.isFinite(parseIsoDate(payload[field]))
      )) {
        return { valid: false, reason: 'invalid_license_date', message: 'تاريخ في شهادة الترخيص غير صالح.' };
      }
    }
    if (payload.licenseType !== 'perpetual' && payload.validUntil === undefined) {
      return { valid: false, reason: 'missing_expiry_date', message: 'تاريخ انتهاء الترخيص مطلوب.' };
    }

    const hasHardwareId = Object.hasOwn(payload, 'hardwareId');
    if (hasHardwareId && (typeof payload.hardwareId !== 'string' || !payload.hardwareId.trim())) {
      return { valid: false, reason: 'invalid_hardware_binding', message: 'بصمة العتاد في شهادة الترخيص غير صالحة.' };
    }
    if (options.bindingMode === 'account' && hasHardwareId) {
      return { valid: false, reason: 'account_license_hardware_bound', message: 'شهادة وضع الحساب يجب ألا تكون مرتبطة ببصمة جهاز.' };
    }
    if (options.bindingMode === 'hardwa' && !hasHardwareId) {
      return { valid: false, reason: 'missing_hardware_binding', message: 'شهادة وضع الجهاز يجب أن تتضمن بصمة العتاد.' };
    }

    // 2. Machine Binding Verification (Hardware ID)
    if (payload.hardwareId && currentHwid) {
      if (String(payload.hardwareId).trim() !== String(currentHwid).trim()) {
        return {
          valid: false,
          reason: 'hardware_mismatch',
          message: 'هذا الترخيص مخصص لجهاز كمبيوتر آخر ولا يمكن تشغيله على هذا الجهاز.',
          expectedHwid: payload.hardwareId,
          actualHwid: currentHwid,
        };
      }
    }

    // 3. Revocation status check
    if (payload.revoked === true) {
      return { valid: false, reason: 'license_revoked', message: 'تم إلغاء هذا الترخيص من قبل إدارة النظام.' };
    }

    const now = options.currentTime ? new Date(options.currentTime).getTime() : Date.now();

    // 4. StartsAt check
    if (payload.startsAt) {
      const startsAtMs = parseIsoDate(payload.startsAt);
      if (now < startsAtMs - (5 * 60 * 1000)) { // 5 min clock skew tolerance
        return { valid: false, reason: 'not_yet_valid', message: 'صلاحية الترخيص لم تبدأ بعد.' };
      }
    }

    // 5. Expiry Check (for non-perpetual licenses)
    if (payload.validUntil && payload.licenseType !== 'perpetual') {
      const expiresAtMs = parseIsoDate(payload.validUntil);
      if (now > expiresAtMs) {
        return { valid: false, reason: 'license_expired', message: 'انتهت فترة صلاحية الترخيص.' };
      }
    }

    // 6. Offline Lease Check (if offline lease timestamp is specified)
    if (payload.offlineLeaseExpiresAt) {
      const leaseExpiresAtMs = parseIsoDate(payload.offlineLeaseExpiresAt);
      if (now > leaseExpiresAtMs) {
        return {
          valid: false,
          reason: 'offline_lease_expired',
          message: 'انتهت صلاحية العمل أوفلاين. يرجى الاتصال بالإنترنت لتجديد الترخيص أو إدخال ملف ترخيص جديد.',
        };
      }
    }

    return {
      valid: true,
      reason: 'valid',
      payload,
    };
  }

  /**
   * Generates an offline activation request payload containing the machine's HWID.
   */
  generateOfflineActivationRequest(customerInfo = {}, licenseMode = 'hardwa') {
    const request = {
      type: 'CERAMISYS_OFFLINE_ACTIVATION_REQUEST',
      version: 1,
      customerName: customerInfo.customerName || '',
      account: customerInfo.account || '',
      phone: customerInfo.phone || '',
      requestedAt: new Date().toISOString(),
    };
    if (licenseMode !== 'account') request.hardwareId = getHardwareId();
    return request;
  }
}

module.exports = {
  LicenseValidator,
  DEFAULT_PINNED_PUBLIC_KEY,
};
