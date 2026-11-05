/**
 * استراتيجية Nسخ الاحتياطي 3-2-1
 * 3 نسخ - 2 وسيط تخزين - 1 نسخة خارجية
 */

const path = require('path');
const fs = require('fs/promises');
const fsSync = require('node:fs');
const crypto = require('node:crypto');
const { execFile } = require('child_process');

/**
 * تحقق من حالة النسخ الاحتياطية المحلية والحوم 2:
 * - النسخة الحية (当前的database)
 * - نسخة يومية محفوظة 7 أيام
 * - نسخة أسبوعية محفوظة 4 أسابيع
 * - نسخة شهرية محفوظة 12 شهر
 */
async function analyzeBackupStrategy({ BACKUP_DIR }) {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const pattern = /^ceramisys_/;

    // تصفية الملفات ذات الصلة
    const backupFiles = files.filter(f => pattern.test(f) && f.endsWith('.sqlite.enc'));

    const analyzed = {
      local: [],
      daily: [],
      weekly: [],
      monthly: [],
      external: [],
      recovery: [],
      oldest: null,
      newest: null
    };

    for (const file of backupFiles) {
      const filePath = path.join(BACKUP_DIR, file);
      const stat = await fs.stat(filePath);
      const date = stat.birthtime; // or mtime

      const fileInfo = {
        name: file,
        path: filePath,
        size: stat.size,
        timestamp: date.toISOString(),
        readTimestamp: date,
        type: 'local',
        isRecent: false,
        isOldest: false,
        isNewest: false
      };

      // تحديد نوع النسخة تلقائيا
      if (file.includes('daily')) {
        fileInfo.type = 'daily';
      } else if (file.includes('weekly')) {
        fileInfo.type = 'weekly';
      } else if (file.includes('monthly')) {
        fileInfo.type = 'monthly';
      } else if (file.includes('corrupt') || file.includes('replaced')) {
        fileInfo.type = 'recovery';
      }

      analyzed[fileInfo.type].push(fileInfo);

      if (!analyzed.oldest || fileInfo.timestamp < analyzed.oldest.timestamp) {
        analyzed.oldest = fileInfo;
      }
      if (!analyzed.newest || fileInfo.timestamp > analyzed.newest.timestamp) {
        analyzed.newest = fileInfo;
      }
    }

    // تنظيم الوقت
    for (const type of ['local', 'daily', 'weekly', 'monthly', 'recovery']) {
      analyzed[type].sort((a, b) => b.readTimestamp - a.readTimestamp);
    }

    // تطبيق الاستراتيجيات:
    // daily: keep 7 days
    // weekly: keep 4 weeks
    // monthly: keep 12 months
    // Keep complete lists so cleanup and statistics can detect excess files.

    // إعادة ترتيب وتراص
    analyzed.daily.slice(0, 7).forEach(f => f.isRecent = true);
    analyzed.weekly.slice(0, 4).forEach(f => f.isRecent = true);
    analyzed.monthly.slice(0, 12).forEach(f => f.isRecent = true);

    // رقم أحدث نسخة لفظية
    if (analyzed.newest) {
      analyzed.newest.isNewest = true;
    }
    if (analyzed.oldest) {
      analyzed.oldest.isOldest = true;
    }

    return analyzed;
  } catch (error) {
    console.error('تحليل استراتيجية النسخ الاحتياطي فاشلة:', error);
    throw error;
  }
}

/**
 * تطبيق استراتيجية 3-2-1
 * 3 نسخ: حالية + 2 محلية
 * - استخدام وسيطين تخزين: القرص المحلي + USB (اختياري)
 * - نسخة خارجية: (اختياري) مخزنة خارج الموقع
 */
async function apply321Strategy({
  BACKUP_DIR,
  backupPath,
  offsiteBackupDir,
  fsImpl = fs,
  checkExternalDriveImpl = checkExternalDrive,
  verifyRestoreImpl,
}, backupType = 'full') {
  const strategy = {
    correctType: backupType,
    actions: [],
    recommendations: []
  };

  let usbVolume = null;
  let driveCheckError = null;
  try {
    usbVolume = await checkExternalDriveImpl();
  } catch (error) {
    driveCheckError = error;
  }
  if (!usbVolume) {
    strategy.actions.push({
      type: 'external',
      target: null,
      status: driveCheckError ? 'failed' : 'unavailable',
      description: driveCheckError
        ? `تعذر فحص وحدات USB: ${driveCheckError.message || driveCheckError}`
        : 'لم يتم العثور على قرص USB قابل للإزالة؛ النسخة الخارجية غير متاحة.'
    });
    strategy.recommendations.push({
      type: 'external',
      action: driveCheckError
        ? 'تحقق من إمكانية فحص وحدات USB ثم أعد محاولة النسخ.'
        : 'وصّل قرص USB لإنشاء نسخة خارجية.'
    });
  } else {
    try {
      if (typeof backupPath !== 'string' || !backupPath) {
        throw new Error('مسار النسخة المحلية المطلوبة للنسخ الخارجي غير محدد.');
      }
      await fsImpl.stat(backupPath);
      const destinationDirectory = path.join(usbVolume, 'CeramiSys', 'Backups');
      await fsImpl.mkdir(destinationDirectory, { recursive: true });
      const destination = path.join(destinationDirectory, path.basename(backupPath));
      await fsImpl.copyFile(backupPath, destination, fsImpl.constants.COPYFILE_EXCL);
      const [sourceHash, destinationHash] = await Promise.all([
        sha256File(backupPath),
        sha256File(destination),
      ]);
      if (destinationHash !== sourceHash) {
        await fsImpl.unlink(destination);
        throw new Error('محتوى النسخة على قرص USB لا يطابق النسخة المحلية (SHA-256).');
      }
      strategy.actions.push({
        type: 'external',
        target: destination,
        status: 'complete',
        description: `تم حفظ نسخة خارجية على USB: ${destination}`
      });
    } catch (error) {
      strategy.actions.push({
        type: 'external',
        target: usbVolume,
        status: 'failed',
        description: `تعذر حفظ النسخة على USB: ${error.message || error}`
      });
      strategy.recommendations.push({
        type: 'external',
        action: 'تحقق من مساحة قرص USB وصلاحيته ثم أعد النسخ الاحتياطي.'
      });
    }
  }

  if (!offsiteBackupDir) {
    strategy.actions.push({
      type: 'offsite',
      target: null,
      status: 'unavailable',
      description: 'لم يتم إعداد وجهة شبكة خارج الموقع.'
    });
    strategy.recommendations.push({
      type: 'offsite',
      action: 'أدخل مسار مشاركة شبكة مستقلة عن موقع الجهاز في إعدادات النسخ الاحتياطي.'
    });
  } else {
    let destination;
    let destinationCreated = false;
    try {
      if (typeof backupPath !== 'string' || !backupPath) {
        throw new Error('مسار النسخة المحلية المطلوبة للنسخ الخارجي غير محدد.');
      }
      await fsImpl.stat(backupPath);
      await fsImpl.mkdir(offsiteBackupDir, { recursive: true });
      destination = path.join(offsiteBackupDir, path.basename(backupPath));
      await fsImpl.copyFile(backupPath, destination, fsImpl.constants.COPYFILE_EXCL);
      destinationCreated = true;
      const [sourceHash, destinationHash] = await Promise.all([
        sha256File(backupPath),
        sha256File(destination),
      ]);
      if (destinationHash !== sourceHash) {
        await fsImpl.unlink(destination);
        destinationCreated = false;
        throw new Error('محتوى النسخة على وجهة الشبكة لا يطابق النسخة المحلية (SHA-256).');
      }
      if (typeof verifyRestoreImpl !== 'function') {
        throw new Error('اختبار الاستعادة من الوجهة الخارجية غير مُعد.');
      }
      await verifyRestoreImpl(destination);
      strategy.actions.push({
        type: 'offsite',
        target: destination,
        status: 'complete',
        description: `تم نسخ النسخة إلى الوجهة الخارجية واجتازت اختبار الاستعادة: ${destination}`
      });
    } catch (error) {
      let description = `تعذر حفظ النسخة أو التحقق من استعادتها من الوجهة الخارجية: ${error.message || error}`;
      if (destinationCreated) {
        try {
          await fsImpl.unlink(destination);
        } catch (cleanupError) {
          description += ` تعذر حذف النسخة غير المتحقق منها: ${cleanupError.message || cleanupError}`;
        }
      }
      strategy.actions.push({
        type: 'offsite',
        target: offsiteBackupDir,
        status: 'failed',
        description
      });
      strategy.recommendations.push({
        type: 'offsite',
        action: 'تحقق من اتصال مشاركة الشبكة وصلاحياتها ثم أعد النسخ الاحتياطي.'
      });
    }
  }

  // تنظيف النسخة القديمة
  if (backupType === 'full') {
    await cleanupOldBackups({ BACKUP_DIR }, { daily: 7, weekly: 4, monthly: 12 });
  }

  return strategy;
}

/**
 * فحص وجود USB متوفر
 */
async function checkExternalDrive({
  platform = process.platform,
  execFileImpl = execFile,
  fsImpl = fsSync,
} = {}) {
  if (platform === 'darwin') {
    for (const volume of fsImpl.readdirSync('/Volumes')) {
      const mountPath = path.posix.join('/Volumes', volume);
      const info = await runExternalDriveCommand(
        execFileImpl,
        'diskutil',
        ['info', '-plist', mountPath],
        null
      );
      if (info && /<key>DeviceLocation<\/key>\s*<string>External<\/string>/.test(info)) {
        return info.match(/<key>MountPoint<\/key>\s*<string>([^<]+)<\/string>/)?.[1]?.trim() || null;
      }
    }
    return null;
  }
  if (platform === 'linux') {
    return runExternalDriveCommand(execFileImpl, 'lsblk', ['-nrpo', 'MOUNTPOINT,RM'], /^(.+)\s+1$/m);
  }
  if (platform !== 'win32') return null;
  try {
    // томаيز في ويندوز
    // يوجد طريق لفحص الأقراص الخارجية المتاحة
    const result = await new Promise((resolve, reject) => {
      // هذا يتم تنفيذها على Windows
      execFileImpl('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Volume | Where-Object {$_.DriveType -eq "Removable"} | Select-Object -ExpandProperty DriveLetter'], (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        // استخراج الحروف
        const driveLetter = String(stdout).split(/\r?\n/).map((letter) => letter.trim())
          .find((letter) => /^[A-Za-z]$/.test(letter));
        resolve(driveLetter ? `${driveLetter.toUpperCase()}:\\` : null);
      });
    });
    return result;
  } catch (error) {
    console.error('فحص USB فاشلة:', error);
    throw error;
  }
}

function runExternalDriveCommand(execFileImpl, command, args, matcher) {
  return new Promise((resolve, reject) => {
    execFileImpl(command, args, (error, stdout) => {
      if (error) return reject(error);
      const output = String(stdout);
      resolve(matcher ? (output.match(matcher)?.[1]?.trim() || null) : output);
    });
  });
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fsSync.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

/**
 * تنظيف النسخ القديمة
 */
async function cleanupOldBackups({ BACKUP_DIR }, retention) {
  const analyzed = await analyzeBackupStrategy({ BACKUP_DIR });

  const cleanupPairs = [];
  if (analyzed.daily.length > retention.daily) {
    for (const file of analyzed.daily.slice(retention.daily)) {
      cleanupPairs.push(file.path);
    }
  }
  if (analyzed.weekly.length > retention.weekly) {
    for (const file of analyzed.weekly.slice(retention.weekly)) {
      cleanupPairs.push(file.path);
    }
  }
  if (analyzed.monthly.length > retention.monthly) {
    for (const file of analyzed.monthly.slice(retention.monthly)) {
      cleanupPairs.push(file.path);
    }
  }
  const localRecoveryPolicy = { maxCount: 50, retentionDays: 90 };
  for (const type of ['local', 'recovery']) {
    const policy = { ...localRecoveryPolicy, ...(retention[type] || {}) };
    const cutoff = Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000;
    for (const [index, file] of analyzed[type].entries()) {
      if (index >= policy.maxCount || file.readTimestamp.getTime() < cutoff) {
        cleanupPairs.push(file.path);
      }
    }
  }

  // حذف الملفات
  for (const filePath of cleanupPairs) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error(`فشل حذف النسخة الاحتياطية: ${filePath}`, error);
    }
  }

  return cleanupPairs.length;
}

/**
 * الحصول على إحصائيات استراتيجية النسخ الاحتياطية
 */
async function getBackupStrategyStats({ BACKUP_DIR }) {
  const analyzed = await analyzeBackupStrategy({ BACKUP_DIR });

  // حساب الحجم الكلي
  const backupTypes = ['local', 'daily', 'weekly', 'monthly', 'recovery'];
  const allBackups = backupTypes.flatMap((type) => analyzed[type]);
  const totalSize = allBackups.reduce((sum, file) => sum + file.size, 0);

  return {
    strategies: analyzed,
    totalBackups: allBackups.length,
    totalSizeBytes: totalSize,
    recommendations: generateRecommendations(analyzed)
  };
}

function generateRecommendations(analyzed) {
  const recoms = [];

  if (analyzed.daily.length < 4) {
    recoms.push({
      type: 'info',
      message: 'عدد النسخ اليومية أقل من الحد الأدنى الموصى به.',
      action: 'إنشاء نسخ يومية إضافية'
    });
  }

  if (analyzed.weekly.length < 2) {
    recoms.push({
      type: 'info',
      message: 'عدد النسخ الأسبوعية أقل من الحد الأدنى الموصى به.',
      action: 'إنشاء نسخ أسبوعية إضافية'
    });
  }

  if (analyzed.monthly.length < 6) {
    recoms.push({
      type: 'info',
      message: 'عدد النسخ الشهرية أقل من الحد الأدنى الموصى به.',
      action: 'إنشاء نسخ شهرية إضافية'
    });
  }

  if (!analyzed.oldest) {
    recoms.push({
      type: 'warning',
      message: 'لا توجد نسخ احتياطية قديمة.',
      action: 'بدء استراتيجية النسخ الاحتياطي'
    });
  }

  if (analyzed.newest && analyzed.newest.isRecent) {
    // OK
  } else if (analyzed.newest) {
    recoms.push({
      type: 'info',
      message: 'آخر نسخة احتياطية قديمة.',
      action: 'إنشاء نسخة احتياطية جديدة'
    });
  }

  return recoms;
}

module.exports = {
  analyzeBackupStrategy,
  apply321Strategy,
  checkExternalDrive,
  cleanupOldBackups,
  getBackupStrategyStats
};
