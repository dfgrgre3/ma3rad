const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '../electron');

const files = fs.readdirSync(electronDir);

for (const file of files) {
  if (file.endsWith('.js.bak')) {
    const originalJs = path.join(electronDir, file.replace(/\.bak$/, ''));
    const backupJs = path.join(electronDir, file);
    fs.copyFileSync(backupJs, originalJs);
    fs.unlinkSync(backupJs);
    console.log(`  ✓ Restored source: ${path.basename(originalJs)}`);
  }
}

console.log('✅ Source files restored.');

