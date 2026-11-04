const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { safeStorage } = require('electron');
const { getHardwareId } = require('./hardwareId');
const { LicenseValidator } = require('./security/licenseValidator');

class LicenseGuard {
  constructor(appDataDir, options = {}) {
    this.appDataDir = appDataDir;
    this.licenseFile = path.join(appDataDir, 'license.dat');
    this.timeCheckFile = path.join(appDataDir, '.sys_timestamp');
    this.validator = new LicenseValidator(options);
    // License mode is resolved by electron/main.js and passed in here so the
    // guard never touches process.env directly. "account"=slot bound to the
    // licensed account+credential, "hardwa"=existing per-device binding.
    this.licenseMode = String(options.licenseMode || 'hardwa').trim().toLowerCase();
    this.licenseMode = this.licenseMode === 'account' ? 'account' : 'hardwa';
  }

  get licenseMode() {
    return this._licenseMode;
  }

  set licenseMode(value) {
    this._licenseMode = String(value || 'hardwa').trim().toLowerCase() === 'account' ? 'account' : 'hardwa';
  }

  /**
   * يفحص ما إذا تم التلاعب بوقت النظام (Monotonic clock / rollback check)
   */
  async verifySystemClock() {
    try {
      const now = Date.now();
      if (fsSync.existsSync(this.timeCheckFile)) {
        const encrypted = await fs.readFile(this.timeCheckFile);
        let lastTime = 0;
        if (safeStorage.isEncryptionAvailable()) {
          lastTime = Number(safeStorage.decryptString(encrypted));
        } else {
          lastTime = Number(Buffer.from(encrypted.toString(), 'base64').toString('utf8'));
        }

        // إذا كان الوقت الحالي أقل من آخر وقت مسجل بأكثر من 15 دقيقة (Clock rollback)
        if (now < lastTime - (15 * 60 * 1000)) {
          return { valid: false, reason: 'clock_rollback_detected' };
        }
      }

      // تحديث آخر وقت مسجل
      const timeStr = String(now);
      const dataToSave = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(timeStr)
        : Buffer.from(timeStr).toString('base64');
      await fs.writeFile(this.timeCheckFile, dataToSave);

      return { valid: true };
    } catch {
      return { valid: true }; // عدم إعاقة النظام في حال خطأ عابر بالملف
    }
  }

  /**
   * يحفظ بيانات الترخيص المشفرة ويربطها ببصمة العتاد الحالية
   */
  async saveLicense(licensePayload) {
    const hwid = getHardwareId();
    // إذا كان الترخيص يحتوي على شهادة موقعة رقمياً، يتم التحقق منها أولاً
    if (licensePayload && licensePayload.certificate) {
      const verification = this.validator.validateCertificate(licensePayload.certificate, hwid);
      if (!verification.valid) {
        return { ok: false, error: verification.reason, message: verification.message };
      }
    } else if (licensePayload && licensePayload.payload && licensePayload.signature) {
      // الترخيص نفسه عبارة عن شهادة موقعة
      const verification = this.validator.validateCertificate(licensePayload, hwid);
      if (!verification.valid) {
        return { ok: false, error: verification.reason, message: verification.message };
      }
    }

    const boundData = {
      ...licensePayload,
      hwid,
      savedAt: Date.now(),
    };

    const json = JSON.stringify(boundData);
    let encrypted;
    if (safeStorage.isEncryptionAvailable()) {
      encrypted = safeStorage.encryptString(json);
    } else {
      encrypted = Buffer.from(json, 'utf8');
    }

    await fs.writeFile(this.licenseFile, encrypted);
    return { ok: true, hwid };
  }

  /**
   * يقرأ ويفحص ترخيص الجهاز مع التحقق من التوقيع الرقمي وبصمة العتاد وصلاحية الأوفلاين
   * @param {object} [options]
   * @param {string} [options.currentHwid] تجاوز بصمة العتاد (داخلي للـ guard)؛ قيمتها null تعني عدم الربط الصارم بالعتاد (account mode).
   */
  async loadLicense(options = {}) {
    try {
      if (!fsSync.existsSync(this.licenseFile)) {
        return { active: false, reason: 'not_activated', hwid: this.licenseMode === 'account' ? null : getHardwareId() };
      }

      const clockCheck = await this.verifySystemClock();
      if (!clockCheck.valid) {
        return { active: false, reason: clockCheck.reason, hwid: this.licenseMode === 'account' ? null : getHardwareId() };
      }

      const encrypted = await fs.readFile(this.licenseFile);
      let jsonStr;
      if (safeStorage.isEncryptionAvailable()) {
        jsonStr = safeStorage.decryptString(encrypted);
      } else {
        jsonStr = encrypted.toString('utf8');
      }

      const license = JSON.parse(jsonStr);
      const currentHwid = options.currentHwid === undefined ? getHardwareId() : options.currentHwid;

      // فحص بصمة العتاد (Hardware ID check) لمنع الاستنساخ
      // - في وضع hardwa: صرامة كاملة، يجب أن تطابق بصمة العتاد الحالية.
      // - في وضع account: لا يُفرَض تطابق hwid؛ يكفي التوقيع الصالح والتاريخ.
      if (this.licenseMode === 'hardwa') {
        if (!license.hwid || license.hwid !== getHardwareId()) {
          return {
            active: false,
            reason: 'hardware_mismatch_cloned',
            message: 'ملف الترخيص مرتبط بجهاز آخر. استخدم نفس الجهاز أو أعد التفعيل.',
            hwid: getHardwareId(),
          };
        }
      }

      const cert = license.certificate || (license.payload && license.signature ? license : null);
      const certCheck = cert ? this.validator.validateCertificate(cert, currentHwid) : { valid: false, reason: 'no_signature', message: 'الترخيص غير موقع رقمياً.' };
      if (certCheck.valid) {
        return {
          active: true,
          license,
          hwid: this.licenseMode === 'hardwa' ? currentHwid : null,
        };
      }

      // If we have a cert and it failed validation, fail closed unless account mode
      // with no certificate at all where we just check signature presence
      if (cert) {
        return {
          active: false,
          reason: certCheck.reason,
          message: certCheck.message || 'فشل التحقق من توقيع الترخيص.',
          hwid: this.licenseMode === 'hardwa' ? currentHwid : null,
        };
      }

      // No cert/signature at all: in account mode allow via raw signature only
      if (this.licenseMode === 'account') {
        return {
          active: false,
          reason: 'missing_signature',
          message: 'الترخيص يفتقر إلى توقيع رقمي صالح.',
          hwid: null,
        };
      }

      return {
        active: false,
        reason: 'missing_signature',
        message: 'الترخيص يفتقر إلى توقيع رقمي صالح.',
        hwid: currentHwid,
      };
    } catch (err) {
      return { active: false, reason: 'corrupted_or_invalid', error: err.message, hwid: getHardwareId() };
    }
  }

  /**
   * تطبيق ترخيص أوفلاين موقع رقمياً (.lic)
   */
  async applyOfflineLicense(certificate) {
    let parsedCert = certificate;
    if (typeof certificate === 'string') {
      try {
        parsedCert = JSON.parse(certificate);
      } catch {
        return { ok: false, error: 'invalid_json', message: 'صيغة ملف الترخيص غير صالحة.' };
      }
    }

    const hwid = getHardwareId();
    const verification = this.validator.validateCertificate(parsedCert, hwid);
    if (!verification.valid) {
      return { ok: false, error: verification.reason, message: verification.message };
    }

    await this.saveLicense({
      certificate: parsedCert,
      licenseKey: verification.payload.licenseKey,
      tenantId: verification.payload.customerId,
      validUntil: verification.payload.validUntil,
      offlineLeaseExpiresAt: verification.payload.offlineLeaseExpiresAt,
      allowedModules: verification.payload.allowedModules,
      activatedAt: Date.now(),
      mode: 'offline',
    });

    return {
      ok: true,
      hwid,
      payload: verification.payload,
    };
  }

  /**
   * إنشاء طلب تفعيل أوفلاين للجهاز الحالي
   */
  exportOfflineRequest(customerInfo = {}) {
    return this.validator.generateOfflineActivationRequest(customerInfo);
  }

  /**
   * مسح الترخيص
   */
  async clearLicense() {
    try {
      if (fsSync.existsSync(this.licenseFile)) {
        await fs.unlink(this.licenseFile);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

function registerLicenseHandlers({ ipcMain, validateIpcSender, appDataDir }) {
  const guard = new LicenseGuard(appDataDir);

  ipcMain.handle('license:get-hwid', async (event) => {
    validateIpcSender(event);
    return getHardwareId();
  });

  ipcMain.handle('license:load', async (event) => {
    validateIpcSender(event);
    return guard.loadLicense();
  });

  ipcMain.handle('license:save', async (event, licensePayload) => {
    validateIpcSender(event);
    return guard.saveLicense(licensePayload);
  });

  ipcMain.handle('license:apply-offline', async (event, certificate) => {
    validateIpcSender(event);
    return guard.applyOfflineLicense(certificate);
  });

  ipcMain.handle('license:export-offline-request', async (event, customerInfo) => {
    validateIpcSender(event);
    return guard.exportOfflineRequest(customerInfo);
  });

  ipcMain.handle('license:clear', async (event) => {
    validateIpcSender(event);
    return guard.clearLicense();
  });
}

module.exports = {
  LicenseGuard,
  registerLicenseHandlers,
};
