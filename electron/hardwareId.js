const { execSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const fs = require('node:fs');
const path = require('node:path');

let cachedHardwareId = null;
// وعد معلّق لضمان عدم تكرار حوسبة الـ HWID بشكل متزامن
let pendingHwidComputation = null;

// مسار ملف تخزين الـ HWID المحسوب مسبقاً – يُعيَّن من main.js
let hwidCacheFilePath = null;

/**
 * يضبط مسار ملف cache للـ HWID ليقرأ منه عند بدء التشغيل
 * ويكتب النتيجة إليه بعد الحساب.
 * @param {string} appDataDir – مجلد بيانات التطبيق (APP_DATA_DIR)
 */
function configureHwidCache(appDataDir) {
  hwidCacheFilePath = path.join(appDataDir, '.hwid_cache');
}

/**
 * يستخرج معرفاً عتادياً فريداً ومستقراً للجهاز (Hardware Fingerprint)
 * يجمع بين:
 * 1. Motherboard UUID (UUID اللوحة الأم) – عبر Get-CimInstance (أسرع من wmic)
 * 2. BIOS Serial (الرقم التسلسلي للـ BIOS)
 * 3. Disk Drive Serial (الرقم التسلسلي للقرص الصلب الأساسي)
 * 4. CPU Processor ID (معرف المعالج) – fallback فقط إن لم تتوفر البيانات أعلاه
 *
 * ملاحظة: wmic.exe تم إيقافه في Windows 11+ وكان بطيئاً جداً؛
 * نستخدم PowerShell CIM الذي يُرجع النتيجة بشكل أسرع بكثير.
 */
function computeHardwareId(options = {}) {
  const platform = options.platform || process.platform;
  const executeCommand = options.execSync || execSync;
  const readFile = options.readFileSync || fs.readFileSync;
  const cpuInfo = options.cpus || os.cpus() || [];
  const architecture = options.arch || os.arch();
  const parts = [];

  if (platform === 'win32') {
    // ── UUID اللوحة الأم ──────────────────────────────────────────────────
    // نجرّب PowerShell CIM أولاً (أسرع من wmic)؛ ثم wmic كـ fallback.
    try {
      const psUuid = executeCommand(
        'powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }
      );
      if (psUuid && psUuid.trim() && psUuid.trim() !== 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF') {
        parts.push(psUuid.trim());
      }
    } catch {
      try {
        const uuid = executeCommand(
          'wmic csproduct get uuid /format:list',
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }
        );
        const uuidMatch = uuid.match(/UUID=(.+)/i);
        if (uuidMatch && uuidMatch[1]) parts.push(uuidMatch[1].trim());
      } catch { /* لا يوجد UUID للوحة الأم */ }
    }

    // ── الرقم التسلسلي للـ BIOS ───────────────────────────────────────────
    try {
      const psBios = executeCommand(
        'powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_BIOS).SerialNumber"',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }
      );
      const biosSerial = psBios && psBios.trim();
      if (biosSerial &&
          !/^(default string|to be filled|none|unknown)$/i.test(biosSerial)) {
        parts.push(biosSerial);
      }
    } catch {
      try {
        const bios = executeCommand(
          'wmic bios get serialnumber /format:list',
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }
        );
        const biosMatch = bios.match(/SerialNumber=(.+)/i);
        if (biosMatch && biosMatch[1] &&
            !biosMatch[1].includes('Default string') &&
            !biosMatch[1].includes('To be filled')) {
          parts.push(biosMatch[1].trim());
        }
      } catch { /* fallback */ }
    }

    // ── الرقم التسلسلي للقرص الصلب ────────────────────────────────────────
    try {
      const psDisk = executeCommand(
        'powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_DiskDrive | Select-Object -First 1).SerialNumber"',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }
      );
      if (psDisk && psDisk.trim()) parts.push(psDisk.trim());
    } catch {
      try {
        const disk = executeCommand(
          'wmic diskdrive get serialnumber /format:list',
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }
        );
        const diskMatch = disk.match(/SerialNumber=(.+)/i);
        if (diskMatch && diskMatch[1]) parts.push(diskMatch[1].trim());
      } catch { /* fallback */ }
    }

    // ── CPU Processor ID – يُستخدم كـ LAST RESORT فقط لأنه بطيء جداً ──────
    // يُستدعى فقط إن لم نجمع أي معرّف حتى الآن.
    if (parts.length === 0) {
      try {
        const psCpu = executeCommand(
          'powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_Processor | Select-Object -First 1).ProcessorId"',
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 6000 }
        );
        if (psCpu && psCpu.trim()) parts.push(psCpu.trim());
      } catch {
        try {
          const cpu = executeCommand(
            'wmic cpu get processorid /format:list',
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }
          );
          const cpuMatch = cpu.match(/ProcessorId=(.+)/i);
          if (cpuMatch && cpuMatch[1]) parts.push(cpuMatch[1].trim());
        } catch { /* fallback */ }
      }
    }
  } else if (platform === 'darwin') {
    try {
      const serial = executeCommand(
        "ioreg -l | grep IOPlatformSerialNumber | awk '{print $4}'",
        { encoding: 'utf8', timeout: 3000 }
      );
      if (serial.trim()) parts.push(serial.trim());
    } catch { /* fallback */ }
  } else {
    for (const identifierPath of [
      '/sys/class/dmi/id/product_uuid',
      '/sys/class/dmi/id/board_serial',
    ]) {
      try {
        const identifier = readFile(identifierPath, 'utf8').trim();
        if (identifier && !/^(unknown|none|default string|to be filled by o\.e\.m\.)$/i.test(identifier)) {
          parts.push(identifier);
        }
      } catch { /* try the next stable identifier */ }
    }
    try {
      const machineId = executeCommand(
        'cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null',
        { encoding: 'utf8', timeout: 3000 }
      );
      if (machineId.trim()) parts.push(machineId.trim());
    } catch { /* fallback */ }
  }

  // Hostname and CPU details are not part of an established hardware identity.
  // Use them only when the operating system exposes no stronger stable identifier.
  const rawFingerprint = parts.find((part) => typeof part === 'string' && part.trim())
    || `${cpuInfo[0]?.model || 'unknown_model'}::${architecture}`;
  
  // توليد SHA-256 مشفر ومحدد التنسيق كبصمة عتاد ثابتة وفريدة: HWID-XXXX-XXXX-XXXX-XXXX
  const hash = crypto.createHash('sha256').update(`CERAMISYS_SALT_${rawFingerprint}`).digest('hex').toUpperCase();
  return `HWID-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`;
}

/**
 * يُرجع الـ HWID المخزّن مؤقتاً في الذاكرة (أو من ملف الـ cache إن وُجد)
 * دون أي استدعاء لأوامر النظام. يُستخدم بعد اكتمال `warmUpHardwareId()`.
 * إذا لم يُحسب الـ HWID بعد، يستدعي `computeHardwareId()` بشكل متزامن
 * (سيكون بطيئاً فقط في أول مرة حقيقية).
 */
function getHardwareId() {
  if (cachedHardwareId) return cachedHardwareId;

  // حاول قراءة قيمة مخزّنة من ملف الـ cache (تكتبه warmUpHardwareId)
  if (hwidCacheFilePath) {
    try {
      const cached = fs.readFileSync(hwidCacheFilePath, 'utf8').trim();
      if (/^HWID-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(cached)) {
        cachedHardwareId = cached;
        return cachedHardwareId;
      }
    } catch { /* لا يوجد cache بعد */ }
  }

  // آخر ملجأ: حساب متزامن (يحدث فقط إذا لم تُستدعَ warmUpHardwareId)
  cachedHardwareId = computeHardwareId();
  _persistHwidCache(cachedHardwareId);
  return cachedHardwareId;
}

/**
 * يُشغَّل في الخلفية مبكراً (من app.whenReady) لحساب الـ HWID بشكل
 * غير متزامن وتخزينه. يمنع تجميد Main Process عند أول استدعاء `getHardwareId()`.
 * @returns {Promise<string>}
 */
async function warmUpHardwareId() {
  if (cachedHardwareId) return cachedHardwareId;
  if (pendingHwidComputation) return pendingHwidComputation;

  // قراءة الـ cache من القرص أولاً – إذا كان موجوداً فلا داعي لأوامر النظام
  if (hwidCacheFilePath) {
    try {
      const cached = fs.readFileSync(hwidCacheFilePath, 'utf8').trim();
      if (/^HWID-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(cached)) {
        cachedHardwareId = cached;
        console.info('[hwid] Loaded hardware ID from cache.');
        return cachedHardwareId;
      }
    } catch { /* لا يوجد cache بعد، سنحسبه */ }
  }

  pendingHwidComputation = new Promise((resolve) => {
    // نُشغّل الحساب في setImmediate لإعطاء الأولوية لبقية إقلاع Electron
    setImmediate(() => {
      try {
        const hwid = computeHardwareId();
        cachedHardwareId = hwid;
        _persistHwidCache(hwid);
        console.info('[hwid] Hardware ID computed and cached:', hwid);
        resolve(hwid);
      } catch (err) {
        console.warn('[hwid] Hardware ID computation failed:', err);
        const fallback = `HWID-FAIL-${crypto.randomBytes(2).toString('hex').toUpperCase()}-0000-0000`;
        cachedHardwareId = fallback;
        resolve(fallback);
      } finally {
        pendingHwidComputation = null;
      }
    });
  });

  return pendingHwidComputation;
}

/** يكتب الـ HWID في ملف cache – يتجاهل الأخطاء بصمت. */
function _persistHwidCache(hwid) {
  if (!hwidCacheFilePath) return;
  try { fs.writeFileSync(hwidCacheFilePath, hwid, 'utf8'); } catch { /* disk write failed */ }
}

/** يحذف ملف cache الـ HWID (لإجبار إعادة الحساب عند التحقق من تغيّر العتاد). */
function invalidateHwidCache() {
  cachedHardwareId = null;
  if (hwidCacheFilePath) {
    try { fs.unlinkSync(hwidCacheFilePath); } catch { /* already gone */ }
  }
}

module.exports = {
  computeHardwareId,
  getHardwareId,
  warmUpHardwareId,
  configureHwidCache,
  invalidateHwidCache,
};
