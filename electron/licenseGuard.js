const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { safeStorage } = require('electron');
const { getHardwareId } = require('./hardwareId');

class LicenseGuard {
  constructor(appDataDir) {
    this.appDataDir = appDataDir;
    this.licenseFile = path.join(appDataDir, 'license.dat');
    this.timeCheckFile = path.join(appDataDir, '.sys_timestamp');
  }

  /**
   * يفحص ما إذا تم التلاعب بوقت النظام
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
   * يقرأ ويفحص ترخيص الجهاز
   */
  async loadLicense() {
    try {
      if (!fsSync.existsSync(this.licenseFile)) {
        return { active: false, reason: 'not_activated', hwid: getHardwareId() };
      }

      const clockCheck = await this.verifySystemClock();
      if (!clockCheck.valid) {
        return { active: false, reason: clockCheck.reason, hwid: getHardwareId() };
      }

      const encrypted = await fs.readFile(this.licenseFile);
      let jsonStr;
      if (safeStorage.isEncryptionAvailable()) {
        jsonStr = safeStorage.decryptString(encrypted);
      } else {
        jsonStr = encrypted.toString('utf8');
      }

      const license = JSON.parse(jsonStr);
      const currentHwid = getHardwareId();

      // فحص بصمة العتاد (Hardware ID check) لمنع الاستنساخ
      if (!license.hwid || license.hwid !== currentHwid) {
        return {
          active: false,
          reason: 'hardware_mismatch_cloned',
          currentHwid,
          boundHwid: license.hwid || null,
        };
      }

      return {
        active: true,
        license,
        hwid: currentHwid,
      };
    } catch (err) {
      return { active: false, reason: 'corrupted_or_invalid', error: err.message, hwid: getHardwareId() };
    }
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

  ipcMain.handle('license:clear', async (event) => {
    validateIpcSender(event);
    return guard.clearLicense();
  });
}

module.exports = {
  LicenseGuard,
  registerLicenseHandlers,
};

