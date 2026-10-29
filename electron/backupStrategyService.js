/**
 * استراتيجية Nسخ الاحتياطي 3-2-1
 * 3 نسخ - 2 وسيط تخزين - 1 نسخة خارجية
 */

const path = require('path');
const fs = require('fs/promises');
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
        type: 'unknown',
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
    analyzed.daily.sort((a, b) => b.readTimestamp - a.readTimestamp);
    analyzed.weekly.sort((a, b) => b.readTimestamp - a.readTimestamp);
    analyzed.monthly.sort((a, b) => b.readTimestamp - a.readTimestamp);

    // تطبيق الاستراتيجيات:
    // daily: keep 7 days
    // weekly: keep 4 weeks
    // monthly: keep 12 months
    analyzed.daily = analyzed.daily.slice(0, 7);
    analyzed.weekly = analyzed.weekly.slice(0, 4);
    analyzed.monthly = analyzed.monthly.slice(0, 12);

    // إعادة ترتيب وتراص
    analyzed.daily.forEach(f => f.isRecent = true);
    analyzed.weekly.forEach(f => f.isRecent = true);
    analyzed.monthly.forEach(f => f.isRecent = true);

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
async function apply321Strategy({ BACKUP_DIR, DATA_DIR, APP_DATA_DIR }, backupType = 'full') {
  const strategy = {
    correctType: backupType,
    actions: [],
    recommendations: []
  };

  // تحقق من وجود مساحة تخزين
  // 1. النسخة الحية (الantoDB) - موجودة
  // 2. النسخة المحلية -_BACKUP_DIR
  // 3. النسخة الخارجية - من USB

  // إذا كان USB متصلًا، قم بإنشاء نسخة عليه
  const usbVolume = await checkExternalDrive();
  if (usbVolume) {
    strategy.actions.push({
      type: 'external',
      target: usbVolume,
      status: 'pending',
      description: `سيتم حفظ نسخة احتياطية على USB: ${usbVolume}`
    });

    strategy.recommendations.push({
      type: 'git',
      action: 'Send to remote (if available)'
    });
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
async function checkExternalDrive() {
  try {
    // томаيز في ويندوز
    // يوجد طريق لفحص الأقراص الخارجية المتاحة
    const fs = require('fs');
    const result = await new Promise((resolve) => {
      // هذا يتم تنفيذها على Windows
      execFile('powershell', ['-Command', 'Get-Volume | Where-Object {$_.DriveType -eq "Removable"} | Select-Object –ExpandProperty DriveLetter'], (error, stdout, stderr) => {
        if (error) {
          resolve(null);
          return;
        }
        // استخراج الحروف
        const letters = stdout.trim().split('\n').filter(l => l.length === 1);
        resolve(letters.length > 0 ? `E:\\external_backups\\` : null);
      });
    });
    return result;
  } catch (error) {
    console.error('فحص USB فاشلة:', error);
    return null;
  }
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
  const totalSize = analyzed.daily.reduce((sum, f) => sum + f.size, 0) +
                    analyzed.weekly.reduce((sum, f) => sum + f.size, 0) +
                    analyzed.monthly.reduce((sum, f) => sum + f.size, 0);

  return {
    strategies: analyzed,
    totalBackups: analyzed.daily.length + analyzed.weekly.length + analyzed.monthly.length,
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
