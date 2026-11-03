const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '../electron');

// قائمة الملفات التي يجب حذف نسختها النصية .js إذا وُجدت نسخة .jsc المترجمة
const compiledFiles = [
  'main',
  'licenseGuard',
  'hardwareId',
  'security',
  'databaseHandlers',
  'appHandlers',
  'centralApi',
  'documentHandlers',
  'printing',
  'syncClientConfig',
  'syncRelay',
  'gracefulShutdown',
];

console.log('🛡️ Cleaning plain JS files to keep only compiled V8 bytecode in release bundle...');

for (const name of compiledFiles) {
  const jsc = path.join(electronDir, `${name}.jsc`);
  const js = path.join(electronDir, `${name}.js`);
  const backupJs = path.join(electronDir, `${name}.js.bak`);

  if (fs.existsSync(jsc) && fs.existsSync(js)) {
    // نأخذ نسخة احتياطية .bak حتى لا نفقد الكود أثناء التطوير
    fs.copyFileSync(js, backupJs);
    // إفراغ أو إزالة محتوى ملف الـ js بحيث لا يحتوي على أي كود أصلي داخل حزمة الإنتاج
    fs.writeFileSync(js, `// Protected binary code\nmodule.exports = require('./${name}.jsc');\n`);
    console.log(`  ✓ Protected: ${name}.js replaced with binary bytecode loader`);
  }
}

console.log('✅ Production bundle ready: All business logic is compiled to binary.');

