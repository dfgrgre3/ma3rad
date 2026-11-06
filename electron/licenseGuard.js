const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { randomBytes } = require('node:crypto');
const { safeStorage } = require('electron');
const { getHardwareId } = require('./hardwareId');
const { LicenseValidator } = require('./security/licenseValidator');
const safeStorageCompat = require('./safeStorageCompat');

class LicenseGuard {
  constructor(appDataDir, options = {}) {
    this.appDataDir = appDataDir;
    this.licenseFile = path.join(appDataDir, 'license.dat');
    this.licenseModeFile = path.join(appDataDir, 'license-mode.enc');
    this.timeCheckFile = path.join(appDataDir, '.sys_timestamp');
    this.validator = new LicenseValidator(options);
    // License mode is resolved by electron/main.js and passed in here so the
    // guard never touches process.env directly. "account"=slot bound to the
    // licensed account+credential, "hardwa"=existing per-device binding.
    this.licenseMode = String(options.licenseMode || 'hardwa').trim().toLowerCase();
    this.licenseMode = this.licenseMode === 'account' ? 'account' : 'hardwa';
  }

  async loadStoredLicenseMode() {
    let encrypted;
    try {
      encrypted = await fs.readFile(this.licenseModeFile);
    } catch (error) {
      if (error.code === 'ENOENT') return this.licenseMode;
      throw error;
    }
    if (!(await safeStorageCompat.isEncryptionAvailable(safeStorage))) {
      throw new Error('OS secure storage is unavailable for the license mode.');
    }
    const storedMode = (await safeStorageCompat.decryptString(safeStorage, encrypted)).trim().toLowerCase();
    if (storedMode !== 'account' && storedMode !== 'hardwa') {
      throw new Error('The saved license mode is invalid.');
    }
    this.licenseMode = storedMode;
    return this.licenseMode;
  }

  async setLicenseMode(mode) {
    if (mode !== 'account' && mode !== 'hardwa') {
      throw new Error('Invalid license mode.');
    }
    if (!(await safeStorageCompat.isEncryptionAvailable(safeStorage))) {
      throw new Error('OS secure storage is unavailable; the license mode was not changed.');
    }
    const encrypted = await safeStorageCompat.encryptString(safeStorage, mode);
    await fs.mkdir(this.appDataDir, { recursive: true });
    const temporaryPath = `${this.licenseModeFile}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      await fs.writeFile(temporaryPath, encrypted, { mode: 0o600, flag: 'wx' });
      await fs.rename(temporaryPath, this.licenseModeFile);
    } catch (error) {
      try { await fs.unlink(temporaryPath); } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          throw new Error(`Could not clean up the temporary license mode: ${cleanupError.message || cleanupError}`);
        }
      }
      throw error;
    }
    this.licenseMode = mode;
    return mode;
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
      if (!(await safeStorageCompat.isEncryptionAvailable(safeStorage))) {
        return { valid: false, reason: 'secure_storage_unavailable' };
      }
      const now = Date.now();
      if (fsSync.existsSync(this.timeCheckFile)) {
        const encrypted = await fs.readFile(this.timeCheckFile);
        let lastTime = 0;
        lastTime = Number(await safeStorageCompat.decryptString(safeStorage, encrypted));
        if (!Number.isFinite(lastTime) || lastTime <= 0) {
          return { valid: false, reason: 'invalid_clock_record' };
        }

        // إذا كان الوقت الحالي أقل من آخر وقت مسجل بأكثر من 15 دقيقة (Clock rollback)
        if (now < lastTime - (15 * 60 * 1000)) {
          return { valid: false, reason: 'clock_rollback_detected' };
        }
      }

      // تحديث آخر وقت مسجل
      const timeStr = String(now);
      let dataToSave;
      dataToSave = await safeStorageCompat.encryptString(safeStorage, timeStr);
      await fs.writeFile(this.timeCheckFile, dataToSave);

      return { valid: true };
    } catch {
      return { valid: false, reason: 'clock_check_failed' };
    }
  }

  /**
   * يحفظ بيانات الترخيص المشفرة ويربطها ببصمة العتاد الحالية
   */
  async saveLicense(licensePayload) {
    const hwid = getHardwareId();
    const certificate = licensePayload?.certificate ||
      (licensePayload?.payload && licensePayload?.signature ? licensePayload : null);
    if (!certificate) {
      return { ok: false, error: 'missing_signature', message: 'لا يمكن حفظ بيانات ترخيص غير موقعة.' };
    }
    const verification = this.validator.validateCertificate(
      certificate,
      this.licenseMode === 'account' ? null : hwid,
      { bindingMode: this.licenseMode },
    );
    if (!verification.valid) {
      return { ok: false, error: verification.reason, message: verification.message };
    }

    const boundData = {
      ...licensePayload,
      hwid: this.licenseMode === 'account' ? null : hwid,
      savedAt: Date.now(),
    };

    const json = JSON.stringify(boundData);
    if (!(await safeStorageCompat.isEncryptionAvailable(safeStorage))) {
      return { ok: false, error: 'secure_storage_unavailable', message: 'لا يمكن حفظ الترخيص لأن التخزين الآمن للنظام غير متاح.' };
    }
    const encrypted = await safeStorageCompat.encryptString(safeStorage, json);
    const temporaryPath = `${this.licenseFile}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      await fs.writeFile(temporaryPath, encrypted, { mode: 0o600, flag: 'wx' });
      await fs.rename(temporaryPath, this.licenseFile);
    } catch (error) {
      try { await fs.unlink(temporaryPath); } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          throw new Error(`Could not clean up the temporary license: ${cleanupError.message || cleanupError}`);
        }
      }
      throw error;
    }
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
      if (!(await safeStorageCompat.isEncryptionAvailable(safeStorage))) {
        return { active: false, reason: 'secure_storage_unavailable', hwid: this.licenseMode === 'account' ? null : getHardwareId() };
      }
      jsonStr = await safeStorageCompat.decryptString(safeStorage, encrypted);

      const license = JSON.parse(jsonStr);
      const currentHwid = this.licenseMode === 'account'
        ? null
        : (options.currentHwid === undefined ? getHardwareId() : options.currentHwid);

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
      const certCheck = cert ? this.validator.validateCertificate(cert, currentHwid, { bindingMode: this.licenseMode }) : { valid: false, reason: 'no_signature', message: 'الترخيص غير موقع رقمياً.' };
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

    const hwid = this.licenseMode === 'account' ? null : getHardwareId();
    const verification = this.validator.validateCertificate(parsedCert, hwid, { bindingMode: this.licenseMode });
    if (!verification.valid) {
      return { ok: false, error: verification.reason, message: verification.message };
    }

    const saved = await this.saveLicense({
      certificate: parsedCert,
      licenseKey: verification.payload.licenseKey,
      tenantId: verification.payload.customerId,
      validUntil: verification.payload.validUntil,
      offlineLeaseExpiresAt: verification.payload.offlineLeaseExpiresAt,
      allowedModules: verification.payload.allowedModules,
      activatedAt: Date.now(),
      mode: 'offline',
    });
    if (!saved.ok) return saved;

    const reloaded = await this.loadLicense();
    if (!reloaded.active) {
      return {
        ok: false,
        error: reloaded.reason || 'license_reload_failed',
        message: reloaded.message || 'تعذر التحقق من الترخيص بعد حفظه.',
      };
    }

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
    return this.validator.generateOfflineActivationRequest(customerInfo, this.licenseMode);
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

function registerLicenseHandlers({
  ipcMain,
  validateIpcSender,
  appDataDir,
  licenseMode,
  authorizeLicenseModeChange = async () => false,
}) {
  const guard = new LicenseGuard(appDataDir, { licenseMode });

  ipcMain.handle('license:get-hwid', async (event) => {
    validateIpcSender(event);
    return getHardwareId();
  });

  ipcMain.handle('license-mode:get', (event) => {
    validateIpcSender(event);
    return guard.licenseMode;
  });

  ipcMain.handle('license-mode:set', async (event, request) => {
    validateIpcSender(event);
    if (!request || typeof request !== 'object' ||
        !(await authorizeLicenseModeChange(request.username, request.password))) {
      throw new Error('You are not authorized to change the license mode.');
    }
    return { ok: true, mode: await guard.setLicenseMode(request.mode) };
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

  return guard;
}

module.exports = {
  LicenseGuard,
  registerLicenseHandlers,
};
