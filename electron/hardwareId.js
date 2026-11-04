const { execSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');

let cachedHardwareId = null;

/**
 * يستخرج معرفاً عتادياً فريداً ومستقراً للجهاز (Hardware Fingerprint)
 * يجمع بين:
 * 1. Motherboard UUID (UUID اللوحة الأم)
 * 2. Processor ID (معرف المعالج)
 * 3. Baseboard Serial (الرقم التسلسلي للمذربورد)
 * 4. Disk Drive Serial (الرقم التسلسلي للقرص الصلب الأساسي)
 */
function getHardwareId() {
  if (cachedHardwareId) return cachedHardwareId;

  const parts = [];

  if (process.platform === 'win32') {
    try {
      // 1. Motherboard UUID
      const uuid = execSync('wmic csproduct get uuid /format:list', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
      const uuidMatch = uuid.match(/UUID=(.+)/i);
      if (uuidMatch && uuidMatch[1]) parts.push(uuidMatch[1].trim());
    } catch {
      try {
        const psUuid = execSync('powershell -NoProfile -Command "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID"', { encoding: 'utf8', timeout: 3000 });
        if (psUuid.trim()) parts.push(psUuid.trim());
      } catch { /* fallback */ }
    }

    try {
      // 2. BIOS / Motherboard Serial
      const bios = execSync('wmic bios get serialnumber /format:list', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
      const biosMatch = bios.match(/SerialNumber=(.+)/i);
      if (biosMatch && biosMatch[1] && !biosMatch[1].includes('Default string') && !biosMatch[1].includes('To be filled')) {
        parts.push(biosMatch[1].trim());
      }
    } catch { /* fallback */ }

    try {
      // 3. CPU Processor ID
      const cpu = execSync('wmic cpu get processorid /format:list', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
      const cpuMatch = cpu.match(/ProcessorId=(.+)/i);
      if (cpuMatch && cpuMatch[1]) parts.push(cpuMatch[1].trim());
    } catch { /* fallback */ }

    try {
      // 4. Primary Disk Serial
      const disk = execSync('wmic diskdrive get serialnumber /format:list', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
      const diskMatch = disk.match(/SerialNumber=(.+)/i);
      if (diskMatch && diskMatch[1]) parts.push(diskMatch[1].trim());
    } catch { /* fallback */ }
  } else if (process.platform === 'darwin') {
    try {
      const serial = execSync("ioreg -l | grep IOPlatformSerialNumber | awk '{print $4}'", { encoding: 'utf8', timeout: 3000 });
      if (serial.trim()) parts.push(serial.trim());
    } catch { /* fallback */ }
  } else {
    try {
      const machineId = execSync('cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
      if (machineId.trim()) parts.push(machineId.trim());
    } catch { /* fallback */ }
  }

  // في حال تعذر الحصول على بعض القيم العتادية، نضيف معلومات المعالج والمضيف كنواة ثانوية
  const cpus = os.cpus() || [];
  parts.push(cpus[0]?.model || 'unknown_model');
  parts.push(os.arch());
  parts.push(os.hostname());

  const rawFingerprint = parts.filter(Boolean).join('::');
  
  // توليد SHA-256 مشفر ومحدد التنسيق كبصمة عتاد ثابتة وفريدة: HWID-XXXX-XXXX-XXXX-XXXX
  const hash = crypto.createHash('sha256').update(`CERAMISYS_SALT_${rawFingerprint}`).digest('hex').toUpperCase();
  cachedHardwareId = `HWID-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`;
  return cachedHardwareId;
}

module.exports = {
  getHardwareId,
};

