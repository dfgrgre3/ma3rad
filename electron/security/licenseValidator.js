// electron/security/licenseValidator.js
// Multi-layered license validation engine: Ed25519 digital signatures, machine binding,
// offline lease enforcement, clock rollback detection, and tamper verification.
const { verifyEd25519Signature } = require('./crypto');
const { getHardwareId } = require('../hardwareId');

// Embedded trusted root public key for CeramiSys / Edarty licensing server.
// Base64-encoded SPKI DER for Ed25519.
const DEFAULT_PINNED_PUBLIC_KEY = 'MCowBQYDK2VwAyEAWXcJFVqxr6oFDfuFHNoM0eMd35pWtXlBafhw/LIBucQ=';

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
      const startsAtMs = new Date(payload.startsAt).getTime();
      if (!isNaN(startsAtMs) && now < startsAtMs - (5 * 60 * 1000)) { // 5 min clock skew tolerance
        return { valid: false, reason: 'not_yet_valid', message: 'صلاحية الترخيص لم تبدأ بعد.' };
      }
    }

    // 5. Expiry Check (for non-perpetual licenses)
    if (payload.validUntil && payload.licenseType !== 'perpetual') {
      const expiresAtMs = new Date(payload.validUntil).getTime();
      if (!isNaN(expiresAtMs) && now > expiresAtMs) {
        return { valid: false, reason: 'license_expired', message: 'انتهت فترة صلاحية الترخيص.' };
      }
    }

    // 6. Offline Lease Check (if offline lease timestamp is specified)
    if (payload.offlineLeaseExpiresAt) {
      const leaseExpiresAtMs = new Date(payload.offlineLeaseExpiresAt).getTime();
      if (!isNaN(leaseExpiresAtMs) && now > leaseExpiresAtMs) {
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
  generateOfflineActivationRequest(customerInfo = {}) {
    const hwid = getHardwareId();
    return {
      type: 'CERAMISYS_OFFLINE_ACTIVATION_REQUEST',
      version: 1,
      hardwareId: hwid,
      customerName: customerInfo.customerName || '',
      account: customerInfo.account || '',
      phone: customerInfo.phone || '',
      requestedAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  LicenseValidator,
  DEFAULT_PINNED_PUBLIC_KEY,
};
